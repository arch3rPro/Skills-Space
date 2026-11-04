import { WorkshopDirectorySettings } from '@/components/workshop-directory-settings';
import { VersionSettings } from "@/components/version-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { DirectoryDiagnostics } from "@/components/directory-diagnostics";
import { InstallModeField } from "@/components/install-mode-field";
import { NodeRuntimeSettings } from "@/components/node-runtime-settings";
import type { Preferences } from "@/lib/upstream";

export function GeneralSettings({ preferences, disabled, home, onChange }: { preferences: Preferences; disabled: boolean; home: string; onChange: (change: Partial<Preferences>) => void }) {
  const zh = preferences.language === "zh-CN";
  return <div className="flex flex-col gap-5">
    <Card>
      <CardHeader><CardTitle>{zh ? "技能安装" : "Skill installation"}</CardTitle></CardHeader>
      <CardContent><FieldGroup><InstallModeField mode={preferences.installMode} disabled={disabled} zh={zh} onChange={installMode => onChange({ installMode })} description={zh ? "设置安装技能的默认方式，每次安装时可调整。" : "Choose the default for skill installation. You can change it for each installation."} /></FieldGroup></CardContent>
    </Card>
    <WorkshopDirectorySettings preferences={preferences} disabled={disabled} home={home} onChange={onChange} />
    <NodeRuntimeSettings zh={zh} disabled={disabled} home={home} />
    <DirectoryDiagnostics projects={preferences.projects} home={home} zh={zh} disabled={disabled} />
    <VersionSettings zh={zh} disabled={disabled} />
  </div>;
}
