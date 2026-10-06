// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mock=vi.hoisted(()=>({input:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/features/reports/queries',()=>({loadReportInput:mock.input}));
import { getClassTermGrades, getGradingClassSettings } from '@/features/grading/queries';
type Row=Record<string,unknown>;
function client(tables:Record<string,Row[]>,fail?:string){
  const calls:{table:string;from:number;to:number}[]=[];
  const db={from(table:string){let from=0,to=499,single=false;
    const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:(a:number,b:number)=>{from=a;to=b;return q;},maybeSingle:()=>{single=true;return q;},then(resolve:(r:unknown)=>unknown){calls.push({table,from,to});return Promise.resolve(resolve({data:fail===table?null:single?(tables[table]?.[0]??null):(tables[table]??[]).slice(from,to+1),error:fail===table?{message:'Read failed'}:null}));}};return q;
  }};
  return {db:db as unknown as SupabaseClient,calls};
}
beforeEach(()=>mock.input.mockResolvedValue({classInfo:{name:'Math',subject:'Math',gradeLevel:'Grade 8'},learners:[{id:'last',name:'Last learner'}],scores:[]}));
it('reads printed grades and activities beyond a single response page',async()=>{
  const records=Array.from({length:1001},(_,i)=>({learner_id:i===1000?'last':`learner-${i}`,term:1,initial_grade:null,term_grade:i===1000?89.48:80,descriptor:null}));
  const {db,calls}=client({teacher_term_grades:records,assessments:Array.from({length:501},(_,i)=>({id:`activity-${i}`,term:1,component:'written_work'}))});
  const result=await getClassTermGrades(db,'class');expect(result?.learners[0].terms[0].recorded?.termGrade).toBe(89.48);
  expect(calls.filter(c=>c.table==='teacher_term_grades').map(c=>c.from)).toEqual([0,500,1000]);expect(calls.filter(c=>c.table==='assessments').map(c=>c.from)).toEqual([0,500]);
});
it.each(['class_grading_config','teacher_term_grades','assessments'])('fails closed when %s cannot be read',async table=>{const {db}=client({},table);await expect(getClassTermGrades(db,'class')).rejects.toThrow(/grading records/);});
it('does not reread configuration or silently replace it with defaults',async()=>{
  const config={weights:{written_work:0.2,performance_task:0.5,assessment:0.3},transmutation:[{min:0,max:null,grade:88.72}],descriptors:[{min:0,label:'Reviewed'}],term_possible:{},source_filename:'class-record.xlsx'};
  mock.input.mockResolvedValue({classInfo:{name:'Math',subject:'Math',gradeLevel:'Grade 8'},learners:[{id:'last',name:'Last learner'}],scores:[{assessmentId:'exam',assessmentTitle:'Term 1 Exam',learnerId:'last',earned:80,possible:100}]});
  const {db,calls}=client({class_grading_config:[config],assessments:[{id:'exam',term:1,component:'assessment'}]});const result=await getClassTermGrades(db,'class');expect(result?.learners[0].terms[0].result.termGrade).toBe(88.72);expect(result?.config).toMatchObject({weights:config.weights});expect(calls.filter(c=>c.table==='class_grading_config')).toHaveLength(1);
});
it('grading settings fail closed on a configuration read error',async()=>{const {db}=client({},'class_grading_config');await expect(getGradingClassSettings(db,[{id:'class',name:'Math',subject:'Math'}])).rejects.toThrow(/grading rules/);});
