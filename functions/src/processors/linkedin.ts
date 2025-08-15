// src/processors/linkedin.ts
import * as functions from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { debitUserCredit } from "../utils/credit.js";
import {
  LinkedInRawData,
  LinkedInAnalysisFeedback,
  GeminiResult,
} from "../types/index.js";
import { createModel, GEMINI_API_KEY } from "../config/gemini.js";

const { logger, firestore } = functions;
const { onDocumentWritten } = firestore;

const LINKEDIN_ANALYSIS_PRICE = 3;

function analyzeProfilePicture(linkedInData: LinkedInRawData) {
  const hasProfilePicture = !!(
    linkedInData?.profileUrl ||
    linkedInData?.photoUrl ||
    linkedInData?.profilePicture ||
    linkedInData?.profilePictureUrl
  );
  return { hasProfilePicture };
}

export const linkedinAnalysisProcessor = onDocumentWritten(
  {
    document: "linkedin-analysis/{id}",
    secrets: [GEMINI_API_KEY],
    region: "southamerica-east1",
  },
  async (event) => {
    const docId = event.params.id;
    const afterSnap = event.data?.after;
    if (!afterSnap) return;

    const after = afterSnap.data() as LinkedInRawData;
    if (after.processingStatus !== "processing" || after.feedbacks) return;

    logger.info(`Processing LinkedIn analysis (v2 trigger) ${docId}`);

    try {
      await debitUserCredit(after.userId, LINKEDIN_ANALYSIS_PRICE);

      const apiKey = GEMINI_API_KEY.value();
      const model = createModel(apiKey);

      const language = after.language || "pt-BR";
      const photoAnalysis = analyzeProfilePicture(after);
      const limitedData = {
        name: after.name || "",
        headline: after.headline || "",
        about: after.about || "",
        experience: Array.isArray(after.experience)
          ? after.experience.slice(0, 5)
          : [],
        education: Array.isArray(after.education)
          ? after.education.slice(0, 3)
          : [],
        skills: Array.isArray(after.skills) ? after.skills.slice(0, 20) : [],
        languages: after.languages || [],
        certifications: Array.isArray(after.courses)
          ? after.courses.slice(0, 5)
          : [],
        hasProfilePicture: photoAnalysis.hasProfilePicture,
        profilePictureUrl: after.profilePictureUrl || null,
        recommendationsReceived: Array.isArray(after.recommendationsReceived)
          ? after.recommendationsReceived.slice(0, 5)
          : [],
        recommendationsGiven: Array.isArray(after.recommendationsGiven)
          ? after.recommendationsGiven.slice(0, 5)
          : [],
      };

      const prompt = `Você é um especialista em RH focado em Linkedin. 
      Responda na língua ${language}
      Analise o perfil que tem esses dados: ${JSON.stringify(limitedData)}
      Faça a análise desses itens: name, headline, about, experience, education, skills, languages, courses, profilePicture, profilePictureUrl, recommendationsReceived, recommendationsGiven.
      Traduza os itens acima para o idioma ${language} e coloque a primeira letra maiúscula.
      Tipos:
      - LinkedInAnalysisFeedback { overallScore: number; items: LinkedInFeedbackItem[]; missingSections: string[]; generalRecommendations: string[]; quickWins: string[]; strategicChanges: string[];}
      - LinkedInFeedbackItem { item: string; score: number; weight: number; weightedScore: number; feedback: string; suggestions: LinkedInFeedbackSuggestion[]; priority: "high" | "medium" | "low";}
      Retorne JSON de acordo com LinkedInAnalysisFeedback. Scores 0..100, pesos 0..1.`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout na geração")), 120000)
      );

      const result = (await Promise.race([
        model.generateContent(prompt),
        timeoutPromise,
      ])) as GeminiResult;

      logger.info(`LinkedIn analysis result: ${result.response.text()}`);

      const text = result.response.text();
      let analysisResult: LinkedInAnalysisFeedback;
      try {
        analysisResult = JSON.parse(text);
      } catch {
        logger.error("Falha parse JSON", { docId, raw: text });
        await afterSnap.ref.update({
          processingStatus: "error",
          processingError: "Resposta inválida do modelo",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      await afterSnap.ref.update({
        feedbacks: analysisResult,
        feedbackGeneratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        processingStatus: "completed",
        processingCompletedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Concluído ${docId}`);
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
