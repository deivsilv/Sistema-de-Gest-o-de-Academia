import { useEffect, useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import "./PixPayment.css";
import { pixPayload } from "./pix";
const exampleKey = "8d72f4a1-6b3c-4e90-a125-9f08c7d63b42";
const key = import.meta.env.VITE_PIX_KEY || exampleKey;
const demo = key === exampleKey || import.meta.env.VITE_PIX_DEMO !== "false";
export default function PixPayment() {
  const [showQr, setShowQr] = useState(false);
  const [qrImage, setQrImage] = useState("");
  const [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let active = true;
    if (showQr && !qrImage) {
      try {
        const payload = pixPayload(
          key,
          import.meta.env.VITE_PIX_RECEIVER_NAME || "ACADEMIA TESTE",
          import.meta.env.VITE_PIX_RECEIVER_CITY || "TESTE",
        );
        import("qrcode")
          .then((qr) =>
            qr.toDataURL(payload, {
              width: 280,
              margin: 4,
              errorCorrectionLevel: "M",
              color: { dark: "#000000", light: "#ffffff" },
            }),
          )
          .then((url) => {
            if (active) setQrImage(url);
          })
          .catch(() => {
            if (active)
              setError("Não foi possível gerar o QR Code. Use a chave Pix.");
          });
      } catch {
        setError("Confira os dados da chave Pix.");
      }
    }
    return () => {
      active = false;
    };
  }, [showQr, qrImage]);
  async function copy() {
    setError("");
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Clipboard } = await import("@capacitor/clipboard");
        await Clipboard.write({ string: key });
      } else {
        await navigator.clipboard.writeText(key);
      }
      setNotice("Chave Pix copiada.");
    } catch {
      setError(
        "Não foi possível copiar automaticamente. Selecione a chave e copie manualmente.",
      );
    }
  }
  return (
    <section className="pix-payment" aria-labelledby="pix-title">
      <div className="pix-heading">
        <div>
          <span className="eyebrow">
            1. PAGAMENTO · 2. COMPROVANTE · 3. ANÁLISE
          </span>
          <h2 id="pix-title">Pague com Pix</h2>
          <p>
            Copie a chave ou escaneie o QR Code no aplicativo do seu banco.
            Depois, envie o comprovante para análise.
          </p>
        </div>
      </div>
      {demo && (
        <div className="pix-demo">
          <strong>Demonstração — chave fictícia</strong>
          <span>
            Use apenas para testar a interface. Esta chave não foi registrada
            para receber pagamentos reais.
          </span>
        </div>
      )}
      <div className="pix-key">
        <label htmlFor="pix-key">
          Chave Pix {demo ? "de demonstração" : "da academia"}
        </label>
        <input
          id="pix-key"
          readOnly
          value={key}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <div className="pix-buttons">
        <button type="button" className="primary" onClick={copy}>
          <Copy size={16} />
          Copiar chave Pix
        </button>
        <button
          type="button"
          className="pix-secondary"
          aria-expanded={showQr}
          aria-controls="pix-qr-panel"
          onClick={() => setShowQr(!showQr)}
        >
          <QrCode size={16} />
          {showQr ? "Ocultar QR Code" : "Mostrar QR Code"}
        </button>
      </div>
      {showQr && (
        <div id="pix-qr-panel" className="pix-expanded">
          <figure className="pix-qr">
            {qrImage ? (
              <img
                src={qrImage}
                width={280}
                height={280}
                alt={
                  demo
                    ? "QR Code Pix de demonstração, chave fictícia"
                    : "QR Code Pix da academia"
                }
              />
            ) : (
              <div className="pix-loading" role="status">
                {error ? "QR Code indisponível." : "Gerando QR Code..."}
              </div>
            )}
            <figcaption>
              {demo
                ? "QR Code de demonstração"
                : "Escaneie no aplicativo do seu banco"}
            </figcaption>
          </figure>
          <div className="pix-instructions">
            <p>
              Informe no banco o valor combinado com a administração. Depois,
              envie o comprovante pelo formulário abaixo.
            </p>
          </div>
        </div>
      )}
      {notice && (
        <p className="pix-feedback" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
