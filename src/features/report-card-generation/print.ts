import {parseMerge,type SheetPreview} from '@/features/report-card-templates/model';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type PrintSettings={paperSize:'letter'|'a4';orientation:'auto'|'landscape'|'portrait';scale:'page'|'width';margins:{top:number;right:number;bottom:number;left:number}};
export const DEFAULT_PRINT_SETTINGS:PrintSettings={paperSize:'a4',orientation:'auto',scale:'width',margins:{top:.25,right:.25,bottom:.25,left:.25}};
export function printGeometry(sheet:SheetPreview,settings=DEFAULT_PRINT_SETTINGS){
  const width=sheet.columns.reduce((n,c)=>n+(c.hidden?0:c.width),0),height=sheet.rows.reduce((n,r)=>n+(r.hidden?0:r.height),0);
  const landscape=settings.orientation==='landscape'||settings.orientation==='auto'&&width>height;
  const short=settings.paperSize==='a4'?210/25.4:8.5,long=settings.paperSize==='a4'?297/25.4:11;
  const paperWidth=(landscape?long:short)*96,paperHeight=(landscape?short:long)*96;
  const margins=Object.fromEntries(Object.entries(settings.margins).map(([key,value])=>[key,Math.max(0,Math.min(1,Number.isFinite(value)?value:.25))*96])) as PrintSettings['margins'];
  const availableWidth=paperWidth-margins.left-margins.right-1,availableHeight=paperHeight-margins.top-margins.bottom-1;
  // A report area is indivisible: width fitting must also respect the paper height.
  const scale=Math.min(availableWidth/Math.max(1,width),availableHeight/Math.max(1,height));
  return {width,height,landscape,paperWidth,paperHeight,margins,availableWidth,availableHeight,scale,pages:1};
}
export function printPageCount(sheets:SheetPreview[],settings=DEFAULT_PRINT_SETTINGS){return sheets.reduce((n,s)=>n+printGeometry(s,settings).pages,0);}
/** Shared spreadsheet renderer for the paper preview and the final printer document. */
export function reportPrintDocument(sheets:SheetPreview[],name:string,settings=DEFAULT_PRINT_SETTINGS){
  const pages=sheets.map((sheet,index)=>{
    const geometry=printGeometry(sheet,settings),{width,height,landscape,paperWidth,paperHeight,margins,availableWidth,availableHeight,scale}=geometry;
    const x=new Map<number,number>(),y=new Map<number,number>();let xx=0,yy=0;
    for(const c of sheet.columns){x.set(c.number,xx);if(!c.hidden)xx+=c.width;}
    for(const r of sheet.rows){y.set(r.number,yy);if(!r.hidden)yy+=r.height;}
    const byPosition=new Map(sheet.cells.map(c=>[`${c.row}:${c.column}`,c]));
    const lines=new Map<string,{x1:number;y1:number;x2:number;y2:number;width:number;color:string;style:string}>();
    function edge(x1:number,y1:number,x2:number,y2:number,b:{width:number;color:string;style:string}){
      const key=[x1,y1,x2,y2].map(n=>n.toFixed(2)).join(':');const previous=lines.get(key);
      if(!previous||previous.width<b.width)lines.set(key,{x1,y1,x2,y2,...b});
    }
    const backgrounds:string[]=[],texts:string[]=[];
    for(const cell of sheet.cells){
      const rect=cell.mergedRange?parseMerge(cell.mergedRange):{left:cell.column,right:cell.column,top:cell.row,bottom:cell.row};
      const columns=sheet.columns.filter(c=>c.number>=rect.left&&c.number<=rect.right&&!c.hidden),rows=sheet.rows.filter(r=>r.number>=rect.top&&r.number<=rect.bottom&&!r.hidden);
      if(!columns.length||!rows.length)continue;
      const style=cell.style,w=columns.reduce((n,c)=>n+c.width,0),h=rows.reduce((n,r)=>n+r.height,0),left=x.get(columns[0].number)!,top=y.get(rows[0].number)!;
      if(style?.background)backgrounds.push(`<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;background:${escape(style.background)}"></div>`);
      const borders=cell.borderSegments??Object.entries(style?.borders??{}).map(([side,b])=>({side,start:0,end:1,...b}));
      for(const b of borders){const horizontal=b.side==='top'||b.side==='bottom';if(horizontal){const at=top+(b.side==='bottom'?h:0);edge(left+b.start*w,at,left+b.end*w,at,b);}else{const at=left+(b.side==='right'?w:0);edge(at,top+b.start*h,at,top+b.end*h,b);}}
      if(!cell.displayValue)continue;
      const align=style?.align??(cell.type==='number'?'right':'left');let textWidth=w;
      // Excel lets unwrapped text continue into empty adjacent cells. Borders and
      // backgrounds are drawn separately so this never stretches a cell's outline.
      if(!cell.mergedRange&&!style?.wrap&&align==='left'&&cell.type==='text'){
        for(const c of sheet.columns.filter(c=>c.number>rect.right&&!c.hidden)){
          const neighbor=byPosition.get(`${cell.row}:${c.number}`);
          const merged=sheet.merges.some(m=>cell.row>=m.top&&cell.row<=m.bottom&&c.number>=m.left&&c.number<=m.right);
          if(merged||neighbor?.displayValue||neighbor?.style?.background)break;
          textWidth+=c.width;
        }
      }
      const font=style?.fontFamily&&/^[\p{L}\p{N} ._-]{1,80}$/u.test(style.fontFamily)?style.fontFamily:'Calibri';
      const css=`font-family:"${font}",sans-serif;text-decoration:${style?.underline?'underline':'none'};left:${left}px;top:${top}px;width:${textWidth}px;height:${h}px;font-size:${style?.fontSize??14.667}px;font-weight:${style?.bold?700:400};font-style:${style?.italic?'italic':'normal'};color:${style?.color??'#000'};text-align:${align};justify-content:${style?.vertical==='top'?'flex-start':style?.vertical==='middle'?'center':'flex-end'};`;
      texts.push(`<div class="cell" data-cell="${cell.address}" style="${escape(css)}"><span style="${style?.wrap?'white-space:pre-wrap;overflow-wrap:break-word':'white-space:pre'}">${escape(cell.displayValue)}</span></div>`);
    }
    const rules=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="position:absolute;inset:0;overflow:visible">${[...lines.values()].map(l=>{const offsets=l.style==='double'?[-l.width/3,l.width/3]:[0];return offsets.map(offset=>{const dx=l.x1===l.x2?offset:0,dy=l.y1===l.y2?offset:0;return `<line x1="${l.x1+dx}" y1="${l.y1+dy}" x2="${l.x2+dx}" y2="${l.y2+dy}" stroke="${escape(l.color)}" stroke-width="${l.style==='double'?l.width/3:l.width}"${l.style==='dashed'?' stroke-dasharray="4 3"':l.style==='dotted'?' stroke-dasharray="1 2"':''}/>`;}).join('');}).join('')}</svg>`;
    const images=(sheet.images??[]).filter(i=>/^data:image\/(png|jpeg|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(i.src)).map(i=>`<img alt="${escape(i.name)}" src="${i.src}" style="position:absolute;left:${i.x}px;top:${i.y}px;width:${i.width}px;height:${i.height}px"/>`).join('');
    const content=backgrounds.join('')+rules+texts.join('')+images;
    return `<style>@page report${index}{size:${settings.paperSize==='a4'?'A4':'Letter'} ${landscape?'landscape':'portrait'};margin:0}</style>`+(()=>{
      const usedHeight=height*scale,usedWidth=width*scale;
      const centerX=Math.max(0,(availableWidth-usedWidth)/2),centerY=Math.max(0,(availableHeight-usedHeight)/2);
      return `<section class="paper" style="page:report${index};width:${paperWidth}px;height:${paperHeight-.1}px"><div class="print-area" style="left:${margins.left}px;top:${margins.top}px;width:${availableWidth}px;height:${availableHeight}px"><div class="centered-report" style="position:absolute;left:${centerX}px;top:${centerY}px;width:${usedWidth}px;height:${usedHeight}px;overflow:hidden"><div style="position:relative;width:${width}px;height:${height}px;transform:scale(${scale});transform-origin:top left">${content}</div></div></div></section>`;
    })();
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(name)} - Report card</title><style>*{box-sizing:border-box}body{margin:0;font-family:Calibri,sans-serif;color:#000}.paper{position:relative;background:white;break-inside:avoid;break-after:page;overflow:hidden}.paper:last-child{break-after:auto}.print-area{position:absolute;overflow:hidden}.cell{position:absolute;display:flex;flex-direction:column;line-height:1.1;padding:0 2px;overflow:hidden}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}@media screen{body{background:#e5e7eb;padding:16px}.paper{margin:0 auto 16px;box-shadow:0 2px 10px #0003}.print-area{outline:1px dashed #a9bdb0}}</style></head><body>${pages}</body></html>`;
}

export async function printReport(sheets:SheetPreview[],name:string,settings=DEFAULT_PRINT_SETTINGS){
  const frame=document.createElement('iframe');frame.title='Printable report card';frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0';
  const ready=new Promise<void>(resolve=>{frame.onload=()=>resolve();});frame.srcdoc=reportPrintDocument(sheets,name,settings);document.body.appendChild(frame);
  try{
    await ready;const win=frame.contentWindow,doc=frame.contentDocument;if(!win||!doc)throw new Error('Could not open print preview.');
    // Make an already loaded web font available if the template names it; never override the template font.
    const fontStyle=document.createElement('style');fontStyle.textContent=Array.from(document.styleSheets).flatMap(sheet=>{try{return Array.from(sheet.cssRules).filter(rule=>rule.type===CSSRule.FONT_FACE_RULE).map(rule=>rule.cssText.replace(/url\(["']?([^"')]+)["']?\)/g,(_,url)=>`url("${new URL(url,sheet.href??location.href).href}")`));}catch{return [];}}).join('\n');doc.head.appendChild(fontStyle);
    await doc.fonts.ready;await Promise.all(Array.from(doc.images).map(img=>img.decode()));
    win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print();
    // Fallback cleanup for browsers that omit afterprint.
    setTimeout(()=>frame.remove(),300000);
  }catch(error){frame.remove();throw error;}
}
