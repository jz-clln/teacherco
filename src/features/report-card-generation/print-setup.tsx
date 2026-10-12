'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/ui/select';
import type {SheetPreview} from '@/features/report-card-templates/model';
import {DEFAULT_PRINT_SETTINGS,printGeometry,printPageCount,printReport,reportPrintDocument,type PrintSettings} from './print';

export function ReportPrintSetup({sheets,name,onClose}:{sheets:SheetPreview[];name:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),viewport=useRef<HTMLDivElement>(null);
  const [settings,setSettings]=useState<PrintSettings>(DEFAULT_PRINT_SETTINGS),[selection,setSelection]=useState('all'),[zoom,setZoom]=useState(1),[available,setAvailable]=useState({width:800,height:700}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=useMemo(()=>selection==='all'?sheets:sheets.filter((_,index)=>String(index)===selection),[sheets,selection]);
  const html=useMemo(()=>reportPrintDocument(selected,name,settings),[selected,name,settings]);
  const geometry=selected.map(s=>printGeometry(s,settings)),paperWidth=Math.max(...geometry.map(g=>g.paperWidth)),documentHeight=32+geometry.reduce((n,g)=>n+g.pages*(g.paperHeight+16),0);
  const fit=Math.min((available.width-24)/(paperWidth+32),(available.height-24)/((geometry[0]?.paperHeight??1056)+32)),scale=Math.max(.1,fit)*zoom;
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  useEffect(()=>{const node=viewport.current;if(!node)return;const observer=new ResizeObserver(()=>setAvailable({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);return()=>observer.disconnect();},[]);
  return <dialog ref={dialog} aria-labelledby="report-print-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="fixed inset-0 border-0 bg-white p-0 text-[#1F2A22]" style={{width:'100vw',height:'100dvh',maxWidth:'none',maxHeight:'none',margin:0,borderRadius:0}}>
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(170px,300px)]">
      <div ref={viewport} aria-label="Paper preview" className="min-h-0 min-w-0 overflow-auto bg-gray-200 p-3"><div className="mx-auto" style={{width:(paperWidth+32)*scale,height:documentHeight*scale}}><iframe title="Report card print layout" srcDoc={html} className="border-0" style={{width:paperWidth+32,height:documentHeight,transform:`scale(${scale})`,transformOrigin:'top left',pointerEvents:'none'}}/></div></div>
      <aside aria-label="Print settings" className="min-h-0 space-y-5 overflow-y-auto border-l border-[#E3E5E1] p-4">
        <div><h2 id="report-print-title">Print settings</h2><p className="text-sm">{printPageCount(selected,settings)} page(s) · {name}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await printReport(selected,name,settings);}catch(e){setError(e instanceof Error?e.message:'Could not open the printer.');}finally{setBusy(false);}}}>Print report card</Button></div>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <Select name="print-sheet" label="Print" value={selection} onChange={setSelection} options={[{value:'all',label:'All report areas'},...sheets.map((s,i)=>({value:String(i),label:`${s.summary.name}${sheets.filter(other=>other.summary.name===s.summary.name).length>1?` · Area ${i+1}`:''}`}))]}/>
        <Select name="paper-size" label="Paper size" value={settings.paperSize} onChange={value=>setSettings(s=>({...s,paperSize:value as PrintSettings['paperSize']}))} options={[{value:'letter',label:'Short / Letter (8.5 x 11 in)'},{value:'a4',label:'A4 (210 x 297 mm)'}]}/>
        <Select name="print-orientation" label="Orientation" value={settings.orientation} onChange={value=>setSettings(s=>({...s,orientation:value as PrintSettings['orientation']}))} options={[{value:'auto',label:'Automatic'},{value:'landscape',label:'Landscape'},{value:'portrait',label:'Portrait'}]}/>
        <Select name="print-scale" label="Scale" value={settings.scale} onChange={value=>setSettings(s=>({...s,scale:value as PrintSettings['scale']}))} options={[{value:'page',label:'Fit to page'},{value:'width',label:'Fit to width'}]}/>
        <p className="text-xs text-[#606861]">Each report area stays on one page. Fit to width reduces the scale further when needed to keep the entire card visible.</p>
        <fieldset><legend className="mb-2 text-sm font-medium">Margins (inches)</legend><div className="grid grid-cols-2 gap-2">{(['top','right','bottom','left'] as const).map(side=><label key={side} className="text-sm capitalize">{side}<input aria-label={`${side} margin`} type="number" min={0} max={1} step={.05} value={settings.margins[side]} onChange={e=>setSettings(s=>({...s,margins:{...s.margins,[side]:Math.min(1,Math.max(0,Number(e.target.value)))}}))} className="mt-1 w-full rounded-lg border border-[#B8CDBA] p-2"/></label>)}</div></fieldset>
        <div><p className="mb-2 text-sm font-medium">Preview zoom</p><div className="flex flex-wrap gap-2"><Button variant="secondary" aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>−</Button><Button variant="secondary" onClick={()=>setZoom(1)}>Fit to screen</Button><Button variant="secondary" aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(3,z+.25))}>+</Button></div></div>
        <p className="text-xs text-[#606861]">The dotted outline shows the print margins. In the printer dialog, keep the selected paper size, 100% scale, and headers and footers off. Fonts must be installed on this device to match the template.</p>
      </aside>
    </div>
  </dialog>;
}
