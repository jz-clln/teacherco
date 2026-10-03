"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

const links = [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"]];

export function LandingHeader({ destination }: { destination: string | null }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <header className="landing-header" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); }
  }}>
    <div className="landing-container landing-nav">
      <Link href="/" aria-label="TeacherCo home" className="landing-brand">
        <Image src="/brand/teacherco-mascot.png" width={44} height={44} alt="" sizes="44px" />
        <span>TeacherCo<span className="brand-dot">.</span></span>
      </Link>
      <nav aria-label="Main navigation" className="landing-desktop-links">{links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
      <div className="landing-desktop-actions">
        {!destination && <Link href="/login" prefetch={false} className="landing-login">Login</Link>}
        <Link href={destination ?? "/request-access"} prefetch={false} className="landing-button landing-button-primary">{destination ? "Go to TeacherCo" : "Request Early Access"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <button ref={toggle} type="button" className="landing-menu-toggle" aria-expanded={open} aria-controls="landing-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
    </div>
    <nav id="landing-mobile-menu" aria-label="Mobile navigation" hidden={!open} className="landing-mobile-menu">
      {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
      {!destination && <Link href="/login" prefetch={false} onClick={() => setOpen(false)}>Login</Link>}
      <Link href={destination ?? "/request-access"} prefetch={false} className="landing-button landing-button-primary" onClick={() => setOpen(false)}>{destination ? "Go to TeacherCo" : "Request Early Access"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </nav>
  </header>;
}
