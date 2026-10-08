import 'server-only';
import type { SectionDb } from '@/features/sections/data';
import { SUBJECTS } from './details';

/** Reuse the teacher's saved names without creating a second subject catalogue. */
export async function readSubjectOptions(db:SectionDb,teacherId:string){
  const names=new Map<string,string>(SUBJECTS.map(name=>[name.toLowerCase(),name]));
  for(const [table,column] of [['classes','subject'],['section_subjects','name']] as const){
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from(table).select(column).eq('teacher_id',teacherId).order('id').range(offset,offset+499);
      if(error||!data)throw new Error('Could not load saved subjects. Please retry.');
      for(const row of data){const name=String((row as unknown as Record<string,unknown>)[column]??'').trim().replace(/\s+/g,' ');if(name)names.set(name.toLocaleLowerCase(),name);}
      if(data.length<500)break;
    }
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b));
}
