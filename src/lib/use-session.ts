"use client";
// Keeps screens behind sign-in: sends signed-out visitors to /login (and back to
// the page they asked for once they sign in), and shares
// who is signed in with every screen through useSession().
import { createContext, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/browser";

export type SessionInfo = { email: string; company: string };

export function useRequireSession(): SessionInfo | null {
  const [info, setInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const apply = (email: string | undefined, arriving: boolean) => {
      if (!email) {
        // Someone who opened a link while signed out comes back to it after
        // signing in. After a sign-out they start fresh at the search page.
        // A full page load (not an in-app move) wipes everything the previous
        // account had loaded, so the next person to sign in starts clean.
        const here = window.location.pathname + window.location.search;
        window.location.replace(arriving && here !== "/" ? `/login?next=${encodeURIComponent(here)}` : "/login");
        return;
      }
      // recruiter@acme.test -> "Acme"
      const domain = email.split("@")[1]?.split(".")[0] ?? "";
      setInfo({ email, company: domain.charAt(0).toUpperCase() + domain.slice(1) });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.email, true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => apply(session?.user.email, event === "INITIAL_SESSION"));
    return () => sub.subscription.unsubscribe();
  }, []);

  return info;
}

// Null until the session is known. Screens wait for it before loading data.
export const SessionContext = createContext<SessionInfo | null>(null);
export const useSession = () => useContext(SessionContext);