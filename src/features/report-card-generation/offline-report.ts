import JSZip from 'jszip';
import {assignments} from '@/features/report-card-mappings/model';
import {parseMerge,type SheetPreview} from '@/features/report-card-templates/model';
import {valuesForLearner,verifyProfile,type GenerationSnapshot,type OutputValue,type EphemeralLrn} from './model';
import {tree,patchSheet,checkCoordinates} from './cell-writer';
import {displayNumber} from '@/features/report-card-templates/number-format';
import type {OfflineRecords} from '../../../public/offline-records.js';
export {reportPrintDocument,printReport,printGeometry,DEFAULT_PRINT_SETTINGS} from './print';
export {safeFilename,outputStatus} from './model';

export type OfflineReportPackage={version:1;owner:string;sectionId:string;templateId:string;preparedAt:string;snapshot:GenerationSnapshot;workbook:string;workbookHash:string;parts:Record<string,string>;printSheets:SheetPreview[];formats:Record<string,{format:string;formatId:number;date1904:boolean}>;formulaTargets:string[]};
export function reportSnapshot(pack:OfflineReportPackage,records:OfflineRecords):GenerationSnapshot{
  if(pack.version!==1||pack.owner!==records.owner||pack.snapshot.section.teacher_id!==records.owner||pack.snapshot.template.teacher_id!==records.owner)throw new Error('This report card belongs to another teacher account.');
  const section=records.rows.sections.find(s=>s.id===pack.sectionId&&s.teacher_id===records.owner);
  if(!section||section.status!=='active')throw new Error('Download this Section in the offline workspace before generating report cards.');
  const members=new Set(records.rows.section_enrollments.filter(e=>e.section_id===section.id&&e.status==='active').map(e=>e.learner_id));
  const s={...pack.snapshot,section,
    learners:records.rows.learners.filter(l=>members.has(l.id)).map(l=>({id:l.id,display_name:l.display_name})),
    periods:records.rows.section_grade_periods.filter(p=>p.section_id===section.id),
    subjects:records.rows.section_subjects.filter(p=>p.section_id===section.id),
    entries:records.rows.section_grade_entries.filter(p=>p.section_id===section.id),
  } as unknown as GenerationSnapshot;
  verifyProfile(s);return s;
}
export function reportValues(pack:OfflineReportPackage,records:OfflineRecords,learnerId:string,lrns:EphemeralLrn={}){
  const s=reportSnapshot(pack,records),learner=s.learners.find(l=>l.id===learnerId);
  if(!learner)throw new Error('Choose an active learner in this Section.');
  return valuesForLearner(s,s.mapping.mapping_definition,learner,lrns);
}
function validateValues(pack:OfflineReportPackage,values:OutputValue[],replaceFormulas:boolean){
  if(pack.formulaTargets.length&&!replaceFormulas)throw new Error('Confirm replacing mapped formulas before generating this report card.');
  const targets=assignments(pack.snapshot.mapping.mapping_definition);
  if(values.length!==targets.length||targets.some(t=>!values.some(v=>v.id===t.id&&v.location.sheet===t.location.sheet&&v.location.address===t.location.address)))throw new Error('Report-card targets changed. Prepare the template again.');
}
export function filledPrintSheets(pack:OfflineReportPackage,values:OutputValue[],replaceFormulas=false){
  validateValues(pack,values,replaceFormulas);
  const sheets=structuredClone(pack.printSheets);
  for(const value of values){
    const address=parseMerge(value.location.address).master;
    for(const sheet of sheets.filter(s=>s.summary.name===value.location.sheet)){
      const cell=sheet.cells.find(c=>c.address===address);if(!cell)continue;
      const format=pack.formats?.[`${value.location.sheet}!${address}`];
      cell.displayValue=value.value===null?'':typeof value.value==='number'&&format?displayNumber(String(value.value),{...format,style:{}},format.date1904).text:String(value.value);cell.type=typeof value.value==='number'?'number':value.value===null?'blank':'text';delete cell.formula;delete cell.cachedValue;
    }
  }
  return sheets;
}
export async function generateOfflineWorkbook(pack:OfflineReportPackage,values:OutputValue[],replaceFormulas=false){
  validateValues(pack,values,replaceFormulas);
  if(pack.workbook.length>17*1024*1024)throw new Error('This offline template is too large.');
  const bytes=Uint8Array.from(atob(pack.workbook),c=>c.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==pack.workbookHash)throw new Error('The saved template is damaged. Prepare it again while online.');
  const zip=await JSZip.loadAsync(bytes);
  for(const name of new Set(values.map(v=>v.location.sheet))){
    const path=pack.parts[name],part=path?zip.file(path):null;
    if(!part)throw new Error('A mapped worksheet is missing from this offline template.');
    const raw=await part.async('uint8array'),utf16=raw[0]===255&&raw[1]===254,bom=raw[0]===239&&raw[1]===187&&raw[2]===191;
    if(raw.length>20*1024*1024)throw new Error('The worksheet exceeds the offline editing limit.');
    const source=new TextDecoder(utf16?'utf-16le':'utf-8').decode(raw),root=tree(source);checkCoordinates(root);
    const output=patchSheet(source,root,values.filter(v=>v.location.sheet===name));
    let data:Uint8Array;
    if(utf16){data=new Uint8Array(2+output.length*2);data.set([255,254]);for(let i=0;i<output.length;i++){const code=output.charCodeAt(i);data[2+i*2]=code&255;data[3+i*2]=code>>8;}}
    else {const encoded=new TextEncoder().encode(output);data=new Uint8Array(encoded.length+(bom?3:0));if(bom)data.set([239,187,191]);data.set(encoded,bom?3:0);}
    zip.file(path,data,{createFolders:false});
  }
  // All non-target worksheet content, styles, images, relationships and print
  // settings are kept. Only the same cell spans as the online writer are edited.
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
}
