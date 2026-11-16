"use client";
// How many saved searches the company has, for the number on the "Saved" tab.
// Loaded once after sign-in; saving or deleting a search updates it at once,
// so the recruiter sees their save land.
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

let count: number | null = null;
let loading = false;
const listeners = new Set<() => void>();

function set(next: number | null) {
  count = next;
  listeners.forEach((listener) => listener());
}

export function setSavedCount(next: number) {
  set(Math.max(0, next));
}

export function changeSavedCount(by: number) {
  if (count !== null) set(Math.max(0, count + by));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSavedCount(signedIn: boolean): number | null {
  const value = useSyncExternalStore(subscribe, () => count, () => null);
  useEffect(() => {
    if (!signedIn || count !== null || loading) return;
    loading = true;
    api<unknown[]>("/api/saved-briefs")
      .then((rows) => set(rows.length))
      .catch(() => {}) // the tab just shows no number
      .finally(() => {
        loading = false;
      });
  }, [signedIn]);
  return value;
}
