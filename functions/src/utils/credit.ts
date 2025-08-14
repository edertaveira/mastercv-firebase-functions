import { getFirestore } from "firebase-admin/firestore";

export async function debitUserCredit(userId: string, amount: number): Promise<void> {
  if (!userId || typeof amount !== "number" || amount <= 0) {
    throw new Error("Parâmetros inválidos para debitar crédito.");
  }
  const db = getFirestore();
  const userRef = db.collection("users").doc(userId);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new Error("Usuário não encontrado.");
    }
    const data = userSnap.data();
    const currentCredit = typeof data?.credits === "number" ? data.credits : 0;
    if (currentCredit < amount) {
      throw new Error("Crédito insuficiente.");
    }
    transaction.update(userRef, { credits: currentCredit - amount });
  });
}
