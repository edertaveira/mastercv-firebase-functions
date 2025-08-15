import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";

export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export function createGenAI(apiKey: string) {
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");
  return new GoogleGenerativeAI(apiKey);
}

export function createModel(apiKey: string) {
  const client = createGenAI(apiKey);
  return client.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3
    }
  });
}