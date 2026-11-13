import { ChevronDownIcon, FolderOpenIcon } from "lucide-react";
import { DirectoryLink } from "@/components/directory-link";
import { OverflowText } from "@/components/overflow-text";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { displayHomePath } from "@/lib/upstream";

type Directory = { path: string; exists: boolean; displayPath?: string; annotation?: string };

export function SkillDirectoryMenu({ directories, home, zh, disabled, onOpen, label }: {
  directories: Directory[];
  home: string;
  zh: boolean;
  disabled: boolean;
  onOpen: (path: string) => void;
  label?: string;
}) {
  const unique = [...new Map(directories.map(directory => [directory.path, directory])).values()];
  if (!unique.length) return null;
  if (unique.length === 1) {
    const directory = unique[0];
    return <DirectoryLink path={directory.displayPath ?? directory.path} directory={directory.path} home={home} zh={zh} disabled={disabled || !directory.exists} fitContent onOpen={onOpen} />;
  }
  const menuLabel = label ?? (zh ? "技能目录" : "Skill folders");
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className="interactive-path inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed" disabled={disabled}>
      <FolderOpenIcon className="size-4" aria-hidden="true" />{menuLabel} {unique.length}<ChevronDownIcon className="size-3" aria-hidden="true" />
    </button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-max min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]">
      <DropdownMenuGroup>{unique.map(directory => <DropdownMenuItem key={directory.path} disabled={!directory.exists} aria-label={`${zh ? "打开目录" : "Open folder"} ${displayHomePath(directory.displayPath ?? directory.path, home)}`} onSelect={() => onOpen(directory.path)}>
        <FolderOpenIcon aria-hidden="true" />{directory.annotation && <Badge variant="secondary">{directory.annotation}</Badge>}<OverflowText text={displayHomePath(directory.displayPath ?? directory.path, home)} className="block max-w-[calc(100vw-5rem)] truncate font-mono text-xs" />
      </DropdownMenuItem>)}</DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
