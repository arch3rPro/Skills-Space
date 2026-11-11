import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const project = fileURLToPath(new URL("../..", import.meta.url));
const packageDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: project,
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    lib: { entry: `${packageDirectory}src/client.tsx`, formats: ["cjs"], fileName: () => "client.js" },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        exports: "named",
        inlineDynamicImports: true,
        banner: 'window.__ModuleLoader__.load({id:"dsh-skills-space",factory:(require)=>{const module={exports:{}};const exports=module.exports;',
        footer: "return module.exports;}});",
      },
    },
  },
});
