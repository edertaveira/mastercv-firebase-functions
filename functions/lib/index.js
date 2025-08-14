import * as functions from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
const LINKEDIN_ANALYSIS_PRICE = 3; // Preço em créditos para análise de perfil do LinkedIn
const { logger, setGlobalOptions, firestore } = functions;
const { onDocumentWritten } = firestore;
setGlobalOptions({
    region: "southamerica-east1",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: ["GEMINI_API_KEY"],
});
if (!getApps().length)
    initializeApp();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    logger.error("GEMINI_API_KEY ausente (defina secret antes do deploy).");
}
// Configuração do modelo Gemini
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = genAI
    ? genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 3000,
        },
    })
    : null;
function analyzeProfilePicture(linkedInData) {
    const hasProfilePicture = !!(linkedInData?.profileUrl ||
        linkedInData?.photoUrl ||
        linkedInData?.profilePicture ||
        linkedInData?.profilePictureUrl);
    return { hasProfilePicture };
}
export const linkedinAnalysisProcessor = onDocumentWritten("linkedin-analysis/{id}", async (event) => {
    const docId = event.params.id;
    const afterSnap = event.data?.after;
    if (!afterSnap)
        return;
    const after = afterSnap.data();
    const userId = after.userId;
    if (after.processingStatus !== "processing" || after.feedbacks)
        return;
    logger.info(`Processing LinkedIn analysis (v2 trigger) ${docId}`);
    logger.log("userId", userId);
    try {
        await debitUserCredit(userId, LINKEDIN_ANALYSIS_PRICE);
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
      Responda na língua ${language || "pt-BR"}
      Analise o perfil que tem esses dados: ${JSON.stringify(limitedData)}
      Faça a análise desses items: name, headline, about, experience, education, skills, languages, courses, profilePicture, profilePictureUrl, recommendationsReceived, recommendationsGiven.
      Traduza os items acima para o idioma ${language || "pt-BR"} e coloque a primeira letra maiúscula.
      Tipos:
      - LinkedInAnalysisFeedback { overallScore: number; items: LinkedInFeedbackItem[]; missingSections: string[]; generalRecommendations: string[]; quickWins: string[]; strategicChanges: string[];}
      - LinkedInFeedbackItem { item: string; score: number; weight: number; weightedScore: number; feedback: string; suggestions: LinkedInFeedbackSuggestion[]; priority: "high" | "medium" | "low";}
      Faça a análise do perfil e retorne uma estrutura JSON de acordo com esse tipo: LinkedInAnalysisFeedback
      Os scores devem ser de 0 a 100, e os pesos devem ser de 0 a 1.
      `;
        if (!model) {
            await afterSnap.ref.update({
                processingStatus: "error",
                processingError: "Modelo indisponível (falta GEMINI_API_KEY)",
                updatedAt: FieldValue.serverTimestamp(),
            });
            return;
        }
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout na geração")), 120000));
        const result = (await Promise.race([
            model.generateContent(prompt),
            timeoutPromise,
        ]));
        const text = result.response.text();
        let analysisResult;
        try {
            analysisResult = JSON.parse(text);
        }
        catch {
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
    }
    catch (error) {
        logger.error(`Erro ${docId}`, error);
        await afterSnap.ref.update({
            processingStatus: "error",
            processingError: error.message || "Erro desconhecido",
            updatedAt: FieldValue.serverTimestamp(),
        });
    }
});
async function debitUserCredit(userId, amount) {
    if (!userId || typeof amount !== "number" || amount <= 0) {
        throw new Error("Parâmetros inválidos para debitar crédito.");
    }
    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
            throw new Error("Usuário não encontrado.");
        }
        const data = userSnap.data();
        const currentCredit = typeof data?.credits === "number" ? data.credits : 0;
        if (currentCredit < amount) {
            throw new Error("Crédito insuficiente.");
        }
        transaction.update(userRef, { credit: currentCredit - amount });
    });
}
