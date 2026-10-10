"use client";
// The small editor that opens under a highlighted word: tick values, set years,
// or remove the filter. "Done" runs the corrected search; Esc or clicking outside cancels.
import { useEffect, useState } from "react";
import { FILTER_LABELS, type FilterKey, type Filters } from "./types";
import { NEEDS_ALL, OPTIONS, optionLabel, valuesOf } from "./filter-edit";

export function FilterPopover({
  filterKey,
  filters,
  onApply,
  onClose,
}: {
  filterKey: FilterKey;
  filters: Filters;
  onApply: (values: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(valuesOf(filters, filterKey));
  const [query, setQuery] = useState("");
  const options = OPTIONS[filterKey];
  const isYears = filterKey === "min_years" || filterKey === "max_years";

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (value: string) =>
    setPicked((now) => (now.includes(value) ? now.filter((v) => v !== value) : [...now, value]));
  const shown = options?.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase())) ?? [];

  return (
    <>
      <span className="pop-backdrop" onClick={onClose} aria-hidden="true" />
      <span className="pop" role="dialog" aria-label={`Change ${FILTER_LABELS[filterKey]}`}>
        <span className="pop-head">
          <span className="pop-title">{isYears ? "Years of experience" : FILTER_LABELS[filterKey]}</span>
          {options && <span className="pop-hint">{NEEDS_ALL.has(filterKey) ? "Must have all of these" : "Any of these"}</span>}
        </span>

        {options && options.length > 12 && (
          <input
            className="pop-search"
            placeholder={`Find a ${FILTER_LABELS[filterKey].toLowerCase()}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        )}

        {options && (
          <span className={options.length > 6 ? "pop-list pop-list-two" : "pop-list"}>
            {shown.map((value) => (
              <label key={value} className="pop-option">
                <input type="checkbox" checked={picked.includes(value)} onChange={() => toggle(value)} />
                {optionLabel(filterKey, value)}
              </label>
            ))}
            {shown.length === 0 && <span className="muted pop-empty">No match for “{query}”.</span>}
          </span>
        )}

        {isYears && (
          <label className="pop-years">
            {filterKey === "min_years" ? "At least" : "At most"}
            <input
              type="number"
              min={0}
              max={60}
              value={picked[0] ?? ""}
              onChange={(e) => setPicked(e.target.value === "" ? [] : [String(Math.max(0, Math.min(60, Math.floor(Number(e.target.value)))))])}
              autoFocus
            />
            years
          </label>
        )}

        {filterKey === "open_to_work" && (
          <span className="pop-list">
            <label className="pop-option">
              <input type="radio" name="otw" checked={picked[0] === "true"} onChange={() => setPicked(["true"])} />
              Only people open to work
            </label>
            <label className="pop-option">
              <input type="radio" name="otw" checked={picked.length === 0} onChange={() => setPicked([])} />
              Don&apos;t mind
            </label>
          </span>
        )}

        <span className="pop-foot">
          <button type="button" className="btn-text" onClick={() => onApply([])}>
            Remove this filter
          </button>
          <button type="button" className="btn pop-done" onClick={() => onApply(picked)}>
            Done
          </button>
        </span>
      </span>
    </>
  );
}