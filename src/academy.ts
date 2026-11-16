export type FinancialStatus =
  "PAID" | "UNDER_REVIEW" | "AWAITING_FIRST_PAYMENT" | "OVERDUE";
export type EntityId = string | number;
export type AcademyPerson = {
  id: EntityId;
  name: string;
  email: string;
  active: boolean;
  plan: string;
  hasActivePlan?: boolean;
  cref?: string;
  financialStatus?: FinancialStatus;
};
export type AcademyPlan = {
  id: EntityId;
  name: string;
  price: number;
  months: number;
  active: boolean;
};
export type Workout = {
  id: string;
  studentId: EntityId;
  trainerId: EntityId;
  title: string;
  description: string;
  createdAt: string;
  active: boolean;
};
export type Payment = {
  id: string;
  studentId: EntityId;
  amount: number;
  date: string;
  status: "PAGO";
  method?: string;
};

export function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isPaidUp(
  payments: Payment[],
  studentId: EntityId,
  today = dateDaysAgo(0),
) {
  const now = Date.parse(`${today}T00:00:00Z`);
  return payments.some((p) => {
    const elapsed = (now - Date.parse(`${p.date}T00:00:00Z`)) / 86400000;
    return (
      p.studentId === studentId &&
      p.status === "PAGO" &&
      p.amount > 0 &&
      elapsed >= 0 &&
      elapsed <= 30
    );
  });
}
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T12:00:00`));
export const currency = (amount: number) =>
  amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function initialPayments(): Payment[] {
  return [
    {
      id: "payment-1",
      studentId: 1,
      amount: 99.9,
      date: dateDaysAgo(5),
      status: "PAGO",
    },
    {
      id: "payment-2",
      studentId: 1,
      amount: 99.9,
      date: dateDaysAgo(35),
      status: "PAGO",
    },
    {
      id: "payment-3",
      studentId: 2,
      amount: 269.9,
      date: dateDaysAgo(45),
      status: "PAGO",
    },
  ];
}
export function initialWorkouts(): Workout[] {
  return [
    {
      id: "workout-1",
      studentId: 1,
      trainerId: 1,
      title: "Treino A · Membros inferiores",
      description:
        "Aquecimento: 5 a 10 minutos de bicicleta.\n\nAgachamento livre — 3 séries de 12 repetições\nLeg press — 3 séries de 12 repetições\nCadeira extensora — 3 séries de 15 repetições\nMesa flexora — 3 séries de 12 repetições\nPanturrilha em pé — 3 séries de 15 repetições\n\nDescanso entre séries: 60 segundos. Siga a orientação do seu personal.",
      createdAt: dateDaysAgo(7),
      active: true,
    },
    {
      id: "workout-2",
      studentId: 1,
      trainerId: 1,
      title: "Treino B · Membros superiores",
      description:
        "Aquecimento: mobilidade de ombros e 5 minutos de caminhada.\n\nSupino com halteres — 3 séries de 12 repetições\nPuxada frontal — 3 séries de 12 repetições\nRemada baixa — 3 séries de 12 repetições\nElevação lateral — 3 séries de 15 repetições\nPrancha — 3 séries de 30 segundos\n\nDescanso entre séries: 60 segundos.",
      createdAt: dateDaysAgo(6),
      active: true,
    },
    {
      id: "workout-3",
      studentId: 2,
      trainerId: 1,
      title: "Treino A · Corpo inteiro",
      description:
        "Agachamento — 3 séries de 12 repetições\nRemada baixa — 3 séries de 12 repetições\nSupino máquina — 3 séries de 12 repetições\nBicicleta — 10 minutos\n\nAjuste as cargas com acompanhamento do personal.",
      createdAt: dateDaysAgo(10),
      active: true,
    },
  ];
}

export type SessionData = {
  role: "admin" | "trainer" | "student";
  person: AcademyPerson;
  students: AcademyPerson[];
  trainers: AcademyPerson[];
  plans: AcademyPlan[];
  payments: Payment[];
  workouts: Workout[];
};
