'use client';

import { useRef } from 'react';
import { Expand, X } from 'lucide-react';

function Screenshot({ topic, title }: { topic: string; title: string }) {
  return <picture>
    <source media="(max-width: 767px)" srcSet={`/tutorial/${topic}-mobile.webp`} width={390} height={844} />
    {/* Screenshots use picture so the browser downloads only the matching layout. */}
    <img src={`/tutorial/${topic}-desktop.webp`} width={1440} height={1000} alt={`${title}: example TeacherCo screen with demo records`} loading="lazy" className="block h-auto w-full" />
  </picture>;
}

export function TutorialScreenshot({ topic, title }: { topic: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <figure className="space-y-2">
    <button type="button" onClick={() => dialog.current?.showModal()} aria-label={`Enlarge screenshot: ${title}`} className="block w-full overflow-hidden rounded-xl border border-[#D8E1D8] bg-[#F5EFE6] text-left focus-visible:outline-2 focus-visible:outline-offset-4">
      <div className="mx-auto max-w-[280px] md:max-w-none"><Screenshot topic={topic} title={title} /></div>
      <span className="flex min-h-11 items-center justify-center gap-2 border-t border-[#D8E1D8] bg-white px-3 text-xs font-medium text-[#1A4D2E]"><Expand size={15} aria-hidden />Tap or click to enlarge</span>
    </button>
    <figcaption className="text-xs leading-5 text-[#606861]">Example screen with demo records. Your classroom details will differ.</figcaption>
    <dialog ref={dialog} aria-label={`${title} screenshot`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-6xl overflow-auto rounded-2xl border border-[#D8E1D8] bg-white p-0 backdrop:bg-black/60">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#E3E5E1] bg-white px-4 py-2"><p className="text-sm font-semibold">{title}</p><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close screenshot" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[#1A4D2E]"><X size={20} aria-hidden /></button></div>
      <Screenshot topic={topic} title={title} />
    </dialog>
  </figure>;
}
