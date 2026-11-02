import { useState } from 'react';
import type { ReactNode } from 'react';

const sizes = {
  sm: {pixels:16,frame:'size-4 rounded-sm'},
  md: {pixels:40,frame:'size-10 rounded-lg'},
  lg: {pixels:48,frame:'size-12 rounded-lg'},
};
export function CodexSkillIcon({src,fallback,size='sm'}: {src?: string | null;fallback:ReactNode;size?:keyof typeof sizes}) {
  const [failed, setFailed] = useState<string | null>(null);
  const {pixels,frame}=sizes[size];
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden ${frame}`}>
    {src && src !== failed
      ? <img src={src} alt="" width={pixels} height={pixels} loading="lazy" decoding="async" className="size-full object-contain" onError={()=>setFailed(src)} />
      : fallback}
  </span>;
}
