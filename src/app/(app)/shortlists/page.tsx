// Shortlists. Suspense is needed because the screen reads the address (?list=…).
import { Suspense } from "react";
import { ShortlistsScreen } from "@/components/shortlists-screen";

export default function ShortlistsPage() {
  return (
    <Suspense>
      <ShortlistsScreen />
    </Suspense>
  );
}