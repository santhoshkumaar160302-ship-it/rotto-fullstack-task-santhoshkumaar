"use client";
// Saved searches: each one shows its brief and the exact filters it searches.
// "Run again" searches those same filters (the brief isn't read again);
// on the free plan that uses a search, and the button says so.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { usePlan } from "@/lib/plan";
import { useSession } from "@/lib/use-session";
import { FILTER_LABELS, filterValues, type FilterKey, type Filters, type Mention, type NewSearch } from "./search/types";

type Saved = { id: string; brief: string; filters: Filters; mentions: Mention[]; created_at: string };

// The brief with its understood phrases highlighted.
function Highlighted({ brief, mentions }: { brief: string; mentions: Mention[] }) {
  const lower = brief.toLowerCase();
  const spans = mentions
    .map((m) => ({ start: lower.indexOf(m.phrase.toLowerCase()), length: m.phrase.length }))
    .filter((s) => s.start >= 0)
    .sort((a, b) => a.start - b.start);
  const parts: { text: string; hl: boolean }[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start < at) continue;
    if (span.start > at) parts.push({ text: brief.slice(at, span.start), hl: false });
    parts.push({ text: brief.slice(span.start, span.start + span.length), hl: true });
    at = span.start + span.length;
  }
  if (at < brief.length) parts.push({ text: brief.slice(at), hl: false });
  return <>{parts.map((p, i) => (p.hl ? <span key={i} className="hl">{p.text}</span> : <span key={i}>{p.text}</span>))}</>;
}

export function SavedScreen() {
  const router = useRouter();
  const session = useSession();
  const { plan, refresh } = usePlan();
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);
  const freeUsed = plan?.plan === "free" && plan.searches_remaining === 0;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api<Saved[]>("/api/saved-briefs")
      .then((data) => !cancelled && setSaved(data))
      .catch((error: unknown) => !cancelled && setLoadError(error instanceof ApiError ? error.message : "Your saved searches didn't load."));
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function runAgain(item: Saved) {
    setProblem(null);
    setRunning(item.id);
    try {
      const result = await api<NewSearch>("/api/search", { method: "POST", body: { brief: item.brief, filters: item.filters, mentions: item.mentions } });
      router.push(`/?s=${result.search_id}`);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setProblem({
        id: item.id,
        message: status === 402 ? "Your free search has been used. Use Upgrade at the top to keep searching." : error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
      });
      setRunning(null);
    } finally {
      refresh();
    }
  }

  async function remove(item: Saved) {
    setConfirming(null);
    setSaved((now) => (now ?? []).filter((s) => s.id !== item.id));
    try {
      await api(`/api/saved-briefs/${item.id}`, { method: "DELETE" });
    } catch {
      setSaved((now) => [item, ...(now ?? [])]);
      setProblem({ id: item.id, message: "We couldn't delete that saved search. Please try again." });
    }
  }

  return (
    <section className="lists-page">
      <h1 className="display page-title">Saved searches</h1>
      {loadError && <div className="alert" role="alert">{loadError}</div>}
      {!saved && !loadError && <span className="skeleton skeleton-title" />}
      {saved?.length === 0 && (
        <div className="sheet state-card">
          <h2 className="display">No saved searches yet</h2>
          <p className="muted">After a search, use “Save search” next to the results to keep it here and run it again later.</p>
          <div className="state-actions">
            <Link href="/" className="btn">Search for people</Link>
          </div>
        </div>
      )}
      <div className="saved-list">
        {saved?.map((item) => {
          const keys = (Object.keys(FILTER_LABELS) as FilterKey[]).filter((key) => filterValues(item.filters, key).length > 0);
          return (
            <article key={item.id} className="sheet saved-card">
              <p className="display saved-brief">
                <Highlighted brief={item.brief} mentions={item.mentions} />
              </p>
              <div className="brief-extra">
                {keys.map((key) => (
                  <FilterChip key={key} label={FILTER_LABELS[key]} values={filterValues(item.filters, key)} />
                ))}
              </div>
              <div className="saved-foot">
                <span className="muted">
                  Saved {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {plan?.plan === "free" && " · Running it uses a search"}
                </span>
                <span className="list-actions">
                  {confirming === item.id ? (
                    <>
                      <button className="btn danger-solid" onClick={() => remove(item)}>Delete</button>
                      <button className="btn-text" onClick={() => setConfirming(null)}>Keep it</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-quiet danger" onClick={() => setConfirming(item.id)}>Delete</button>
                      <button className="btn" onClick={() => runAgain(item)} disabled={running !== null || freeUsed}>
                        {running === item.id ? "Searching…" : "Run again"}
                      </button>
                    </>
                  )}
                </span>
              </div>
              {problem?.id === item.id && <div className="alert" role="alert">{problem.message}</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// One filter, e.g. "Role: Backend Engineer +6 more". A long list shows its
// first value and a button that expands it to all of them (works on phones,
// where there is no hover).
function FilterChip({ label, values }: { label: string; values: string[] }) {
  const [open, setOpen] = useState(false);
  const long = values.length > 3;
  return (
    <span className="chip">
      {label}: <strong>{long && !open ? values[0] : values.join(", ")}</strong>
      {long && (
        <button type="button" className="chip-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "show less" : `+${values.length - 1} more`}
        </button>
      )}
    </span>
  );
}