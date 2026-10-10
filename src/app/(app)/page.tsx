// The search screen. Suspense is needed because the screen reads the address (?s=…).
import { Suspense } from "react";
import { SearchScreen } from "@/components/search/search-screen";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}