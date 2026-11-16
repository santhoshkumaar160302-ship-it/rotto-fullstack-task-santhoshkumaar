"use client";
// Every filter of the search as a chip under the brief, so it's obvious what
// is being searched and how to change it: click a chip to edit it, ✕ to remove
// it, "+ Add filter" for a new one. Each change runs the corrected search.
// (Highlighted words in the brief still work too; this is the obvious way.)
import { useState } from "react";
import { FILTER_LABELS, type FilterKey, type Filters } from "./types";
import { optionLabel, valuesOf, withValues } from "./filter-edit";
import { FilterPopover } from "./filter-popover";

const KEYS = Object.keys(FILTER_LABELS) as FilterKey[];

const ADD_LABELS: Partial<Record<FilterKey, string>> = {
  skills: "Skills (must have all)",
  skills_any: "Skills (any one of)",
  min_years: "Minimum years of experience",
  max_years: "Maximum years of experience",
};

function chipLabel(key: FilterKey): string {
  if (key === "min_years") return "At least";
  if (key === "max_years") return "At most";
  if (key === "skills") return "Skills";
  return FILTER_LABELS[key];
}

// Short text for a chip: "Backend Engineer, Data Engineer +5".
function chipValue(key: FilterKey, values: string[]): string {
  if (key === "min_years" || key === "max_years") return `${values[0]} years`;
  if (key === "open_to_work") return values[0] === "true" ? "Yes" : "No";
  const shown = values.map((v) => optionLabel(key, v));
  const joiner = key === "skills" || key === "company_types" ? " + " : ", ";
  return shown.length > 2 ? `${shown.slice(0, 2).join(joiner)} +${shown.length - 2}` : shown.join(joiner);
}

export function FilterBar({
  filters,
  onChange,
  busy = false,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState<FilterKey | null>(null);
  const [adding, setAdding] = useState(false);
  const active = KEYS.filter((key) => valuesOf(filters, key).length > 0);
  const addable = KEYS.filter((key) => valuesOf(filters, key).length === 0);

  const apply = (key: FilterKey, values: string[]) => {
    setOpen(null);
    setAdding(false);
    onChange(withValues(filters, key, values));
  };

  const popover = (key: FilterKey) => (
    <FilterPopover
      filterKey={key}
      filters={filters}
      onApply={(values) => apply(key, values)}
      onClose={() => {
        setOpen(null);
        setAdding(false);
      }}
    />
  );

  return (
    <div className="filter-bar" aria-label="Filters" role="group">
      <span className="filter-bar-title">Filters</span>

      {active.map((key) => {
        const values = valuesOf(filters, key);
        const text = chipValue(key, values);
        return (
          <span key={key} className="tw fchip-wrap">
            <span className={`fchip${open === key ? " open" : ""}`}>
              <button
                type="button"
                className="fchip-main"
                disabled={busy}
                aria-expanded={open === key}
                title={values.map((v) => optionLabel(key, v)).join(", ")}
                onClick={() => {
                  setAdding(false);
                  setOpen(open === key ? null : key);
                }}
              >
                <span className="fchip-label">{chipLabel(key)}</span>
                <span className="fchip-value">{text}</span>
                <Caret />
              </button>
              <button
                type="button"
                className="fchip-x"
                disabled={busy}
                aria-label={`Remove ${chipLabel(key)} filter (${text})`}
                title="Remove this filter"
                onClick={() => apply(key, [])}
              >
                <Cross />
              </button>
            </span>
            {open === key && popover(key)}
          </span>
        );
      })}

      {/* Things we can't search by. Removing one searches without it. */}
      {filters.unsupported.map((phrase) => (
        <span key={`u-${phrase}`} className="fchip fchip-bad" title="Our data doesn't include this, so nobody can match it">
          <span className="fchip-main fchip-static">
            <span className="fchip-label">Can&apos;t search</span>
            <span className="fchip-value">{phrase}</span>
          </span>
          <button
            type="button"
            className="fchip-x"
            disabled={busy}
            aria-label={`Search without "${phrase}"`}
            title="Search without it"
            onClick={() => onChange({ ...filters, unsupported: filters.unsupported.filter((p) => p !== phrase) })}
          >
            <Cross />
          </button>
        </span>
      ))}

      {addable.length > 0 && (
        <span className="tw fchip-wrap">
          <button
            type="button"
            className="fchip-add"
            disabled={busy}
            aria-expanded={adding}
            onClick={() => {
              setOpen(null);
              setAdding((a) => !a);
            }}
          >
            + Add filter
          </button>
          {adding && open === null && (
            <>
              <span className="pop-backdrop" onClick={() => setAdding(false)} aria-hidden="true" />
              <span className="pop pop-menu" role="menu">
                {addable.map((key) => (
                  <button key={key} type="button" role="menuitem" className="pop-option" onClick={() => setOpen(key)}>
                    {ADD_LABELS[key] ?? FILTER_LABELS[key]}
                  </button>
                ))}
              </span>
            </>
          )}
          {adding && open !== null && !active.includes(open) && popover(open)}
        </span>
      )}
    </div>
  );
}

const Caret = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const Cross = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
