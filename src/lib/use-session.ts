"use client";
// Keeps a screen behind sign-in: sends signed-out visitors to /login.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "./supabase/browser";

export type SessionInfo = { email: string; company: string };

export function useRequireSession(): SessionInfo | null {
  const router = useRouter();
  const [info, setInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const apply = (email: string | undefined) => {
      if (!email) {
        router.replace("/login");
        return;
      }
      // recruiter@acme.test -> "Acme"
      const domain = email.split("@")[1]?.split(".")[0] ?? "";
      setInfo({ email, company: domain.charAt(0).toUpperCase() + domain.slice(1) });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.email));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.email));
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return info;
}