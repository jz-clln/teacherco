import 'server-only';
import JSZip from 'jszip';
import {tree,prefix,escaped,edits,patchSheet,checkCoordinates,type Edit,type Node} from './cell-writer';
import {openPackage,relationships,partPath,relsPath,xml} from '@/features/report-card-templates/package';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {parseMerge} from '@/features/report-card-templates/model';
import {assignments,validateDefinition,type MappingDefinition} from '@/features/report-card-mappings/model';
import type {OutputValue} from './model';
import {packageManifest,sha256,validateOutput} from './output-validation';

/** Validates the original package; only targeted worksheet cell spans are replaced. */
export async function prepareWriter(bytes:Buffer,input:MappingDefinition,hash:string,allowUnmapped=false){
  const started=performance.now(),structure=await parseWorkbook(bytes),parsedAt=performance.now(),definition=validateDefinition(input,hash,structure),targets=assignments(definition),mappedAt=performance.now();
  if(sha256(bytes)!==hash)throw new Error('The template source changed. Reopen the template before generating.');
  if(!targets.length&&!allowUnmapped)throw new Error('Map at least one output before generation.');
  const pkg=await openPackage(bytes),sheets=new Map<string,{path:string;source:string;root:Node;utf16:boolean;bom:boolean}>(),formulaTargets:string[]=[];
  const sourceZip=await JSZip.loadAsync(bytes),manifest=await packageManifest(sourceZip);
  let stylePath:string|undefined;
  try{
    if(pkg.names.some(n=>n.startsWith('_xmlsignatures/')))throw new Error('Digitally signed templates cannot be generated safely. Use an unsigned template copy.');
    const office=relationships(await pkg.text('_rels/.rels')).find(r=>r.type.endsWith('/officeDocument'))!;
    const workbook=partPath('',office.target),rels=relationships(await pkg.text(relsPath(workbook))),paths=new Map<string,string>();
    const styleRel=rels.find(r=>r.type.endsWith('/styles')&&!r.external);if(styleRel)stylePath=partPath(workbook,styleRel.target);
    xml(await pkg.text(workbook),'workbook',{open:(name,a)=>{if(name==='sheet'){const r=rels.find(r=>r.id===a['r:id']);if(r&&!r.external)paths.set(a.name,partPath(workbook,r.target));}}});
    const zip=sourceZip;
    for(const name of new Set(allowUnmapped?structure.worksheetNames:targets.map(t=>t.location.sheet))){
      const path=paths.get(name);if(!path)throw new Error('Mapped worksheet is unavailable.');const source=await pkg.text(path),root=tree(source),raw=await zip.file(path)!.async('nodebuffer');
      checkCoordinates(root);
      sheets.set(name,{path,source,root,utf16:raw[0]===255&&raw[1]===254,bom:raw[0]===239&&raw[1]===187&&raw[2]===191});
      const mapped=targets.filter(t=>t.location.sheet===name).map(t=>parseMerge(t.location.address).master);
      const data=root.children.find(n=>n.local==='sheetData');
      for(const row of data?.children??[])for(const c of row.children.filter(n=>n.local==='c'))for(const f of c.children.filter(n=>n.local==='f')){
        const ref=f.attrs.ref?parseMerge(f.attrs.ref):null;
        const hits=mapped.filter(a=>{const r=parseMerge(a);return a===c.attrs.r||(ref&&r.top>=ref.top&&r.top<=ref.bottom&&r.left>=ref.left&&r.left<=ref.right);});
        if(!hits.length)continue;
        if(f.attrs.t&&f.attrs.t!=='normal'||(rels.some(r=>r.type.endsWith('/calcChain'))||pkg.names.some(n=>/\/calcChain\.xml$/i.test(n))))throw new Error('A mapped target belongs to a shared, array, data-table or calculation-chain formula. Map a different cell before generating.');
        formulaTargets.push(`${name}!${c.attrs.r}`);
      }
    }
  }finally{pkg.close();}
  const metrics={sourceParseMs:parsedAt-started,mappingValidationMs:mappedAt-parsedAt,prepareMs:performance.now()-started,writeMs:0,outputValidationMs:0};
  const paths=new Map([...sheets].map(([name,s])=>[name,s.path]));
  return {definition,formulaTargets,metrics,write:async(values:OutputValue[],replaceFormulas=false)=>{
    const started=performance.now();
    if(formulaTargets.length&&!replaceFormulas)throw new Error('Confirm replacement of mapped Excel formulas before generating.');
    if(values.length!==targets.length||targets.some(t=>!values.some(v=>v.id===t.id&&v.location.sheet===t.location.sheet&&v.location.address===t.location.address)))throw new Error('Output values do not match the reviewed mapping.');
    const zip=new JSZip() as JSZip & {comment:string|null};zip.comment=(sourceZip as JSZip & {comment?:string}).comment??null;zip.files=Object.assign(Object.create(null),sourceZip.files);
    const expectedManifest=new Map(manifest);
    const styleRaw=stylePath?await sourceZip.file(stylePath)!.async('nodebuffer'):undefined;
    const utf16=styleRaw?.[0]===255&&styleRaw?.[1]===254;
    const styleSource=styleRaw?(utf16?styleRaw.subarray(2).toString('utf16le'):styleRaw.toString('utf8')):undefined;
    const formats=styleSource?tree(styleSource).children.find(n=>n.local==='cellXfs'):undefined;
    const originals=formats?.children.filter(n=>n.local==='xf')??[],centered=new Map<number,number>(),added:string[]=[];
    function centerStyle(index:number){
      if(centered.has(index))return centered.get(index)!;
      const original=originals[index]??originals[0];if(!original||!styleSource)return index;
      const p=prefix(original),alignment=original.children.find(n=>n.local==='alignment');
      const attributes=alignment?Object.entries(alignment.attrs).filter(([key])=>!['horizontal','vertical'].includes(key)).map(([key,value])=>` ${key}="${escaped(value)}"`).join(''):'';
      const content=original.self?'':edits(styleSource.slice(original.openEnd,original.closeStart),alignment?[{start:alignment.start-original.openEnd,end:alignment.end-original.openEnd,text:''}]:[]);
      const opening=styleSource.slice(original.start,original.openEnd).replace(/\s+applyAlignment\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/\s*\/?\s*>$/,' applyAlignment="1">');
      const id=originals.length+added.length;added.push(opening+`<${p}alignment${attributes} horizontal="center" vertical="center"/>`+content+`</${original.name}>`);centered.set(index,id);return id;
    }
    for(const [name,s]of sheets){
      const sheetValues=values.filter(v=>v.location.sheet===name);let output=patchSheet(s.source,s.root,sheetValues);
      if(formats){
        // Alignment is the sole formatting exception, and only for mapped grade outputs.
        const targets=new Set(sheetValues.filter(v=>/^subject:.*:(period_[1-8]|final_grade)$/.test(v.id)||v.id==='field:final_average').map(v=>parseMerge(v.location.address).master));
        const root=tree(output),changes:Edit[]=[];
        for(const row of root.children.find(n=>n.local==='sheetData')?.children??[])for(const c of row.children.filter(n=>n.local==='c'&&targets.has(n.attrs.r))){
          const style=centerStyle(Number(c.attrs.s)||0),opening=output.slice(c.start,c.openEnd).replace(/\s+s\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/(\/?\s*>)$/,` s="${style}"$1`);
          changes.push({start:c.start,end:c.openEnd,text:opening});
        }
        output=edits(output,changes);
      }
      zip.file(s.path,s.utf16?Buffer.concat([Buffer.from([255,254]),Buffer.from(output,'utf16le')]):Buffer.concat([s.bom?Buffer.from([239,187,191]):Buffer.alloc(0),Buffer.from(output,'utf8')]),{createFolders:false});
    }
    if(stylePath&&styleSource&&formats&&added.length){
      const opening=styleSource.slice(formats.start,formats.openEnd).replace(/\s+count\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/>$/,` count="${originals.length+added.length}">`);
      const updated=edits(styleSource,[{start:formats.start,end:formats.openEnd,text:opening},{start:formats.closeStart,end:formats.closeStart,text:added.join('')}]);
      const data=utf16?Buffer.concat([Buffer.from([255,254]),Buffer.from(updated,'utf16le')]):Buffer.from(updated,'utf8');zip.file(stylePath,data,{createFolders:false});expectedManifest.set(stylePath,sha256(data));
    }
    const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}),writtenAt=performance.now();
    await validateOutput(output,bytes,hash,expectedManifest,paths,values);metrics.writeMs+=writtenAt-started;metrics.outputValidationMs+=performance.now()-writtenAt;return output;
  }};
}
