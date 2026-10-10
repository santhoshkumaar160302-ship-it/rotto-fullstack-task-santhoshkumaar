"use client";
// The company's shortlists, shared by every screen, so a bookmark filled in on
// the results also shows as filled in the profile and on the Shortlists page.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { useSession } from "./use-session";

export type Shortlist = { id: string; name: string; created_at: string; candidate_ids: string[] };

type Store = {
  lists: Shortlist[] | null; // null while loading
  refresh: () => void;
  create: (name: string) => Promise<Shortlist>;
  add: (listId: string, personId: string) => Promise<void>;
  remove: (listId: string, personId: string) => Promise<void>;
};

const ShortlistContext = createContext<Store | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [lists, setLists] = useState<Shortlist[] | null>(null);

  const refresh = useCallback(() => {
    api<Shortlist[]>("/api/shortlists")
      .then(setLists)
      .catch(() => setLists((now) => now ?? []));
  }, []);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  // Each change updates the screen at once, then asks the server; if the server
  // says no, the list is reloaded so the screen never shows something untrue.
  const change = (listId: string, personId: string, adding: boolean) => {
    setLists((now) =>
      (now ?? []).map((l) =>
        l.id !== listId
          ? l
          : { ...l, candidate_ids: adding ? [...new Set([personId, ...l.candidate_ids])] : l.candidate_ids.filter((id) => id !== personId) },
      ),
    );
    return api(`/api/shortlists/${listId}/people/${personId}`, { method: adding ? "POST" : "DELETE" })
      .then(() => undefined)
      .catch((error: unknown) => {
        refresh();
        throw error;
      });
  };

  const store: Store = {
    lists,
    refresh,
    create: async (name) => {
      const made = await api<{ id: string; name: string }>("/api/shortlists", { method: "POST", body: { name } });
      const list: Shortlist = { id: made.id, name: made.name, created_at: new Date().toISOString(), candidate_ids: [] };
      setLists((now) => [list, ...(now ?? [])]);
      return list;
    },
    add: (listId, personId) => change(listId, personId, true),
    remove: (listId, personId) => change(listId, personId, false),
  };

  return <ShortlistContext.Provider value={store}>{children}</ShortlistContext.Provider>;
}

export function useShortlists(): Store {
  const store = useContext(ShortlistContext);
  if (!store) throw new Error("useShortlists must be used inside ShortlistProvider");
  return store;
}