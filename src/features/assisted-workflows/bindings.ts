import type { MappingDefinition } from '@/features/report-card-mappings/model';
import type { Period,Subject } from '@/features/gradebook/model';
import type { Bindings } from '@/features/report-card-generation/model';
import { normalizeLabel as normalize,periodCode } from './labels';
export function suggestPeriodBindings(definition:MappingDefinition,periods:Period[]):Bindings['periodBindings']{
  const active=periods.filter(p=>p.status==='active'),result:Bindings['periodBindings']={};
  const codes=active.map(p=>periodCode(p.label));
  const oneFamily=codes.length>0&&codes.every(c=>c!==null&&c<30)&&new Set(codes.map(c=>Math.floor(c!/10))).size===1&&new Set(codes).size===codes.length;
  for(const p of definition.periods){
    const exact=active.filter(q=>normalize(q.label)===normalize(p.label));
    if(exact.length===1){result[p.key]=exact[0].id;continue;}
    if(exact.length>1)continue;
    const code=periodCode(p.label),generic=/^period ([1-8])$/.exec(normalize(p.label));
    const matches=code!==null?active.filter(q=>periodCode(q.label)===code):generic&&oneFamily?active.filter(q=>periodCode(q.label)!%10===Number(generic[1])):[];
    if(matches.length===1)result[p.key]=matches[0].id;
  }
  return result;
}
export function suggestBindings(definition:MappingDefinition,periods:Period[],subjects:Subject[]):Bindings{
  const bindings:Bindings={periodBindings:suggestPeriodBindings(definition,periods),subjectBindings:{}};
  for(const s of definition.subjects){const matches=subjects.filter(q=>q.status==='active'&&normalize(q.name)===normalize(s.label));if(matches.length===1)bindings.subjectBindings[s.key]=matches[0].id;}
  return bindings;
}
export function completeBindings(definition:MappingDefinition,periods:Period[],subjects:Subject[],saved?:Bindings|null):Bindings{
  const suggested=suggestBindings(definition,periods,subjects);
  return {periodBindings:{...suggested.periodBindings,...saved?.periodBindings},subjectBindings:{...suggested.subjectBindings,...saved?.subjectBindings}};
}
