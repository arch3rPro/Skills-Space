import { websiteDocumentFragment, websiteDocumentTags, blockedDocumentTags, websiteDocumentUrl } from "@/lib/website-document";
import { createContext, createElement, useContext, useId, useMemo, type ReactNode, type ComponentProps } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { skillDocumentUrl, skillMarkdownBody, remarkSkillHeadings, documentHeadingSlug } from "@/lib/skill-document";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";
import { CodeBlock, CodeBlockActions, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader, CodeBlockLine, CodeBlockTitle } from "@/components/ui/code-block";

const DocumentContext = createContext({ zh: false, onOpenExternal: (_url: string) => {} });

function MarkdownCodeBlock({ node, children }: ComponentProps<"pre"> & ExtraProps) {
  const element = node?.children.find(child => child.type === "element" && child.tagName === "code");
  const raw = element?.type === "element" ? element.children.map(child => child.type === "text" ? child.value : "").join("") : "";
  // react-markdown appends a newline to every block; do not copy that extra byte.
  const code = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  const classes = element?.type === "element" ? element.properties.className : undefined;
  const languageClass = Array.isArray(classes) ? classes.find(value => typeof value === "string" && value.startsWith("language-")) : undefined;
  const language = typeof languageClass === "string" ? languageClass.slice(9) : "";
  if (!element) return <pre>{children}</pre>;
  return <SkillCodeBlock code={code} language={language} />;
}
export function SkillCodeBlock({ code, language = '', zh: languageZh, wrap = true }: { code: string; language?: string; zh?: boolean; wrap?: boolean }) {
  const { zh: contextZh } = useContext(DocumentContext);
  const zh = languageZh ?? contextZh;
  const lines = useHighlightedCode(code, language);
  return <CodeBlock>
    <CodeBlockHeader>
      <CodeBlockTitle>{language || (zh ? "纯文本" : "Plain text")}</CodeBlockTitle>
      <CodeBlockActions><CodeBlockCopyButton value={code} zh={zh} /></CodeBlockActions>
    </CodeBlockHeader>
    <CodeBlockContent language={language || undefined} wrap={wrap} aria-label={zh ? "代码" : "Code"}>
      {lines.map((line, index) => <CodeBlockLine key={index}>{line}</CodeBlockLine>)}
    </CodeBlockContent>
  </CodeBlock>;
}

const components: Components = {
  pre: MarkdownCodeBlock,
  a: function MarkdownLink({ href, children }) {
    const { onOpenExternal } = useContext(DocumentContext);
    if (href?.startsWith("#")) return <a href={href} onClick={event => {
      event.preventDefault();
      let slug: string;
      try { slug = decodeURIComponent(href.slice(1)); } catch { return; }
      const article = event.currentTarget.closest(".skill-markdown");
      const heading = Array.from(article?.querySelectorAll<HTMLElement>("[data-markdown-anchor]") ?? []).find(item => item.dataset.markdownAnchor === slug);
      heading?.scrollIntoView({ block: "start" });
      heading?.focus({ preventScroll: true });
    }}>{children}</a>;
    const url = skillDocumentUrl(href);
    return url ? <a href={url} onClick={event => { event.preventDefault(); onOpenExternal(url); }}>{children}</a> : <span>{children}</span>;
  },
  img: ({ src, alt }) => {
    const url = typeof src === "string" ? skillDocumentUrl(src) : undefined;
    return url ? <img src={url} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>;
  },
  table: ({ children }) => <div className="skill-markdown-table" tabIndex={0} role="region" aria-label="Table"><table>{children}</table></div>,
};

export function SkillMarkdown({ content, zh, onOpenExternal }: { content: string; zh: boolean; onOpenExternal: (url: string) => void }) {
  const prefix = useId();
  const plugins = useMemo(() => [remarkGfm, [remarkSkillHeadings, { prefix }] satisfies [typeof remarkSkillHeadings, { prefix: string }]], [prefix]);
  return <DocumentContext.Provider value={{ zh, onOpenExternal }}>
    <article className="skill-markdown"><Markdown remarkPlugins={plugins} components={components} skipHtml>{skillMarkdownBody(content)}</Markdown></article>
  </DocumentContext.Provider>;
}

