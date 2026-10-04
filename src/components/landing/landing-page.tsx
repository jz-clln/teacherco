import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Camera, Check, ChevronDown, ClipboardCheck, FileText, FolderOpen, LayoutDashboard, MessageCircle, Plus, Upload, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import today from "../../../public/brand/today-visual.png";
import upload from "../../../public/brand/upload-visual.png";
import classrooms from "../../../public/brand/class-visual.png";
import ask from "../../../public/brand/ask-visual.png";
import check from "../../../public/brand/check-visual.png";
import cta from "../../../public/brand/cta.png";
import { LandingHeader } from "./landing-header";
import { InstallTeacherCoButton } from "@/components/pwa/install-teacherco-button";
import { AndroidApkLink } from "@/components/pwa/android-apk-link";
import "./landing.css";

function AccountActions({ destination, install = false }: { destination: string | null; install?: boolean }) {
  return <div className="landing-account-actions">
    <Link prefetch={false} href={destination ?? "/request-access"} className="landing-button landing-button-primary">{destination ? "Go to TeacherCo" : "Request Early Access"}<ArrowUpRight size={18} aria-hidden="true" /></Link>
    {install && <InstallTeacherCoButton destination={destination} />}
    {!destination && <Link prefetch={false} href="/login" className="landing-button landing-button-secondary">Log in<ArrowRight size={17} aria-hidden="true" /></Link>}
  </div>;
}

function Feature({ number, eyebrow, title, visual, alt, reverse, children }: {
  number: string; eyebrow: string; title: string; visual: StaticImageData; alt: string; reverse?: boolean; children: ReactNode;
}) {
  return <section className={`landing-feature${reverse ? " landing-feature-reverse" : ""}`} aria-labelledby={`feature-${number}`}>
    <div className="landing-feature-copy"><p className="landing-eyebrow"><span className="landing-number">{number}</span>{eyebrow}</p><h2 id={`feature-${number}`}>{title}</h2>{children}</div>
    <figure className="landing-feature-visual"><Image src={visual} alt={alt} sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1279px) 55vw, 660px" /></figure>
  </section>;
}
const steps: [LucideIcon, string, string][] = [
  [Plus, "Create your class", "Set up the classroom workspace."],
  [Upload, "Bring your records", "Upload the class record you already use."],
  [ClipboardCheck, "TeacherCo organizes the data", "Confirm what TeacherCo detected."],
  [BookOpen, "Use the classroom workspace", "View records, check assessments, ask questions, and prepare reports."],
];
const workspace: [LucideIcon, string, string][] = [
  [LayoutDashboard, "Today", "Start with a clear view of your classroom day."],
  [FolderOpen, "Classes", "Keep learners and records together by classroom."],
  [Camera, "Check", "Review answer sheets and record confirmed scores."],
  [FileText, "Reports", "Bring classroom information into clear summaries."],
  [MessageCircle, "Ask", "Find answers in the records you have confirmed."],
];
const faqs = [
  ["Can I use my existing class record?", "Yes. You can upload an Excel (.xlsx) class record or paste a learner list. Review the learners and information TeacherCo detects before confirming what is added to your classroom."],
  ["Do I need an invite?", "Yes. TeacherCo is currently invite-only during early access. Create and verify your account, then request access or redeem the invite code you have received. Access requests are reviewed manually."],
  ["Does TeacherCo replace DepEd systems?", "No. TeacherCo is an independent teacher productivity workspace. It does not replace official DepEd or school systems."],
  ["Does TeacherCo decide student grades?", "No. TeacherCo assists with calculations, organization, and explanations. Teachers review the information and remain responsible for grades and educational decisions."],
  ["Can I use TeacherCo on my phone?", "Yes. TeacherCo is responsive and can be used in a browser on your phone, tablet, or computer."],
];

