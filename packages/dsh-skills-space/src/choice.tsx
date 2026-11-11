import { NativeSelect } from "@/components/ui/select";

export function Choice({ label, value, onChange, options, id, disabled }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string; disabled?: boolean }[]; id?: string; disabled?: boolean;
}) {
  return <NativeSelect sizingLabels={options.map(option => option.label)} id={id} aria-label={label} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
    {!value && <option value="" disabled>{label}</option>}
    {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </NativeSelect>;
}
