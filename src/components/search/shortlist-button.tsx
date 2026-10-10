"use client";
// The bookmark on each person. It opens a small picker: tick the shortlists the
// person belongs on, or name a new one. The bookmark is filled while they're on any list.
import { useState, type FormEvent } from "react";
import { useShortlists } from "@/lib/shortlist-store";
import { ShortlistIcon } from "../icons";

export function ShortlistButton({ personId, personName, wide = false }: { personId: string; personName: string; wide?: boolean }) {
  const { lists: allLists, create, add, remove } = useShortlists();
  // Only your own lists: ones shared with you are view only.
  const lists = allLists?.filter((l) => l.owned) ?? null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const on = (lists ?? []).filter((l) => l.candidate_ids.includes(personId));

  async function toggle(listId: string, member: boolean) {
    setError(null);
    try {
      await (member ? remove(listId, personId) : add(listId, personId));
    } catch {
      setError("That didn't save. Please try again.");
    }
  }

  async function createList(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setError(null);
    try {
      const list = await create(clean);
      await add(list.id, personId);
      setName("");
    } catch {
      setError("We couldn't create that shortlist. Please try again.");
    }
  }

  const label = on.length ? `Shortlisted in ${on.map((l) => l.name).join(", ")}. Change` : `Shortlist ${personName}`;
  return (
    <span className="tw shortlist">
      <button
        type="button"
        className={`${wide ? "btn-quiet" : "icon-btn"}${on.length ? " shorted" : ""}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <ShortlistIcon filled={on.length > 0} />
        {wide && (on.length ? `On ${on.length === 1 ? on[0].name : `${on.length} shortlists`}` : "Shortlist")}
      </button>
      {open && (
        <>
          <span className="pop-backdrop" onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-hidden="true" />
          <span className="pop pop-right" role="dialog" aria-label={`Shortlist ${personName}`} onClick={(e) => e.stopPropagation()}>
            <span className="pop-head">
              <span className="pop-title">Add {personName.split(" ")[0]} to</span>
            </span>
            <span className="pop-list">
              {lists === null && <span className="muted pop-empty">Loading your shortlists…</span>}
              {lists?.length === 0 && <span className="muted pop-empty">No shortlists yet. Name your first one below.</span>}
              {lists?.map((list) => {
                const member = list.candidate_ids.includes(personId);
                return (
                  <label key={list.id} className="pop-option">
                    <input type="checkbox" checked={member} onChange={() => toggle(list.id, member)} />
                    <span className="pop-option-text">{list.name}</span>
                    <span className="muted pop-count">{list.candidate_ids.length}</span>
                  </label>
                );
              })}
            </span>
            <form className="pop-new" onSubmit={createList}>
              <input
                className="pop-search"
                placeholder="New shortlist name"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="New shortlist name"
              />
              <button className="btn pop-done" type="submit" disabled={!name.trim()}>
                Create
              </button>
            </form>
            {error && <span className="pop-error" role="alert">{error}</span>}
          </span>
        </>
      )}
    </span>
  );
}
