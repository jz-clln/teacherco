'use client';
import { useSyncExternalStore,type ComponentProps } from 'react';
import { MappingWorkspace } from '@/features/report-card-mappings/workspace';
import { definitionSchema } from '@/features/report-card-mappings/model';
const subscribe=()=>()=>{};
export function ManualHandoff(props:ComponentProps<typeof MappingWorkspace>){
  const value=useSyncExternalStore(subscribe,()=>{try{return sessionStorage.getItem(`mapping-proposal:${props.template.id}`);}catch{return null;}},()=>null);
  let draft;try{if(value){const parsed=JSON.parse(value);if(parsed.revision===(props.initial?.revision??0)&&parsed.expectedId===(props.initial?.id??null)){const d=definitionSchema.parse(parsed.definition);if(d.templateSha256===props.template.file_sha256)draft=d;}}}catch{/* Invalid local drafts are ignored. */}
  return <MappingWorkspace key={draft?value:'saved'} {...props} draft={draft}/>;
}
