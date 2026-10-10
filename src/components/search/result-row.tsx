// One person in the results. Facts that match the search are marked with the highlighter.
import type { CandidateSummary, Filters } from "./types";
import { ShortlistButton } from "./shortlist-button";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Marks the words in `text` that match any of `terms` (case-insensitive).
function Marked({ text, terms }: { text: string; terms: string[] }) {
  const wanted = terms.filter(Boolean).map((t) => t.toLowerCase());
  if (wanted.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${wanted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        wanted.includes(part.toLowerCase()) ? (
          <span key={i} className="mk">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Avatar({ person, size }: { person: Pick<CandidateSummary, "full_name" | "avatar_url">; size: number }) {
  return (
    <span className="pic avatar" style={{ width: size, height: size }}>
      <span aria-hidden="true">{initials(person.full_name)}</span>
      {person.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element -- small remote SVGs
        <img src={person.avatar_url} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
    </span>
  );
}

export function ResultRow({ person, filters, onOpen, selected }: { person: CandidateSummary; filters: Filters; onOpen: () => void; selected: boolean }) {
  // The filter lists hold exact allowed values; compare them as plain text here.
  const roles: readonly string[] = filters.roles;
  const cities: readonly string[] = filters.cities;
  const wantedSkills: readonly string[] = filters.skills;

  const title = person.current_title ?? person.role;
  const titleTerms = [...filters.seniorities, ...(roles.includes(person.role) ? [person.role] : [])];
  const place = [person.city, person.state].filter(Boolean).join(", ");
  const cityMatch = person.city !== null && cities.includes(person.city);
  const yearsMatch =
    (filters.min_years !== null || filters.max_years !== null) &&
    (filters.min_years === null || person.years_experience >= filters.min_years) &&
    (filters.max_years === null || person.years_experience <= filters.max_years);
  // Matching skills first, so the reason someone is here is visible at a glance.
  const skills = [...person.skills].sort((a, b) => Number(wantedSkills.includes(b)) - Number(wantedSkills.includes(a)));

  return (
    <article className={selected ? "result result-open" : "result"} onClick={onOpen}>
      <Avatar person={person} size={48} />
      <div className="result-main">
        <div className="result-head">
          <button
            type="button"
            className="display result-name"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {person.full_name}
          </button>
          {person.open_to_work && (
            <span className={filters.open_to_work ? "otw mk" : "otw"}>
              <i aria-hidden="true" /> Open to work
            </span>
          )}
        </div>
        <div>
          <Marked text={title} terms={titleTerms} />
          {person.current_company && <span className="muted"> at {person.current_company}</span>}
        </div>
        <div className="result-sub">
          {place && <span className={cityMatch ? "mk" : undefined}>{place}</span>}
          {place && " · "}
          <span className={yearsMatch ? "mk" : undefined}>
            {person.years_experience} {person.years_experience === 1 ? "year" : "years"}
          </span>
        </div>
        <div className="result-skills">
          {skills.slice(0, 6).map((skill) => (
            <span key={skill} className={wantedSkills.includes(skill) ? "skill mk" : "skill"}>
              {skill}
            </span>
          ))}
          {skills.length > 6 && <span className="skill muted">+{skills.length - 6}</span>}
        </div>
      </div>
      <ShortlistButton personId={person.id} personName={person.full_name} />
    </article>
  );
}