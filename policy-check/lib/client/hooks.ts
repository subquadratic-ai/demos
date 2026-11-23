"use client";

import { useEffect } from "react";
import { api } from "./api";
import { useStore } from "./store";

/** Uploaded rulebooks live in server memory; ask the server to drop them when the tab goes away. */
export function useUploadCleanup(): void {
  useEffect(() => {
    const cleanup = () => {
      for (const id of useStore.getState().uploadedIds) void api.deleteRulebook(id);
    };
    window.addEventListener("pagehide", cleanup);
    return () => window.removeEventListener("pagehide", cleanup);
  }, []);
}
