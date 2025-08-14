// Entry point do Firebase Functions: exporte aqui todas as funções que deseja publicar.

// Se a inicialização do Firebase Admin ainda não acontece em outro arquivo, descomente:
// import * as admin from 'firebase-admin';
// if (!admin.apps.length) admin.initializeApp();

// Exports explícitos (adicione novos conforme criar):
export { resumeAnalysisProcessor } from './processors/resume';
export { linkedinAnalysisProcessor } from './processors/linkedin';
export {
  generateCvFromDescription,
  generateCvForJob
} from './processors/generateCv';

// Exemplo para futuras funções:
// export { outraFunction } from './processors/outraFunction';
