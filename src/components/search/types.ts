// What the search API sends back. Types only: nothing here runs in the browser.
import type { Filters, Mention } from "@/lib/search/filters";
import type { CandidateSummary } from "@/lib/search/candidates";

export type { Filters, Mention, CandidateSummary };

// POST /api/search
export type NewSearch = {
  search_id: string;
  filters: Filters;
  mentions: Mention[];
  total: number;
  results: CandidateSummary[];
  searches_remaining: number | null;
};

// GET /api/search/[search_id]?page=N
export type SearchPage = {
  search_id: string;
  brief: string;
  filters: Filters;
  mentions: Mention[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  results: CandidateSummary[];
};

export type FilterKey = Mention["filter"];

// How each filter is named on screen.
export const FILTER_LABELS: Record<FilterKey, string> = {
  roles: "Role",
  seniorities: "Seniority",
  cities: "City",
  skills: "Skill",
  skills_any: "One of these skills",
  company_types: "Worked at",
  companies: "Employer",
  schools: "School",
  degrees: "Degree",
  fields: "Field of study",
  min_years: "Experience",
  max_years: "Experience",
  open_to_work: "Open to work",
};

// The values of one filter as short text, e.g. ["senior", "staff"] or "5+ years".
export function filterValues(filters: Filters, key: FilterKey): string[] {
  if (key === "min_years") return filters.min_years === null ? [] : [`${filters.min_years}+ years`];
  if (key === "max_years") return filters.max_years === null ? [] : [`up to ${filters.max_years} years`];
  if (key === "open_to_work") return filters.open_to_work === null ? [] : [filters.open_to_work ? "yes" : "no"];
  if (key === "company_types") return filters.company_types.map((t) => (t === "startup" ? "a startup" : "an enterprise"));
  return filters[key];
}
