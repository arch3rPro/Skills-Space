const origin = 'https://www.skills.sh';
const boardNames = { alltime: 'all-time', trending: 'trending', hot: 'hot' };
const pageSizes = [12, 24, 36, 48];
const chunkSize = 200;
const bodyLimit = 16 * 1024 * 1024;

export function repository(value) {
  return typeof value === 'string' && value.split('/').length === 2
    && value.split('/').every(part => /^[a-z\d][a-z\d._-]{0,199}$/i.test(part));
}

export function skillName(value) {
  return typeof value === 'string' && /^[a-z\d]+(?:-[a-z\d]+)*$/.test(value) && value.length <= 64;
}

function marketplaceSkill(value) {
  const { source, name, installs } = value;
  const skillId = value.skillId ?? value.skill_id ?? (typeof value.id === 'string' && value.id.startsWith(`${source}/`) ? value.id.slice(source.length + 1) : undefined);
  if (typeof source !== 'string' || !source || typeof skillId !== 'string' || !skillId || typeof name !== 'string' || !name || !Number.isSafeInteger(installs) || installs < 0) {
    throw new Error('Invalid marketplace item');
  }
  return {
    source, name, installs, skillId, id: `${source}/${skillId}`, previewable: repository(source) && skillName(skillId),
    description: typeof value.description === 'string' ? value.description.slice(0, 2000) : null,
    change: Number.isSafeInteger(value.change) ? value.change : null, isOfficial: value.isOfficial === true,
  };
}

