import { skillDocumentUrl } from './skill-document';

// HTML is parsed in an inert template and projected into the existing document renderer.
// Template contents are never inserted into the active document.
export function websiteDocumentFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}
export function websiteIntroduction(html: string): string | null {
  const fragment = websiteDocumentFragment(html);
  const paragraphs: string[] = [];
  for (const node of Array.from(fragment.children)) {
    if (paragraphs.length && /^H[1-6]$/.test(node.tagName)) break;
    if (node.tagName === 'P') {
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      if (text) paragraphs.push(text);
      if (paragraphs.length === 2) break;
    }
  }
  return paragraphs.length ? paragraphs.join(' ').slice(0, 2000) : null;
}
export function websiteDocumentUrl(value: string | undefined, origin = 'https://www.skills.sh/'): string | undefined {
  if (value?.startsWith('/') && !value.startsWith('//')) {
    try {
      const url = new URL(value, origin);
      return url.origin === new URL(origin).origin ? skillDocumentUrl(url.href) : undefined;
    } catch { return undefined; }
  }
  return skillDocumentUrl(value);
}
export const websiteDocumentTags = new Set(['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'em', 'strong', 'a', 'hr', 'br', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'del', 's', 'sup', 'sub', 'kbd']);
export const blockedDocumentTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'source']);

// App update notes contain user-facing lists only; release/download/build material stays on GitHub.
export function applicationReleaseSummary(html: string): string {
  const fragment = websiteDocumentFragment(html);
  const sections: string[] = [];
  let heading: Element | null = null;
  let lists: string[] = [];
  const titles = new Set(['新增功能', '功能优化', 'bug修复', 'added', 'improvements', 'bugfixes', 'fixed']);
  const finish = () => {
    if (heading && lists.length) sections.push(heading.outerHTML + lists.join(''));
    lists = [];
  };
  for (const node of Array.from(fragment.children)) {
    if (/^H[1-6]$/.test(node.tagName)) {
      finish();
      heading = node.tagName === 'H2' && titles.has(node.textContent?.replace(/\s+/g, '').toLowerCase() ?? '') ? node : null;
    } else if (heading && ['UL', 'OL'].includes(node.tagName) && node.querySelector('li')) {
      lists.push(node.outerHTML);
    }
  }
  finish();
  return sections.join('');
}
