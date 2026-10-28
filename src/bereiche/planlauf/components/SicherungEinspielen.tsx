/**
 * Einspielen einer Sicherung – das Gegenstück zur Schaltfläche „Sicherung“.
 *
 * Die gewählte JSON-Datei wird gelesen und wie beim Laden auf die aktuelle
 * Fassung gehoben (sicherungLesen in store/storage.ts). Der Abgleich übernimmt
 * ausschließlich ausgewählte Datensätze und fehlende Bezüge. „Angemeldet als“ bleibt
 * erhalten, sofern nicht ausdrücklich der Name aus der Sicherung gewählt wird.
 */
import { useRef, useState } from 'react';
import { type AppData } from '../domain/types';
import { exportiereDaten, sicherungLesen } from '../store/storage';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, Modal, Select } from '../../../shared/ui';
import { IMPORT_LABEL, sicherungsAbgleich, sicherungMischen } from '../domain/sicherungsAbgleich';
import { Icon } from '../../../shared/icons';

/** Gelesene Sicherung samt Dateiname. */
export interface Sicherung {
  datei: string;
  daten: AppData;
}

/**
 * Schaltfläche „Einspielen“ in der Seitenleiste: wählt die Datei und liest sie.
 * Die Rückfrage steht außerhalb der Seitenleiste (SicherungEinspielenDialog),
 * weil deren Hintergrundfilter fest positionierte Dialoge sonst einschließt.
 */
export function SicherungWaehlen({ onGelesen }: { onGelesen: (sicherung: Sicherung) => void }) {
  const toast = useToast();
  const eingabe = useRef<HTMLInputElement>(null);

  const lesen = async (datei: File) => {
    try {
      onGelesen({ datei: datei.name, daten: sicherungLesen(await datei.text()) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Die Sicherung konnte nicht gelesen werden.');
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => eingabe.current?.click()}
        title="Sicherung (JSON) vergleichen und selektiv importieren"
      >
        <Icon name="importieren" size={12} /> Einspielen
      </button>
      <input
        ref={eingabe}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const datei = e.target.files?.[0];
          // Dieselbe Datei soll sich erneut wählen lassen
          e.target.value = '';
          if (datei) void lesen(datei);
        }}
      />
    </>
  );
}

