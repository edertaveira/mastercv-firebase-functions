export enum ItemType {
  INTERVIEW = "interview",
  CV_ANALYSIS = "cv_analysis",
  CV_JOB_ADEQUATION = "cv_job_adequation",
  LINKEDIN_ANALYSIS = "linkedin_analysis",
  RESUME_GENERATION = "resume_generation",
  PURCHASE = "purchase",
}

export const ItemTypeMap: Record<ItemType, string> = {
  [ItemType.INTERVIEW]: "Entrevista",
  [ItemType.CV_ANALYSIS]: "Análise de CV",
  [ItemType.CV_JOB_ADEQUATION]: "Adequação de CV à Vaga",
  [ItemType.LINKEDIN_ANALYSIS]: "Análise de Perfil LinkedIn",
  [ItemType.RESUME_GENERATION]: "Geração de Currículo",
  [ItemType.PURCHASE]: "Compra de Créditos",
};

export const ItemTypeColorMap: Record<ItemType, string> = {
  [ItemType.INTERVIEW]: "blue",
  [ItemType.CV_ANALYSIS]: "purple",
  [ItemType.CV_JOB_ADEQUATION]: "orange",
  [ItemType.LINKEDIN_ANALYSIS]: "cyan",
  [ItemType.RESUME_GENERATION]: "magenta",
  [ItemType.PURCHASE]: "green",
};
