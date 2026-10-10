"use client";
// Light or dark. The choice is saved in this browser, and the script in
// layout.tsx applies it before the page appears on the next visit.
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const isDark = () => document.documentElement.classList.contains("dark");

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private windows can block storage; the switch still works for this visit.
    }
  }
  return { dark, toggle };
}