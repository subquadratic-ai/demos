"use client";

import { MotionConfig } from "framer-motion";
import { useUploadCleanup } from "@/lib/client/hooks";
import { hydrate } from "@/lib/client/store";
import type { DemoData } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { Stage } from "./stage/Stage";

/** The whole demo: the question and the policy's weight on the left, the check on the right. */
export function Demo(data: DemoData) {
  // Seed before the first render so the page is complete on first paint; a no-op after the first call.
  hydrate(data);
  useUploadCleanup();

  return (
    <MotionConfig reducedMotion="user">
      {/* On a desktop the page is one screen, and the question and the policy's weight sit level with the check beside them. */}
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:grid lg:h-dvh lg:grid-cols-[340px_minmax(0,720px)] lg:items-center lg:justify-between lg:gap-16 lg:overflow-hidden">
        <Sidebar />
        <Stage />
      </main>
    </MotionConfig>
  );
}
