"use client";
// The search screen. The search id and page live in the address (/?s=…&page=2),
// so reloading, going back or sharing the link shows the same results, and
// paging only reads the saved results: it never uses up a search. A corrected
// search also carries the original (&from=…), so the brief can show what changed.
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { usePlan } from "@/lib/plan";
import { useSession } from "@/lib/use-session";
import { MarkedBrief } from "./marked-brief";
import { ResultRow } from "./result-row";
import { FILTER_LABELS, filterValues, type FilterKey, type Filters, type Mention, type NewSearch, type SearchPage } from "./types";
import { phraseFor, valuesOf, withValues } from "./filter-edit";
import { ProfilePanel } from "./profile-panel";
import Link from "next/link";

const PAGE_SIZE = 20;
const MAX_BRIEF = 500;
const EXAMPLES = [
  "senior React engineers in New York who have worked at a startup",
  "data scientists with a PhD",
  "product designers in San Francisco who are open to work",
  "backend engineers in Austin who know Go and Kubernetes",
];

type Problem = { kind: "free-used" | "unreadable" | "failed"; message: string };

export function SearchScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const { plan, refresh } = usePlan();

  const searchId = params.get("s");
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const key = searchId ? `${searchId}:${page}` : "";
  const fromId = params.get("from"); // the search this one was corrected from
  const fromKey = fromId ? `${fromId}:1` : "";

  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState<string | null>(null); // the brief being searched
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pages, setPages] = useState<Record<string, SearchPage>>({}); // pages already loaded
  const [pageError, setPageError] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to load once more
  const current = pages[key];
  const original = fromId ? pages[fromKey] : current;

  // Load the page in the address, unless we already have it.
  useEffect(() => {
    if (!session || !searchId || current) return;
    let cancelled = false;
    api<SearchPage>(`/api/search/${searchId}?page=${page}`)
      .then((data) => !cancelled && setPages((all) => ({ ...all, [key]: data })))
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : "We couldn't load these results.";
        setPageError((all) => ({ ...all, [key]: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [session, searchId, page, key, current, attempt]);

  // A corrected search also needs the original, to show what changed.
  useEffect(() => {
    if (!session || !fromId || pages[fromKey]) return;
    let cancelled = false;
    api<SearchPage>(`/api/search/${fromId}?page=1`)
      .then((data) => !cancelled && setPages((all) => ({ ...all, [fromKey]: data })))
      .catch(() => {}); // without it, the brief just shows no changes
    return () => {
      cancelled = true;
    };
  }, [session, fromId, fromKey, pages]);

  const freeUsed = plan?.plan === "free" && plan.searches_remaining === 0;

  // A new search from a brief, or a corrected one: the corrected filters are sent
  // with it, so the brief isn't read again.
  async function runSearch(brief: string, correction?: { filters: Filters; mentions: Mention[]; from: string }) {
    const text = brief.trim();
    if (!text) return;
    setProblem(null);
    setSearching(text);
    try {
      const body = correction ? { brief: text, filters: correction.filters, mentions: correction.mentions } : { brief: text };
      const result = await api<NewSearch>("/api/search", { method: "POST", body });
      const first: SearchPage = {
        search_id: result.search_id,
        brief: text,
        filters: result.filters,
        mentions: result.mentions,
        page: 1,
        page_size: PAGE_SIZE,
        total: result.total,
        total_pages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
        results: result.results,
      };
      setPages((all) => ({ ...all, [`${result.search_id}:1`]: first }));
      router.push(`/?s=${result.search_id}${correction ? `&from=${correction.from}` : ""}`);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
      if (status === 402) setProblem({ kind: "free-used", message });
      else if (status === 422 || status === 400) setProblem({ kind: "unreadable", message });
      else setProblem({ kind: "failed", message });
    } finally {
      setSearching(null);
      refresh(); // the plan badge shows the search was used
    }
  }

  function editBrief(brief: string) {
    setDraft(brief);
    setProblem(null);
    router.push("/");
  }

  function retryPage() {
    setPageError((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
    setAttempt((n) => n + 1);
  }

  function goToPage(next: number) {
    router.push(`/?s=${searchId}${fromId ? `&from=${fromId}` : ""}${next > 1 ? `&page=${next}` : ""}`);
    window.scrollTo({ top: 0 });
  }

  if (searching) return <Searching brief={searching} />;

  if (searchId) {
    if (current) {
      const base = original ?? current;
      return (
        <Results
          key={current.search_id}
          data={current}
          original={base}
          problem={problem}
          freePlan={plan?.plan === "free"}
          onChange={(filters) =>
            runSearch(current.brief, { filters, mentions: base.mentions, from: fromId ?? current.search_id })
          }
          onReset={fromId ? () => router.push(`/?s=${fromId}`) : null}
          onEdit={editBrief}
          onPage={goToPage}
          onNew={() => editBrief("")}
        />
      );
    }
    if (pageError[key])
      return (
        <StateCard
          title="These results didn't load"
          body={pageError[key]}
          actions={
            <>
              <button className="btn" onClick={retryPage}>
                Try again
              </button>
              <button className="btn-quiet" onClick={() => editBrief("")}>
                New search
              </button>
            </>
          }
        />
      );
    return <ResultsLoading />;
  }

  return (
    <StartForm
      draft={draft}
      setDraft={setDraft}
      onSearch={runSearch}
      problem={problem}
      freeUsed={freeUsed}
      planKnown={plan !== null}
      paid={plan?.plan === "paid"}
      company={session?.company ?? "Your company"}
    />
  );
}

// ---------- Start: write a brief ----------
function StartForm(props: {
  draft: string;
  setDraft: (text: string) => void;
  onSearch: (brief: string) => void;
  problem: Problem | null;
  freeUsed: boolean;
  planKnown: boolean;
  paid: boolean;
  company: string;
}) {
  const { draft, setDraft, onSearch, problem, freeUsed, planKnown, paid, company } = props;
  const blocked = freeUsed || problem?.kind === "free-used";

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(draft);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter searches; Shift + Enter adds a new line.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!blocked) onSearch(draft);
    }
  }

  return (
    <section className="start">
      <form className="start-form" onSubmit={submit}>
        <label htmlFor="brief" className="start-label">
          Who are you looking for?
        </label>
        <textarea
          id="brief"
          className="display start-input"
          rows={2}
          maxLength={MAX_BRIEF}
          placeholder="e.g. senior React engineers in New York"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <div className="start-line" />
        <div className="start-actions">
          <button className="btn" type="submit" disabled={!draft.trim() || blocked}>
            Search
          </button>
          <span className="muted start-hint">
            {!planKnown
              ? ""
              : blocked
                ? "Your free search has been used. Upgrade to search again."
                : paid
                  ? "Press Enter to search. Shift + Enter for a new line."
                  : "This uses your 1 free search. Paging through results, opening profiles and shortlisting don't use searches."}
          </span>
          {draft.length > MAX_BRIEF - 80 && (
            <span className="muted start-count">
              {draft.length}/{MAX_BRIEF}
            </span>
          )}
        </div>
      </form>

      {problem && problem.kind !== "free-used" && (
        <div className="alert" role="alert">
          {problem.kind === "unreadable"
            ? `${problem.message} Try describing the role, city or skills in a few plain words.`
            : `${problem.message} Your search wasn't used up.`}
        </div>
      )}
      {blocked && (
        <div className="notice" role="status">
          <strong>{company}&apos;s free search has been used.</strong> Your earlier results, shortlists and saved searches are
          still here. Use <strong>Upgrade</strong> at the top to see how to keep searching.
        </div>
      )}

      <div className="examples">
        <div className="muted examples-title">Or start from an example</div>
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="example" onClick={() => setDraft(example)}>
            {example}
          </button>
        ))}
      </div>
      <p className="muted start-note">
        You can describe role, seniority, city, skills, years of experience, where someone has worked, where they studied,
        and whether they&apos;re open to work.
      </p>
    </section>
  );
}

