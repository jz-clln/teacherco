import Image from 'next/image';
import {cn} from '@/lib/utils';

export function Spinner({className}:{className?:string}){
  return <span aria-hidden="true" className={cn('tc-loading-spinner',className)}><Image src="/brand/teacherco-mascot.png" alt="" width={64} height={64} sizes="64px" loading="eager"/></span>;
}

export function LoadingState({label='Loading...',page=false,className}:{label?:string;page?:boolean;className?:string}){
  return <div role="status" aria-live="polite" aria-label={label} aria-busy="true" className={cn('tc-loading-state',page&&'tc-loading-page',className)}>
    <Spinner className={page?'tc-loading-spinner-large':undefined}/>
    <span>{label}</span>
    {page&&<span className="tc-loading-track" aria-hidden="true"><span/></span>}
  </div>;
}
