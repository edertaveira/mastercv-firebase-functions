// src/processors/generateCv.ts
import * as functions from "firebase-functions/v2";
import { debitUserCredit } from "../utils/credit.js";
import { createModel, GEMINI_API_KEY } from "../config/gemini.js";

const { logger, https } = functions;
const { onCall } = https;

const CV_FROM_DESCRIPTION_PRICE = 2;
const CV_FOR_JOB_PRICE = 3;

type GeneratedCV = {
  personalInfo: Record<string, string>;
  professionalSummary: string;
  experience: Array<Record<string, any>>;
  education: Array<Record<string, any>>;
  skills: { technical?: string[]; soft?: string[] };
  languages?: Array<Record<string, string>>;
  certifications?: Array<Record<string, string>>;
};

const buildBasePrompt = (language: string) => `
Idioma de saída: ${language || "pt-BR"}
Formate apenas JSON válido, sem comentários ou texto extra.
Estrutura obrigatória:
{
  "personalInfo": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "portfolio": "" },
  "professionalSummary": "",
  "experience": [
    { "title": "", "company": "", "period": "", "description": "", "achievements": ["..."] }
  ],
  "education": [
    { "degree": "", "institution": "", "period": "", "details": "" }
  ],
  "skills": { "technical": ["..."], "soft": ["..."] },
  "languages": [{ "language": "", "level": "" }],
  "certifications": [{ "name": "", "issuer": "", "date": "" }]
}
Retorne campos vazios com string vazia ou arrays vazios se não houver dados.
`;

let cachedModel: any = null;
function getModel() {
  if (cachedModel) return cachedModel;
  const apiKey = GEMINI_API_KEY.value(); // runtime
  cachedModel = createModel(apiKey);
  return cachedModel;
}

async function runModel(
  prompt: string,
  timeoutMs = 60000
): Promise<GeneratedCV> {
  const model = getModel();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout na geração do CV")), timeoutMs)
  );
  const result: any = await Promise.race([
    model.generateContent([prompt]),
    timeoutPromise,
  ]);
  const text = result.response?.text();
  if (!text) throw new Error("Resposta vazia do modelo");
  return JSON.parse(text);
}

export const generateCvFromDescription = onCall(
  {
    region: "southamerica-east1",
    timeoutSeconds: 120,
    memory: "1GiB",
    secrets: [GEMINI_API_KEY],
  },
  async (request) => {
    try {
      const {
        userId,
        professionalDescription,
        language = "pt-BR",
      } = request.data || {};
      if (!userId) throw new Error("userId obrigatório");
      if (!professionalDescription)
        throw new Error("professionalDescription obrigatório");

      await debitUserCredit(userId, CV_FROM_DESCRIPTION_PRICE);

      const prompt = `
GERAR CURRÍCULO A PARTIR DE DESCRIÇÃO PROFISSIONAL
Descrição fornecida:
"""
${professionalDescription}
"""
${buildBasePrompt(language)}
Enriqueça com resultados quantificáveis plausíveis quando não explícitos, mantendo veracidade implícita.
Resumo profissional: forte, direto, focado em valor entregue.
`;
      const cv = await runModel(prompt);
      logger.info("CV gerado (description)", { userId });
      return { ok: true, cv };
    } catch (error) {
      logger.error("Erro generateCvFromDescription", error as Error);
      return { ok: false, error: (error as Error).message };
    }
  }
);

export const generateCvForJob = onCall(
  {
    region: "southamerica-east1",
    timeoutSeconds: 180,
    memory: "1GiB",
    secrets: [GEMINI_API_KEY],
  },
  async (request) => {
    try {
      const {
        userId,
        currentProfile,
        jobDescription,
        position,
        language = "pt-BR",
      } = request.data || {};
      if (!userId) throw new Error("userId obrigatório");
      if (!currentProfile) throw new Error("currentProfile obrigatório");
      if (!jobDescription) throw new Error("jobDescription obrigatório");
      if (!position) throw new Error("position obrigatório");

      await debitUserCredit(userId, CV_FOR_JOB_PRICE);

      const prompt = `
OTIMIZAÇÃO DE CURRÍCULO PARA UMA VAGA
Cargo alvo: ${position}
Descrição da vaga:
"""
${jobDescription}
"""
Perfil/CV atual do candidato:
"""
${currentProfile}
"""
Objetivo: gerar um currículo otimizado para esta vaga, destacando alinhamento, resultados e palavras‑chave relevantes, sem fabricar experiências não mencionadas.
${buildBasePrompt(language)}
Adapte terminologia para corresponder à vaga, reescrevendo bullets com verbo de ação + resultado quantificável quando possível.
`;
      const cv = await runModel(prompt);
      logger.info("CV gerado (job)", { userId, position });
      return { ok: true, cv };
    } catch (error) {
      logger.error("Erro generateCvForJob", error as Error);
      return { ok: false, error: (error as Error).message };
    }
  }
);
