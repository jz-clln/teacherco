import {z} from 'zod';
import type {Section} from '@/types/domain';
import type {Period,Subject,GradeEntry} from '@/features/gradebook/model';
import type {MappingDefinition,MappingRecord,Location} from '@/features/report-card-mappings/model';
import {assignments} from '@/features/report-card-mappings/model';
import type {Template} from '@/features/report-card-templates/model';

export const MAX_BULK_LEARNERS=50;
export const MAX_DOWNLOAD_BYTES=3*1024*1024;
export const MAX_ARCHIVE_INPUT_BYTES=12*1024*1024;
export const bindingsSchema=z.object({periodBindings:z.record(z.string().regex(/^period_[1-8]$/),z.uuid()),subjectBindings:z.record(z.uuid(),z.uuid())}).strict();
export type Bindings=z.infer<typeof bindingsSchema>;
export type GenerationProfile={id:string;teacher_id:string;section_id:string;template_id:string;mapping_id:string;mapping_revision:number;template_sha256:string;bindings:Bindings;revision:number;created_at:string;updated_at:string};
export type GenerationLearner={id:string;display_name:string};
export type GenerationSnapshot={section:Section;template:Template;mapping:MappingRecord;profile:GenerationProfile|null;periods:Period[];subjects:Subject[];learners:GenerationLearner[];entries:GradeEntry[];adviserName:string|null};
export type OutputValue={id:string;label:string;location:Location;value:string|number|null};
export function validateBindings(input:unknown,definition:MappingDefinition,periods:Period[],subjects:Subject[]):Bindings{
  const parsed=bindingsSchema.safeParse(input);if(!parsed.success)throw new Error('Confirm valid Section period and subject bindings.');const b=parsed.data;
  const expectedPeriods=definition.periods.map(p=>p.key).sort(),expectedSubjects=definition.subjects.map(s=>s.key).sort();
  if(JSON.stringify(Object.keys(b.periodBindings).sort())!==JSON.stringify(expectedPeriods)||JSON.stringify(Object.keys(b.subjectBindings).sort())!==JSON.stringify(expectedSubjects))throw new Error('Confirm a Section match for every template period and subject.');
  for(const id of Object.values(b.periodBindings))if(!periods.some(p=>p.id===id&&p.status==='active'))throw new Error('A bound Section period is no longer active. Configure compatibility again.');
  for(const id of Object.values(b.subjectBindings))if(!subjects.some(s=>s.id===id&&s.status==='active'))throw new Error('A bound Section subject is no longer active. Configure compatibility again.');
  return b;
}
export function verifyProfile(snapshot:GenerationSnapshot){
  const p=snapshot.profile,m=snapshot.mapping,t=snapshot.template;
  if(snapshot.section.status!=='active'||t.status!=='active'||m.status!=='reviewed')throw new Error('Generation requires an active Section, active template and reviewed mapping.');
  if(!p)throw new Error('Configure and save compatibility before generating.');
  if(p.section_id!==snapshot.section.id||p.template_id!==t.id||p.mapping_id!==m.id||p.mapping_revision!==m.revision||p.template_sha256!==t.file_sha256)throw new Error('Template mapping or source changed. Configure compatibility and review again.');
  validateBindings(p.bindings,m.mapping_definition,snapshot.periods,snapshot.subjects);return p;
}
export function valuesForLearner(snapshot:GenerationSnapshot,definition:MappingDefinition,learner:GenerationLearner):OutputValue[]{
  const profile=verifyProfile(snapshot),section=snapshot.section;
  if(!snapshot.learners.some(l=>l.id===learner.id))throw new Error('This learner is not active in the Section.');
  const scalars:Record<string,string|null>={learner_name:learner.display_name,grade_level:section.grade_level,section_name:section.name,school_year:section.school_year,school_name:section.school_name,school_id:section.school_id,adviser_name:section.is_adviser?snapshot.adviserName:null,lrn:null,final_average:null,general_remarks:null};
  const grades=new Map(snapshot.entries.filter(e=>e.learner_id===learner.id).map(e=>[`${e.section_subject_id}:${e.period_id}`,e.grade]));
  return assignments(definition).map(a=>{
    const [kind,key,output]=a.id.split(':');let value:string|number|null=null;
    if(kind==='field')value=scalars[key]??null;
    else{const subjectId=profile.bindings.subjectBindings[key];if(output==='label')value=snapshot.subjects.find(s=>s.id===subjectId)?.name??null;else if(output.startsWith('period_'))value=grades.get(`${subjectId}:${profile.bindings.periodBindings[output]}`)??null;}
    if(typeof value==='number'&&(!Number.isFinite(value)||value<0||value>100))throw new Error('A Grade Book value is invalid. Review it before generating.');
    if(typeof value==='string'&&!value.trim())value=null;
    return {...a,value};
  });
}
export function safeFilename(value:string){return Array.from(value.normalize('NFC').replace(/[^\p{L}\p{N}\-_. ]/gu,'-').replace(/[ ._-]+/g,'-').replace(/^-+|-+$/g,'')).slice(0,80).join('')||'Report-Card';}
