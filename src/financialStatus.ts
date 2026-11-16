import type { EntityId, Payment, FinancialStatus } from "./academy";
import { dateDaysAgo, isPaidUp } from "./academy";

export function financialStatus(
  payments: Payment[],
  studentId: EntityId,
  hasPendingReceipt = false,
  today = dateDaysAgo(0),
): FinancialStatus {
  if (isPaidUp(payments, studentId, today)) return "PAID";
  if (hasPendingReceipt) return "UNDER_REVIEW";
  const hadPayment = payments.some(
    (p) =>
      p.studentId === studentId &&
      p.status === "PAGO" &&
      Number.isFinite(p.amount) &&
      p.amount > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
      p.date <= today,
  );
  return hadPayment ? "OVERDUE" : "AWAITING_FIRST_PAYMENT";
}
export const financialStatusInfo = {
  PAID: {
    label: "Em dia",
    shortLabel: "Em dia",
    detail: "Pagamento confirmado nos últimos 30 dias.",
    description:
      "Seu pagamento foi confirmado. Os treinos ativos estão disponíveis.",
    tone: "paid",
  },
  UNDER_REVIEW: {
    label: "Comprovante em análise",
    shortLabel: "Em análise",
    detail: "Aguardando análise da administração.",
    description:
      "Seu comprovante está em análise. Os treinos continuam aguardando um pagamento confirmado nos últimos 30 dias.",
    tone: "review",
  },
  AWAITING_FIRST_PAYMENT: {
    label: "Aguardando primeiro pagamento",
    shortLabel: "Primeiro pagamento",
    detail: "Aguardando o primeiro pagamento confirmado.",
    description:
      "Seu cadastro está ativo. Envie seu primeiro comprovante ou procure a administração para pagar presencialmente. Os treinos serão liberados após a confirmação de um pagamento recente.",
    tone: "first",
  },
  OVERDUE: {
    label: "Inadimplente",
    shortLabel: "Inadimplente",
    detail: "Sem pagamento confirmado nos últimos 30 dias.",
    description:
      "Seu último pagamento confirmado está fora da janela de 30 dias. Envie um novo comprovante ou procure a administração para regularizar o acesso aos treinos.",
    tone: "overdue",
  },
} as const;
