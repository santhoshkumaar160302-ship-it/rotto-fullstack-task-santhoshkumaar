// Loads the candidate cards shown in results, in the same order as the ids.
import "server-only";
import { admin } from "../supabase/admin";

export const PAGE_SIZE = 20;

export type CandidateSummary = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  current_company_logo_url: string | null;
  role: string;
  seniority: string;
  years_experience: number;
  city: string | null;
  state: string | null;
  open_to_work: boolean;
  skills: string[];
};

const SUMMARY_COLUMNS =
  "id, full_name, avatar_url, headline, current_title, current_company, current_company_logo_url, role, seniority, years_experience, city, state, open_to_work, skills";

export async function getCandidateSummaries(ids: string[]): Promise<CandidateSummary[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.from("candidates").select(SUMMARY_COLUMNS).in("id", ids);
  if (error) throw error;
  const rows = data as unknown as CandidateSummary[];
  const byId = new Map(rows.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is CandidateSummary => c !== undefined);
}

export type CandidateProfile = CandidateSummary & {
  country: string | null;
  experiences: {
    title: string;
    company: string;
    company_logo_url: string | null;
    company_type: string;
    start_year: number;
    end_year: number | null;
    description: string | null;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    graduation_year: number | null;
  }[];
};

const PROFILE_COLUMNS =
  "id, full_name, avatar_url, headline, current_title, current_company, current_company_logo_url, role, seniority, years_experience, city, state, country, open_to_work, skills, experiences, education";

// One candidate's full profile: experience, education and skills.
export async function getCandidateProfile(id: string): Promise<CandidateProfile | null> {
  const { data, error } = await admin.from("candidates").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as CandidateProfile | null;
}