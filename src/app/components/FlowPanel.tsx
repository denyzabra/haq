import Link from "next/link";
import { FLOWS } from "./flows";
import styles from "./FlowPanel.module.css";

export type PostCallState = "idle" | "waiting" | "recorded" | "missing";

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function FlowPanel({
  lit,
  phase,
  postCall,
}: {
  lit: Record<number, string>;
  phase: string;
  postCall: PostCallState;
}) {
  const count = Object.keys(lit).length;
  return (
    <div className={styles.panel}>
      <h2 id="flows-heading">Live flows</h2>
      <p className={styles.help}>
        A flow lights up only when it really happens in your session. Nothing here is simulated.
      </p>
      <p className="visually-hidden" aria-live="polite">
        {count === 0 ? "No flows yet." : `${count} of 9 flows have happened.`}
      </p>
      <ol className={styles.list}>
        {FLOWS.map((f) => {
          const at = lit[f.n];
          return (
            <li key={f.n} className={at ? styles.itemLit : styles.item}>
              <span className={at ? styles.badgeLit : styles.badge} aria-hidden="true">
                {f.n}
              </span>
              <span className={styles.body}>
                <span className={styles.title}>
                  <span className="visually-hidden">Flow {f.n}: </span>
                  {f.title}
                </span>
                <span className={styles.path}>{f.path}</span>
                <span className={styles.evidence}>{f.evidence}</span>
                <span className={at ? styles.stateLit : styles.state}>
                  {at ? `Happened at ${timeOf(at)}` : "Not yet"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {phase === "ended" && postCall !== "idle" && (
        <p
          className={postCall === "missing" ? styles.postCallMissing : postCall === "recorded" ? styles.postCallDone : styles.postCallWaiting}
          role="status"
          aria-live="polite"
        >
          {postCall === "waiting" && "Waiting for post-call record (flow 9)"}
          {postCall === "recorded" && "Ledger entry recorded"}
          {postCall === "missing" && (
            <>
              Not received yet, check <Link href="/staff">/staff</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
