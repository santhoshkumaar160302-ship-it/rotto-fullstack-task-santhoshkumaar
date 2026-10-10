"use client";
// TEMPORARY: proves sign-in works. Replaced by the search screen next.
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRequireSession } from "@/lib/use-session";

export default function Home() {
  const router = useRouter();
  const session = useRequireSession();
  if (!session) return null;

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ padding: 48, display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <h1 className="display" style={{ margin: 0, fontSize: 34 }}>Signed in as {session.email}</h1>
      <p className="muted" style={{ margin: 0 }}>Company: {session.company}</p>
      <button className="btn-quiet" onClick={signOut}>Sign out</button>
    </main>
  );
}