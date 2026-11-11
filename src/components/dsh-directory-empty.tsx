import { FolderSearchIcon, LayersIcon } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

export function DshDirectoryEmpty({ status, zh }: { status: "none" | "unknown"; zh: boolean }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  return <Empty><EmptyHeader><EmptyMedia variant="icon"><FolderSearchIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{status==='none'?t('此预设不读取技能目录','This preset does not read skill directories'):t('暂时无法读取技能目录','Skill directories could not be read')}</EmptyTitle><EmptyDescription>{status==='none'?t('可通过上方「打开配置文件」查看预设内容。','Use Open configuration file above to view the preset.'):t('暂时无法确定此预设的技能目录，请打开配置文件查看。','The skill directories for this preset could not be determined. Open the configuration file to inspect it.')}</EmptyDescription></EmptyHeader></Empty>;
}

export function DshPresetEmpty({ zh }: { zh: boolean }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  return <Empty><EmptyHeader><EmptyMedia variant="icon"><LayersIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{t('未找到 Agent 预设','No Agent presets found')}</EmptyTitle><EmptyDescription>{t('当前配置中没有可读取的预设声明，可打开配置文件查看。','No readable preset declarations were found in this configuration. Open the configuration file to inspect it.')}</EmptyDescription></EmptyHeader></Empty>;
}
