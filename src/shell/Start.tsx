/**
 * Startbildschirm: Auswahl des Bereichs. Vor einem weichgezeichneten Hintergrundbild
 * stehen die Bereiche als Glaskarten nebeneinander (schmal untereinander), je Karte
 * Symbol, Name, Untertitel, Beschreibung und Stand. Gestaltung in ./start.css.
 *
 * Die Zeigerposition wird ohne neues Rendern als CSS-Variable gesetzt: auf der Seite
 * (--px/--py, Lichtfleck und Bewegung des Hintergrunds) und auf der Karte unter dem
 * Zeiger (--mx/--my für den Glanz, --rx/--ry für die Neigung).
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../shared/icons';
import { KaPlanLogo, MailaenderLogo } from '../shared/logos';
import { BEREICHE } from './bereiche';
import { zumBereich } from './router';
import './start.css';

function seiteVerfolgen(e: ReactPointerEvent<HTMLDivElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  el.style.setProperty('--px', (e.clientX / window.innerWidth).toFixed(3));
  el.style.setProperty('--py', (e.clientY / window.innerHeight).toFixed(3));
}

function karteVerfolgen(e: ReactPointerEvent<HTMLButtonElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  el.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
}

function karteVerlassen(e: ReactPointerEvent<HTMLButtonElement>) {
  const el = e.currentTarget;
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
}

export function Start() {
  return (
    <div className="start" onPointerMove={seiteVerfolgen}>
      <div className="start-bild" aria-hidden="true">
        <div className="start-bild-flaeche" />
        <div className="start-bild-licht" />
        <div className="start-bild-korn" />
      </div>

      <header className="start-kopf start-rahmen">
        <div className="start-kopf-glas glas">
          <h1 className="start-marke">
            <KaPlanLogo variante="Startseite" width="100%" />
          </h1>
          <div className="start-logo">
            <MailaenderLogo height={30} />
          </div>
        </div>
      </header>

      <main className="start-haupt start-rahmen">
        <p className="start-zeile">Bereichsauswahl</p>
        <h2 className="start-titel" id="start-titel">
          Bitte einen Bereich wählen.
        </h2>

        <ol className="start-register" aria-labelledby="start-titel">
          {BEREICHE.map((b, i) => (
            <li key={b.id} style={{ ['--i' as string]: i }}>
              <button
                type="button"
                className={`bereich-karte glas bereich-karte--${b.id}`}
                onClick={() => zumBereich(b.id)}
                onPointerMove={karteVerfolgen}
                onPointerLeave={karteVerlassen}
              >
                <span className="bereich-karte-glanz" aria-hidden="true" />
                <span className="bereich-karte-oben">
                  <span className="bereich-karte-symbol">
                    <Icon name={b.icon} size={30} strokeWidth={1.6} />
                  </span>
                  {b.marke ? <span className="bereich-karte-stand">{b.marke}</span> : null}
                </span>
                <span className="bereich-karte-kopf">
                  <strong className="bereich-karte-titel">{b.titel}</strong>
                  {b.untertitel ? <span className="bereich-karte-sub">{b.untertitel}</span> : null}
                </span>
                <span className="bereich-karte-text">{b.beschreibung}</span>
                <span className="bereich-karte-los">
                  Öffnen
                  <span className="bereich-karte-pfeil">
                    <Icon name="chevron" size={16} strokeWidth={2.2} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </main>

      <footer className="start-fuss start-rahmen">
        <p className="glas">
          Die Bereiche arbeiten unabhängig voneinander, jeder mit eigenem Datenbestand und eigenen
          Einstellungen. Daten werden lokal im Browser gespeichert.
        </p>
      </footer>
    </div>
  );
}
