"use client";
// The brief, read back like a proofread page. Every understood phrase is a
// highlighted button: click it to change or remove that filter and the search
// runs again without retyping. Changes show as proofreading marks: a removed
// phrase is crossed out (click it to bring it back), a replaced phrase is
// crossed out with the new words after it, and added filters are appended.
import { useState, type ReactNode } from "react";
import type { Filters, Mention } from "./types";
import { FILTER_LABELS, type FilterKey } from "./types";
import { CLAUSE, phraseFor, valuesOf, withValues } from "./filter-edit";
import { FilterPopover } from "./filter-popover";

type Piece = { text: string; mention?: Mention; unsupported?: string };

// Splits the brief into plain text, understood phrases and unsupported phrases.
function splitBrief(brief: string, mentions: Mention[], unsupported: string[]): Piece[] {
  const lower = brief.toLowerCase();
  const spans: { start: number; end: number; mention?: Mention; unsupported?: string }[] = [];
  for (const mention of mentions) {
    const start = lower.indexOf(mention.phrase.toLowerCase());
    if (start >= 0) spans.push({ start, end: start + mention.phrase.length, mention });
  }
  for (const phrase of unsupported) {
    const start = lower.indexOf(phrase.toLowerCase());
    if (start >= 0) spans.push({ start, end: start + phrase.length, unsupported: phrase });
  }
  spans.sort((a, b) => a.start - b.start);
  const pieces: Piece[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start < at) continue; // overlaps an earlier phrase
    if (span.start > at) pieces.push({ text: brief.slice(at, span.start) });
    pieces.push({ text: brief.slice(span.start, span.end), mention: span.mention, unsupported: span.unsupported });
    at = span.end;
  }
  if (at < brief.length) pieces.push({ text: brief.slice(at) });
  return pieces;
}

