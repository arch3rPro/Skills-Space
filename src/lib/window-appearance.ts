import { invoke, isTauri } from "@tauri-apps/api/core";

// Let the browser resolve the palette's CSS color space to native sRGB bytes.
export async function syncWindowAppearance(mode: string): Promise<void> {
  if (!isTauri()) return;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--sidebar").trim();
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  await invoke("upstream_window_appearance", {
    background: [red, green, blue],
    followSystem: mode === "system",
    dark: document.documentElement.classList.contains("dark"),
  });
}
