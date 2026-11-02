import {skillSourceKind,type InstalledSkill} from './upstream.ts';

// An installed file does not prove that an Agent has enabled it.
export function managedSkillEnabled(skill:InstalledSkill,agent:string|null):boolean|null {
  const states=(agent?[agent]:skill.agents).map(id=>{
    if(!skill.agents.includes(id))return null;
    if(id==='codex')return skill.codexState?.enabled??null;
    if(id==='pi')return skill.piState?.enabled??null;
    if(id==='hermes-agent')return skill.hermesState?.enabled??null;
    return null;
  });
  if(states.some(state=>state===true))return true;
  return states.length>0&&states.every(state=>state===false)?false:null;
}
export function filterManagedSkills(skills:InstalledSkill[],source:string,status:string,agent:string|null){
  return skills.filter(skill=>(source==='all'||skillSourceKind(skill)===source)&&(status==='all'||managedSkillEnabled(skill,agent)===(status==='enabled')));
}
export function managedSkillSourceOptions(skills:InstalledSkill[],zh:boolean){
  const labels={git:['Git 仓库','Git repository'],local:['本地目录','Local folder'],download:['直接下载','Direct download'],'well-known':['网站来源','Website source'],node_modules:['项目依赖','Project dependency'],unknown:['未知来源','Unknown source']};
  const kinds=[...new Set(skills.map(skillSourceKind))].sort();
  return [{value:'all',label:zh?'全部来源':'All sources'},...kinds.map(value=>({value,label:labels[value][zh?0:1]}))];
}
