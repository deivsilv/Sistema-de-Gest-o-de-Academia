import type { AcademyPerson, EntityId, Payment } from "./academy";
import { dateDaysAgo, isPaidUp } from "./academy";

export function filterPayments(
  payments: Payment[],
  studentId: string,
  from: string,
  to: string,
) {
  if (from && to && from > to) return [];
  return payments.filter((p) =>
    (!studentId || String(p.studentId) === studentId) &&
    (!from || p.date >= from) && (!to || p.date <= to),
  ).sort((a, b) => b.date.localeCompare(a.date));
}

// A inclusão segue RF-13, independentemente de haver comprovante em análise.
// Os rótulos de primeiro pagamento e análise continuam preservados na interface.
export function unpaidStudents(
  students: AcademyPerson[], payments: Payment[], today = dateDaysAgo(0),
) {
  const byStudent = new Map<EntityId, Payment[]>();
  for (const payment of payments) {
    if (payment.status !== "PAGO" || !Number.isFinite(payment.amount) ||
      payment.amount <= 0 || payment.date > today) continue;
    const group = byStudent.get(payment.studentId) || [];
    group.push(payment);
    byStudent.set(payment.studentId, group);
  }
  return students.filter((s) => s.active).flatMap((student) => {
    const history = byStudent.get(student.id) || [];
    if (isPaidUp(history, student.id, today)) return [];
    const lastPayment = history.reduce<string | null>(
      (last, p) => !last || p.date > last ? p.date : last, null,
    );
    return [{ student, lastPayment }];
  }).sort((a, b) => a.student.name.localeCompare(b.student.name, "pt-BR"));
}
