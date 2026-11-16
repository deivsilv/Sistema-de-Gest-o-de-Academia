import { useEffect, useRef, useState } from "react";
import { X, Check, KeyRound } from "lucide-react";
import type { AcademyPerson } from "./academy";
import RegistrationPasswords from "./RegistrationPasswords";
import { adminAccount } from "./api";
export default function AccountAccess({
  person,
  kind,
  onClose,
}: {
  person: AcademyPerson;
  kind: "students" | "trainers";
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [passwordKey, setPasswordKey] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    adminAccount({ action: "get", id: person.id, kind })
      .then((data) => {
        if (active) setEmail(String(data.email || ""));
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
  }, [person.id, kind]);
  async function submit(
    e: React.SubmitEvent<HTMLFormElement>,
    action: "email" | "password",
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError("");
    setNotice("");
    if (
      action === "password" &&
      data.get("password") !== data.get("confirmPassword")
    ) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await adminAccount({
        action,
        id: person.id,
        kind,
        ...(action === "email"
          ? { email: String(data.get("email")).trim() }
          : { password: String(data.get("password")) }),
      });
      setNotice(
        action === "email"
          ? "E-mail de acesso atualizado. Informe o novo endereço ao titular da conta."
          : "Senha redefinida. Entregue a nova senha ao titular por um canal privado.",
      );
      if (action === "password") setPasswordKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal portal-dialog account-access"
      aria-label="Gerenciar acesso"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">ACESSO INDIVIDUAL</span>
          <h2>{person.name}</h2>
        </div>
        <button
          aria-label="Fechar gerenciamento de acesso"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {loading ? (
        <p role="status">Carregando conta...</p>
      ) : (
        <>
          <p className="form-note">
            Alterações são aplicadas à conta de login. Confira a identidade do
            titular antes de modificar o e-mail ou a senha.
          </p>
          <form onSubmit={(e) => submit(e, "email")}>
            <label>
              E-mail de acesso
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="primary" disabled={busy || !email}>
              <Check size={16} />
              Salvar e-mail
            </button>
          </form>
          <hr className="access-divider" />
          <form onSubmit={(e) => submit(e, "password")}>
            <RegistrationPasswords key={passwordKey} label="Nova senha" />
            <button type="submit" className="primary" disabled={busy}>
              <KeyRound size={16} />
              Redefinir senha
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </dialog>
  );
}
