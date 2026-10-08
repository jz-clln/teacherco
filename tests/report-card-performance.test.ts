// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import JSZip from 'jszip';
vi.mock('server-only',()=>({}));
import {prepareWriter} from '@/features/report-card-generation/writer';
import {sha256} from '@/features/report-card-generation/output-validation';
import {assignments} from '@/features/report-card-mappings/model';
import {mappingWorkbook,mappingDefinition} from './helpers/mapping-fixture';
it.skipIf(process.env.REPORT_CARD_PERFORMANCE!=='1')('measures small and large validated export paths using synthetic workbooks only',async()=>{
  const results=[];
  for(const [label,extra,count,periods]of [['three-term',0,50,3],['four-quarter',0,50,4],['large-4-MiB',4*1024*1024,10,3],['large-9-MiB',9*1024*1024,4,4]] as const){
    const zip=await JSZip.loadAsync(await mappingWorkbook());if(extra){zip.file('xl/media/synthetic.bin',randomBytes(extra));zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml')!.async('string')).replace('</Types>','<Default Extension="bin" ContentType="application/octet-stream"/></Types>'));}
    const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),hash=sha256(bytes),start=performance.now(),writer=await prepareWriter(bytes,mappingDefinition(hash,periods),hash),archive=new JSZip();let singleMs=0,peakRss=process.memoryUsage().rss;
    const prepared=performance.now();for(let i=0;i<count;i++){const before=performance.now(),output=await writer.write(assignments(writer.definition).map(a=>({...a,value:a.id==='field:learner_name'?`Synthetic José 李 ${i}`:89})));if(i===0)singleMs=performance.now()-before;archive.file(`${i}.xlsx`,output);peakRss=Math.max(peakRss,process.memoryUsage().rss);}
    const written=performance.now(),output=await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),end=performance.now();expect(output.length).toBeLessThan(50*1024*1024);
    results.push({label,sourceBytes:bytes.length,learners:count,prepareMs:prepared-start,sourceParseMs:writer.metrics.sourceParseMs,mappingValidationMs:writer.metrics.mappingValidationMs,singleMs,bulkWriteAndValidationMs:written-prepared,outputValidationMs:writer.metrics.outputValidationMs,zipMs:end-written,totalMs:end-start,outputBytes:output.length,peakRssMiB:peakRss/1024/1024});
  }
  mkdirSync('test-results/report-card-hardening',{recursive:true});writeFileSync('test-results/report-card-hardening/performance.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
},120000);
