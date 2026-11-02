import { useId } from 'react';
import { FileTextIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Choice } from '@/components/choice';
import { Hint } from '@/components/hint';
import { OverflowText } from '@/components/overflow-text';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  return <FieldSet>
    <FieldLegend className="sr-only">{zh?'Agent 预设':'Agent presets'}</FieldLegend>
    <RadioGroup className="grid-cols-1 gap-3 sm:grid-cols-2" value={current?.key??''} disabled={disabled} aria-label={zh?'Agent 预设':'Agent presets'} onValueChange={value=>{const preset=presets.find(row=>row.key===value);if(preset)select(preset);}}>
      {presets.map((row,index)=>{const text=dshPresetText(row,zh);const selected=row.key===current?.key;return <Card key={row.key} size="sm" variant="selection" data-state={selected?'checked':'unchecked'} data-disabled={disabled||undefined} onClick={event=>{if(disabled||event.target instanceof Element&&event.target.closest('label,[role=radio]'))return;select(row);}}>
        <CardHeader>
          <div className="flex min-w-0 items-start gap-3"><RadioGroupItem className="mt-0.5" value={row.key} id={`${id}-preset-${index}`} aria-labelledby={`${id}-name-${index}`} aria-describedby={text.description?`${id}-description-${index}`:undefined}/><CardTitle className="min-w-0 flex-1"><label id={`${id}-name-${index}`} htmlFor={`${id}-preset-${index}`} className="flex min-w-0 cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><OverflowText text={text.name} className="min-w-0 flex-1 truncate"/>{row.preset!==text.name&&<OverflowText text={row.preset} className="max-w-1/2 truncate font-mono text-xs font-normal text-muted-foreground"/>}</label></CardTitle></div>
          {text.description&&<CardDescription id={`${id}-description-${index}`} className="pl-7"><OverflowText text={text.description} className="line-clamp-3 break-words text-xs leading-5"/></CardDescription>}
        </CardHeader>
      </Card>;})}
    </RadioGroup>
    {providers.length>1&&<Field orientation="responsive"><FieldLabel htmlFor={`${id}-provider`}>{zh?'技能提供器':'Skill provider'}</FieldLabel><Choice id={`${id}-provider`} className="w-48 shrink-0" label={zh?'技能提供器':'Skill provider'} value={configuration?.key??''} options={providers.map(row=>({value:row.key,label:`${row.provider}${row.entryId?` · ${row.entryId}`:''}`,icon:SlidersHorizontalIcon}))} disabled={disabled} onChange={onChange}/></Field>}
  </FieldSet>;
}
