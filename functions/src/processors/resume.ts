import * as functions from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { model } from "../config/gemini";
import { debitUserCredit } from "../utils/credit";
import { ResumeRawData, ResumeAnalysisFeedback, GeneratedCV, GeminiResult } from "../types";

const { logger, firestore } = functions;
const { onDocumentWritten } = firestore;

const RESUME_ANALYSIS_PRICE = 1;
const RESUME_ADEQUATION_PRICE = 2;

export const resumeAnalysisProcessor = onDocumentWritten(
  "analysis/{id}",
  async (event) => {
    const docId = event.params.id;
    const afterSnap = event.data?.after;
    if (!afterSnap) return;

    const after = afterSnap.data() as ResumeRawData;
    const userId = after.userId;

    if (after.processingStatus !== "processing" || after.feedbacks) return;

    logger.info(`Processing resume analysis (v2 trigger) ${docId}`);

    try {
      const analysisType = after.analysisType || "general";
      const creditsToDeduct = analysisType === "adequation" ? RESUME_ADEQUATION_PRICE : RESUME_ANALYSIS_PRICE;
      
      await debitUserCredit(userId, creditsToDeduct);

      if (after.generateNewCV) {
        await debitUserCredit(userId, 2);
      }

      if (!model) {
        await afterSnap.ref.update({
          processingStatus: "error",
          processingError: "Modelo indisponível (falta GEMINI_API_KEY)",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

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
        // ...existing adequation analysis code...
        const jobDescription = after.jobDescription || "";
        const position = after.position || "";
        
        const adequationPrompt = `
          ANÁLISE RÁPIDA DE ADEQUAÇÃO - Seja CONCISO e DIRETO.
          
          Idioma: ${siteLanguage}
          Cargo: ${position}
          Vaga: ${jobDescription}

          Analise o currículo anexo e retorne JSON com:

          1. **Resumo** (máx. 2 parágrafos - Aqui é o diagnóstico geral de adequação, fale conversando com o usuário)
          2. **Adequação** (0-100) - quão bem o currículo se encaixa na vaga
          3. **Score total** (0-100)
          4. **Scores detalhados** (0-100):
            - structure: clareza
            - experience: experiência relevante
            - fit: adequação ao cargo
            - skills: qualificações técnicas
            - format: apresentação
          5. **Pontos fortes** (máx. 3)
          6. **Melhorias** (máx. 4 sugestões práticas)
          7. **2 recursos úteis** com links
          8. **Skills radar** (máx. 6 skills da vaga vs currículo)

          JSON obrigatório:
          {
            "summary": "...",
            "totalScore": 75,
            "scores": {"structure": 75, "experience": 86, "fit": 98, "skills": 73, "format": 73},
            "strengths": ["...", "...", "..."],
            "improvements": ["...", "...", "..."],
            "resources": [{"title": "...", "url": "https://..."}],
            "skillsRadar": [{"skill": "...", "requiredScore": 90, "resumeScore": 75}]
          }
        `;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout na geração")), 40000)
        );

        const result = (await Promise.race([
          model.generateContent([
            adequationPrompt,
            {
              inlineData: {
                mimeType: mimeType,
                data: pdfBase64,
              },
            },
          ]),
          timeoutPromise,
        ])) as GeminiResult;

        feedbacks = JSON.parse(result.response.text());
      } else {
        // ...existing general analysis code...
        const generalPrompt = `
          ANÁLISE RÁPIDA DE CURRÍCULO - Seja CONCISO e DIRETO.
          Idioma: ${siteLanguage}

          Analise o currículo anexo com foco em boas práticas.

          Retorne JSON com:
          1. **Resumo** (máx. 2 parágrafos  - Aqui é o diagnóstico geral do CV, fale conversando com o usuário)
          2. **Score total** (0-100)
          3. **Scores** (0-100):
            - structure: estrutura e clareza
            - experience: experiência profissional
            - skills: qualificações e habilidades
            - format: formatação visual
            - impact: impacto e destaque
          4. **Pontos fortes** (máx. 3)
          5. **Melhorias** (máx. 4)
          6. **2 recursos úteis** com links

          JSON obrigatório:
          {
            "summary": "...",
            "totalScore": 75,
            "scores": {"structure": 55, "experience": 76, "skills": 83, "format": 83, "impact": 88},
            "strengths": ["...", "...", "..."],
            "improvements": ["...", "...", "..."],
            "resources": [{"title": "...", "url": "https://..."}]
          }
        `;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout na geração")), 40000)
        );

        const result = (await Promise.race([
          model.generateContent([
            generalPrompt,
            {
              inlineData: {
                mimeType: mimeType,
                data: pdfBase64,
              },
            },
          ]),
          timeoutPromise,
        ])) as GeminiResult;

        feedbacks = JSON.parse(result.response.text());
      }

      await afterSnap.ref.update({
        feedbacks: feedbacks,
        feedbackGeneratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        processingStatus: "completed",
        processingCompletedAt: FieldValue.serverTimestamp(),
      });

      if (after.generateNewCV) {
        // ...existing CV generation code...
        const cvPrompt = `
          GERAÇÃO DE NOVO CURRÍCULO - Com base na análise anterior
          
          Idioma: ${siteLanguage}
          Análise anterior: ${JSON.stringify(feedbacks)}
          
          Com base no currículo analisado e nas sugestões de melhoria fornecidas, 
          gere um novo currículo otimizado seguindo as melhores práticas.
          
          Extraia as informações do currículo original e melhore conforme as sugestões.
          Mantenha as informações factuais (experiências, educação) mas otimize:
          - Resumo profissional mais impactante
          - Descrições de experiência com foco em resultados
          - Estrutura mais clara e profissional
          - Destaque das competências relevantes
          
          Retorne JSON estruturado:
          {
            "personalInfo": { "name": "...", "email": "...", "phone": "...", "location": "...", "linkedin": "...", "portfolio": "..." },
            "professionalSummary": "...",
            "experience": [
              { "title": "...","company": "...", "period": "...","description": "...","achievements": ["...", "..."]}
            ],
            "education": [
              {
                "degree": "...",
                "institution": "...",
                "period": "...",
                "details": "..."
              }
            ],
            "skills": {
              "technical": ["...", "..."],
              "soft": ["...", "..."]
            },
            "languages": [
              {
                "language": "...",
                "level": "..."
              }
            ],
            "certifications": [
              {
                "name": "...",
                "issuer": "...",
                "date": "..."
              }
            ]
          }
        `;

        try {
          const cvTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout na geração de CV")), 60000)
          );

          const cvResult = (await Promise.race([
            model.generateContent([
              cvPrompt,
              {
                inlineData: {
                  mimeType: mimeType,
                  data: pdfBase64,
                },
              },
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
