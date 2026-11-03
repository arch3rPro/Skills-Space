import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Tooltip as TooltipPrimitive} from 'radix-ui';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const output=resolve('.scratch/skill-document-check/component.mjs');
mkdirSync(resolve('.scratch/skill-document-check'),{recursive:true});
await build({entryPoints:['src/components/skill-document.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
const {SkillDocument}=await import(pathToFileURL(output).href);
const render=content=>renderToStaticMarkup(createElement(SkillDocument,{content,zh:true,onOpenExternal:()=>{}}));

test('pending documents expose a skeleton; settled empty or failed reads do not remain loading',()=>{
 const pending=renderToStaticMarkup(createElement(SkillDocument,{content:'',loading:true,zh:true,onOpenExternal:()=>{}}));
 assert(pending.includes('aria-busy="true"'));
 assert(pending.includes('data-slot="skeleton"'));
 assert(pending.includes('role="status"'));
 const settled=render('');
 assert(!settled.includes('data-slot="skeleton"'));
 assert(!settled.includes('读取中'));
});

test('detail renders Markdown and GFM as semantic content without repeating metadata',()=>{
 const html=render('---\nname: example\ndescription: Metadata only\n---\n# Guide\n\n**Strong** and `inline`.\n\n- Item\n- [x] Done\n\n| Key | Value |\n| --- | --- |\n| A | B |\n\n```sh\necho hello\n```\n\n[Docs](https://example.com/docs)');
 for(const text of ['data-markdown-anchor="guide"','<strong>Strong</strong>','<code>inline</code>','<table>','<th>Key</th>','language-sh','type="checkbox"','disabled=""','href="https://example.com/docs"'])assert.ok(html.includes(text),text);
 assert.match(html, /<code[^>]*class="[^"]*\blanguage-sh\b/);
 assert.match(html, /<ul(?:\s[^>]*)?>/);
 assert.ok(html.includes('<li>Item</li>'));
 assert.ok(!html.includes('Metadata only'));
 assert.ok(html.includes('预览')&&html.includes('源码'));
});

test('untrusted skill Markdown cannot inject HTML or navigate executable/local URLs',()=>{
 const html=render('# Safe\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[Run](javascript:alert%281%29)\n\n[Local](file:///etc/passwd)\n\n[Relative](./run.sh)\n\n![Unsafe](data:image/svg+xml,evil)\n\n![Diagram](https://example.com/diagram.png)');
 for(const text of ['<script','onerror','javascript:','file:///','href="./','src="data:'])assert.ok(!html.includes(text),text);
 assert.ok(html.includes('referrerPolicy="no-referrer"'));
 assert.ok(html.includes('src="https://example.com/diagram.png"'));
});

test('modified skill documents add Diff after Source without exposing it for ordinary documents',()=>{
 const html=renderToStaticMarkup(createElement(SkillDocument,{content:'# Example',zh:true,showDiff:true,onDiff:async()=>({revision:'r',version:'v',files:[]}),onOpenExternal:()=>{}}));
 assert(html.indexOf('预览')<html.indexOf('源码'));
 assert(html.indexOf('源码')<html.indexOf('差异'));
 assert(!render('# Example').includes('差异'));
});

const diffOutput=resolve('.scratch/skill-document-check/diff.mjs');
await build({entryPoints:['src/components/skill-diff-view.tsx'],outfile:diffOutput,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
const {SkillDiffView}=await import(pathToFileURL(diffOutput).href);
test('diff lists supporting and binary files with per-file restore actions',()=>{
 const data={version:'v',revision:'r',files:[{path:'scripts/check.sh',status:'modified',binary:false,diff:'@@ -1 +1 @@\n-old\n+new'},{path:'assets/icon.bin',status:'added',binary:true,diff:''}]};
 const html=renderToStaticMarkup(createElement(SkillDiffView,{data,loading:false,error:'',zh:true,onRestore:async()=>{}}));
 assert(html.includes('scripts/check.sh'));assert(html.includes('assets/icon.bin'));assert(html.includes('二进制内容差异'));
 assert.equal((html.match(/恢复文件/g)||[]).length,2);
 assert(!html.includes('读取中'));
});


test('code blocks expose a persistent language header and accessible copy action without changing inline code', () => {
 const html=render('Inline `echo hello`.\n\n```yaml\nid: no-eval\n\n  enabled: false\n```\n\n```unknown-language\n<script>alert(1)</script>\n```');
 assert(html.includes('<code>echo hello</code>'));
 assert.equal((html.match(/data-slot="code-block-header"/g)||[]).length,2);
 assert.equal((html.match(/aria-label="复制代码"/g)||[]).length,2);
 assert(html.includes('language-yaml'));
 assert(html.includes('language-unknown-language'));
 assert(html.includes('tabindex="0"'));
 assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert(!html.includes('<script>'));
 assert(html.includes('id: no-eval'));
 assert(html.includes('  enabled: false'));
});

test('headings support scoped anchors, duplicate names and encoded Chinese links', () => {
 const html=render('[Jump](#hello-world) [中文](#%E7%A4%BA%E4%BE%8B)\n\n# Hello **world**\n\n## Hello world\n\n## Hello world-1\n\n## 示例');
 for(const slug of ['hello-world','hello-world-1','hello-world-1-1','示例']) assert(html.includes(`data-markdown-anchor="${slug}"`),slug);
 assert(html.includes('href="#hello-world"'));
 assert(html.includes('href="#%E7%A4%BA%E4%BE%8B"'));
 assert.equal((html.match(/<h[1-6][^>]*tabindex="-1"/g)||[]).length,4);
});

const highlighterOutput=resolve('.scratch/skill-document-check/highlighter.mjs');
await build({entryPoints:['src/lib/highlighter.tsx'],outfile:highlighterOutput,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
const {highlightCode}=await import(pathToFileURL(highlighterOutput).href);
test('real highlighter preserves code text and blank lines, supports aliases and safely rejects unknown languages',async()=>{
 for(const language of ['yaml','scheme','sh','ts','json']){
  const code=language==='scheme'?'; comment\n(call_expression)':'# comment\n  key: "value"\n\n';
  const lines=await highlightCode(code,language);
  assert(lines && lines.length===code.split('\n').length,language);
  assert.equal(lines.map(line=>line.map(token=>token.props.children).join('')).join('\n'),code);
  assert(renderToStaticMarkup(createElement('div',null,lines.flat())).includes('--shiki-light'));
 }
 for(const language of ['unknown-language','constructor','__proto__','']) assert.equal(await highlightCode('plain',language),null);
});

const websiteOutput=resolve('.scratch/skill-document-check/website.mjs');
const websiteHelperOutput=resolve('.scratch/skill-document-check/website-helpers.mjs');
await build({entryPoints:['src/components/skill-markdown.tsx'],outfile:websiteOutput,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
await build({entryPoints:['src/lib/website-document.ts'],outfile:websiteHelperOutput,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {SkillHtml}=await import(pathToFileURL(websiteOutput).href);
const {websiteIntroduction,websiteDocumentUrl,applicationReleaseSummary}=await import(pathToFileURL(websiteHelperOutput).href);

// Minimal DOM-node fixture for the React projection. Browser template parsing is
// separately observed in the actual App; these tests never insert active DOM.
class WebsiteElementFixture {
 constructor(tag,attributes={},children=[]) {this.nodeType=1;this.tagName=tag.toUpperCase();this.attributes=attributes;this.childNodes=children;}
 get children(){return this.childNodes.filter(node=>node instanceof WebsiteElementFixture);}
 get textContent(){return this.childNodes.map(node=>node.textContent??'').join('');}
 get outerHTML(){const tag=this.tagName.toLowerCase();return `<${tag}>${this.childNodes.map(node=>node.outerHTML??node.textContent).join('')}</${tag}>`;}
 querySelector(tag){return this.children.find(node=>node.tagName===tag.toUpperCase())??this.children.map(node=>node.querySelector(tag)).find(Boolean)??null;}
 getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
 hasAttribute(name){return Object.hasOwn(this.attributes,name);}
}
const websiteText=value=>({nodeType:3,textContent:value});
const websiteElement=(tag,attrs,...children)=>new WebsiteElementFixture(tag,attrs,children.map(child=>typeof child==='string'?websiteText(child):child));
function withWebsiteFixture(nodes,run){
 const oldDocument=globalThis.document,oldElement=globalThis.Element;
 globalThis.Element=WebsiteElementFixture;
 globalThis.document={createElement(tag){assert.equal(tag,'template','only inert template creation is permitted');return {content:{childNodes:nodes,children:nodes.filter(node=>node instanceof WebsiteElementFixture)},set innerHTML(value){assert.equal(value,'synthetic website document');}};}};
 try{return run();}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldElement===undefined)delete globalThis.Element;else globalThis.Element=oldElement;}
}
const renderWebsite=nodes=>withWebsiteFixture(nodes,()=>renderToStaticMarkup(createElement(SkillHtml,{html:'synthetic website document',zh:true,onOpenExternal:()=>{}})));

test('website resources resolve only trusted origin-root paths while installed Markdown retains stricter URL rules',()=>{
 assert.equal(websiteDocumentUrl('/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png'),'https://www.skills.sh/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png');
 assert.equal(websiteDocumentUrl('/docs#guide'),'https://www.skills.sh/docs#guide');
 assert.equal(websiteDocumentUrl('/arch3rPro/Skills-Space/releases/tag/v0.1.0','https://github.com/'),'https://github.com/arch3rPro/Skills-Space/releases/tag/v0.1.0');
 assert.equal(websiteDocumentUrl('/\\evil.test/file','https://github.com/'),undefined);
 assert.equal(websiteDocumentUrl('https://example.com/image.png'),'https://example.com/image.png');
 for(const value of ['//evil.test/image.png','/\\evil.test/image.png','javascript:alert(1)','data:image/svg+xml,evil','file:///etc/passwd','https://user:secret@example.com/file','./unknown.png'])assert.equal(websiteDocumentUrl(value),undefined,value);
});
test('website HTML projection preserves complete headings, tables and shared code-block semantics',()=>{
 const e=websiteElement;
 const html=renderWebsite([e('h1',{id:'guide'},'Guide'),e('h2',{id:'guide'},'Guide'),e('h2',{},'示例'),e('p',{},'Actual beginning'),e('pre',{},e('code',{class:'language-js'},'const x = "<script>literal</script>";\n')),e('table',{},e('thead',{},e('tr',{},e('th',{},'Key'))),e('tbody',{},e('tr',{},e('td',{},'Value')))),e('p',{},'Complete ending')]);
 for(const text of ['data-markdown-anchor="guide"','data-markdown-anchor="guide-1"','data-markdown-anchor="示例"','data-slot="code-block-header"','aria-label="复制代码"','language-js','<table>','<th>Key</th>','<td>Value</td>','Complete ending'])assert(html.includes(text),text);
 assert(html.includes('&lt;script&gt;literal&lt;/script&gt;'));assert(!html.includes('<script>'));
});
test('website projection drops active elements and remote attributes but keeps safe links, images and readonly tasks',()=>{
 const e=websiteElement;
 const html=renderWebsite([e('p',{class:'remote-class',style:'background:magenta',onclick:'BAD_EVENT'},'Safe text'),e('script',{},'MUST_NOT_APPEAR_SCRIPT'),e('style',{},'MUST_NOT_APPEAR_STYLE'),e('iframe',{src:'https://evil.test'},'MUST_NOT_APPEAR_IFRAME'),e('form',{action:'https://evil.test'},'MUST_NOT_APPEAR_FORM'),e('svg',{},'MUST_NOT_APPEAR_SVG'),e('custom-widget',{onclick:'BAD_EVENT'},e('strong',{},'Kept child')),e('a',{href:'javascript:alert(1)'},'Unsafe link'),e('a',{href:'/docs',onclick:'BAD_EVENT'},'Safe root link'),e('img',{src:'/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png',alt:'Banner',onerror:'BAD_EVENT'}),e('img',{src:'data:image/svg+xml,evil',alt:'Unsafe image'}),e('input',{type:'checkbox',checked:'',onclick:'BAD_EVENT'}),e('input',{type:'text',value:'MUST_NOT_APPEAR_INPUT'})]);
 for(const text of ['MUST_NOT_APPEAR','BAD_EVENT','remote-class','background:magenta','javascript:','<script','<iframe','<form','<svg','<custom-widget','src="data:'])assert(!html.includes(text),text);
 for(const text of ['<strong>Kept child</strong>','href="https://www.skills.sh/docs"','src="https://www.skills.sh/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png"','referrerPolicy="no-referrer"','disabled=""','readOnly=""','checked=""'])assert(html.includes(text),text);
});
test('website introduction uses at most two original opening paragraphs and stops at the first subsection',()=>{
 const e=websiteElement;
 const nodes=[e('h1',{},'Guide'),e('p',{},'First ',e('strong',{},'original'),' paragraph.'),e('p',{},'Second\n  original paragraph.'),e('h2',{},'Other section'),e('p',{},'Not the introduction')];
 assert.equal(withWebsiteFixture(nodes,()=>websiteIntroduction('synthetic website document')),'First original paragraph. Second original paragraph.');
 assert.equal(withWebsiteFixture([e('h2',{},'Details'),e('p',{},'Actual opening paragraph')],()=>websiteIntroduction('synthetic website document')),'Actual opening paragraph');
});


test('application notes keep feature lists and omit release logistics and first-release placeholder prose',()=>{
 const e=websiteElement;
 const nodes=[e('h1',{},'Skills Space 0.1.0'),e('p',{},'独立仓库首次发布'),
  e('h2',{},'新增功能'),e('ul',{},e('li',{},'跨 Agent 技能管理'),e('li',{},e('strong',{},'技能商店'),'与安装')),
  e('h2',{},'功能优化'),e('p',{},'首次发布，无上一正式版本'),
  e('h2',{},'Bug 修复'),e('p',{},'首次发布，不列内部修复'),
  e('h2',{},'下载'),e('ul',{},e('li',{},'macOS installer')),e('h2',{},'构建来源'),e('ol',{},e('li',{},'build commit'))];
 const summary=withWebsiteFixture(nodes,()=>applicationReleaseSummary('synthetic website document'));
 assert.equal(summary,'<h2>新增功能</h2><ul><li>跨 Agent 技能管理</li><li><strong>技能商店</strong>与安装</li></ul>');
 const updates=[e('h2',{},'功能优化'),e('ol',{},e('li',{},'加快列表加载')),e('h2',{},'Bug 修复'),e('ul',{},e('li',{},'修复目录隔离'))];
 assert.equal(withWebsiteFixture(updates,()=>applicationReleaseSummary('synthetic website document')),'<h2>功能优化</h2><ol><li>加快列表加载</li></ol><h2>Bug 修复</h2><ul><li>修复目录隔离</li></ul>');
 assert.equal(withWebsiteFixture([e('h2',{},'下载'),e('ul',{},e('li',{},'installer'))],()=>applicationReleaseSummary('synthetic website document')),'');
});

const cardOutput=resolve('.scratch/skill-document-check/inventory-card.mjs');
await build({entryPoints:['src/components/inventory-card.tsx'],outfile:cardOutput,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
const {InventoryCard}=await import(pathToFileURL(cardOutput));
test('shared normal card opens once from content but excludes independent controls and portals; bulk handler retains ownership',()=>{
 const previous=globalThis.Element;
 class Target {constructor(selector=null){this.selector=selector;} closest(selectors){return this.selector&&selectors.split(", ").includes(this.selector)?this:null;}}
 globalThis.Element=Target;
 try {
  let opened=0,selected=0;
  const card=InventoryCard({onOpen:()=>opened++});
  const event=(target,inside=true)=>({target,currentTarget:{contains:()=>inside},defaultPrevented:false});
  card.props.onClick(event(new Target()));assert.equal(opened,1);
  for(const selector of ["button","a","input","select","textarea","[role='button']","[role='switch']","[role='checkbox']","[data-hint-disabled]"])card.props.onClick(event(new Target(selector)));
  card.props.onClick(event(new Target(),false));assert.equal(opened,1);
  const prevented=event(new Target());prevented.defaultPrevented=true;card.props.onClick(prevented);assert.equal(opened,1);
  InventoryCard({onClick:()=>selected++}).props.onClick(event(new Target()));assert.equal(selected,1);assert.equal(opened,1);
  InventoryCard({onOpen:()=>opened++,onClick:e=>{e.defaultPrevented=true;}}).props.onClick(event(new Target()));assert.equal(opened,1);
 } finally {if(previous===undefined)delete globalThis.Element;else globalThis.Element=previous;}
});
test('HTML fallback disables original source and loading never claims to provide raw Markdown',()=>{
 const pending=renderToStaticMarkup(createElement(SkillDocument,{content:'',loading:true,zh:true,onOpenExternal:()=>{}}));
 assert.match(pending,/value="source"[^>]*disabled|disabled[^>]*value="source"|data-disabled/);
 assert.match(pending,/读取中/);
 const fallback=withWebsiteFixture([websiteElement('p',{},'Original website fallback')],()=>renderToStaticMarkup(createElement(TooltipPrimitive.Provider,null,createElement(SkillDocument,{content:'',html:'synthetic website document',zh:true,onOpenExternal:()=>{}}))));
 assert.match(fallback,/Original website fallback/);assert.match(fallback,/data-disabled/);assert.doesNotMatch(fallback,/<pre/);
});

const renderOptional=props=>renderToStaticMarkup(createElement(TooltipPrimitive.Provider,null,createElement(SkillDocument,{content:'# Original skill',zh:true,onOpenExternal:()=>{},...props})));
test('store optional tabs follow installation overview preview source, show full read-only command and prompt, and leave other Agents on preview',()=>{
 const command='npx skills add https://example.org/skills/chosen --skill chosen';
 const prompt='Install "chosen".\nThen read the whole document.';
 const install=renderOptional({preferInstallation:true,overviewHtml:'Summary HTML',installation:{command,prompt}});
 const labels=['安装','概述','预览','源码'];for(let i=1;i<labels.length;i++)assert(install.indexOf('>'+labels[i-1]+'<')<install.indexOf('>'+labels[i]+'<'));
 assert.match(install.match(/<button[^>]*data-state="on"[^>]*>([\s\S]*?)<\/button>/)[1],/安装/);
 assert.match(install,/https:\/\/example.org\/skills\/chosen --skill chosen/);assert.match(install,/Install &quot;chosen&quot;/);assert.match(install,/Then read the whole document/);assert.match(install,/whitespace-pre-wrap/);
 assert.equal((install.match(/aria-label="复制代码"/g)||[]).length,2);assert.doesNotMatch(install,/<h1[^>]*>Original skill/);
 const ordinary=renderOptional({});assert.match(ordinary,/<h1[^>]*>.*Original skill/);assert(!ordinary.includes('>安装<'));assert(!ordinary.includes('>概述<'));
});
test('store first available panel is overview without installation, and installation remains readable without original Markdown',()=>{
 const overview=withWebsiteFixture([websiteElement('p',{},'Independent summary only')],()=>renderOptional({content:'',overviewHtml:'synthetic website document',preferInstallation:true}));
 assert.match(overview,/Independent summary only/);assert.match(overview.match(/<button[^>]*data-state="on"[^>]*>([\s\S]*?)<\/button>/)[1],/概述/);assert.match(overview,/data-disabled/);assert.doesNotMatch(overview,/>安装</);
 const install=renderOptional({content:'',preferInstallation:true,installation:{command:'npx skills add source',prompt:null}});assert.match(install,/npx skills add source/);assert.match(install,/data-disabled/);
});

const storeCardsOutput=resolve('.scratch/skill-document-check/store-cards.mjs');
await build({stdin:{contents:readFileSync('src/components/skill-store.tsx','utf8')+'\nexport {StoreCards,InstallationChange};',loader:'tsx',resolveDir:resolve('src/components')},outfile:storeCardsOutput,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
const {StoreCards,InstallationChange}=await import(pathToFileURL(storeCardsOutput));
test('narrow and wide store installation actions retain identical eligibility, selection and busy state',()=>{
 const skill={id:'owner/repo/skill',skillId:'skill',name:'Skill',source:'owner/repo',previewable:true,installs:123000,change:null,description:'Authored'};
 const visit=(element,out=[])=>{if(!element||typeof element!=='object')return out;if(element.props?.['aria-label']==='安装 Skill')out.push(element);for(const child of [element.props?.children].flat(Infinity))visit(child,out);return out;};
 for(const allowed of [true,false])for(const disabled of [true,false]) {
  const calls=[];const tree=StoreCards({skills:[{...skill,previewable:allowed}],metric:'alltime',descriptions:new Map(),loadDescription:()=>{throw Error('not mounted');},disabled,installingSource:disabled?skill.id:null,zh:true,onOpen:()=>{},onInstall:value=>calls.push(value.id)});
  const buttons=visit(tree);assert.equal(buttons.length,2);assert.deepEqual(buttons.map(button=>button.props.size),['icon-sm','sm']);
  for(const button of buttons){assert.equal(button.props.disabled,disabled||!allowed);assert.equal(button.props['aria-busy'],disabled);button.props.onClick();}
  assert.deepEqual(calls,[skill.id,skill.id]);
 }
});

test('shared card and detail hourly change shows direction and absolute count, with complete accessible explanation and no null placeholder',()=>{
 const render=(change,compact=false)=>renderToStaticMarkup(createElement(TooltipPrimitive.Provider,null,createElement(InstallationChange,{change,compact,zh:true})));
 assert.equal(render(null),'');
 for(const [change,icon,amount,description]of [[12345,'arrow-up-right','12,345','较昨日同时段增加 12,345'],[-12345,'arrow-down-right','12,345','较昨日同时段减少 12,345'],[0,'minus','0','与昨日同时段持平']]){
  const html=render(change);assert(html.includes('lucide-'+icon));assert(html.includes('aria-label="'+description+'"'));assert(html.includes('>'+amount+'</span>'));
  const text=html.replace(/<[^>]+>/g,'');assert.equal(text,amount);
 }
 assert(render(12345,true).includes('>12.3K</span>'));assert(render(12345,true).includes('aria-label="较昨日同时段增加 12,345"'));
});

test('hot cards expose the period count and yesterday change as independent sibling fields and hints',()=>{
 const skill={id:'owner/repo/skill',skillId:'skill',name:'Skill',source:'owner/repo',previewable:true,installs:291,change:219,description:'Authored'};
 const tree=StoreCards({skills:[skill],metric:'hot',descriptions:new Map(),loadDescription:()=>{throw Error('not mounted');},disabled:false,installingSource:null,zh:true,onOpen:()=>{},onInstall:()=>{}});
 const card=tree.props.children[0],footer=card.props.children[1],children=footer.props.children;
 const count=children.find(child=>child?.props?.text==='1h安装量：291'),change=children.find(child=>child?.type===InstallationChange);
 assert(count,'the count has its own complete period hint');assert(change,'the change is a separate footer sibling');assert.notEqual(count,change);
 assert.doesNotMatch(count.props.text,/昨日|219/);assert.equal(change.props.change,219);assert.equal(change.props.compact,true);
 assert(![count.props.children].flat(Infinity).some(child=>child?.type===InstallationChange),'change does not nest inside the count hint');
});
