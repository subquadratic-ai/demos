import { Demo } from "@/components/Demo";
import { loadDemo } from "@/lib/server/demo";

// Config and use case data are read per request: edit .env.local, restart, and the page follows.
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadDemo();
  return <Demo {...data} />;
}