/** Rückfrage vor dem Einspielen – nennt den Inhalt der Sicherung und bietet an, vorher zu sichern. */
export function SicherungEinspielenDialog({
  sicherung,
  onClose,
  onEingespielt,
}: {
  sicherung: Sicherung;
  onClose: () => void;
  onEingespielt: () => void;
}) {
  const { data, ersetzeDaten } = useStore();
  const toast = useToast();
  const zeilen = sicherungsAbgleich(data, sicherung.daten);
  const [auswahl, setAuswahl] = useState<string[]>(() => zeilen.filter((z) => z.status === 'neu').map((z) => z.key));
  const [nameUebernehmen, setNameUebernehmen] = useState(false);
  const [filter, setFilter] = useState('alle');
  const [projektFilter, setProjektFilter] = useState('');
  const [details, setDetails] = useState<string | null>(null);
  let fehler = '';
  let vorschau: ReturnType<typeof sicherungMischen> | null = null;
  try { vorschau = sicherungMischen(data, sicherung.daten, auswahl); }
  catch (e) { fehler = e instanceof Error ? e.message : 'Abgleich nicht möglich.'; }
  const einspielen = () => {
    if (!vorschau) return;
    const neu = vorschau.daten;
    ersetzeDaten(nameUebernehmen ? { ...neu, bearbeiter: sicherung.daten.bearbeiter } : neu);
    toast(`${vorschau.uebernommen.length} Datensätze importiert. Nicht ausgewählte Bestandsdaten bleiben erhalten.`);
    onClose(); onEingespielt();
  };
  const sichtbar = zeilen.filter((z) => (filter === 'alle' || z.status === filter) && (!projektFilter || z.projectId === projektFilter));
  const [limit, setLimit] = useState(200);
  const einzel = zeilen.find((z) => z.key === details);
  const markiere = (keys: string[], wert: boolean) => setAuswahl((a) => wert ? [...new Set([...a, ...keys])] : a.filter((k) => !keys.includes(k)));
  return <Modal wide titel="Sicherung vergleichen und importieren" sub={sicherung.datei} onClose={onClose} footer={<>
    <button className="btn btn-outline" onClick={() => exportiereDaten(data)}>Aktuellen Stand sichern</button><span className="spacer" /><button className="btn" onClick={onClose}>Abbrechen</button>
    <button className="btn btn-primary" disabled={!vorschau || (!auswahl.length && !nameUebernehmen)} onClick={einspielen}>Auswahl importieren ({vorschau?.uebernommen.length ?? 0})</button>
  </>}>
    <div className="stack">
      <Callout>Der Abgleich verwendet die Kennungen aus der Sicherung. Neue Datensätze sind vorausgewählt; bei Konflikten bleibt zunächst der Bestand. Markieren Sie einen Konflikt nur, wenn Sie ausdrücklich den Importstand übernehmen möchten. Es wird nichts aus dem Bestand gelöscht.</Callout>
      <div className="row wrap"><span className="badge">{zeilen.filter((z) => z.status === 'neu').length} neu</span><span className="badge">{zeilen.filter((z) => z.status === 'konflikt').length} Konflikte</span><span className="badge">{zeilen.filter((z) => z.status === 'gleich').length} unverändert</span></div>
      <div className="row wrap"><Select value={filter} onChange={setFilter} options={[{ value: 'alle', label: 'Alle Einträge' }, { value: 'neu', label: 'Neue Einträge' }, { value: 'konflikt', label: 'Konflikte' }, { value: 'gleich', label: 'Unverändert' }]} /><Select value={projektFilter} onChange={setProjektFilter} options={[{ value: '', label: 'Alle Projekte / Stammdaten' }, ...sicherung.daten.projects.map((p) => ({ value: p.id, label: `${p.nummer} · ${p.name}` }))]} /></div>
      <div className="row wrap"><button className="btn btn-sm" onClick={() => markiere(sichtbar.filter((z) => z.status !== 'gleich').map((z) => z.key), true)}>Gefilterte Einträge auswählen</button><button className="btn btn-sm" onClick={() => markiere(sichtbar.map((z) => z.key), false)}>Gefilterte Auswahl aufheben</button></div>
      {fehler ? <Callout ton="warn" icon="!">{fehler}</Callout> : null}
      {vorschau?.automatisch.length ? <Callout>{vorschau.automatisch.length} fehlende Bezüge werden zusätzlich angelegt (z. B. Projekt, Planpaket oder Person). Diese Zeilen sind als „benötigt“ markiert; bestehende Bezüge werden nicht überschrieben.</Callout> : null}
      <div className="table-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}><table className="table"><thead><tr><th>Übernehmen</th><th>Art / Eintrag</th><th>Abgleich</th><th /></tr></thead><tbody>{sichtbar.slice(0, limit).map((z) => {
        const auto = vorschau?.automatisch.includes(z.key);
        return <tr key={z.key}><td><input aria-label={`Importieren: ${z.name}`} type="checkbox" checked={auswahl.includes(z.key) || Boolean(auto)} disabled={z.status === 'gleich' || auto} onChange={(e) => markiere([z.key], e.target.checked)} /></td><td><strong>{z.name}</strong><div className="small muted">{IMPORT_LABEL[z.liste]}</div></td><td>{auto ? 'Neu · benötigt' : z.status === 'neu' ? 'Neu' : z.status === 'gleich' ? 'Unverändert' : auswahl.includes(z.key) ? 'Konflikt → Importstand' : 'Konflikt → Bestand bleibt'}</td><td><button className="btn btn-sm" onClick={() => setDetails(details === z.key ? null : z.key)}>Vergleichen</button></td></tr>;
      })}</tbody></table></div>
      {sichtbar.length > limit ? <button className="btn" onClick={() => setLimit((n) => n + 200)}>Weitere Einträge anzeigen</button> : null}
      {einzel ? <div><strong>{einzel.name} · Bestand / Import</strong><div className="table-scroll"><table className="table"><thead><tr><th>Feld</th><th>Bestand</th><th>Import</th></tr></thead><tbody>{[...new Set([...Object.keys(einzel.bestand ?? {}), ...Object.keys(einzel.importiert)])].filter((k) => JSON.stringify((einzel.bestand as unknown as Record<string, unknown>)?.[k]) !== JSON.stringify((einzel.importiert as unknown as Record<string, unknown>)[k])).map((k) => <tr key={k}><td>{({ steps: 'Prozessschritte', name: 'Name', status: 'Status', titel: 'Titel', eingangSoll: 'Eingang Soll', settings: 'Einstellungen', bemerkung: 'Bemerkung', paketId: 'Planpaket' } as Record<string, string>)[k] ?? k}</td><td><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 320 }}>{JSON.stringify((einzel.bestand as unknown as Record<string, unknown>)?.[k] ?? null, null, 2)}</pre></td><td><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 320 }}>{JSON.stringify((einzel.importiert as unknown as Record<string, unknown>)[k], null, 2)}</pre></td></tr>)}</tbody></table></div></div> : null}
      <label className="checkbox"><input type="checkbox" checked={nameUebernehmen} onChange={(e) => setNameUebernehmen(e.target.checked)} />„Angemeldet als“ und persönliche Einstellungen übernehmen ({sicherung.daten.bearbeiter.name})</label>
    </div>
  </Modal>;
}
