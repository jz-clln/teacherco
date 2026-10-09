import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),owned:vi.fn(),bytes:vi.fn(),parse:vi.fn(),structure:vi.fn(),analyze:vi.fn()}));
vi.mock('@/features/report-card-templates/data',()=>({templateAccess:mocks.access,ownedTemplate:mocks.owned,originalBytes:mocks.bytes,TemplateError:class extends Error{}}));
vi.mock('@/features/report-card-templates/workbook',()=>({parseWorkbook:mocks.parse}));
vi.mock('@/features/assisted-workflows/structure',()=>({structuralInput:mocks.structure}));
vi.mock('@/features/assisted-workflows/mapping-actions',()=>({analyzeTemplate:mocks.analyze}));
import {detectGradeColumns} from '@/features/report-card-mappings/grade-table-actions';
beforeEach(()=>{vi.resetAllMocks();mocks.access.mockResolvedValue({});mocks.owned.mockResolvedValue({});mocks.bytes.mockResolvedValue(new Uint8Array());mocks.parse.mockResolvedValue({metadata:{sheets:[{name:'Front'}]}});});
it('uses local recognition at zero AI cost even with empty subject rows',async()=>{
  mocks.structure.mockReturnValue({sheets:[{labels:['T1','T2','T3'].map((label,i)=>({label,address:`${String.fromCharCode(71+i)}29`}))}]});
  expect(await detectGradeColumns('template','Front')).toEqual({ok:true,columns:[{label:'Term 1',column:'G'},{label:'Term 2',column:'H'},{label:'Term 3',column:'I'}]});
  expect(mocks.analyze).not.toHaveBeenCalled();expect(mocks.owned).toHaveBeenCalledWith({},'template');
});
it('leaves multiple tables for teacher selection without spending AI calls',async()=>{
  mocks.structure.mockReturnValue({sheets:[{labels:[{label:'T1',address:'G29'},{label:'T2',address:'H29'},{label:'Q1',address:'G50'},{label:'Q2',address:'H50'}]}]});
  expect(await detectGradeColumns('template','Front')).toMatchObject({ok:false,error:expect.stringContaining('Several')});expect(mocks.analyze).not.toHaveBeenCalled();
});
it('uses the existing cost-first analysis for unclear headers and rejects inaccessible workbooks',async()=>{
  mocks.structure.mockReturnValue({sheets:[{labels:[]}]});mocks.analyze.mockResolvedValue({ok:true,data:{definition:{periods:[{key:'period_1',label:'Term 1'}],subjects:[{outputs:{period_1:{sheet:'Front',address:'G30'}}}]}}});
  expect(await detectGradeColumns('template','Front')).toMatchObject({ok:true,columns:[{column:'G'}]});expect(mocks.analyze).toHaveBeenCalledOnce();
  mocks.owned.mockRejectedValue(new Error('Denied'));expect(await detectGradeColumns('other','Front')).toMatchObject({ok:false});expect(mocks.analyze).toHaveBeenCalledOnce();
});
