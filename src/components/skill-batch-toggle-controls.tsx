import { Button } from "@/components/ui/button";

export function SkillBatchToggleControls({count,disabled,canEnable,canDisable,zh,onChange}: {
  count:number;disabled:boolean;canEnable:boolean;canDisable:boolean;zh:boolean;onChange:(enabled:boolean)=>void;
}) {
  return <>
    <Button size="sm" variant="secondary" disabled={disabled||!count||!canEnable} onClick={()=>onChange(true)}>{zh?"启用":"Enable"}</Button>
    <Button size="sm" variant="secondary" disabled={disabled||!count||!canDisable} onClick={()=>onChange(false)}>{zh?"停用":"Disable"}</Button>
  </>;
}
