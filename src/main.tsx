import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PwaShell from "./PwaShell";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PwaShell><App /></PwaShell>
  </StrictMode>,
);
