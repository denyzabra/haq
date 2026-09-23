import { readLedger, verifyChain } from "@/lib/ledger";
import { getStore } from "@/lib/store";

// Recomputes the audit ledger hash chain. Returns ok or the first broken index.
export async function GET() {
  const records = await readLedger(getStore());
  return Response.json(verifyChain(records));
}
