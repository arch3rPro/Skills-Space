// Invoke the original installed DSH CLI, not a replacement package installer.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installedRuntime } from './dsh-configuration.mjs';
const [home,installation,profile,source]=process.argv.slice(2);
const runtime=await installedRuntime(home,installation);
if(!runtime.anchor)throw Error('Original DSH CLI unavailable');
const entry=createRequire(runtime.anchor).resolve('@deepseek-ai/dsh/lib/bin.js');
const {runCli}=await import(pathToFileURL(entry).href);
process.argv=[process.execPath,entry,'plugin','--profile',profile,'add',`file:${source}`,'--ignore-scripts'];
let packageManager;
if(process.versions.electron){
  const support=join(dirname(process.execPath),'../Resources/runtime');
  packageManager={command:process.execPath,args:['--expose-internals',join(support,'primary-runtime/dependencies/pnpm/bin/pnpm.mjs')],env:{ELECTRON_RUN_AS_NODE:'1',DSH_DESKTOP_NODE_EXECUTABLE:process.execPath,PATH:`${join(support,'bin')}:${process.env.PATH??''}`}};
}
await runCli({manageDesktopProfile:true,packageManager});
