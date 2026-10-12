'use client';
import {useEffect,useId,useRef,useState} from 'react';

export function SubjectInput({value,onChange,options,disabled}:{value:string;onChange:(value:string)=>void;options:string[];disabled:boolean}){
  const id=useId(),list=useRef<HTMLUListElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
  const matches=[...new Set(options)].filter(name=>name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
  const expanded=open&&!disabled;
  useEffect(()=>{list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block:'nearest'});},[active]);
  function choose(name:string){onChange(name);setOpen(false);setActive(-1);}
  return <div className="relative min-w-0 flex-1">
    <label htmlFor={id} className="mb-1 block text-sm">Subject name</label>
    <input id={id} name="new-subject" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`} aria-activedescendant={expanded&&matches[active]?`${id}-${active}`:undefined}
      value={value} disabled={disabled} maxLength={120} autoComplete="off" placeholder="Type to search or add a subject"
      className="min-h-11 w-full min-w-0 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm focus:outline-violet-600"
      onFocus={()=>setOpen(true)} onBlur={()=>{setOpen(false);setActive(-1);}}
      onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1);}}
      onKeyDown={e=>{
        if(e.nativeEvent.isComposing)return;
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>e.key==='ArrowDown'?Math.min(i+1,matches.length-1):Math.max(0,i-1));}
        else if(e.key==='Enter'&&expanded&&matches[active]){e.preventDefault();choose(matches[active]);}
        else if(e.key==='Escape'&&expanded){e.preventDefault();e.stopPropagation();setOpen(false);setActive(-1);}
      }}/>
    {expanded&&<div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-[#E3E5E1] bg-white p-1 shadow-lg">
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Subject suggestions" className="max-h-60 overflow-y-auto">
        {matches.map((name,index)=><li key={name} id={`${id}-${index}`} role="option" aria-selected={active===index} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(name)} onMouseMove={()=>setActive(index)} className={`cursor-pointer break-words rounded px-3 py-2 text-sm ${active===index?'bg-[#EAF0EA]':''}`}>{name}</li>)}
      </ul>
      {!matches.length&&<p role="status" className="px-3 py-2 text-sm text-[#606861]">No matching subjects. Click Add to use this name.</p>}
    </div>}
  </div>;
}
