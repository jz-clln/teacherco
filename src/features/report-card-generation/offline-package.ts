import {canWrite} from '@/lib/auth/access-policy';
import 'server-only';
import {assignments} from '@/features/report-card-mappings/model';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {openPackage,relationships,partPath,relsPath,xml} from '@/features/report-card-templates/package';
import {templateAccess} from '@/features/report-card-templates/data';
import {loadGeneration,snapshot,digest} from './data';
import {sha256} from './output-validation';
import {readStyles} from '@/features/report-card-templates/styles';
import {parseMerge} from '@/features/report-card-templates/model';
import type {OfflineReportPackage} from './offline-report';

export async function prepareOfflineReport(sectionId:string,templateId:string):Promise<OfflineReportPackage>{
  const {context,s,writer}=await loadGeneration({sectionId,templateId});
  if(!canWrite(context.profile))throw new Error("Renew access to prepare offline report cards.");
  // Keep every mapped cell within the inferred print bounds, including otherwise
  // blank edge cells. No learner names, grades or temporary LRNs are prefilled.
  const bytes=await writer.write(assignments(writer.definition).map(a=>({...a,value:'Offline field'})),true);
  const workbook=await parseWorkbook(bytes),printSheets=workbook.printSheets(),parts:Record<string,string>={},formats:OfflineReportPackage['formats']={};
  const pkg=await openPackage(bytes);
  try{
    const office=relationships(await pkg.text('_rels/.rels')).find(r=>r.type.endsWith('/officeDocument'))!;
    const path=partPath('',office.target),rels=relationships(await pkg.text(relsPath(path)));
    let date1904=false;
    xml(await pkg.text(path),'workbook',{open:(name,attributes)=>{
      if(name==='workbookPr')date1904=['1','true'].includes(attributes.date1904);
      if(name!=='sheet')return;const rel=rels.find(r=>r.id===attributes['r:id']&&!r.external);
      if(rel)parts[attributes.name]=partPath(path,rel.target);
    }});
    const styleRel=rels.find(r=>r.type.endsWith('/styles')&&!r.external);
    const styles=readStyles(styleRel?await pkg.text(partPath(path,styleRel.target)):undefined);
    for(const name of new Set(assignments(writer.definition).map(a=>a.location.sheet))){
      const targets=new Set(assignments(writer.definition).filter(a=>a.location.sheet===name).map(a=>parseMerge(a.location.address).master));
      xml(await pkg.text(parts[name]),'worksheet',{open:(tag,a)=>{if(tag==='c'&&targets.has(a.r)){const record=styles[Number(a.s)||0]??styles[0];formats[`${name}!${a.r}`]={format:record.format,formatId:record.formatId,date1904};}}});
    }
  }finally{pkg.close();}
  if(bytes.length>12*1024*1024||Buffer.byteLength(JSON.stringify(printSheets),'utf8')>8*1024*1024)throw new Error('This template is too large to prepare for offline printing. Use a smaller report-card template.');
  const fresh=await templateAccess();
  if(fresh.user.id!==context.user.id||digest(await snapshot(fresh,sectionId,templateId))!==digest(s))throw new Error('The template or matches changed. Reload them before saving for offline use.');
  return {version:1,owner:context.user.id,sectionId,templateId,preparedAt:new Date().toISOString(),
    snapshot:{...s,learners:[],entries:[]},workbook:bytes.toString('base64'),workbookHash:sha256(bytes),parts,printSheets,formats,formulaTargets:writer.formulaTargets};
}
