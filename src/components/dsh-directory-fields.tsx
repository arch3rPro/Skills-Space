import { useEffect, useId, useState, type Dispatch, type SetStateAction } from 'react';
import { CheckIcon, FolderOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { HelpPopover } from '@/components/help-popover';
import { Hint } from '@/components/hint';
import { OverflowText } from '@/components/overflow-text';
import { DirectoryLink } from '@/components/directory-link';
import { Modal, ModalActions } from '@/components/modal';
import { useFeedbackError } from '@/lib/notifications';
import { displayHomePath, expandHomePath } from '@/lib/upstream';
import { dshSkillsPath, dshHomeFromSkillsPath, type DshConfiguration } from '@/lib/dsh';

type DirectoryRow=Pick<DshConfiguration,'editable'|'readOnlyFields'|'unresolvedFields'|'additionalDirectoryLayout'>;
type Props={
  home:string;zh:boolean;disabled:boolean;row:DirectoryRow;
  defaults:{dshHome:string;agentsHome:string};
  roots:{path:string;exists:boolean;source?:string}[];
  includeDefaults:boolean;setIncludeDefaults:(value:boolean)=>void;
  extra:{dshHome:string;agentsHome:string};onHomeChange:(key:'dshHome'|'agentsHome',home:string)=>void;
  directories:(string|null)[];setDirectories:Dispatch<SetStateAction<(string|null)[]>>;
  onPendingChange:(pending:boolean)=>void;
  onChooseDirectory?:()=>Promise<string|null>;onOpenDirectory?:(path:string)=>Promise<void>;
};

// One directory editor for the desktop settings page and its DSH companion.
export function DshDirectoryFields({home,zh,disabled:locked,row,defaults,roots,includeDefaults,setIncludeDefaults,extra,onHomeChange,directories,setDirectories,onPendingChange,onChooseDirectory,onOpenDirectory}:Props){
  const t=(cn:string,en:string)=>zh?cn:en;
  const id=useId();
  const [,setError]=useFeedbackError(zh);
  const [editingRoot,setEditingRoot]=useState<'dshHome'|'agentsHome'|null>(null);
  const [rootDraft,setRootDraft]=useState('');
  const [resetRoot,setResetRoot]=useState(false);
  const [editingDirectory,setEditingDirectory]=useState<number|null>(null);
  const [addingDirectory,setAddingDirectory]=useState(false);
  const [directoryDraft,setDirectoryDraft]=useState('');
  const pending=addingDirectory&&!!directoryDraft.trim();
  useEffect(()=>{onPendingChange(pending);return()=>onPendingChange(false);},[pending,onPendingChange]);
  const snapshot={dshHome:defaults.dshHome,sharedHome:defaults.agentsHome,roots};
  const layout=row.additionalDirectoryLayout;
  const additionalUnresolved=!!row.unresolvedFields?.includes('customSkillDirs')&&!layout;
  const fieldLocked=(item:DirectoryRow,key:string)=>locked||!item.editable||(key==='customSkillDirs'?additionalUnresolved:!!item.unresolvedFields?.includes(key))||!!item.readOnlyFields?.includes(key);
  const fieldReason=(key:string)=>row.readOnlyFields?.includes(key)?t('当前 DSH 安装无法验证此设置的写入接口，只读。','The write interface for this setting could not be verified in this installation; read-only.'):null;
  const defaultLocations=([{key:'dshHome',label:t('用户技能目录','User skill directory'),fallback:defaults.dshHome},{key:'agentsHome',label:t('共享技能目录','Shared skill directory'),fallback:defaults.agentsHome}] as const).map(location=>({...location,path:dshSkillsPath(expandHomePath(extra[location.key]||location.fallback||home,home))}));
  const rootExpanded=expandHomePath(rootDraft.trim(),home);
  const rootInvalid=(!rootExpanded.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(rootExpanded))||dshHomeFromSkillsPath(rootExpanded)===null;
  const visibleDirectories=directories.flatMap((path,index)=>path===null?[]:[{path,index}]);
  const directoryErrors=directories.map(path=>{
    if(path===null)return false;
    const absolute=expandHomePath(path.trim(),home);
    return !absolute.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(absolute);
  });
  const draftPath=expandHomePath(directoryDraft.trim(),home);
  const draftInvalid=!!draftPath&&!draftPath.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(draftPath);
  const chooseDirectory=async()=>onChooseDirectory?onChooseDirectory():null;
  async function addDirectory(){const path=await chooseDirectory();if(typeof path==='string')setDirectoryDraft(displayHomePath(path,home));}
  async function openDirectory(path:string){try{await onOpenDirectory?.(path);}catch(reason){setError(String(reason),t('目录无法打开','Could not open folder'));}}
  return <><FieldGroup className="settings-fields">
            <Field orientation="horizontal" data-disabled={fieldLocked(row,'includeDefaultRoots')}><FieldContent><div className="flex items-center gap-1">{row.unresolvedFields?.includes('includeDefaultRoots')?<FieldTitle>{t('使用默认技能目录','Use default skill directories')}</FieldTitle>:<FieldLabel htmlFor={`${id}-defaults`}>{t('使用默认技能目录','Use default skill directories')}</FieldLabel>}<HelpPopover label={t('默认技能目录范围','Default skill directory scope')}><p>{t('包括下方用户目录，以及项目根目录中的 .dsh/skills 和 .agents/skills。关闭后附加目录仍保留。','Includes the user directories below and .dsh/skills and .agents/skills under the project root. Additional directories remain available when disabled.')}</p></HelpPopover></div>{fieldReason('includeDefaultRoots')&&<FieldDescription>{fieldReason('includeDefaultRoots')}</FieldDescription>}</FieldContent>{row.unresolvedFields?.includes('includeDefaultRoots')?<span className="text-sm text-muted-foreground">{t('由配置表达式决定','Determined by a configuration expression')}</span>:<Switch id={`${id}-defaults`} disabled={fieldLocked(row,'includeDefaultRoots')} checked={includeDefaults} onCheckedChange={setIncludeDefaults}/>}</Field>
            {(includeDefaults||row.unresolvedFields?.includes('includeDefaultRoots'))&&<FieldGroup className="gap-2">{defaultLocations.map(location=><Field orientation="horizontal" key={location.key} data-disabled={fieldLocked(row,location.key)}><FieldContent>{row.unresolvedFields?.includes(location.key)?<FieldDescription>{location.label} · {t('由配置表达式决定','Determined by a configuration expression')}</FieldDescription>:<DirectoryLink path={location.path} home={home} zh={zh} disabled={locked||!onOpenDirectory||!snapshot.roots.some(root=>root.path===location.path&&root.exists)} onOpen={path=>void openDirectory(path)}/>}{fieldReason(location.key)&&<FieldDescription>{fieldReason(location.key)}</FieldDescription>}</FieldContent><Button variant="ghost" size="sm" disabled={fieldLocked(row,location.key)} aria-label={`${t('修改','Edit')} ${displayHomePath(location.path,home)}`} onClick={()=>{setEditingRoot(location.key);setResetRoot(false);setRootDraft(displayHomePath(location.path,home));}}><PencilIcon data-icon="inline-start" aria-hidden="true"/>{t('修改','Edit')}</Button></Field>)}</FieldGroup>}
            {layout?.builtin&&<Field><FieldTitle>{t('DSH 内置技能目录','DSH built-in skill directory')}</FieldTitle><FieldDescription>{t('随 DSH 安装提供','Provided by DSH')}</FieldDescription></Field>}
            <Field data-disabled={fieldLocked(row,'customSkillDirs')} data-invalid={directoryErrors.some(Boolean)}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-1"><FieldTitle>{t('附加技能目录','Additional skill directories')}</FieldTitle><HelpPopover label={t('附加技能目录帮助','Additional skill directory help')}><p>{t('使用绝对路径或 ~/ 路径。添加到草稿后保存。移除目录配置不会删除技能文件。','Use absolute paths or ~/ paths. Save after adding to the draft. Removing a directory entry keeps its files.')}</p></HelpPopover></div><Button variant="outline" size="sm" disabled={fieldLocked(row,'customSkillDirs')||addingDirectory} onClick={()=>setAddingDirectory(true)}><PlusIcon data-icon="inline-start" aria-hidden="true"/>{t('添加目录','Add directory')}</Button></div>
              <FieldContent className="gap-2">{visibleDirectories.map(({path,index})=><div key={index} className="flex min-w-0 flex-wrap items-center gap-2"><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true"/>{editingDirectory===index?<Input autoFocus className="min-w-0 flex-1" aria-label={`${t('技能目录','Skill directory')} ${index+1}`} autoComplete="off" spellCheck={false} aria-invalid={directoryErrors[index]} disabled={fieldLocked(row,'customSkillDirs')} value={path} onChange={event=>setDirectories(current=>current.map((value,at)=>at===index?event.target.value:value))}/>:<OverflowText text={path} className="min-w-0 flex-1 truncate text-sm"/>}<Button size="sm" variant="ghost" disabled={fieldLocked(row,'customSkillDirs')} onClick={()=>setEditingDirectory(editingDirectory===index?null:index)}>{editingDirectory===index?<CheckIcon aria-hidden="true"/>:<PencilIcon aria-hidden="true"/>}{editingDirectory===index?t('完成','Done'):t('修改','Edit')}</Button><Hint text={t('移除目录配置','Remove directory entry')} disabled={fieldLocked(row,'customSkillDirs')}><Button size="icon-sm" variant="ghost" disabled={fieldLocked(row,'customSkillDirs')} aria-label={`${t('移除目录配置','Remove directory entry')} ${index+1}`} onClick={()=>{setDirectories(current=>current.filter((_,at)=>at!==index));setEditingDirectory(null);}}><Trash2Icon aria-hidden="true"/></Button></Hint></div>)}{(additionalUnresolved||layout?.dynamic)&&<FieldDescription>{t('部分目录在 DSH 运行时确定','Some directories are resolved by DSH at runtime')}</FieldDescription>}{!visibleDirectories.length&&!additionalUnresolved&&!layout?.dynamic&&<FieldDescription>{t('未添加','None added')}</FieldDescription>}</FieldContent>
              {fieldReason('customSkillDirs')&&<FieldDescription>{fieldReason('customSkillDirs')}</FieldDescription>}
              {addingDirectory&&<Field data-invalid={draftInvalid}><FieldLabel htmlFor={`${id}-new-directory`}>{t('新技能目录','New skill directory')}</FieldLabel><div className="flex min-w-0 flex-wrap items-center gap-2"><Input autoFocus id={`${id}-new-directory`} className="min-w-0 flex-1" disabled={locked} autoComplete="off" spellCheck={false} placeholder="~/skills" value={directoryDraft} aria-invalid={draftInvalid} onChange={event=>setDirectoryDraft(event.target.value)}/><Button variant="outline" size="icon-sm" disabled={locked||!onChooseDirectory} aria-label={t('选择文件夹','Choose folder')} onClick={()=>void addDirectory().catch(reason=>setError(String(reason),t('无法选择目录','Could not choose folder')))}><FolderOpenIcon aria-hidden="true"/></Button><Button size="sm" variant="outline" disabled={locked||!draftPath||draftInvalid} onClick={()=>{setDirectories(current=>[...current,displayHomePath(draftPath,home)]);setDirectoryDraft('');setAddingDirectory(false);}}>{t('添加','Add')}</Button><Button size="sm" variant="ghost" disabled={locked} onClick={()=>{setDirectoryDraft('');setAddingDirectory(false);}}>{t('取消','Cancel')}</Button></div>{draftInvalid&&<FieldError>{t('目录必须是绝对路径或以 ~/ 开头。','Use an absolute path or a ~/ path.')}</FieldError>}</Field>}
              {directoryErrors.some(Boolean)&&<FieldError>{t('目录必须是绝对路径或以 ~/ 开头。','Use an absolute path or a ~/ path.')}</FieldError>}
            </Field>
            {snapshot.roots.filter(root=>root.source==='bundled').map(root=><Field key={root.path}><FieldTitle>{t('打包技能目录','Packaged skill directory')}</FieldTitle><DirectoryLink path={root.path} home={home} zh={zh} disabled={locked||!onOpenDirectory||!root.exists} onOpen={path=>void openDirectory(path)}/></Field>)}
  </FieldGroup>
    <Modal compact title={t('修改默认技能目录','Edit default skill directory')} description={t('只修改 DSH 读取位置，不移动已有文件。其他目录可通过“添加目录”添加。','Change where DSH reads skills without moving files. Use Add directory for other locations.')} open={editingRoot!==null} onClose={()=>setEditingRoot(null)} busy={locked}>
      <FieldGroup><Field data-invalid={rootInvalid}><FieldLabel htmlFor={`${id}-root`}>{t('技能目录','Skill directory')}</FieldLabel><div className="flex gap-2"><Input autoFocus id={`${id}-root`} autoComplete="off" spellCheck={false} disabled={locked} value={rootDraft} onChange={event=>{setResetRoot(false);setRootDraft(event.target.value);}} aria-invalid={rootInvalid}/><Button variant="outline" size="icon-sm" disabled={locked||!onChooseDirectory} aria-label={t('选择文件夹','Choose folder')} onClick={()=>void chooseDirectory().then(path=>{if(typeof path==='string'){setResetRoot(false);setRootDraft(displayHomePath(path,home));}}).catch(reason=>setError(String(reason),t('无法选择目录','Could not choose folder')))}><FolderOpenIcon aria-hidden="true"/></Button></div><FieldDescription>{t('默认技能目录需以 skills 结尾。其他位置请通过“添加目录”添加。','Default skill directories must end in skills. Use Add directory for other locations.')}</FieldDescription>{rootInvalid&&<FieldError>{t('请输入以 /skills 结尾的绝对路径或 ~/ 路径。','Enter an absolute or ~/ path ending in /skills.')}</FieldError>}</Field></FieldGroup>
      <ModalActions><Button variant="outline" disabled={locked} onClick={()=>setEditingRoot(null)}>{t('取消','Cancel')}</Button><Button disabled={locked} variant="outline" onClick={()=>{setResetRoot(true);if(editingRoot)setRootDraft(displayHomePath(dshSkillsPath(editingRoot==='dshHome'?snapshot?.dshHome??home:snapshot?.sharedHome??home),home));}}>{t('使用默认位置','Use default location')}</Button><Button disabled={locked||rootInvalid} onClick={()=>{if(!editingRoot)return;const own=dshHomeFromSkillsPath(rootExpanded);if(own===null)return;if(!resetRoot&&own===dshHomeFromSkillsPath(defaultLocations.find(location=>location.key===editingRoot)?.path??'')){setEditingRoot(null);return;}const fallback=editingRoot==='dshHome'?snapshot?.dshHome:snapshot?.sharedHome;onHomeChange(editingRoot,own===fallback?'':displayHomePath(own,home));setEditingRoot(null);}}>{t('完成','Done')}</Button></ModalActions>
    </Modal>
  </>;
}