async function responseBody(url, signal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`Marketplace request failed (${response.status})`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > bodyLimit) throw new Error('Marketplace response is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const json = async (url, signal) => JSON.parse(await responseBody(url, signal));

function listingUrl(id) {
  const parts = id.split('/');
  if (!skillName(parts.at(-1))) return null;
  if (parts.length === 3 && repository(parts.slice(0, 2).join('/'))) return new URL(parts.map(encodeURIComponent).join('/'), origin);
  if (parts.length === 2 && /^[a-z\d][a-z\d.-]*\.[a-z]{2,}$/i.test(parts[0])) return new URL(`/site/${parts.map(encodeURIComponent).join('/')}`, origin);
  return null;
}

function listingRecords(html) {
  const segments = [];
  for (const match of html.matchAll(/<script\b[^>]*>\s*self\.__next_f\.push\((\[1,[\s\S]*?\])\)\s*<\/script>/g)) {
    const [, text] = JSON.parse(match[1]);
    if (typeof text === 'string') segments.push(text);
  }
  const payload = Buffer.from(segments.join(''));
  const records = new Map();
  const strings = new Map();
  let offset = 0;
  while (offset < payload.length) {
    const newline = payload.indexOf(10, offset);
    const end = newline === -1 ? payload.length : newline;
    const colon = payload.indexOf(58, offset);
    if (colon < offset || colon >= end) { offset = end + 1; continue; }
    const id = payload.toString('utf8', offset, colon);
    if (!/^[0-9a-f]+$/i.test(id)) { offset = end + 1; continue; }
    if (payload[colon + 1] === 84) {
      const comma = payload.indexOf(44, colon + 2);
      const size = comma < 0 ? '' : payload.toString('ascii', colon + 2, comma);
      if (!/^[0-9a-f]+$/i.test(size)) throw new Error('Invalid listing text record');
      const next = comma + 1 + Number.parseInt(size, 16);
      if (next > payload.length) throw new Error('Incomplete listing text record');
      const value = payload.toString('utf8', comma + 1, next);
      strings.set(id, strings.has(id) && strings.get(id) !== value ? null : value);
      offset = next;
      continue;
    }
    const row = payload.toString('utf8', colon + 1, end);
    try { records.set(id, JSON.parse(row)); } catch { /* Other Flight record types carry no listing content. */ }
    offset = end + 1;
  }
  return { records, strings };
}

// Same section identities as the desktop parser. Flight data is parsed as JSON and never executed.
export function listingDocument(html, url) {
  const head = html.slice(0, html.indexOf('</head>'));
  const canonical = [...head.matchAll(/<link\b[^>]*>/g)].find(([tag]) => /\brel=["']canonical["']/.test(tag))?.[0];
  if (canonical?.match(/\bhref=["']([^"']+)["']/)?.[1] !== url.href) throw new Error('Skill page identity does not match');
  const { records, strings } = listingRecords(html);
  const body = [], documentCandidates = [], summaries = [], repositories = [], stars = [], installations = [];
  const topics = new Map();
  const tuple = value => Array.isArray(value) && value[0] === '$';
  const props = value => tuple(value) ? value[3] : value;
  function resolve(value) {
    const seen = new Set();
    while (typeof value === 'string' && /^\$L?[0-9a-f]+$/i.test(value)) {
      const id = value.replace(/^\$L?/, '');
      if (seen.has(id) || !records.has(id)) break;
      seen.add(id);
      value = records.get(id);
    }
    return value;
  }
  function text(value) {
    value = resolve(value);
    if (typeof value !== 'string') return null;
    if (value.startsWith('$$')) return value.slice(1);
    return value.startsWith('$') ? strings.get(value.slice(1)) ?? null : value;
  }
  function children(value) {
    const child = props(value)?.children;
    return Array.isArray(child) && !tuple(child) ? child : child == null ? [] : [child];
  }
  function label(value, heading = false, seen = new Set()) {
    const node = resolve(value);
    const content = text(node);
    if (content !== null) return content;
    if (seen.has(node)) return '';
    seen.add(node);
    if (tuple(node) && (node[1] === 'svg' || heading && (!['span', 'div', 'h2', 'h3', 'h4'].includes(node[1]) || props(node)?.href))) return '';
    return children(node).map(child => label(child, heading, seen)).join('');
  }
  function visit(value, read, seen = new Set()) {
    const node = resolve(value);
    if (seen.has(node)) return;
    seen.add(node);
    if (!read(node)) for (const child of children(node)) visit(child, read, seen);
  }
  function prose(value, result) {
    visit(value, node => {
      const p = props(node);
      const preview = text(p?.previewHtml), rest = text(p?.restHtml);
      const full = preview !== null && rest !== null ? preview + rest
        : typeof p?.className === 'string' && p.className.split(/\s+/).includes('prose') ? text(p.dangerouslySetInnerHTML?.__html) : null;
      if (!full?.trim() || Buffer.byteLength(full) > 256 * 1024) return false;
      result.push(full);
      return true;
    });
  }
  function links(value, result) {
    visit(value, node => {
      const href = props(node)?.href;
      const link = typeof href === 'string' && URL.parse(href, origin);
      const title = link && label(node).trim();
      if (link && title && ['https:', 'http:'].includes(link.protocol) && !link.username && !link.password) result({ label: title, url: link.href });
      return false;
    });
  }
  function scan(value) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && 'previewHtml' in value && 'restHtml' in value) prose(value, documentCandidates);
    if (!Array.isArray(value) && value.label === 'Installation') {
      const command = text(value.command), prompt = text(value.prompt);
      if (command || prompt) installations.push({ command, prompt });
    }
    if (Array.isArray(value) && !tuple(value)) for (let i = 0; i + 1 < value.length; i++) {
      const title = label(value[i], true).trim();
      const content = value[i + 1];
      if (title === 'SKILL.md') prose(content, body);
      if (title === 'Summary') prose(content, summaries);
      if (title === 'Repository') links(content, link => repositories.push(link));
      if (title === 'GitHub Stars') {
        const count = label(content).trim();
        if (count && count.length <= 32) stars.push(count);
      }
      if (resolve(value[i])?.[1] === 'h1') links(content, link => { if (link.url.startsWith(`${origin}/topic/`)) topics.set(link.url, link); });
    }
    for (const child of Object.values(value)) scan(child);
  }
  for (const value of records.values()) scan(value);
  const unique = values => new Set(values.map(value => JSON.stringify(value))).size === 1 ? values[0] : null;
  const metadata = { summaryHtml: unique(summaries), installation: unique(installations), repository: unique(repositories), githubStars: unique(stars), topics: [...topics.values()] };
  const document = unique(body.length ? body : documentCandidates.filter(candidate => !summaries.includes(candidate)));
  if (!document && !metadata.summaryHtml && !metadata.installation && !metadata.repository && !metadata.githubStars && !topics.size) throw new Error('Skill listing content is unavailable');
  return { description: null, html: document, metadata };
}

export async function publishedDocument(id, signal) {
  const segments = id.split('/');
  if (segments.length !== 3 || !repository(segments.slice(0, 2).join('/')) || !skillName(segments[2])) return null;
  const data = await json(`https://skills.sh/api/download/${segments.map(encodeURIComponent).join('/')}`, signal);
  const files = data.files?.filter(file => typeof file.path === 'string' && file.path.toLowerCase() === 'skill.md');
  const content = files?.length === 1 ? files[0].contents : null;
  if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 256 * 1024) throw new Error('Skill snapshot is unavailable');
  return content;
}

