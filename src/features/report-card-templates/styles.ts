import 'server-only';
import { xml, WorkbookError, COMPLEXITY_ERROR } from './package';
import type { CellStyle } from './model';
type StyleRecord={style:CellStyle;format:string;formatId:number};
const themeDefault=['FFFFFF','000000','E7E6E6','44546A','4472C4','ED7D31','A5A5A5','FFC000','5B9BD5','70AD47','0563C1','954F72'];
const indexed=['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF'];
const formats:Record<number,string>={0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',14:'mm-dd-yy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',18:'h:mm AM/PM',19:'h:mm:ss AM/PM',20:'h:mm',21:'h:mm:ss',22:'m/d/yy h:mm'};
const bounded=(value:string|undefined,fallback:number,min:number,max:number)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
export function readTheme(text?:string){if(!text)return themeDefault;const values:string[]=[];xml(text,'theme',{open:(name,a,path)=>{if(path.includes('clrScheme')&&(name==='srgbClr'||name==='sysClr')){const v=a.val==='window'||a.val==='windowText'?a.lastClr:a.val;if(v&&/^[a-f\d]{6}$/i.test(v))values.push(v);}}});
  // Spreadsheet theme indexes are lt1, dk1, lt2, dk2; DrawingML orders dk first.
  if(values.length>=4)[values[0],values[1],values[2],values[3]]=[values[1],values[0],values[3],values[2]];
  return values.length>=12?values:themeDefault;
}
function color(a:Record<string,string>,theme:string[]):string|undefined{
  let value=a.rgb?.slice(-6)??(a.theme!=null?theme[Number(a.theme)]:a.indexed!=null?indexed[Number(a.indexed)%8]:undefined);
  if(!value||!/^[a-f\d]{6}$/i.test(value))return undefined;
  const tint=bounded(a.tint,0,-1,1);if(tint){value=[0,2,4].map(i=>{const n=parseInt(value!.slice(i,i+2),16);return Math.round(tint<0?n*(1+tint):n+(255-n)*tint).toString(16).padStart(2,'0');}).join('');}
  return `#${value}`;
}
export function readStyles(text?:string,theme=themeDefault):StyleRecord[]{
  if(!text)return [{style:{},format:'General',formatId:0}];
  const fonts:CellStyle[]=[],fills:(string|undefined)[]=[],borders:NonNullable<CellStyle['borders']>[]=[],custom=new Map<number,string>(),out:StyleRecord[]=[];
  let font:CellStyle={},fill:string|undefined,border:NonNullable<CellStyle['borders']>={},side:keyof NonNullable<CellStyle['borders']>|undefined,active:StyleRecord|undefined;
  xml(text,'styleSheet',{open:(name,a,path)=>{
    if(name==='numFmt'){if(custom.size>1024||a.formatCode?.length>512)throw new WorkbookError(COMPLEXITY_ERROR);custom.set(Number(a.numFmtId),a.formatCode??'General');}
    if(path.includes('fonts')){
      if(name==='font')font={};else if(name==='b')font.bold=a.val!=='0';else if(name==='i')font.italic=a.val!=='0';else if(name==='u')font.underline=a.val!=='none';else if(name==='sz')font.fontSize=bounded(a.val,11,6,36)*4/3;else if(name==='color')font.color=color(a,theme);
    }
    if(path.includes('fills')){if(name==='fill')fill=undefined;if(name==='fgColor')fill=color(a,theme);}
    if(path.includes('borders')){
      if(name==='border')border={};if(['top','right','bottom','left'].includes(name)){side=name as typeof side;if(a.style&&side)border[side]={style:a.style==='double'?'double':a.style.includes('dash')?'dashed':a.style.includes('dot')?'dotted':'solid',width:a.style==='thick'?3:a.style==='medium'||a.style==='double'?2:1,color:'#808080'};}
      if(name==='color'&&side&&border[side])border[side]!.color=color(a,theme)??'#808080';
    }
    if(path.includes('cellXfs')){
      if(name==='xf'){const formatId=Number(a.numFmtId)||0;active={style:{...fonts[Number(a.fontId)||0],background:fills[Number(a.fillId)||0],borders:borders[Number(a.borderId)||0]},formatId,format:custom.get(formatId)??formats[formatId]??'General'};}
      if(name==='alignment'&&active){if(['left','center','right'].includes(a.horizontal))active.style.align=a.horizontal as CellStyle['align'];if(['top','center','bottom'].includes(a.vertical))active.style.vertical=a.vertical==='center'?'middle':a.vertical as CellStyle['vertical'];active.style.wrap=a.wrapText==='1'||a.wrapText==='true';}
    }
  },close:(name,path)=>{
    if(name==='font'&&path.includes('fonts'))fonts.push(font);if(name==='fill'&&path.includes('fills'))fills.push(fill);if(name==='border'&&path.includes('borders'))borders.push(border);if(name===side)side=undefined;
    if(name==='xf'&&path.includes('cellXfs')&&active){out.push(active);active=undefined;}
    if(Math.max(fonts.length,fills.length,borders.length,out.length)>2048)throw new WorkbookError(COMPLEXITY_ERROR);
  }});return out.length?out:[{style:{},format:'General',formatId:0}];
}
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
export type { StyleRecord };
