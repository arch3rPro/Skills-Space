import { FolderOpenIcon, GitBranchIcon } from 'lucide-react';
import type { PiExtensionPackage } from '@/lib/pi-packages';

export function PiPackageSourceIcon({kind}: {kind: PiExtensionPackage['kind']}) {
  if (kind !== 'npm') { const Icon = kind === 'git' ? GitBranchIcon : FolderOpenIcon; return <Icon className="size-4 shrink-0" aria-hidden="true" />; }
  // npm mark from Simple Icons (CC0): https://github.com/simple-icons/simple-icons/blob/develop/icons/npm.svg
  return <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0" aria-hidden="true"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" /></svg>;
}
