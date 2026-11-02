/** The detail header already presents skill metadata; preview renders the body. */
export function skillMarkdownBody(source: string): string {
  return source.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
}

/** Relative resources need a native, validated reader; never navigate the WebView. */
export function skillDocumentUrl(value: string | undefined): string | undefined {
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.username || url.password ? undefined : url.href;
  } catch { return undefined; }
}

export function diffLines(value: string): Array<{kind: string; oldLine: number | null; newLine: number | null; text: string}> {
  let oldLine=0,newLine=0;
  return value.split("\n").filter(line=>line!=="").map(line=>{
    const hunk=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if(hunk){oldLine=Number(hunk[1]);newLine=Number(hunk[2]);return {kind:"hunk",oldLine:null,newLine:null,text:line};}
    if(line.startsWith("+"))return {kind:"added",oldLine:null,newLine:newLine++,text:line};
    if(line.startsWith("-"))return {kind:"removed",oldLine:oldLine++,newLine:null,text:line};
    if(line.startsWith(" "))return {kind:"context",oldLine:oldLine++,newLine:newLine++,text:line};
    return {kind:"note",oldLine:null,newLine:null,text:line};
  });
}
export function shortSkillVersion(value: string | null): string | null {
  return value && /^[a-f0-9]{32,64}$/i.test(value) ? value.slice(0,7) : value;
}


// Operate on parsed Markdown so formatting, code and duplicate headings share stable anchors.
type HeadingNode = {
  type: string;
  value?: string;
  alt?: string;
  children?: HeadingNode[];
  data?: { hProperties?: Record<string, unknown> };
};
export function documentHeadingSlug(value: string, used: Set<string>): string {
  const base = value.toLowerCase().trim().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "").replace(/\s/g, "-");
  let slug = base, suffix = 0;
  while (used.has(slug)) slug = `${base}-${++suffix}`;
  used.add(slug);
  return slug;
}
export function remarkSkillHeadings({ prefix }: { prefix: string }) {
  return (tree: HeadingNode) => {
    const used = new Set<string>();
    const text = (node: HeadingNode): string => node.value ?? node.alt ?? node.children?.map(text).join("") ?? "";
    const visit = (node: HeadingNode) => {
      if (node.type === "heading") {
        const slug = documentHeadingSlug(text(node), used);
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: `${prefix}-${slug}`, "data-markdown-anchor": slug, tabIndex: -1 } };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
