"use client";
// A person's full profile in a side panel (full screen on a phone): their
// career as a timeline, education and skills, with the facts that match the
// search marked. Opening a profile never uses up a search.
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { CandidateProfile } from "@/lib/search/candidates";
import type { Filters } from "./types";
import { Avatar } from "./result-row";
import { ShortlistButton } from "./shortlist-button";
import { CloseIcon } from "../icons";

const THIS_YEAR = new Date().getFullYear();

export function ProfilePanel({ personId, filters, onClose }: { personId: string; filters: Filters; onClose: () => void }) {
  const [loaded, setLoaded] = useState<{ id: string; person?: CandidateProfile; error?: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api<CandidateProfile>(`/api/people/${personId}`)
      .then((person) => !cancelled && setLoaded({ id: personId, person }))
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ id: personId, error: error instanceof ApiError ? error.message : "We couldn't load this profile." });
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  // Esc closes; focus moves into the panel so keyboard users land in it.
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = loaded?.id === personId ? loaded : null;
  const person = state?.person;

  return (
    <>
      <div className="panel-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={person ? person.full_name : "Profile"} tabIndex={-1} ref={panel}>
        <div className="panel-top">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close profile">
            <CloseIcon />
          </button>
        </div>
        {!state && <div className="panel-body"><span className="skeleton skeleton-title" /><span className="skeleton skeleton-line" style={{ width: "60%" }} /></div>}
        {state?.error && (
          <div className="panel-body">
            <div className="alert" role="alert">{state.error}</div>
          </div>
        )}
        {person && <Profile person={person} filters={filters} />}
      </aside>
    </>
  );
}

function Profile({ person, filters }: { person: CandidateProfile; filters: Filters }) {
  const wantedSkills: readonly string[] = filters.skills;
  const wantedTypes: readonly string[] = filters.company_types;
  const wantedCompanies: readonly string[] = filters.companies;
  const wantedSchools: readonly string[] = filters.schools;
  const wantedDegrees: readonly string[] = filters.degrees;
  const wantedFields: readonly string[] = filters.fields;
  const cities: readonly string[] = filters.cities;

  const jobs = [...person.experiences].sort((a, b) => (b.end_year ?? THIS_YEAR) - (a.end_year ?? THIS_YEAR) || b.start_year - a.start_year);
  const first = Math.min(...jobs.map((j) => j.start_year), THIS_YEAR);
  const span = Math.max(1, THIS_YEAR - first);
  const place = [person.city, person.state].filter(Boolean).join(", ");
  const jobMatches = (job: CandidateProfile["experiences"][number]) =>
    wantedTypes.includes(job.company_type) || wantedCompanies.includes(job.company);

  return (
    <div className="panel-body">
      <header className="profile-head">
        <Avatar person={person} size={72} />
        <div className="profile-who">
          <h2 className="display">{person.full_name}</h2>
          <div>
            {person.current_title ?? person.role}
            {person.current_company && <span className="muted"> at {person.current_company}</span>}
          </div>
          <div className="muted">
            {place && <span className={person.city && cities.includes(person.city) ? "mk" : undefined}>{place}</span>}
            {place && " · "}
            {person.years_experience} years of experience
          </div>
          {person.open_to_work && (
            <span className={filters.open_to_work ? "otw mk" : "otw"}>
              <i aria-hidden="true" /> Open to work
            </span>
          )}
        </div>
      </header>
      <div className="profile-actions">
        <ShortlistButton personId={person.id} personName={person.full_name} wide />
      </div>
      {person.headline && <p className="profile-headline">{person.headline}</p>}

      {jobs.length > 0 && (
        <section className="profile-section">
          <h3>Career</h3>
          {/* Each bar is one job, placed on a timeline from their first job to today. */}
          <div className="career" aria-hidden="true">
            {jobs.map((job, i) => {
              const end = job.end_year ?? THIS_YEAR;
              return (
                <span
                  key={i}
                  className={`career-bar ${job.company_type === "startup" ? "is-startup" : "is-enterprise"}${jobMatches(job) ? " is-match" : ""}`}
                  style={{ left: `${((job.start_year - first) / span) * 100}%`, width: `${(Math.max(0.5, end - job.start_year) / span) * 100}%`, top: `${i * 12}px` }}
                  title={`${job.company}, ${job.start_year}–${job.end_year ?? "now"}`}
                />
              );
            })}
          </div>
          <div className="career-scale muted" aria-hidden="true">
            <span>{first}</span>
            <span>
              <i className="dot is-startup" /> Startup <i className="dot is-enterprise" /> Enterprise
            </span>
            <span>Now</span>
          </div>
          <ol className="jobs">
            {jobs.map((job, i) => (
              <li key={i} className="job">
                <div className="job-line">
                  <strong>{job.title}</strong>
                  <span className="muted">
                    {job.start_year}–{job.end_year ?? "now"}
                  </span>
                </div>
                <div className="muted">
                  <span className={wantedCompanies.includes(job.company) ? "mk" : undefined}>{job.company}</span>
                  {" · "}
                  <span className={wantedTypes.includes(job.company_type) ? "mk" : undefined}>
                    {job.company_type === "startup" ? "Startup" : "Enterprise"}
                  </span>
                </div>
                {job.description && <p>{job.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {person.education.length > 0 && (
        <section className="profile-section">
          <h3>Education</h3>
          <ul className="jobs">
            {person.education.map((school, i) => (
              <li key={i} className="job">
                <div className="job-line">
                  <strong className={wantedSchools.includes(school.school) ? "mk" : undefined}>{school.school}</strong>
                  {school.graduation_year && <span className="muted">{school.graduation_year}</span>}
                </div>
                <div className="muted">
                  <span className={wantedDegrees.includes(school.degree) ? "mk" : undefined}>{school.degree}</span>,{" "}
                  <span className={wantedFields.includes(school.field) ? "mk" : undefined}>{school.field}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="profile-section">
        <h3>Skills</h3>
        <div className="result-skills">
          {[...person.skills]
            .sort((a, b) => Number(wantedSkills.includes(b)) - Number(wantedSkills.includes(a)))
            .map((skill) => (
              <span key={skill} className={wantedSkills.includes(skill) ? "skill mk" : "skill"}>
                {skill}
              </span>
            ))}
        </div>
      </section>
    </div>
  );
}