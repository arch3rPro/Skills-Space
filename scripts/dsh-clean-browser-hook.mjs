import { createRequire } from "node:module";import{pathToFileURL,fileURLToPath}from"node:url";import{dirname,resolve,join}from"node:path";import{spawn}from"node:child_process";import{openSync,closeSync,writeFileSync}from"node:fs";
const base=resolve(dirname(fileURLToPath(import.meta.url)),"../.scratch/dsh-clean-test"),require=createRequire("/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json");
const {internals}=await import(pathToFileURL(require.resolve("@deepseek-ai/dsh-web-app")));
const log=console.log;console.log=(...args)=>{if(typeof args[0]==="string"&&args[0].startsWith("dsh web:")&&args[0].includes("token="))return log("Clean Web authenticated entry opened through official browser flow");log(...args);};
const openDefaultBrowser=internals.openBrowser;
internals.openBrowser=async url=>{
  await openDefaultBrowser(url);
  if(process.env.DSH_CLEAN_BROWSER_DIAGNOSTICS!=="1")return;
  const fd=openSync(join(base,"diagnostic-browser.log"),"a");
  const child=spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",["--headless=new","--disable-gpu","--no-first-run","--disable-background-networking","--window-size=1440,960","--remote-debugging-address=127.0.0.1","--remote-debugging-port=64592","--user-data-dir="+join(base,"diagnostic-browser"),url],{stdio:["ignore",fd,fd]});
  closeSync(fd);writeFileSync(join(base,"diagnostic-browser.pid"),String(child.pid));
};
