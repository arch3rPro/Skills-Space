import {FolderOpenIcon} from 'lucide-react';
import {Hint} from '@/components/hint';
import {displayHomePath} from '@/lib/upstream';
export function DirectoryLink({path,directory=path,current,home,zh,disabled,onOpen}:{path:string;directory?:string;current?:boolean;home:string;zh:boolean;disabled?:boolean;onOpen:(path:string)=>void}){
 const displayPath=displayHomePath(path,home);
 return <Hint text={displayPath} disabled={disabled}><button data-slot="directory-link" type="button" className="interactive-path inline-flex min-w-0 max-w-full items-center gap-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} aria-label={`${zh?'打开目录':'Open folder'} ${displayPath}`} aria-current={current ? "location" : undefined} onClick={()=>onOpen(directory)}><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true"/><span className="truncate">{displayPath}</span></button></Hint>;
}
