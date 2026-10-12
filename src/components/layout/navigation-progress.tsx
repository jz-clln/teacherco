'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {PageLoading} from '@/components/ui/page-loading';
let pending=false,timer:ReturnType<typeof setTimeout>|undefined;
const listeners=new Set<()=>void>();
function publish(value:boolean){pending=value;for(const listener of listeners)listener();}
function finish(){clearTimeout(timer);publish(false);}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function NavigationProgress(){
  const pathname=usePathname(),search=useSearchParams().toString();
  const active=useSyncExternalStore(subscribe,()=>pending,()=>false);
  useEffect(()=>{finish();},[pathname,search]);
  useEffect(()=>{
    const start=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;
      if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||url.pathname+url.search===location.pathname+location.search)return;
      publish(true);clearTimeout(timer);timer=setTimeout(finish,20000);
    };
    // Capture before Next Link handles the click and prevents the browser navigation.
    document.addEventListener('click',start,true);window.addEventListener('pageshow',finish);
    return()=>{document.removeEventListener('click',start,true);window.removeEventListener('pageshow',finish);finish();};
  },[]);
  return active?<PageLoading/>:null;
}
