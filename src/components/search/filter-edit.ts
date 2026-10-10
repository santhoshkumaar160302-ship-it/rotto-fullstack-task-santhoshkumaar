// Reading and changing one filter at a time, and the words used to show it in the brief.
import { CITIES, COMPANIES, COMPANY_TYPES, DEGREES, FIELDS, ROLES, SCHOOLS, SENIORITIES, SKILLS } from "@/lib/search/filters";
import type { FilterKey, Filters } from "./types";

// The allowed values for each list filter. The editor only offers these,
// so a corrected search can never contain a value the data doesn't have.
export const OPTIONS: Partial<Record<FilterKey, readonly string[]>> = {
  roles: ROLES,
  seniorities: SENIORITIES,
  cities: CITIES,
  skills: SKILLS,
  company_types: COMPANY_TYPES,
  companies: COMPANIES,
  schools: SCHOOLS,
  degrees: DEGREES,
  fields: FIELDS,
};

// Filters where a person needs every value (the rest need any one of them).
export const NEEDS_ALL = new Set<FilterKey>(["skills", "company_types"]);

// Every filter as a list of text values, e.g. ["senior"], ["5"] or ["true"].
export function valuesOf(filters: Filters, key: FilterKey): string[] {
  if (key === "min_years" || key === "max_years") return filters[key] === null ? [] : [String(filters[key])];
  if (key === "open_to_work") return filters.open_to_work === null ? [] : [String(filters.open_to_work)];
  return [...filters[key]];
}

// A copy of the filters with one filter replaced. An empty list removes it.
export function withValues(filters: Filters, key: FilterKey, values: string[]): Filters {
  if (key === "min_years" || key === "max_years") return { ...filters, [key]: values.length ? Number(values[0]) : null };
  if (key === "open_to_work") return { ...filters, open_to_work: values.length ? values[0] === "true" : null };
  return { ...filters, [key]: values } as Filters;
}

export function optionLabel(key: FilterKey, value: string): string {
  if (key === "seniorities") return value === "mid" ? "Mid-level" : value.charAt(0).toUpperCase() + value.slice(1);
  if (key === "company_types") return value === "startup" ? "A startup" : "An enterprise";
  return value;
}

const or = (items: string[]) => items.join(" or ");

// How a filter reads inside the brief, e.g. "senior or staff" or "frontend or full stack engineers".
export function phraseFor(key: FilterKey, values: string[]): string {
  if (values.length === 0) return "";
  switch (key) {
    case "seniorities":
      return or(values.map((v) => (v === "mid" ? "mid-level" : v)));
    case "skills":
      return values.join(" and ");
    case "roles": {
      const engineers = ROLES.filter((r) => r.endsWith("Engineer"));
      if (values.length === engineers.length && values.every((v) => v.endsWith("Engineer"))) return "engineers";
      if (values.every((v) => v.endsWith("Engineer")) && values.length <= 3)
        return `${or(values.map((v) => v.replace(/ Engineer$/, "").toLowerCase()))} engineers`;
      if (values.length <= 2) return or(values.map((v) => `${v.toLowerCase()}s`));
      return `people in ${values.length} roles`;
    }
    case "company_types":
      return values.map((v) => (v === "startup" ? "a startup" : "an enterprise")).join(" and ");
    case "min_years":
      return `${values[0]}+ years`;
    case "max_years":
      return `up to ${values[0]} years`;
    case "open_to_work":
      return values[0] === "true" ? "open to work" : "not looking";
    default:
      return or(values);
  }
}

// The words before a filter that the recruiter added (it has no phrase in the brief).
export const CLAUSE: Record<FilterKey, string> = {
  roles: "working as ",
  seniorities: "who are ",
  cities: "in ",
  skills: "who know ",
  company_types: "who have worked at ",
  companies: "who have worked at ",
  schools: "who studied at ",
  degrees: "with a ",
  fields: "who studied ",
  min_years: "with ",
  max_years: "with ",
  open_to_work: "who are ",
};