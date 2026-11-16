import { supabase } from "./supabase";
export type Receipt = {
  id: string;
  aluno_id: string;
  valor: number;
  data_pagamento: string;
  arquivo_path: string;
  mime_type: string;
  status: "RASCUNHO" | "PENDENTE" | "APROVADO" | "REJEITADO";
  motivo: string | null;
  criado_em: string;
};
export async function receipts(): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from("comprovantes")
    .select(
      "id,aluno_id,valor,data_pagamento,arquivo_path,mime_type,status,motivo,criado_em",
    )
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Receipt[];
}
export function validPayment(amount: number, date: string) {
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date <= today()
  );
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export async function sendReceipt(amount: number, date: string, file: File) {
  if (!validPayment(amount, date))
    throw new Error("Informe valor positivo e uma data que não seja futura.");
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new Error("O arquivo deve ter até 5 MB e não pode estar vazio.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const pdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  const mime = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : pdf
        ? "application/pdf"
        : "";
  if (!mime || (file.type && file.type !== mime))
    throw new Error("Envie um arquivo PNG, JPEG ou PDF válido.");
  const started = await supabase.rpc("iniciar_comprovante", {
    p_valor: amount,
    p_data: date,
    p_mime: mime,
  });
  if (started.error) throw new Error(started.error.message);
  const draft = started.data as Receipt;
  const upload = await supabase.storage
    .from("comprovantes")
    .upload(draft.arquivo_path, file, { contentType: mime, upsert: false });
  if (upload.error)
    throw new Error(
      "O arquivo não foi enviado. Confira sua conexão e tente um novo envio.",
    );
  await completeReceipt(draft.id);
}
export async function completeReceipt(id: string) {
  const { error } = await supabase.rpc("enviar_comprovante", { p_id: id });
  if (error) throw new Error(error.message);
}
export async function reviewReceipt(
  id: string,
  approve: boolean,
  reason?: string,
) {
  const { error } = await supabase.rpc("analisar_comprovante", {
    p_id: id,
    p_aprovar: approve,
    p_motivo: reason || null,
  });
  if (error) throw new Error(error.message);
}
export async function receiptLink(path: string, mime: string) {
  const { data, error } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60, {
      download: `comprovante.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`,
    });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
export async function recordPayment(
  id: string,
  studentId: string,
  amount: number,
  date: string,
  method: string,
) {
  if (!validPayment(amount, date))
    throw new Error("Informe valor positivo e uma data que não seja futura.");
  const { error } = await supabase.rpc("registrar_pagamento", {
    p_id: id,
    p_aluno_id: studentId,
    p_valor: amount,
    p_data: date,
    p_forma: method,
  });
  if (error) throw new Error(error.message);
}
