// Calls our API from the browser with the signed-in recruiter's token.
// Every screen uses this, so errors are handled the same way everywhere.
import { supabaseBrowser } from "./supabase/browser";

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "Your session ended. Sign in again.");

  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "We couldn't reach the server. Check your connection and try again.");
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : "Something went wrong. Please try again.";
    throw new ApiError(res.status, message, json);
  }
  return json as T;
}