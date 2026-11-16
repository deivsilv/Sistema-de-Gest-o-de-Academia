import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import "./PwaShell.css";
import { Capacitor } from "@capacitor/core";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
function standaloneMode() {
  return Capacitor.isNativePlatform() || window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function PwaShell({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [installed, setInstalled] = useState(standaloneMode);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const help = useRef<HTMLDialogElement>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const installedApp = () => { setInstalled(true); setInstallEvent(null); };
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const displayMode = () => setInstalled(standaloneMode());
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installedApp);
    media.addEventListener("change", displayMode);
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installedApp);
      media.removeEventListener("change", displayMode);
    };
  }, []);

  useEffect(() => {
    // O worker é gerado no build; não interfere no Vite/HMR durante desenvolvimento.
    if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanup: (() => void)[] = [];
    const controllerChanged = () => {
      if (updateRequested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((next) => {
        if (cancelled) return;
        registration = next;
        if (next.waiting) setUpdate(next);
        const found = () => {
          const worker = next.installing;
          if (!worker) return;
          const changed = () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdate(next);
          };
          worker.addEventListener("statechange", changed);
          cleanup.push(() => worker.removeEventListener("statechange", changed));
        };
        next.addEventListener("updatefound", found);
        cleanup.push(() => next.removeEventListener("updatefound", found));
        found();
      }).catch(() => {
        // A navegação online continua disponível se o navegador negar o registro.
      });
    const check = () => {
      if (navigator.onLine && document.visibilityState === "visible") void registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      cleanup.forEach((remove) => remove());
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);

  useEffect(() => {
    if (helpOpen) help.current?.showModal();
    else help.current?.close();
  }, [helpOpen]);

  async function install() {
    if (!installEvent) { setHelpOpen(true); return; }
    setInstallBusy(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch { setHelpOpen(true); }
    finally { setInstallEvent(null); setInstallBusy(false); }
  }

  return <>
    {online ? children : <main className="pwa-offline">
      <WifiOff size={36} aria-hidden="true" />
      <h1>Vamos reconectar?</h1>
      <p>O SteakUp precisa de internet para consultar treinos, conferir pagamentos e enviar comprovantes.</p>
      <p>Verifique sua conexão. Ao reconectar, sua situação será consultada novamente.</p>
      <button className="primary" onClick={() => window.location.reload()}>Tentar novamente</button>
    </main>}
    {online && (!installed || update) && <aside className="pwa-controls" aria-label="Aplicativo SteakUp">
      {update && <div className="pwa-update" role="status">
        <strong>Nova versão disponível</strong>
        <p>Salve o que estiver preenchendo antes de atualizar.</p>
        {updateError && <p role="alert">{updateError}</p>}
        <button disabled={updateBusy} onClick={() => {
          if (!update.waiting) { setUpdate(null); return; }
          setUpdateBusy(true);
          setUpdateError("");
          updateRequested.current = true;
          update.waiting.postMessage({ type: "SKIP_WAITING" });
          window.setTimeout(() => {
            updateRequested.current = false;
            setUpdateBusy(false);
            setUpdateError("Não foi possível concluir. Tente atualizar novamente.");
          }, 10000);
        }}><RefreshCw size={16} />{updateBusy ? "Atualizando..." : "Atualizar agora"}</button>
      </div>}
      {!installed && <button className="pwa-install" disabled={installBusy} onClick={() => void install()}>
        <Download size={17} />{installBusy ? "Abrindo instalação..." : "Instalar SteakUp"}
      </button>}
    </aside>}
    <dialog ref={help} className="modal pwa-help" onCancel={() => setHelpOpen(false)}>
      <div className="modal-heading"><h2>SteakUp no seu celular</h2><button autoFocus aria-label="Fechar orientação" onClick={() => setHelpOpen(false)}><X /></button></div>
      <p><strong>Android:</strong> abra o link no Chrome e procure “Instalar aplicativo” ou “Adicionar à tela inicial” no menu.</p>
      <p><strong>iPhone:</strong> abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
      <p><strong>Computador:</strong> procure a opção de instalar na barra de endereço ou no menu do navegador, quando disponível.</p>
      <p className="form-note">Se você abriu o link dentro de outro aplicativo, abra-o no navegador do celular. Login, treinos e pagamentos precisam de internet.</p>
      <div className="modal-buttons"><button className="primary" onClick={() => setHelpOpen(false)}>Entendi</button></div>
    </dialog>
  </>;
}
