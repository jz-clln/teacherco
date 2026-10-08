import {fireEvent,within} from '@testing-library/react';
export function chooseOption(trigger:HTMLElement,value:string){
  fireEvent.click(trigger);
  const list=document.getElementById(trigger.getAttribute('aria-controls')!)!;
  const option=within(list).getAllByRole('option').find(node=>node.dataset.value===value);
  if(!option)throw new Error('Dropdown option unavailable');
  fireEvent.click(option);
}
