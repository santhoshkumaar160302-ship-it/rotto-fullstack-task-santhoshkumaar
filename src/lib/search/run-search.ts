// The steps of a search after the filters are known.
import "server-only";
import { admin } from "../supabase/admin";
import type { Recruiter } from "../auth";
import type { Filters } from "./filters";

// True if the filters ask for anything at all.
export function hasCriteria(f: Filters): boolean {
  const lists = [
    f.roles, f.seniorities, f.cities, f.skills, f.company_types, f.companies,
    f.schools, f.degrees, f.fields, f.unsupported,
  ];
  return (
    lists.some((l) => l.length > 0) ||
    f.min_years !== null || f.max_years !== null || f.open_to_work !== null
  );
}

// Postgres finds the people. A brief with no criteria returns nobody, never everyone.
export async function findCandidateIds(filters: Filters): Promise<string[]> {
  if (!hasCriteria(filters)) return [];
  const { data, error } = await admin.rpc("search_candidate_ids", { f: filters });
  if (error) throw error;
  return data as string[];
}

// Saves the ordered result ids once, so paging never re-runs the search.
export async function saveSearch(
  recruiter: Recruiter, brief: string, filters: Filters, ids: string[],
): Promise<string> {
  const { data, error } = await admin
    .from("searches")
    .insert({
      company_id: recruiter.companyId,
      created_by: recruiter.userId,
      brief,
      filters,
      result_ids: ids,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export type Plan = { plan: "free" | "paid"; searches_remaining: number | null };

export async function getPlan(companyId: string): Promise<Plan> {
  const { data, error } = await admin.rpc("get_plan", { p_company_id: companyId }).single();
  if (error) throw error;
  return data as Plan;
}