import type { AppearanceResponse } from "../api/types";

export type AppearancePalette = "classic" | "solar";
export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedAppearanceMode = "light" | "dark";

export interface AppearancePreference {
  palette: AppearancePalette;
  mode: AppearanceMode;
}

export interface EffectiveAppearance extends AppearancePreference {
  resolvedMode: ResolvedAppearanceMode;
}

export const APPEARANCE_STORAGE_KEY = "cagnard.appearance.v1";

export const DEFAULT_APPEARANCE_CONFIG: AppearanceResponse = {
  defaultPalette: "classic",
  defaultMode: "system",
  allowUserOverride: true
};

export function isAppearancePalette(value: unknown): value is AppearancePalette {
  return value === "classic" || value === "solar";
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === "light" || value === "dark" || value === "system";
}

export function normalizeAppearanceConfig(value: unknown): AppearanceResponse {
  if (!value || typeof value !== "object") return DEFAULT_APPEARANCE_CONFIG;
  const candidate = value as Partial<AppearanceResponse>;
  return {
    defaultPalette: isAppearancePalette(candidate.defaultPalette) ? candidate.defaultPalette : "classic",
    defaultMode: isAppearanceMode(candidate.defaultMode) ? candidate.defaultMode : "system",
    allowUserOverride: typeof candidate.allowUserOverride === "boolean" ? candidate.allowUserOverride : true
  };
}

export function readAppearancePreference(storage?: Pick<Storage, "getItem" | "removeItem">): AppearancePreference | undefined {
  if (!storage) return undefined;
  const stored = storage.getItem(APPEARANCE_STORAGE_KEY);
  if (!stored) return undefined;

  try {
    const candidate = JSON.parse(stored) as Partial<AppearancePreference>;
    if (isAppearancePalette(candidate.palette) && isAppearanceMode(candidate.mode)) {
      return { palette: candidate.palette, mode: candidate.mode };
    }
  } catch {
    // Invalid cosmetic state falls through to the configured defaults.
  }
  storage.removeItem(APPEARANCE_STORAGE_KEY);
  return undefined;
}

export function writeAppearancePreference(storage: Pick<Storage, "setItem"> | undefined, preference: AppearancePreference) {
  storage?.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preference));
}

export function resolveAppearance(
  config: AppearanceResponse,
  preference: AppearancePreference | undefined,
  systemDark: boolean
): EffectiveAppearance {
  const selected = config.allowUserOverride && preference
    ? preference
    : { palette: config.defaultPalette, mode: config.defaultMode };
  return {
    ...selected,
    resolvedMode: selected.mode === "system" ? (systemDark ? "dark" : "light") : selected.mode
  };
}

export function applyDocumentAppearance(appearance: EffectiveAppearance, root: HTMLElement = document.documentElement) {
  root.dataset.palette = appearance.palette;
  root.dataset.mode = appearance.resolvedMode;
  root.style.colorScheme = appearance.resolvedMode;
}

export function observeSystemAppearance(
  media: Pick<MediaQueryList, "addEventListener" | "removeEventListener">,
  onChange: (dark: boolean) => void
) {
  const handleChange = (event: MediaQueryListEvent) => onChange(event.matches);
  media.addEventListener("change", handleChange);
  return () => media.removeEventListener("change", handleChange);
}
