import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnswerKeyEditor, type KeyDraft } from '@/features/exams/components/answer-key-editor';

afterEach(cleanup);
const items: KeyDraft[] = Array.from({ length: 50 }, (_, i) => ({ itemNumber: i + 1, answer: i ? '' : 'A', competency: null, points: 2 }));
function fill(index: number, from: string, to: string, name: string) {
  for (const [field, value] of [['from', from], ['to', to], ['competency', name]]) fireEvent.change(screen.getByLabelText(`Range ${index} ${field}`), { target: { value } });
}
it('applies four independent ranges without changing answers or points', () => {
  const onChange = vi.fn();
  render(<AnswerKeyEditor format="multiple_choice" choices={['A','B','C','D']} items={items} onChange={onChange} competencySuggestions={[]} />);
  [[1,10,'Addition'],[11,20,'Subtraction'],[21,30,'Multiplication'],[31,50,'Division']].forEach(([from,to,name], index) => {
    if (index) fireEvent.click(screen.getByRole('button', { name: 'Add range' }));
    fill(index + 1, String(from), String(to), String(name));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply ranges' }));
  const result = onChange.mock.calls[0][0] as KeyDraft[];
  expect(result.map(row => row.competency)).toEqual([...Array(10).fill('Addition'), ...Array(10).fill('Subtraction'), ...Array(10).fill('Multiplication'), ...Array(20).fill('Division')]);
  expect(result.map(({answer,points}) => ({answer,points}))).toEqual(items.map(({answer,points}) => ({answer,points})));
  expect(screen.queryByText('Apply points')).toBeNull();
});
it('rejects overlapping and invalid ranges without applying a partial update', () => {
  const onChange = vi.fn();
  render(<AnswerKeyEditor format="multiple_choice" choices={['A','B']} items={items} onChange={onChange} competencySuggestions={[]} />);
  fill(1,'1','10','Addition');
  fireEvent.click(screen.getByRole('button', { name: 'Add range' }));
  fill(2,'10','20','Subtraction');
  fireEvent.click(screen.getByRole('button', { name: 'Apply ranges' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Item 10');
  fill(2,'11','51','Subtraction');
  fireEvent.click(screen.getByRole('button', { name: 'Apply ranges' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Range 2');
  expect(onChange).not.toHaveBeenCalled();
});
it('restores saved ranges and allows clearing them', () => {
  const onChange = vi.fn();
  render(<AnswerKeyEditor format="multiple_choice" choices={['A','B']} items={items.map(row => ({...row, competency: row.itemNumber <= 10 ? 'Addition' : null}))} onChange={onChange} competencySuggestions={[]} />);
  expect(screen.getByLabelText('Range 1 to')).toHaveValue(10);
  fireEvent.click(screen.getByRole('button', { name: 'Remove range 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply ranges' }));
  expect(onChange.mock.calls[0][0].every((row: KeyDraft) => row.competency === null)).toBe(true);
});
