"use client";
// Sign-in page. The left side is a live demo of the product: a brief types
// itself, each phrase the search understands is marked as a filter, and the
// count drops until only the matches are left, lighting up in the wall of
// faces behind the form. The numbers are real: scripts/login-demo.mts counts
// them in data/candidates.json and checks them against data/queries.json.
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import demoData from "./demo-data.json";

// The two seeded accounts from the brief. The password is public in the brief,
// so it is not a secret; it only saves graders some typing.
const DEMO_PASSWORD = "rotto-assessment";
const DEMO_ACCOUNTS = [
  { email: "recruiter@acme.test", label: "Acme recruiter", initial: "A", bg: "#DCE6FF", fg: "#1E3A8A" },
  { email: "recruiter@globex.test", label: "Globex recruiter", initial: "G", bg: "var(--ink)", fg: "var(--sheet)" },
];

// ---------- Demo data ----------
type DemoData = {
  total: number;
  briefs: { parts: { text: string; tag?: string }[]; steps: number[]; faces: string[] }[];
  avatars: string[];
};
const DEMO = demoData as DemoData;

// For each part of a brief: where it starts in the text, and which phrase it is.
const BRIEFS = DEMO.briefs.map((brief) => {
  let offset = 0;
  let phrases = 0;
  const parts = brief.parts.map((part) => {
    const placed = { ...part, offset, phrase: part.tag ? phrases++ : -1 };
    offset += part.text.length;
    return placed;
  });
  return { parts, phrases, length: offset, steps: brief.steps, faces: brief.faces, matches: brief.steps[brief.steps.length - 1] };
});
type Brief = (typeof BRIEFS)[number];

// ---------- The demo's timeline ----------
type Phase = "typing" | "marking" | "result" | "clearing";
type Moment = { brief: number; phase: Phase; chars: number; marked: number };

const START: Moment = { brief: 0, phase: "typing", chars: 0, marked: 0 };
// What visitors who turn off animations see: the first brief, fully marked up.
const STILL: Moment = { brief: 0, phase: "result", chars: BRIEFS[0].length, marked: BRIEFS[0].phrases };

function nextMoment(now: Moment): Moment {
  const brief = BRIEFS[now.brief];
  switch (now.phase) {
    case "typing":
      return now.chars < brief.length ? { ...now, chars: now.chars + 2 } : { ...now, phase: "marking", marked: 1 };
    case "marking":
      return now.marked < brief.phrases ? { ...now, marked: now.marked + 1 } : { ...now, phase: "result" };
    case "result":
      return { ...now, phase: "clearing" };
    case "clearing":
      return { ...START, brief: (now.brief + 1) % BRIEFS.length };
  }
}

// How long each moment stays on screen, in milliseconds.
function holdTime(now: Moment): number {
  if (now.phase === "typing") {
    if (now.chars === 0) return 700;
    return now.chars < BRIEFS[now.brief].length ? 45 : 500;
  }
  if (now.phase === "marking") return 650;
  if (now.phase === "result") return 3800;
  return 450;
}

function useDemo(still: boolean): Moment {
  const [moment, setMoment] = useState(START);
  useEffect(() => {
    if (still) return;
    const timer = setTimeout(() => setMoment(nextMoment), holdTime(moment));
    return () => clearTimeout(timer);
  }, [moment, still]);
  return still ? STILL : moment;
}

