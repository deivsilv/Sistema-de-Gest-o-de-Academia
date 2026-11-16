import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import bcrypt from "bcryptjs";
import { loadStore, saveStore } from "./app.ts";
const store = loadStore();
if (store.accounts.length)
  throw new Error(
    "Contas já configuradas. Nenhuma conta ou senha foi modificada.",
  );
const lines = [
  "ACESSOS LOCAIS — PULSO",
  "Senhas aleatórias para o desenvolvimento local. Não publicar este arquivo.",
  "",
];
for (const entry of [
  { role: "admin" as const, personId: 0, email: "admin@pulso.local" },
  ...store.trainers.map((p) => ({
    role: "trainer" as const,
    personId: p.id,
    email: p.email,
  })),
  ...store.students.map((p) => ({
    role: "student" as const,
    personId: p.id,
    email: p.email,
  })),
]) {
  const password = randomBytes(15).toString("base64url");
  store.accounts.push({
    ...entry,
    id: randomUUID(),
    active: true,
    passwordHash: await bcrypt.hash(password, 12),
  });
  lines.push(
    `Perfil: ${entry.role}\nE-mail: ${entry.email}\nSenha: ${password}\n`,
  );
}
const file = resolve(process.argv[2] || "acessos.local.txt");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, lines.join("\n"), { mode: 0o600, flag: "wx" });
saveStore(store);
console.log(
  "Contas locais criadas. Credenciais gravadas no arquivo indicado; senhas armazenadas como hash na API.",
);
