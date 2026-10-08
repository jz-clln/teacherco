export async function chooseOption(trigger,value){
  await trigger.click();
  const page=trigger.page(),list=page.getByRole('listbox');
  const option=typeof value==='object'?list.getByRole('option',{name:value.label,exact:true}):list.getByRole('option');
  if(typeof value==='object')await option.click();
  else {
    const options=await option.all();
    for(const row of options){if(await row.getAttribute('data-value')===String(value)){await row.click();return;}}
    throw new Error('Dropdown option unavailable');
  }
}
