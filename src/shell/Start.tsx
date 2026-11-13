/**
 * Startbildschirm: Auswahl des Bereichs. Die Bereiche stehen als Register untereinander,
 * je Zeile Symbol, Name, Beschreibung und Stand. Gestaltung in ./start.css.
 */
import { Icon } from '../shared/icons';
import { KaPlanLogo, MailaenderLogo } from '../shared/logos';
import { BEREICHE } from './bereiche';
import { zumBereich } from './router';
import './start.css';

export function Start() {
  return (
    <div className="start">
      <header className="start-kopf start-rahmen">
        <h1 className="start-marke">
          <KaPlanLogo variante="Startseite" width="100%" />
        </h1>
        <div className="start-logo">
          <MailaenderLogo height={34} />
        </div>
      </header>

      <main className="start-haupt start-rahmen">
        <h2 className="start-titel" id="start-titel">
          Bitte einen Bereich wählen.
        </h2>

        <ol className="start-register" aria-labelledby="start-titel">
          {BEREICHE.map((b) => (
            <li key={b.id}>
              <button type="button" className="bereich-zeile" onClick={() => zumBereich(b.id)}>
                <span className="bereich-zeile-symbol">
                  <Icon name={b.icon} size={40} strokeWidth={1.4} />
                </span>
                <span className="bereich-zeile-kopf">
                  <strong className="bereich-zeile-titel">{b.titel}</strong>
                  {b.untertitel ? <span className="bereich-zeile-sub">{b.untertitel}</span> : null}
                </span>
                <span className="bereich-zeile-text">{b.beschreibung}</span>
                <span className="bereich-zeile-stand">{b.marke ?? ''}</span>
                <span className="bereich-zeile-pfeil">
                  <Icon name="chevron" size={20} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </main>

      <footer className="start-fuss start-rahmen">
        <p>
          Die Bereiche arbeiten unabhängig voneinander, jeder mit eigenem Datenbestand und eigenen
          Einstellungen. Daten werden lokal im Browser gespeichert.
        </p>
      </footer>
    </div>
  );
}
