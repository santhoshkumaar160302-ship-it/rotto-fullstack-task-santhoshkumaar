// The only filters search understands, and the only values each can take.
// Every value below exists in data/candidates.json. The LLM must choose
// from these lists; zod rejects anything else before it reaches Postgres.
import { z } from "zod";

export const ROLES = [
  "Account Executive", "Backend Engineer", "Data Engineer", "Data Scientist",
  "DevOps Engineer", "Frontend Engineer", "Full Stack Engineer",
  "Machine Learning Engineer", "Marketing Manager", "Mobile Engineer",
  "Product Designer", "Product Manager", "Recruiter",
] as const;

export const SENIORITIES = ["junior", "mid", "senior", "staff"] as const;

export const CITIES = [
  "Atlanta", "Austin", "Boston", "Chicago", "Denver", "Los Angeles",
  "Miami", "New York", "San Francisco", "Seattle",
] as const;

export const COMPANY_TYPES = ["startup", "enterprise"] as const;

export const COMPANIES = [
  // enterprise
  "Atlas Retail", "Beacon Energy", "Crescent Media", "Evergreen Bank",
  "Globalcorp", "Harborview Health", "Ironclad Systems", "Keystone Logistics",
  "Meridian Financial", "Pinnacle Insurance", "Summit Telecom", "Titan Software",
  // startup
  "Arcadia Robotics", "Brightpath", "Copperline", "Driftwood Data", "Fernway",
  "Hexlane", "Kitebird", "Lumen Labs", "Mintleaf", "Northwind AI", "Orbitly",
  "Paperplane", "Pebblepay", "Quillstack", "Saltbox", "Tidal Health",
] as const;

export const DEGREES = ["BA", "BS", "MBA", "MS", "PhD"] as const;

export const FIELDS = [
  "Business", "Communications", "Computer Engineering", "Computer Science",
  "Design", "Economics", "Electrical Engineering", "Fine Arts",
  "Human-Computer Interaction", "Marketing", "Mathematics", "Physics",
  "Psychology", "Statistics",
] as const;

export const SCHOOLS = [
  "Carnegie Mellon University", "Columbia University", "Cornell University",
  "Georgia Tech", "MIT", "New York University", "Northeastern University",
  "Stanford University", "UC Berkeley", "University of Illinois",
  "University of Michigan", "University of Texas at Austin",
  "University of Washington",
] as const;

export const SKILLS = [
  "A/B Testing", "AWS", "Accessibility", "Airflow", "Analytics", "Android",
  "Ansible", "Brand", "CI/CD", "CSS", "CUDA", "Content Marketing", "Datadog",
  "Design Systems", "Docker", "Employer Branding", "Enterprise Sales", "Figma",
  "Flutter", "GCP", "Go", "GraphQL", "Greenhouse", "HubSpot",
  "Interaction Design", "Interviewing", "Java", "JavaScript", "Jira", "Kafka",
  "Kotlin", "Kubernetes", "LLMs", "Lifecycle Marketing", "Linux", "MLOps",
  "Machine Learning", "Negotiation", "Next.js", "Node.js", "Outbound",
  "Paid Social", "Pandas", "Pipeline Management", "Postgres", "Pricing",
  "Prototyping", "PyTorch", "Python", "R", "React", "React Native", "Redis",
  "Roadmapping", "Ruby on Rails", "Rust", "SEO", "SQL", "SaaS", "Salesforce",
  "Scala", "Snowflake", "Sourcing", "Spark", "Statistics", "Svelte", "Swift",
  "Tableau", "Tailwind", "Technical Recruiting", "TensorFlow", "Terraform",
  "TypeScript", "User Research", "Vue", "Webflow", "dbt", "gRPC", "iOS",
] as const;

export const FiltersSchema = z.object({
  roles: z.array(z.enum(ROLES)).max(13),                 // ANY of
  seniorities: z.array(z.enum(SENIORITIES)).max(4),      // ANY of
  cities: z.array(z.enum(CITIES)).max(10),               // ANY of
  skills: z.array(z.enum(SKILLS)).max(20),               // ALL of
  // At least ONE of these skills ("Python or Go"). Optional so searches saved
  // before this filter existed still read as valid.
  skills_any: z.array(z.enum(SKILLS)).max(20).default([]), // ANY of
  company_types: z.array(z.enum(COMPANY_TYPES)).max(2),  // worked at ALL of (any job, past or current)
  companies: z.array(z.enum(COMPANIES)).max(28),         // worked at ANY of (any job, past or current)
  schools: z.array(z.enum(SCHOOLS)).max(13),             // studied at ANY of
  degrees: z.array(z.enum(DEGREES)).max(5),              // holds ANY of
  fields: z.array(z.enum(FIELDS)).max(14),               // studied ANY of
  min_years: z.number().int().min(0).max(60).nullable(), // years of experience >=
  max_years: z.number().int().min(0).max(60).nullable(), // years of experience <=
  open_to_work: z.boolean().nullable(),                  // null = don't care
  // Things the recruiter asked for that the data cannot answer.
  // If any are present, search returns nobody rather than the wrong people.
  unsupported: z.array(z.string().trim().min(1).max(100)).max(10),
});

export type Filters = z.infer<typeof FiltersSchema>;

export const EMPTY_FILTERS: Filters = {
  roles: [], seniorities: [], cities: [], skills: [], skills_any: [], company_types: [],
  companies: [], schools: [], degrees: [], fields: [],
  min_years: null, max_years: null, open_to_work: null, unsupported: [],
};
// Which words of the brief produced which filter. Used only to highlight the
// brief in the UI; never used to search.
export const FILTER_KEYS = [
  "roles", "seniorities", "cities", "skills", "skills_any", "company_types", "companies",
  "schools", "degrees", "fields", "min_years", "max_years", "open_to_work",
] as const;

export const MentionSchema = z.object({
  phrase: z.string().trim().min(1).max(100),
  filter: z.enum(FILTER_KEYS),
  values: z.array(z.string().max(100)).max(30),
});
export const MentionsSchema = z.array(MentionSchema).max(20);
export type Mention = z.infer<typeof MentionSchema>;

// Fills in any filter a stored search doesn't have (e.g. one saved before
// skills_any existed), so every screen can rely on every filter being there.
export function withDefaults(stored: unknown): Filters {
  const parsed = FiltersSchema.partial().safeParse(stored);
  return { ...EMPTY_FILTERS, ...(parsed.success ? parsed.data : {}) };
}
