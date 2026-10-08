export const TEMPLATE_BUCKET = 'report-card-templates';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SHEETS = 20;
export const MAX_ROWS = 2000;
export const MAX_COLUMNS = 128;
export const WINDOW_ROWS = 60;
export const WINDOW_COLUMNS = 24;
export type SheetSummary = { name:string; index:number; state:'visible'|'hidden'|'veryHidden'; rowExtent:number; columnExtent:number; mergeCount:number; formulaCount:number; hasImages:boolean; hasExternalReferences:boolean; hasPrintArea:boolean; hasFreezePane:boolean; truncated:boolean };
export type WorkbookMetadata = { formatVersion:1; sheets:SheetSummary[] };
export type Template = { id:string; teacher_id:string; name:string; original_filename:string; storage_path:string; mime_type:string; file_size_bytes:number; file_sha256:string; sheet_count:number; workbook_metadata:WorkbookMetadata; status:'active'|'archived'; created_at:string; updated_at:string };
export type CellStyle = { bold?:boolean; italic?:boolean; underline?:boolean; fontSize?:number; fontFamily?:string; color?:string; background?:string; align?:'left'|'center'|'right'; vertical?:'top'|'middle'|'bottom'; wrap?:boolean; borders?:Partial<Record<'top'|'right'|'bottom'|'left',{color:string;style:'solid'|'dashed'|'dotted'|'double';width:number}>> };
export type CellPreview = { address:string; row:number; column:number; displayValue:string; type:'blank'|'text'|'number'|'date'|'boolean'|'error'|'formula'; formula?:string; cachedValue?:string; mergedRange?:string; borderSegments?:{side: 'top'|'bottom'|'left'|'right';start:number;end:number;color:string;style:'solid'|'dashed'|'dotted'|'double';width:number}[]; style?:CellStyle };
export type Merge = { address:string; top:number; bottom:number; left:number; right:number; master:string };
export type SheetPreview = { summary:SheetSummary; rowStart:number; columnStart:number; rows:{number:number;height:number;hidden:boolean}[]; columns:{number:number;letter:string;width:number;hidden:boolean}[]; cells:CellPreview[]; merges:Merge[]; warnings:string[] };
export type CellSelection = { sheetName:string; address:string; mergedRange?:string };
export type TemplateResult<T=undefined> = { ok:true; data:T } | { ok:false; error:string; existing?:{id:string;name:string} };
export function columnLetter(column:number):string {
  if(!Number.isInteger(column)||column<1||column>16384)throw new Error('Invalid Excel column.');
  let name='';for(let n=column;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;
}
export function cellAddress(row:number,column:number){if(!Number.isInteger(row)||row<1||row>1048576)throw new Error('Invalid Excel row.');return `${columnLetter(column)}${row}`;}
export function parseAddress(value:string){const match=/^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/i.exec(value);if(!match)throw new Error('Enter a valid Excel cell address.');const column=[...match[1].toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),row=Number(match[2]);cellAddress(row,column);return {row,column};}
export function parseMerge(value:string):Merge {const [start,end=start]=value.split(':');const a=parseAddress(start),b=parseAddress(end);if(b.row<a.row||b.column<a.column)throw new Error('Invalid merged range.');return {address:`${cellAddress(a.row,a.column)}:${cellAddress(b.row,b.column)}`,top:a.row,bottom:b.row,left:a.column,right:b.column,master:cellAddress(a.row,a.column)};}
export function fileValidation(name:string,size:number,mime:string){
  if(!name.toLowerCase().endsWith('.xlsx'))return 'TeacherCo currently supports Excel .xlsx templates.';
  if(!size)return 'Choose a workbook that contains at least one worksheet.';
  if(size>MAX_FILE_BYTES)return 'This workbook exceeds the 10 MB upload limit.';
  if(mime&&!['application/octet-stream','application/zip',XLSX_MIME].includes(mime.toLowerCase()))return 'TeacherCo currently supports Excel .xlsx templates.';
  return null;
}
export function fileSize(bytes:number){return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;}
