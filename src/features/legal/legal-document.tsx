import Link from "next/link";
import { legalPublication, type LegalDocument as Document } from "./content";

export function LegalDocument({ document }: { document: Document }) {
  return (
    <article className="rounded-[28px] border border-[#E3E5E1] bg-white p-6 shadow-xl shadow-[#123820]/5 sm:p-10">
      <header className="border-b border-[#E3E5E1] pb-6">
        <p className="text-sm font-semibold text-[#4F6F52]">TEACHERCO LEGAL</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1A4D2E] sm:text-4xl">{document.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#606861]">{document.description}</p>
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-xs text-[#606861]">
          <div><dt className="font-semibold">Effective date</dt><dd className="mt-1">{legalPublication.effective}</dd></div>
          <div><dt className="font-semibold">Last updated</dt><dd className="mt-1">{legalPublication.updated}</dd></div>
        </dl>
      </header>

      {legalPublication.draft ? (
        <aside aria-label="Draft notice" className="mt-6 rounded-2xl border border-[#E8DFCA] bg-[#F5EFE6] p-4 text-sm leading-6 text-[#606861]">
          <p className="font-semibold text-[#1F2A22]">Draft for review</p>
          <p>The operator&apos;s identity and contact details, retention schedule, and production service-provider details are still being finalized. This document is not yet an effective, final legal notice.</p>
        </aside>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-semibold text-[#1F2A22]">On this page</p>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-[#4F6F52]">
            {document.sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="underline-offset-4 hover:underline">{section.title.replace(/^\d+\. /, "")}</a></li>)}
            <li><a href="#contact" className="underline-offset-4 hover:underline">Contact</a></li>
          </ul>
        </nav>

        <div className="min-w-0 space-y-8 text-sm leading-7 text-[#606861]">
          <div className="rounded-2xl bg-[#F4F7F4] p-5">
            <p className="font-semibold text-[#1A4D2E]">TeacherCo assists. Teachers decide.</p>
            <p>TeacherCo works with the records you provide. Review AI-generated explanations and keep the official records required by your school.</p>
          </div>
          {document.sections.map((section) => (
            <section id={section.id} key={section.id} className="scroll-mt-6">
              <h2 className="text-lg font-semibold leading-7 text-[#1F2A22]">{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3">{paragraph}</p>)}
              {section.items ? <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-[#4F6F52]">{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </section>
          ))}
          <section id="contact" className="scroll-mt-6 border-t border-[#E3E5E1] pt-6">
            <h2 className="text-lg font-semibold text-[#1F2A22]">Contact</h2>
            <p className="mt-3">{legalPublication.operator ?? "TeacherCo's legal operator details are pending confirmation."}</p>
            {legalPublication.contactEmail ? <p className="mt-2"><a className="font-medium text-[#1A4D2E] underline underline-offset-4" href={`mailto:${legalPublication.contactEmail}`}>{legalPublication.contactEmail}</a></p> : <p className="mt-2">A public contact for privacy questions, data requests, and account assistance will be added before this document is finalized.</p>}
            <p className="mt-3">Signed-in users can access existing controls in <Link className="font-medium text-[#1A4D2E] underline underline-offset-4" href="/settings#data">Settings → Data &amp; storage</Link>.</p>
            <p className="mt-3">For information about Philippine privacy rights, see the <a href="https://privacy.gov.ph/data-subject-rights/" className="font-medium text-[#1A4D2E] underline underline-offset-4">National Privacy Commission</a>.</p>
          </section>
        </div>
      </div>
    </article>
  );
}
