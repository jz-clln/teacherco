import type { MappingDefinition } from '@/features/report-card-mappings/model';
import type { Period,Subject } from '@/features/gradebook/model';
import type { Bindings } from '@/features/report-card-generation/model';
import { normalize } from './structure';
export function suggestBindings(definition:MappingDefinition,periods:Period[],subjects:Subject[]):Bindings{
  const bindings:Bindings={periodBindings:{},subjectBindings:{}};
  for(const p of definition.periods){const matches=periods.filter(q=>q.status==='active'&&normalize(q.label)===normalize(p.label));if(matches.length===1)bindings.periodBindings[p.key]=matches[0].id;}
  for(const s of definition.subjects){const matches=subjects.filter(q=>q.status==='active'&&normalize(q.name)===normalize(s.label));if(matches.length===1)bindings.subjectBindings[s.key]=matches[0].id;}
  return bindings;
}
