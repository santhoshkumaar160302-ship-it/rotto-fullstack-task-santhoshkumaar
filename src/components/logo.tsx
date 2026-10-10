// The highlighter mark: a yellow stroke over a line of text.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="10.5" width="26" height="12" rx="4" fill="var(--hl)" transform="rotate(-7 16 16.5)" />
      <rect x="7.5" y="15" width="17" height="3.2" rx="1.6" fill="currentColor" />
    </svg>
  );
}