'use client';
import {useEffect,useRef,useSyncExternalStore,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {Button} from '@/components/ui/button';

const query='(max-width: 1023px)';
function subscribe(change:()=>void){const media=window.matchMedia(query);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);}
export function useCompactMapping(){return useSyncExternalStore(subscribe,()=>window.matchMedia(query).matches,()=>false);}

export function MappingPanel({compact,open,onClose,children}:{compact:boolean;open:boolean;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open,compact]);
  if(!compact)return <aside aria-label="Mapping controls" className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain [&>*]:shrink-0 rounded-xl border border-[#E3E5E1] bg-white">{children}</aside>;
  return <dialog ref={ref} aria-label="Mapping controls" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl border border-[#E3E5E1] bg-white p-0 text-[#1E2420] backdrop:bg-black/40">
    <div className="flex max-h-[85dvh] flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E3E5E1] px-4"><h2 className="text-base font-semibold">Mapping</h2><Button variant="ghost" aria-label="Close mapping panel" onClick={onClose}><X size={18}/></Button></div>
      {children}
    </div>
  </dialog>;
}
