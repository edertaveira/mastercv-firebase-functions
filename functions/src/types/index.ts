export interface LinkedInFeedbackItem {
  item: string;
  score: number;
  weight: number;
  weightedScore: number;
  feedback: string;
  suggestions: Array<{ text: string; impact: "high" | "medium" | "low" }>;
  priority: "high" | "medium" | "low";
}

export interface LinkedInAnalysisFeedback {
  overallScore: number;
  items: LinkedInFeedbackItem[];
  missingSections: string[];
  generalRecommendations: string[];
  quickWins: string[];
  strategicChanges: string[];
}

export interface LinkedInRawData {
  name?: string;
  headline?: string;
  about?: string;
  experience?: { company: string; description: string; duration: string }[];
  education?: { school: string; skills: string }[];
  skills?: string[];
  languages?: string[];
  courses?: string[];
  profilePicture?: string | null;
  profilePictureUrl?: string | null;
  profileUrl?: string;
  userId: string;
  photoUrl?: string;
  recommendationsReceived?: string[];
  recommendationsGiven?: string[];
  language?: string;
  processingStatus?: string;
  feedbacks?: unknown;
}

export interface ResumeRawData {
  userId: string;
  pdfBase64?: string;
  mimeType?: string;
  siteLanguage?: string;
  jobDescription?: string;
  position?: string;
  analysisType?: "general" | "adequation";
  generateNewCV?: boolean;
  processingStatus?: string;
  feedbacks?: unknown;
}

export interface GeneratedCV {
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    portfolio?: string;
  };
  professionalSummary: string;
  experience: Array<{
    title: string;
    company: string;
    period: string;
    description: string;
    achievements: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    period: string;
    details?: string;
  }>;
  skills: {
    technical: string[];
    soft: string[];
  };
  languages: Array<{
    language: string;
    level: string;
  }>;
  certifications?: Array<{
    name: string;
    issuer: string;
    date: string;
  }>;
}

export interface ResumeAnalysisFeedback {
  summary: string;
  totalScore: number;
  scores: {
    structure: number;
    experience: number;
    skills: number;
    format: number;
    impact?: number;
    fit?: number;
  };
  strengths: string[];
  improvements: string[];
  resources: Array<{ title: string; url: string }>;
  skillsRadar?: Array<{ skill: string; requiredScore: number; resumeScore: number }>;
}

export type GeminiResult = { response: { text: () => string } };
