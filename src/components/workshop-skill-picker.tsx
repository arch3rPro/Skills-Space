import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClipboardCheckIcon,FilePenLineIcon,WandSparklesIcon} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Popover,PopoverAnchor,PopoverContent} from '@/components/ui/popover';
import type {WorkshopSkillId} from '@/lib/workshop';
export const invocationMarker='\uFFFC';
export const workshopSkillLabels={creator:['技能创建','Skill creation'],evaluator:['技能评估','Skill evaluation'],optimizer:['技能优化','Skill optimization']};
const names={creator:'skill-creator',evaluator:'skill-evaluator',optimizer:'skill-optimizer'};
const icons={creator:FilePenLineIcon,evaluator:ClipboardCheckIcon,optimizer:WandSparklesIcon};
const ids=['creator','evaluator','optimizer'] as const;
function tokenMarkup(id:WorkshopSkillId,zh:boolean){const Icon=icons[id];return renderToStaticMarkup(<span contentEditable={false} data-skill={id} data-language={zh?'zh':'en'} aria-label={workshopSkillLabels[id][zh?0:1]}><Badge variant="link" presentation="invocation"><Icon aria-hidden="true"/>{workshopSkillLabels[id][zh?0:1]}</Badge></span>);}
type Piece={node:Node;start:number;end:number;text:string;kind:'text'|'atom'|'break'|'block'};
function editorModel(root:Node){
 let text='';const pieces:Piece[]=[];
 const add=(node:Node,part:string,kind:Piece['kind'])=>{if(!part)return;const start=text.length;text+=part;pieces.push({node,start,end:text.length,text:part,kind});};
 function walk(node:Node){
  if(node.nodeType===Node.TEXT_NODE){add(node,node.textContent??'','text');return;}
  if(node instanceof HTMLElement&&node.dataset.skill){add(node,invocationMarker,'atom');return;}
  if(node.nodeName==='BR'){const placeholder=node.parentNode?.childNodes.length===1||!node.nextSibling&&node.previousSibling?.nodeName==='BR';if(!placeholder)add(node,'\n','break');return;}
  let prior=false;for(const child of node.childNodes){const block=['DIV','P'].includes(child.nodeName);if(block&&prior&&!text.endsWith('\n'))add(child,'\n','block');const start=text.length;walk(child);if(block||text.length>start)prior=true;}
 }
 walk(root);return {text,pieces};
}
function editorText(root:Node){return editorModel(root).text;}
function boundary(piece:Piece,end:boolean):{node:Node;offset:number}{
 if(piece.kind==='text')return {node:piece.node,offset:end?piece.text.length:0};
 if(piece.kind==='block'&&end)return {node:piece.node,offset:0};
 const parent=piece.node.parentNode;if(!parent)return {node:piece.node,offset:0};
 return {node:parent,offset:Array.from(parent.childNodes).findIndex(child=>child===piece.node)+(end?1:0)};
}
function caretOffset(root:HTMLElement){
 const selection=window.getSelection();if(!selection?.rangeCount||!root.contains(selection.anchorNode))return null;
 const caret=selection.getRangeAt(0).cloneRange();caret.collapse(true);let offset=0;
 for(const piece of editorModel(root).pieces){
  if(piece.kind==='text'&&piece.node===caret.startContainer)return piece.start+Math.min(caret.startOffset,piece.text.length);
  const point=boundary(piece,true),range=document.createRange();range.setStart(point.node,point.offset);range.collapse(true);
  if(range.compareBoundaryPoints(Range.START_TO_START,caret)<=0)offset=piece.end;else break;
 }
 return offset;
}
function textPoint(root:HTMLElement,offset:number):{node:Node;offset:number}{
 for(const piece of editorModel(root).pieces){if(offset<=piece.end){if(piece.kind==='text')return {node:piece.node,offset:Math.max(0,offset-piece.start)};return boundary(piece,offset>piece.start);}}
 return {node:root,offset:root.childNodes.length};
}
function moveCaret(root:HTMLElement,offset:number){const point=textPoint(root,offset),range=document.createRange();range.setStart(point.node,point.offset);range.collapse(true);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}
export function WorkshopPrompt({value,skill,onChange,disabled,hasSkill,zh,onSend,running,placeholder,onMenuOpenChange}:{value:string;skill?:WorkshopSkillId;onChange:(text:string,skill?:WorkshopSkillId)=>void;disabled:boolean;hasSkill:boolean;zh:boolean;onSend:()=>void;running:boolean;placeholder?:string;onMenuOpenChange?:(open:boolean)=>void}){
 const editor=useRef<HTMLDivElement>(null),composing=useRef(false),dismissed=useRef<string|null>(null),queryRange=useRef<{start:number;end:number}|null>(null);
 const [query,setQuery]=useState<string|null>(null),[highlight,setHighlight]=useState<WorkshopSkillId>('creator');
 const enabled=ids.filter(id=>hasSkill||id==='creator');
 const visible=ids.filter(id=>[names[id],...workshopSkillLabels[id]].join(' ').toLowerCase().includes((query??'').toLowerCase()));
 const active=visible.includes(highlight)&&enabled.includes(highlight)?highlight:visible.find(id=>enabled.includes(id));
 const open=query!==null&&!disabled;
 useEffect(()=>{onMenuOpenChange?.(open);return()=>onMenuOpenChange?.(false);},[open,onMenuOpenChange]);
 function inspect(){const root=editor.current;if(!root||composing.current)return;const text=editorText(root),offset=caretOffset(root);const before=offset===null?'':text.slice(0,offset),match=/(?:^|\s)\/([^\s\uFFFC]*)$/.exec(before);const signature=match?`${offset}:${match[1]}`:null;if(match&&signature!==dismissed.current){queryRange.current={start:(offset??0)-match[1].length-1,end:offset??0};setQuery(match[1]);}else {queryRange.current=null;setQuery(null);}}
 function sync(){const root=editor.current;if(!root)return;const node=root.querySelector<HTMLElement>('[data-skill]'),id=ids.find(id=>id===node?.dataset.skill);if(node&&id){node.contentEditable='false';if(node.textContent!==workshopSkillLabels[id][zh?0:1]){const template=document.createElement('template');template.innerHTML=tokenMarkup(id,zh);node.replaceWith(template.content);}const token=root.querySelector<HTMLElement>('[data-skill]'),selection=window.getSelection();if(token&&selection?.anchorNode&&token.contains(selection.anchorNode)){const piece=editorModel(root).pieces.find(p=>p.kind==='atom');if(piece)moveCaret(root,piece.end);}}onChange(editorText(root),id);inspect();}
 useLayoutEffect(()=>{
  const root=editor.current;if(!root||composing.current)return;
  const current=root.querySelector<HTMLElement>('[data-skill]'),expected=value.includes(invocationMarker)?skill:undefined;
  if(editorText(root)!==value||current?.dataset.skill!==expected||!!current&&current.dataset.language!==(zh?'zh':'en')){
   const focused=document.activeElement===root,offset=caretOffset(root);root.replaceChildren();
   const index=expected?value.indexOf(invocationMarker):-1;
   if(index<0||!expected)root.append(document.createTextNode(value.split(invocationMarker).join('')));
   else {root.append(document.createTextNode(value.slice(0,index)));const template=document.createElement('template');template.innerHTML=tokenMarkup(expected,zh);root.append(template.content,document.createTextNode(value.slice(index+1)));}
   if(focused&&offset!==null)moveCaret(root,Math.min(offset,value.length));
  }
 },[value,skill,zh]);
 function close(){const offset=editor.current?caretOffset(editor.current):null;dismissed.current=`${offset}:${query??''}`;setQuery(null);}
 function replaceSelection(start:number,end:number){const root=editor.current;if(!root)return;const a=textPoint(root,start),b=textPoint(root,end),range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}
 function select(id:WorkshopSkillId){
  const root=editor.current,command=queryRange.current;if(!root||!command)return;
  let start=command.start,end=command.end;const current=editorText(root).indexOf(invocationMarker);root.focus();
  if(current>=0){replaceSelection(current,current+1);document.execCommand('delete');if(current<start){start--;end--;}}
  replaceSelection(start,end);setQuery(null);queryRange.current=null;dismissed.current=null;
  document.execCommand('insertHTML',false,tokenMarkup(id,zh)+' ');sync();
 }
 function insertText(text:string){const root=editor.current;if(!root)return;root.focus();document.execCommand('insertText',false,text);sync();}
 function keyDown(event:KeyboardEvent<HTMLDivElement>){
  if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return;
  if(open){if(event.key==='Escape'){event.preventDefault();close();return;}if((event.key==='ArrowDown'||event.key==='ArrowUp')&&visible.length){event.preventDefault();const choices=visible.filter(id=>enabled.includes(id)),index=active?choices.indexOf(active):-1;if(choices.length)setHighlight(choices[(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length]);return;}if((event.key==='Enter'||event.key==='Tab')&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&active){event.preventDefault();select(active);return;}}
  if(event.key==='Enter'){event.preventDefault();if(event.shiftKey)insertText('\n');else if(!running&&!disabled&&value.split(invocationMarker).join('').trim()&&!open)onSend();return;}
  const root=editor.current;if(!root)return;
  if(event.key==='Backspace'||event.key==='Delete'){const selection=window.getSelection(),offset=caretOffset(root),text=editorText(root);if(selection?.isCollapsed&&offset!==null){const position=event.key==='Backspace'?offset-1:offset;if(text[position]===invocationMarker){event.preventDefault();replaceSelection(position,position+1);document.execCommand('delete');sync();}}}
 }
 return <Popover open={open} onOpenChange={next=>{if(!next)close();}}><PopoverAnchor asChild><div className="min-w-0"><div ref={editor} id="workshop-message" role="textbox" aria-label={zh?'发送消息':'Send a message'} aria-multiline="true" aria-describedby="workshop-composer-help" aria-autocomplete="list" aria-controls={open?'workshop-invocation-options':undefined} aria-activedescendant={open&&active?`workshop-invocation-${active}`:undefined} aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning data-placeholder={placeholder??(zh?'描述你的想法，输入 / 调用技能…':'Describe what you need. Type / to choose a skill…')} data-empty={!value} className="prompt-editor no-scrollbar min-h-16 max-h-40 min-w-0 overflow-y-auto whitespace-pre-wrap break-words px-2.5 py-2 text-sm leading-6 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]" onInput={sync} onClick={inspect} onKeyUp={event=>{if(!['Escape','Enter','Tab','ArrowDown','ArrowUp'].includes(event.key))inspect();}} onKeyDown={keyDown} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;sync();}} onDrop={event=>event.preventDefault()} onPaste={event=>{event.preventDefault();insertText(event.clipboardData.getData('text/plain').replace(/\r\n/g,'\n').split(invocationMarker).join(''));}}/></div></PopoverAnchor>
 <PopoverContent side="top" align="start" className="w-80 p-1" onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>{event.preventDefault();editor.current?.focus();}} onInteractOutside={event=>{if(event.target instanceof Node&&editor.current?.contains(event.target))event.preventDefault();}}><div id="workshop-invocation-options" role="listbox" aria-label={zh?'技能':'Skills'}>{visible.map(id=>{const Icon=icons[id];return <Button key={id} id={`workshop-invocation-${id}`} variant="navigation" role="option" aria-selected={id===active} data-highlighted={id===active?'':undefined} className="h-auto gap-3 py-2.5" disabled={!enabled.includes(id)} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>setHighlight(id)} onClick={()=>select(id)}><Icon/><span className="min-w-0 flex-1 text-left">{workshopSkillLabels[id][zh?0:1]}</span><span className="font-mono text-xs font-normal text-muted-foreground">{names[id]}</span></Button>;})}{!visible.length?<p className="px-3 py-4 text-sm text-muted-foreground">{zh?'没有匹配的技能':'No matching skills'}</p>:null}</div></PopoverContent></Popover>;
}
