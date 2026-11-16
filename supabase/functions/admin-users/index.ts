// Deploy inside Supabase Edge Functions. No service-role secret belongs in Vite.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
const origins = ["https://steakup.vercel.app", "https://localhost", ...(
  Deno.env.get("ALLOWED_ORIGINS") ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((x) => x.trim())];
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = {
    "Content-Type": "application/json",
    Vary: "Origin",
    ...(origin && origins.includes(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.includes(origin))
    return reply(403, { message: "Origem não permitida." });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return reply(405, { message: "Método não permitido." });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer "))
    return reply(401, { message: "Entre para continuar." });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(500, { message: "Função não configurada." });
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // The gateway checks the JWT; this handler also checks the current user and ADMIN profile.
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(auth.slice(7));
  if (authError || !user) return reply(401, { message: "Sessão inválida." });
  const { data: caller, error: callerError } = await admin
    .from("perfis")
    .select("perfil,ativo")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.perfil !== "ADMIN" || !caller.ativo)
    return reply(403, {
      message: "Apenas administradores ativos podem criar contas.",
    });
  try {
    const raw = await req.text();
    if (raw.length > 16000)
      return reply(413, { message: "Solicitação muito grande." });
    const body = JSON.parse(raw);
    if (body && ["get", "email", "password"].includes(body.action)) {
      if (
        Object.keys(body).some(
          (k) => !["action", "id", "kind", "email", "password"].includes(k),
        ) ||
        typeof body.id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.id) ||
        !["students", "trainers"].includes(body.kind)
      )
        return reply(400, { message: "Solicitação inválida." });
      const { data: target, error: targetError } = await admin
        .from("perfis")
        .select("id,perfil")
        .eq("id", body.id)
        .single();
      if (
        targetError ||
        target?.perfil !== (body.kind === "trainers" ? "PERSONAL" : "ALUNO")
      )
        return reply(404, {
          message: "Conta não encontrada para este tipo de cadastro.",
        });
      if (body.action === "get") {
        const { data, error } = await admin.auth.admin.getUserById(target.id);
        if (error) return reply(404, { message: "Conta não encontrada." });
        return reply(200, { id: target.id, email: data.user.email });
      }
      if (body.action === "email") {
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
          return reply(400, { message: "Informe um e-mail válido." });
        const { error } = await admin.auth.admin.updateUserById(target.id, {
          email,
          email_confirm: true,
        });
        if (error)
          return reply(400, {
            message:
              "Não foi possível alterar o e-mail. Verifique se já está em uso.",
          });
        return reply(200, { id: target.id });
      }
      const password = typeof body.password === "string" ? body.password : "";
      if (
        password.length < 10 ||
        new TextEncoder().encode(password).length > 72
      )
        return reply(400, {
          message:
            "A senha deve ter pelo menos 10 caracteres e no máximo 72 bytes.",
        });
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        password,
      });
      if (error)
        return reply(400, {
          message:
            "Não foi possível redefinir a senha. Confira a política de senhas do projeto.",
        });
      return reply(200, { id: target.id });
    }

    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some(
        (k) => !["name", "email", "password", "cref", "kind"].includes(k),
      )
    )
      return reply(400, { message: "Campos não permitidos." });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const cref = typeof body.cref === "string" ? body.cref.trim() : "";
    if (
      !name ||
      name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      password.length < 10 ||
      new TextEncoder().encode(password).length > 72 ||
      !["students", "trainers"].includes(body.kind) ||
      (body.kind === "trainers" && (!cref || cref.length > 100))
    )
      return reply(400, {
        message:
          "Confira nome, e-mail, senha (mínimo 10 caracteres) e CREF quando aplicável.",
      });
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome: name },
      });
    if (createError || !created.user)
      return reply(400, {
        message:
          "Não foi possível criar a conta. Verifique se o e-mail já está cadastrado e se a senha atende à política do projeto.",
      });
    const { data: profile, error: profileError } = await admin
      .from("perfis")
      .update({
        nome: name,
        perfil: body.kind === "trainers" ? "PERSONAL" : "ALUNO",
        cref: body.kind === "trainers" ? cref : null,
        ativo: true,
      })
      .eq("id", created.user.id)
      .select("id")
      .single();
    if (profileError)
      return reply(500, {
        message:
          "A conta foi criada, mas seu perfil permanece inativo. Confira o cadastro no painel antes de tentar novamente.",
      });
    return reply(201, { id: profile.id });
  } catch {
    return reply(400, { message: "Solicitação inválida." });
  }
});
