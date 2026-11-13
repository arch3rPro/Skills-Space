import { useSyncExternalStore } from "react";

const wideInventoryQuery = "(min-width: 1600px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(wideInventoryQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isWideInventory() {
  return window.matchMedia(wideInventoryQuery).matches;
}

export function useWideInventoryPageSize() {
  return useSyncExternalStore(subscribe, isWideInventory) ? 24 : 12;
}
