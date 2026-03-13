import React from "react";
import ReactDOM from "react-dom/client";
import "@stash/theme/tailwind.css";
import "./style.css";
import { initTheme } from "@stash/theme";
import { browserStorageAdapter } from "../../lib/browser-storage-adapter.js";
import App from "./App";

initTheme(browserStorageAdapter);
ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
