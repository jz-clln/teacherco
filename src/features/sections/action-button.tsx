'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { SectionResult } from './model';

export function SectionActionButton({ label, title, description, action, destination, destructive = false }: {
  label: string; title: string; description: string; action: () => Promise<SectionResult>; destination?: string; destructive?: boolean;
}) {
  const router = useRouter(), lock = useRef(false);
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [pending, start] = useTransition();
  function submit() {
    if (lock.current) return;
    lock.current = true; setError('');
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) { setError(result.error); setOpen(false); return; }
        setOpen(false); if (destination) router.push(destination); router.refresh();
      } catch { setError('Could not save this change. Please try again.'); setOpen(false); }
      finally { lock.current = false; }
    });
  }
  return <div><Button variant="ghost" type="button" disabled={pending} onClick={() => setOpen(true)}>{pending ? 'Saving…' : label}</Button>
    {error && <p role="alert" className="mt-2 text-sm text-[#9B2C2C]">{error}</p>}
    <ConfirmDialog open={open} pending={pending} title={title} description={description} confirmLabel={label} destructive={destructive} onConfirm={submit} onCancel={() => setOpen(false)} />
  </div>;
}
