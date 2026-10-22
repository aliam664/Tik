import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/economy.css";
import "./styles/word-game.css";
import "./styles/code-breaker.css";
import "./styles/crash.css";
import "./styles/admin.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
