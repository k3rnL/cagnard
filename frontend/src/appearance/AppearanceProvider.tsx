import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { AppearanceResponse } from "../api/types";
import {
  applyDocumentAppearance,
  type AppearanceMode,
  type AppearancePalette,
  type AppearancePreference,
  observeSystemAppearance,
  readAppearancePreference,
  resolveAppearance,
  writeAppearancePreference
} from "./appearance";

interface AppearanceContextValue {
  config: AppearanceResponse;
  palette: AppearancePalette;
  mode: AppearanceMode;
  resolvedMode: "light" | "dark";
  setPalette: (palette: AppearancePalette) => void;
  setMode: (mode: AppearanceMode) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

export function AppearanceProvider({ config, children }: { config: AppearanceResponse; children: ReactNode }) {
  const [preference, setPreference] = useState<AppearancePreference | undefined>(() =>
    config.allowUserOverride ? readAppearancePreference(window.localStorage) : undefined
  );
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const effective = useMemo(
    () => resolveAppearance(config, preference, systemDark),
    [config, preference, systemDark]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    return observeSystemAppearance(media, setSystemDark);
  }, []);

  useEffect(() => {
    applyDocumentAppearance(effective);
  }, [effective]);

  const updatePreference = useCallback((next: AppearancePreference) => {
    if (!config.allowUserOverride) return;
    setPreference(next);
    writeAppearancePreference(window.localStorage, next);
  }, [config.allowUserOverride]);

  const setPalette = useCallback((palette: AppearancePalette) => {
    updatePreference({ palette, mode: effective.mode });
  }, [effective.mode, updatePreference]);

  const setMode = useCallback((mode: AppearanceMode) => {
    updatePreference({ palette: effective.palette, mode });
  }, [effective.palette, updatePreference]);

  const value = useMemo<AppearanceContextValue>(() => ({
    config,
    palette: effective.palette,
    mode: effective.mode,
    resolvedMode: effective.resolvedMode,
    setPalette,
    setMode
  }), [config, effective, setMode, setPalette]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used inside AppearanceProvider");
  return context;
}
