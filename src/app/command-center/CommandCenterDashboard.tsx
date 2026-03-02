"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getISOWeek } from "date-fns";

const CURRENT_WEEK = getISOWeek(new Date());

function clampWeek(w: number) {
  return Math.max(1, Math.min(52, w));
}

function parseWeekParam(value: string | null) {
  const n = Number(value);
  if (!value || !Number.isFinite(n)) return CURRENT_WEEK;
  return clampWeek(Math.trunc(n));
}

export default function CommandCenterClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlWeek = useMemo(() => parseWeekParam(searchParams.get("week")), [searchParams]);
  const [selectedWeek, setSelectedWeek] = useState(urlWeek);

  // sync state with URL changes
  useEffect(() => {
    setSelectedWeek(urlWeek);
  }, [urlWeek]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Command Center</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button
          onClick={() => {
            const w = clampWeek(selectedWeek - 1);
            setSelectedWeek(w);
            router.replace(`/command-center?week=${w}`);
          }}
        >
          Prev
        </button>

        <div>
          Selected week: <b>{selectedWeek}</b>
        </div>

        <button
          onClick={() => {
            const w = clampWeek(selectedWeek + 1);
            setSelectedWeek(w);
            router.replace(`/command-center?week=${w}`);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}