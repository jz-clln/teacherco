// Semantic normalization is local. Families stay distinct: Q1 is not Term 1.
export const normalizeLabel=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[.:_–—-]/g,' ').replace(/\s+/g,' ').trim();
const numbers:Record<string,number>={one:1,first:1,'1st':1,two:2,second:2,'2nd':2,three:3,third:3,'3rd':3,four:4,fourth:4,'4th':4,five:5,fifth:5,six:6,sixth:6,seven:7,seventh:7,eight:8,eighth:8};
export function periodCode(value:string):number|null{
  const n=normalizeLabel(value);if(n==='midterm'||n==='mid term')return 31;if(n==='final'||n==='final period')return 32;
  const tokens=n.replace(/\bq([1-4])\b/g,'quarter $1').replace(/\b([1-8])(st|nd|rd|th)\b/g,'$1').split(' ').map(t=>String(numbers[t]??t));
  const label=tokens.join(' ').replace(/grading period|grading/g,'quarter');
  const m=/^(?:(quarter|term|semester) ([1-8])|([1-8]) (quarter|term|semester))$/.exec(label);if(!m)return null;
  return ({quarter:0,term:10,semester:20}[m[1]??m[4]]??0)+Number(m[2]??m[3]);
}
export function periodLabel(code:number):string{return code===31?'Midterm':code===32?'Final':`${code>20?'Semester':code>10?'Term':'Quarter'} ${code%10}`;}
const subjectAliases:Record<string,string>={math:'mathematics',maths:'mathematics',ap:'araling panlipunan',tle:'technology and livelihood education',esp:'edukasyon sa pagpapakatao',pe:'physical education','p e':'physical education','m a p e h':'mapeh'};
export function subjectKey(label:string){const n=normalizeLabel(label);return subjectAliases[n]??n;}
export function uniquePeriod(label:string,periods:{id:string;label:string}[]){const code=periodCode(label),exact=periods.filter(p=>normalizeLabel(p.label)===normalizeLabel(label));if(exact.length===1)return exact[0].id;if(exact.length>1)return null;const matches=code===null?[]:periods.filter(p=>periodCode(p.label)===code);return matches.length===1?matches[0].id:null;}
export function filenamePeriods(value:string):number[]{const n=normalizeLabel(value),words=n.split(' '),out=new Set<number>();for(let i=0;i<words.length;i++)for(let size=1;size<=4;size++){const code=periodCode(words.slice(i,i+size).join(' '));if(code!==null)out.add(code);}return [...out];}
