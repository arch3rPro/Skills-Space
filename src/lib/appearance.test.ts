import assert from "node:assert/strict";
import test from "node:test";
import { applyAppearance, cachedAppearance, cacheAppearance, defaultAppearance, fontChoices, normalizeAppearance, themePresets } from "./appearance.ts";

test("old and malformed appearance values fall back to Codex without changing display-mode semantics", () => {
  assert.deepEqual(normalizeAppearance({ theme: "dark" }), { ...defaultAppearance, theme: "dark" });
  assert.deepEqual(normalizeAppearance({ colorTheme: "missing", fontFamily: "remote-font", fontSize: 999 }), defaultAppearance);
  assert.deepEqual(normalizeAppearance(null), defaultAppearance);
  assert.deepEqual(normalizeAppearance({ theme: "dark", colorTheme: "vercel", fontFamily: "geist", fontSize: 14 }), {
    theme: "dark", colorTheme: "vercel", fontFamily: "geist", fontSize: 14,
  }, "saved appearance choices survive the new defaults");
});

test("all nine palettes apply both modes and replace stale tokens while font settings remain independent", () => {
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const style = { colorScheme: "", fontSize: "", setProperty: (key: string, value: string) => properties.set(key,value), removeProperty: (key: string) => properties.delete(key) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { style, dataset, classList: { toggle: (key: string, on: boolean) => on ? classes.add(key) : classes.delete(key) } }, querySelector: () => null } });
  assert.equal(themePresets.length, 9);
  for (const preset of themePresets) for (const mode of ["light","dark"]) {
    applyAppearance({theme:mode,colorTheme:preset.id,fontFamily:"serif",fontSize:18},false);
    assert.equal(properties.get("--background"), mode === "dark" ? preset.dark.background : preset.light.background);
    assert.equal(dataset.colorTheme,preset.id);
    assert.equal(properties.has("--radius"), false, "geometry belongs to the shared design baseline");
    assert.equal(properties.has("--shadow-color"), false, "elevation belongs to the shared design baseline");
    assert.equal(classes.has("dark"),mode === "dark");
    assert.equal(style.colorScheme,mode);
    assert.equal(style.fontSize,"18px");
    assert.equal(properties.get("--app-font-sans"),fontChoices[2].family);
  }
  applyAppearance({...defaultAppearance,theme:"system"},true);
  assert.equal(classes.has("dark"),true);
  applyAppearance({...defaultAppearance,theme:"system"},false);
  assert.equal(classes.has("dark"),false);
  assert.equal(style.fontSize,"16px");
  Object.defineProperty(globalThis,"document",{configurable:true,value:undefined});
});

test("startup cache tolerates corruption and contains appearance only", () => {
  let saved = "{broken";
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}}});
  assert.deepEqual(cachedAppearance(),defaultAppearance);
  cacheAppearance({...defaultAppearance,colorTheme:"claude",fontFamily:"mono",fontSize:14});
  assert.deepEqual(cachedAppearance(),{...defaultAppearance,colorTheme:"claude",fontFamily:"mono",fontSize:14});
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(),["colorTheme","fontFamily","fontSize","theme"]);
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:undefined});
});
