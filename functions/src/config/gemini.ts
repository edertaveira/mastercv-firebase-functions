import { GoogleGenerativeAI } from "@google/generative-ai";
import * as functions from "firebase-functions/v2";

const { logger } = functions;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  logger.error("GEMINI_API_KEY ausente (defina secret antes do deploy).");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
export const model = genAI
  ? genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 3000,
      },
    })
  : null;
