import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { cagnardApi } from "./api/client";
import { AppearanceProvider } from "./appearance/AppearanceProvider";
import {
  applyDocumentAppearance,
  DEFAULT_APPEARANCE_CONFIG,
  normalizeAppearanceConfig,
  readAppearancePreference,
  resolveAppearance
} from "./appearance/appearance";
import "./styles/app.css";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const storedPreference = readAppearancePreference(window.localStorage);
applyDocumentAppearance(resolveAppearance(DEFAULT_APPEARANCE_CONFIG, storedPreference, media.matches));

async function start() {
  let appearanceConfig = DEFAULT_APPEARANCE_CONFIG;
  try {
    appearanceConfig = normalizeAppearanceConfig(await cagnardApi.appearance());
  } catch {
    // An older or unavailable backend must not prevent the login shell from loading.
  }
  applyDocumentAppearance(resolveAppearance(appearanceConfig, storedPreference, media.matches));

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppearanceProvider config={appearanceConfig}>
        <App />
      </AppearanceProvider>
    </React.StrictMode>
  );
}

void start();
