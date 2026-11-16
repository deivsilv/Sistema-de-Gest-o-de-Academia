import { useState } from "react";
import type { AcademyPerson, Payment } from "./academy";
import { currency, formatDate } from "./academy";
import { financialStatusInfo } from "./financialStatus";
import { filterPayments, unpaidStudents } from "./financeReports";

export default function AdminFinanceReports({ students, payments }: {
  students: AcademyPerson[]; payments: Payment[];
}) {
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const invalidRange = !!(from && to && from > to);
  const visible = filterPayments(payments, studentId, from, to);
  const pending = unpaidStudents(students, payments);
  const visiblePending = pending.filter(({ student }) =>
    student.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );
  const names = new Map(students.map((s) => [s.id, s.name]));
  return <>
    <section className="panel payment-panel" aria-labelledby="payment-history-title">
      <div className="panel-heading"><div>
        <h2 id="payment-history-title">Histórico de pagamentos <span className="count">{visible.length}</span></h2>
        <p>Recebimentos confirmados pela administração, com ou sem comprovante.</p>
      </div></div>
      <div className="finance-report-filters">
        <label>Aluno<select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Todos os alunos</option>
          {students.map((s) => <option key={s.id} value={String(s.id)}>{s.name}{s.active ? "" : " (inativo)"}</option>)}
        </select></label>
        <label>De<input type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} onChange={(e) => setFrom(e.target.value)} aria-invalid={invalidRange} aria-describedby={invalidRange ? "payment-date-error" : undefined} /></label>
        <label>Até<input type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} onChange={(e) => setTo(e.target.value)} aria-invalid={invalidRange} aria-describedby={invalidRange ? "payment-date-error" : undefined} /></label>
        <button className="text-button" onClick={() => { setStudentId(""); setFrom(""); setTo(""); }}>Limpar filtros</button>
      </div>
      {invalidRange && <p className="error report-message" role="alert" id="payment-date-error">A data inicial deve ser anterior ou igual à data final.</p>}
      <div className="table-scroll" role="region" aria-label="Histórico de pagamentos" tabIndex={0}><table>
        <thead><tr><th>ALUNO</th><th>DATA</th><th>VALOR</th><th>FORMA</th><th>STATUS</th></tr></thead>
        <tbody>{visible.map((p) => <tr key={p.id}>
          <td>{names.get(p.studentId) || "Aluno"}</td><td>{formatDate(p.date)}</td>
          <td>{currency(p.amount)}</td><td>{p.method || "OUTRO"}</td><td><span className="badge">Pago</span></td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length && !invalidRange && <div className="empty">Nenhum pagamento encontrado para os filtros selecionados.</div>}
      <p className="report-message" role="status">Total exibido: <strong>{currency(visible.reduce((total, p) => total + p.amount, 0))}</strong></p>
    </section>
    <section className="panel payment-panel" aria-labelledby="unpaid-title">
      <div className="panel-heading"><div>
        <h2 id="unpaid-title">Inadimplência e pendências <span className="count">{pending.length}</span></h2>
        <p>Alunos ativos sem pagamento confirmado nos últimos 30 dias, incluindo primeiro pagamento e comprovantes em análise.</p>
      </div></div>
      <div className="finance-report-filters">
        <label>Buscar aluno<input type="search" placeholder="Nome do aluno" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
      <div className="table-scroll" role="region" aria-label="Inadimplência e pendências" tabIndex={0}><table>
        <thead><tr><th>ALUNO</th><th>ÚLTIMO PAGAMENTO</th><th>SITUAÇÃO</th></tr></thead>
        <tbody>{visiblePending.map(({ student, lastPayment }) => {
          const info = financialStatusInfo[student.financialStatus || (lastPayment ? "OVERDUE" : "AWAITING_FIRST_PAYMENT")];
          return <tr key={student.id}><td>{student.name}</td><td>{lastPayment ? formatDate(lastPayment) : "Nenhum pagamento registrado"}</td>
            <td><span className={`badge financial-badge ${info.tone}`}>{info.label}</span></td></tr>;
        })}</tbody>
      </table></div>
      {!visiblePending.length && <div className="empty">{pending.length ? "Nenhum aluno encontrado na busca." : "Nenhum aluno ativo com pendência de pagamento."}</div>}
    </section>
  </>;
}
