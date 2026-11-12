import {FolderOpenIcon} from 'lucide-react';
import {Hint} from '@/components/hint';
import {displayHomePath} from '@/lib/upstream';
export function DirectoryLink({path,directory=path,current,home,zh,disabled,fitContent=false,onOpen}:{path:string;directory?:string;current?:boolean;home:string;zh:boolean;disabled?:boolean;fitContent?:boolean;onOpen:(path:string)=>void}){
 const displayPath=displayHomePath(path,home);
 return <Hint text={displayPath} disabled={disabled}><button data-slot="directory-link" type="button" className={`interactive-path inline-flex items-center gap-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50 ${fitContent ? 'w-max max-w-[min(28rem,calc(100vw-3rem))] shrink-0' : 'min-w-0 max-w-full'}`} disabled={disabled} aria-label={`${zh?'打开目录':'Open folder'} ${displayPath}`} aria-current={current ? "location" : undefined} onClick={()=>onOpen(directory)}><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true"/><span className="min-w-0 truncate">{displayPath}</span></button></Hint>;
}
