// Turns a shortlist into a CSV file and downloads it. Runs in the browser on
// data the page already has, so nothing new is asked of the server.
import type { CandidateSummary } from "@/lib/search/candidates";

const COLUMNS: [string, (p: CandidateSummary) => string | number | boolean | null][] = [
  ["Name", (p) => p.full_name],
  ["Current title", (p) => p.current_title ?? p.role],
  ["Current company", (p) => p.current_company],
  ["Role", (p) => p.role],
  ["Seniority", (p) => p.seniority.charAt(0).toUpperCase() + p.seniority.slice(1)],
  ["Years of experience", (p) => p.years_experience],
  ["City", (p) => p.city],
  ["State", (p) => p.state],
  ["Open to work", (p) => (p.open_to_work ? "Yes" : "No")],
  ["Skills", (p) => p.skills.join(", ")],
];

// Quotes a value for CSV. A cell that starts with = + - @ (or a tab or return)
// gets a leading apostrophe, so a spreadsheet shows it as text and never runs
// it as a formula.
function cell(value: string | number | boolean | null): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function shortlistCsv(people: CandidateSummary[]): string {
  const rows = [COLUMNS.map(([title]) => title), ...people.map((p) => COLUMNS.map(([, get]) => get(p)))];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadShortlist(listName: string, people: CandidateSummary[]) {
  // The byte order mark tells Excel the file is UTF-8, so accented names show correctly.
  const blob = new Blob(["﻿", shortlistCsv(people)], { type: "text/csv;charset=utf-8" });
  const slug = listName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shortlist";
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug}-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}