// ---------- While the brief is being read ----------
function Searching({ brief }: { brief: string }) {
  return (
    <section className="results" aria-busy="true">
      <p className="display brief-text brief-reading">{brief}</p>
      <div className="results-head">
        <span className="muted" role="status">
          Reading your brief and finding people…
        </span>
      </div>
      <SkeletonRows />
    </section>
  );
}

function ResultsLoading() {
  return (
    <section className="results" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <SkeletonRows />
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="sheet result-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="result">
          <span className="skeleton skeleton-pic" />
          <div className="result-main">
            <span className="skeleton skeleton-line" style={{ width: "34%" }} />
            <span className="skeleton skeleton-line" style={{ width: "58%" }} />
            <span className="skeleton skeleton-line" style={{ width: "44%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Results ----------
function Results({
  data,
  original,
  problem,
  freePlan,
  onChange,
  onReset,
  onEdit,
  onPage,
  onNew,
}: {
  data: SearchPage;
  original: SearchPage;
  problem: Problem | null;
  freePlan: boolean;
  onChange: (filters: Filters) => void;
  onReset: (() => void) | null;
  onEdit: (brief: string) => void;
  onPage: (page: number) => void;
  onNew: () => void;
}) {
  // For "nobody matches": one-click ways to loosen the search, starting with
  // the filters the recruiter added, since those are the likeliest culprits.
  const isNew = (key: FilterKey) => valuesOf(original.filters, key).length === 0;
  const active = (Object.keys(FILTER_LABELS) as FilterKey[])
    .filter((key) => valuesOf(data.filters, key).length > 0)
    .sort((x, y) => Number(isNew(y)) - Number(isNew(x)));
  const hasCriteria = (Object.keys(FILTER_LABELS) as FilterKey[]).some((key) => filterValues(data.filters, key).length > 0);
  const [openId, setOpenId] = useState<string | null>(null); // whose profile is open
  const closeProfile = useCallback(() => setOpenId(null), []);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function saveSearch() {
    setSaveState("saving");
    try {
      await api("/api/saved-briefs", { method: "POST", body: { brief: data.brief, filters: data.filters, mentions: original.mentions } });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }
  const from = (data.page - 1) * data.page_size + 1;
  const to = from + data.results.length - 1;

  return (
    <section className="results">
      <div className="results-top">
        <button className="btn-text muted" onClick={onNew}>
          ← New search
        </button>
        <button className="btn-text muted" onClick={() => onEdit(data.brief)}>
          Edit brief
        </button>
      </div>

      <MarkedBrief
        brief={data.brief}
        mentions={original.mentions}
        original={original.filters}
        filters={data.filters}
        onChange={onChange}
        onReset={onReset}
      />
      {freePlan && !problem && <p className="muted brief-note">On the free plan, changing a filter runs a new search.</p>}
      {problem?.kind === "free-used" && (
        <div className="notice" role="status">
          <strong>Your free search has been used.</strong> These results stay here: you can page through them, open
          profiles and shortlist people. Use <strong>Upgrade</strong> at the top to keep searching.
        </div>
      )}
      {problem && problem.kind !== "free-used" && (
        <div className="alert" role="alert">
          {problem.message} Your search wasn&apos;t used up.
        </div>
      )}

      {data.total === 0 ? (
        data.filters.unsupported.length > 0 ? (
          <StateCard
            title="Part of your brief can't be searched"
            body={`Our data doesn't include ${data.filters.unsupported.map((p) => `"${p}"`).join(" or ")}, so we show nobody rather than the wrong people. You can search the rest of the brief without it.`}
            actions={
              <button className="btn" onClick={() => onChange({ ...data.filters, unsupported: [] })}>
                Search without it
              </button>
            }
          />
        ) : !hasCriteria ? (
          <StateCard
            title="There's nothing in this brief we can search by"
            body="Describe the people you need: a role, a city, skills, seniority, years of experience, employers or schools."
            actions={<button className="btn" onClick={() => onEdit(data.brief)}>Edit brief</button>}
          />
        ) : (
          <StateCard
            title="Nobody matches all of these"
            body="Every highlighted part must match. Loosen one of them:"
            actions={
              <>
                {active.slice(0, 4).map((key) => (
                  <button key={key} className="btn-quiet try" onClick={() => onChange(withValues(data.filters, key, []))}>
                    Search without <s>{phraseFor(key, valuesOf(data.filters, key))}</s>
                  </button>
                ))}
              </>
            }
          />
        )
      ) : (
        <>
          <div className="results-head">
            <span className="display results-count">
              {data.total.toLocaleString("en-US")} {data.total === 1 ? "person" : "people"}
            </span>
            <span className="results-head-right">
              {data.total_pages > 1 && (
                <span className="muted">
                  {from}–{to} of {data.total}
                </span>
              )}
              {saveState === "saved" ? (
                <Link href="/saved" className="btn-quiet shorted">
                  <SaveIcon filled /> Saved · View saved searches
                </Link>
              ) : (
                <button className="btn-quiet" onClick={saveSearch} disabled={saveState === "saving"}>
                  <SaveIcon /> {saveState === "saving" ? "Saving…" : saveState === "error" ? "Try saving again" : "Save search"}
                </button>
              )}
            </span>
          </div>
          <div className="sheet result-list">
            {data.results.map((person) => (
              <ResultRow
                key={person.id}
                person={person}
                filters={data.filters}
                selected={openId === person.id}
                onOpen={() => setOpenId(person.id)}
              />
            ))}
          </div>
          {data.total_pages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button className="btn-quiet" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
                ← Previous
              </button>
              <span className="muted">
                Page {data.page} of {data.total_pages}
              </span>
              <button className="btn-quiet" disabled={data.page >= data.total_pages} onClick={() => onPage(data.page + 1)}>
                Next →
              </button>
            </nav>
          )}
        </>
      )}
      {openId && <ProfilePanel personId={openId} filters={data.filters} onClose={closeProfile} />}
    </section>
  );
}

const SaveIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
  </svg>
);

function StateCard({ title, body, actions }: { title: string; body: string; actions: React.ReactNode }) {
  return (
    <div className="sheet state-card" role="status">
      <h2 className="display">{title}</h2>
      <p className="muted">{body}</p>
      <div className="state-actions">{actions}</div>
    </div>
  );
}