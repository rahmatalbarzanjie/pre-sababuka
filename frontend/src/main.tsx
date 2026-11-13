import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import "./styles.css";
import "./ui-system.css";
import "./vitality.css";
import "./responsive.css";
import { initializeTheme } from "./theme";

initializeTheme();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
