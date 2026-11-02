import assert from 'node:assert/strict';
import {join} from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Render the installed components together: both Radix primitives own data-state.
test('stable Hint keeps tooltip state separate from the Switch checked state',async()=>{
 const work=await mkdtemp(join(tmpdir(),'skills-space-hint-switch-'));
 try{
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  const outfile=join(work,'components.mjs');
  await build({stdin:{contents:`
   import React from 'react';
   import {renderToStaticMarkup} from 'react-dom/server';
   import {Hint} from '@/components/hint';
   import {Switch} from '@/components/ui/switch';
   import {TooltipProvider} from '@/components/ui/tooltip';
   export function render(checked,stable,disabled=false){
    return renderToStaticMarkup(<TooltipProvider><Hint stable={stable} disabled={disabled} text={checked?'Show':'Hide'}><Switch checked={checked} disabled={disabled}/></Hint></TooltipProvider>);
   }`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',outfile,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
  const {render}=await import(pathToFileURL(outfile));
  for(const checked of [false,true]){
   const originalButton=render(checked,false).match(/<button[^>]*role="switch"[^>]*>/)?.[0];
   assert.match(originalButton,/data-state="closed"/,'direct TooltipTrigger injection reproduces the original state collision');
   for(const disabled of [false,true]){
    const markup=render(checked,true,disabled);
    const button=markup.match(/<button[^>]*role="switch"[^>]*>/)?.[0];
    assert.match(markup,/<span[^>]*data-state="closed"[^>]*data-slot="tooltip-trigger"/,'tooltip state stays on its wrapper');
    assert.match(button,new RegExp(`aria-checked="${checked}"`));
    assert.match(button,new RegExp(`data-state="${checked?'checked':'unchecked'}"`),'Switch retains the state used by its track color classes');
    assert.match(button,/data-slot="switch"/);
    if(disabled)assert.match(markup,/<span[^>]*tabindex="0"[^>]*data-hint-disabled=""/,'disabled hint remains keyboard reachable');
   }
  }
 }finally{await rm(work,{recursive:true,force:true});}
});
