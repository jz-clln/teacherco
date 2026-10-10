// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mock=vi.hoisted(()=>({access:vi.fn(),section:vi.fn(),book:vi.fn(),grades:vi.fn(),rpc:vi.fn(),source:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/features/sections/action-helpers',()=>({sectionAccess:mock.access,requireSection:mock.section,SectionError:class extends Error{}}));
vi.mock('@/features/gradebook/data',()=>({readGradebook:mock.book}));
vi.mock('@/features/grading/queries',()=>({getClassTermGrades:mock.grades}));
import { previewClassGrades, importClassGrades, saveManualGrades, saveGradebookSetup } from '@/features/gradebook/actions';
const ids={sectionId:randomUUID(),subjectId:randomUUID(),periodId:randomUUID(),classId:randomUUID(),learner:randomUUID(),teacher:randomUUID()};
const selection={sectionId:ids.sectionId,subjectId:ids.subjectId,periodId:ids.periodId,classId:ids.classId,term:1,calculation:'printed'};
beforeEach(()=>{
  vi.clearAllMocks();const query={select:()=>query,eq:()=>query,maybeSingle:mock.source};
  mock.access.mockResolvedValue({user:{id:ids.teacher},supabase:{from:()=>query,rpc:mock.rpc}});mock.section.mockResolvedValue({id:ids.sectionId,status:'active'});mock.source.mockResolvedValue({data:{id:ids.classId,subject:'Mathematics',sync_revision:7},error:null});mock.rpc.mockResolvedValue({error:null});
  mock.book.mockResolvedValue({subjects:[{id:ids.subjectId,name:'Mathematics',status:'active'}],periods:[{id:ids.periodId,status:'active'}],learners:[{id:ids.learner,status:'active'}],entries:[]});
  mock.grades.mockResolvedValue({learners:[{id:ids.learner,name:'Ana',terms:[{term:1,recorded:{termGrade:89},result:{status:'graded',termGrade:88,warnings:[]}}]}]});
});
it('preview is read-only; confirmation uses recomputed server grades, ignores spoofed teacher IDs',async()=>{
  const preview=await previewClassGrades(selection);expect(preview.ok).toBe(true);expect(mock.rpc).not.toHaveBeenCalled();if(!preview.ok)return;
  const saved=await importClassGrades({...selection,digest:preview.data.digest,replaceManual:[],confirmed:true,teacher_id:randomUUID(),grade:100});expect(saved.ok).toBe(true);
  expect(mock.rpc).toHaveBeenCalledWith('save_section_grades',expect.objectContaining({p_rows:[{learner_id:ids.learner,grade:89,expected_updated_at:null,replace_manual:false}],p_revision:7}));expect(mock.rpc.mock.calls[0][1]).not.toHaveProperty('teacher_id');
});
it('requires new preview when current values or class revision change',async()=>{const preview=await previewClassGrades(selection);if(!preview.ok)throw new Error('preview');mock.source.mockResolvedValue({data:{subject:'Mathematics',sync_revision:8},error:null});expect(await importClassGrades({...selection,digest:preview.data.digest,replaceManual:[],confirmed:true})).toMatchObject({ok:false,error:expect.stringMatching(/changed/)});expect(mock.rpc).not.toHaveBeenCalled();});
it('fails closed if source changes during the read',async()=>{mock.source.mockResolvedValueOnce({data:{subject:'Mathematics',sync_revision:7}}).mockResolvedValueOnce({data:{subject:'Mathematics',sync_revision:8}});expect(await previewClassGrades(selection)).toMatchObject({ok:false});expect(mock.rpc).not.toHaveBeenCalled();});
it('keeps manual values by default and only replaces explicitly selected UUIDs',async()=>{
  mock.book.mockResolvedValue({subjects:[{id:ids.subjectId,name:'Mathematics',status:'active'}],periods:[{id:ids.periodId,status:'active'}],learners:[{id:ids.learner,status:'active'}],entries:[{learner_id:ids.learner,section_subject_id:ids.subjectId,period_id:ids.periodId,grade:84,source_type:'manual',updated_at:'2026-10-05T00:00:00Z'}]});
  const preview=await previewClassGrades(selection);if(!preview.ok)throw new Error('preview');expect(await importClassGrades({...selection,digest:preview.data.digest,replaceManual:[],confirmed:true})).toMatchObject({ok:false});expect(mock.rpc).not.toHaveBeenCalled();expect(await importClassGrades({...selection,digest:preview.data.digest,replaceManual:[ids.learner],confirmed:true})).toMatchObject({ok:true});
});
it('excludes inactive or outside learners even if their names match',async()=>{mock.book.mockResolvedValue({subjects:[{id:ids.subjectId,name:'Mathematics',status:'active'}],periods:[{id:ids.periodId,status:'active'}],learners:[{id:ids.learner,status:'inactive'},{id:randomUUID(),status:'active',display_name:'Ana'}],entries:[]});const p=await previewClassGrades(selection);expect(p.ok&&p.data.rows[0].status).toBe('outside');});
it('rejects unlinked source and archived Section before calculations',async()=>{mock.source.mockResolvedValue({data:null,error:null});expect(await previewClassGrades(selection)).toMatchObject({ok:false});expect(mock.grades).not.toHaveBeenCalled();mock.section.mockResolvedValue({status:'archived'});expect(await previewClassGrades(selection)).toMatchObject({ok:false});});
it('validates manual rows before writing and uses one authenticated RPC',async()=>{expect(await saveManualGrades({...selection,confirmed:true,rows:[{learner_id:ids.learner,grade:101,expected_updated_at:null}]})).toMatchObject({ok:false});expect(mock.rpc).not.toHaveBeenCalled();expect(await saveManualGrades({...selection,confirmed:true,teacher_id:randomUUID(),rows:[{learner_id:ids.learner,grade:89.48,expected_updated_at:null}]})).toMatchObject({ok:true});expect(mock.rpc).toHaveBeenCalledTimes(1);expect(mock.rpc.mock.calls[0][1]).not.toHaveProperty('teacher_id');});
it('warns about duplicate local subjects and accepts deliberate distinct identities',async()=>{const input={sectionId:ids.sectionId,periods:[{id:ids.periodId,key:'period_1',label:'Midyear',position:1,status:'active'}],subjects:[1,2].map(i=>({id:randomUUID(),name:'Math',code:null,category:null,position:i,status:'active'})),expected:[],duplicatesConfirmed:false};expect(await saveGradebookSetup(input)).toMatchObject({ok:false,error:expect.stringMatching(/Duplicate/)});expect(mock.rpc).not.toHaveBeenCalled();expect(await saveGradebookSetup({...input,duplicatesConfirmed:true})).toMatchObject({ok:true});});

