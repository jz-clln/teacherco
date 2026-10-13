import {assertDeviceWrite} from './offline-access.js';
import {activeTeacher} from './offline-attendance.js';
import {readRecords,removeReportPackage} from './offline-records.js';
import {reportSnapshot,reportValues,filledPrintSheets,generateOfflineWorkbook,reportPrintDocument,printReport,printGeometry,DEFAULT_PRINT_SETTINGS,safeFilename,outputStatus} from './offline-report-engine.js';

export function renderReports(root,owner,records){
  const host=document.createElement('section');root.append(host);
  const el=(tag,text,parent=host)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.append(node);return node;};
  const status=el('p');status.setAttribute('role','status');
  let busy=false,reviewed=null,settings=structuredClone(DEFAULT_PRINT_SETTINGS),observer;
  async function action(work){if(busy)return;busy=true;status.textContent='Preparing report card…';try{if(activeTeacher()!==owner)throw new Error('Reopen the workspace using the original teacher account.');await work();}catch(error){if(host.isConnected)status.textContent=error.message;}finally{busy=false;}}
  const button=(label,work,parent=host)=>{const b=el('button',label,parent);b.type='button';b.className='secondary';b.onclick=()=>action(work);return b;};
  const select=(label,options,parent=host)=>{const l=el('label',label,parent),s=el('select',undefined,l);for(const [id,text]of options){const o=el('option',text,s);o.value=id;}return s;};
  const fingerprint=(state,key)=>JSON.stringify([state.rows.sections,state.rows.learners,state.rows.section_enrollments,state.rows.section_subjects,state.rows.section_grade_periods,state.rows.section_grade_entries,state.reportCards?.[key]]);
  const packages=Object.entries(records.reportCards??{});
  el('h2','Offline report cards');
  el('p','Generate and print from the Section Grade Book saved on this device, including changes waiting to sync. No internet connection is needed after preparing a template.');
  if(!packages.length){el('p','While online, open a Section’s Report Cards page, save its subject and term matches, then choose “Save for offline”.');const link=el('a','Open Sections');link.href='/sections';return;}
  const choice=select('Saved report card',packages.map(([key,p])=>[key,`${p.snapshot.section.name} · ${p.snapshot.template.name}`]));
  const form=el('div'),output=el('div');
  let learner,lrn,gradeConsent,formulaConsent,pack;
  function setup(){
    reviewed=null;observer?.disconnect();form.replaceChildren();output.replaceChildren();status.textContent='';
    pack=records.reportCards[choice.value];
    try{
      const snapshot=reportSnapshot(pack,records);
      el('p',`Prepared ${new Date(pack.preparedAt).toLocaleString()}. Uses this saved template and its matches. Prepare it again online after changing mappings.`,form);
      learner=select('Learner',snapshot.learners.map(l=>[l.id,l.display_name]),form);
      if(!snapshot.learners.length){el('p','Add an active learner to this Section in the offline workspace.',form);return;}
      if(pack.snapshot.mapping.mapping_definition.fields.lrn){const label=el('label','Temporary LRN (optional)',form);lrn=el('input',undefined,label);lrn.inputMode='numeric';lrn.maxLength=12;el('small','Used only for this output; never saved to device records or synced.',form);}else lrn=null;
      const label=el('label',undefined,form);label.className='report-check';gradeConsent=el('input',undefined,label);gradeConsent.type='checkbox';el('span','I reviewed the values below and accept any missing values.',label);
      if(pack.formulaTargets.length){el('p',`Mapped formulas replaced: ${pack.formulaTargets.join(', ')}`,form);const label=el('label',undefined,form);label.className='report-check';formulaConsent=el('input',undefined,label);formulaConsent.type='checkbox';el('span','I confirm replacing these mapped formulas.',label);}else formulaConsent=null;
      const invalidate=()=>{reviewed=null;gradeConsent.checked=false;output.replaceChildren();observer?.disconnect();};learner.onchange=invalidate;if(lrn)lrn.oninput=invalidate;
      const actions=el('div',undefined,form);actions.className='toolbar';
      button('Review report card',review,actions);
      button('Remove offline copy',async()=>{if(!confirm('Remove this saved report-card template from this device?'))return;await removeReportPackage(owner,choice.value);if(host.isConnected){observer?.disconnect();host.remove();renderReports(root,owner,await readRecords(owner));}},actions);
    }catch(error){status.textContent=error.message;}
  }
  async function review(){
    const latest=await readRecords(owner);if(!host.isConnected)return;
    const current=latest.reportCards?.[choice.value];if(!current)throw new Error('This offline template was removed. Reopen Report cards.');
    pack=current;const snapshot=reportSnapshot(pack,latest),selected=snapshot.learners.find(l=>l.id===learner.value);
    if(!selected)throw new Error('This learner is no longer active. Reopen Report cards.');
    const lrnValue=lrn?.value.trim()??'';if(lrnValue&&!/^\d{12}$/.test(lrnValue))throw new Error('Enter a 12-digit LRN, or leave it blank.');
    const values=reportValues(pack,latest,selected.id,lrnValue?{[selected.id]:lrnValue}:{});
    reviewed={values,name:selected.display_name,fingerprint:fingerprint(latest,choice.value)};gradeConsent.checked=false;
    output.replaceChildren();el('h3',selected.display_name,output);
    const missing=values.filter(v=>v.value===null);el('p',`${missing.length} mapped value(s) are blank. Final grades and remarks require every connected term.`,output);
    if(latest.queue.length)el('p','This output includes device changes that have not synced yet.',output);
    const details=el('details',undefined,output);el('summary','Review mapped values',details);const dl=el('dl',undefined,details);for(const value of values){el('dt',value.label,dl);el('dd',value.value===null?outputStatus(value):String(value.value),dl);}
    const controls=el('div',undefined,output);controls.className='toolbar';
    const paper=select('Paper size',[['a4','A4 (210 × 297 mm)'],['letter','Short / Letter (8.5 × 11 in)']],controls);paper.value=settings.paperSize;
    const orientation=select('Orientation',[['auto','Automatic'],['landscape','Landscape'],['portrait','Portrait']],controls);orientation.value=settings.orientation;
    const scale=select('Scale',[['width','Fit to width'],['page','Fit to page']],controls);scale.value=settings.scale;
    const preview=el('div',undefined,output);preview.className='offline-report-preview';
    function showPaper(){
      observer?.disconnect();preview.replaceChildren();
      // A read-only preview simulates formula replacement. Export/print below
      // require explicit consent before producing a final report card.
      const sheets=filledPrintSheets(pack,values,true),geometry=sheets.map(s=>printGeometry(s,settings));
      const width=Math.max(...geometry.map(g=>g.paperWidth))+32,height=32+geometry.reduce((sum,g)=>sum+g.paperHeight+16,0);
      const wrap=el('div',undefined,preview),frame=el('iframe',undefined,wrap);frame.title='Offline report card print layout';frame.srcdoc=reportPrintDocument(sheets,selected.display_name,settings);frame.setAttribute('sandbox','allow-same-origin');
      frame.style.cssText=`width:${width}px;height:${height}px;border:0;transform-origin:top left;pointer-events:none`;
      const fit=()=>{if(!host.isConnected){observer?.disconnect();return;}const zoom=Math.min(1,Math.max(0,preview.clientWidth-4)/width);wrap.style.width=`${width*zoom}px`;wrap.style.height=`${height*zoom}px`;frame.style.transform=`scale(${zoom})`;};
      observer=new ResizeObserver(fit);observer.observe(preview);fit();
    }
    for(const control of [paper,orientation,scale])control.onchange=()=>{settings={...settings,paperSize:paper.value,orientation:orientation.value,scale:scale.value};showPaper();};
    const actions=el('div',undefined,output);actions.className='toolbar';
    button('Download Excel',async()=>{await validateReview();const bytes=await generateOfflineWorkbook(pack,reviewed.values,!!formulaConsent?.checked);await validateReview();const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`${safeFilename(reviewed.name)}-Report-Card.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);if(lrn)lrn.value='';status.textContent='Report card generated on this device.';},actions);
    button('Print report card',async()=>{await validateReview();await printReport(filledPrintSheets(pack,reviewed.values,!!formulaConsent?.checked),reviewed.name,settings);if(lrn)lrn.value='';status.textContent='Print dialog opened. Keep the selected paper size and disable browser headers and footers.';},actions);
    el('p','Each report area stays centered on one page. Template fonts must be installed on this device. Unsupported drawings and charts may be omitted from printing; the Excel download retains their original parts. Formulas are not recalculated.',output);
    showPaper();status.textContent='Preview uses your latest saved device grades. Review the values, then confirm above to download or print.';
  }
  async function validateReview(){
    assertDeviceWrite(owner);
    if(!reviewed||!gradeConsent.checked)throw new Error('Review the report card and confirm the values first.');
    if(formulaConsent&&!formulaConsent.checked)throw new Error('Confirm replacing mapped formulas first.');
    const latest=await readRecords(owner);
    if(!host.isConnected||activeTeacher()!==owner)throw new Error('Reopen Report cards for this account.');
    if(fingerprint(latest,choice.value)!==reviewed.fingerprint)throw new Error('The saved grades, roster or template changed. Review the report card again.');
  }
  choice.onchange=setup;setup();
}
