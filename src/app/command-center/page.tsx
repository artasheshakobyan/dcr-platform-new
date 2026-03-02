import { Suspense } from "react";
import CommandCenterDashboard from "./CommandCenterDashboard";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <CommandCenterDashboard />
    </Suspense>
  );
}