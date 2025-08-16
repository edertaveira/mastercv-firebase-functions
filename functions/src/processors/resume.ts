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
import { ItemType } from "../types/itemType.js";

const { logger, firestore } = functions;
const { onDocumentWritten } = firestore;

const RESUME_ANALYSIS_PRICE = 1;
const RESUME_ADEQUATION_PRICE = 2;
const RESUME_ADVANCED_ANALYSIS_PRICE = 2;

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
    if (after.status !== "running" || after.feedbacks) return;

    logger.info(`Processing resume analysis (v2 trigger) ${docId}`);

    try {
      const userId = after.userId;
      const analysisType = after.analysisType || "general";
      const analysisLevel = after.analysisLevel || "basic"; // new
      const isAdvanced = analysisLevel === "advanced"; // new

      // pricing updated
      let creditsToDeduct =
        analysisType === "adequation"
          ? RESUME_ADEQUATION_PRICE
          : RESUME_ANALYSIS_PRICE;
      if (isAdvanced) {
        creditsToDeduct += RESUME_ADVANCED_ANALYSIS_PRICE;
      }
      // unified flag (backward compatibility)
      const generateNew = after.generateNewResume || false;
      if (generateNew) await debitUserCredit(userId, 2);

      const apiKey = GEMINI_API_KEY.value();
      const model = createModel(apiKey);

      const siteLanguage = after.language || "pt-BR";
      const pdfBase64 = after.pdf.base64;
      const mimeType = after.pdf.type || "application/pdf";

      if (!pdfBase64) {
        await afterSnap.ref.update({
          status: "failed",
          error: "PDF base64 não encontrado",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      let feedbacks: ResumeAnalysisFeedback;

      // helper for safe JSON parsing (advanced models may add text)
      const safeParse = <T = any>(raw: string): T => {
        try {
          const start = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          if (start !== -1 && end !== -1) {
            return JSON.parse(raw.substring(start, end + 1));
          }
          return JSON.parse(raw);
        } catch (e) {
          throw new Error("Falha ao interpretar JSON da IA");
        }
      };

      if (analysisType === "adequation") {
        const jobDescription = after.jobData?.description || "";
        const position = after.jobData?.position || "";

        const adequationPromptBasic = `
ANÁLISE RÁPIDA DE ADEQUAÇÃO - Seja CONCISO e DIRETO.
Idioma: ${siteLanguage}
Cargo: ${position}
Vaga: ${jobDescription}
IMPORTANTE: No campo "summary" fale diretamente com o candidato em segunda pessoa (você), apontando rapidamente o que você já faz bem e principalmente o que pode melhorar para aumentar a adequação à vaga. Tom construtivo e objetivo.
Analise o currículo anexo e retorne JSON com:
summary, totalScore, scores{structure,experience,skills,format,impact?,fit?}, strengths[<=3], improvements[<=4], resources[2], skillsRadar[<=6].
Formato:
{
  "summary": string,
  "totalScore": number,
  "scores": {
    "structure": number,
    "experience": number,
    "skills": number,
    "format": number,
    "impact"?: number,
    "fit"?: number
  },
  "strengths": string[],
  "improvements": string[],
  "resources": [{"title": string,"url": string}],
  "skillsRadar"?: [{"skill": string,"requiredScore": number,"resumeScore": number}]
}`;

        const adequationPromptAdvanced = `
ANÁLISE AVANÇADA DE ADEQUAÇÃO (DETALHADA) - Seja objetivo mas completo.
Idioma: ${siteLanguage}
Cargo: ${position}
Vaga: ${jobDescription}
IMPORTANTE:
- "summary": 2ª pessoa, 4 blocos (forças, lacunas, ações priorizadas, palavras‑chave faltantes).
- "improvements": lista curta (máx 4) de melhorias macro (não detalhar execução).
- "actionPlan": novo campo com tarefas acionáveis detalhadas (ver formato).
Retorne APENAS JSON com:
{
  "summary": string,
  "totalScore": number,
  "scores": {
    "structure": number,
    "experience": number,
    "skills": number,
    "format": number,
    "impact": number,
    "fit": number,
    "readability": number,
    "keywords": number
  },
  "strengths": string[],
  "improvements": string[],
  "resources": [{"title": string,"url": string}],
  "skillsRadar": [{"skill": string,"requiredScore": number,"resumeScore": number}],
  "keywordGaps": string[],
  "mismatchPoints": string[],
  "optimizationSuggestions": string[],
  "atsKeywords": string[],
  "bulletsToRewrite": [{
    "original": string,
    "improved": string,
    "justification": string
  }],
  "achievementSuggestions": string[],
  "actionPlan": [{
    "title": string,
    "description": string,
    "priority": "alta" | "media" | "baixa",
    "impact": "alto" | "medio" | "baixo",
    "effort": "baixo" | "medio" | "alto",
    "expectedOutcome": string
  }]
}`;

        const adequationPrompt = isAdvanced
          ? adequationPromptAdvanced
          : adequationPromptBasic;

        // ...existing code (timeoutPromise)...
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

        feedbacks = safeParse(result.response.text());
      } else {
        const generalPromptBasic = `
ANÁLISE RÁPIDA DE CURRÍCULO - Seja CONCISO e DIRETO.
Idioma: ${siteLanguage}
IMPORTANTE: No "summary" fale diretamente com o usuário em segunda pessoa (você), indicando rapidamente o que você já faz bem e o que pode melhorar primeiro para deixar o currículo mais forte.
Analise o currículo anexo com foco em boas práticas.
Retorne JSON:
{
  "summary": string,
  "totalScore": number,
  "scores": {
    "structure": number,
    "experience": number,
    "skills": number,
    "format": number,
    "impact"?: number
  },
  "strengths": string[],
  "improvements": string[],
  "resources": [{"title": string,"url": string}]
}`;

        const generalPromptAdvanced = `
ANÁLISE AVANÇADA DE CURRÍCULO - Respostas objetivas e ricas em valor.
Idioma: ${siteLanguage}
IMPORTANTE:
- "summary": 2ª pessoa, 3 blocos (forças, gaps, plano rápido) + opcional linha final de encorajamento.
- "improvements": até 4 melhorias macro (ex: "Quantificar resultados em experiências recentes").
- "actionPlan": lista estruturada (3–6) com tarefas acionáveis detalhadas (ver formato).
Retorne APENAS JSON:
{
  "summary": string,
  "totalScore": number,
  "scores": {
    "structure": number,
    "experience": number,
    "skills": number,
    "format": number,
    "impact": number,
    "readability": number,
    "achievements": number
  },
  "strengths": string[],
  "improvements": string[],
  "resources": [{"title": string,"url": string}],
  "bulletRewrites": [{
    "original": string,
    "improved": string,
    "impactAdded": string
  }],
  "quantificationSuggestions": string[],
  "missingSections": string[],
  "keywordOpportunities": string[],
  "skillMatrix": [{
    "skill": string,
    "level": string,
    "evidence": string
  }],
  "metricsSuggestions": string[],
  "actionPlan": [{
    "title": string,
    "description": string,
    "priority": "alta" | "media" | "baixa",
    "impact": "alto" | "medio" | "baixo",
    "effort": "baixo" | "medio" | "alto",
    "expectedOutcome": string
  }]
}`;

        const generalPrompt = isAdvanced
          ? generalPromptAdvanced
          : generalPromptBasic;

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

        feedbacks = safeParse(result.response.text());
      }

      await afterSnap.ref.update({
        feedbacks,
        analysisLevel, // save chosen level
        feedbackGeneratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        status: "ready",
        processingCompletedAt: FieldValue.serverTimestamp(),
      });

      if (generateNew) {
        const resumeGenerationPrompt = `
GERAÇÃO DE NOVO CURRÍCULO ESTRUTURADO
Idioma: ${siteLanguage}
Nível de análise: ${analysisLevel}
Feedback da análise: ${JSON.stringify(feedbacks)}
Objetivo: Produzir JSON LIMPO (sem texto extra) com seções otimizadas. Use verbos fortes, resultados quantificados e palavras-chave relevantes.

Formato:
{
  "personal": { "fullName": string?, "title"?: string, "contact"?: { "email"?: string, "phone"?: string, "location"?: string, "linkedin"?: string, "website"?: string } },
  "summary": string,
  "experience": [{
    "company": string,
    "role": string,
    "location"?: string,
    "startDate"?: string,
    "endDate"?: string | "Present",
    "bullets": string[],
    "technologies"?: string[]
  }],
  "projects"?: [{
    "name": string,
    "description": string,
    "bullets": string[],
    "technologies"?: string[]
  }],
  "education": [{
    "institution": string,
    "degree": string,
    "startDate"?: string,
    "endDate"?: string
  }],
  "certifications"?: [{
    "name": string,
    "issuer"?: string,
    "date"?: string
  }],
  "skills": {
    "core": string[],
    "tools"?: string[],
    "languages"?: string[],
    "methodologies"?: string[]
  },
  "languages"?: [{ "language": string, "proficiency": string }],
  "achievements"?: string[],
  "keywords"?: string[]
}`;

        try {
          const cvTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Timeout na geração de CV")),
              60000
            )
          );

          const cvResult = (await Promise.race([
            model.generateContent([
              resumeGenerationPrompt,
              { inlineData: { mimeType, data: pdfBase64 } },
            ]),
            cvTimeoutPromise,
          ])) as GeminiResult;

          const generatedResume: GeneratedCV = safeParse(
            cvResult.response.text()
          );

          await afterSnap.ref.update({
            newResume: generatedResume,
            cv: generatedResume, // backward compatibility
            cvGeneratedAt: FieldValue.serverTimestamp(),
            newResumeGeneratedAt: FieldValue.serverTimestamp(),
          });

          logger.info(`Novo currículo gerado para ${docId}`);
        } catch (cvError) {
          logger.error(
            `Erro ao gerar novo currículo ${docId}`,
            cvError as Error
          );
          await afterSnap.ref.update({
            cvGenerationError:
              (cvError as Error).message || "Erro ao gerar novo currículo",
          });
        }
      }

      await debitUserCredit(userId, creditsToDeduct, {
        type:
          analysisType === "adequation"
            ? ItemType.CV_JOB_ADEQUATION
            : ItemType.CV_ANALYSIS,
        description:
          analysisType === "adequation"
            ? "Análise de adequação de currículo"
            : "Análise de currículo",
      });

      logger.info(`Concluído análise de currículo ${docId}`);
    } catch (error) {
      logger.error(`Erro ${docId}`, error as Error);
      await afterSnap.ref.update({
        status: "failed",
        error: (error as Error).message || "Erro desconhecido",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);
