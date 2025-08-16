import { ItemType } from "./itemType.js";

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

export enum InterviewType {
  TECHNICAL = "technical",
  HR = "hr",
  CULTURAL = "cultural",
}

interface JobDataProps {
  position: string;
  description: string;
  interviewType: InterviewType;
  language: string;
  numQuestions: number;
}

export interface ResumeRawData {
  userId: string;
  pdf: {
    base64?: string;
    type?: string;
    name: string;
  };
  type: ItemType.CV_ANALYSIS | ItemType.CV_JOB_ADEQUATION;
  language?: string;
  jobData?: {
    description?: string;
    position?: string;
  };
  position?: string;
  analysisType?: "general" | "adequation";
  generateNewResume?: boolean;
  cv: GeneratedCV;
  cvGeneratedAt: string;
  cvGenerationError: string | null;
  status?: "running" | "ready" | "failed";
  error: string | null;
  feedbacks?: ResumeAnalysisFeedback;
  analysisLevel?: "basic" | "advanced";
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
  skillsRadar?: Array<{
    skill: string;
    requiredScore: number;
    resumeScore: number;
  }>;
}

export type GeminiResult = { response: { text: () => string } };
