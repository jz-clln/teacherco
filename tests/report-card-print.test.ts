// @vitest-environment node
import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {reportPrintDocument,printGeometry,printPageCount,DEFAULT_PRINT_SETTINGS} from '@/features/report-card-generation/print';
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
it.each(['letter','a4'] as const)('centers the report on %s paper in either orientation',async paperSize=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='Report';s.getCell('D30').value='Footer';
  const sheets=(await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()))).printSheets();
  for(const orientation of ['portrait','landscape'] as const){
    const settings={...DEFAULT_PRINT_SETTINGS,paperSize,orientation,scale:'page' as const},g=printGeometry(sheets[0],settings),html=reportPrintDocument(sheets,'Ana',settings);
    expect(html).toContain(`size:${paperSize==='a4'?'A4':'Letter'} ${orientation}`);
    const position=html.match(/class="centered-report" style="position:absolute;left:([\d.e+-]+)px;top:([\d.e+-]+)px/)!;
    expect(Number(position[1])).toBeCloseTo((g.availableWidth-g.width*g.scale)/2,5);expect(Number(position[2])).toBeCloseTo((g.availableHeight-g.height*g.scale)/2,5);
    expect(Math.min(g.paperWidth,g.paperHeight)).toBeCloseTo(paperSize==='a4'?210/25.4*96:816,5);
  }
});
it('spills text into empty cells without expanding borders and draws shared borders once',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value="This report presents your child's progress and achievement";s.getCell('D1').value='Stop';
  s.getCell('A2').value=88;s.getCell('B2').value=90;
  const border={style:'thin' as const,color:{argb:'FF000000'}};s.getCell('A2').border={right:border};s.getCell('B2').border={left:border};
  const book=await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer())),sheet=book.printSheets()[0],html=reportPrintDocument([sheet],'Ana');
  const spill=Number(html.match(/data-cell="A1" style="[^"]*width:([\d.]+)px/)![1]);expect(spill).toBe(sheet.columns.slice(0,3).reduce((n,c)=>n+c.width,0));
  expect(html.match(/<line /g)).toHaveLength(1);
});
it.each(['letter','a4'] as const)('keeps a tall report and its footer on one %s page even with fit-to-width',async paperSize=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='Report';s.getCell('D100').value='Last footer';
  const sheets=(await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()))).printSheets();
  const settings={...DEFAULT_PRINT_SETTINGS,paperSize,orientation:'portrait' as const,scale:'width' as const,margins:{top:.5,right:.5,bottom:.5,left:.5}};
  const pages=printPageCount(sheets,settings),html=reportPrintDocument(sheets,'Ana',settings);expect(pages).toBe(1);expect(html.match(/class="paper"/g)).toHaveLength(pages);expect(html).toContain('Last footer');expect(html).toContain('left:48px;top:48px');
  const g=printGeometry(sheets[0],settings);expect(g.height*g.scale).toBeLessThanOrEqual(g.availableHeight+.001);expect(g.width*g.scale).toBeLessThanOrEqual(g.availableWidth+.001);expect(html).not.toContain('translateY');expect(printPageCount(sheets,{...DEFAULT_PRINT_SETTINGS,scale:'page'})).toBe(1);
});
it.each([false,true])('retains mixed template fonts and fits the entire report to Letter paper (landscape: %s)',async landscape=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='Heading';s.getCell('A1').font={name:'Times New Roman',size:16,bold:true,italic:true,underline:true};s.getCell('B2').value=88;s.getCell('B2').font={name:'Arial',size:11};
  s.getCell(landscape?'Z20':'F100').value='Footer';
  const book=await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer())),sheets=book.printSheets(),html=reportPrintDocument(sheets,'Ana',{...DEFAULT_PRINT_SETTINGS,paperSize:'letter',scale:'page'});
  expect(html).toContain('font-family:&quot;Times New Roman&quot;,sans-serif');expect(html).toContain('font-family:&quot;Arial&quot;,sans-serif');expect(html).toContain('text-decoration:underline');expect(html).toContain('font-weight:700');expect(html).toContain('font-style:italic');expect(html).not.toContain('Poppins');
  expect(html).toContain(`size:Letter ${landscape?'landscape':'portrait'};margin:0}`);expect(html).not.toContain('A4');
  const geometry=printGeometry(sheets[0],{...DEFAULT_PRINT_SETTINGS,paperSize:'letter',scale:'page'});
  expect(geometry.width*geometry.scale).toBeLessThanOrEqual(geometry.availableWidth+.001);expect(geometry.height*geometry.scale).toBeLessThanOrEqual(geometry.availableHeight+.001);
  expect(html).toContain('Footer');
});
it('prints report content despite thousands of empty formatted cells and a truncated preview extent',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='Report card';s.getCell('K65').value='School Head';
  s.getCell('K66').border={bottom:{style:'thin'}};s.getCell('CV3000').font={name:'Arial'};
  const book=await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()));expect(book.metadata.sheets[0].truncated).toBe(true);
  const [page]=book.printSheets();expect(page.rows).toHaveLength(66);expect(page.columns).toHaveLength(11);expect(page.cells.find(c=>c.address==='K65')?.displayValue).toBe('School Head');
});
it('respects multiple Excel print areas with quoted names and excludes cells outside them',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet("Teacher's Report");s.getCell('B2').value='Front';s.getCell('B12').value='Back';s.getCell('AZ1000').value='Internal notes';s.pageSetup.printArea='B2:D8&&B12:D18';
  const book=await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer())),pages=book.printSheets();expect(pages).toHaveLength(2);expect(pages[0].rowStart).toBe(2);expect(pages[0].columnStart).toBe(2);expect(pages[1].rowStart).toBe(12);expect(pages.every(p=>p.rows.length===7&&p.columns.length===3)).toBe(true);expect(JSON.stringify(pages)).not.toContain('Internal notes');
});
it('does not silently omit actual content beyond the parser bounds when no print area is set',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='Report';s.getCell('A3000').value='Required footer';
  const book=await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()));expect(()=>book.printSheets()).toThrow(/content outside/);
});
it('renders original embedded images at their anchors and prints the whole sheet without spreadsheet controls',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='<script>alert(1)</script>';s.getCell('B80').value=88;s.getCell('B80').alignment={horizontal:'center',vertical:'middle'};
  const image=w.addImage({base64:pixel,extension:'png'});s.addImage(image,{tl:{col:0,row:0},ext:{width:60,height:40}});s.addImage(image,'C3:D6');
  const bytes=Buffer.from(await w.xlsx.writeBuffer()),book=await parseWorkbook(bytes),sheet=book.sheet(0,1,1,true,80);
  expect(sheet.images).toHaveLength(2);expect(sheet.images![0]).toMatchObject({x:0,y:0,width:60,height:40,src:`data:image/png;base64,${pixel}`});expect(sheet.images![1].width).toBeGreaterThan(0);
  const html=reportPrintDocument([sheet],'Ana <Cruz>');expect(html).toContain(pixel);expect(html).toContain('88');expect(html).toContain('text-align:center');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('Map missing fields');expect(html).toContain('@page report0');
});
it('never exposes external image relationships',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A1').value='Report';s.addImage(w.addImage({base64:pixel,extension:'png'}),'A1:B3');
  const zip=await JSZip.loadAsync(await w.xlsx.writeBuffer()),path='xl/drawings/_rels/drawing1.xml.rels';zip.file(path,(await zip.file(path)!.async('string')).replace(/Target="[^"]+"/,'Target="https://example.com/private.png" TargetMode="External"'));
  const book=await parseWorkbook(await zip.generateAsync({type:'nodebuffer'}));expect(book.sheet(0).images).toEqual([]);
});
it('retains the school-logo ellipse placeholder and its template font as an inert drawing',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Report');s.getCell('A10').value='Report';s.addImage(w.addImage({base64:pixel,extension:'png'}),{tl:{col:1,row:1},ext:{width:100,height:80}});
  const zip=await JSZip.loadAsync(await w.xlsx.writeBuffer()),path='xl/drawings/drawing1.xml';
  const source=await zip.file(path)!.async('string');zip.file(path,source.replace(/<xdr:pic>[\s\S]*?<\/xdr:pic>/,`<xdr:sp><xdr:spPr><a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst="ellipse"/><a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:srgbClr val="EEEEEE"/></a:solidFill></xdr:spPr><xdr:txBody xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:bodyPr/><a:p><a:r><a:rPr sz="900" i="1"><a:latin typeface="Times New Roman"/></a:rPr><a:t>Insert School Logo</a:t></a:r></a:p></xdr:txBody></xdr:sp>`));
  const book=await parseWorkbook(await zip.generateAsync({type:'nodebuffer'})),image=book.sheet(0).images![0];
  expect(image.src).toMatch(/^data:image\/svg\+xml;base64,/);const svg=Buffer.from(image.src.split(',')[1],'base64').toString();expect(svg).toContain('<ellipse');expect(svg).toContain('Times New Roman');expect(svg).toContain('Insert');expect(svg).toContain('School');expect(svg).toContain('Logo');expect(svg.match(/<tspan/g)!.length).toBeGreaterThan(1);expect(svg).toContain('fill="#EEEEEE"');
});
