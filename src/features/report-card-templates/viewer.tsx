'use client';
import {Minus,Plus} from 'lucide-react';
import {LoadingState} from '@/components/ui/loading-state';
import { createPortal } from 'react-dom';
import { Select } from '@/components/ui/select';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { loadTemplateSheet } from './actions';
import { cellAddress, parseAddress, parseMerge, type CellPreview, type CellSelection, type SheetPreview, type WorkbookMetadata } from './model';

export type WorkbookMarker={sheet:string;address:string;label:string};
export function WorkbookGrid({preview,onSelect,markers=[],workspace=false,zoom=100,onZoom,onNavigate}:{preview:SheetPreview;workspace?:boolean;zoom?:number;onZoom?:(value:number)=>void;onNavigate?:(row:number,column:number)=>void;onSelect:(selection:CellSelection,cell:CellPreview)=>void;markers?:WorkbookMarker[]}){
  const [selected,setSelected]=useState('');
  const region=useRef<HTMLDivElement>(null),previousZoom=useRef(zoom),scale=zoom/100;
  useLayoutEffect(()=>{const el=region.current;if(el){const ratio=zoom/previousZoom.current;el.scrollLeft*=ratio;el.scrollTop*=ratio;}previousZoom.current=zoom;},[zoom]);
  useEffect(()=>{const el=region.current;if(!el||!onZoom)return;function wheel(e:WheelEvent){if(e.ctrlKey||e.metaKey){e.preventDefault();onZoom?.(Math.max(25,Math.min(200,zoom+(e.deltaY<0?10:-10))));}}el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[zoom,onZoom]);
  const visibleMarkers=markers.filter(m=>m.sheet===preview.summary.name).flatMap(m=>{try{return [{...m,rect:parseMerge(m.address)}];}catch{return [];}});
  const cells=new Map(preview.cells.map(cell=>{const merge=preview.merges.find(m=>m.address===cell.mergedRange);return [`${Math.max(preview.rowStart,merge?.top??cell.row)}:${Math.max(preview.columnStart,merge?.left??cell.column)}`,cell];}));
  function navigate(r:number,c:number){
    if(r<1||c<1||r>preview.summary.rowExtent||c>preview.summary.columnExtent)return;
    const merge=preview.merges.find(m=>r>=m.top&&r<=m.bottom&&c>=m.left&&c<=m.right);
    const address=merge?.master??cellAddress(r,c),button=region.current?.querySelector<HTMLButtonElement>(`[data-cell="${address}"]`);
    if(button){button.focus({preventScroll:true});button.scrollIntoView?.({block:'nearest',inline:'nearest'});button.click();}else onNavigate?.(r,c);
  }
  return <div ref={region} className={`max-w-full overflow-auto rounded-lg border border-[#E3E5E1] bg-white ${workspace?'min-h-0 flex-1':' '}`} style={{maxHeight:workspace?'100%':560,scrollPaddingTop:26,scrollPaddingLeft:46}} role="region" aria-label={`${preview.summary.name} worksheet`} tabIndex={0}>
    <table className="table-fixed border-collapse text-xs" style={{width:44+preview.columns.reduce((sum,c)=>sum+c.width*scale,0)}}>
      <caption className="sr-only">Read-only workbook preview. Select a cell to inspect it. Use arrow keys to navigate. Hidden rows and columns are shown with labels.</caption>
      <colgroup><col style={{width:44}}/>{preview.columns.map(c=><col key={c.number} style={{width:c.width*scale}}/>)}</colgroup>
      <thead className="sticky top-0 z-10 bg-[#EAF0EA]"><tr><th aria-label="Row numbers"/>{preview.columns.map(c=><th key={c.number} scope="col" className="h-6 overflow-hidden border border-[#E3E5E1] font-medium" title={c.hidden?'Hidden column':undefined}>{c.letter}{c.hidden?' ?':''}</th>)}</tr></thead>
      <tbody>{preview.rows.map(row=><tr key={row.number} style={{height:row.height*scale}}><th scope="row" className="sticky left-0 z-[2] border border-[#E3E5E1] bg-[#EAF0EA] p-0 font-medium" style={{fontSize:Math.min(12,12*scale),lineHeight:1}} title={row.hidden?'Hidden row':undefined}>{row.number}{row.hidden?' ?':''}</th>{preview.columns.map(column=>{
        const cell=cells.get(`${row.number}:${column.number}`);if(!cell)return null;
        const merge=preview.merges.find(m=>m.address===cell.mergedRange),s=cell.style;
        const rect=merge??{top:cell.row,bottom:cell.row,left:cell.column,right:cell.column};
        const marked=visibleMarkers.filter(m=>m.rect.top<=rect.bottom&&m.rect.bottom>=rect.top&&m.rect.left<=rect.right&&m.rect.right>=rect.left).map(m=>m.label).join('; ');
        const align=s?.align??(['number','date'].includes(cell.type)?'right':'left');
        let spill=column.width;
        if(!merge&&!s?.wrap&&align==='left'&&cell.type==='text'&&cell.displayValue){
          for(const next of preview.columns.filter(c=>c.number>column.number)){
            const neighbor=cells.get(`${row.number}:${next.number}`);
            if(!neighbor||neighbor.displayValue||neighbor.mergedRange||neighbor.style?.background)break;
            spill+=next.width;
          }
        }
        const style:CSSProperties={position:'relative',fontWeight:s?.bold?700:400,fontStyle:s?.italic?'italic':undefined,textDecoration:s?.underline?'underline':undefined,fontFamily:'var(--font-brand), Poppins, sans-serif',fontSize:(s?.fontSize??14.667)*scale,color:s?.color,backgroundColor:s?.background,textAlign:align,verticalAlign:s?.vertical??'bottom',whiteSpace:s?.wrap?'pre-wrap':'nowrap'};
        for(const side of ['top','right','bottom','left'] as const){const border=s?.borders?.[side];if(border&&!cell.borderSegments)Object.assign(style,{[`border${side[0].toUpperCase()+side.slice(1)}`]:`${Math.max(.5,border.width*scale)}px ${border.style} ${border.color}`});}
        const height=preview.rows.filter(r=>r.number>=Math.max(rect.top,preview.rowStart)&&r.number<=rect.bottom).reduce((sum,r)=>sum+r.height,0)*scale;
        return <td key={cell.address} style={style} rowSpan={merge?Math.min(merge.bottom,preview.rows.at(-1)!.number)-row.number+1:1} colSpan={merge?Math.min(merge.right,preview.columns.at(-1)!.number)-column.number+1:1} className="border border-[#E3E5E1] p-0">
          <button type="button" data-cell={cell.address} aria-label={`${cell.address}${cell.mergedRange?`, merged ${cell.mergedRange}`:''}: ${cell.displayValue||'Blank'}`} aria-pressed={selected===cell.address} title={marked?`Mapped: ${marked}`:undefined} data-mapped={marked?true:undefined} className="tc-workbook-cell absolute inset-0 block w-full p-0 text-inherit focus-visible:outline-2 focus-visible:outline-[#1A4D2E]" style={{height:'100%',minHeight:0,minWidth:0,borderRadius:0,textAlign:'inherit',font:'inherit',lineHeight:1.1,boxShadow:selected===cell.address?'inset 0 0 0 2px #1A4D2E':marked?'inset 0 0 0 1px #4F6F52':undefined}} onClick={()=>{setSelected(cell.address);onSelect({sheetName:preview.summary.name,address:cell.address,mergedRange:cell.mergedRange},cell);}} onKeyDown={e=>{const next=e.key==='ArrowDown'?[rect.bottom+1,rect.left]:e.key==='ArrowUp'?[rect.top-1,rect.left]:e.key==='ArrowRight'?[rect.top,rect.right+1]:e.key==='ArrowLeft'?[rect.top,rect.left-1]:null;if(next){e.preventDefault();navigate(next[0],next[1]);}}}>
            <span className="pointer-events-none absolute left-0 flex overflow-hidden" style={{width:spill>column.width?spill*scale:'100%',height:Math.max(0,height-1),top:0,padding:`0 ${2*scale}px`,zIndex:cell.displayValue?1:undefined,flexDirection:'column',justifyContent:s?.vertical==='top'?'flex-start':s?.vertical==='middle'?'center':'flex-end',textAlign:'inherit',overflowWrap:s?.wrap?'anywhere':undefined}}><span>{cell.displayValue||'\u00a0'}</span></span>
          </button>
          {cell.borderSegments?.map((edge,index)=>{const horizontal=edge.side==='top'||edge.side==='bottom';return <span key={index} aria-hidden="true" data-workbook-border={edge.side} className="pointer-events-none absolute z-[1]" style={{[edge.side]:0,...(horizontal?{left:`${edge.start*100}%`,width:`${(edge.end-edge.start)*100}%`}:{top:`${edge.start*100}%`,height:`${(edge.end-edge.start)*100}%`}),[`border${edge.side[0].toUpperCase()+edge.side.slice(1)}`]:`${Math.max(.5,edge.width*scale)}px ${edge.style} ${edge.color}`}}/>;})}
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

export function TemplateViewer({id,metadata,onSelection,markers=[],workspace=false,loadSheet=loadTemplateSheet,controlsTarget}:{controlsTarget?:HTMLElement|null;loadSheet?:typeof loadTemplateSheet;id:string;metadata:WorkbookMetadata;workspace?:boolean;onSelection?:(selection:CellSelection)=>void;markers?:WorkbookMarker[]}){
  const root=useRef<HTMLDivElement>(null);
  const [zoom,setZoom]=useState(100),[target,setTarget]=useState('');
  const [sheet,setSheet]=useState(0),[row,setRow]=useState(1),[column,setColumn]=useState(1),[retry,setRetry]=useState(0),[address,setAddress]=useState('A1');
  const [preview,setPreview]=useState<SheetPreview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[cell,setCell]=useState<CellPreview|null>(null);
  useEffect(()=>{let active=true;loadSheet({id,sheet,row,column,expanded:true}).then(result=>{if(!active)return;if(result.ok)setPreview(result.data);else setError(result.error);setLoading(false);}).catch(()=>{if(active){setError('Could not load this worksheet. Please retry.');setLoading(false);}});return()=>{active=false;};},[id,sheet,row,column,retry,loadSheet]);
  useEffect(()=>{if(!loading&&target&&preview){const p=parseAddress(target),merge=preview.merges.find(m=>p.row>=m.top&&p.row<=m.bottom&&p.column>=m.left&&p.column<=m.right);const button=root.current?.querySelector<HTMLButtonElement>(`[data-cell="${merge?.master??target}"]`);button?.focus({preventScroll:true});button?.scrollIntoView?.({block:'nearest',inline:'nearest'});button?.click();}},[loading,target,preview]);
  function go(r:number,c:number){setTarget(cellAddress(r,c));if(!preview||r<preview.rowStart||r>(preview.rows.at(-1)?.number??0)||c<preview.columnStart||c>(preview.columns.at(-1)?.number??0))move(r,c);else {const merge=preview.merges.find(m=>r>=m.top&&r<=m.bottom&&c>=m.left&&c<=m.right),button=root.current?.querySelector<HTMLButtonElement>(`[data-cell="${merge?.master??cellAddress(r,c)}"]`);button?.focus({preventScroll:true});button?.scrollIntoView?.({block:'nearest',inline:'nearest'});button?.click();}}
  function move(r:number,c:number){setRow(r);setColumn(c);setLoading(true);setError('');setCell(null);setRetry(n=>n+1);}
  const controls=<div className="min-w-0 space-y-3" aria-label="Worksheet controls">
    <div className="flex shrink-0 flex-wrap items-end gap-3"><Select className="min-w-0 flex-1" name={"Worksheet"} label={"Worksheet"} value={String(sheet)} onChange={value => { setTarget(''); setSheet(Number(value)); move(1, 1); }} options={metadata.sheets.map(s => ({ value: String(s.index), label: `${s.name}${s.state !== 'visible' ? ` (${s.state === 'veryHidden' ? 'very hidden' : 'hidden'})` : ''}` }))}/>
    <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();try{const p=parseAddress(address),s=metadata.sheets[sheet];if(p.row>s.rowExtent||p.column>s.columnExtent)throw new Error('Choose a cell inside the preview range.');setError('');go(p.row,p.column);}catch(err){setError((err as Error).message);}}}><label className="text-sm font-medium">Go to cell<input aria-label="Go to cell" className="mt-1 block min-h-11 w-24 rounded-lg border border-[#E3E5E1] bg-white px-3" value={address} onChange={e=>setAddress(e.target.value)} maxLength={12}/></label><Button className="shrink-0 whitespace-nowrap" variant="secondary" type="submit" disabled={loading}>Go</Button></form></div>
    {error&&<div role="alert"><p>{error}</p><Button variant="secondary" onClick={()=>move(row,column)}>Retry</Button></div>}
    {!loading&&preview&&<>
      <div className="flex shrink-0 flex-wrap items-center gap-1" aria-label="Worksheet zoom">
        <Button variant="secondary" aria-label="Zoom out" disabled={zoom<=25} onClick={()=>setZoom(n=>Math.max(25,n-10))}><Minus size={16}/></Button>
        <Select hideLabel compact className="w-28" name="worksheet-zoom" label="Zoom" value={String(zoom)} onChange={value=>setZoom(Number(value))} options={[...new Set([25,50,75,100,125,150,200,zoom])].sort((a,b)=>a-b).map(value=>({value:String(value),label:`${value}%`}))}/>
        <Button variant="secondary" aria-label="Zoom in" disabled={zoom>=200} onClick={()=>setZoom(n=>Math.min(200,n+10))}><Plus size={16}/></Button>
        <Button variant="secondary" style={{paddingInline:8}} onClick={()=>{const region=root.current?.querySelector('[role="region"]');if(region)setZoom(Math.max(25,Math.min(200,Math.floor((region.clientWidth-46)/preview.columns.reduce((sum,c)=>sum+c.width,0)*100))));}}>Fit width</Button>
        <span className="hidden sm:inline-flex"><Button variant="secondary" disabled={zoom===100} onClick={()=>setZoom(100)}>Reset zoom</Button></span>
      </div>
      {preview.summary.rowExtent>preview.rows.length&&<Select name="row-window" label="Go to rows" value={String(preview.rowStart)} options={[...new Set([preview.rowStart,...Array.from({length:Math.ceil(preview.summary.rowExtent/preview.rows.length)},(_,i)=>i*preview.rows.length+1)])].sort((a,b)=>a-b).map(start=>({value:String(start),label:`${start} - ${Math.min(preview.summary.rowExtent,start+preview.rows.length-1)}`}))} onChange={value=>move(Number(value),1)}/>}
      {cell&&<aside aria-label="Cell inspector" className="space-y-1 break-words text-xs text-[#606861]"><p>{preview.summary.name}!{cell.address}</p><p>{cell.displayValue||'Blank cell'}</p>{cell.mergedRange&&<p>Merged range: {cell.mergedRange}</p>}{cell.type==='formula'&&<p className="break-all">Formula: {cell.formula||'Shared formula'}</p>}</aside>}
      <details className="text-xs text-[#606861]"><summary className="cursor-pointer py-2">Workbook notes</summary>{preview.warnings.map(w=><p key={w}>{w}</p>)}</details>
    </>}
  </div>;
  return <div ref={root} className={workspace?"flex min-h-0 min-w-0 flex-1 flex-col":"min-w-0 space-y-4"}>
    {controlsTarget?createPortal(controls,controlsTarget):!workspace?controls:null}
    {loading?<LoadingState page label="Loading worksheet..."/>:preview&&!error&&<>
      <WorkbookGrid zoom={zoom} onZoom={setZoom} onNavigate={go} workspace={workspace} key={`${sheet}:${row}:${column}:${retry}`} preview={preview} markers={markers} onSelect={(selection,selected)=>{setCell(selected);onSelection?.(selection);}}/>
    </>}
  </div>;
}
