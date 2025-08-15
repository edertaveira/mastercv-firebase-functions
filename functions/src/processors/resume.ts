// src/processors/resume.ts
import * as functions from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { debitUserCredit } from "../utils/credit.js";
import {
  ResumeRawData,
  ResumeAnalysisFeedback,
  GeneratedCV,
  GeminiResult,
} from "../types/index.js";
import { createModel, GEMINI_API_KEY } from "../config/gemini.js";

const { logger, firestore } = functions;
const { onDocumentWritten } = firestore;

const RESUME_ANALYSIS_PRICE = 1;
const RESUME_ADEQUATION_PRICE = 2;

export const resumeAnalysisProcessor = onDocumentWritten(
  {
    document: "analysis/{id}",
    secrets: [GEMINI_API_KEY],
    region: "southamerica-east1",
  },
  async (event) => {
    const docId = event.params.id;
    const afterSnap = event.data?.after;
    if (!afterSnap) return;

    const after = afterSnap.data() as ResumeRawData;
    if (after.processingStatus !== "processing" || after.feedbacks) return;

    logger.info(`Processing resume analysis (v2 trigger) ${docId}`);

    try {
      const userId = after.userId;
      const analysisType = after.analysisType || "general";
      const creditsToDeduct =
        analysisType === "adequation"
          ? RESUME_ADEQUATION_PRICE
          : RESUME_ANALYSIS_PRICE;

      await debitUserCredit(userId, creditsToDeduct);
      if (after.generateNewCV) await debitUserCredit(userId, 2);

      const apiKey = GEMINI_API_KEY.value();
      const model = createModel(apiKey);

      const siteLanguage = after.siteLanguage || "pt-BR";
      const pdfBase64 = after.pdfBase64;
      const mimeType = after.mimeType || "application/pdf";

      if (!pdfBase64) {
        await afterSnap.ref.update({
          processingStatus: "error",
          processingError: "PDF base64 não encontrado",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      let feedbacks: ResumeAnalysisFeedback;

      if (analysisType === "adequation") {
        const jobDescription = after.jobDescription || "";
        const position = after.position || "";

        const adequationPrompt = `
ANÁLISE RÁPIDA DE ADEQUAÇÃO - Seja CONCISO e DIRETO.
Idioma: ${siteLanguage}
Cargo: ${position}
Vaga: ${jobDescription}
Analise o currículo anexo e retorne JSON com:
1. Resumo (máx. 2 parágrafos)
2. Adequação (0-100)
3. Score total (0-100)
4. Scores: structure, experience, fit, skills, format (0-100)
5. Pontos fortes (máx. 3)
6. Melhorias (máx. 4)
7. 2 recursos úteis (links)
8. Skills radar (máx. 6 itens)`;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout na geração")), 40000)
        );

        const result = (await Promise.race([
          model.generateContent([
            adequationPrompt,
            { inlineData: { mimeType, data: pdfBase64 } },
          ]),
          timeoutPromise,
        ])) as GeminiResult;

        feedbacks = JSON.parse(result.response.text());
      } else {
        const generalPrompt = `
ANÁLISE RÁPIDA DE CURRÍCULO - Seja CONCISO e DIRETO.
Idioma: ${siteLanguage}
Analise o currículo anexo com foco em boas práticas.
Retorne JSON com:
1. Resumo (máx. 2 parágrafos)
2. Score total (0-100)
3. Scores: structure, experience, skills, format, impact (0-100)
4. Pontos fortes (máx. 3)
5. Melhorias (máx. 4)
6. 2 recursos úteis (links)`;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout na geração")), 40000)
        );

        const result = (await Promise.race([
          model.generateContent([
            generalPrompt,
            { inlineData: { mimeType, data: pdfBase64 } },
          ]),
          timeoutPromise,
        ])) as GeminiResult;

        feedbacks = JSON.parse(result.response.text());
      }

      await afterSnap.ref.update({
        feedbacks,
        feedbackGeneratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        processingStatus: "completed",
        processingCompletedAt: FieldValue.serverTimestamp(),
      });

      if (after.generateNewCV) {
        const cvPrompt = `
GERAÇÃO DE NOVO CURRÍCULO - Com base na análise anterior
Idioma: ${siteLanguage}
Análise anterior: ${JSON.stringify(feedbacks)}
Gere JSON estruturado com as seções pessoais, resumo, experiência, educação, skills, idiomas, certificações.`;

        try {
          const cvTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Timeout na geração de CV")),
              60000
            )
          );

          const cvResult = (await Promise.race([
            model.generateContent([
              cvPrompt,
              { inlineData: { mimeType, data: pdfBase64 } },
            ]),
            cvTimeoutPromise,
          ])) as GeminiResult;

          const generatedCV: GeneratedCV = JSON.parse(cvResult.response.text());

          await afterSnap.ref.update({
            cv: generatedCV,
            cvGeneratedAt: FieldValue.serverTimestamp(),
          });

          logger.info(`CV gerado para ${docId}`);
        } catch (cvError) {
          logger.error(`Erro ao gerar CV ${docId}`, cvError as Error);
          await afterSnap.ref.update({
            cvGenerationError: (cvError as Error).message || "Erro ao gerar CV",
          });
        }
      }

      logger.info(`Concluído análise de currículo ${docId}`);
    } catch (error) {
      logger.error(`Erro ${docId}`, error as Error);
      await afterSnap.ref.update({
        processingStatus: "error",
        processingError: (error as Error).message || "Erro desconhecido",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);
