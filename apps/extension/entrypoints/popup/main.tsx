import React from "react";
import ReactDOM from "react-dom/client";
import "@stash/theme/tailwind.css";
import "./style.css";
import { initTheme } from "@stash/theme";
import App from "./App";

initTheme();
ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
