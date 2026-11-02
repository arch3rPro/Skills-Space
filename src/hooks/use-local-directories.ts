import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
export type LocalDirectory={path:string;directory:string};
export function useLocalDirectories(paths:Array<string|null|undefined>){
 const requested=[...new Set(paths.filter((path):path is string=>!!path))];
 const key=JSON.stringify(requested);
 const [observed,setObserved]=useState<{key:string;paths:LocalDirectory[]}>({key:'',paths:[]});
 useEffect(()=>{
  let active=true;
  if(requested.length)void invoke<LocalDirectory[]>('upstream_local_directories',{paths:requested}).then(paths=>{if(active)setObserved({key,paths});}).catch(()=>{if(active)setObserved({key,paths:[]});});
  return()=>{active=false;};
  // Equivalent path arrays do not require another metadata lookup.
 },[key]);
 return observed.key===key?observed.paths:[];
}
