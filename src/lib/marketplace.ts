import type { MarketplacePage, MarketplaceSkill } from './upstream';

export type MarketplaceBoard = 'alltime' | 'trending' | 'hot';
export type MarketplaceSession = {
  board: MarketplaceBoard;
  page: number;
  query: string;
  owner: string;
  searchPage: { key: string; page: number };
  boards: Map<string, MarketplacePage>;
  searches: Map<string, { skills: MarketplaceSkill[]; at: number }>;
  descriptions: Map<string, string>;
  descriptionLoader?: DescriptionLoader;
  documents: Map<string, WebsiteDocument>;
  documentLoader?: (id: string) => Promise<WebsiteDocument>;
  metadataLoader?: (id: string) => Promise<WebsiteDocument>;
  markdown: Map<string, string>;
  markdownLoader?: (id: string) => Promise<string>;
};
export function createMarketplaceSession(): MarketplaceSession {
  return { board: 'alltime', page: 1, query: '', owner: '', searchPage: { key: '', page: 1 }, boards: new Map(), searches: new Map(), descriptions: new Map(), documents: new Map(), markdown: new Map() };
}
export function compactInstalls(value: number, _zh: boolean): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
export function marketplaceChange(change: number | null, zh: boolean): { direction: 'up' | 'down' | 'flat'; amount: number; description: string } | null {
  if (change === null) return null;
  const amount = Math.abs(change);
  const count = amount.toLocaleString(zh ? 'zh-CN' : 'en-US');
  return { direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat', amount,
    description: change === 0 ? zh ? '与昨日同时段持平' : 'Unchanged from the same hour yesterday' : zh ? `较昨日同时段${change > 0 ? '增加' : '减少'} ${count}` : `${change > 0 ? 'Increased' : 'Decreased'} by ${count} compared with the same hour yesterday` };
}
export function marketplaceMetricParts(skill: MarketplaceSkill, board: MarketplaceBoard | 'search', zh: boolean): { label: string; value: string } {
  const value = skill.installs.toLocaleString(zh ? 'zh-CN' : 'en-US');
  return { label: board === 'trending' ? zh ? '24h安装量' : '24h Installs' : board === 'hot' ? zh ? '1h安装量' : '1h Installs' : zh ? '安装量' : 'Installs', value };
}
export function marketplaceMetric(skill: MarketplaceSkill, board: MarketplaceBoard | 'search', zh: boolean): string {
  const { label, value } = marketplaceMetricParts(skill, board, zh);
  return label + (zh ? '：' : ': ') + value;
}
export type WebsiteLink = { label: string; url: string };
export type WebsiteMetadata = { summaryHtml: string | null; installation: { command: string | null; prompt: string | null } | null; repository: WebsiteLink | null; githubStars: string | null; topics: WebsiteLink[] };
export type WebsiteDocument = { metadata?: WebsiteMetadata | null; description: string | null; html: string | null; sourceUrl?: string | null; sourceError?: string | null };
export function isWebsiteSource(source: string): boolean {
  return !source.includes('/') && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(source);
}
export function marketplaceSourceUrl(skill: MarketplaceSkill): string {
  if (isWebsiteSource(skill.source)) return new URL(`https://${skill.source}/`).href;
  return `https://github.com/${skill.source}`;
}

export type DescriptionRequest = { promise: Promise<string | null>; release: () => void };
export type DescriptionLoader = (id: string) => DescriptionRequest;
export function createDescriptionLoader(cache: Map<string, string>, fetchDescription: (id: string) => Promise<string | null>): DescriptionLoader {
  type Listener = { resolve: (value: string | null) => void; reject: (reason: unknown) => void };
  type Task = { id: string; started: boolean; listeners: Set<Listener> };
  const pending = new Map<string, Task>();
  const queue = new Map<string, Task>();
  let active = 0;
  const drain = () => {
    while (active < 3 && queue.size) {
      const task = queue.values().next().value;
      if (!task) break;
      queue.delete(task.id); task.started = true; active++;
      const finish = () => { pending.delete(task.id); active--; drain(); };
      void Promise.resolve().then(() => fetchDescription(task.id)).then(description => {
        if (!cache.has(task.id)) cache.set(task.id, description || '');
        finish();
        for (const listener of task.listeners) listener.resolve(cache.get(task.id) || null);
        task.listeners.clear();
      }, reason => {
        finish();
        for (const listener of task.listeners) listener.reject(reason);
        task.listeners.clear();
      });
    }
  };
  return id => {
    if (cache.has(id)) return { promise: Promise.resolve(cache.get(id) || null), release: () => {} };
    let task = pending.get(id);
    if (!task) { task = { id, started: false, listeners: new Set() }; pending.set(id, task); queue.set(id, task); }
    const current = task;
    let release = () => {};
    const promise = new Promise<string | null>((resolve, reject) => {
      const listener = { resolve, reject };
      current.listeners.add(listener);
      release = () => {
        if (!current.listeners.delete(listener)) return;
        if (!current.started && !current.listeners.size) { queue.delete(id); pending.delete(id); }
        reject(new DOMException('Description request cancelled', 'AbortError'));
      };
    });
    drain();
    return { promise, release };
  };
}

export function createResourceLoader<T>(cache: Map<string, T>, fetchContent: (id: string) => Promise<T>, usable: (value: T) => boolean = () => true) {
  const pending = new Map<string, Promise<T>>();
  return (id: string): Promise<T> => {
    const cached = cache.get(id);
    if (cached !== undefined && usable(cached)) return Promise.resolve(cached);
    const active = pending.get(id);
    if (active) return active;
    const request = fetchContent(id).then(content => { cache.set(id, content); return content; }).finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  };
}

export const createMarkdownLoader = createResourceLoader<string>;

export function searchPageItems<T>(items: T[], page: number, pageSize = 12) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  return { page: current, totalPages, items: items.slice((current - 1) * pageSize, current * pageSize) };
}
