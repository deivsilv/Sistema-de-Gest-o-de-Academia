import { useEffect, useRef, useState, lazy, Suspense } from "react";
import type { AcademyPerson, AcademyPlan, Payment, Workout } from "./academy";
import { currency, formatDate, isPaidUp } from "./academy";
import { financialStatus, financialStatusInfo } from "./financialStatus";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Dumbbell,
  FileText,
  Layers,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import "./RoleAreas.css";
const FinancePanel = lazy(() => import("./FinancePanel"));
import { api } from "./api";

type Props = {
  role: "student" | "trainer";
  person: AcademyPerson;
  students: AcademyPerson[];
  trainers: AcademyPerson[];
  plans: AcademyPlan[];
  payments: Payment[];
  workouts: Workout[];
  onRefresh: () => Promise<void>;
  onLogout: () => void;
};
type Page = "Início" | "Meus treinos" | "Meu plano" | "Treinos" | "Alunos";
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");

export default function RoleAreas({
  role,
  person,
  students,
  trainers,
  plans,
  payments,
  onLogout,
  workouts,
  onRefresh,
}: Props) {
  const [page, setPage] = useState<Page>("Início");
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Ativos");
  const [studentFilter, setStudentFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [detail, setDetail] = useState<Workout | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [targetStudent, setTargetStudent] = useState("");
  const [deactivating, setDeactivating] = useState<Workout | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trainer = role === "trainer";
  const paidUp = isPaidUp(payments, person.id);
  const hasActivePlan = person.hasActivePlan === true;
  const canViewWorkouts = paidUp && hasActivePlan;
  const currentFinancialStatus =
    person.financialStatus || financialStatus(payments, person.id);
  const statusInfo = financialStatusInfo[currentFinancialStatus];
  const activeStudents = students.filter((s) => s.active);
  const myWorkouts = workouts.filter((w) =>
    trainer ? w.trainerId === person.id : w.studentId === person.id && w.active,
  );
  const myPayments = payments
    .filter((p) => p.studentId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const plan = plans.find((p) => p.name === person.plan);
  const links: { name: Page; icon: typeof Activity }[] = trainer
    ? [
        { name: "Início", icon: LayoutDashboard },
        { name: "Alunos", icon: Users },
        { name: "Treinos", icon: Dumbbell },
      ]
    : [
        { name: "Início", icon: LayoutDashboard },
        { name: "Meus treinos", icon: Dumbbell },
        { name: "Meu plano", icon: Wallet },
      ];
  const modalOpen = formOpen || !!detail || !!deactivating;
  useEffect(() => {
    if (modalOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modalOpen]);
  function closeModal() {
    setFormOpen(false);
    setDetail(null);
    setDeactivating(null);
    setError("");
  }
  function navigate(next: Page) {
    setPage(next);
    setMobile(false);
    setQuery("");
    setStudentFilter("");
    setStatus("Ativos");
    setNotice("");
    void onRefresh().catch(() =>
      setNotice("Não foi possível atualizar sua situação. Tente novamente."),
    );
  }
  function openForm(
    workout: Workout | null = null,
    studentId: string | number = "",
  ) {
    if (!trainer) return;
    setEditing(workout);
    setTargetStudent(workout ? String(workout.studentId) : String(studentId));
    setError("");
    setFormOpen(true);
  }
  async function saveWorkout(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trainer) return;
    const data = new FormData(e.currentTarget);
    const studentId = editing
      ? String(editing.studentId)
      : String(data.get("studentId"));
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    if (
      !activeStudents.some((s) => String(s.id) === studentId) ||
      !title ||
      !description
    ) {
      setError("Selecione um aluno ativo e preencha o título e a descrição.");
      return;
    }
    if (editing && editing.trainerId !== person.id) return;
    setBusy(true);
    try {
      await api(
        `/workouts${editing ? `/${editing.id}` : ""}`,
        editing ? "PATCH" : "POST",
        { studentId, title, description },
      );
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      return;
    } finally {
      setBusy(false);
    }
    closeModal();
    setNotice(
      editing
        ? "Treino atualizado com sucesso."
        : "Treino cadastrado com sucesso.",
    );
  }
  const visibleWorkouts = myWorkouts.filter((w) => {
    const student = students.find((s) => s.id === w.studentId);
    return (
      `${w.title} ${student?.name || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!studentFilter || String(w.studentId) === studentFilter) &&
      (!trainer ||
        status === "Todos" ||
        (status === "Ativos" ? w.active : !w.active))
    );
  });
  function workoutCards(items: Workout[]) {
    return items.length ? (
      <div className="workout-grid">
        {items.map((w, index) => {
          const student = students.find((s) => s.id === w.studentId);
          const author = trainers.find((t) => t.id === w.trainerId);
          return (
            <article
              className={`workout-card ${!w.active ? "archived" : ""}`}
              key={w.id}
            >
              <div className="workout-top">
                <span className="workout-symbol">
                  <Dumbbell size={22} />
                </span>
                <span className={`badge ${!w.active ? "inactive" : ""}`}>
                  {w.active ? "Ativo" : "Desativado"}
                </span>
              </div>
              <span className="eyebrow">
                {trainer
                  ? student?.name || "Aluno não disponível"
                  : `SUA ROTINA · ${String(index + 1).padStart(2, "0")}`}
              </span>
              <h2>{w.title}</h2>
              <p className="workout-excerpt">{w.description}</p>
              <div className="workout-meta">
                <Clock3 size={13} />
                {formatDate(w.createdAt)}
                <span>· {author?.name || "Personal trainer"}</span>
              </div>
              <div className="workout-actions">
                <button className="primary" onClick={() => setDetail(w)}>
                  Ver treino <ArrowRight size={15} />
                </button>
                {trainer && (
                  <>
                    <button
                      disabled={!student?.active}
                      onClick={() => openForm(w)}
                    >
                      Editar
                    </button>
                    <button onClick={() => setDeactivating(w)}>
                      {w.active ? "Desativar" : "Reativar"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    ) : (
      <div className="area-empty">
        <Dumbbell size={30} />
        <h2>
          Nenhum treino{" "}
          {query || studentFilter ? "encontrado" : "cadastrado até o momento"}
        </h2>
        <p>
          {trainer
            ? "Cadastre uma rotina para um aluno ou ajuste os filtros."
            : "Seu personal vai disponibilizar sua rotina por aqui."}
        </p>
        {trainer && (
          <button
            className="primary"
            disabled={!activeStudents.length}
            onClick={() => openForm()}
          >
            <Plus size={16} />
            Novo treino
          </button>
        )}
      </div>
    );
  }
  const locked = (
    <section className="locked-state">
      <span className="lock-symbol">
        <LockKeyhole size={30} />
      </span>
      <span className="eyebrow">{!hasActivePlan ? "PLANO ATIVO NECESSÁRIO" : statusInfo.label.toUpperCase()}</span>
      <h2>
        {currentFinancialStatus === "OVERDUE"
          ? "Acesso aos treinos bloqueado"
          : "Treinos aguardando liberação"}
      </h2>
      <p>{!hasActivePlan
        ? `${paidUp ? "Seu pagamento está em dia. " : ""}Para acessar os treinos, peça à administração que vincule um plano ativo ao seu cadastro.${!paidUp ? " Também é necessário um pagamento confirmado nos últimos 30 dias." : ""}`
        : statusInfo.description}</p>
      <p className="lock-hint">
        Seu plano e histórico de pagamentos continuam disponíveis para consulta.
      </p>
      <button className="primary" onClick={() => navigate("Meu plano")}>
        Consultar situação financeira <ArrowRight size={16} />
      </button>
    </section>
  );
  return (
    <div className="app role-app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="#" onClick={() => navigate("Início")}>
          <Activity /> SteakUp<span>gestão de academia</span>
        </a>
        <span className="nav-caption">
          {trainer ? "ESPAÇO DO PERSONAL" : "ESPAÇO DO ALUNO"}
        </span>
        <nav>
          {links.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => navigate(name)}
              className={page === name ? "selected" : ""}
            >
              <Icon size={19} />
              {name}
              {page === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="version">
            <p>Acesso autenticado por perfil.</p>
          </div>
          <button className="user" onClick={onLogout}>
            <span className="avatar">{initials(person.name)}</span>
            <span>
              <strong>{person.name}</strong>
              <small>{trainer ? "Personal trainer" : "Aluno"} · Sair</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="mobile-toggle"
            aria-label="Abrir menu"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div>
            {trainer ? "Área do personal" : "Área do aluno"}
            <span>/</span>
            <strong>{page}</strong>
          </div>
          <span className="top-tag">
            <span className="live-dot" />
            {trainer ? person.cref : "Sua evolução começa aqui"}
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {trainer
                  ? "ACOMPANHE CADA EVOLUÇÃO"
                  : "UM PASSO A MAIS, TODOS OS DIAS"}
              </span>
              <h1>
                {page === "Início"
                  ? `Olá, ${person.name.split(" ")[0]}. ${trainer ? "Vamos inspirar?" : "Vamos evoluir?"}`
                  : page === "Treinos"
                    ? "Treinos dos seus alunos"
                    : page === "Alunos"
                      ? "Pessoas em movimento."
                      : page === "Meus treinos"
                        ? "Sua próxima evolução."
                        : "Tudo sobre o seu plano."}
              </h1>
              <p>
                {trainer
                  ? "Rotinas organizadas. Mais atenção para cada pessoa."
                  : "Seu treino, seu plano e suas conquistas em um só lugar."}
              </p>
            </div>
            {trainer && (
              <button
                className="primary"
                disabled={!activeStudents.length}
                onClick={() => openForm()}
              >
                <Plus size={18} />
                Novo treino
              </button>
            )}
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check size={18} />
              {notice}
              <button
                aria-label="Fechar mensagem"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Início" && (
            <>
              <div className="stats">
                {(trainer
                  ? [
                      {
                        label: "Alunos ativos",
                        value: activeStudents.length,
                        detail: "Disponíveis para novos treinos",
                        icon: Users,
                      },
                      {
                        label: "Meus treinos ativos",
                        value: myWorkouts.filter((w) => w.active).length,
                        detail: "Rotinas em acompanhamento",
                        icon: Dumbbell,
                      },
                      {
                        label: "Alunos com meus treinos",
                        value: new Set(
                          myWorkouts
                            .filter((w) => w.active)
                            .map((w) => w.studentId),
                        ).size,
                        detail: "Pessoas com rotinas ativas",
                        icon: Activity,
                      },
                    ]
                  : [
                      {
                        label: "Meus treinos",
                        value: canViewWorkouts ? myWorkouts.length : "—",
                        detail: canViewWorkouts
                          ? "Rotinas ativas para você"
                          : "Visualização bloqueada",
                        icon: Dumbbell,
                      },
                      {
                        label: "Meu plano",
                        value:
                          person.plan === "Sem plano"
                            ? "Sem plano"
                            : person.plan,
                        detail: plan
                          ? `${plan.months} ${plan.months === 1 ? "mês" : "meses"} · ${currency(plan.price)}`
                          : "Consulte a administração",
                        icon: Layers,
                      },
                      {
                        label: "Situação financeira",
                        value: statusInfo.shortLabel,
                        detail: statusInfo.detail,
                        icon: ShieldCheck,
                      },
                    ]
                ).map(({ label, value, detail, icon: Icon }) => (
                  <article className="stat" key={label}>
                    <div>
                      {label}
                      <Icon size={19} />
                    </div>
                    <strong
                      className={typeof value === "string" ? "stat-text" : ""}
                    >
                      {value}
                    </strong>
                    <small>{detail}</small>
                  </article>
                ))}
              </div>
              <section className="hero">
                <div>
                  <span className="eyebrow">
                    {trainer
                      ? "CUIDADO QUE TRANSFORMA"
                      : "SEU RITMO. SUA JORNADA."}
                  </span>
                  <h2>
                    {trainer ? (
                      <>
                        Cada pessoa tem um objetivo.
                        <br />
                        Você ajuda a chegar lá.
                      </>
                    ) : (
                      <>
                        Consistência hoje.
                        <br />
                        Evolução a cada dia.
                      </>
                    )}
                  </h2>
                  <p>
                    {trainer
                      ? "Crie rotinas individuais e mantenha os treinos dos seus alunos atualizados."
                      : "Consulte sua rotina e conte com o acompanhamento do seu personal."}
                  </p>
                  <button
                    onClick={() =>
                      navigate(
                        trainer
                          ? "Alunos"
                          : canViewWorkouts
                            ? "Meus treinos"
                            : "Meu plano",
                      )
                    }
                  >
                    {trainer
                      ? "Acompanhar alunos"
                      : canViewWorkouts
                        ? "Acessar meus treinos"
                        : "Consultar meu plano"}
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="portal-hero-icon" aria-hidden="true">
                  <Dumbbell size={100} strokeWidth={1} />
                </div>
              </section>
              <div className="section-title">
                <div>
                  <h2>
                    {trainer ? "Rotinas em acompanhamento" : "Meus treinos"}
                  </h2>
                  <p>
                    {trainer
                      ? "Os treinos que você criou para seus alunos."
                      : "Preparados para você pelo seu personal."}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate(trainer ? "Treinos" : "Meus treinos")}
                >
                  Ver todos
                  <ArrowRight size={16} />
                </button>
              </div>
              {!trainer && !canViewWorkouts
                ? locked
                : workoutCards(myWorkouts.filter((w) => w.active).slice(0, 2))}
            </>
          )}
          {(page === "Treinos" || page === "Meus treinos") &&
            (!trainer && !canViewWorkouts ? (
              locked
            ) : (
              <>
                <div className="workout-filters">
                  <div className="search">
                    <Search size={18} />
                    <input
                      aria-label="Buscar treinos"
                      placeholder={
                        trainer
                          ? "Buscar treino ou aluno..."
                          : "Buscar meus treinos..."
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  {trainer && (
                    <>
                      <select
                        aria-label="Filtrar por aluno"
                        value={studentFilter}
                        onChange={(e) => setStudentFilter(e.target.value)}
                      >
                        <option value="">Todos os alunos</option>
                        {students.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Filtrar treinos por situação"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option>Ativos</option>
                        <option>Desativados</option>
                        <option>Todos</option>
                      </select>
                    </>
                  )}
                </div>
                {workoutCards(visibleWorkouts)}
              </>
            ))}
          {page === "Alunos" && trainer && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Alunos ativos{" "}
                    <span className="count">{activeStudents.length}</span>
                  </h2>
                  <p>Consulte as rotinas e crie treinos individuais.</p>
                </div>
              </div>
              <div className="table-tools">
                <div className="search">
                  <Search size={18} />
                  <input
                    aria-label="Buscar aluno"
                    placeholder="Buscar aluno por nome..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="table-scroll" role="region" aria-label="Alunos acompanhados" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>ALUNO</th>
                      <th>MEUS TREINOS ATIVOS</th>
                      <th className="right">ACOMPANHAMENTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStudents
                      .filter((s) =>
                        s.name.toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="person">
                              <span className="avatar">{initials(s.name)}</span>
                              <strong>{s.name}</strong>
                            </div>
                          </td>
                          <td>
                            {
                              myWorkouts.filter(
                                (w) => w.studentId === s.id && w.active,
                              ).length
                            }{" "}
                            treino(s)
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                onClick={() => {
                                  navigate("Treinos");
                                  setStudentFilter(String(s.id));
                                }}
                              >
                                Ver treinos
                              </button>
                              <button
                                onClick={() => openForm(null, String(s.id))}
                              >
                                <Plus size={13} />
                                Criar treino
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!activeStudents.some((s) =>
                  s.name.toLowerCase().includes(query.toLowerCase()),
                ) && <div className="empty">Nenhum aluno encontrado.</div>}
              </div>
            </section>
          )}
          {page === "Meu plano" && !trainer && (
            <>
              <div className="finance-grid">
                <article className="membership-card">
                  <span className="workout-symbol">
                    <Layers size={25} />
                  </span>
                  <span className="eyebrow">SEU PLANO ATUAL</span>
                  <h2>
                    {person.plan === "Sem plano"
                      ? "Nenhum plano ativo"
                      : person.plan}
                  </h2>
                  {plan ? (
                    <>
                      <strong className="price">{currency(plan.price)}</strong>
                      <p>
                        Duração de {plan.months}{" "}
                        {plan.months === 1 ? "mês" : "meses"}.
                      </p>
                    </>
                  ) : (
                    <p>Procure a administração para consultar seu vínculo.</p>
                  )}
                  <div className="membership-foot">
                    <ShieldCheck size={16} />
                    Os pagamentos são realizados fora do sistema.
                  </div>
                </article>
                <article
                  className={`financial-status ${paidUp ? "paid" : "pending"}`}
                >
                  <span className="workout-symbol">
                    {paidUp ? (
                      <ShieldCheck size={25} />
                    ) : (
                      <LockKeyhole size={25} />
                    )}
                  </span>
                  <span className="eyebrow">SITUAÇÃO FINANCEIRA</span>
                  <h2>{statusInfo.label}</h2>
                  <p>{paidUp && !hasActivePlan ? "Pagamento confirmado. Os treinos aguardam a vinculação de um plano ativo pela administração." : statusInfo.description}</p>
                  <small>
                    Último pagamento:{" "}
                    {myPayments.length
                      ? formatDate(myPayments[0].date)
                      : "nenhum pagamento registrado"}
                  </small>
                  <div className="membership-foot">
                    Para registrar ou conferir um pagamento, procure a
                    administração.
                  </div>
                </article>
              </div>
              <Suspense
                fallback={
                  <div className="empty" role="status">
                    Carregando financeiro...
                  </div>
                }
              >
                <FinancePanel
                  admin={false}
                  students={students}
                  payments={payments}
                  onRefresh={onRefresh}
                />
              </Suspense>
              <section className="panel payment-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Histórico de pagamentos
                      <span className="count">{myPayments.length}</span>
                    </h2>
                    <p>
                      Consulte os pagamentos registrados pela administração.
                    </p>
                  </div>
                  <Wallet size={22} />
                </div>
                {myPayments.length ? (
                  <div className="table-scroll" role="region" aria-label="Histórico de pagamentos do aluno" tabIndex={0}>
                    <table>
                      <thead>
                        <tr>
                          <th>DATA DO PAGAMENTO</th>
                          <th>VALOR</th>
                          <th>SITUAÇÃO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myPayments.map((p) => (
                          <tr key={p.id}>
                            <td>{formatDate(p.date)}</td>
                            <td>{currency(p.amount)}</td>
                            <td>
                              <span className="badge">
                                <Check size={12} />
                                Pago
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="area-empty">
                    <Wallet size={28} />
                    <h2>Nenhum pagamento registrado</h2>
                    <p>Procure a administração para conferir sua situação.</p>
                  </div>
                )}
              </section>
            </>
          )}
          <footer>
            SteakUp<span>·</span>Gestão que acompanha sua evolução.
            <span className="footer-right">
              {trainer ? "Área do personal" : "Área do aluno"} · Acesso
              individual
            </span>
          </footer>
        </div>
      </main>
      <dialog
        ref={dialog}
        aria-label={
          formOpen
            ? editing
              ? "Editar treino"
              : "Novo treino"
            : detail
              ? detail.title
              : "Confirmar alteração do treino"
        }
        className="modal portal-dialog"
        onCancel={closeModal}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        {formOpen ? (
          <>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">ACOMPANHAMENTO INDIVIDUAL</span>
                <h2>{editing ? "Editar treino" : "Novo treino"}</h2>
              </div>
              <button aria-label="Fechar formulário" onClick={closeModal}>
                <X />
              </button>
            </div>
            <form onSubmit={saveWorkout}>
              <label>
                Aluno
                <select
                  name="studentId"
                  required
                  disabled={!!editing}
                  value={targetStudent}
                  onChange={(e) => setTargetStudent(e.target.value)}
                >
                  <option value="">Selecione um aluno ativo</option>
                  {activeStudents.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Título do treino
                <input
                  autoFocus
                  name="title"
                  required
                  maxLength={100}
                  defaultValue={editing?.title}
                  placeholder="Ex.: Treino A · Membros inferiores"
                />
              </label>
              <label>
                Descrição e exercícios
                <textarea
                  name="description"
                  required
                  rows={9}
                  maxLength={10000}
                  defaultValue={editing?.description}
                  placeholder="Descreva exercícios, séries, repetições e orientações..."
                />
              </label>
              <p className="form-note">
                O treino fica vinculado ao aluno e a você. A visualização pelo aluno exige plano ativo e pagamento confirmado nos últimos 30 dias.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-buttons">
                <button type="button" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  <Check size={16} />
                  Salvar treino
                </button>
              </div>
            </form>
          </>
        ) : detail && (trainer || canViewWorkouts) ? (
          <>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {trainer
                    ? students.find((s) => s.id === detail.studentId)?.name
                    : "SEU TREINO"}
                </span>
                <h2>{detail.title}</h2>
              </div>
              <button autoFocus aria-label="Fechar treino" onClick={closeModal}>
                <X />
              </button>
            </div>
            <div className="detail-byline">
              <FileText size={16} />
              Criado em {formatDate(detail.createdAt)}
              <br />
              Personal:{" "}
              {trainers.find((t) => t.id === detail.trainerId)?.name ||
                "Profissional responsável"}
            </div>
            <div className="workout-description">{detail.description}</div>
            <div className="modal-buttons">
              <button className="primary" onClick={closeModal}>
                Concluir leitura
                <Check size={16} />
              </button>
            </div>
          </>
        ) : deactivating ? (
          <>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">HISTÓRICO PRESERVADO</span>
                <h2>
                  {deactivating.active
                    ? "Desativar treino?"
                    : "Reativar treino?"}
                </h2>
              </div>
              <button aria-label="Fechar confirmação" onClick={closeModal}>
                <X />
              </button>
            </div>
            <p className="confirm-copy">
              {deactivating.title}.{" "}
              {deactivating.active
                ? "O aluno deixará de visualizar esta rotina. O registro continuará no histórico."
                : "A rotina voltará a aparecer para o aluno, desde que ele tenha plano ativo e esteja adimplente."}
            </p>
            <div className="modal-buttons">
              <button autoFocus onClick={closeModal}>
                Cancelar
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (!trainer || deactivating.trainerId !== person.id) return;
                  try {
                    setBusy(true);
                    await api(`/workouts/${deactivating.id}`, "PATCH", {
                      active: !deactivating.active,
                    });
                    await onRefresh();
                    setNotice(
                      deactivating.active
                        ? "Treino desativado. Histórico preservado."
                        : "Treino reativado.",
                    );
                    closeModal();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível salvar a alteração.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirmar
                <ChevronRight size={16} />
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </>
        ) : null}
      </dialog>
    </div>
  );
}
