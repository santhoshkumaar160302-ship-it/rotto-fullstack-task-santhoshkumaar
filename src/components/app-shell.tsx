"use client";
// The frame around every signed-in screen: a sidebar on desktop, and a top bar
// plus bottom tabs on a phone. Holds navigation, the light/dark switch and the account menu.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTheme } from "@/lib/use-theme";
import { useSession } from "@/lib/use-session";
import { Logo } from "./logo";
import { PlanBadge } from "./plan-badge";
import { useShortlists } from "@/lib/shortlist-store";
import { MoonIcon, SavedIcon, SearchIcon, ShortlistIcon, SunIcon } from "./icons";

const NAV = [
  { href: "/", label: "Search", Icon: SearchIcon },
  { href: "/shortlists", label: "Shortlists", Icon: ShortlistIcon },
  { href: "/saved", label: "Saved", Icon: SavedIcon },
];

function CompanyMark({ company }: { company: string }) {
  const acme = company === "Acme";
  return (
    <span
      className="pic company-mark"
      style={{ background: acme ? "#DCE6FF" : "var(--ink)", color: acme ? "#1E3A8A" : "var(--sheet)" }}
    >
      {company.charAt(0)}
    </span>
  );
}

function AccountMenu({ company, email, showName }: { company: string; email: string; showName: boolean }) {
  const [open, setOpen] = useState(false);

  // A full page load wipes everything this account had loaded, so whoever
  // signs in next never sees it, even for a moment.
  async function signOut() {
    setOpen(false);
    await supabaseBrowser().auth.signOut();
    window.location.replace("/login");
  }

  return (
    <div className="account">
      <button
        type="button"
        className="account-button"
        aria-expanded={open}
        aria-label={`${company} account`}
        onClick={() => setOpen((o) => !o)}
      >
        <CompanyMark company={company} />
        {showName && <span>{company}</span>}
      </button>
      {open && (
        <>
          <button type="button" className="account-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="account-menu" role="menu">
            <div className="account-who">
              <strong>{company}</strong>
              <span className="muted">{email}</span>
            </div>
            <button type="button" role="menuitem" className="account-item" onClick={signOut}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const themeLabel = dark ? "Switch to light mode" : "Switch to dark mode";
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Shortlists colleagues sent you that are waiting for an answer.
  const waiting = useShortlists().invites.length;
  const badge = (href: string) =>
    href === "/shortlists" && waiting > 0 ? (
      <span className="nav-badge" aria-label={`${waiting} waiting for you`}>{waiting}</span>
    ) : null;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <Link href="/" className="rail-logo" aria-label="Candidate search home">
          <Logo />
        </Link>
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="navi" aria-current={isActive(href) ? "page" : undefined}>
            <span className="nav-icon">
              <Icon />
              {badge(href)}
            </span>
            {label}
          </Link>
        ))}
        <div className="rail-spacer" />
        <button type="button" className="navi" onClick={toggle} aria-label={themeLabel} title={themeLabel}>
          {dark ? <SunIcon /> : <MoonIcon />}
          {dark ? "Light" : "Dark"}
        </button>
        {session && <AccountMenu company={session.company} email={session.email} showName />}
      </nav>

      <header className="topbar">
        <Link href="/" aria-label="Candidate search home" className="topbar-logo">
          <Logo size={30} /> Candidate search
        </Link>
        <button type="button" className="icon-btn" onClick={toggle} aria-label={themeLabel} title={themeLabel}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        {session && <AccountMenu company={session.company} email={session.email} showName={false} />}
      </header>

      <main className="main">
        <PlanBadge company={session?.company ?? "Your company"} />
        {children}
      </main>

      <nav className="tabs" aria-label="Main">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="tab" aria-current={isActive(href) ? "page" : undefined}>
            <span className="nav-icon">
              <Icon />
              {badge(href)}
            </span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
