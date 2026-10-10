"use client";
// Every signed-in screen sits inside this frame. Signed-out visitors are sent to /login.
// The page always renders (screens wait for the session before loading any data),
// so Next.js can check that moving between screens is instant.
import type { ReactNode } from "react";
import { SessionContext, useRequireSession } from "@/lib/use-session";
import { PlanProvider } from "@/lib/plan";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  const session = useRequireSession();
  return (
    <SessionContext.Provider value={session}>
      <PlanProvider>
        <AppShell>{children}</AppShell>
      </PlanProvider>
    </SessionContext.Provider>
  );
}