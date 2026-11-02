import { BotIcon, CircleAlertIcon, FolderOpenIcon, PackagePlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export type InventoryEmptyKind = "failed" | "uninstalled" | "filtered" | "native" | "managed";

export function InventoryEmpty({ kind, zh, disabled, onRetry, onClear, onAdd }: {
  kind: InventoryEmptyKind;
  zh: boolean;
  disabled: boolean;
  onRetry: () => void;
  onClear: () => void;
  onAdd: () => void;
}) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const content = {
    failed: { icon: CircleAlertIcon, title: t("无法加载技能", "Could not load skills"), description: null, action: t("重试", "Try again"), run: onRetry },
    uninstalled: { icon: BotIcon, title: t("此 Agent 未安装", "Agent not installed"), description: t("安装后可重新检测。", "Detect again after installation."), action: t("重新检测", "Detect again"), run: onRetry },
    filtered: { icon: SearchIcon, title: t("未找到匹配的技能", "No matching skills"), description: t("试试其他关键词，或清除筛选。", "Try another keyword or clear the filters."), action: t("清除筛选", "Clear filters"), run: onClear },
    native: { icon: FolderOpenIcon, title: t("暂无原生技能", "No native skills yet"), description: t("Agent 自带及额外加载的技能会显示在这里。", "Skills bundled with or additionally loaded by the Agent appear here."), action: null, run: undefined },
    managed: { icon: PackagePlusIcon, title: t("添加你的第一个技能", "Add your first skill"), description: null, action: t("添加技能", "Add skill"), run: onAdd },
  }[kind];
  const Icon = content.icon;

  return <Empty className="min-h-72 py-12">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
      <EmptyTitle>{content.title}</EmptyTitle>
      {content.description && <EmptyDescription>{content.description}</EmptyDescription>}
    </EmptyHeader>
    {content.action && <EmptyContent><Button variant="outline" disabled={disabled} onClick={content.run}>{content.action}</Button></EmptyContent>}
  </Empty>;
}
