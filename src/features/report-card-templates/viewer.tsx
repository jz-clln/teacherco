'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { loadTemplateSheet } from './actions';
import { parseAddress, parseMerge, type CellPreview, type CellSelection, type SheetPreview, type WorkbookMetadata } from './model';

export type WorkbookMarker={sheet:string;address:string;label:string};
export function WorkbookGrid({preview,onSelect,markers=[]}:{preview:SheetPreview;onSelect:(selection:CellSelection,cell:CellPreview)=>void;markers?:WorkbookMarker[]}){
  const [selected,setSelected]=useState('');
  const visibleMarkers=markers.filter(m=>m.sheet===preview.summary.name).flatMap(m=>{try{return [{...m,rect:parseMerge(m.address)}];}catch{return [];}});
  const cells=new Map(preview.cells.map(cell=>{const merge=preview.merges.find(m=>m.address===cell.mergedRange);return [`${Math.max(preview.rowStart,merge?.top??cell.row)}:${Math.max(preview.columnStart,merge?.left??cell.column)}`,cell];}));
  return <div className="max-w-full overflow-auto rounded-lg border border-[#E3E5E1] bg-white" style={{maxHeight:560}} role="region" aria-label={`${preview.summary.name} worksheet`} tabIndex={0}>
    <table className="table-fixed border-collapse text-xs" style={{width:44+preview.columns.reduce((sum,c)=>sum+c.width,0)}}>
      <caption className="sr-only">Read-only workbook preview. Select a cell to inspect it. Hidden rows and columns are shown with labels.</caption>
      <colgroup><col style={{width:44}}/>{preview.columns.map(c=><col key={c.number} style={{width:c.width}}/>)}</colgroup>
      <thead className="sticky top-0 z-10 bg-[#EAF0EA]"><tr><th aria-label="Row numbers"/>{preview.columns.map(c=><th key={c.number} scope="col" className="h-8 border border-[#E3E5E1] font-medium" title={c.hidden?'Hidden column':undefined}>{c.letter}{c.hidden?' ·':''}</th>)}</tr></thead>
      <tbody>{preview.rows.map(row=><tr key={row.number} style={{height:row.height}}><th scope="row" className="sticky left-0 border border-[#E3E5E1] bg-[#EAF0EA] font-medium" title={row.hidden?'Hidden row':undefined}>{row.number}{row.hidden?' ·':''}</th>{preview.columns.map(column=>{
        const cell=cells.get(`${row.number}:${column.number}`);if(!cell)return null;
        const merge=preview.merges.find(m=>m.address===cell.mergedRange),s=cell.style;
        const rect=merge??{top:cell.row,bottom:cell.row,left:cell.column,right:cell.column};
        const marked=visibleMarkers.filter(m=>m.rect.top<=rect.bottom&&m.rect.bottom>=rect.top&&m.rect.left<=rect.right&&m.rect.right>=rect.left).map(m=>m.label).join('; ');
        const style:CSSProperties={fontWeight:s?.bold?700:400,fontStyle:s?.italic?'italic':undefined,textDecoration:s?.underline?'underline':undefined,fontSize:s?.fontSize,color:s?.color,backgroundColor:s?.background,textAlign:s?.align,verticalAlign:s?.vertical,whiteSpace:s?.wrap?'pre-wrap':'nowrap'};
        for(const side of ['top','right','bottom','left'] as const){const border=s?.borders?.[side];if(border)Object.assign(style,{[`border${side[0].toUpperCase()+side.slice(1)}`]:`${border.width}px ${border.style} ${border.color}`});}
        return <td key={cell.address} style={style} rowSpan={merge?Math.min(merge.bottom,preview.rows.at(-1)!.number)-row.number+1:1} colSpan={merge?Math.min(merge.right,preview.columns.at(-1)!.number)-column.number+1:1} className="border border-[#E3E5E1] p-0">
          <button type="button" aria-label={`${cell.address}${cell.mergedRange?`, merged ${cell.mergedRange}`:''}: ${cell.displayValue||'Blank'}`} aria-pressed={selected===cell.address} title={marked?`Mapped: ${marked}`:undefined} data-mapped={marked?true:undefined} className="block h-full min-h-6 w-full overflow-hidden px-1.5 py-1 text-inherit focus-visible:outline-2 focus-visible:outline-[#1A4D2E]" style={{textAlign:'inherit',boxShadow:selected===cell.address?'inset 0 0 0 2px #1A4D2E':marked?'inset 0 0 0 1px #4F6F52':undefined}} onClick={()=>{setSelected(cell.address);onSelect({sheetName:preview.summary.name,address:cell.address,mergedRange:cell.mergedRange},cell);}}>{cell.displayValue||'\u00a0'}</button>
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

export function TemplateViewer({id,metadata,onSelection,markers=[]}:{id:string;metadata:WorkbookMetadata;onSelection?:(selection:CellSelection)=>void;markers?:WorkbookMarker[]}){
  const [sheet,setSheet]=useState(0),[row,setRow]=useState(1),[column,setColumn]=useState(1),[retry,setRetry]=useState(0),[address,setAddress]=useState('A1');
  const [preview,setPreview]=useState<SheetPreview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[cell,setCell]=useState<CellPreview|null>(null);
  useEffect(()=>{let active=true;loadTemplateSheet({id,sheet,row,column}).then(result=>{if(!active)return;if(result.ok)setPreview(result.data);else setError(result.error);setLoading(false);}).catch(()=>{if(active){setError('Could not load this worksheet. Please retry.');setLoading(false);}});return()=>{active=false;};},[id,sheet,row,column,retry]);
  function move(r:number,c:number){setRow(r);setColumn(c);setLoading(true);setError('');setCell(null);setRetry(n=>n+1);}
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm font-medium">Worksheet<select aria-label="Worksheet" className="mt-1 block min-h-11 w-full rounded-lg border border-[#E3E5E1] bg-white px-3" value={sheet} onChange={e=>{setSheet(Number(e.target.value));move(1,1);}}>{metadata.sheets.map(s=><option key={s.index} value={s.index}>{s.name}{s.state!=='visible'?` (${s.state==='veryHidden'?'very hidden':'hidden'})`:''}</option>)}</select></label>
    <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();try{const p=parseAddress(address),s=metadata.sheets[sheet];if(p.row>s.rowExtent||p.column>s.columnExtent)throw new Error('Choose a cell inside the preview range.');move(p.row,p.column);}catch(err){setError((err as Error).message);}}}><label className="text-sm font-medium">Go to cell<input aria-label="Go to cell" className="mt-1 block min-h-11 w-24 rounded-lg border border-[#E3E5E1] bg-white px-3" value={address} onChange={e=>setAddress(e.target.value)} maxLength={12}/></label><Button variant="secondary" type="submit" disabled={loading}>Go</Button></form></div>
    {error&&<div role="alert" className="space-y-2 rounded-lg border border-[#E3E5E1] p-4"><p>{error}</p><Button variant="secondary" onClick={()=>move(row,column)}>Retry</Button></div>}
    {loading?<p role="status" className="py-12 text-center text-sm text-[#606861]">Loading worksheet…</p>:preview&&!error&&<>
      <div className="space-y-1 text-xs leading-5 text-[#606861]">{preview.warnings.map(w=><p key={w}>{w}</p>)}{preview.summary.hasFreezePane&&<p>Excel freeze panes are preserved in the original file. The preview keeps its coordinate headers visible.</p>}</div>
      <WorkbookGrid key={`${sheet}:${row}:${column}:${retry}`} preview={preview} markers={markers} onSelect={(selection,selected)=>{setCell(selected);onSelection?.(selection);}}/>
      <div className="flex flex-wrap items-center gap-2 text-xs"><Button variant="secondary" disabled={row===1} onClick={()=>move(Math.max(1,row-60),column)}>Previous rows</Button><Button variant="secondary" disabled={row+60>preview.summary.rowExtent} onClick={()=>move(row+60,column)}>Next rows</Button><Button variant="secondary" disabled={column===1} onClick={()=>move(row,Math.max(1,column-24))}>Previous columns</Button><Button variant="secondary" disabled={column+24>preview.summary.columnExtent} onClick={()=>move(row,column+24)}>Next columns</Button><span>Rows {row}–{preview.rows.at(-1)?.number} · Columns {preview.columns[0]?.letter}–{preview.columns.at(-1)?.letter}</span></div>
      <aside aria-label="Cell inspector" className="tc-group space-y-2 p-4 text-sm"><h2 className="font-semibold">{cell?`${preview.summary.name} · ${cell.address}`:'Cell inspector'}</h2>{cell?<><p className="break-words whitespace-pre-wrap">Value: {cell.displayValue||'Blank'}</p><p>Type: {cell.type}</p>{cell.mergedRange&&<p>Merged range: {cell.mergedRange}</p>}{cell.type==='formula'&&<><p className="break-all">Formula: {cell.formula||'Shared formula (expression unavailable)'}</p><p className="break-words">Cached value: {cell.cachedValue||'Unavailable'}</p></>}</>:<p className="text-[#606861]">Select a cell to see its address and value. Selection is temporary.</p>}</aside>
    </>}
  </div>;
}
