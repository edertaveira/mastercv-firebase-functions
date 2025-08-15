// src/index.ts
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";

// Região default p/ todas as functions
setGlobalOptions({ region: "southamerica-east1" });

// Garante Admin SDK inicializado assim que o codebase carrega
if (!getApps().length) {
  initializeApp(); // usa credenciais do ambiente da Function
}

// exports depois disso
export { resumeAnalysisProcessor } from "./processors/resume.js";
export { linkedinAnalysisProcessor } from "./processors/linkedin.js";
export { generateCvFromDescription, generateCvForJob } from "./processors/generateCv.js";