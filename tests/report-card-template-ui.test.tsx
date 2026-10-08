import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/features/report-card-templates/actions',()=>({loadTemplateSheet:vi.fn()}));
vi.mock('server-only',()=>({}));
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {protectedTemplate} from './helpers/protected-template';
import {WorkbookGrid} from '@/features/report-card-templates/viewer';
import type {SheetPreview} from '@/features/report-card-templates/model';
afterEach(cleanup);
const preview:SheetPreview={summary:{name:'Custom sheet',index:0,state:'visible',rowExtent:8,columnExtent:6,mergeCount:1,formulaCount:0,hasImages:false,hasExternalReferences:false,hasPrintArea:false,hasFreezePane:false,truncated:false},rowStart:8,columnStart:3,rows:[{number:8,height:30,hidden:false}],columns:[3,4,5,6].map((number,index)=>({number,letter:['C','D','E','F'][index],width:80,hidden:false})),cells:[{address:'C8',row:8,column:3,displayValue:'<script>alert(1)</script>',type:'text',mergedRange:'C8:F8'}],merges:[{address:'C8:F8',master:'C8',top:8,bottom:8,left:3,right:6}],warnings:[]};
it('renders one inert merged control and emits only temporary sheet/coordinate selection',()=>{const select=vi.fn();const {container}=render(<WorkbookGrid preview={preview} onSelect={select}/>);expect(screen.getAllByRole('button')).toHaveLength(1);expect(container.querySelector('script')).toBeNull();expect(container.querySelector('td')?.colSpan).toBe(4);fireEvent.click(screen.getByRole('button'));expect(select).toHaveBeenCalledWith({sheetName:'Custom sheet',address:'C8',mergedRange:'C8:F8'},preview.cells[0]);expect(screen.getByRole('button')).toHaveAttribute('aria-pressed','true');});
it('uses original row and column headings, not renumbered viewport coordinates',()=>{render(<WorkbookGrid preview={preview} onSelect={()=>{}}/>);expect(screen.getByRole('rowheader')).toHaveTextContent('8');expect(screen.getByRole('columnheader',{name:'C'})).toBeVisible();expect(screen.queryByRole('columnheader',{name:'A'})).toBeNull();});
it('clipped merged ranges still select the real master without duplicate controls',()=>{const select=vi.fn();render(<WorkbookGrid preview={{...preview,columnStart:4,columns:preview.columns.slice(1)}} onSelect={select}/>);expect(screen.getAllByRole('button')).toHaveLength(1);fireEvent.click(screen.getByRole('button'));expect(select.mock.calls[0][0].address).toBe('C8');});
it('renders a parsed protected workbook as selectable read-only cells',async()=>{
  const bytes=await protectedTemplate(),original=Buffer.from(bytes),parsed=await parseWorkbook(bytes),sheet=parsed.sheet(0),select=vi.fn();
  const {container}=render(<WorkbookGrid preview={sheet} onSelect={select}/>);
  expect(container.querySelector('input,textarea,[contenteditable="true"]')).toBeNull();
  const cell=screen.getByRole('button',{name:'A1: Protected template label'});
  fireEvent.click(cell);fireEvent.keyDown(cell,{key:'x'});fireEvent.paste(cell,{clipboardData:{getData:()=> 'Changed'}});
  expect(cell).toHaveTextContent('Protected template label');
  expect(select).toHaveBeenCalledWith({sheetName:'Protected layout',address:'A1',mergedRange:undefined},sheet.cells[0]);
  expect(parsed.sheet(0).cells[0].displayValue).toBe('Protected template label');
  expect(bytes.equals(original)).toBe(true);
});
it('scales cell geometry without changing coordinates, preserves fonts and stops overflow at occupied cells',()=>{
  const p:SheetPreview={...preview,rowStart:1,columnStart:1,rows:[{number:1,height:12,hidden:false}],columns:[1,2,3].map((number)=>({number,letter:String.fromCharCode(64+number),width:50,hidden:false})),merges:[],cells:[{address:'A1',row:1,column:1,type:'text',displayValue:'Long heading',style:{fontFamily:'Bookman Old Style',fontSize:16}},{address:'B1',row:1,column:2,type:'blank',displayValue:''},{address:'C1',row:1,column:3,type:'text',displayValue:'Occupied'}]};
  const onSelect=vi.fn(),{container,rerender}=render(<WorkbookGrid preview={p} zoom={50} onSelect={onSelect}/>);
  const a=screen.getByRole('button',{name:'A1: Long heading'});expect(a.style.minHeight).toBe('0px');expect(a.parentElement?.style.fontFamily).toContain('Poppins');expect(a.parentElement?.style.fontSize).toBe('8px');expect(a.querySelector('span')?.style.width).toBe('50px');expect(container.querySelector('tbody tr')).toHaveStyle({height:'6px'});
  fireEvent.keyDown(a,{key:'ArrowRight'});expect(screen.getByRole('button',{name:'B1: Blank'})).toHaveFocus();expect(onSelect.mock.calls.at(-1)?.[0].address).toBe('B1');
  rerender(<WorkbookGrid preview={p} zoom={200} onSelect={onSelect}/>);expect(container.querySelector('tbody tr')).toHaveStyle({height:'24px'});expect(a.parentElement?.style.fontSize).toBe('32px');expect(a).toHaveAttribute('data-cell','A1');
});
it('arrow navigation skips the whole merged range',()=>{
  const navigate=vi.fn();render(<WorkbookGrid preview={{...preview,summary:{...preview.summary,columnExtent:8}}} onSelect={()=>{}} onNavigate={navigate}/>);
  fireEvent.keyDown(screen.getByRole('button'),{key:'ArrowRight'});expect(navigate).toHaveBeenCalledWith(8,7);
});
