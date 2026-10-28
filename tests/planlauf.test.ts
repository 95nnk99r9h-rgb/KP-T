import test from 'node:test';
import assert from 'node:assert/strict';
import { recalcRun, stepsAusTemplate, aktuelleSchritte, fortschritt, offeneFristen, vorlagenSchritte, laufUebernehmen, pfad } from '../src/bereiche/planlauf/domain/engine';
import { schrittStatusSetzen } from '../src/bereiche/planlauf/domain/abschluss';
import { direkteNachreichung } from '../src/bereiche/planlauf/domain/nachreichung';
import { terminBerechnen } from '../src/bereiche/planlauf/domain/terminrechner';
import { dauerImStandardverlauf, entfernen, einfuegen, pruefen } from '../src/bereiche/planlauf/domain/workflowGraph';
import { sicherungMischen, sicherungsAbgleich } from '../src/bereiche/planlauf/domain/sicherungsAbgleich';
import { sicherungLesen } from '../src/bereiche/planlauf/store/storage';
import { durchlaeufe, seiteAmTag, verzugsTage, protokolliere } from '../src/bereiche/planlauf/domain/nachweis';
import { PARALLELE_TEMPLATES, seedData } from '../src/bereiche/planlauf/domain/seed';
import type { PlanRun, ProcessTemplateStep, Project, RunStep, AppData } from '../src/bereiche/planlauf/domain/types';
let id = 0;
const neu = () => `test-${++id}`;
const projekt: Project = { id: 'p', name: 'Test', nummer: '1', status: 'aktiv', markiert: false, beschreibung: '', settings: { erinnerungVorlaufTage: 3, fristenInArbeitstagen: true, feiertage: [], absenderName: '', absenderEmail: '' } };
const step = (id: string, fristTage = 1, extra: Partial<RunStep> = {}): RunStep => ({ id, name: id, typ: 'aufgabe', roleName: 'PLM', contactId: null, contactManuell: false, fristTage, sollDatum: null, sollManuell: false, istDatum: null, status: 'offen', abweichung: false, bemerkung: '', letzteErinnerung: null, antworten: [], gewaehlteAntwortId: null, naechster: null, durchlauf: 1, nachweis: 'keine', nachweisNummer: null, mailFrage: false, mailVorlageId: null, ...extra });
const run = (steps: RunStep[]): PlanRun => ({ id: 'r', projectId: 'p', documentId: 'd', templateId: null, templateName: '', name: 'Testlauf', index: '', start: '2026-10-01', status: 'laufend', abbruchArt: null, abbruchGrund: null, abbruchDatum: null, abbruchNeuerIndex: null, steps, bemerkung: '' });
const template = (steps: RunStep[]): ProcessTemplateStep[] => steps.map((s) => ({ ...s, beschreibung: '' }));
const rechnen = (r: PlanRun) => recalcRun(r, projekt);
function fertig(r: PlanRun, id: string, datum: string, antwort?: string) {
  const s = r.steps.find((s) => s.id === id)!;
  const e = schrittStatusSetzen(r, { ...s, istDatum: datum, gewaehlteAntwortId: antwort ?? s.gewaehlteAntwortId }, 'erledigt', s.nachweis !== 'keine' ? 'PB-1' : '');
  assert.equal(e.art, 'aenderung', JSON.stringify(e));
  if (e.art !== 'aenderung') throw new Error('Fehler');
  for (const a of e.aenderungen) r = a.art === 'run' ? { ...r, ...a.patch } : { ...r, steps: r.steps.map((s) => s.id === a.stepId ? { ...s, ...a.patch } : s) };
  return rechnen(r);
}
const parallel = () => run([
  step('eingang', 0, { name: 'Eingang PLM', parallelNachfolger: ['fach', 'statik'] }),
  step('fach', 15, { naechster: 'join' }), step('statik', 10, { naechster: 'join' }),
  step('join', 2, { wartetAuf: ['fach', 'statik'], naechster: 'ende' }),
]);
const daten = (): AppData => ({ version: 13, stammdatenVersion: 4, bearbeiter: { name: 'Test', farbmodus: 'standard', mailNachfrage: false }, gewerke: [], standardRollen: [], emailVorlagen: [], projects: [structuredClone(projekt)], roles: [], contacts: [], templates: [], documents: [{ id: 'd', projectId: 'p', kind: 'plan', parentId: null, paketId: null, nummer: 'P1', titel: 'Test', index: '', gewerk: '', planungsphase: '', eingangSoll: null, datum: null, bemerkung: '' }], runs: [rechnen(parallel())], protokoll: [] });

