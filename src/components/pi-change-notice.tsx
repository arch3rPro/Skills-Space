import { InfoIcon } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
export function PiChangeNotice({zh}:{zh:boolean}) {
 const text=zh?"修改后在 Pi 中运行 /reload。":"Run /reload in Pi after changes.";
 return <Hint text={text}><Button variant="ghost" size="icon-xs" aria-label={zh?"Pi 设置生效提示":"Pi settings activation help"}><InfoIcon aria-hidden="true"/></Button></Hint>;
}
