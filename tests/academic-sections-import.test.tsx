import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ details: vi.fn(), learners: vi.fn(), grades: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/features/classes/details-actions', () => ({ loadClassSubjectOptions: vi.fn().mockResolvedValue({ok:true,data:['Mathematics','Calculus']}), updateClassDetails: mocks.details }));
vi.mock('@/features/learners/import-actions', () => ({ findSimilarLearners: async () => ({ ok: true, matches: {} }), importLearners: mocks.learners }));
vi.mock('@/features/learners/grade-actions', () => ({ importGrades: mocks.grades }));
vi.mock('@/lib/excel/parser', () => {
  const sheet = { name: 'Learners', hidden: false, rows: [['LAST NAME', 'FIRST NAME'], ['Cruz', 'Ana']] };
  return { openWorkbook: async () => ({ fileName: 'record.xlsx', sheets: [{ name: sheet.name, hidden: false }],
    detect: () => ({ sheetName: sheet.name, detection: { confidence: 'high', mapping: {
      sheet: sheet.name, format: 'split', nameCol: 0, lastCol: 0, firstCol: 1,
      lrnCol: null, sexCol: null, firstRow: 1, lastRow: 1,
    } } }), read: () => sheet,
    classInfo: () => ({ gradeLevel: 'Grade 9' }),
  }) };
});
import { RosterImport } from '@/features/learners/roster-import';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.learners.mockResolvedValue({ ok: true, added: 1, skipped: 0 });
});
afterEach(cleanup);
async function upload() {
  const { container } = render(<RosterImport classId="class" currentClass={{ name: 'Rizal', schoolName: '', schoolId: '', adviser: '', gradeLevel: 'Grade 8', section: 'Rizal', subject: 'Math', schoolYear: '2026-2027', benchmark: 75 }} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['test'], 'record.xlsx')] } });
  const button = await screen.findByRole('button', { name: /Import 1 learner/ }, { timeout: 3000 });
  fireEvent.click(button);
}
it('a conflicting record never reaches learner or grade writes', async () => {
  mocks.details.mockResolvedValue({ ok: false, error: 'This record conflicts with the linked Rizal Section.' });
  await upload();
  expect(await screen.findByText('This record conflicts with the linked Rizal Section.')).toBeInTheDocument();
  expect(mocks.learners).not.toHaveBeenCalled();
  expect(mocks.grades).not.toHaveBeenCalled();
});
it('validates and saves selected metadata before starting learner import', async () => {
  mocks.details.mockResolvedValue({ ok: true });
  await upload();
  await waitFor(() => expect(mocks.learners).toHaveBeenCalled());
  expect(mocks.details).toHaveBeenCalledWith(expect.objectContaining({ gradeLevel: 'Grade 9' }));
  expect(mocks.details.mock.invocationCallOrder[0]).toBeLessThan(mocks.learners.mock.invocationCallOrder[0]);
});