export function MarkedBrief({
  brief,
  mentions,
  original,
  filters,
  onChange,
  onReset,
}: {
  brief: string;
  mentions: Mention[]; // from the original search: where each filter sits in the brief
  original: Filters; // what the brief first meant
  filters: Filters; // what is being searched now
  onChange: (filters: Filters) => void;
  onReset: (() => void) | null;
}) {
  const [open, setOpen] = useState<{ key: FilterKey; slot: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const pieces = splitBrief(brief, mentions, original.unsupported);
  const placed = mentions.filter((m) => brief.toLowerCase().includes(m.phrase.toLowerCase()));
  const mentionedKeys = new Set(placed.map((m) => m.filter));

  const apply = (key: FilterKey, values: string[]) => {
    setOpen(null);
    onChange(withValues(filters, key, values));
  };

  // A highlighted word that opens the editor for its filter.
  const token = (key: FilterKey, slot: string, text: string, sweep = false): ReactNode => (
    <span className="tw" key={slot}>
      <button
        type="button"
        className={`tok hl${sweep ? " sweep" : ""}${open?.slot === slot ? " open" : ""}`}
        aria-label={`${FILTER_LABELS[key]}: ${text}. Change it`}
        aria-expanded={open?.slot === slot}
        onClick={() => setOpen(open?.slot === slot ? null : { key, slot })}
      >
        {text}
      </button>
      {open?.slot === slot && (
        <FilterPopover filterKey={key} filters={filters} onApply={(v) => apply(key, v)} onClose={() => setOpen(null)} />
      )}
    </span>
  );

  // A crossed-out phrase; clicking it puts the original values back.
  const struck = (slot: string, text: string, restore: () => void): ReactNode => (
    <button key={slot} type="button" className="struck" title="Removed. Click to bring it back" onClick={restore}>
      {text}
    </button>
  );

  const body: ReactNode[] = pieces.map((piece, i) => {
    const slot = `p${i}`;
    if (piece.unsupported) {
      const stillThere = filters.unsupported.includes(piece.unsupported);
      return stillThere ? (
        <button
          key={slot}
          type="button"
          className="redpen"
          title="We can't search by this. Click to search without it"
          onClick={() => onChange({ ...filters, unsupported: filters.unsupported.filter((p) => p !== piece.unsupported) })}
        >
          {piece.text}
        </button>
      ) : (
        struck(slot, piece.text, () => onChange({ ...filters, unsupported: [...filters.unsupported, piece.unsupported!] }))
      );
    }
    if (!piece.mention) return <span key={slot}>{piece.text}</span>;

    const key = piece.mention.filter;
    const now = valuesOf(filters, key);
    const before = valuesOf(original, key);
    const mine = piece.mention.values.length ? piece.mention.values : before;
    const kept = mine.every((v) => now.includes(v));
    const onlyPhrase = placed.filter((m) => m.filter === key).length === 1;
    const restore = () => onChange(withValues(filters, key, Array.from(new Set([...now, ...mine]))));

    if (now.length === 0) return struck(slot, piece.text, restore);
    if (!onlyPhrase) return kept ? token(key, slot, piece.text) : struck(slot, piece.text, restore);
    const same = now.length === before.length && now.every((v) => before.includes(v));
    if (kept) return token(key, slot, same ? piece.text : phraseFor(key, now), !same);
    return (
      <span key={slot}>
        {struck(`${slot}s`, piece.text, restore)} {token(key, slot, phraseFor(key, now), true)}
      </span>
    );
  });

  // Filters with no phrase of their own: added by the recruiter, or understood
  // from the brief as a whole. A filter split over several phrases shows its new values here.
  const extras = (Object.keys(FILTER_LABELS) as FilterKey[]).flatMap((key) => {
    const now = valuesOf(filters, key);
    if (now.length === 0) return [];
    if (!mentionedKeys.has(key)) return [{ key, values: now }];
    const several = placed.filter((m) => m.filter === key);
    if (several.length < 2) return [];
    const said = new Set(several.flatMap((m) => m.values));
    const added = now.filter((v) => !said.has(v));
    return added.length ? [{ key, values: added }] : [];
  });
  const addable = (Object.keys(FILTER_LABELS) as FilterKey[]).filter(
    (key) => valuesOf(filters, key).length === 0 && !mentionedKeys.has(key),
  );

  return (
    <div className="brief-read">
      <div className="display brief-text" role="heading" aria-level={1}>
        {body}
        {extras.map(({ key, values }) => (
          <span key={`x-${key}`}>
            , {CLAUSE[key]}
            {token(key, `x-${key}`, phraseFor(key, values))}
          </span>
        ))}
        {adding && open?.slot.startsWith("add-") && (
          <span>
            , {CLAUSE[open.key]}
            <span className="tw">
              <span className="tok hl open">…</span>
              <FilterPopover
                filterKey={open.key}
                filters={filters}
                onApply={(v) => {
                  setAdding(false);
                  apply(open.key, v);
                }}
                onClose={() => {
                  setAdding(false);
                  setOpen(null);
                }}
              />
            </span>
          </span>
        )}
      </div>

      <div className="brief-tools">
        <span className="muted">Click a highlighted word to change it.</span>
        <span className="brief-tools-right">
          {onReset && (
            <button type="button" className="btn-text" onClick={onReset}>
              Go back to my original brief
            </button>
          )}
          {addable.length > 0 && (
            <span className="tw">
              <button type="button" className="btn-quiet" aria-expanded={adding && !open} onClick={() => { setOpen(null); setAdding((a) => !a); }}>
                + Add a filter
              </button>
              {adding && !open && (
                <>
                  <span className="pop-backdrop" onClick={() => setAdding(false)} aria-hidden="true" />
                  <span className="pop pop-menu" role="menu">
                    {addable.map((key) => (
                      <button key={key} type="button" role="menuitem" className="pop-option" onClick={() => setOpen({ key, slot: `add-${key}` })}>
                        {key === "min_years" ? "Minimum years of experience" : key === "max_years" ? "Maximum years of experience" : FILTER_LABELS[key]}
                      </button>
                    ))}
                  </span>
                </>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}