import VoiceDemo from "./components/VoiceDemo";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <div className={styles.banner} role="note">
        <div className={styles.inner}>
          <strong>AI information line, not legal advice.</strong> HAQ gives information only. It does not file anything.
          Filing, disputes and distress go to a person.
        </div>
      </div>

      <header className={styles.header}>
        <div className={styles.inner}>
          <p className={styles.kicker}>Demo</p>
          <h1 className={styles.title}>HAQ: Dubai rent increase information line</h1>
          <p className={styles.lead}>
            HAQ checks a rent increase at renewal against Decree 43 of 2013 and explains the result, citing the clause, in
            English or Arabic.
          </p>
          <p className={styles.demoLabel}>
            Index figures in this demo are a <strong>demo sample, not official</strong>.
          </p>
        </div>
      </header>

      <main className={styles.inner}>
        <VoiceDemo />
      </main>

      <footer className={styles.footer}>
        <div className={styles.inner}>
          <p>
            This demo runs in the browser. Here, a request for a person creates a callback in the human queue. Live transfer
            to a phone line is planned for the telephony pilot and is not part of this demo.
          </p>
          <p>A record of each session, including a summary and consent answers, is kept in a hash chained audit ledger. Do not share passwords, Emirates ID numbers, UAE PASS codes or bank details.</p>
        </div>
      </footer>
    </>
  );
}
