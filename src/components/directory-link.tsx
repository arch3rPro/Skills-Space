import {FolderOpenIcon} from 'lucide-react';
import {Hint} from '@/components/hint';
import {displayHomePath} from '@/lib/upstream';
export function DirectoryLink({path,directory=path,home,zh,disabled,onOpen}:{path:string;directory?:string;home:string;zh:boolean;disabled?:boolean;onOpen:(path:string)=>void}){
 const label=displayHomePath(path,home);
 return <Hint text={label} disabled={disabled}><button type="button" className="interactive-path inline-flex min-w-0 max-w-full items-center gap-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} aria-label={`${zh?'打开目录':'Open folder'} ${directory}`} onClick={()=>onOpen(directory)}><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true"/><span className="truncate">{label}</span></button></Hint>;
}
