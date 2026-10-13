import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, Check } from 'lucide-react';
import { LandingHeader } from '@/components/landing/landing-header';
import { getAccessContext } from '@/lib/auth/access-guard';
import { accessDestination } from '@/lib/auth/access-policy';
import '@/components/landing/landing.css';
import './coming-soon.css';

export const metadata: Metadata = {
  title: 'Coming Soon | TeacherCo',
  description: 'A sneak peek at the teaching tools taking shape at TeacherCo, from document assistance to lesson planning and practice worksheets.',
};

const features = [
  { id: 'document-assistant', name: 'AI Document Assistant', status: 'In development', stage: 'development', image: 'ai-document-assistant', alt: 'TeacherCo teacher with an uploaded document and illustrated summary, activity, and quiz suggestions.', headline: 'Your teaching documents, ready for the next step.', description: 'Upload teaching documents and ask TeacherCo to summarize, extract activities, create questions, or turn them into classroom materials.', points: ['Ask questions about your uploaded material', 'Find key ideas with references to the source', 'Review and edit materials before using them'], example: 'Summarize this lesson and suggest three activities for my class.' },
  { id: 'lesson-plan-assistant', name: 'Lesson Plan Assistant', status: 'In development', stage: 'development', image: 'lesson-plan-assistant', alt: 'TeacherCo teacher planning objectives, activities, and assessments from a topic or uploaded material.', headline: 'A starting point for your next lesson.', description: 'Start with a topic, competency, or teaching material. Prepare a lesson plan with objectives, activities, and assessments you can adapt to your learners.', points: ['Build from your topic or existing material', 'Connect objectives, activities, and assessment', 'Edit the draft to fit your classroom'], example: 'Draft a 45-minute lesson on fractions with a group activity and a short assessment.' },
  { id: 'quiz-builder', name: 'Quiz & Answer Key Builder', status: 'Planned', stage: 'planned', image: 'quiz-builder', alt: 'TeacherCo teacher with question types, difficulty options, a quiz, and a separate answer key.', headline: 'From lesson material to a quiz you can make your own.', description: 'Turn a lesson or document into editable questions. Choose question types and difficulty, then prepare a printable quiz with a separate answer key.', points: ['Choose the question types and difficulty', 'Review every question and answer', 'Prepare separate learner and teacher copies'], example: 'Create 10 multiple-choice questions from this lesson and include an answer key.' },
  { id: 'practice-worksheets', name: 'Targeted Practice Worksheets', status: 'Planned', stage: 'planned', image: 'targeted-practice-worksheet', alt: 'TeacherCo teacher connecting assessment results and skills needing practice to a worksheet.', headline: 'More practice where your learners need it.', description: 'Use recorded assessment results to identify skills that need attention and prepare practice worksheets focused on those skills.', points: ['Connect practice to recorded assessment results', 'Focus on the skills you choose', 'Review worksheets before sharing or printing'], example: 'Prepare extra practice on fractions and word problems for this class.' },
  { id: 'parent-updates', name: 'Parent Update Drafts', status: 'Exploring', stage: 'exploring', image: 'parents-update', alt: 'TeacherCo teacher reviewing a draft parent update alongside attendance and grade summaries.', headline: 'Thoughtful updates, with you in control.', description: 'Prepare short progress updates using attendance and grades. Review the wording and choose how to share each update with parents or guardians.', points: ['Start from recorded attendance and grades', 'Adjust the wording before sharing', 'Keep every update under teacher review'], example: 'Draft a short, encouraging progress update using this learner’s attendance and grades.' },
] as const;

export default async function ComingSoonPage() {
  const context = await getAccessContext().catch(() => null);
  const destination = context ? accessDestination(!!context.user.email_confirmed_at, context.profile) : null;
  return <div className="landing-page coming-page">
    <a href="#main-content" className="landing-skip">Skip to content</a>
    <LandingHeader destination={destination} />
    <main id="main-content">
      <section className="landing-container coming-hero">
        <div>
          <Link href="/" className="coming-back"><ArrowLeft size={16} aria-hidden />Back to home</Link>
          <p className="landing-eyebrow">A look ahead</p>
          <h1>More possibilities.<br /><span>Same classroom companion.</span></h1>
          <p className="coming-intro">A sneak peek at what’s coming to TeacherCo. Thoughtful tools to help you prepare, create, and support your learners.</p>
          <a className="landing-button landing-button-primary" href="#upcoming-features">Explore what’s coming<ArrowDown size={17} aria-hidden /></a>
        </div>
        <figure><Image src="/brand/coming%20soon/features-soon.png" width={1536} height={1024} priority sizes="(max-width: 767px) 90vw, 55vw" alt="TeacherCo teacher excited about upcoming classroom tools, surrounded by planning, document, and progress icons." /></figure>
      </section>
      <section className="landing-container coming-roadmap" id="upcoming-features" aria-labelledby="coming-title">
        <div className="coming-section-heading"><p className="landing-eyebrow">Coming Soon</p><h2 id="coming-title">Taking shape for your classroom.</h2><p>These features are previews, not available tools. Plans may evolve as we build and learn from teachers.</p></div>
        <nav aria-label="Upcoming features" className="coming-jump-links">{features.map(feature => <a key={feature.id} href={`#${feature.id}`}>{feature.name}</a>)}</nav>
        <div className="coming-features">{features.map((feature, index) => <article className="coming-feature" id={feature.id} key={feature.id} aria-labelledby={`${feature.id}-title`}>
          <figure><Image src={`/brand/coming%20soon/${feature.image}.png`} width={1536} height={1024} sizes="(max-width: 767px) 90vw, 50vw" alt={feature.alt} /></figure>
          <div className="coming-feature-copy">
            <div className="coming-feature-label"><span className="coming-number">0{index + 1}</span><span className={`coming-status coming-status-${feature.stage}`}>{feature.status}</span></div>
            <h3 id={`${feature.id}-title`}>{feature.name}</h3>
            <p className="coming-headline">{feature.headline}</p>
            <p className="coming-description">{feature.description}</p>
            <ul>{feature.points.map(point => <li key={point}><Check size={16} aria-hidden />{point}</li>)}</ul>
            <div className="coming-example"><span>An idea to try when it arrives</span><p>“{feature.example}”</p></div>
          </div>
        </article>)}</div>
      </section>
      <section className="landing-container coming-note"><h2>Built with teachers in mind.</h2><p>AI features will need an internet connection. Your existing offline classroom tools will remain available. These illustrations show concepts; final features and sharing options may differ.</p><Link href="/" className="landing-button landing-button-secondary"><ArrowLeft size={16} aria-hidden />Explore TeacherCo today</Link></section>
    </main>
    <footer className="landing-container landing-footer"><Link href="/" className="landing-brand">TeacherCo<span className="brand-dot">.</span></Link><p>Your classroom companion.</p><nav aria-label="Footer navigation"><Link href="/">Home</Link><Link href="/legal/privacy">Privacy Notice</Link></nav></footer>
  </div>;
}
