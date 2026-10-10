"use client";
// The light/dark switch for screens outside the app frame (the sign-in page).
// Same behaviour as the sidebar's switch: it uses the same saved choice.
import { useTheme } from "@/lib/use-theme";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}