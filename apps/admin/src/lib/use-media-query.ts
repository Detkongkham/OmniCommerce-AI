"use client";

import { useEffect, useState } from "react";

/** SSR-safe: ຄ່າເລີ່ມຕົ້ນ false ຈົນກວ່າ mount ແລ້ວ; ບໍ່ມີ matchMedia (jsdom) = false */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}
