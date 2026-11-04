import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpenIcon, RotateCcwIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { notifyError } from '@/lib/notifications';
import { displayHomePath, expandHomePath, type Preferences } from '@/lib/upstream';

export function WorkshopDirectorySettings({preferences,disabled,home,onChange}:{preferences:Preferences;disabled:boolean;home:string;onChange:(change:Partial<Preferences>)=>void}){
  const zh=preferences.language==='zh-CN',t=(cn:string,en:string)=>zh?cn:en;
  const saved=preferences.workshopDirectory||'~/.skills-space/workshop';
  const [value,setValue]=useState(displayHomePath(saved,home));
  useEffect(()=>setValue(displayHomePath(saved,home)),[saved,home]);
  const changed=expandHomePath(value.trim(),home)!==expandHomePath(saved,home);
  async function browse(){try{const selected=await open({directory:true,multiple:false});if(typeof selected==='string')setValue(displayHomePath(selected,home));}catch(reason){notifyError(String(reason),zh);}}
  return <Card><CardHeader><CardTitle>{t('创意工坊','Workshop')}</CardTitle></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="workshop-root">{t('主路径','Root folder')}</FieldLabel><div className="flex min-w-0 flex-wrap items-center gap-2"><Input id="workshop-root" className="min-w-0 flex-1" autoComplete="off" spellCheck={false} disabled={disabled} value={value} onChange={event=>setValue(event.target.value)}/><Button variant="outline" disabled={disabled} onClick={()=>void browse()}><FolderOpenIcon data-icon="inline-start"/>{t('选择目录','Choose folder')}</Button><Button disabled={disabled||!value.trim()||!changed} onClick={()=>onChange({workshopDirectory:expandHomePath(value.trim(),home)})}>{t('保存','Save')}</Button>{preferences.workshopDirectory?<Button variant="ghost" disabled={disabled} onClick={()=>onChange({workshopDirectory:null})}><RotateCcwIcon data-icon="inline-start"/>{t('恢复默认','Restore default')}</Button>:null}</div><FieldDescription>{t('新建创作保存在此目录；已有创作和安装来源保留原路径。','New creations are saved here; existing creations and installation sources keep their paths.')}</FieldDescription></Field></FieldGroup></CardContent></Card>;
}
