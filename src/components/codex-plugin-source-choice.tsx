import {FilterSelectSizer,Select,SelectContent,SelectGroup,SelectLabel,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {codexPluginSources,type CodexPlugin} from '@/lib/codex';

export function CodexPluginSourceChoice({plugins,value,onChange,disabled,zh}:{plugins:CodexPlugin[];value:string;onChange:(value:string)=>void;disabled?:boolean;zh:boolean}){
  const options=codexPluginSources(plugins,zh);
  const groups=[
    {label:zh?'官方内置':'Official built-ins',items:options.filter(item=>item.value!=='all'&&!item.value.startsWith('market:'))},
    {label:zh?'插件市场':'Plugin marketplaces',items:options.filter(item=>item.value.startsWith('market:'))},
  ];
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="filter-trigger" aria-label={zh?'筛选插件来源':'Filter plugin source'}><FilterSelectSizer>{options.map(option=>option.label)}</FilterSelectSizer><SelectValue/></SelectTrigger><SelectContent position="popper"><SelectGroup><SelectItem value="all">{zh?'全部来源':'All sources'}</SelectItem></SelectGroup>{groups.filter(group=>group.items.length>0).map(group=><SelectGroup key={group.label}><SelectLabel>{group.label}</SelectLabel>{group.items.map(item=><SelectItem key={item.value} value={item.value}><span className="truncate">{item.label}</span></SelectItem>)}</SelectGroup>)}</SelectContent></Select>;
}
