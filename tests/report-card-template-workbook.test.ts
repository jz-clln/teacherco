// @vitest-environment node
import { expect,it,vi } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
vi.mock('server-only',()=>({}));
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {columnLetter,parseAddress,fileValidation} from '@/features/report-card-templates/model';
import {protectedTemplate} from './helpers/protected-template';
async function fixture(){const w=new ExcelJS.Workbook(),s=w.addWorksheet('Front page');s.mergeCells('C8:F8');s.getCell('C8').value='Blank template';s.getCell('C8').font={bold:true,color:{argb:'FF1A4D2E'}};s.getCell('A1').value='<script>alert(1)</script>';s.getCell('B2').value={formula:'SUM(1,2)',result:3};s.getCell('A4').value=0.85;s.getCell('A4').numFmt='0%';s.getCell('A5').value={text:'Inert link',hyperlink:'https://example.invalid/never-fetch'};w.addWorksheet('Back page');w.addWorksheet('Lookup',{state:'veryHidden'});return Buffer.from(await w.xlsx.writeBuffer());}
async function change(path:string,transform:(xml:string)=>string){const z=await JSZip.loadAsync(await fixture());z.file(path,transform(await z.file(path)!.async('string')));return z.generateAsync({type:'nodebuffer'});}
it('preserves bytes, worksheet names/order/visibility, real addresses, merged masters, formatting and cached formulas',async()=>{const bytes=await fixture(),before=createHash('sha256').update(bytes).digest('hex'),w=await parseWorkbook(bytes),s=w.sheet(0);expect(w.metadata.sheets.map(s=>[s.name,s.state])).toEqual([['Front page','visible'],['Back page','visible'],['Lookup','veryHidden']]);expect(s.cells.find(c=>c.address==='C8')).toMatchObject({mergedRange:'C8:F8',displayValue:'Blank template',style:{bold:true,color:'#1A4D2E'}});expect(s.cells.some(c=>c.address==='D8')).toBe(false);expect(s.cells.find(c=>c.address==='B2')).toMatchObject({type:'formula',formula:'SUM(1,2)',cachedValue:'3'});expect(s.cells.find(c=>c.address==='A4')?.displayValue).toBe('85%');expect(s.cells.find(c=>c.address==='A1')?.displayValue).toBe('<script>alert(1)</script>');expect(s.cells.find(c=>c.address==='A5')?.displayValue).toBe('Inert link');expect(createHash('sha256').update(bytes).digest('hex')).toBe(before);expect(JSON.stringify(w.metadata)).not.toContain('Blank template');});
it('clips merged cells once per window and retains master coordinates',async()=>{const w=await parseWorkbook(await fixture()),s=w.sheet(0,8,4);expect(s.cells.filter(c=>c.mergedRange==='C8:F8')).toHaveLength(1);expect(s.cells[0].address).toBe('C8');});
it('bounds sparse far-away cells without expanding the sheet into millions of cells',async()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('Large');s.getCell('A1').value='Blank';s.getCell('XFD1048576').value='Edge';const parsed=await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()));expect(parsed.metadata.sheets[0]).toMatchObject({rowExtent:2000,columnExtent:128,truncated:true});expect(parsed.sheet(0).cells.length).toBeLessThanOrEqual(1440);expect(parsed.sheet(0).warnings.join(' ')).toContain('too large');});
it.each([Buffer.from('bad'),Buffer.from([0x50]),Buffer.from('d0cf11e0a1b11ae1','hex')])('rejects corrupt or encrypted input',async b=>{await expect(parseWorkbook(b)).rejects.toThrow();});
it.each([['xl/workbook.xml',(s:string)=>s.replace('http://schemas.openxmlformats.org/spreadsheetml/2006/main','https://invalid.example')],['xl/workbook.xml',(s:string)=>'<!DOCTYPE workbook [<!ENTITY a "bad">]>'+s]])('rejects invalid XML %s',async(path,transform)=>{await expect(parseWorkbook(await change(path as string,transform as (s:string)=>string))).rejects.toThrow();});
it.each([{sheet:true,workbook:false},{sheet:false,workbook:true},{sheet:true,workbook:true}])('accepts editing protection %j without changing bytes or exposing protection internals',async options=>{
  const bytes=await protectedTemplate(options),original=Buffer.from(bytes),hash=createHash('sha256').update(bytes).digest('hex');
  const parsed=await parseWorkbook(bytes),preview=parsed.sheet(0);
  expect(preview.cells[0].displayValue).toBe('Protected template label');
  expect(preview.warnings.some(w=>w.startsWith('Protected worksheet.'))).toBe(options.sheet);
  expect(preview.warnings.some(w=>w.startsWith('Protected workbook.'))).toBe(options.workbook);
  const payload=JSON.stringify({metadata:parsed.metadata,preview});
  expect(payload).not.toMatch(/workbookPassword|hashValue|saltValue|spinCount|algorithmName|ABCD|fixture-edit-password/);
  const zip=await JSZip.loadAsync(bytes),sheet=await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  for(const value of sheet.matchAll(/(?:hashValue|saltValue)="([^"]+)"/g))expect(payload).not.toContain(value[1]);
  expect(bytes.equals(original)).toBe(true);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
  expect(sheet.includes('<sheetProtection')).toBe(options.sheet);
  expect((await zip.file('xl/workbook.xml')!.async('string')).includes('<workbookProtection')).toBe(options.workbook);
});
it('still rejects encrypted Office container signatures',async()=>{await expect(parseWorkbook(Buffer.concat([Buffer.from('d0cf11e0a1b11ae1','hex'),Buffer.alloc(504)]))).rejects.toThrow(/encrypted/);});
it('still rejects ZIP encryption flags before reading protected XML',async()=>{
  const bytes=await protectedTemplate();
  // Mark a deflated central-directory member encrypted. Directory entries are
  // empty and would instead fail ZIP size validation before the encryption gate.
  const signature=Buffer.from('504b0102','hex');let central=bytes.indexOf(signature);
  while(central>=0&&bytes.readUInt16LE(central+10)!==8)central=bytes.indexOf(signature,central+4);
  expect(central).toBeGreaterThan(0);
  bytes.writeUInt16LE(bytes.readUInt16LE(central+8)|1,central+8);
  await expect(parseWorkbook(bytes)).rejects.toThrow(/encrypted/);
});
it('rejects macros even when the extension would be xlsx',async()=>{const z=await JSZip.loadAsync(await fixture());z.file('xl/vbaProject.bin','macro');await expect(parseWorkbook(await z.generateAsync({type:'nodebuffer'}))).rejects.toThrow(/Macro/);});
it('rejects path escapes and external workbook relationships',async()=>{await expect(parseWorkbook(await change('_rels/.rels',s=>s.replace('Target="xl/workbook.xml"','Target="../../workbook.xml"')))).rejects.toThrow();});
it('accepts relationship namespace prefixes without assuming r',async()=>{const b=await change('xl/workbook.xml',s=>s.replaceAll('xmlns:r=','xmlns:rel=').replaceAll('r:id=','rel:id='));expect((await parseWorkbook(b)).metadata.sheets).toHaveLength(3);});
it('retains formula expressions as text and warns about external references',async()=>{const b=await change('xl/worksheets/sheet1.xml',s=>s.replace('SUM(1,2)',"'[Outside.xlsx]Data'!A1"));const s=(await parseWorkbook(b)).sheet(0);expect(s.summary.hasExternalReferences).toBe(true);expect(s.cells.find(c=>c.address==='B2')?.formula).toContain('Outside.xlsx');});
it('coordinates and file gate reject invalid inputs',()=>{expect(columnLetter(27)).toBe('AA');expect(parseAddress('$XFD$1048576')).toEqual({row:1048576,column:16384});expect(()=>parseAddress('XFE1')).toThrow();expect(fileValidation('a.xlsm',10,'')).toContain('.xlsx');expect(fileValidation('a.xlsx',11*1024*1024,'')).toContain('10 MB');});
