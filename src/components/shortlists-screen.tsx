"use client";
// Shortlists: every list on the left, the chosen list on the right. Rename or
// delete, clear or export a list, open anyone's profile, or take them off the list. The chosen
// list is in the address (?list=…), so a reload or a shared link opens it again.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useShortlists, type Shortlist } from "@/lib/shortlist-store";
import { EMPTY_FILTERS } from "@/lib/search/filters";
import { downloadShortlist } from "@/lib/export-csv";
import type { CandidateSummary } from "@/lib/search/candidates";
import { Avatar } from "./search/result-row";
import { ProfilePanel } from "./search/profile-panel";

type ListDetail = { id: string; name: string; created_at: string; people: CandidateSummary[] };

export function ShortlistsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { lists, create } = useShortlists();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosenId = params.get("list") ?? lists?.[0]?.id ?? null;
  const chosen = lists?.find((l) => l.id === chosenId) ?? null;

  async function createList(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const list = await create(name.trim());
      setName("");
      router.push(`/shortlists?list=${list.id}`);
    } catch {
      setError("We couldn't create that shortlist. Please try again.");
    }
  }

  return (
    <section className="lists-page">
      <h1 className="display page-title">Shortlists</h1>
      <div className={`lists-layout${params.get("list") ? " has-chosen" : ""}${lists?.length === 0 ? " is-empty" : ""}`}>
        <nav className="lists-side" aria-label="Your shortlists">
          {lists === null && <span className="skeleton skeleton-line" style={{ width: "70%" }} />}
          {lists?.map((list) => (
            <Link
              key={list.id}
              href={`/shortlists?list=${list.id}`}
              className="list-link"
              aria-current={list.id === chosenId ? "page" : undefined}
            >
              <span className="list-link-name">{list.name}</span>
              <span className="muted">{list.candidate_ids.length}</span>
            </Link>
          ))}
          <form className="list-new" onSubmit={createList}>
            <input
              className="field-input"
              placeholder="New shortlist name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New shortlist name"
            />
            <button className="btn" type="submit" disabled={!name.trim()}>
              Create
            </button>
          </form>
          {error && <div className="alert" role="alert">{error}</div>}
        </nav>

        <div className="lists-main">
          {lists?.length === 0 ? (
            <div className="sheet state-card">
              <h2 className="display">No shortlists yet</h2>
              <p className="muted">
                Bookmark people from your search results, or name a shortlist on the left to start one.
              </p>
              <div className="state-actions">
                <Link href="/" className="btn">Search for people</Link>
              </div>
            </div>
          ) : chosen ? (
            <ListView key={chosen.id} list={chosen} />
          ) : lists && params.get("list") ? (
            <div className="sheet state-card">
              <h2 className="display">This shortlist isn&apos;t available</h2>
              <p className="muted">It may have been deleted, or it belongs to another company.</p>
              <div className="state-actions">
                <Link href="/shortlists" className="btn">Back to your shortlists</Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ListView({ list }: { list: Shortlist }) {
  const router = useRouter();
  const { rename, removeList, remove } = useShortlists();
  const [detail, setDetail] = useState<ListDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);
  const [confirming, setConfirming] = useState<"delete" | "clear" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const closeProfile = useCallback(() => setOpenId(null), []);
  const memberCount = list.candidate_ids.length;

  // The store says who is on the list; the server fills in their details. Load
  // the details only when the store has someone we haven't loaded yet (added
  // from search). Removals never reload, so a reload can't race a removal that
  // is still on its way to the server and bring people back on screen.
  const known = new Set(detail?.people.map((p) => p.id) ?? []);
  const needsLoad = !detail || list.candidate_ids.some((id) => !known.has(id));
  useEffect(() => {
    if (!needsLoad) return;
    let cancelled = false;
    api<ListDetail>(`/api/shortlists/${list.id}`)
      .then((data) => !cancelled && setDetail(data))
      .catch((error: unknown) => !cancelled && setLoadError(error instanceof ApiError ? error.message : "This shortlist didn't load."));
    return () => {
      cancelled = true;
    };
  }, [list.id, needsLoad]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const clean = draft.trim();
    if (!clean || clean === list.name) return setEditing(false);
    try {
      await rename(list.id, clean);
      setEditing(false);
    } catch {
      setProblem("We couldn't rename the shortlist. Please try again.");
    }
  }

  async function deleteList() {
    try {
      await removeList(list.id);
      router.push("/shortlists");
    } catch {
      setProblem("We couldn't delete the shortlist. Please try again.");
    }
  }

  // Takes everyone off the list but keeps the list itself.
  async function clearList() {
    const ids = [...list.candidate_ids];
    setConfirming(null);
    setProblem(null);
    setDetail((now) => (now ? { ...now, people: [] } : now));
    const results = await Promise.allSettled(ids.map((id) => remove(list.id, id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) setProblem(`We couldn't remove ${failed} ${failed === 1 ? "person" : "people"}. Please try again.`);
  }

  async function takeOff(person: CandidateSummary) {
    setDetail((now) => (now ? { ...now, people: now.people.filter((p) => p.id !== person.id) } : now));
    try {
      await remove(list.id, person.id);
    } catch {
      setProblem(`We couldn't remove ${person.full_name}. Please try again.`);
    }
  }

  const people = (detail?.people ?? []).filter((p) => list.candidate_ids.includes(p.id));
  return (
    <div className="list-view">
      <Link href="/shortlists" className="btn-text muted list-back">
        ← All shortlists
      </Link>
      <div className="list-head">
        {editing ? (
          <form className="list-rename" onSubmit={saveName}>
            <input className="field-input" value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} aria-label="Shortlist name" autoFocus />
            <button className="btn" type="submit">Save</button>
            <button className="btn-text" type="button" onClick={() => { setDraft(list.name); setEditing(false); }}>Cancel</button>
          </form>
        ) : (
          <h2 className="display list-title">{list.name}</h2>
        )}
        {!editing && (
          <span className="list-actions">
            <button className="btn-quiet" onClick={() => setEditing(true)}>Rename</button>
            {people.length > 0 && (
              <button
                className="btn-quiet"
                title="Download this shortlist as a CSV file for Excel or Google Sheets"
                onClick={() => downloadShortlist(list.name, people)}
              >
                Export
              </button>
            )}
            {memberCount > 0 && (
              <button className="btn-quiet" onClick={() => setConfirming("clear")}>Clear list</button>
            )}
            <button className="btn-quiet danger" onClick={() => setConfirming("delete")}>Delete</button>
          </span>
        )}
      </div>
      <p className="muted list-count">
        {list.candidate_ids.length} {list.candidate_ids.length === 1 ? "person" : "people"}
      </p>

      {confirming === "clear" && (
        <div className="notice confirm" role="alertdialog" aria-label="Clear shortlist">
          <span>
            Remove all {memberCount} {memberCount === 1 ? "person" : "people"} from <strong>{list.name}</strong>? The list stays, empty.
          </span>
          <span className="list-actions">
            <button className="btn danger-solid" onClick={clearList}>Remove everyone</button>
            <button className="btn-text" onClick={() => setConfirming(null)}>Keep them</button>
          </span>
        </div>
      )}
      {confirming === "delete" && (
        <div className="notice confirm" role="alertdialog" aria-label="Delete shortlist">
          <span>
            Delete <strong>{list.name}</strong>? The people stay in search; only this list goes.
          </span>
          <span className="list-actions">
            <button className="btn danger-solid" onClick={deleteList}>Delete shortlist</button>
            <button className="btn-text" onClick={() => setConfirming(null)}>Keep it</button>
          </span>
        </div>
      )}
      {problem && <div className="alert" role="alert">{problem}</div>}
      {loadError && <div className="alert" role="alert">{loadError}</div>}

      {!detail && !loadError && <span className="skeleton skeleton-title" />}
      {detail && people.length === 0 && (
        <div className="sheet state-card">
          <h2 className="display">This list is empty</h2>
          <p className="muted">Use the bookmark on anyone in your search results to add them here.</p>
          <div className="state-actions">
            <Link href="/" className="btn">Search for people</Link>
          </div>
        </div>
      )}
      {people.length > 0 && (
        <div className="sheet result-list">
          {people.map((person) => (
            <article key={person.id} className="result" onClick={() => setOpenId(person.id)}>
              <Avatar person={person} size={48} />
              <div className="result-main">
                <button type="button" className="display result-name" onClick={(e) => { e.stopPropagation(); setOpenId(person.id); }}>
                  {person.full_name}
                </button>
                <div>
                  {person.current_title ?? person.role}
                  {person.current_company && <span className="muted"> at {person.current_company}</span>}
                </div>
                <div className="result-sub">
                  {[person.city, person.state].filter(Boolean).join(", ")} · {person.years_experience} years
                </div>
              </div>
              <button
                type="button"
                className="btn-quiet"
                onClick={(e) => {
                  e.stopPropagation();
                  takeOff(person);
                }}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
      {openId && <ProfilePanel personId={openId} filters={EMPTY_FILTERS} onClose={closeProfile} />}
    </div>
  );
}