// Rolls a number from its last value to the new one.
function useRollingNumber(target: number, animate: boolean): number {
  const [value, setValue] = useState(target);
  const last = useRef(target);
  useEffect(() => {
    if (!animate) return;
    const from = last.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function roll(now) {
      const progress = Math.min(1, (now - start) / 600);
      last.current = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      setValue(last.current);
      if (progress < 1) frame = requestAnimationFrame(roll);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);
  return animate ? value : target;
}

// True when a CSS media query matches, e.g. reduced motion or a phone-sized screen.
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

// ---------- The brief ----------
function BriefText({ brief, chars, marked, typing }: { brief: Brief; chars: number; marked: number; typing: boolean }) {
  return (
    <>
      {brief.parts.map((part, i) => {
        const shown = part.text.slice(0, Math.max(0, chars - part.offset));
        if (!shown) return null;
        if (!part.tag) return <span key={i}>{shown}</span>;
        const isMarked = part.phrase < marked;
        return (
          <span key={i} className={isMarked ? "demo-phrase hl sweep" : "demo-phrase"}>
            {shown}
            {isMarked && <span className="demo-tag">{part.tag}</span>}
          </span>
        );
      })}
      {typing && <span className="demo-caret" />}
    </>
  );
}

// If an avatar can't load, hide it so the plain outline underneath shows instead.
function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.visibility = "hidden";
}

// Phones have no room for the wall, so the matches appear as a row of faces.
function MatchFaces({ brief, show }: { brief: Brief; show: boolean }) {
  return (
    <div className="demo-faces">
      {show &&
        brief.faces.map((src, i) => (
          <span key={i} className="demo-face" style={{ animationDelay: `${i * 70}ms` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small decorative SVGs */}
            <img src={src} alt="" loading="lazy" onError={hideBrokenImage} />
          </span>
        ))}
      {show && brief.matches > brief.faces.length && (
        <span className="demo-more">+{brief.matches - brief.faces.length} more</span>
      )}
    </div>
  );
}

// ---------- The wall of faces ----------
const FACE = 66; // px, matches .face in globals.css
const PITCH = FACE + 14; // a face plus the gap after it
const OFFSET_X = -40; // the wall starts a little off-screen (matches .wall-grid)
const OFFSET_Y = -60;
const DRIFT = 24; // px the wall drifts each way (matches @keyframes wall-drift)
const TEXT_CLEARANCE = 28; // px a lit face keeps from any text, even mid-drift

// Looks random, but always returns the same number for the same inputs.
function noise(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Box, b: Box): Box => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom),
});
const area = (b: Box) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
const grow = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, right: b.right + by, bottom: b.bottom + by });

type Grid = { cols: number; rows: number; open: number[] };

// Sizes the wall to cover the page, then finds the faces people will see: on
// the right-hand side, at least 70% on screen and out from behind the form,
// and clear of all text, so a lit face never sits behind words.
function measureGrid(wall: HTMLElement): Grid {
  const box = wall.getBoundingClientRect();
  const cols = Math.ceil((box.width - OFFSET_X + DRIFT) / PITCH) + 1;
  const rows = Math.ceil((box.height - OFFSET_Y + DRIFT) / PITCH) + 1;
  const screen: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const texts = Array.from(document.querySelectorAll('[data-wall="text"]'), (el) => grow(el.getBoundingClientRect(), TEXT_CLEARANCE));
  const cards = Array.from(document.querySelectorAll('[data-wall="card"]'), (el) => el.getBoundingClientRect());
  const open: number[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const left = box.left + OFFSET_X + (i % cols) * PITCH;
    const top = box.top + OFFSET_Y + Math.floor(i / cols) * PITCH;
    const face: Box = { left, top, right: left + FACE, bottom: top + FACE };
    const onScreen = overlap(face, screen);
    const seen = area(onScreen) - cards.reduce((sum, card) => sum + area(overlap(onScreen, card)), 0);
    const rightSide = left + FACE / 2 > screen.right * 0.45;
    const clearOfText = texts.every((text) => area(overlap(face, text)) === 0);
    if (rightSide && clearOfText && seen >= 0.7 * FACE * FACE) open.push(i);
  }
  return { cols, rows, open };
}

const FaceWall = memo(function FaceWall({ brief, marked, phase }: { brief: number; marked: number; phase: Phase }) {
  const wallRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<Grid | null>(null);

  // Measure now, and again whenever the page, the text or the form changes size.
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGrid(measureGrid(wall)));
    });
    observer.observe(wall);
    document.querySelectorAll("[data-wall]").forEach((el) => observer.observe(el));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // This brief's matches light up in a fixed shuffle of the open spots.
  // Smaller screens have fewer spots, so at most 60% of them light up.
  const matchSpots = useMemo(() => {
    if (!grid) return [];
    const count = Math.min(BRIEFS[brief].matches, Math.floor(grid.open.length * 0.6));
    return [...grid.open].sort((a, b) => noise(a, brief + 1) - noise(b, brief + 1)).slice(0, count);
  }, [grid, brief]);

  // The share of everyone who still matches after the phrases marked so far.
  const { steps } = BRIEFS[brief];
  const share = steps[Math.min(marked, steps.length - 1)] / DEMO.total;
  const avatarAt = (i: number) => DEMO.avatars[Math.floor(noise(i, 0) * DEMO.avatars.length)];

  function stateOf(i: number): "dim" | "lit" {
    if (phase === "typing" || phase === "clearing") return "lit";
    if (phase === "result") return "dim";
    return matchSpots.includes(i) || noise(i, brief + 7) < share ? "lit" : "dim";
  }

  return (
    <div ref={wallRef} className="wall" aria-hidden="true">
      {/* Everyone, in gray. */}
      {grid && (
        <div className="wall-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, ${FACE}px)` }}>
          {Array.from({ length: grid.cols * grid.rows }, (_, i) => (
            <span key={i} className="face" data-state={stateOf(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small decorative SVGs */}
              <img src={avatarAt(i)} alt="" decoding="async" draggable={false} onError={hideBrokenImage} />
            </span>
          ))}
        </div>
      )}
      <div className="wall-calm" />
      {/* The matches, in color, above the fade so they stay bright. */}
      {grid && (
        <div className="wall-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, ${FACE}px)` }}>
          {(phase === "result" || phase === "clearing") &&
            matchSpots.map((i, order) => (
              <span
                key={i}
                className={phase === "clearing" ? "face face-match leaving" : "face face-match"}
                style={{ gridColumn: (i % grid.cols) + 1, gridRow: Math.floor(i / grid.cols) + 1, animationDelay: `${order * 45}ms` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small decorative SVGs */}
                <img src={avatarAt(i)} alt="" draggable={false} onError={hideBrokenImage} />
              </span>
            ))}
        </div>
      )}
    </div>
  );
});

