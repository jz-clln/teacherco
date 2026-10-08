import 'server-only';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {xml} from '@/features/report-card-templates/package';
import {parseMerge} from '@/features/report-card-templates/model';
import {MAX_WORKBOOK_BYTES,type OutputValue} from './model';
export const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function packageManifest(zip:JSZip){const result=new Map<string,string>();for(const [name,part]of Object.entries(zip.files))result.set(name,part.dir?'directory':sha256(await part.async('nodebuffer')));return result;}
export async function validateOutput(bytes:Buffer,source:Buffer,sourceHash:string,manifest:Map<string,string>,paths:Map<string,string>,values:OutputValue[]){
  try{
    if(sha256(source)!==sourceHash)throw new Error();
    await parseWorkbook(bytes,MAX_WORKBOOK_BYTES);
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),names=Object.keys(zip.files).sort();
    if(JSON.stringify(names)!==JSON.stringify([...manifest.keys()].sort()))throw new Error();
    const changed=new Set(paths.values());
    for(const name of names)if(!changed.has(name)){const part=zip.files[name],hash=part.dir?'directory':sha256(await part.async('nodebuffer'));if(hash!==manifest.get(name))throw new Error();}
    for(const [sheet,path]of paths){
      const raw=await zip.file(path)!.async('nodebuffer'),source=raw[0]===255&&raw[1]===254?raw.subarray(2).toString('utf16le'):new TextDecoder('utf8',{fatal:true}).decode(raw);
      const cells=new Map<string,{type:string;formula:boolean;value:string;present:boolean}>();let address='';
      xml(source,'worksheet',{open:(name,a,stack)=>{if(name==='c'&&stack.at(-2)==='row'){address=a.r;if(cells.has(address))throw new Error();cells.set(address,{type:a.t??'n',formula:false,value:'',present:false});}if(address&&name==='f')cells.get(address)!.formula=true;if(address&&(name==='v'||name==='t'))cells.get(address)!.present=true;},text:(value,stack)=>{if(address&&(stack.at(-1)==='v'||stack.at(-1)==='t'))cells.get(address)!.value+=value;},close:name=>{if(name==='c')address='';}});
      for(const v of values.filter(v=>v.location.sheet===sheet)){const c=cells.get(parseMerge(v.location.address).master);if(!c||c.formula)throw new Error();if(v.value===null){if(c.present||c.value)throw new Error();}else if(typeof v.value==='number'){if(c.type!=='n'||!c.present||Number(c.value)!==v.value)throw new Error();}else{const decoded=c.value.replace(/_x([0-9a-f]{4})_/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));if(c.type!=='inlineStr'||decoded!==v.value)throw new Error();}}
    }
  }catch{throw new Error('The generated workbook did not pass validation. No file was delivered. Review the template and try again.');}
}
