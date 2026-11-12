import { FolderSearchIcon, LayersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { displayHomePath } from '@/lib/upstream';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { dshNativePresetChoices, dshProfileLabel, dshDirectoryStatus, dshNativeContext, dshPresetText, type DshConfigurationFile, type DshPreset, type DshSnapshot } from '@/lib/dsh';

export function dshNativeFilterOptions(snapshot:DshSnapshot,home:string,zh:boolean,configuration:string){
  const files=snapshot.configurationFiles??[];
  const presets=dshNativePresetChoices(snapshot.presets??[]).filter(row=>row.path===configuration);
  const label=(item:DshConfigurationFile)=>files.filter(other=>dshProfileLabel(other.profile)===dshProfileLabel(item.profile)).length>1?`${dshProfileLabel(item.profile)} · ${displayHomePath(item.path,home)}`:zh?`${dshProfileLabel(item.profile)} 配置`:`${dshProfileLabel(item.profile)} configuration`;
  const presetLabel=(row:typeof presets[number])=>{
    const name=dshPresetText(row,zh).name;
    return presets.some(other=>other.key!==row.key&&other.path===row.path&&dshPresetText(other,zh).name===name)?row.preset:name;
  };
  return { configurations:[{value:'all',label:zh?'全部配置':'All configurations'},...files.map(item=>({value:item.path,label:label(item)}))],
    presets:[{value:'all',label:zh?'全部预设':'All presets'},...presets.map(row=>({value:row.key,label:presetLabel(row)}))] };
}

export function DshNativeEmpty({snapshot,disabled,zh,onRefresh,unreadable,onOpenConfiguration}:{snapshot:DshSnapshot;disabled:boolean;zh:boolean;onRefresh:()=>void;unreadable?:DshPreset;onOpenConfiguration?:(path:string)=>void}){
  const t=(cn:string,en:string)=>zh?cn:en;
  if(unreadable)return <Empty><EmptyHeader><EmptyMedia variant="icon"><LayersIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{t('暂时无法读取技能目录','Skill directories could not be read')}</EmptyTitle><EmptyDescription>{t('当前筛选范围包含无法读取的目录配置，请检查配置文件或刷新。','The current filter includes unreadable directory configuration. Inspect the configuration file or refresh.')}</EmptyDescription></EmptyHeader><EmptyContent>{snapshot.configurationFiles?.find(row=>row.path===unreadable.path)?.exists&&onOpenConfiguration&&<Button variant="outline" disabled={disabled} onClick={()=>onOpenConfiguration(unreadable.path)}>{t('打开配置文件','Open configuration file')}</Button>}<Button variant="outline" disabled={disabled} onClick={onRefresh}>{t('刷新','Refresh')}</Button></EmptyContent></Empty>;
  if(snapshot.aggregate)return <Empty><EmptyHeader><EmptyMedia variant="icon"><FolderSearchIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{t('未发现原生技能','No native skills found')}</EmptyTitle><EmptyDescription>{t('检查设置中的技能目录，或刷新列表。','Check skill directories in settings, or refresh the list.')}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" disabled={disabled} onClick={onRefresh}>{t('刷新','Refresh')}</Button></EmptyContent></Empty>;
  const {preset,configuration,path}=dshNativeContext(snapshot);
  const noPreset=!!path&&!snapshot.presets?.some(item=>item.path===path);
  const legacyUnreadable=preset&&!configuration&&preset.directoryStatus==='unknown';
  const missing=preset&&!configuration&&preset.directoryStatus==='none';
  const title=snapshot.contextIssue?t('配置已变化','Configuration changed'):noPreset?t('未找到 Agent 预设','No Agent presets found'):missing?t('未配置技能目录','No skill directories configured'):legacyUnreadable?t('暂时无法读取技能目录','Skill directories could not be read'):dshDirectoryStatus(snapshot,zh);
  const description=snapshot.contextIssue?t('请刷新，或选择其他配置文件。','Refresh or choose another configuration file.'):noPreset?t('当前配置中没有可读取的预设声明，可选择其他配置文件。','No readable preset declarations were found. Choose another configuration file.'):missing?t('当前预设未配置文件技能目录，可选择其他预设。','No file-based skill directories are configured for this preset. Choose another preset.'):legacyUnreadable?t('此预设的技能目录无法静态读取，请在“设置 → 智能体 → DeepSeek Harness”中打开配置文件查看。','The skill directories cannot be read statically. Open the configuration file in Settings → Agents → DeepSeek Harness to inspect it.'):t('请在“设置 → 智能体 → DeepSeek Harness”中检查技能目录配置。','Check skill directory settings in Settings → Agents → DeepSeek Harness.');
  return <Empty className="min-h-72 py-12">
    <EmptyHeader><EmptyMedia variant="icon">{noPreset?<LayersIcon aria-hidden="true"/>:<FolderSearchIcon aria-hidden="true"/>}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>
    {snapshot.contextIssue&&<EmptyContent><Button variant="outline" disabled={disabled} onClick={onRefresh}>{t('刷新','Refresh')}</Button></EmptyContent>}
  </Empty>;
}
