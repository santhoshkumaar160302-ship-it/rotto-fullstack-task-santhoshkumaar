// Every API error has the same shape: { "error": "message", ...extra }.
export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANDIDATE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Malformed ids can never match a row, so routes answer 404 without querying.
export const isUuid = (value: string) => UUID.test(value);
export const isCandidateId = (value: string) => CANDIDATE_ID.test(value);