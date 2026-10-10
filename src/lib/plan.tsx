"use client";
// The company's plan, shared by every screen. Screens call refresh() after a
// search, and it refreshes itself when you come back to the tab, so an upgrade
// (which arrives through the Stripe webhook) shows up without a reload.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { useSession } from "./use-session";

export type Plan = { plan: "free" | "paid"; searches_remaining: number | null };

const PlanContext = createContext<{ plan: Plan | null; refresh: () => void }>({ plan: null, refresh: () => {} });

export function PlanProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [plan, setPlan] = useState<Plan | null>(null);

  const refresh = useCallback(() => {
    api<Plan>("/api/plan")
      .then(setPlan)
      .catch(() => {}); // the badge just stays as it was
  }, []);

  useEffect(() => {
    if (!session) return; // wait until we know who is signed in
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, session]);

  return <PlanContext.Provider value={{ plan, refresh }}>{children}</PlanContext.Provider>;
}

export const usePlan = () => useContext(PlanContext);