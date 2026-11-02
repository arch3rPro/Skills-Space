import presets from "./theme-presets.json" with { type: "json" };

export const themePresets = presets;
export const fontChoices = [
  { id: "geist", label: "Geist", family: "'Geist Variable', 'PingFang SC', system-ui, sans-serif" },
  { id: "system", label: "System", family: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', sans-serif" },
  { id: "serif", label: "Serif", family: "Georgia, 'Songti SC', 'Noto Serif CJK SC', serif" },
  { id: "mono", label: "Monospace", family: "ui-monospace, 'SFMono-Regular', Menlo, 'PingFang SC', monospace" },
];
export type Appearance = { theme: string; colorTheme: string; fontFamily: string; fontSize: number };
export const defaultAppearance: Appearance = { theme: "system", colorTheme: "codex", fontFamily: "system", fontSize: 16 };
const variableNames = [...new Set(presets.flatMap(p => [...Object.keys(p.light), ...Object.keys(p.dark)]))];
const cacheKey = "skills-space-appearance-v1";

export function normalizeAppearance(input: unknown): Appearance {
  if (!input || typeof input !== "object") return { ...defaultAppearance };
  const value: Record<string, unknown> = Object.fromEntries(Object.entries(input));
  return {
    theme: typeof value.theme === "string" && ["system", "light", "dark"].includes(value.theme) ? value.theme : "system",
    colorTheme: typeof value.colorTheme === "string" && presets.some(p => p.id === value.colorTheme) ? value.colorTheme : defaultAppearance.colorTheme,
    fontFamily: typeof value.fontFamily === "string" && fontChoices.some(p => p.id === value.fontFamily) ? value.fontFamily : defaultAppearance.fontFamily,
    fontSize: typeof value.fontSize === "number" && [14, 16, 18].includes(value.fontSize) ? value.fontSize : 16,
  };
}

export function cachedAppearance(): Appearance {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(cacheKey) ?? "null")); }
  catch { return { ...defaultAppearance }; }
}

export function applyAppearance(input: Appearance, darkSystem: boolean): void {
  const appearance = normalizeAppearance(input);
  const dark = appearance.theme === "dark" || appearance.theme === "system" && darkSystem;
  const root = document.documentElement;
  const preset = presets.find(p => p.id === appearance.colorTheme) ?? presets[0];
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(dark ? preset.dark : preset.light)) if (typeof value === "string" && key !== "radius" && !key.startsWith("shadow-")) variables[key] = value;
  for (const key of variableNames) root.style.removeProperty(`--${key}`);
  for (const [key, value] of Object.entries(variables)) root.style.setProperty(`--${key}`, value);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.colorTheme = appearance.colorTheme;
  root.style.setProperty("--app-font-sans", (fontChoices.find(f => f.id === appearance.fontFamily) ?? fontChoices[0]).family);
  root.style.fontSize = `${appearance.fontSize}px`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", variables.background);
}

export function cacheAppearance(appearance: Appearance): void {
  try { localStorage.setItem(cacheKey, JSON.stringify(normalizeAppearance(appearance))); } catch { /* Native preferences remain authoritative. */ }
}
