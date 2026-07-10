import { ChevronDown, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppearance } from "../appearance/AppearanceProvider";
import type { AppearanceMode, AppearancePalette } from "../appearance/appearance";

const palettes: Array<{ id: AppearancePalette; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "solar", label: "Solar" }
];

const modes: Array<{ id: AppearanceMode; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon }
];

export function AppearanceSelector({ compact = false }: { compact?: boolean }) {
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!appearance.config.allowUserOverride) return null;

  return (
    <div className={compact ? "appearance-control compact" : "appearance-control"} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="appearance-trigger"
        onClick={() => setOpen((current) => !current)}
        title="Appearance"
        type="button"
      >
        <Palette size={17} />
        <span className="appearance-trigger-label">{capitalize(appearance.palette)}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>

      {open ? (
        <div aria-label="Appearance" className="appearance-popover" role="dialog">
          <fieldset className="appearance-fieldset">
            <legend>Palette</legend>
            <div className="palette-options">
              {palettes.map((palette) => (
                <button
                  aria-pressed={appearance.palette === palette.id}
                  className={appearance.palette === palette.id ? "palette-option active" : "palette-option"}
                  key={palette.id}
                  onClick={() => appearance.setPalette(palette.id)}
                  type="button"
                >
                  <span aria-hidden="true" className={`palette-swatch ${palette.id}`} />
                  <span>{palette.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="appearance-fieldset">
            <legend>Mode</legend>
            <div aria-label="Color mode" className="mode-options" role="group">
              {modes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    aria-label={mode.label}
                    aria-pressed={appearance.mode === mode.id}
                    className={appearance.mode === mode.id ? "mode-option active" : "mode-option"}
                    key={mode.id}
                    onClick={() => appearance.setMode(mode.id)}
                    title={mode.label}
                    type="button"
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
