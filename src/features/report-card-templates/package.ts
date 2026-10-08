import 'server-only';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { parser as saxParser } from 'sax';
import { posix } from 'node:path';
import { MAX_FILE_BYTES } from './model';

export class WorkbookError extends Error {}
export const PASSWORD_ERROR='This file is encrypted or uses an unsupported password-protected format. Save an unencrypted .xlsx copy in Excel and upload that version.';
export const COMPLEXITY_ERROR='This workbook is too complex to open safely. Save a simpler blank .xlsx template and try again.';
const CORRUPT='This workbook could not be read. Save a fresh .xlsx copy in Excel and try again.';
const XML_LIMIT=8*1024*1024, EXPANDED_LIMIT=50*1024*1024;
export type XmlHandlers={open?:(name:string,attrs:Record<string,string>,path:readonly string[])=>void; text?:(value:string,path:readonly string[])=>void; close?:(name:string,path:readonly string[])=>void};
export function xml(text:string,root:string,handlers:XmlHandlers){
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||text.includes('\0'))throw new WorkbookError('This workbook contains unsupported XML declarations.');
  const options={xmlns:true,strictEntities:true};
  const parser=saxParser(true,options),stack:string[]=[];let roots=0,nodes=0;
  parser.onerror=()=>{throw new WorkbookError(CORRUPT);};
  parser.onopentag=tag=>{
    const name=('local' in tag?tag.local:tag.name) as string;
    stack.push(name);if(stack.length===1){roots++;if(name!==root||roots>1)throw new WorkbookError(CORRUPT);
      const uri='uri' in tag?tag.uri:'';
      const expected=root==='Types'?'http://schemas.openxmlformats.org/package/2006/content-types':root==='Relationships'?'http://schemas.openxmlformats.org/package/2006/relationships':root==='theme'?'http://schemas.openxmlformats.org/drawingml/2006/main':'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
      if(uri!==expected)throw new WorkbookError(CORRUPT);
    }
    if(stack.length>64||++nodes>500000)throw new WorkbookError(COMPLEXITY_ERROR);
    const attrs:Record<string,string>={};for(const [key,value] of Object.entries(tag.attributes)){attrs[key]=typeof value==='string'?value:value.value;if(typeof value!=='string'&&value.local==='id'&&value.uri==='http://schemas.openxmlformats.org/officeDocument/2006/relationships')attrs['r:id']=value.value;}
    handlers.open?.(name,attrs,stack);
  };
  parser.ontext=value=>handlers.text?.(value,stack);
  parser.oncdata=value=>handlers.text?.(value,stack);
  parser.onclosetag=()=>{handlers.close?.(stack[stack.length-1],stack);stack.pop();};
  parser.ondoctype=()=>{throw new WorkbookError(CORRUPT);};
  parser.write(text).close();if(roots!==1||stack.length)throw new WorkbookError(CORRUPT);
}
export type Package={names:string[];text:(name:string)=>Promise<string>;close:()=>void};
export async function openPackage(bytes:Buffer,maxBytes=MAX_FILE_BYTES):Promise<Package>{
  if(!bytes.length||bytes.length>maxBytes)throw new WorkbookError('This workbook exceeds the supported file size.');
  if(bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))throw new WorkbookError(PASSWORD_ERROR);
  if(bytes.length<4||bytes.readUInt16LE(0)!==0x4b50)throw new WorkbookError(CORRUPT);
  let zip:ZipFile;
  try{zip=await new Promise<ZipFile>((resolve,reject)=>fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,value)=>error||!value?reject(error):resolve(value)));}
  catch{throw new WorkbookError(CORRUPT);}
  const entries=new Map<string,Entry>();let expanded=0;
  try{
    await new Promise<void>((resolve,reject)=>{
      zip.on('error',()=>reject(new WorkbookError(CORRUPT)));zip.on('end',resolve);
      zip.on('entry',(entry:Entry)=>{try{
        if(entry.generalPurposeBitFlag&1)throw new WorkbookError(PASSWORD_ERROR);
        if(entries.size>=2048||entry.uncompressedSize>16*1024*1024||(expanded+=entry.uncompressedSize)>EXPANDED_LIMIT)throw new WorkbookError(COMPLEXITY_ERROR);
        if(entries.has(entry.fileName)||!Number.isSafeInteger(entry.uncompressedSize)||!Number.isSafeInteger(entry.compressedSize))throw new WorkbookError(CORRUPT);
        if(/vbaProject|macroSheets|activeX/i.test(entry.fileName))throw new WorkbookError('Macro-enabled workbooks are not supported. Upload a macro-free .xlsx copy.');
        entries.set(entry.fileName,entry);zip.readEntry();
      }catch(error){reject(error);}});zip.readEntry();
    });
  }catch(error){zip.close();throw error;}
  return {names:[...entries.keys()],close:()=>zip.close(),text:async(name:string)=>{
    const entry=entries.get(name);if(!entry)throw new WorkbookError(CORRUPT);if(entry.uncompressedSize>XML_LIMIT)throw new WorkbookError(COMPLEXITY_ERROR);
    try{
      const stream=await new Promise<NodeJS.ReadableStream>((resolve,reject)=>zip.openReadStream(entry,(error,value)=>error||!value?reject(error):resolve(value)));
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of stream as AsyncIterable<Buffer>){size+=chunk.length;if(size>XML_LIMIT)throw new WorkbookError(COMPLEXITY_ERROR);chunks.push(chunk);}
      if(size!==entry.uncompressedSize)throw new WorkbookError(CORRUPT);
      const buffer=Buffer.concat(chunks);if(buffer[0]===0xff&&buffer[1]===0xfe)return buffer.subarray(2).toString('utf16le');
      return new TextDecoder('utf-8',{fatal:true}).decode(buffer);
    }catch(error){throw error instanceof WorkbookError?error:new WorkbookError(CORRUPT);}
  }};
}
export type Relationship={id:string;type:string;target:string;external:boolean};
export function relationships(text:string):Relationship[]{const result:Relationship[]=[];xml(text,'Relationships',{open:(name,a)=>{if(name==='Relationship'){if(!a.Id||!a.Type||!a.Target||result.some(r=>r.id===a.Id))throw new WorkbookError(CORRUPT);result.push({id:a.Id,type:a.Type,target:a.Target,external:a.TargetMode==='External'});}}});return result;}
export function partPath(source:string,target:string){
  let decoded:string;try{decoded=decodeURIComponent(target);}catch{throw new WorkbookError(CORRUPT);}
  if(/[\\\0?#]/.test(decoded)||/^[a-z][a-z0-9+.-]*:/i.test(decoded))throw new WorkbookError(CORRUPT);
  const path=posix.normalize(decoded.startsWith('/')?decoded.slice(1):posix.join(posix.dirname(source),decoded));
  if(path.startsWith('../')||path==='..')throw new WorkbookError(CORRUPT);return path;
}
export function relsPath(source:string){return posix.join(posix.dirname(source),'_rels',`${posix.basename(source)}.rels`);}
