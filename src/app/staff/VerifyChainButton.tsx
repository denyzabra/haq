"use client";

import { useActionState } from "react";
import { verifyLedgerChain, type VerifyState } from "./actions";
import styles from "./staff.module.css";

export default function VerifyChainButton() {
  const [state, action, pending] = useActionState<VerifyState>(verifyLedgerChain, { status: "idle" });
  return (
    <form action={action} className={styles.verify}>
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Verifying" : "Verify chain"}
      </button>
      <p role="status" aria-live="polite" className={styles.verifyResult}>
        {state.status === "ok" && `Chain verified: all ${state.length} entries are intact.`}
        {state.status === "broken" &&
          `Chain broken at entry ${state.brokenIndex} of ${state.length}. Entries from this point cannot be trusted.`}
        {state.status === "error" && state.message}
      </p>
    </form>
  );
}
