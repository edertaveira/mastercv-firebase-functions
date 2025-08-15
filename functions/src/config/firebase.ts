// Inicializa o Firebase Admin uma única vez por processo
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function ensureFirebaseApp() {
  if (!getApps().length) {
    initializeApp(); // usa credenciais e projectId do ambiente da Function
  }
}

export function getDb() {
  ensureFirebaseApp();
  return getFirestore();
}