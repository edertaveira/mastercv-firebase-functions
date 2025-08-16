import { getDb } from "../config/firebase.js";
import { ItemType } from "../types/itemType.js";

export async function debitUserCredit(
  userId: string,
  amount: number,
  options?: {
    type?: ItemType;
    description?: string;
  }
): Promise<void> {
  if (!userId || typeof amount !== "number" || amount <= 0) {
    throw new Error("Parâmetros inválidos para debitar crédito.");
  }
  const { type = "DEBIT", description = "Débito de créditos" } = options || {};
  const db = getDb(); // <-- garante initializeApp()
  const userRef = db.collection("users").doc(userId);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error("Usuário não encontrado.");
    const data = userSnap.data();
    const currentCredit = typeof data?.credits === "number" ? data.credits : 0;
    if (currentCredit < amount) throw new Error("Crédito insuficiente.");
    transaction.update(userRef, { credits: currentCredit - amount });

    // Registro de histórico de créditos (mantido dentro da mesma transação)
    const historyRef = userRef.collection("creditsHistory").doc();
    transaction.set(historyRef, {
      type,
      amount: -amount, // negativo para débito
      description,
      createdAt: new Date(),
    });
  });
}