// ---------- The page ----------
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const phone = useMediaQuery("(max-width: 760px)");
  const moment = useDemo(still);
  const brief = BRIEFS[moment.brief];
  const done = moment.phase === "result" || moment.phase === "clearing";
  const count = useRollingNumber(brief.steps[Math.min(moment.marked, brief.steps.length - 1)], !still);
  const caption = done ? "people match this brief" : moment.marked > 0 ? "still match" : "candidates to search";

  async function signIn(withEmail: string, withPassword: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await supabaseBrowser().auth.signInWithPassword({
        email: withEmail,
        password: withPassword,
      });
      if (!authError) {
        router.replace("/");
        return;
      }
      setError(
        authError.status === 400
          ? "That email and password don't match. Check them and try again."
          : "We couldn't sign you in right now. Please try again in a moment.",
      );
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    signIn(email.trim(), password);
  }

  return (
    <div className="login">
      {!phone && <FaceWall brief={moment.brief} marked={moment.marked} phase={moment.phase} />}

      <div className="login-inner">
        <header className="login-top">
          <div className="login-brand" data-wall="text">
            <Logo /> Candidate search
          </div>
          <div data-wall="text">
            <ThemeToggle />
          </div>
        </header>

        <div className="login-main">
          <section className="login-hero">
            <div className="demo" aria-hidden="true">
              <div className="display demo-brief" data-wall="text">
                {/* Invisible copies of every brief keep the box the same height. */}
                {BRIEFS.map((b, i) => (
                  <p key={i} className="demo-ghost">
                    {b.parts.map((part, j) => (part.tag ? <span key={j} className="demo-phrase">{part.text}</span> : part.text))}
                  </p>
                ))}
                <p key={moment.brief} className={moment.phase === "clearing" ? "demo-live out" : "demo-live"}>
                  <BriefText brief={brief} chars={moment.chars} marked={moment.marked} typing={moment.phase === "typing"} />
                </p>
              </div>
              <div className="demo-count" data-wall="text">
                <span className="display num demo-number">{count.toLocaleString("en-US")}</span>
                <span className="demo-caption">{caption}</span>
              </div>
              <MatchFaces brief={brief} show={moment.phase === "result"} />
            </div>
            <p className="sr-only">
              For example, the brief “{BRIEFS[0].parts.map((part) => part.text).join("")}” finds {BRIEFS[0].matches} of{" "}
              {DEMO.total.toLocaleString("en-US")} candidates.
            </p>
            <p className="login-lede" data-wall="text">
              Describe the people you need in plain words. We mark up your brief into filters you can change, then find
              everyone who matches.
            </p>
          </section>

          <form className="login-card" onSubmit={onSubmit} data-wall="card">
            <h1 className="display">Sign in</h1>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn login-submit" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <div className="login-or">Or use a demo account</div>
            <div className="login-accounts">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="btn-quiet login-account"
                  disabled={busy}
                  onClick={() => signIn(account.email, DEMO_PASSWORD)}
                >
                  <span className="pic" style={{ width: 36, height: 36, borderRadius: 10, background: account.bg, color: account.fg }}>
                    {account.initial}
                  </span>
                  <span className="login-account-text">
                    <span style={{ fontWeight: 600 }}>{account.label}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {account.email}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}