import 'server-only';
import { z } from 'zod';
import type { SafeStructure } from './structure';

export interface InterpretationProvider { propose<T>(structure:SafeStructure,instruction:string,schema:z.ZodType<T>):Promise<T> }
export type Decision={choice:'accept'|'review'|'reject';score:number};
export type DecisionInput={valid:boolean;score:number;evidence:boolean;structure?:SafeStructure;candidate?:{field:string;sheet:string;address:string}};
export interface ConfidenceProvider { decide(input:DecisionInput):Promise<Decision> }
// Conservative local fallback. This is explicitly not a JEV implementation.
export const localConfidence:ConfidenceProvider={async decide({valid,score}){return !valid?{choice:'reject',score:0}:{choice:'review',score:Number.isFinite(score)?Math.max(0,Math.min(1,score)):0};}};
export class JevConfidence implements ConfidenceProvider {
  constructor(private key:string,private request:typeof fetch=fetch){}
  async decide(input:DecisionInput):Promise<Decision>{
    if(!input.valid)return {choice:'reject',score:0};
    try{
      const response=await this.request('https://api.typesafe.ai/v1/systemone',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'jev-latest',state:input,questions:{route:{type:'choice',instructions:'Does structural evidence support this proposed structural interpretation? Confidence alone is not evidence.',criteria:{accept:'Clear label and spatial evidence support the proposal.',review:'Plausible but ambiguous; a teacher must confirm.',reject:'Unsupported or contradicts the worksheet structure.'}},certainty:{type:'score',instructions:'How strongly does the evidence support this structural interpretation?',criteria:['Unsupported or ambiguous','Clear and unambiguous']}}})});
      if(!response.ok)throw new Error();const data=z.object({answers:z.object({route:z.object({type:z.literal('choice'),choice:z.enum(['accept','review','reject']),confidence:z.number().min(0).max(1)}),certainty:z.object({type:z.literal('score'),score:z.number().min(0).max(1),confidence:z.number().min(0).max(1)})})}).parse(await response.json());
      const score=Math.min(data.answers.route.confidence,data.answers.certainty.score,data.answers.certainty.confidence,input.score);
      return {choice:data.answers.route.choice==='reject'||score<0.5?'reject':data.answers.route.choice==='accept'&&score>=0.95&&input.evidence?'accept':'review',score};
    }catch{return localConfidence.decide(input);}
  }
}
export function confidenceProvider():ConfidenceProvider{return process.env.TYPESAFE_API_KEY?new JevConfidence(process.env.TYPESAFE_API_KEY):localConfidence;}
export class OpenAIInterpreter implements InterpretationProvider {
  constructor(private key:string,private model:string,private request:typeof fetch=fetch){}
  async propose<T>(structure:SafeStructure,instruction:string,schema:z.ZodType<T>):Promise<T>{
    if(JSON.stringify(structure).length>160000)throw new Error('Structure too large for assisted analysis');
    const response=await this.request('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:this.model,reasoning:{effort:'low'},store:false,max_output_tokens:7000,instructions:'Interpret only workbook structure. Never calculate or invent grades. Return only locations and structural labels. Missing evidence means null or empty arrays. '+instruction,input:JSON.stringify(structure),text:{format:{type:'json_schema',name:'workbook_interpretation',strict:true,schema:z.toJSONSchema(schema)}}})});
    if(!response.ok)throw new Error('Analysis unavailable');
    const data=await response.json();
    if(data.status!=='completed')throw new Error('Incomplete analysis');
    const texts=(data.output??[]).flatMap((o:{type:string;content?:{type:string;text?:string}[]})=>o.type==='message'?(o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text):[]);
    if(texts.length!==1||typeof texts[0]!=='string'||texts[0].length>131072)throw new Error('Invalid analysis');
    return schema.parse(JSON.parse(texts[0]));
  }
}
export function interpretationProvider():InterpretationProvider|null{
  return process.env.OPENAI_API_KEY?new OpenAIInterpreter(process.env.OPENAI_API_KEY,process.env.OPENAI_WORKFLOW_MODEL||'gpt-6-luna'):null;
}
