import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { readLedger, type LedgerRecord } from "@/lib/ledger";
import { isValidStaffSession, STAFF_COOKIE } from "@/lib/staff-auth";
import { getStore, KEYS } from "@/lib/store";
import { logout } from "./actions";
import LoginForm from "./LoginForm";
import styles from "./staff.module.css";
import VerifyChainButton from "./VerifyChainButton";

export const metadata: Metadata = {
  title: "HAQ staff",
  robots: { index: false, follow: false },
};

type Json = Record<string, unknown>;

function parseList(raw: string[]): Json[] {
  return raw
    .map((item) => {
      try {
        return JSON.parse(item) as Json;
      } catch {
        return null;
      }
    })
    .filter((x): x is Json => x !== null)
    .reverse();
}

const text = (v: unknown) => (v === null || v === undefined || v === "" ? "Not given" : String(v));
const when = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? text(v) : d.toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) + " (Dubai)";
};

export default async function StaffPage() {
  const authed = isValidStaffSession((await cookies()).get(STAFF_COOKIE)?.value);

  if (!authed) {
    return (
      <main className={styles.page}>
        <h1>HAQ staff</h1>
        <p className={styles.muted}>Sign in to see the human queue, drafts and the audit ledger.</p>
        <LoginForm />
        <p>
          <Link href="/">Back to the demo</Link>
        </p>
      </main>
    );
  }

  const store = getStore();
  const [handovers, drafts, ledger] = await Promise.all([
    store.lrange(KEYS.handovers, -50, -1).then(parseList),
    store.lrange(KEYS.drafts, -50, -1).then(parseList),
    readLedger(store, -20, -1).then((r) => [...r].reverse()),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>HAQ staff</h1>
        <form action={logout}>
          <button type="submit" className={styles.linkButton}>
            Sign out
          </button>
        </form>
      </div>

      <section aria-labelledby="queue-heading" className={styles.section}>
        <h2 id="queue-heading">Human queue ({handovers.length})</h2>
        {handovers.length === 0 ? (
          <p className={styles.muted}>No handover requests yet.</p>
        ) : (
          <ul className={styles.cards}>
            {handovers.map((h) => (
              <li key={text(h.reference)} className={styles.card}>
                <p className={styles.cardTitle}>
                  {text(h.reference)} <span className={styles.tag}>{text(h.status)}</span>
                </p>
                <dl className={styles.fields}>
                  <dt>Received</dt>
                  <dd>{when(h.created_at)}</dd>
                  <dt>Reason</dt>
                  <dd>{text(h.reason)}</dd>
                  <dt>Summary</dt>
                  <dd dir="auto">{text(h.summary)}</dd>
                  <dt>Language</dt>
                  <dd>{text(h.language)}</dd>
                  <dt>Callback consent</dt>
                  <dd>{text(h.callback_consent)}</dd>
                  <dt>Conversation</dt>
                  <dd className={styles.mono}>{text(h.conversation_id)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="drafts-heading" className={styles.section}>
        <h2 id="drafts-heading">Drafts ({drafts.length})</h2>
        <p className={styles.muted}>Drafts are saved for the caller only. HAQ never sends or files them.</p>
        {drafts.length === 0 ? (
          <p className={styles.muted}>No drafts yet.</p>
        ) : (
          <ul className={styles.cards}>
            {drafts.map((d) => (
              <li key={text(d.case_reference)} className={styles.card}>
                <p className={styles.cardTitle}>{text(d.case_reference)}</p>
                <dl className={styles.fields}>
                  <dt>Created</dt>
                  <dd>{when(d.created_at)}</dd>
                  <dt>Conversation</dt>
                  <dd className={styles.mono}>{text(d.conversation_id)}</dd>
                </dl>
                <pre className={styles.summary} dir="auto">
                  {text(d.summary)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ledger-heading" className={styles.section}>
        <h2 id="ledger-heading">Audit ledger: last 20 entries</h2>
        <VerifyChainButton />
        {ledger.length === 0 ? (
          <p className={styles.muted}>No ledger entries yet.</p>
        ) : (
          <ul className={styles.cards}>
            {ledger.map((r: LedgerRecord) => {
              const e = (r.entry ?? {}) as Json;
              const consent = (e.consent ?? {}) as Json;
              const evals = (e.evaluation_results ?? {}) as Record<string, Json>;
              return (
                <li key={r.hash} className={styles.card}>
                  <p className={styles.cardTitle}>
                    Entry {r.index} <span className={styles.mono}>hash {r.hash.slice(0, 12)}</span>
                  </p>
                  <dl className={styles.fields}>
                    <dt>Received</dt>
                    <dd>{when(e.received_at)}</dd>
                    <dt>Conversation</dt>
                    <dd className={styles.mono}>{text(e.conversation_id)}</dd>
                    <dt>Summary</dt>
                    <dd dir="auto">{text(e.transcript_summary)}</dd>
                    <dt>Call successful</dt>
                    <dd>{text(e.call_successful)}</dd>
                    <dt>Consent</dt>
                    <dd>
                      callback {text(consent.callback_consent)}, opted out {text(consent.opted_out)}, escalated{" "}
                      {text(consent.escalated)}
                      {consent.escalation_reason ? ` (${text(consent.escalation_reason)})` : ""}
                    </dd>
                    <dt>Evaluation</dt>
                    <dd>
                      {Object.keys(evals).length === 0
                        ? "Not given"
                        : Object.entries(evals)
                            .map(([k, v]) => `${k}: ${text(v?.result)}`)
                            .join(", ")}
                    </dd>
                    <dt>Tool calls</dt>
                    <dd>
                      {Array.isArray(e.tool_calls) && e.tool_calls.length > 0
                        ? (e.tool_calls as Json[]).map((t) => text(t.tool_name)).join(", ")
                        : "None"}
                    </dd>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
