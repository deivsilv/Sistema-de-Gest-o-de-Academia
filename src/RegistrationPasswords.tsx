import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  label: string;
  hint?: string;
  error?: string;
};
function PasswordInput({ label, hint, error, ...props }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          ref={(input) => {
            if (input) input.setCustomValidity(error || "");
          }}
        />
        <button
          type="button"
          aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <p className="password-error" id={`${id}-error`} role="status">
          {error}
        </p>
      )}
    </div>
  );
}

export default function RegistrationPasswords({
  label = "Senha inicial",
}: {
  label?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const mismatch = confirmation.length > 0 && confirmation !== password;
  return (
    <>
      <PasswordInput
        name="password"
        label={label}
        required
        minLength={10}
        maxLength={72}
        autoComplete="new-password"
        placeholder="Pelo menos 10 caracteres"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="Entregue a senha ao titular da conta por um canal privado."
      />
      <PasswordInput
        name="confirmPassword"
        label="Confirmar senha"
        required
        minLength={10}
        maxLength={72}
        autoComplete="new-password"
        placeholder="Digite a mesma senha novamente"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        error={mismatch ? "As senhas não coincidem." : undefined}
      />
    </>
  );
}
