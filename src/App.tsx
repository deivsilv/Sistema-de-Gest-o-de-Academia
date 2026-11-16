import { useEffect, useState, lazy, Suspense } from "react";
import {
  Activity,
  ArrowUpRight,
  LayoutDashboard,
  Users,
  Dumbbell,
  Layers,
  Wallet,
  LogOut,
  Search,
  Plus,
  ArrowRight,
  X,
  Check,
  Menu,
} from "lucide-react";
import "./App.css";
import RoleAreas from "./RoleAreas";
const FinancePanel = lazy(() => import("./FinancePanel"));
import AccountAccess from "./AccountAccess";
import RegistrationPasswords from "./RegistrationPasswords";
import { api, ApiError } from "./api";
import { supabase } from "./supabase";
import type { SessionData } from "./academy";
import type { Payment, FinancialStatus } from "./academy";
import { financialStatus, financialStatusInfo } from "./financialStatus";

type Section =
  "Visão geral" | "Alunos" | "Personal trainers" | "Planos" | "Pagamentos";
type Person = {
  id: string | number;
  name: string;
  email: string;
  active: boolean;
  plan: string;
  cref?: string;
  financialStatus?: FinancialStatus;
};
type Plan = {
  id: string | number;
  name: string;
  price: number;
  months: number;
  active: boolean;
};
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
function App() {
  const [logged, setLogged] = useState(false);
  const [role, setRole] = useState<"admin" | "trainer" | "student">("admin");
  const [loginError, setLoginError] = useState("");
  const [sessionPerson, setSessionPerson] = useState<Person | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [section, setSection] = useState<Section>("Visão geral");
  const [students, setStudents] = useState<Person[]>([]);
  const [trainers, setTrainers] = useState<Person[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [workouts, setWorkouts] = useState<SessionData["workouts"]>([]);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  function clearSession() {
    setLogged(false);
    setSessionPerson(null);
    setStudents([]);
    setTrainers([]);
    setPlans([]);
    setPayments([]);
    setWorkouts([]);
    setSection("Visão geral");
    setModal(false);
    setAccess(null);
    setMessage("");
  }
  async function refresh() {
    const data = await api<SessionData>("/bootstrap");
    setRole(data.role);
    setSessionPerson(data.person);
    setStudents(data.students);
    setTrainers(data.trainers);
    setPlans(data.plans);
    setPayments(data.payments);
    setWorkouts(data.workouts);
    setLogged(true);
  }
  useEffect(() => {
    const expired = () => {
      clearSession();
      setLoginError("Sua sessão expirou. Entre novamente.");
    };
    window.addEventListener("pulso:session-expired", expired);
    refresh()
      .catch((e) => {
        clearSession();
        if (!(e instanceof ApiError && e.status === 401))
          setLoginError(
            "Não foi possível carregar sua conta no Supabase. Verifique a conexão e tente novamente.",
          );
        else setLoginError("");
      })
      .finally(() => setChecking(false));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearSession();
      // No async Supabase calls inside this synchronous event callback.
    });
    return () => {
      window.removeEventListener("pulso:session-expired", expired);
      subscription.unsubscribe();
    };
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      clearSession();
      setLoginError("");
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setMessage(
          "Não foi possível sair. Verifique a conexão e tente novamente.",
        );
    }
  }
  const [access, setAccess] = useState<{
    person: Person;
    kind: "students" | "trainers";
  } | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Person | Plan | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [filter, setFilter] = useState("Todos");
  function navigate(next: Section) {
    setSection(next);
    setSearch("");
    setFilter("Todos");
    setMobile(false);
  }
  function open(item: Person | Plan | null = null) {
    setEditing(item);
    setError("");
    setModal(true);
  }
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const kind =
      section === "Planos"
        ? "plans"
        : section === "Personal trainers"
          ? "trainers"
          : "students";
    if (
      !editing &&
      kind !== "plans" &&
      data.get("password") !== data.get("confirmPassword")
    ) {
      setError("As senhas não coincidem.");
      setBusy(false);
      (
        event.currentTarget.elements.namedItem(
          "confirmPassword",
        ) as HTMLInputElement | null
      )?.focus();
      return;
    }
    const body =
      kind === "plans"
        ? {
            name: String(data.get("name")).trim(),
            price: Number(data.get("price")),
            months: Number(data.get("months")),
          }
        : {
            name: String(data.get("name")).trim(),
            email: String(data.get("email")).trim(),
            ...(editing ? {} : { password: String(data.get("password")) }),
            ...(kind === "trainers"
              ? { cref: String(data.get("cref")) }
              : {
                  plan: String(
                    data.get("plan") ||
                      (editing && "plan" in editing
                        ? editing.plan
                        : "Sem plano"),
                  ),
                }),
          };
    try {
      await api(
        `/admin/${kind}${editing ? `/${editing.id}` : ""}`,
        editing ? "PATCH" : "POST",
        body,
      );
      await refresh();
      setModal(false);
      setMessage("Dados salvos com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(item: Person | Plan) {
    if (
      !window.confirm(
        `Deseja ${item.active ? "desativar" : "reativar"} ${item.name}? O histórico será preservado.`,
      )
    )
      return;
    const kind =
      section === "Planos"
        ? "plans"
        : section === "Personal trainers"
          ? "trainers"
          : "students";
    try {
      await api(`/admin/${kind}/${item.id}`, "PATCH", { active: !item.active });
      await refresh();
      setMessage("Cadastro atualizado.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Não foi possível atualizar.",
      );
    }
  }
  const navigation = [
    { label: "Visão geral", icon: LayoutDashboard },
    { label: "Alunos", icon: Users },
    { label: "Personal trainers", icon: Dumbbell },
    { label: "Planos", icon: Layers },
    { label: "Pagamentos", icon: Wallet },
  ] as const;
  const visiblePeople = (
    section === "Personal trainers" ? trainers : students
  ).filter(
    (p) =>
      `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "Todos" || (filter === "Ativos" ? p.active : !p.active)),
  );
  const pageTitle =
    section === "Visão geral" ? "Uma visão do seu movimento." : section;
  if (checking)
    return (
      <div className="session-loading" role="status">
        <Activity size={32} />
        <p>Verificando sua sessão...</p>
      </div>
    );
  if (!logged)
    return (
      <div className="login">
        <section className="login-story">
          <a className="brand" href="#">
            <Activity /> SteakUp<span>gestão de academia</span>
          </a>
          <div>
            <span className="eyebrow">CADA EVOLUÇÃO COMEÇA AQUI</span>
            <h1>
              Mais foco nas pessoas.
              <br />
              <em>Mais movimento.</em>
            </h1>
            <p>
              Alunos, profissionais e planos conectados em um só lugar. Sua
              academia no ritmo certo.
            </p>
            <div className="track">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <small>GESTÃO SIMPLES. EVOLUÇÃO CONSTANTE.</small>
        </section>
        <section className="login-form">
          <div className="login-box">
            <span className="eyebrow">BEM-VINDO AO STEAKUP</span>
            <h2>Vamos começar?</h2>
            <p>Acesse o painel da sua academia.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoginError("");
                setBusy(true);
                const data = new FormData(e.currentTarget);
                try {
                  await api("/auth/login", "POST", {
                    email: String(data.get("email")),
                    password: String(data.get("password")),
                  });
                  await refresh();
                } catch (error) {
                  setLoginError(
                    error instanceof Error
                      ? error.message
                      : "Não foi possível entrar.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {loginError && (
                <p role="alert" className="error login-error">
                  {loginError}
                </p>
              )}
              <label>
                E-mail
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="voce@academia.com"
                  autoComplete="username"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  name="password"
                  minLength={1}
                  required
                  placeholder="Sua senha"
                  autoComplete="current-password"
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Entrando..." : "Entrar"} <ArrowRight size={18} />
              </button>
            </form>
            <div className="demo-note">
              <Activity size={18} />
              <span>
                <strong>Seu espaço, com acesso individual</strong>
                Entre com a conta cadastrada pela administração. Sua área é
                aberta automaticamente conforme seu perfil.
              </span>
            </div>
          </div>
        </section>
      </div>
    );
  if (role !== "admin" && sessionPerson)
    return (
      <RoleAreas
        key={`${role}-${sessionPerson.id}`}
        role={role}
        person={sessionPerson}
        students={students}
        trainers={trainers}
        plans={plans}
        payments={payments}
        workouts={workouts}
        onRefresh={refresh}
        onLogout={logout}
      />
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#" onClick={() => navigate("Visão geral")}>
          <Activity /> SteakUp<span>gestão de academia</span>
        </a>
        <span className="nav-caption">ESPAÇO DE GESTÃO</span>
        <nav>
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={section === label ? "selected" : ""}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              {label}
              {section === label && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="version">
            <p>Acesso autenticado por perfil.</p>
          </div>
          <button className="user" onClick={logout}>
            <span className="avatar">AD</span>
            <span>
              <strong>Administrador</strong>
              <small>Sair da conta</small>
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
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div>
            Workspace <span>/</span> <strong>{section}</strong>
          </div>
          <span className="top-tag">
            <span className="live-dot" /> Sua academia, conectada
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {section === "Visão geral"
                  ? "SEU PAINEL, EM TEMPO REAL"
                  : "ORGANIZAÇÃO QUE GERA RESULTADOS"}
              </span>
              <h1>{pageTitle}</h1>
              <p>
                {section === "Visão geral"
                  ? "Acompanhe sua academia e cuide do que faz ela acontecer."
                  : `Gerencie ${section.toLowerCase()} com tudo em um só lugar.`}
              </p>
            </div>
            {section !== "Pagamentos" && (
              <button
                className="primary"
                onClick={() => {
                  if (section === "Visão geral") navigate("Alunos");
                  open();
                }}
              >
                <Plus size={18} />
                {section === "Planos"
                  ? "Novo plano"
                  : section === "Personal trainers"
                    ? "Novo personal"
                    : "Novo aluno"}
              </button>
            )}
          </div>
          {message && (
            <div className="notice" role="status">
              <Check size={18} />
              {message}
              <button
                aria-label="Fechar mensagem"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {section === "Visão geral" && (
            <>
              <div className="stats">
                {[
                  {
                    label: "Alunos cadastrados",
                    value: students.length,
                    detail: `${students.filter((s) => s.active).length} com cadastro ativo`,
                    icon: Users,
                  },
                  {
                    label: "Personal trainers",
                    value: trainers.filter((t) => t.active).length,
                    detail: "Profissionais ativos",
                    icon: Dumbbell,
                  },
                  {
                    label: "Planos disponíveis",
                    value: plans.filter((p) => p.active).length,
                    detail: "Possibilidades de evolução",
                    icon: Layers,
                  },
                ].map(({ label, value, detail, icon: Icon }) => (
                  <article className="stat" key={label}>
                    <div>
                      {label}
                      <Icon size={19} />
                    </div>
                    <strong>{String(value).padStart(2, "0")}</strong>
                    <small>{detail}</small>
                  </article>
                ))}
              </div>
              <section className="hero">
                <div>
                  <span className="eyebrow">GESTÃO NO RITMO CERTO</span>
                  <h2>
                    O próximo resultado
                    <br />
                    começa com você.
                  </h2>
                  <p>
                    Organize os cadastros, conecte seus alunos aos planos
                    <br className="desktop" /> e tenha mais tempo para
                    acompanhar cada evolução.
                  </p>
                  <button onClick={() => navigate("Alunos")}>
                    Gerenciar alunos <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <Activity size={135} strokeWidth={1} />
                  <span className="art-label">
                    EM CONSTANTE
                    <br />
                    <strong>MOVIMENTO</strong>
                  </span>
                </div>
              </section>
            </>
          )}
          {section === "Pagamentos" ? (
            <Suspense
              fallback={
                <div className="empty" role="status">
                  Carregando financeiro...
                </div>
              }
            >
              <FinancePanel
                admin
                students={students}
                payments={payments}
                onRefresh={refresh}
              />
            </Suspense>
          ) : section !== "Planos" ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {section === "Visão geral"
                      ? "Alunos da academia"
                      : section === "Personal trainers"
                        ? "Equipe de profissionais"
                        : "Todos os alunos"}{" "}
                    <span className="count">{visiblePeople.length}</span>
                  </h2>
                  <p>
                    {section === "Personal trainers"
                      ? "Quem acompanha cada evolução."
                      : "Pessoas que fazem parte do seu movimento."}
                  </p>
                </div>
                {section === "Visão geral" && (
                  <button
                    className="text-button"
                    onClick={() => navigate("Alunos")}
                  >
                    Ver todos <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <div className="table-tools">
                <div className="search">
                  <Search size={18} />
                  <input
                    aria-label="Buscar por nome ou e-mail"
                    placeholder="Buscar por nome ou e-mail..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filtrar situação"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>Todos</option>
                  <option>Ativos</option>
                  <option>Inativos</option>
                </select>
              </div>
              <div className="table-scroll" role="region" aria-label="Listagem de cadastros" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>
                        {section === "Personal trainers"
                          ? "PROFISSIONAL"
                          : "ALUNO"}
                      </th>
                      <th>
                        {section === "Personal trainers"
                          ? "CREF"
                          : "PLANO ATUAL"}
                      </th>
                      <th>CADASTRO</th>
                      {section !== "Personal trainers" && (
                        <th>SITUAÇÃO FINANCEIRA</th>
                      )}
                      <th className="right">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePeople.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="person">
                            <span className="avatar">{initials(p.name)}</span>
                            <div>
                              <strong>{p.name}</strong>
                              <small>{p.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {section === "Personal trainers" ? (
                            p.cref
                          ) : (
                            <span className="plan-tag">{p.plan}</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${p.active ? "" : "inactive"}`}
                          >
                            <span />
                            {p.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        {section !== "Personal trainers" && (
                          <td>
                            <span
                              className={`badge financial-badge ${financialStatusInfo[p.financialStatus || financialStatus(payments, p.id)].tone}`}
                            >
                              {
                                financialStatusInfo[
                                  p.financialStatus ||
                                    financialStatus(payments, p.id)
                                ].label
                              }
                            </span>
                          </td>
                        )}
                        <td>
                          <div className="actions">
                            <button
                              onClick={() => {
                                if (section === "Visão geral")
                                  setSection("Alunos");
                                open(p);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() =>
                                setAccess({
                                  person: p,
                                  kind:
                                    section === "Personal trainers"
                                      ? "trainers"
                                      : "students",
                                })
                              }
                            >
                              Acesso
                            </button>
                            <button onClick={() => toggle(p)}>
                              {p.active ? "Desativar" : "Reativar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visiblePeople.length && (
                  <div className="empty">
                    Nenhum cadastro encontrado. Tente outra busca ou crie um
                    novo cadastro.
                  </div>
                )}
              </div>
              <div className="panel-footer">
                {visiblePeople.length} cadastro(s) encontrado(s)
                <span>Histórico preservado por desativação</span>
              </div>
            </section>
          ) : (
            <div className="plan-grid">
              {plans.map((p) => (
                <article
                  className={`plan-card ${!p.active ? "disabled-plan" : ""}`}
                  key={p.id}
                >
                  <div className="plan-icon">
                    <Layers size={24} />
                  </div>
                  <span className={`badge ${p.active ? "" : "inactive"}`}>
                    {p.active ? "Disponível" : "Inativo"}
                  </span>
                  <h2>{p.name}</h2>
                  <p>Um plano para continuar evoluindo.</p>
                  <strong className="price">{money(p.price)}</strong>
                  <small>
                    por {p.months} {p.months === 1 ? "mês" : "meses"}
                  </small>
                  <hr />
                  <div className="plan-benefit">
                    <Check size={16} />
                    Vínculo individual por aluno
                  </div>
                  <div className="plan-benefit">
                    <Check size={16} />
                    Histórico de matrícula preservado
                  </div>
                  <div className="plan-buttons">
                    <button onClick={() => open(p)}>Editar plano</button>
                    <button onClick={() => toggle(p)}>
                      {p.active ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {section === "Visão geral" && (
            <div className="roadmap">
              <span className="roadmap-icon">
                <Wallet size={22} />
              </span>
              <div>
                <strong>Mais controle, a cada etapa.</strong>
                <p>
                  Alunos e personal trainers acessam suas áreas com contas
                  individuais. O registro administrativo de pagamentos será
                  desenvolvido na próxima etapa.
                </p>
              </div>
              <span className="outline-tag">EM BREVE</span>
            </div>
          )}
          <footer>
            SteakUp <span>·</span> Gestão que acompanha sua evolução.
            <span className="footer-right">
              React + TypeScript · Versão inicial
            </span>
          </footer>
        </div>
      </main>
      {access && (
        <AccountAccess
          key={access.person.id}
          person={access.person}
          kind={access.kind}
          onClose={() => setAccess(null)}
        />
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{section.toUpperCase()}</span>
                <h2 id="modal-title">
                  {editing
                    ? "Editar cadastro"
                    : section === "Planos"
                      ? "Novo plano"
                      : section === "Personal trainers"
                        ? "Novo personal"
                        : "Novo aluno"}
                </h2>
              </div>
              <button
                aria-label="Fechar formulário"
                onClick={() => setModal(false)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Nome
                <input
                  autoFocus
                  name="name"
                  required
                  defaultValue={editing?.name}
                  placeholder={
                    section === "Planos" ? "Nome do plano" : "Nome completo"
                  }
                />
              </label>
              {section === "Planos" ? (
                <div className="form-row">
                  <label>
                    Valor (R$)
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      defaultValue={
                        editing && "price" in editing ? editing.price : ""
                      }
                    />
                  </label>
                  <label>
                    Duração (meses)
                    <input
                      name="months"
                      type="number"
                      step="1"
                      min="1"
                      required
                      defaultValue={
                        editing && "months" in editing ? editing.months : 1
                      }
                    />
                  </label>
                </div>
              ) : (
                <>
                  <label>
                    E-mail
                    <input
                      name="email"
                      type="email"
                      required={!editing}
                      disabled={!!editing}
                      defaultValue={
                        editing && "email" in editing ? editing.email : ""
                      }
                      placeholder="nome@email.com"
                    />
                  </label>
                  {!editing && <RegistrationPasswords />}
                  {section === "Personal trainers" ? (
                    <label>
                      CREF
                      <input
                        name="cref"
                        required
                        defaultValue={
                          editing && "cref" in editing ? editing.cref : ""
                        }
                        placeholder="Número de registro profissional"
                      />
                    </label>
                  ) : (
                    <label>
                      Plano atual
                      <select
                        name="plan"
                        disabled={editing?.active === false}
                        defaultValue={
                          editing && "plan" in editing
                            ? editing.plan
                            : "Sem plano"
                        }
                      >
                        <option>Sem plano</option>
                        {plans
                          .filter(
                            (p) =>
                              p.active ||
                              (editing &&
                                "plan" in editing &&
                                p.name === editing.plan),
                          )
                          .map((p) => (
                            <option key={p.id}>{p.name}</option>
                          ))}
                      </select>
                      <small>
                        Ao trocar o plano, o vínculo anterior é substituído no
                        cadastro do aluno.
                      </small>
                    </label>
                  )}
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-buttons">
                <button type="button" onClick={() => setModal(false)}>
                  Cancelar
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  <Check size={17} />
                  Salvar cadastro
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
