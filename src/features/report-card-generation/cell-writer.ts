import {parser} from 'sax';
import {parseMerge} from '@/features/report-card-templates/model';
import type {OutputValue} from './model';

export type Node={name:string;local:string;attrs:Record<string,string>;start:number;openEnd:number;closeStart:number;end:number;self:boolean;children:Node[]};
export function tree(source:string){
  const options={xmlns:true,position:true,strictEntities:true};const p=parser(true,options),stack:Node[]=[];let root:Node|undefined;
  p.onopentag=t=>{const n:Node={name:t.name,local:('local' in t?t.local:t.name),attrs:Object.fromEntries(Object.entries(t.attributes).map(([k,v])=>[k,typeof v==='string'?v:v.value])),start:p.startTagPosition-1,openEnd:p.position,closeStart:p.position,end:p.position,self:t.isSelfClosing,children:[]};if(stack.length)stack.at(-1)!.children.push(n);else root=n;stack.push(n);};
  p.onclosetag=()=>{const n=stack.pop()!;n.end=p.position;n.closeStart=n.self?n.openEnd:source.lastIndexOf('</',p.position-1);};
  p.write(source).close();if(!root)throw new Error('Worksheet XML is unavailable.');return root;
}
export const prefix=(n:Node)=>n.name.includes(':')?n.name.split(':')[0]+':':'';
export function escaped(value:string){if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value))throw new Error('A value contains unsupported Excel characters.');return value.replace(/_x[0-9a-f]{4}_/gi,m=>'_x005F_'+m.slice(1)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/\r/g,'&#13;');}
export type Edit={start:number;end:number;text:string};
export function edits(source:string,items:Edit[]){for(const e of items.sort((a,b)=>b.start-a.start||b.end-a.end))source=source.slice(0,e.start)+e.text+source.slice(e.end);return source;}
function cell(source:string,n:Node|undefined,address:string,value:OutputValue['value'],ns:string){
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Invalid numeric output.');
  const tag=n?.name??`${ns}c`,p=n?prefix(n):ns;
  let opening=n?source.slice(n.start,n.openEnd).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/\s*\/?\s*>$/,'>'):`<${tag} r="${address}">`;
  if(typeof value==='string')opening=opening.slice(0,-1)+' t="inlineStr">';
  const payload=value===null?'':typeof value==='number'?`<${p}v>${value}</${p}v>`:`<${p}is><${p}t xml:space="preserve">${escaped(value)}</${p}t></${p}is>`;
  const content=n&&!n.self?edits(source.slice(n.openEnd,n.closeStart),n.children.filter(c=>['f','v','is'].includes(c.local)).map(c=>({start:c.start-n.openEnd,end:c.end-n.openEnd,text:''}))):'';
  return opening+payload+content+`</${tag}>`;
}
export function patchSheet(source:string,root:Node,values:OutputValue[]){
  const data=root.children.find(n=>n.local==='sheetData');if(!data)throw new Error('This worksheet has no supported cell data area.');
  const grouped=new Map<number,{address:string;column:number;value:OutputValue['value']}[]>();
  for(const v of values){const r=parseMerge(v.location.address);const list=grouped.get(r.top)??[];list.push({address:r.master,column:r.left,value:v.value});grouped.set(r.top,list);}
  const rows=data.children.filter(n=>n.local==='row');let last=0;
  for(const r of rows){const index=Number(r.attrs.r);if(!Number.isInteger(index)||index<=last)throw new Error('Generation requires explicit, ordered worksheet row coordinates.');last=index;}
  const changes:Edit[]=[],insertions=new Map<number,string[]>();
  for(const [index,values] of [...grouped].sort((a,b)=>a[0]-b[0])){
    const row=rows.find(r=>Number(r.attrs.r)===index),ns=row?prefix(row):prefix(data);values.sort((a,b)=>a.column-b.column);
    if(!row){const at=rows.find(r=>Number(r.attrs.r)>index)?.start??data.closeStart;const list=insertions.get(at)??[];list.push(`<${ns}row r="${index}">${values.map(v=>cell(source,undefined,v.address,v.value,ns)).join('')}</${ns}row>`);insertions.set(at,list);continue;}
    const cells=row.children.filter(n=>n.local==='c');let previous=0;
    for(const c of cells){if(!/^[A-Z]+[1-9]\d*$/.test(c.attrs.r??''))throw new Error('Generation requires explicit worksheet cell coordinates.');const r=parseMerge(c.attrs.r);if(r.top!==index||r.left<=previous)throw new Error('Generation requires ordered worksheet cell coordinates.');previous=r.left;}
    if(row.self){changes.push({start:row.start,end:row.end,text:source.slice(row.start,row.openEnd).replace(/\s*\/>$/,'>')+values.map(v=>cell(source,undefined,v.address,v.value,ns)).join('')+`</${row.name}>`});continue;}
    const local:Edit[]=[],added=new Map<number,string[]>();
    for(const v of values){const existing=cells.find(c=>c.attrs.r===v.address);if(existing)local.push({start:existing.start,end:existing.end,text:cell(source,existing,v.address,v.value,ns)});else{const at=cells.find(c=>parseMerge(c.attrs.r).left>v.column)?.start??row.closeStart;const list=added.get(at)??[];list.push(cell(source,undefined,v.address,v.value,ns));added.set(at,list);}}
    for(const [at,parts]of added)local.push({start:at,end:at,text:parts.join('')});changes.push(...local);
  }
  if(data.self){const contents=[...insertions.values()].flat().join('');return edits(source,[{start:data.start,end:data.end,text:source.slice(data.start,data.openEnd).replace(/\s*\/>$/,'>')+contents+`</${data.name}>`}]);}
  for(const [at,parts]of insertions)changes.push({start:at,end:at,text:parts.join('')});return edits(source,changes);
}
export function checkCoordinates(root:Node){
  const data=root.children.find(n=>n.local==='sheetData');if(!data)throw new Error('This worksheet has no supported cell data area.');let previousRow=0;
  for(const row of data.children.filter(n=>n.local==='row')){const index=Number(row.attrs.r);if(!Number.isInteger(index)||index<=previousRow)throw new Error('Generation requires explicit, ordered worksheet row coordinates.');previousRow=index;let previousColumn=0;
    for(const c of row.children.filter(n=>n.local==='c')){if(!/^[A-Z]+[1-9]\d*$/.test(c.attrs.r??''))throw new Error('Generation requires explicit worksheet cell coordinates.');const cell=parseMerge(c.attrs.r);if(cell.top!==index||cell.left<=previousColumn)throw new Error('Generation requires ordered worksheet cell coordinates.');previousColumn=cell.left;}
  }
}

