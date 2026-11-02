import { Choice } from '@/components/choice';
import { Hint } from '@/components/hint';
import { Switch } from '@/components/ui/switch';
import { piLoadingChoice, type PiLoadingChoice, type PiResource } from '@/lib/pi-packages';

export function PiResourceControl({ resource, project, zh, disabled, value, onChange, loadingLabels = false }: {
  resource: PiResource; project: boolean; zh: boolean; disabled: boolean;
  value?: PiLoadingChoice; onChange: (value: PiLoadingChoice) => void; loadingLabels?: boolean;
}) {
  const choice = value ?? piLoadingChoice(resource, project);
  const id = `pi-resource-${resource.id}`;
  if (project) return <Choice id={id} className={loadingLabels?'w-48 shrink-0':'w-36 shrink-0'} label={`${zh ? '加载设置' : 'Loading setting'} ${resource.name}`}
    value={choice} disabled={disabled} options={[
      { value: 'inherit', label: loadingLabels ? (zh ? '跟随全局' : 'Use global') : (zh ? '跟随默认' : 'Use default') },
      { value: 'load', label: loadingLabels ? (zh ? '加载' : 'Load') : (zh ? '启用' : 'Enabled') },
      { value: 'unload', label: loadingLabels ? (zh ? '不加载' : 'Do not load') : (zh ? '停用' : 'Disabled') },
    ]} onChange={next => { if (next === 'inherit' || next === 'load' || next === 'unload') onChange(next); }} />;
  const enabled = choice === 'load';
  return <Hint stable disabled={disabled} text={loadingLabels ? (enabled ? (zh ? '允许加载' : 'Allow loading') : (zh ? '不加载' : 'Do not load')) : enabled ? (zh ? '已启用' : 'Enabled') : (zh ? '已停用' : 'Disabled')}>
    <Switch id={id} checked={enabled} disabled={disabled} aria-label={`${loadingLabels ? (zh ? '加载' : 'Load') : (zh ? '启用' : 'Enable')} ${resource.name}`}
      onCheckedChange={checked => onChange(checked ? 'load' : 'unload')} />
  </Hint>;
}
