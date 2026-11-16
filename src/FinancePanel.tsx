import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  FileCheck2,
  Plus,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import type { AcademyPerson, Payment } from "./academy";
import { currency, formatDate } from "./academy";
import { financialStatus } from "./financialStatus";
import {
  completeReceipt,
  receipts,
  receiptLink,
  recordPayment,
  reviewReceipt,
  sendReceipt,
  today,
} from "./finance";
import type { Receipt } from "./finance";
import "./FinancePanel.css";
import PixPayment from "./PixPayment";
import AdminFinanceReports from "./AdminFinanceReports";
import { Capacitor } from "@capacitor/core";
type Props = {
  admin: boolean;
  students: AcademyPerson[];
  payments: Payment[];
  onRefresh: () => Promise<void>;
};
const statusName = {
  RASCUNHO: "Envio incompleto",
  PENDENTE: "Em análise",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
};
export default function FinancePanel({
  admin,
  students,
  payments,
  onRefresh,
}: Props) {
  const [items, setItems] = useState<Receipt[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("Todos"),
    [search, setSearch] = useState("");
  const [mode, setMode] = useState<"upload" | "manual" | null>(null),
    [review, setReview] = useState<{ item: Receipt; approve: boolean } | null>(
      null,
    );
  const [busy, setBusy] = useState(false),
    [link, setLink] = useState<{ id: string; url: string } | null>(null),
    [requestId, setRequestId] = useState("");
  const [modalError, setModalError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  async function reload() {
    setItems(await receipts());
  }
  useEffect(() => {
    let active = true;
    receipts()
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (mode || review) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode, review]);
  function close() {
    if (busy) return;
    setMode(null);
    setReview(null);
    setModalError("");
  }
  function open(next: "upload" | "manual") {
    setMode(next);
    setModalError("");
    setRequestId(crypto.randomUUID());
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setModalError("");
    setNotice("");
    try {
      if (review) {
        await reviewReceipt(
          review.item.id,
          review.approve,
          String(data.get("reason") || ""),
        );
        setNotice(
          review.approve
            ? "Comprovante aprovado e pagamento registrado. A situação dos treinos segue a data do pagamento."
            : "Comprovante rejeitado. O aluno pode consultar o motivo.",
        );
      } else if (mode === "upload") {
        const file = data.get("file");
        if (!(file instanceof File))
          throw new Error("Selecione um comprovante.");
        await sendReceipt(
          Number(data.get("amount")),
          String(data.get("date")),
          file,
        );
        setNotice("Comprovante enviado. Aguarde a análise da administração.");
      } else {
        await recordPayment(
          requestId,
          String(data.get("studentId")),
          Number(data.get("amount")),
          String(data.get("date")),
          String(data.get("method")),
        );
        setNotice(
          "Pagamento recebido registrado. A situação dos treinos foi atualizada pela data do pagamento.",
        );
      }
      setMode(null);
      setReview(null);
      try {
        await Promise.all([reload(), onRefresh()]);
      } catch {
        setError(
          "A operação foi salva, mas a lista não pôde ser atualizada. Atualize a situação antes de tentar outro registro.",
        );
      }
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "Não foi possível concluir.",
      );
      reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function getLink(item: Receipt) {
    setError("");
    setLink(null);
    try {
      setLink({
        id: item.id,
        url: await receiptLink(item.arquivo_path, item.mime_type),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir o arquivo.",
      );
    }
  }
  const visible = items.filter(
    (i) =>
      (filter === "Todos" || i.status === filter) &&
      `${students.find((s) => s.id === i.aluno_id)?.name || ""} ${currency(Number(i.valor))}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="finance-panel">
      {admin && (
        <div className="stats">
          <article className="stat">
            <div>
              Comprovantes em análise
              <Clock3 size={18} />
            </div>
            <strong>
              {items.filter((i) => i.status === "PENDENTE").length}
            </strong>
            <small>Aguardando conferência</small>
          </article>
          <article className="stat">
            <div>
              Pagamentos registrados
              <Wallet size={18} />
            </div>
            <strong>{payments.length}</strong>
            <small>Recebimentos confirmados</small>
          </article>
          <article className="stat">
            <div>
              Alunos inadimplentes
              <FileCheck2 size={18} />
            </div>
            <strong>
              {
                students.filter(
                  (s) =>
                    s.active &&
                    financialStatus(
                      payments,
                      s.id,
                      items.some(
                        (i) => i.aluno_id === s.id && i.status === "PENDENTE",
                      ),
                    ) === "OVERDUE",
                ).length
              }
            </strong>
            <small>Já pagaram; sem pagamento recente ou em análise</small>
          </article>
        </div>
      )}
      {admin && (
        <div className="first-payment-summary">
          <span className="badge financial-badge first">
            Aguardando primeiro pagamento
          </span>
          <strong>
            {
              students.filter(
                (s) =>
                  s.active &&
                  financialStatus(
                    payments,
                    s.id,
                    items.some(
                      (i) => i.aluno_id === s.id && i.status === "PENDENTE",
                    ),
                  ) === "AWAITING_FIRST_PAYMENT",
              ).length
            }{" "}
            aluno(s)
          </strong>
          <p>
            Cadastros ativos que ainda não têm pagamento confirmado nem
            comprovante em análise.
          </p>
        </div>
      )}
      {!admin && <PixPayment />}
      <section className="receipt-intro">
        <div>
          <span className="eyebrow">
            {admin ? "RECEBIMENTOS E CONFERÊNCIA" : "PAGOU POR PIX?"}
          </span>
          <h2>
            {admin
              ? "Confirme o recebimento. Acompanhe cada envio."
              : "Envie seu comprovante."}
          </h2>
          <p>
            {admin
              ? "Confira o valor e a data no arquivo antes de aprovar. Pagamentos presenciais podem ser registrados diretamente."
              : "PNG, JPEG ou PDF de até 5 MB. O envio fica em análise e não libera os treinos automaticamente."}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => open(admin ? "manual" : "upload")}
          disabled={admin && !students.some((s) => s.active)}
        >
          {admin ? <Plus size={17} /> : <Upload size={17} />}
          {admin ? "Registrar recebimento" : "Enviar comprovante"}
        </button>
      </section>
      {admin && !students.some((s) => s.active) && (
        <p className="finance-footnote">
          Cadastre um aluno ativo no menu Alunos para registrar recebimentos.
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              setLoading(true);
              reload()
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={17} />
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="finance-refresh">
        <button
          className="text-button"
          disabled={loading || busy}
          onClick={async () => {
            setLoading(true);
            setError("");
            try {
              await Promise.all([reload(), onRefresh()]);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível atualizar.",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          Atualizar situação
        </button>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {admin ? "Comprovantes recebidos" : "Meus comprovantes"}
              <span className="count">{visible.length}</span>
            </h2>
            <p>
              {admin
                ? "A aprovação registra o pagamento uma única vez."
                : "Consulte a análise e o motivo de uma eventual rejeição."}
            </p>
          </div>
          <select
            aria-label="Filtrar comprovantes"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="Todos">Todos</option>
            <option value="PENDENTE">Em análise</option>
            <option value="APROVADO">Aprovados</option>
            <option value="REJEITADO">Rejeitados</option>
            {!admin && <option value="RASCUNHO">Envios incompletos</option>}
          </select>
        </div>
        {admin && (
          <div className="table-tools">
            <input
              aria-label="Buscar comprovante por aluno"
              placeholder="Buscar por aluno..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        {loading ? (
          <div className="empty" role="status">
            Carregando comprovantes...
          </div>
        ) : visible.length ? (
          <div className="receipt-list">
            {visible.map((item) => (
              <article className="receipt-row" key={item.id}>
                <div>
                  <span
                    className={`badge ${item.status === "REJEITADO" ? "inactive" : ""}`}
                  >
                    {statusName[item.status]}
                  </span>
                  <h3>
                    {admin
                      ? students.find((s) => s.id === item.aluno_id)?.name ||
                        "Aluno"
                      : `Pagamento de ${formatDate(item.data_pagamento)}`}
                  </h3>
                  <p>
                    {currency(Number(item.valor))} · Pago em{" "}
                    {formatDate(item.data_pagamento)}
                  </p>
                  {item.motivo && (
                    <p className="rejection-reason">
                      <strong>Motivo:</strong> {item.motivo}
                    </p>
                  )}
                </div>
                <div className="receipt-actions">
                  <button className="text-button" onClick={() => getLink(item)}>
                    Preparar download
                  </button>
                  {link?.id === item.id && (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                        onClick={async (event) => {
                          if (!Capacitor.isNativePlatform()) return;
                          event.preventDefault();
                          try {
                            const { Browser } = await import("@capacitor/browser");
                            await Browser.open({ url: link.url });
                          } catch {
                            setError("Não foi possível abrir o comprovante. Prepare um novo link e tente novamente.");
                          }
                        }}
                    >
                      Baixar arquivo (link de 60s)
                    </a>
                  )}
                  {admin && item.status === "PENDENTE" && (
                    <>
                      <button
                        className="primary"
                        onClick={() => {
                          setModalError("");
                          setReview({ item, approve: true });
                        }}
                      >
                        Aprovar
                      </button>
                      <button
                        className="reject-button"
                        onClick={() => {
                          setModalError("");
                          setReview({ item, approve: false });
                        }}
                      >
                        Rejeitar
                      </button>
                    </>
                  )}
                  {!admin && item.status === "RASCUNHO" && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await completeReceipt(item.id);
                          await reload();
                          setNotice("Envio concluído. Aguarde a análise.");
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Tente outro envio.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Concluir envio
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            Nenhum comprovante{" "}
            {filter === "Todos" ? "enviado ainda" : "nesta situação"}.
          </div>
        )}
      </section>
      {admin && <AdminFinanceReports students={students} payments={payments} />}
      <p className="finance-footnote">
        A janela de 30 dias é calculada pela data do pagamento, não pela data da
        aprovação.{" "}
        {admin
          ? "Alunos inativos não podem receber novos registros de pagamento."
          : "Para pagar presencialmente, procure a administração. Não é necessário enviar um comprovante."}
      </p>
      <dialog
        ref={dialog}
        className="modal portal-dialog finance-dialog"
        aria-label={
          review
            ? "Analisar comprovante"
            : mode === "manual"
              ? "Registrar recebimento"
              : "Enviar comprovante"
        }
        onCancel={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="modal-heading">
          <h2>
            {review
              ? review.approve
                ? "Aprovar comprovante?"
                : "Rejeitar comprovante?"
              : mode === "manual"
                ? "Registrar recebimento"
                : "Enviar comprovante"}
          </h2>
          <button
            type="button"
            disabled={busy}
            aria-label="Fechar formulário financeiro"
            onClick={close}
          >
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          {review ? (
            <>
              <p className="confirm-copy">
                {currency(Number(review.item.valor))} · Pago em{" "}
                {formatDate(review.item.data_pagamento)}.{" "}
                {review.approve
                  ? "Ao confirmar, você declara ter conferido o recebimento. O arquivo enviado não é uma confirmação bancária automática."
                  : "Informe o que o aluno precisa corrigir em um novo envio."}
              </p>
              {review.approve &&
                review.item.data_pagamento <
                  (() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 30);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  })() && (
                  <p className="error">
                    Pagamento com mais de 30 dias: a aprovação preserva o
                    histórico, mas não libera os treinos atuais.
                  </p>
                )}
              {!review.approve && (
                <label>
                  Motivo da rejeição
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    rows={3}
                    placeholder="Ex.: valor não corresponde ao pagamento recebido."
                  />
                </label>
              )}
            </>
          ) : (
            <>
              {mode === "manual" && (
                <label>
                  Aluno
                  <select name="studentId" required defaultValue="">
                    <option value="">Selecione um aluno ativo</option>
                    {students
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div className="form-row">
                <label>
                  Valor pago (R$)
                  <input
                    name="amount"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                  />
                </label>
                <label>
                  Data do pagamento
                  <input
                    name="date"
                    type="date"
                    required
                    max={today()}
                    defaultValue={today()}
                  />
                </label>
              </div>
              {mode === "manual" ? (
                <>
                  <label>
                    Forma de pagamento
                    <select name="method" required>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="PIX">Pix conferido</option>
                      <option value="CARTAO">Cartão</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </label>
                  <label className="confirmation-check">
                    <input type="checkbox" required />
                    Confirmo que o pagamento foi recebido e conferido.
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Arquivo do comprovante
                    <input
                      name="file"
                      type="file"
                      required
                      accept="image/png,image/jpeg,application/pdf"
                    />
                  </label>
                  <p className="form-note">
                    Não envie documentos pessoais ou dados além do necessário
                    para identificar o pagamento. Formatos: PNG, JPEG ou PDF;
                    até 5 MB.
                  </p>
                </>
              )}
            </>
          )}
          {modalError && (
            <p className="error" role="alert">
              {modalError}
            </p>
          )}
          <div className="modal-buttons">
            <button type="button" disabled={busy} onClick={close}>
              Cancelar
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy
                ? "Processando..."
                : review
                  ? "Confirmar decisão"
                  : mode === "manual"
                    ? "Registrar pagamento"
                    : "Enviar para análise"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
