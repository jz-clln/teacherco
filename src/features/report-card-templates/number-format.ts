import type {StyleRecord} from './styles';
export function displayNumber(raw:string,record:StyleRecord,date1904:boolean):{text:string;date:boolean}{
  const value=Number(raw);if(!Number.isFinite(value))return {text:raw.slice(0,500),date:false};
  const format=record.format.replace(/"[^"]*"|\\.|\[[^\]]*\]/g,'');
  if((record.formatId>=14&&record.formatId<=22)||/[yd]|m.*[dh]|h.*m/i.test(format)){
    const date=new Date((date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30))+(value+(!date1904&&value<60?1:0))*86400000);
    if(Number.isFinite(date.getTime())){
      const hasTime=/[hs]/i.test(format),hasDate=/[yd]/i.test(format);
      return {text:new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...(hasDate||!hasTime?{year:'numeric',month:'short',day:'numeric'} as const:{}),...(hasTime?{hour:'2-digit',minute:'2-digit'} as const:{})}).format(date),date:true};
    }
  }
  if(format==='General'||!/[0#]/.test(format))return {text:raw.slice(0,500),date:false};
  const digits=Math.min(8,/\.([0#]+)/.exec(format)?.[1].length??0),percent=format.includes('%');
  const number=new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:format.includes(','),...(percent?{style:'percent'}:{})}).format(value);
  const symbol=record.format.match(/[$₱€£¥]/)?.[0]??'';return {text:symbol+number,date:false};
}
