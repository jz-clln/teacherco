// @vitest-environment node
import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import {prepareWriter} from '@/features/report-card-generation/writer';
import {assignments} from '@/features/report-card-mappings/model';
import {mappingWorkbook,mappingDefinition} from './helpers/mapping-fixture';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
it('writes merged Unicode/XML strings and numeric zero; preserves original, protection, hidden sheets and unrelated ZIP parts',async()=>{
  const original=await mappingWorkbook(),hash=sha(original),def=mappingDefinition(hash),writer=await prepareWriter(original,def,hash);
  const values=assignments(writer.definition).map(a=>({...a,value:a.id==='field:learner_name'?'=José <Ana> & "李"':a.id.endsWith('period_1')?0:a.id.endsWith('period_2')?89:null}));
  const output=await writer.write(values);expect(sha(original)).toBe(hash);
  const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(output);
  expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort());
  for(const path of Object.keys(before.files).filter(p=>p!=='xl/worksheets/sheet1.xml'))expect(await after.file(path)?.async('nodebuffer')).toEqual(await before.file(path)?.async('nodebuffer'));
  const xml=await after.file('xl/worksheets/sheet1.xml')!.async('string');expect(xml.match(/<sheetProtection[^>]*\/>/)?.[0]).toBe((await before.file('xl/worksheets/sheet1.xml')!.async('string')).match(/<sheetProtection[^>]*\/>/)?.[0]);
  const w=new ExcelJS.Workbook();await w.xlsx.load(output as never);expect(w.worksheets[0].getCell('C8').value).toBe('=José <Ana> & "李"');expect(w.worksheets[0].getCell('D15').value).toBe(0);expect(w.worksheets[0].getCell('E15').value).toBe(89);expect(w.worksheets[0].getCell('F15').value).toBeNull();expect(w.worksheets[0].getCell('F8').value).toBe('=José <Ana> & "李"');expect(w.worksheets[1].state).toBe('veryHidden');
});
it('warns and requires confirmation for mapped formulas; untouched formulas remain byte-identical',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Front page');s.getCell('I30').value='End';s.getCell('C8').value={formula:'1+1',result:2};s.getCell('H20').value={formula:'SUM(D15:F15)',result:0};const original=Buffer.from(await w.xlsx.writeBuffer()),hash=sha(original),def=mappingDefinition(hash);def.fields.learner_name={sheet:'Front page',address:'C8'};
  const writer=await prepareWriter(original,def,hash),values=assignments(writer.definition).map(a=>({...a,value:'safe'}));expect(writer.formulaTargets).toEqual(['Front page!C8']);await expect(writer.write(values)).rejects.toThrow(/Confirm/);
  const output=await writer.write(values,true),z=await JSZip.loadAsync(output),before=await JSZip.loadAsync(original);const grab=async(zip:JSZip)=>(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).match(/<c r="H20"[\s\S]*?<\/c>/)?.[0];expect(await grab(z)).toBe(await grab(before));
});
it('inserts cells into existing rows and supports self-closing empty sheetData',async()=>{
  const original=await mappingWorkbook(),zip=await JSZip.loadAsync(original);const path='xl/worksheets/sheet1.xml';zip.file(path,(await zip.file(path)!.async('string')).replace(/<sheetData>[\s\S]*?<\/sheetData>/,'<sheetData/>'));const bytes=await zip.generateAsync({type:'nodebuffer'}),hash=sha(bytes),def={...mappingDefinition(hash),subjects:[],periods:[]},writer=await prepareWriter(bytes,def,hash),output=await writer.write(assignments(writer.definition).map(a=>({...a,value:88})));const w=new ExcelJS.Workbook();await w.xlsx.load(output as never);expect(w.worksheets[0].getCell('C8').value).toBe(88);
});
it('blocks mapped shared/array formulas and never changes source',async()=>{const zip=await JSZip.loadAsync(await mappingWorkbook()),path='xl/worksheets/sheet1.xml';zip.file(path,(await zip.file(path)!.async('string')).replace(/<c r="C8"[\s\S]*?<\/c>/,'<c r="C8"><f t="array" ref="C8:F8">1+1</f><v>2</v></c>'));const bytes=await zip.generateAsync({type:'nodebuffer'}),hash=sha(bytes);await expect(prepareWriter(bytes,mappingDefinition(hash),hash)).rejects.toThrow(/array/);expect(sha(bytes)).toBe(hash);});
it('preserves image/drawing/chart parts and safely represents literal Excel escape strings',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Front page');s.getCell('I30').value='End';s.mergeCells('C8:F8');const image=w.addImage({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=',extension:'png'});s.addImage(image,'A20:B22');
  const zip=await JSZip.loadAsync(await w.xlsx.writeBuffer());zip.file('xl/charts/chart1.xml','<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart/></c:chartSpace>');const bytes=await zip.generateAsync({type:'nodebuffer'}),hash=sha(bytes),writer=await prepareWriter(bytes,mappingDefinition(hash),hash),value='_x0041_ <&> =SUM(1,2)';const output=await writer.write(assignments(writer.definition).map(a=>({...a,value}))),result=await JSZip.loadAsync(output);
  for(const path of Object.keys(zip.files).filter(p=>/media|drawing|chart/.test(p)))expect(await result.file(path)?.async('nodebuffer')).toEqual(await zip.file(path)?.async('nodebuffer'));
  const xml=await result.file('xl/worksheets/sheet1.xml')!.async('string');expect(xml).toContain('_x005F_x0041_ &lt;&amp;&gt; =SUM(1,2)');expect(xml).not.toContain('<f>');
});