test('Verspäteter Eingang gewährt volle 15 Arbeitstage', () => {
  let r = rechnen(run([step('versand', 4), step('pruefung', 15)]));
  assert.equal(r.steps[1].sollDatum, null);
  r = fertig(r, 'versand', '2026-10-26');
  assert.equal(r.steps[1].eingangDatum, '2026-10-26');
  assert.equal(r.steps[1].sollDatum, '2026-11-16');
});
test('Prognosen lösen keine Erinnerung aus', () => {
  const d = daten();
  assert.equal(offeneFristen(d).length, 1);
  assert.equal(d.runs[0].steps[1].sollDatum, null);
  assert.ok(d.runs[0].steps[1].prognoseDatum);
});
test('Parallele Schritte starten gleichzeitig und Join wartet auf letzten Ist-Eingang', () => {
  let r = fertig(rechnen(parallel()), 'eingang', '2026-10-01');
  assert.deepEqual(aktuelleSchritte(r).map((s) => s.id), ['fach', 'statik']);
  r = fertig(r, 'statik', '2026-10-19');
  assert.deepEqual(aktuelleSchritte(r).map((s) => s.id), ['fach']);
  r = fertig(r, 'fach', '2026-10-26');
  assert.equal(r.steps[3].eingangDatum, '2026-10-26');
  assert.equal(r.steps[3].sollDatum, '2026-10-28');
  r = fertig(r, 'join', '2026-10-28'); assert.equal(r.status, 'abgeschlossen');
});
test('Blockierte Schritte können nicht vorgezogen werden', () => {
  const r = rechnen(parallel());
  assert.equal(schrittStatusSetzen(r, r.steps[2], 'erledigt', '').art, 'fehler');
});
test('Rücksprung erhält Nachweis und setzt neue Frist ab Wiedereingang', () => {
  let r = rechnen(run([step('formal', 3), step('pruefer', 15, { typ: 'entscheidung', antworten: [{ id: 'ja', text: 'Ja', ziel: 'ende' }, { id: 'nein', text: 'Nein', ziel: 'korr' }] }), step('korr', 5, { naechster: 'formal' })]));
  r = fertig(r, 'formal', '2026-10-05');
  r = fertig(r, 'pruefer', '2026-10-07', 'nein');
  r = fertig(r, 'korr', '2026-10-26');
  assert.equal(r.steps[0].durchlauf, 2);
  assert.equal(r.steps[0].sollDatum, '2026-10-29');
  assert.equal(r.steps[0].historie?.[0].stand.istDatum, '2026-10-05');
  assert.equal(r.steps[1].sollDatum, null);
  assert.equal(r.steps[1].nachweisNummer, null);
});
test('Direkte Nachreichung lässt andere Freigabe stehen und startet kurze Prüffrist', () => {
  let r = parallel();
  r.steps[1] = { ...r.steps[1], typ: 'entscheidung', antworten: [{ id: 'ja', text: 'Ja', ziel: 'join' }, { id: 'nein', text: 'Nein', ziel: 'eingang' }] };
  r = fertig(rechnen(r), 'eingang', '2026-10-01');
  r = fertig(r, 'statik', '2026-10-14');
  const s = { ...r.steps[1], gewaehlteAntwortId: 'nein', istDatum: '2026-10-15' };
  r = direkteNachreichung(r, s, 5, 3, 'Kleine Korrektur', neu);
  r = fertig(r, s.id, '2026-10-15', 'nein');
  assert.equal(aktuelleSchritte(r).some((s) => s.id === 'join'), false);
  assert.equal(r.steps.find((s) => s.id === 'join')?.sollDatum, null);
  const korr = r.steps.at(-1)!;
  r = fertig(r, korr.id, '2026-10-26');
  assert.equal(r.steps[1].sollDatum, '2026-10-29');
  assert.equal(r.steps[1].antworten.find((a) => a.id === 'nein')?.ziel, 'eingang');
  assert.equal(r.steps[2].status, 'erledigt');
  r = fertig(r, 'fach', '2026-10-28', 'ja');
  assert.deepEqual(aktuelleSchritte(r).map((s) => s.id), ['join']);
});
test('Fortschritt gewichtet Fristdauer und endet bei offenem Meilenstein nicht bei 100', () => {
  const r = run([step('lange', 15, { status: 'erledigt' }), step('versand', 1)]);
  assert.equal(fortschritt(r), 94);
  r.steps[1].fristTage = 0; assert.equal(fortschritt(r), 99);
});
test('Kritischer Pfad statt Summe der parallelen Fristen', () => {
  assert.equal(dauerImStandardverlauf(template(parallel().steps)), 17);
  const z = terminBerechnen(template(parallel().steps), '2026-10-01', 'vorwaerts', projekt.settings);
  assert.equal(z.find((z) => z.id === 'fach')?.eingang, z.find((z) => z.id === 'statik')?.eingang);
  assert.equal(z.at(-1)?.ende, '2026-10-26');
});
test('Rückwärtsrechnung erreicht Ziel auch bei Wochenende und Feiertagen', () => {
  const settings = { ...projekt.settings, feiertage: ['2026-10-16'] };
  for (const ziel of ['2026-10-26', '2026-10-25', '2026-10-24', '2026-10-16']) {
    const z = terminBerechnen(template(parallel().steps), ziel, 'rueckwaerts', settings);
    const f = terminBerechnen(template(parallel().steps), z[0].eingang, 'vorwaerts', settings);
    assert.ok(f.at(-1)!.ende <= ziel, `${ziel}: ${f.at(-1)!.ende}`);
  }
});
test('Parallele Vorlagen sind gültig; Kopien biegen alle Abhängigkeiten um', () => {
  for (const t of PARALLELE_TEMPLATES) {
    assert.deepEqual(pruefen(t.steps).filter((h) => h.sperrt), []);
    const kopie = vorlagenSchritte(t, neu);
    const ids = new Set(kopie.map((s) => s.id));
    for (const s of kopie) for (const id of [...(s.parallelNachfolger ?? []), ...(s.wartetAuf ?? [])]) assert.ok(ids.has(id));
    const r = run(stepsAusTemplate(t, () => null, neu));
    const kopierterLauf = laufUebernehmen(r, { documentId: 'neu', name: '', index: '', bemerkung: '' }, neu);
    const neueIds = new Set(kopierterLauf.steps.map((s) => s.id));
    for (const s of kopierterLauf.steps) for (const id of [...(s.parallelNachfolger ?? []), ...(s.wartetAuf ?? [])]) assert.ok(neueIds.has(id));
  }
});
test('Migration v12 verändert bestehende Rollen-IDs nicht', () => {
  const d = seedData(); d.version = 12;
  const ids = d.roles.map((r) => r.id);
  const n = sicherungLesen(JSON.stringify(d));
  assert.deepEqual(n.roles.map((r) => r.id), ids);
  assert.equal(n.version, 13);
});
test('Selektiver Import behält lokal weiterbearbeitete Datensätze', () => {
  const d = daten(), alt = structuredClone(d);
  d.documents[0].titel = 'Neuer lokaler Titel';
  alt.documents.push({ ...alt.documents[0], id: 'neu', nummer: 'P2' });
  const keys = sicherungsAbgleich(d, alt).filter((z) => z.status === 'neu').map((z) => z.key);
  const n = sicherungMischen(d, alt, keys).daten;
  assert.equal(n.documents[0].titel, 'Neuer lokaler Titel');
  assert.equal(n.documents.length, 2);
  assert.equal(d.documents.length, 1);
});
test('Nur ausdrücklich gewählte Konflikte überschreiben', () => {
  const d = daten(), eingang = structuredClone(d); eingang.documents[0].titel = 'Import';
  assert.equal(sicherungMischen(d, eingang, []).daten.documents[0].titel, 'Test');
  assert.equal(sicherungMischen(d, eingang, ['documents:d']).daten.documents[0].titel, 'Import');
});
test('Abhängigkeiten werden ergänzt ohne existierendes Projekt zu überschreiben', () => {
  const leer = daten(); leer.documents = []; leer.runs = [];
  const quelle = daten(); quelle.projects[0].name = 'Alter Projektname';
  const n = sicherungMischen(leer, quelle, ['runs:r']);
  assert.ok(n.automatisch.includes('documents:d'));
  assert.equal(n.daten.projects[0].name, 'Test');
});
test('Mehrere aktive Läufe je Eintrag werden beim Import verhindert', () => {
  const d = daten(), eingang = structuredClone(d); eingang.runs[0].id = 'r2';
  assert.throws(() => sicherungMischen(d, eingang, ['runs:r2']), /mehrere laufende/);
});
test('Änderungsprotokoll hält Vorher und Löschung fest', () => {
  const d = daten(), n = structuredClone(d); n.documents = []; n.runs = [];
  const p = protokolliere(d, n, neu);
  assert.ok(p.protokoll!.some((e) => e.art === 'documents' && e.nachher === null));
  assert.ok(p.protokoll!.some((e) => e.art === 'Schritt' && e.vorher));
});
test('Verzug wird täglich im Projektkalender und ohne voreilige Schuldzuordnung erfasst', () => {
  const s = step('s', 1, { eingangDatum: '2026-10-01', sollDatum: '2026-10-23', istDatum: '2026-10-28' });
  assert.deepEqual(verzugsTage(s, projekt), ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.equal(seiteAmTag(s, '2026-10-26'), 'ungeklaert');
  s.verzugZuordnungen = [{ id: 'v', von: '2026-10-26', bis: '2026-10-27', seite: 'planer', begruendung: 'Unterlagen fehlten', bearbeiter: 'PLM', zeitpunkt: '' }];
  assert.equal(seiteAmTag(s, '2026-10-27'), 'planer');
  assert.equal(seiteAmTag(s, '2026-10-28'), 'ungeklaert');
});
test('Import mit doppelten IDs oder fremdem Bereich wird abgewiesen', () => {
  const d = daten(); d.documents.push({ ...d.documents[0] });
  assert.throws(() => sicherungLesen(JSON.stringify(d)));
  assert.throws(() => sicherungLesen(JSON.stringify({ ...daten(), bereich: 'baubetrieb' })));
});

test('Archivierter und abgebrochener offener Verzug wächst nicht weiter', () => {
  const r = rechnen(parallel());
  r.steps[1] = { ...r.steps[1], eingangDatum: '2026-10-01', sollDatum: '2026-10-23' };
  r.steps[1].historie = [{ id: 'h', grund: 'Rücklauf', archiviertAm: '2026-10-28T12:00:00Z', stand: { ...r.steps[1], verzugBis: '2026-10-26' } }];
  r.status = 'abgebrochen'; r.abbruchDatum = '2026-10-27';
  const z = durchlaeufe(r).filter((s) => s.id === 'fach');
  assert.deepEqual(verzugsTage(z[0], projekt, '2027-01-01'), ['2026-10-26']);
  assert.deepEqual(verzugsTage(z[1], projekt, '2027-01-01'), ['2026-10-26', '2026-10-27']);
});
test('Voller Rücklauf öffnet beide parallelen Prüfungen und bewahrt Nachweise', () => {
  let r = parallel();
  r.steps[1] = { ...r.steps[1], typ: 'entscheidung', nachweis: 'pruefbericht', antworten: [{ id: 'ja', text: 'Ja', ziel: 'join' }, { id: 'nein', text: 'Nein', ziel: 'eingang' }] };
  r = fertig(rechnen(r), 'eingang', '2026-10-01');
  r = fertig(r, 'statik', '2026-10-14');
  r.steps[2].erinnerungen = [{ id: 'm', zeitpunkt: '2026-10-13T12:00:00Z', aktion: 'kopiert', empfaenger: 'Test', betreff: 'Erinnerung', text: 'Prüfung', bearbeiter: 'PLM' }];
  r = fertig(r, 'fach', '2026-10-26', 'nein');
  assert.equal(r.steps[2].status, 'offen');
  assert.equal(r.steps[2].historie?.[0].stand.istDatum, '2026-10-14');
  assert.equal(r.steps[2].historie?.[0].stand.erinnerungen?.length, 1);
  assert.equal(r.steps[0].eingangDatum, '2026-10-26');
});
test('Editor fügt in einem Zweig ein und entfernt bereinigte Join-Bezüge', () => {
  const s = template(parallel().steps);
  const n = { ...s[0], id: 'neu', name: 'Zusatz', parallelNachfolger: [], wartetAuf: [], naechster: null };
  const eingefuegt = einfuegen(s, 'eingang', null, n);
  assert.deepEqual(eingefuegt.find((s) => s.id === 'eingang')?.parallelNachfolger, ['neu', 'statik']);
  assert.equal(eingefuegt.find((s) => s.id === 'neu')?.naechster, 'fach');
  assert.deepEqual(pruefen(eingefuegt).filter((h) => h.sperrt), []);
  const entfernt = entfernen(s, 'statik');
  assert.ok(!entfernt.some((s) => s.wartetAuf?.includes('statik')));
  assert.deepEqual(pruefen(entfernt).filter((h) => h.sperrt), []);
});
test('Leere Nachweisnummer lässt eine Freigabe offen', () => {
  const r = rechnen(run([step('pruefung', 3, { nachweis: 'pruefbericht' })]));
  assert.equal(schrittStatusSetzen(r, r.steps[0], 'erledigt', ' ').art, 'nachweis');
});
