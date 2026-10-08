import 'server-only';
import { openPackage, xml, relationships, partPath, relsPath, WorkbookError, COMPLEXITY_ERROR } from './package';
import { readStyles, readTheme, displayNumber, type StyleRecord } from './styles';
import { MAX_ROWS, MAX_COLUMNS, MAX_SHEETS, WINDOW_ROWS, WINDOW_COLUMNS, cellAddress, columnLetter, parseAddress, parseMerge, type WorkbookMetadata, type SheetSummary, type SheetPreview, type CellPreview, type Merge } from './model';

const CORRUPT='This workbook could not be read. Save a fresh .xlsx copy in Excel and try again.';
const LARGE='This sheet is too large to preview completely. The original workbook is preserved.';
const DRAWINGS='Some images, shapes or charts may not appear in the preview. The original Excel file is preserved.';
const EXTERNAL='This workbook contains external references. TeacherCo does not open external workbooks during preview.';
type RawCell={address:string;row:number;column:number;value:string;kind:string;formula?:string;style:number};
type SheetData={summary:SheetSummary;cells:Map<string,RawCell>;rows:Map<number,{height:number;hidden:boolean}>;columns:Map<number,{width:number;hidden:boolean}>;merges:Merge[];warnings:string[]};
export type ParsedWorkbook={metadata:WorkbookMetadata;merges:Merge[][];worksheetNames:string[];numericValue:(index:number,address:string)=>number|null;sheet:(index:number,rowStart?:number,columnStart?:number,expanded?:boolean,rowLimit?:number)=>SheetPreview};
function textLimit(value:string){return value.length>500?value.slice(0,499)+'…':value;}
function dimension(value:string|undefined,fallback:number,min:number,max:number){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
// OpenXML width already includes cell padding; do not add it a second time.
// The standard 11pt Calibri maximum digit width is 7px at 96 DPI.
function columnPixels(value:string|undefined){const width=dimension(value,9.140625,0,255);return Math.floor(((256*width+Math.floor(128/7))/256)*7);}
function formatCell(cell:RawCell,styles:StyleRecord[],strings:string[],date1904:boolean):CellPreview{
  const record=styles[cell.style]??styles[0];let value=cell.value,type:CellPreview['type']='text';
  if(cell.kind==='s'){const index=Number(value);if(!Number.isInteger(index)||index<0||index>=strings.length)throw new WorkbookError(CORRUPT);value=strings[index];}
  else if(cell.kind==='b'){type='boolean';value=value==='1'?'TRUE':'FALSE';}
  else if(cell.kind==='e')type='error';
  else if(cell.kind==='d')type='date';
  else if(value!==''&&(!cell.kind||cell.kind==='n')){const shown=displayNumber(value,record,date1904);value=shown.text;type=shown.date?'date':'number';}
  else if(!value)type='blank';
  return {address:cell.address,row:cell.row,column:cell.column,displayValue:textLimit(cell.formula!==undefined?(value||'ƒ'):value),type:cell.formula!==undefined?'formula':type,
    ...(cell.formula!==undefined?{formula:textLimit(cell.formula),cachedValue:textLimit(value)}:{}),style:record.style};
}
export async function parseWorkbook(bytes:Buffer,maxBytes?:number):Promise<ParsedWorkbook>{
  const zip=await openPackage(bytes,maxBytes);
  try{
    const contentTypes=await zip.text('[Content_Types].xml');let validWorkbook=false;
    xml(contentTypes,'Types',{open:(name,a)=>{if(name==='Override'&&a.ContentType==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')validWorkbook=true;
      if(/macroEnabled|vbaProject|macroSheet|activeX/i.test(a.ContentType??''))throw new WorkbookError('Macro-enabled workbooks are not supported. Upload a macro-free .xlsx copy.');}});
    if(!validWorkbook)throw new WorkbookError('TeacherCo currently supports Excel .xlsx templates.');
    const root=relationships(await zip.text('_rels/.rels')).find(r=>r.type.endsWith('/officeDocument'));
    if(!root||root.external)throw new WorkbookError(CORRUPT);
    const workbookPath=partPath('',root.target),rels=relationships(await zip.text(relsPath(workbookPath))),sheets:{name:string;state:SheetSummary['state'];id:string}[]=[];
    let date1904=false,hasPrintArea=false,protectedWorkbook=false;
    xml(await zip.text(workbookPath),'workbook',{open:(name,a)=>{
      // Editing protection is not encryption. Read structure without retaining
      // protection attributes or modifying the original package.
      if(name==='workbookProtection')protectedWorkbook=true;
      if(name==='workbookPr')date1904=a.date1904==='1'||a.date1904==='true';
      if(name==='definedName'&&a.name==='_xlnm.Print_Area')hasPrintArea=true;
      if(name==='sheet'){
        if(!a.name||a.name.length>31||!a['r:id']||sheets.some(s=>s.name===a.name)||sheets.length>=MAX_SHEETS)throw new WorkbookError(COMPLEXITY_ERROR);
        const state=a.state??'visible';if(!['visible','hidden','veryHidden'].includes(state))throw new WorkbookError(CORRUPT);
        sheets.push({name:a.name,state:state as SheetSummary['state'],id:a['r:id']});
      }
    }});
    if(!sheets.length)throw new WorkbookError('Choose a workbook that contains at least one worksheet.');
    const related=async(suffix:string)=>{const rel=rels.find(r=>r.type.endsWith(suffix));if(!rel)return undefined;if(rel.external)throw new WorkbookError(CORRUPT);return zip.text(partPath(workbookPath,rel.target));};
    const styles=readStyles(await related('/styles'),readTheme(await related('/theme'))),strings:string[]=[];
    const shared=await related('/sharedStrings');let currentString='',inPhonetic=false;
    if(shared)xml(shared,'sst',{open:name=>{if(name==='si')currentString='';if(name==='rPh')inPhonetic=true;},text:(value,path)=>{if(path[path.length-1]==='t'&&!inPhonetic){currentString+=value;if(currentString.length>32767)throw new WorkbookError(COMPLEXITY_ERROR);}},close:name=>{if(name==='rPh')inPhonetic=false;if(name==='si'){strings.push(currentString);if(strings.length>100000)throw new WorkbookError(COMPLEXITY_ERROR);}}});
    let cellCount=0,rowCount=0,worksheetCount=0;
    const parsed:SheetData[]=[],worksheetNames:string[]=[];
    for(const [index,source] of sheets.entries()){
      const rel=rels.find(r=>r.id===source.id);if(!rel||rel.external)throw new WorkbookError(CORRUPT);
      const path=partPath(workbookPath,rel.target),isWorksheet=rel.type.endsWith('/worksheet');
      const cells=new Map<string,RawCell>(),rows:SheetData['rows']=new Map(),columns:SheetData['columns']=new Map(),merges:Merge[]=[];
      const summary:SheetSummary={name:source.name,index,state:source.state,rowExtent:1,columnExtent:1,mergeCount:0,formulaCount:0,hasImages:!isWorksheet,hasExternalReferences:rels.some(r=>r.type.endsWith('/externalLink')),hasPrintArea,hasFreezePane:false,truncated:false};
      const warnings:string[]=[];
      if(protectedWorkbook)warnings.push('Protected workbook. This preview is read-only; the original protection is preserved.');
      if(zip.names.includes(relsPath(path))){const sheetRels=relationships(await zip.text(relsPath(path)));summary.hasImages||=sheetRels.some(r=>/\/(drawing|image|vmlDrawing)$/.test(r.type));summary.hasExternalReferences||=sheetRels.some(r=>r.external&&r.type.endsWith('/externalLink'));}
      if(!isWorksheet){warnings.push('This sheet type is not rendered. Download the original workbook to view it.');parsed.push({summary,cells,rows,columns,merges,warnings});continue;}
      worksheetCount++;
      worksheetNames.push(source.name);
      let currentRow=0,nextColumn=1,cell:RawCell|undefined,inValue=false,inFormula=false,inText=false,defaultHeight=20,defaultWidth=64;
      const extent=(row:number,column:number)=>{if(row>MAX_ROWS||column>MAX_COLUMNS)summary.truncated=true;summary.rowExtent=Math.max(summary.rowExtent,Math.min(MAX_ROWS,row));summary.columnExtent=Math.max(summary.columnExtent,Math.min(MAX_COLUMNS,column));};
      xml(await zip.text(path),'worksheet',{open:(name,a,stack)=>{
        if(name==='sheetProtection')warnings.push('Protected worksheet. This preview is read-only; the original protection is preserved.');
        if(name==='sheetFormatPr'){defaultHeight=dimension(a.defaultRowHeight,15,0,409)*4/3;defaultWidth=columnPixels(a.defaultColWidth);}
        if(name==='pane'&&(a.state==='frozen'||a.state==='frozenSplit'))summary.hasFreezePane=true;
        if(['drawing','legacyDrawing','picture'].includes(name))summary.hasImages=true;
        if(name==='col'){
          const min=Number(a.min),max=Number(a.max);if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>16384)throw new WorkbookError(CORRUPT);
          for(let c=min;c<=Math.min(max,MAX_COLUMNS);c++)columns.set(c,{width:columnPixels(a.width),hidden:a.hidden==='1'});
        }
        if(name==='row'&&stack.includes('sheetData')){currentRow=a.r?Number(a.r):currentRow+1;cellAddress(currentRow,1);nextColumn=1;if(++rowCount>100000)throw new WorkbookError(COMPLEXITY_ERROR);if(currentRow<=MAX_ROWS)rows.set(currentRow,{height:dimension(a.ht,defaultHeight*3/4,0,409)*4/3,hidden:a.hidden==='1'});}
        if(name==='c'&&stack.includes('sheetData')){
          if(++cellCount>100000)throw new WorkbookError(COMPLEXITY_ERROR);
          const coordinate=a.r?parseAddress(a.r):{row:currentRow,column:nextColumn};if(coordinate.row!==currentRow)throw new WorkbookError(CORRUPT);nextColumn=coordinate.column+1;
          cell={...coordinate,address:cellAddress(coordinate.row,coordinate.column),kind:a.t??'',value:'',style:Number(a.s)||0};extent(cell.row,cell.column);
        }
        if(cell){if(name==='v')inValue=true;if(name==='f'){inFormula=true;cell.formula='';summary.formulaCount++;}if(name==='t'&&stack.includes('is'))inText=true;}
        if(name==='mergeCell'){
          const merge=parseMerge(a.ref??'');if(merges.length>=1000)throw new WorkbookError(COMPLEXITY_ERROR);
          if(merges.some(m=>m.top<=merge.bottom&&m.bottom>=merge.top&&m.left<=merge.right&&m.right>=merge.left))throw new WorkbookError(CORRUPT);
          merges.push(merge);extent(merge.bottom,merge.right);
        }
      },text:value=>{
        if(!cell)return;if(inValue||inText)cell.value+=value;if(inFormula)cell.formula+=value;
        if(cell.value.length>32767||(cell.formula?.length??0)>8192)throw new WorkbookError(COMPLEXITY_ERROR);
      },close:name=>{
        if(name==='v')inValue=false;if(name==='t')inText=false;if(name==='f')inFormula=false;
        if(name==='c'&&cell){if(cell.formula?.includes('['))summary.hasExternalReferences=true;
          if(cell.row<=MAX_ROWS&&cell.column<=MAX_COLUMNS){if(cells.has(cell.address))throw new WorkbookError(CORRUPT);cells.set(cell.address,cell);}
          cell=undefined;
        }
      }});
      summary.mergeCount=merges.length;
      for(let r=1;r<=summary.rowExtent;r++)if(!rows.has(r))rows.set(r,{height:defaultHeight,hidden:false});
      for(let c=1;c<=summary.columnExtent;c++)if(!columns.has(c))columns.set(c,{width:defaultWidth,hidden:false});
      if(summary.truncated)warnings.push(LARGE);if(summary.hasImages)warnings.push(DRAWINGS);if(summary.hasExternalReferences)warnings.push(EXTERNAL);
      warnings.push('Preview formatting is approximate. Formulas are not calculated and hyperlinks are not opened.');
      parsed.push({summary,cells,rows,columns,merges,warnings});
    }
    if(!worksheetCount)throw new WorkbookError('Choose a workbook that contains at least one worksheet.');
    return {metadata:{formatVersion:1,sheets:parsed.map(s=>s.summary)},merges:parsed.map(s=>s.merges),worksheetNames,numericValue:(index,address)=>{
      // Server-only extraction: display formatting must never round imported grades.
      const cell=parsed[index]?.cells.get(address);if(!cell||cell.value===''||!['','n'].includes(cell.kind))return null;
      const value=Number(cell.value);return Number.isFinite(value)?value:null;
    },sheet:(index,rowStart=1,columnStart=1,expanded=false,rowLimit=WINDOW_ROWS)=>{
      const s=parsed[index];if(!s)throw new WorkbookError('This worksheet was not found.');
      if(!Number.isInteger(rowStart)||!Number.isInteger(columnStart)||rowStart<1||columnStart<1||rowStart>s.summary.rowExtent||columnStart>s.summary.columnExtent)throw new WorkbookError('Choose a cell inside the preview range.');
      const full=expanded&&rowLimit===WINDOW_ROWS&&s.summary.rowExtent*s.summary.columnExtent<=10000;
      if(expanded)columnStart=1;
      if(full){rowStart=1;columnStart=1;}
      const rowEnd=full?s.summary.rowExtent:Math.min(s.summary.rowExtent,rowStart+rowLimit-1),columnEnd=expanded?s.summary.columnExtent:Math.min(s.summary.columnExtent,columnStart+WINDOW_COLUMNS-1);
      const merges=s.merges.filter(m=>m.top<=rowEnd&&m.bottom>=rowStart&&m.left<=columnEnd&&m.right>=columnStart);
      const cells:CellPreview[]=[];
      for(let row=rowStart;row<=rowEnd;row++)for(let column=columnStart;column<=columnEnd;column++){
        const merged=merges.find(m=>row>=m.top&&row<=m.bottom&&column>=m.left&&column<=m.right);
        if(merged&&(row!==Math.max(rowStart,merged.top)||column!==Math.max(columnStart,merged.left)))continue;
        const address=merged?.master??cellAddress(row,column),raw=s.cells.get(address);
        const preview=raw?formatCell(raw,styles,strings,date1904):{address,row:merged?.top??row,column:merged?.left??column,displayValue:'',type:'blank' as const};
        // A merged range can store its outline on the subordinate edge cells.
        // Preserve each visible edge segment instead of using only its master.
        const borderSegments:NonNullable<CellPreview['borderSegments']>=[];
        if(merged){
          for(const side of ['top','bottom','left','right'] as const){
            const horizontal=side==='top'||side==='bottom';
            const fixed=side==='top'?merged.top:side==='bottom'?merged.bottom:side==='left'?merged.left:merged.right;
            if(horizontal?(fixed<rowStart||fixed>rowEnd):(fixed<columnStart||fixed>columnEnd))continue;
            const start=Math.max(horizontal?merged.left:merged.top,horizontal?columnStart:rowStart);
            const end=Math.min(horizontal?merged.right:merged.bottom,horizontal?columnEnd:rowEnd);
            const size=(n:number)=>horizontal?(s.columns.get(n)?.width??64):(s.rows.get(n)?.height??20);
            const total=Array.from({length:end-start+1},(_,i)=>size(start+i)).reduce((a,b)=>a+b,0);
            let offset=0;
            for(let n=start;n<=end;n++){
              const edge=s.cells.get(cellAddress(horizontal?fixed:n,horizontal?n:fixed));
              const border=(edge?styles[edge.style]?.style:preview.style)?.borders?.[side];
              const length=size(n);
              if(border&&total>0)borderSegments.push({side,start:offset/total,end:(offset+length)/total,...border});
              offset+=length;
            }
          }
        }
        cells.push({...preview,...(merged?{mergedRange:merged.address,borderSegments}:{})});
      }
      return {summary:s.summary,rowStart,columnStart,rows:Array.from({length:rowEnd-rowStart+1},(_,i)=>({number:rowStart+i,...s.rows.get(rowStart+i)??{height:20,hidden:false}})),columns:Array.from({length:columnEnd-columnStart+1},(_,i)=>({number:columnStart+i,letter:columnLetter(columnStart+i),...s.columns.get(columnStart+i)??{width:64,hidden:false}})),cells,merges,warnings:s.warnings};
    }};
  }catch(error){throw error instanceof WorkbookError?error:new WorkbookError(CORRUPT);}
  finally{zip.close();}
}
