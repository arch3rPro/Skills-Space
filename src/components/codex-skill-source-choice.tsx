import {PackageIcon} from 'lucide-react';
import {CodexSkillIcon} from '@/components/codex-skill-icon';
import {FilterSelectSizer,SelectTriggerButton} from '@/components/ui/select';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent,DropdownMenuPortal} from '@/components/ui/dropdown-menu';
import {codexSkillSourceOptions,type CodexPlugin} from '@/lib/codex';
import type {InstalledSkill} from '@/lib/upstream';

export function CodexSkillSourceChoice({skills,plugins,value,onChange,disabled,zh}:{skills:InstalledSkill[];plugins:CodexPlugin[];value:string;onChange:(value:string)=>void;disabled?:boolean;zh:boolean}){
  const options=codexSkillSourceOptions(skills,zh,plugins);
  const selected=options.find(option=>option.value===value)??options[0];
  const pluginOptions=options.filter(option=>option.pluginId);
  return <DropdownMenu><DropdownMenuTrigger asChild><SelectTriggerButton disabled={disabled} className="filter-trigger" aria-label={`${zh?'筛选技能来源':'Filter skill source'}：${selected.label}`}>
    <FilterSelectSizer>{options.map(option=><span className="flex items-center gap-1.5">{option.pluginId&&<span className="size-4 shrink-0"/>}{option.label}</span>)}</FilterSelectSizer>
    <span className="flex min-w-0 items-center gap-1.5">{selected.pluginId&&<CodexSkillIcon src={selected.icon} fallback={<PackageIcon aria-hidden="true"/>}/>}<span className="truncate">{selected.label}</span></span>
  </SelectTriggerButton></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-44">
    <DropdownMenuGroup><DropdownMenuRadioGroup value={value} onValueChange={onChange}>{options.filter(option=>!option.pluginId).map(option=><DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup>
    {pluginOptions.length>0&&<DropdownMenuGroup><DropdownMenuSub><DropdownMenuSubTrigger><span className="flex-1">{zh?'插件技能':'Plugin skills'}</span></DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] max-w-[min(20rem,calc(100vw-2rem))] min-w-44 overflow-y-auto"><DropdownMenuGroup><DropdownMenuRadioGroup value={value} onValueChange={onChange}>{pluginOptions.map(option=><DropdownMenuRadioItem key={option.value} value={option.value}><CodexSkillIcon src={option.icon} fallback={<PackageIcon aria-hidden="true"/>}/><span className="truncate">{option.label}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub></DropdownMenuGroup>}
  </DropdownMenuContent></DropdownMenu>;
}