export function LandingPage({ destination }: { destination: string | null }) {
  return <div className="landing-page">
    <a href="#main-content" className="landing-skip">Skip to content</a>
    <LandingHeader destination={destination} />
    <main id="main-content">
      <section className="landing-container landing-hero" aria-labelledby="hero-title">
        <div className="landing-hero-copy">
          <p className="landing-badge"><span aria-hidden="true" />Invite-only early access</p>
          <h1 id="hero-title">TeacherCo<span className="brand-dot">.</span></h1>
          <p className="landing-tagline">Your classroom companion.</p>
          <p className="landing-hero-value">Spend less time on repetitive classroom work and more time teaching.</p>
          <p className="landing-description">A calmer way to work with the class records and assessments you already use. Organize, check, ask, and prepare reports in one workspace.</p>
          <AccountActions destination={destination} install />
          <p className="landing-small-note">Available on the web · Installable on supported devices</p>
          <AndroidApkLink />
          <p className="landing-small-note"><Check size={15} aria-hidden="true" />Your records. Your classroom. You’re in control.</p>
        </div>
        <figure className="landing-hero-visual"><Image src={today} alt="TeacherCo mascot beside a Today workspace with classroom, learner, and attendance summaries." priority sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1279px) 55vw, 700px" /></figure>
      </section>
      <section className="landing-problem" aria-labelledby="problem-title"><div className="landing-container landing-problem-inner">
        <div><p className="landing-eyebrow">Made for the work behind teaching</p><h2 id="problem-title">Less repetitive work.<br /><span>More time for teaching.</span></h2></div>
        <div><p>You already have the records. You shouldn’t have to keep searching, calculating, comparing, copying, and rewriting them.</p><p>TeacherCo brings that information into a classroom workspace you can actually use.</p></div>
      </div></section>
      <div id="features" className="landing-container landing-features">
        <Feature number="01" eyebrow="Class records" title="Bring in the class record you already use." visual={upload} alt="TeacherCo’s Excel class-record import, illustrated with an upload area and the teacher mascot.">
          <p>Getting started shouldn’t mean encoding everything again. Bring in your Excel (.xlsx) class record, then review what TeacherCo found before it becomes part of your workspace.</p>
          <ul className="landing-checklist">{["Upload existing records", "No learner-by-learner setup", "Review detected information", "Keep the final say"].map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul>
          <p className="landing-feature-note">Familiar records. A simpler next step.</p>
        </Feature>
        <Feature number="02" eyebrow="Classes" title="Keep every classroom organized in one place." visual={classrooms} alt="Illustrated classroom cards for Grade 1 Giraffe, Grade 1 Maya, Grade 2 Sunflower, and Grade 3 Rizal." reverse>
          <p>Different classes, different subjects, one place to keep track. Each classroom has its own learners and records, with rosters brought in from the files you already have.</p>
          <div className="landing-class-examples"><span><BookOpen size={17} aria-hidden="true" />Grade 1 Giraffe <small>Mathematics</small></span><span><BookOpen size={17} aria-hidden="true" />Grade 1 Maya <small>Language</small></span></div>
        </Feature>
        <Feature number="03" eyebrow="Ask TeacherCo" title="Ask your classroom records." visual={ask} alt="TeacherCo Ask illustration showing classroom questions and a class-average answer.">
          <p>Get to the question without digging through spreadsheet rows. Ask about the classroom information you’ve confirmed.</p>
          <ul className="landing-questions">{["Who is below the benchmark?", "Who has 5 or more absences?", "What is the class average?", "Which competency is weakest?", "What changed?"].map(question => <li key={question}><MessageCircle size={16} aria-hidden="true" />{question}</li>)}</ul>
          <p className="landing-fine-copy">Factual answers use confirmed records and deterministic calculations. AI helps with explanations where useful, and important answers can show the records behind them.</p>
        </Feature>
        <Feature number="04" eyebrow="Assessment checking" title="Photograph answer sheets. Get results faster." visual={check} alt="TeacherCo assessment-checking illustration with a photographed objective answer sheet and assessment folders." reverse>
          <p>Move from a pile of answer sheets to recorded scores, with a review step that keeps you in control.</p>
          <ol className="landing-check-steps">{["Create or select an assessment.", "Photograph or upload an answer sheet.", "TeacherCo reads supported objective answers.", "Review anything uncertain.", "Confirm scores for the learner record."].map((step, i) => <li key={step}><span>{i + 1}</span>{step}</li>)}</ol>
          <p className="landing-feature-note">Teacher-reviewed. Then recorded.</p>
        </Feature>
      </div>
      <section className="landing-container landing-reports" aria-labelledby="reports-title">
        <div><p className="landing-eyebrow">Reports</p><h2 id="reports-title">Turn classroom data into useful reports.</h2><p>Use verified classroom information to prepare clear reports and summaries, without copying the same numbers over and over. Review and refine the result before sharing.</p></div>
        <div className="landing-report-options">{["Class Performance Summary", "Learner Progress Summary"].map((name, i) => <div key={name} className="landing-report-card"><FileText size={24} aria-hidden="true" /><div><h3>{name}</h3><p>{i === 0 ? "See the picture across your classroom." : "Bring an individual learner’s progress together."}</p></div></div>)}</div>
      </section>
      <section id="how-it-works" className="landing-how" aria-labelledby="how-title"><div className="landing-container">
        <div className="landing-section-heading"><p className="landing-eyebrow">A familiar place to start</p><h2 id="how-title">How TeacherCo works</h2><p>Your existing records are the starting point.</p></div>
        <ol className="landing-step-grid">{steps.map(([Icon, title, text], i) => <li key={title}><div className="landing-step-top"><Icon size={25} aria-hidden="true" /><span>0{i + 1}</span></div><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </div></section>
      <section className="landing-container landing-workspace" aria-labelledby="workspace-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">Connected by your classroom</p><h2 id="workspace-title">One workspace for the classroom work you already do.</h2></div>
        <div className="landing-workspace-grid">{workspace.map(([Icon, title, text]) => <div key={title}><Icon size={24} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></div>)}</div>
      </section>
      <section className="landing-container landing-early" aria-labelledby="early-title">
        <div><p className="landing-eyebrow">Built around real teaching days</p><h2 id="early-title">TeacherCo is currently in early access.</h2><p>We’re starting with a small group of teachers while we continue improving TeacherCo around real classroom workflows.</p><p className="landing-fine-copy">Create and verify your account to request access. Requests are reviewed manually.</p></div>
        <div><AccountActions destination={destination} />{!destination && <p className="landing-small-note">Already have access? Use Log in.</p>}</div>
      </section>
      <section id="faq" className="landing-container landing-faq" aria-labelledby="faq-title">
        <div><p className="landing-eyebrow">A few things to know</p><h2 id="faq-title">Good questions.<br />Clear answers.</h2><p>A little more about getting started with TeacherCo.</p></div>
        <div className="landing-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={19} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
      </section>
      <section className="landing-container landing-final-wrap" aria-labelledby="final-title"><div className="landing-final">
        <div className="landing-final-copy"><p className="landing-final-brand">TeacherCo<span className="brand-dot">.</span></p><p className="landing-final-tagline">Your classroom companion.</p><h2 id="final-title">Spend less time on repetitive work.</h2><p>Bring your existing classroom records into one workspace and focus more of your time on teaching.</p><AccountActions destination={destination} /></div>
        <Image src={cta} alt="TeacherCo mascot raising a pen beside classroom records, a laptop, and a calendar." sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1279px) 50vw, 620px" />
      </div></section>
    </main>
    <footer className="landing-container landing-footer"><div><Link href="/" className="landing-brand">TeacherCo<span className="brand-dot">.</span></Link><p>Your classroom companion.</p></div><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><Link href="/legal/privacy" prefetch={false}>Privacy Notice</Link></nav><p className="landing-footer-note">An independent workspace for teachers.</p></footer>
  </div>;
}