/** Render the site's complete document with shared typography and code blocks, without its scripts, styles or event attributes. */
export function SkillHtml({ html, zh, onOpenExternal, origin }: { html: string; zh: boolean; onOpenExternal: (url: string) => void; origin?: string }) {
  const prefix = useId();
  const rendered = useMemo(() => {
    const fragment = websiteDocumentFragment(html);
    const headings = new Set<string>();
    const render = (node: ChildNode, key: string): ReactNode => {
      if (node.nodeType === 3) return node.textContent;
      if (!(node instanceof Element)) return null;
      const tag = node.tagName.toLowerCase();
      if (tag === 'input' && node.getAttribute('type')?.toLowerCase() === 'checkbox') return <input key={key} type="checkbox" checked={node.hasAttribute('checked')} disabled readOnly />;
      if (blockedDocumentTags.has(tag)) return null;
      const children = Array.from(node.childNodes).map((child, index) => render(child, `${key}-${index}`));
      if (!websiteDocumentTags.has(tag)) return children;
      if (tag === 'pre') {
        const code = Array.from(node.children).find(child => child.tagName === 'CODE') ?? node;
        const language = code.getAttribute('class')?.split(/\s+/).find(value => value.startsWith('language-'))?.slice(9);
        return <SkillCodeBlock key={key} code={code.textContent ?? ''} language={language} />;
      }
      if (tag === 'a') return <WebsiteLink key={key} origin={origin} href={node.getAttribute('href') ?? undefined}>{children}</WebsiteLink>;
      if (tag === 'img') {
        const src = websiteDocumentUrl(node.getAttribute('src') ?? undefined, origin);
        return src ? <img key={key} src={src} alt={node.getAttribute('alt') ?? ''} loading="lazy" referrerPolicy="no-referrer" /> : node.getAttribute('alt');
      }
      if (tag === 'table') return <div key={key} className="skill-markdown-table" tabIndex={0} role="region" aria-label={zh ? '表格' : 'Table'}><table>{children}</table></div>;
      if (/^h[1-6]$/.test(tag)) {
        const slug = documentHeadingSlug(node.getAttribute('id') || node.textContent || '', headings);
        return createElement(tag, { key, id: `${prefix}-${slug}`, 'data-markdown-anchor': slug, tabIndex: -1 }, children);
      }
      if (tag === 'br' || tag === 'hr') return createElement(tag, { key });
      if (tag === 'ol') {
        const value = node.getAttribute('start');
        return <ol key={key} start={value && /^\d+$/.test(value) ? Number(value) : undefined}>{children}</ol>;
      }
      // Never spread remote attributes, classes, inline styles or event handlers.
      return createElement(tag, { key }, children);
    };
    return Array.from(fragment.childNodes).map((node, index) => render(node, String(index)));
  }, [html, prefix, zh, origin]);
  return <DocumentContext.Provider value={{ zh, onOpenExternal }}><article className="skill-markdown">{rendered}</article></DocumentContext.Provider>;
}
function WebsiteLink({ href, children, origin }: { href?: string; children: ReactNode; origin?: string }) {
  const { onOpenExternal } = useContext(DocumentContext);
  if (href?.startsWith('#')) return <a href={href} onClick={event => {
    event.preventDefault();
    let slug: string;
    try { slug = decodeURIComponent(href.slice(1)); } catch { return; }
    const article = event.currentTarget.closest('.skill-markdown');
    const heading = Array.from(article?.querySelectorAll<HTMLElement>('[data-markdown-anchor]') ?? []).find(item => item.dataset.markdownAnchor === slug);
    heading?.scrollIntoView({ block: 'start' }); heading?.focus({ preventScroll: true });
  }}>{children}</a>;
  const url = websiteDocumentUrl(href, origin);
  return url ? <a href={url} onClick={event => { event.preventDefault(); onOpenExternal(url); }}>{children}</a> : <span>{children}</span>;
}
