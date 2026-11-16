import { supabase } from "./supabase";
import { dateDaysAgo } from "./academy";
import { financialStatus } from "./financialStatus";
import type { AcademyPerson, SessionData, Workout } from "./academy";
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
type ProfileRow = {
  id: string;
  nome: string;
  perfil: "ADMIN" | "PERSONAL" | "ALUNO";
  cref: string | null;
  ativo: boolean;
};
type PlanRow = {
  id: string;
  nome: string;
  valor: number;
  duracao_meses: number;
  ativo: boolean;
};
type MembershipRow = { aluno_id: string; plano_id: string; ativa: boolean; data_inicio: string; data_fim: string | null };
type PaymentRow = {
  id: string;
  aluno_id: string;
  valor: number;
  data_pagamento: string;
  status: "PAGO";
  forma: string;
};
type WorkoutRow = {
  id: string;
  aluno_id: string;
  personal_id: string;
  titulo: string;
  descricao: string;
  ativo: boolean;
  criado_em: string;
};
function fail(error: {
  message: string;
  code?: string;
  status?: number;
}): never {
  if (error.status === 401 || error.code === "PGRST301") {
    window.dispatchEvent(new Event("pulso:session-expired"));
    throw new ApiError(401, "Sua sessão expirou. Entre novamente.");
  }
  const messages: Record<string, string> = {
    "42501": "Você não tem permissão para esta operação.",
    "23505": "Já existe um registro com esses dados.",
    "23514": "Os dados não atendem às regras de cadastro.",
    PGRST116: "Registro não encontrado ou sem permissão de acesso.",
  };
  throw new ApiError(
    error.status || 400,
    messages[error.code || ""] || error.message,
  );
}
const mapWorkout = (w: WorkoutRow): Workout => ({
  id: w.id,
  studentId: w.aluno_id,
  trainerId: w.personal_id,
  title: w.titulo,
  description: w.descricao,
  active: w.ativo,
  createdAt: w.criado_em.slice(0, 10),
});
async function bootstrap(): Promise<SessionData> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) fail(sessionError);
  if (!session) throw new ApiError(401, "Entre para acessar sua conta.");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) fail(userError);
  if (!user) throw new ApiError(401, "Entre para acessar sua conta.");
  const { data: profile, error: profileError } = await supabase
    .from("perfis")
    .select("id,nome,perfil,cref,ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) fail(profileError);
  if (!profile || !profile.ativo) {
    await supabase.auth.signOut({ scope: "local" });
    throw new ApiError(
      403,
      "Sua conta ainda não está ativa. Procure a administração.",
    );
  }
  const roleMap = {
    ADMIN: "admin",
    PERSONAL: "trainer",
    ALUNO: "student",
  } as const;
  const role = roleMap[(profile as ProfileRow).perfil];
  if (!role)
    throw new ApiError(403, "Seu perfil de acesso não foi configurado.");
  const [profiles, plans, memberships, payments, workouts, pendingReceipts] =
    await Promise.all([
      supabase.from("perfis").select("id,nome,perfil,cref,ativo").order("nome"),
      supabase
        .from("planos")
        .select("id,nome,valor,duracao_meses,ativo")
        .order("nome"),
      supabase
        .from("matriculas")
        .select("aluno_id,plano_id,ativa,data_inicio,data_fim")
        .eq("ativa", true),
      supabase
        .from("pagamentos")
        .select("id,aluno_id,valor,data_pagamento,status,forma")
        .order("data_pagamento", { ascending: false }),
      // Admin has no workout access by design; other roles are filtered by RLS.
      role === "admin"
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("treinos")
            .select("id,aluno_id,personal_id,titulo,descricao,ativo,criado_em")
            .order("criado_em", { ascending: false }),
      role === "trainer"
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("comprovantes")
            .select("aluno_id,status")
            .eq("status", "PENDENTE"),
    ]);
  for (const result of [
    profiles,
    plans,
    memberships,
    payments,
    workouts,
    pendingReceipts,
  ])
    if (result.error) fail(result.error);
  const planRows = (plans.data || []) as PlanRow[];
  const membershipRows = (memberships.data || []) as MembershipRow[];
  const mappedPayments = ((payments.data || []) as PaymentRow[]).map((p) => ({
    id: p.id,
    studentId: p.aluno_id,
    amount: Number(p.valor),
    date: p.data_pagamento,
    status: p.status,
    method: p.forma,
  }));
  const pendingIds = new Set(
    (pendingReceipts.data || []).map((p: { aluno_id: string }) => p.aluno_id),
  );
  const mapPerson = (p: ProfileRow): AcademyPerson => ({
    id: p.id,
    name: p.nome,
    email: p.id === user.id ? user.email || "" : "",
    active: p.ativo,
    cref: p.cref || "",
    ...(p.perfil === "ALUNO" && role !== "trainer"
      ? {
          financialStatus: financialStatus(
            mappedPayments,
            p.id,
            pendingIds.has(p.id),
          ),
        }
      : {}),
    hasActivePlan: membershipRows.some((m) =>
      m.aluno_id === p.id && m.ativa && m.data_inicio <= dateDaysAgo(0) &&
      (!m.data_fim || m.data_fim >= dateDaysAgo(0)) &&
      planRows.some((plan) => plan.id === m.plano_id && plan.ativo),
    ),
    plan:
      planRows.find((plan) =>
        membershipRows.some(
          (m) => m.aluno_id === p.id && m.plano_id === plan.id,
        ),
      )?.nome || "Sem plano",
  });
  const rows = (profiles.data || []) as ProfileRow[];
  return {
    role,
    person: mapPerson(profile as ProfileRow),
    students: rows.filter((p) => p.perfil === "ALUNO").map(mapPerson),
    trainers: rows.filter((p) => p.perfil === "PERSONAL").map(mapPerson),
    plans: planRows.map((p) => ({
      id: p.id,
      name: p.nome,
      price: Number(p.valor),
      months: p.duracao_meses,
      active: p.ativo,
    })),
    payments: mappedPayments,
    workouts: ((workouts.data || []) as WorkoutRow[]).map(mapWorkout),
  };
}
async function linkPlan(studentId: string, planName: string) {
  if (!planName || planName === "Sem plano") return;
  const { data: plan, error } = await supabase
    .from("planos")
    .select("id")
    .eq("nome", planName)
    .eq("ativo", true)
    .single();
  if (error) fail(error);
  const { error: linkError } = await supabase.rpc("vincular_plano", {
    p_aluno_id: studentId,
    p_plano_id: plan.id,
  });
  if (linkError) fail(linkError);
}
async function request(
  path: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (path === "/auth/login") {
    const { error } = await supabase.auth.signInWithPassword({
      email: String(body.email).trim(),
      password: String(body.password),
    });
    if (error)
      throw new ApiError(
        error.status || 401,
        error.code === "invalid_credentials"
          ? "E-mail ou senha inválidos."
          : error.code === "email_not_confirmed"
            ? "Confirme seu e-mail antes de entrar."
            : error.message,
      );
    return { ok: true };
  }
  if (path === "/auth/logout") {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) fail(error);
    return { ok: true };
  }
  if (path === "/bootstrap" && method === "GET") return bootstrap();
  if (path.startsWith("/workouts")) {
    const id = path.split("/")[2];
    if (method === "POST") {
      const { data, error } = await supabase
        .from("treinos")
        .insert({
          aluno_id: body.studentId,
          titulo: body.title,
          descricao: body.description,
        })
        .select()
        .single();
      if (error) fail(error);
      return mapWorkout(data);
    }
    if (method === "PATCH" && id) {
      const update = {
        ...(body.title !== undefined ? { titulo: body.title } : {}),
        ...(body.description !== undefined
          ? { descricao: body.description }
          : {}),
        ...(body.active !== undefined ? { ativo: body.active } : {}),
      };
      const { data, error } = await supabase
        .from("treinos")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) fail(error);
      return mapWorkout(data);
    }
  }
  const [, admin, kind, id] = path.split("/");
  if (admin === "admin" && kind === "plans") {
    const row = {
      ...(body.name !== undefined ? { nome: body.name } : {}),
      ...(body.price !== undefined ? { valor: body.price } : {}),
      ...(body.months !== undefined ? { duracao_meses: body.months } : {}),
      ...(body.active !== undefined ? { ativo: body.active } : {}),
    };
    const result =
      method === "POST"
        ? await supabase.from("planos").insert(row).select().single()
        : await supabase
            .from("planos")
            .update(row)
            .eq("id", id)
            .select()
            .single();
    if (result.error) fail(result.error);
    return result.data;
  }
  if (admin === "admin" && ["students", "trainers"].includes(kind)) {
    if (method === "POST") {
      // Privileged Auth API must run in an Edge Function, never in the browser.
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          name: body.name,
          email: body.email,
          password: body.password,
          cref: body.cref,
          kind,
        },
      });
      if (error) {
        if (error.context instanceof Response && error.context.status !== 404) {
          const response = await error.context.json().catch(() => null);
          if (response && typeof response.message === "string")
            throw new ApiError(error.context.status, response.message);
        }
        throw new ApiError(
          503,
          "Não foi possível acessar o cadastro administrativo. Verifique a conexão e tente novamente.",
        );
      }
      if (!data?.id)
        throw new ApiError(500, "A função não retornou a conta criada.");
      try {
        if (kind === "students")
          await linkPlan(data.id, String(body.plan || "Sem plano"));
      } catch {
        throw new ApiError(
          400,
          "A conta foi criada, mas o plano não foi vinculado. Edite o aluno para vincular o plano, sem repetir o cadastro.",
        );
      }
      return data;
    }
    if (method === "PATCH" && id) {
      const update = {
        ...(body.name !== undefined ? { nome: body.name } : {}),
        ...(body.cref !== undefined ? { cref: body.cref } : {}),
        ...(body.active !== undefined ? { ativo: body.active } : {}),
      };
      if (Object.keys(update).length) {
        const { error } = await supabase
          .from("perfis")
          .update(update)
          .eq("id", id)
          .select("id")
          .single();
        if (error) fail(error);
      }
      if (kind === "students" && body.plan !== undefined) {
        const current = await bootstrap();
        const person = current.students.find((p) => p.id === id);
        if (String(body.plan) !== person?.plan) {
          if (body.plan === "Sem plano")
            throw new ApiError(
              400,
              "Para preservar o histórico, a remoção do vínculo exige uma operação específica. Selecione outro plano ativo.",
            );
          await linkPlan(id, String(body.plan));
        }
      }
      return { ok: true };
    }
  }
  throw new ApiError(404, "Operação não disponível.");
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  return (await request(
    path,
    method,
    (data || {}) as Record<string, unknown>,
  )) as T;
}

export async function adminAccount(
  body: Record<string, unknown>,
): Promise<{ id: string; email?: string }> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
  });
  if (error) {
    if (error.context instanceof Response) {
      const response = await error.context.json().catch(() => null);
      if (response && typeof response.message === "string")
        throw new ApiError(error.context.status, response.message);
    }
    throw new ApiError(
      503,
      "Não foi possível gerenciar o acesso. Verifique a conexão e tente novamente.",
    );
  }
  return data;
}
