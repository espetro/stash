import React from "react";
import ReactDOM from "react-dom/client";
import "@tab-mail/theme/tailwind.css";
import "./style.css";
import { initTheme } from "@tab-mail/theme";
import App from "./App";

initTheme();
ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
