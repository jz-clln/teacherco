import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AppTutorial } from '@/features/tutorial/app-tutorial';
import { chooseOption } from './helpers/custom-select';

afterEach(cleanup);
it('points tutorial links to the chosen class and Section and opens selected topics', () => {
  render(<AppTutorial loadError={false} classes={[{ id: 'c1', name: 'Maya', subject: 'Math' }, { id: 'c2', name: 'Maya', subject: 'English' }]} sections={[{ id: 's1', name: 'Maya', grade_level: '1' }, { id: 's2', name: 'Eagle', grade_level: '2' }]} />);
  fireEvent.click(screen.getByRole('link', { name: /Log attendance/ }));
  expect(document.getElementById('attendance')).toHaveAttribute('open');
  expect(screen.getByRole('link', { name: 'Attendance' })).toHaveAttribute('href', '/classes/c1/attendance');
  chooseOption(screen.getByRole('combobox', { name: 'Class' }), 'c2');
  expect(screen.getByRole('link', { name: 'Attendance' })).toHaveAttribute('href', '/classes/c2/attendance');
  fireEvent.click(screen.getByRole('link', { name: /Manage the Section Grade Book/ }));
  chooseOption(screen.getByRole('combobox', { name: 'Section' }), 's2');
  expect(screen.getByRole('link', { name: 'Grade Book' })).toHaveAttribute('href', '/sections/s2/grades');
});
it('offers setup links without inventing classroom IDs when the account is empty', () => {
  const { container } = render(<AppTutorial classes={[]} sections={[]} loadError={false} />);
  expect(screen.getAllByRole('link', { name: 'Create your first class' })[0]).toHaveAttribute('href', '/classes/new');
  expect(screen.getByRole('link', { name: 'Create your first Section' })).toHaveAttribute('href', '/sections/new');
  for (const link of container.querySelectorAll('a')) expect(link.href).not.toMatch(/undefined|null/);
});