export async function marketplace(params, signal) {
  const view = params.get('store');
  if (view === 'markdown' || view === 'document') {
    const id = params.get('id') ?? '';
    const url = listingUrl(id);
    if (view === 'document' && url && (params.get('metadata') === '1' || url.pathname.startsWith('/site/'))) {
      return Response.json(listingDocument(await responseBody(url, signal), url));
    }
    const content = await publishedDocument(id, signal);
    if (content === null) return view === 'markdown' ? Response.json({ error: 'identity' }, { status: 404 }) : Response.json({ description: null, html: null });
    if (view === 'markdown') return Response.json(content);
    const description = content.match(/^---\r?\n[\s\S]*?^description:\s*([^\r\n]+)(?=\r?$)/m)?.[1]?.trim();
    return Response.json({ description: description || null, html: null });
  }
  if (view === 'search') {
    const query = (params.get('q') ?? '').trim();
    const owner = (params.get('owner') ?? '').trim().toLowerCase();
    if (query.length < 2 || query.length > 200 || (owner && !/^[a-z\d][a-z\d-]{0,38}$/i.test(owner))) return Response.json({ error: 'search' }, { status: 400 });
    const url = new URL('/api/search', origin);
    url.search = new URLSearchParams({ q: query, limit: '100', ...(owner ? { owner } : {}) }).toString();
    const data = await json(url, signal);
    const items = data.skills.slice(0, 100).map(marketplaceSkill).filter(item => !owner || item.source.split('/')[0].toLowerCase() === owner);
    return Response.json([...new Map(items.map(item => [item.id, item])).values()]);
  }
  const board = Object.hasOwn(boardNames, view) ? boardNames[view] : undefined;
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('size'));
  if (!board || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !pageSizes.includes(pageSize)) return Response.json({ error: 'board' }, { status: 400 });
  const offset = (page - 1) * pageSize;
  const first = Math.floor(offset / chunkSize) + 1;
  const localOffset = offset % chunkSize;
  const readChunk = index => json(`${origin}/api/skills/${board}/${index}`, signal);
  const data = await readChunk(first);
  if (!Array.isArray(data.skills) || data.skills.length > chunkSize || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error('Invalid leaderboard');
  let rows = data.skills.slice(localOffset, localOffset + pageSize);
  if (rows.length < pageSize && data.hasMore) rows = rows.concat((await readChunk(first + 1)).skills.slice(0, pageSize - rows.length));
  return Response.json({ skills: rows.map(marketplaceSkill), page, total: data.total, totalPages: Math.max(1, Math.ceil(data.total / pageSize)), stale: false, fetchedAt: Math.floor(Date.now() / 1000) });
}
