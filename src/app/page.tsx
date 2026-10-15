import { DEMO_EXAMPLE, demoBuildings } from "@/lib/demo-buildings";
import VoiceDemo from "./components/VoiceDemo";
import styles from "./page.module.css";

// The name a caller says, DLD's official name when it differs, and DLD's Arabic name.
function Name({ spoken, dld, ar }: { spoken: string; dld: string; ar: string | null }) {
  return (
    <>
      <span className={styles.spoken}>{spoken}</span>
      {dld !== spoken && <span className={styles.dld}>DLD: {dld}</span>}
      {ar ? (
        <span className={styles.arabic} lang="ar" dir="rtl">
          {ar}
        </span>
      ) : (
        <span className={styles.dld}>No Arabic name from DLD</span>
      )}
    </>
  );
}

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
            Index figures are copied from the <strong>DLD Rental Index</strong> for a few buildings only (retrieved 14
            October 2026). The official result is on the DLD Rental Index calculator.
          </p>

          <section className={styles.tryBox} aria-labelledby="try-buildings-heading">
            <h2 id="try-buildings-heading" className={styles.tryHeading}>
              Try it with these buildings
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.tryTable}>
                <thead>
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col">Building</th>
                    <th scope="col">Bedrooms</th>
                  </tr>
                </thead>
                <tbody>
                  {demoBuildings().map((b) => (
                    <tr key={`${b.buildingDld} ${b.bedroomsDld}`}>
                      <td data-label="Area">
                        <Name spoken={b.area} dld={b.areaDld} ar={b.areaAr} />
                      </td>
                      <td data-label="Building">
                        <Name spoken={b.building} dld={b.buildingDld} ar={b.buildingAr} />
                      </td>
                      <td data-label="Bedrooms">
                        <Name spoken={b.bedrooms} dld={b.bedroomsDld} ar={b.bedroomsAr} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.tryExample}>
              Example: <q>{DEMO_EXAMPLE}</q>
            </p>
            <p className={styles.tryNote}>
              Any other building: HAQ says it cannot verify and points you to the DLD calculator. That is by design.
            </p>
          </section>
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
