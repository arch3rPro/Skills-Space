import { useId } from 'react';
import { OverflowText } from '@/components/overflow-text';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FieldSet, FieldLegend } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { moveShadowFocus } from '@/components/ui/overlay-container';

export function PresetChoiceCards({ choices, value, disabled, label, onChange }: {
  choices: { key: string; name: string; identifier: string; description?: string | null }[];
  value: string; disabled?: boolean; label: string; onChange: (key: string) => void;
}) {
  const id = useId();
  return <FieldSet>
    <FieldLegend className="sr-only">{label}</FieldLegend>
    <RadioGroup className="grid-cols-1 gap-3 sm:grid-cols-2" value={value} disabled={disabled} aria-label={label} onValueChange={onChange} onKeyDownCapture={event => {
      moveShadowFocus(event, '[role=radio]', event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 'vertical' : 'horizontal');
      const root = event.currentTarget.getRootNode();
      if (event.defaultPrevented && root instanceof ShadowRoot) {
        const key = root.activeElement?.getAttribute('data-preset-key');
        if (key && key !== value) onChange(key);
      }
    }}>
      {choices.map((row, index) => <Card key={row.key} size="sm" variant="selection"
        data-state={row.key === value ? 'checked' : 'unchecked'} data-disabled={disabled || undefined}
        onClick={event => { if (!disabled && !(event.target instanceof Element && event.target.closest('label,[role=radio]'))) onChange(row.key); }}>
        <CardHeader>
          <div className="flex min-w-0 items-start gap-3">
            <RadioGroupItem className="mt-0.5" data-preset-key={row.key} value={row.key} id={`${id}-${index}`} aria-labelledby={`${id}-name-${index}`} aria-describedby={row.description ? `${id}-description-${index}` : undefined} />
            <CardTitle className="min-w-0 flex-1"><label id={`${id}-name-${index}`} htmlFor={`${id}-${index}`} className="flex min-w-0 cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <OverflowText text={row.name} className="min-w-0 flex-1 truncate" />
              {row.identifier !== row.name && <OverflowText text={row.identifier} className="max-w-1/2 truncate font-mono text-xs font-normal text-muted-foreground" />}
            </label></CardTitle>
          </div>
          {row.description && <CardDescription id={`${id}-description-${index}`} className="pl-7"><OverflowText text={row.description} className="line-clamp-3 break-words text-xs leading-5" /></CardDescription>}
        </CardHeader>
      </Card>)}
    </RadioGroup>
  </FieldSet>;
}
