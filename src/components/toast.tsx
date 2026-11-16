"use client";
// A short message at the bottom of the screen that confirms something
// happened ("Search saved"), with an optional link. It goes away by itself.
import { useEffect, type ReactNode } from "react";

export function Toast({ children, onClose, ms = 6000 }: { children: ReactNode; onClose: () => void; ms?: number }) {
  useEffect(() => {
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [onClose, ms]);

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-body">{children}</span>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
