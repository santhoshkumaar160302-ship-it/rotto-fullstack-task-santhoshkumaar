"use client";
// Your shortlists and the ones colleagues shared with you, used by every
// screen, so a bookmark filled in on the results also shows as filled in on
// the profile and the Shortlists page. Also keeps the invites waiting for you
// (the number on the Shortlists tab), checked when you come back to the tab
// and every 30 seconds.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { useSession } from "./use-session";

export type Shortlist = {
  id: string;
  name: string;
  created_at: string;
  candidate_ids: string[];
  owned: boolean; // false = a colleague shared it with you (view only)
  shared_by: string | null; // the colleague's email, for shared lists
  share_id: string | null; // lets you leave a shared list
};

// A shortlist a colleague sent you.
export type Invite = {
  share_id: string;
  shortlist_id: string;
  name: string;
  from_email: string;
  people: number;
  status: "pending" | "accepted";
  created_at: string;
};

type Store = {
  lists: Shortlist[] | null; // null while loading
  refresh: () => void;
  create: (name: string) => Promise<Shortlist>;
  add: (listId: string, personId: string) => Promise<void>;
  remove: (listId: string, personId: string) => Promise<void>;
  rename: (listId: string, name: string) => Promise<void>;
  removeList: (listId: string) => Promise<void>;
  invites: Invite[]; // waiting for your answer
  respond: (shareId: string, accept: boolean) => Promise<void>;
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

  const [invites, setInvites] = useState<Invite[]>([]);
  const refreshInvites = useCallback(() => {
    api<Invite[]>("/api/shares")
      .then((all) => setInvites(all.filter((i) => i.status === "pending")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh();
    refreshInvites();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshInvites();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [session, refresh, refreshInvites]);

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
      const list: Shortlist = {
        id: made.id,
        name: made.name,
        created_at: new Date().toISOString(),
        candidate_ids: [],
        owned: true,
        shared_by: null,
        share_id: null,
      };
      setLists((now) => [list, ...(now ?? [])]);
      return list;
    },
    add: (listId, personId) => change(listId, personId, true),
    remove: (listId, personId) => change(listId, personId, false),
    rename: async (listId, name) => {
      await api(`/api/shortlists/${listId}`, { method: "PATCH", body: { name } });
      setLists((now) => (now ?? []).map((l) => (l.id === listId ? { ...l, name } : l)));
    },
    removeList: async (listId) => {
      await api(`/api/shortlists/${listId}`, { method: "DELETE" });
      setLists((now) => (now ?? []).filter((l) => l.id !== listId));
    },
    invites,
    // Accepting adds the list to yours; declining (or leaving) takes it away.
    respond: async (shareId, accept) => {
      await api(`/api/shares/${shareId}`, { method: "POST", body: { accept } });
      setInvites((now) => now.filter((i) => i.share_id !== shareId));
      if (!accept) setLists((now) => (now ?? []).filter((l) => l.share_id !== shareId));
      refresh();
    },
  };

  return <ShortlistContext.Provider value={store}>{children}</ShortlistContext.Provider>;
}

export function useShortlists(): Store {
  const store = useContext(ShortlistContext);
  if (!store) throw new Error("useShortlists must be used inside ShortlistProvider");
  return store;
}
