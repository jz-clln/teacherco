'use client';
import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {UploadCloud} from 'lucide-react';
import {Button} from './button';
const query='(min-width: 1024px) and (hover: hover) and (pointer: fine)';
const subscribe=(change:()=>void)=>{if(!window.matchMedia)return()=>{};const m=window.matchMedia(query);m.addEventListener('change',change);return()=>m.removeEventListener('change',change);};
export function FileUpload({label,multiple=false,disabled=false,title,description,onFiles}:{title?:string;description?:string;label:string;multiple?:boolean;disabled?:boolean;onFiles:(files:File[])=>void}){
  const desktop=useSyncExternalStore(subscribe,()=>window.matchMedia?.(query).matches??false,()=>false),[dragging,setDragging]=useState(false),[selected,setSelected]=useState(''),input=useRef<HTMLInputElement>(null),id=useId(),depth=useRef(0);
  useEffect(()=>{const stop=(event:DragEvent)=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();};window.addEventListener('dragover',stop);window.addEventListener('drop',stop);return()=>{window.removeEventListener('dragover',stop);window.removeEventListener('drop',stop);};},[]);
  function choose(files:File[]){if(disabled)return;setSelected(files.map(f=>f.name).join(', '));onFiles(files);}
  return <div className="space-y-2" data-drag-active={desktop&&dragging?'true':'false'} onDragEnter={e=>{e.preventDefault();if(desktop&&!disabled&&e.dataTransfer.types.includes('Files')){depth.current++;setDragging(true);}}} onDragLeave={e=>{e.preventDefault();if(--depth.current<=0){depth.current=0;setDragging(false);}}} onDragOver={e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=desktop&&!disabled?'copy':'none';}} onDrop={e=>{e.preventDefault();depth.current=0;setDragging(false);if(desktop&&!disabled)choose(Array.from(e.dataTransfer.files));}}>

    <input id={id} ref={input} type="file" className="sr-only" aria-label={label} accept=".xlsx" multiple={multiple} disabled={disabled} onChange={e=>{choose(Array.from(e.target.files??[]));e.target.value='';}}/>
    {desktop?<button type="button" disabled={disabled} aria-label={multiple?'Choose files':'Choose file'} aria-controls={id} onClick={()=>input.current?.click()} className={`flex w-full flex-col items-center justify-center rounded-2xl border px-5 py-9 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E] disabled:cursor-not-allowed disabled:opacity-50 ${dragging?'border-[#1A4D2E] bg-[#EAF0EA]':'border-[#E3E5E1] bg-white enabled:cursor-pointer enabled:hover:border-[#4F6F52]'}`}>
      <UploadCloud className="text-[#1A4D2E]" size={28} aria-hidden/>
      <span className="mt-3 font-semibold">{title??`Drag and drop your Excel ${multiple?'files':'file'} here`}</span>
      <span className="mt-1 text-sm text-[#606861]">or click to choose {multiple?'files':'a file'}.{description?` ${description}`:''}</span>
    </button>:<Button type="button" variant="secondary" disabled={disabled} aria-controls={id} onClick={()=>input.current?.click()}>{multiple?'Choose files':'Choose file'}</Button>}
    {selected&&<p className="mt-2 break-all text-xs" role="status">{selected}</p>}
  </div>;
}