it('rejects a different class subject being imported into the previous destination',async()=>{
 const language=randomUUID();mock.source.mockResolvedValue({data:{id:ids.classId,subject:'Language',sync_revision:7}});
 mock.book.mockResolvedValue({subjects:[{id:ids.subjectId,name:'Calculus',status:'active'},{id:language,name:'Language',status:'active'}],periods:[{id:ids.periodId,status:'active'}],learners:[{id:ids.learner,status:'active'}],entries:[]});
 expect(await previewClassGrades(selection)).toMatchObject({ok:false,error:expect.stringContaining('different subject')});expect(mock.rpc).not.toHaveBeenCalled();
 const corrected={...selection,subjectId:language},preview=await previewClassGrades(corrected);if(!preview.ok)throw new Error(preview.error);
 expect(await importClassGrades({...corrected,digest:preview.data.digest,replaceManual:[],confirmed:true})).toMatchObject({ok:true});
 expect(mock.rpc).toHaveBeenCalledWith('save_section_grades',expect.objectContaining({p_subject:language,p_period:ids.periodId}));
});
it('requires explicit destination confirmation when class labels have no unique match',async()=>{
 mock.source.mockResolvedValue({data:{id:ids.classId,subject:'Custom math class',sync_revision:7}});
 expect(await previewClassGrades(selection)).toMatchObject({ok:false,error:expect.stringContaining('Confirm the destination')});
 expect(await previewClassGrades({...selection,destinationConfirmed:true})).toMatchObject({ok:true});
});
