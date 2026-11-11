import { useId } from 'react';
import { FileTextIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Choice } from '@/components/choice';
import { Hint } from '@/components/hint';
import { PresetChoiceCards } from '@/components/preset-choice-cards';
import { Field, FieldLabel } from '@/components/ui/field';
import { displayHomePath } from '@/lib/upstream';
import { dshProfileLabel, dshPresetContextKey, dshPresetText, type DshPreset, type DshConfiguration, type DshConfigurationFile } from '@/lib/dsh';

type Props={rows:DshConfiguration[];presets:DshPreset[];current:DshPreset|undefined;configuration:DshConfiguration|undefined;disabled:boolean;zh:boolean;onChange:(key:string)=>void};

export function DshConfigurationChoice({files,path,disabled,zh,home,onChange}:{files:DshConfigurationFile[];path:string;disabled:boolean;zh:boolean;home:string;onChange:(path:string)=>void}){
  if(!files.length)return null;
  return <Hint stable text={path?displayHomePath(path,home):undefined} disabled={disabled}><Choice className="w-48 shrink-0" label={zh?'配置文件':'Configuration file'} placeholder={zh?'选择配置文件':'Choose configuration file'} value={files.some(file=>file.path===path)?path:''} disabled={disabled} options={files.map(row=>({value:row.path,label:files.filter(other=>dshProfileLabel(other.profile)===dshProfileLabel(row.profile)).length>1?`${dshProfileLabel(row.profile)} · ${displayHomePath(row.path,home)}`:zh?`${dshProfileLabel(row.profile)} 配置`:`${dshProfileLabel(row.profile)} configuration`,icon:FileTextIcon}))} onChange={onChange}/></Hint>;
}

export function DshPresetChoices({rows,presets:declarations,current,configuration,path,disabled,zh,onChange}:Props&{path:string}){
  const id=useId();
  const presets=declarations.filter(preset=>preset.path===path);
  const providers=rows.filter(row=>current?.configurationKeys.includes(row.key));
  const select=(preset:DshPreset)=>{const key=dshPresetContextKey(preset,rows,configuration);if(key!==(configuration?.key??current?.key))onChange(key);};
  return <>
    <PresetChoiceCards label={zh?'Agent 预设':'Agent presets'} disabled={disabled} value={current?.key??''}
      choices={presets.map(row=>{const text=dshPresetText(row,zh);return {key:row.key,name:text.name,identifier:row.preset,description:text.description};})}
      onChange={value=>{const preset=presets.find(row=>row.key===value);if(preset)select(preset);}} />
    {providers.length>1&&<Field orientation="responsive"><FieldLabel htmlFor={`${id}-provider`}>{zh?'技能提供器':'Skill provider'}</FieldLabel><Choice id={`${id}-provider`} className="w-48 shrink-0" label={zh?'技能提供器':'Skill provider'} value={configuration?.key??''} options={providers.map(row=>({value:row.key,label:`${row.provider}${row.entryId?` · ${row.entryId}`:''}`,icon:SlidersHorizontalIcon}))} disabled={disabled} onChange={onChange}/></Field>}
  </>;
}
