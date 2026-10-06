import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { track } from "./lib/analytics";
import "./styles.css";

track("app_opened");

const root = document.getElementById("root");
if (!root) {
  throw new Error("root missing");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
