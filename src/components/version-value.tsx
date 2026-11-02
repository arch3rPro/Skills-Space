import { LoaderCircleIcon } from "lucide-react";
import { shortSkillVersion } from "@/lib/skill-document";

export type VersionReadState = "loading" | "ready" | "error";

export function VersionValue({value,state="ready",zh,emptyLabel}: {
  value:string|null;state?:VersionReadState;zh:boolean;emptyLabel?:string;
}) {
  if(state==="loading")return <span className="inline-flex items-center gap-1.5" role="status"><LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true"/><span>{zh?"加载中…":"Loading…"}</span></span>;
  if(state==="error")return <span>{zh?"读取失败":"Could not read"}</span>;
  const version=shortSkillVersion(value);
  return <span>{version?.trim()?version:emptyLabel??(zh?"未知":"Unknown")}</span>;
}
