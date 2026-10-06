import { z } from 'zod';
import { cellAddress, parseMerge, type Merge, type WorkbookMetadata } from '@/features/report-card-templates/model';

export const FIELD_LABELS={learner_name:'Learner Name',grade_level:'Grade Level',section_name:'Section',school_year:'School Year',adviser_name:'Adviser Name',school_name:'School Name',school_id:'School ID',lrn:'LRN',final_average:'Final Average',general_remarks:'General Remarks'} as const;
export const FIELD_KEYS=Object.keys(FIELD_LABELS) as [keyof typeof FIELD_LABELS,...(keyof typeof FIELD_LABELS)[]];
export const PERIOD_KEYS=['period_1','period_2','period_3','period_4','period_5','period_6','period_7','period_8'] as const;
export const OUTPUT_KEYS=[...PERIOD_KEYS,'final_grade','remarks'] as const;
const label=z.string().trim().min(1).max(120);
export const locationSchema=z.object({sheet:z.string().min(1).max(31),address:z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}(?::[A-Z]{1,3}[1-9]\d{0,6})?$/)}).strict();
export const definitionSchema=z.object({
  formatVersion:z.literal(1),templateSha256:z.string().regex(/^[a-f0-9]{64}$/),
  fields:z.partialRecord(z.enum(FIELD_KEYS),locationSchema),
  periods:z.array(z.object({key:z.enum(PERIOD_KEYS),label}).strict()).max(8),
  subjects:z.array(z.object({key:z.uuid(),label,labelLocation:locationSchema.optional(),outputs:z.partialRecord(z.enum(OUTPUT_KEYS),locationSchema)}).strict()).max(60),
}).strict();
export type Location=z.infer<typeof locationSchema>;
export type MappingDefinition=z.infer<typeof definitionSchema>;
export type MappingRecord={id:string;teacher_id:string;template_id:string;mapping_definition:MappingDefinition;revision:number;status:'draft'|'reviewed';created_at:string;updated_at:string};
export type WorkbookStructure={metadata:WorkbookMetadata;merges:Merge[][];worksheetNames:string[]};
export type Assignment={id:string;label:string;location:Location};
export const emptyDefinition=(hash:string):MappingDefinition=>({formatVersion:1,templateSha256:hash,fields:{},periods:[],subjects:[]});
export function assignments(def:MappingDefinition):Assignment[]{
  const result:Assignment[]=Object.entries(def.fields).map(([key,location])=>({id:`field:${key}`,label:FIELD_LABELS[key as keyof typeof FIELD_LABELS],location}));
  for(const s of def.subjects){if(s.labelLocation)result.push({id:`subject:${s.key}:label`,label:`${s.label} · Subject label`,location:s.labelLocation});for(const [key,location] of Object.entries(s.outputs))result.push({id:`subject:${s.key}:${key}`,label:`${s.label} · ${key==='final_grade'?'Final Grade':key==='remarks'?'Remarks':def.periods.find(p=>p.key===key)?.label??key}`,location});}
  return result;
}
export function intersects(a:Merge,b:Merge){return a.top<=b.bottom&&a.bottom>=b.top&&a.left<=b.right&&a.right>=b.left;}
export function normalizeLocation(location:Location,structure:WorkbookStructure):Location{
  const checked=locationSchema.safeParse(location);if(!checked.success)throw new Error('Choose a valid A1 cell or rectangular range.');
  const index=structure.metadata.sheets.findIndex(s=>s.name===location.sheet),sheet=structure.metadata.sheets[index];
  if(!sheet)throw new Error(`Worksheet '${location.sheet}' does not exist.`);
  if(!structure.worksheetNames.includes(sheet.name))throw new Error('Only worksheet cells can be mapped. This sheet type is not supported.');
  let rect:Merge;try{rect=parseMerge(location.address);}catch{throw new Error(`Invalid address: ${location.address}.`);}
  if(rect.bottom>sheet.rowExtent||rect.right>sheet.columnExtent)throw new Error(`${location.sheet}!${location.address} is outside the supported preview bounds.`);
  const merges=structure.merges[index]??[];
  if(rect.top===rect.bottom&&rect.left===rect.right){const merged=merges.find(m=>intersects(rect,m));if(merged)rect=merged;}
  for(const merge of merges){if(intersects(rect,merge)&&!(rect.top<=merge.top&&rect.left<=merge.left&&rect.bottom>=merge.bottom&&rect.right>=merge.right))throw new Error(`Select the entire merged range ${merge.address}.`);}
  if(rect.bottom>sheet.rowExtent||rect.right>sheet.columnExtent)throw new Error('This merged range extends outside supported preview bounds.');
  return {sheet:sheet.name,address:rect.top===rect.bottom&&rect.left===rect.right?cellAddress(rect.top,rect.left):rect.address};
}
export function validateDefinition(input:unknown,hash:string,structure:WorkbookStructure):MappingDefinition{
  if(JSON.stringify(input)?.length>131072)throw new Error('This mapping is too large. Use at most 60 subject rows.');
  const parsed=definitionSchema.safeParse(input);if(!parsed.success)throw new Error('Check the mapping fields, labels, period slots and cell addresses. Only mapping locations and labels can be saved.');
  const def=parsed.data;if(def.templateSha256!==hash)throw new Error('This mapping belongs to a different source workbook. Reopen the template.');
  if(new Set(def.periods.map(p=>p.key)).size!==def.periods.length)throw new Error('Period keys must be unique.');
  if(new Set(def.subjects.map(s=>s.key)).size!==def.subjects.length)throw new Error('Subject mapping IDs must be unique.');
  const periods=new Set<string>(def.periods.map(p=>p.key));
  for(const key of FIELD_KEYS){const location=def.fields[key];if(location)def.fields[key]=normalizeLocation(location,structure);}
  for(const subject of def.subjects){if(subject.labelLocation)subject.labelLocation=normalizeLocation(subject.labelLocation,structure);for(const key of OUTPUT_KEYS){const location=subject.outputs[key];if(!location)continue;if(key.startsWith('period_')&&!periods.has(key))throw new Error(`Define ${key} before assigning its output.`);subject.outputs[key]=normalizeLocation(location,structure);}}
  const targets=assignments(def);
  for(let i=0;i<targets.length;i++)for(let j=0;j<i;j++){const a=targets[i],b=targets[j];if(a.location.sheet===b.location.sheet&&intersects(parseMerge(a.location.address),parseMerge(b.location.address)))throw new Error(`${a.label} overlaps ${b.label} at ${a.location.sheet}!${a.location.address}. Choose separate output locations.`);}
  return def;
}
export function mappingWarnings(def:MappingDefinition){const warnings:string[]=[];if(!assignments(def).length)warnings.push('No output locations are assigned yet. You can save this partial mapping and continue later.');if(!def.fields.learner_name)warnings.push('Learner Name is not mapped.');if(!def.periods.length)warnings.push('No output periods are defined.');for(const s of def.subjects)if(!Object.keys(s.outputs).length)warnings.push(`${s.label}: no grade outputs assigned.`);return warnings;}
export function clearAssignment(def:MappingDefinition,id:string):MappingDefinition{
  const next=structuredClone(def),[kind,key,output]=id.split(':');
  if(kind==='field')delete next.fields[key as keyof typeof FIELD_LABELS];
  else {const subject=next.subjects.find(s=>s.key===key);if(subject){if(output==='label')delete subject.labelLocation;else delete subject.outputs[output as typeof OUTPUT_KEYS[number]];}}
  return next;
}
