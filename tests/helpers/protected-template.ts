import ExcelJS from 'exceljs';
import JSZip from 'jszip';

// Synthetic editing protection; no learner records. The application never
// receives the password and never calls an unprotect/write operation.
export async function protectedTemplate({sheet=true,workbook=true}={}){
  const book=new ExcelJS.Workbook(),page=book.addWorksheet('Protected layout');
  page.getCell('A1').value='Protected template label';
  if(sheet)await page.protect('fixture-edit-password',{spinCount:1});
  const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());
  if(workbook){const source=await zip.file('xl/workbook.xml')!.async('string');zip.file('xl/workbook.xml',source.replace('<sheets>','<workbookProtection lockStructure="1" workbookPassword="ABCD"/><sheets>'));}
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
