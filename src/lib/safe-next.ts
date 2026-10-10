// Where to go after signing in. Only paths inside this app are allowed, so a
// link like /login?next=https://evil.example can't send anyone to another site.
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) {
    return "/";
  }
  return next;
}