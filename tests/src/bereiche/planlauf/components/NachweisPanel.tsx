import { useState } from 'react';
import { useStore, newId } from '../store/store';
import { durchlaeufe, nachweisZeilen, dauerTage, seiteAmTag, verzugsTage } from '../domain/nachweis';
import { VERZUGS_SEITEN, type AppData, type Erinnerung, type PlanRun, type Project, type RunStep, type VerzugsSeite } from '../domain/types';
import { formatDate, today } from '../../../shared/dates';
import { Card, CardHeader, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { useToast } from '../../../shared/toast';

const MAIL_AKTION: Record<Erinnerung['aktion'], string> = {
  outlook: 'In Outlook vorbereitet', web: 'In Outlook Web vorbereitet', kopiert: 'Kopiert',
  versand_bestaetigt: 'Versand manuell bestätigt', altbestand: 'Vermerk aus Altbestand',
};
export function dateiLaden(name: string, text: string, typ = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: typ }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvZelle = (v: unknown) => `"${String(v ?? '').replace(/^[=+@-]/, (x) => `'${x}`).replace(/"/g, '""')}"`;

export function NachweisPanel({ run, project }: { run: PlanRun; project: Project }) {
  const { data, updateStep } = useStore();
  const [auswahl, setAuswahl] = useState<{ step: RunStep; historienId?: string } | null>(null);
  const alle = durchlaeufe(run);
  const summe = Object.fromEntries(Object.keys(VERZUGS_SEITEN).map((seite) => [seite,
    alle.reduce((n, s) => n + verzugsTage(s, project).filter((d) => seiteAmTag(s, d) === seite).length, 0),
  ]));
  const exportCsv = () => {
    const zeilen: unknown[][] = [['Planlauf', 'Schritt', 'Durchlauf', 'Funktion', 'Person', 'Eingang', 'Fristende', 'Ist', 'Bearbeitungsdauer', 'Verzugstag', 'Seite', 'Begründung', 'Zuordnung durch', 'Zuordnung am', 'Bewertet bis']];
    for (const s of alle) for (const tag of verzugsTage(s, project).length ? verzugsTage(s, project) : ['']) {
      const z = [...(s.verzugZuordnungen ?? [])].reverse().find((z) => z.von <= tag && z.bis >= tag);
      zeilen.push([run.name, s.name, s.durchlauf, s.roleName, s.personName, s.eingangDatum, s.sollDatum, s.istDatum, dauerTage(s, project), tag, tag ? VERZUGS_SEITEN[seiteAmTag(s, tag)] : '', z?.begruendung, z?.bearbeiter, z?.zeitpunkt, s.verzugBis]);
    }
    dateiLaden(`Nachweis-${run.id}.csv`, '\ufeff' + zeilen.map((r) => r.map(csvZelle).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  return <>
    <Card><CardHeader titel="Nachweis und Durchläufe" sub="Eingang, Frist, Bearbeitungsdauer und begründete Zuordnung je Verzugstag" actions={<div className="row wrap"><button className="btn btn-sm btn-outline" onClick={exportCsv}>Verzugsnachweis (CSV)</button><button className="btn btn-sm btn-outline" onClick={() => dateiLaden(`Nachweis-${run.id}.json`, JSON.stringify({ project, run, protokoll: data.protokoll?.filter((e) => e.runId === run.id) }, null, 2))}>Vollständiger Nachweis (JSON)</button></div>} />
      <div className="card-pad"><div className="row wrap">{Object.entries(VERZUGS_SEITEN).map(([k, label]) => <span className="badge" key={k}>{label}: {summe[k]} {project.settings.fristenInArbeitstagen ? 'AT' : 'KT'}</span>)}</div>
        <p className="small muted">Verzug wird je Schritt und Durchlauf ausgewiesen. Parallele Zeiträume können sich überlagern; die Summe ist keine Aussage über den Gesamtverzug des Projekts. Historische Angaben aus älteren Fassungen können nur erhalten werden, soweit sie noch vorhanden waren.</p>
      </div>
      <div className="table-scroll"><table className="table"><thead><tr><th>Schritt / Durchlauf</th><th>Person</th><th>Eingang</th><th>Fristende</th><th>Ist / Dauer</th><th>Verzug</th><th /></tr></thead><tbody>{nachweisZeilen(run).map(({ step: s, historienId }) => <tr key={historienId ?? s.id}><td><strong>{s.name}</strong><div className="small muted">{s.durchlauf}. Durchlauf · {historienId ? 'archiviert' : 'aktuell'}</div></td><td className="small">{s.personName || s.roleName}</td><td>{formatDate(s.eingangDatum)}</td><td>{formatDate(s.sollDatum)}</td><td>{formatDate(s.istDatum)}<div className="small muted">{dauerTage(s, project) ?? '–'} {project.settings.fristenInArbeitstagen ? 'AT' : 'KT'}</div></td><td>{verzugsTage(s, project).length}</td><td><button className="btn btn-sm btn-outline" onClick={() => setAuswahl({ step: s, historienId })}>Nachweis öffnen</button></td></tr>)}</tbody></table></div>
    </Card>
    <AuditPanel data={data} runId={run.id} />
    {auswahl ? <VerzugDialog project={project} step={auswahl.step} onClose={() => setAuswahl(null)} onSave={(patch) => {
      const aktuell = run.steps.find((s) => s.id === auswahl.step.id)!;
      if (auswahl.historienId) updateStep(run.id, aktuell.id, { historie: aktuell.historie?.map((h) => h.id === auswahl.historienId ? { ...h, stand: { ...h.stand, ...patch } } : h) });
      else updateStep(run.id, aktuell.id, patch);
      setAuswahl(null);
    }} /> : null}
  </>;
}

function VerzugDialog({ step, project, onSave, onClose }: { step: RunStep; project: Project; onSave: (patch: Partial<RunStep>) => void; onClose: () => void }) {
  const { data } = useStore();
  const toast = useToast();
  const tage = verzugsTage(step, project);
  const [von, setVon] = useState(tage[0] ?? today());
  const [bis, setBis] = useState(tage.at(-1) ?? today());
  const [seite, setSeite] = useState<VerzugsSeite>('ungeklaert');
  const [grund, setGrund] = useState('');
  const speichern = () => {
    if (!grund.trim() || von > bis || !tage.includes(von) || !tage.includes(bis)) { toast('Bitte einen gültigen Verzugszeitraum und eine Begründung angeben.'); return; }
    onSave({ verzugZuordnungen: [...(step.verzugZuordnungen ?? []), { id: newId('vz'), von, bis, seite, begruendung: grund.trim(), bearbeiter: data.bearbeiter.name, zeitpunkt: new Date().toISOString() }] });
  };
  return <Modal wide titel={`${step.name} · ${step.durchlauf}. Durchlauf`} sub="Verzug zuordnen und Erinnerungen nachvollziehen" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Schließen</button>{tage.length ? <button className="btn btn-primary" onClick={speichern}>Zuordnung dokumentieren</button> : null}</>}>
    <div className="stack">
      {tage.length ? <><div className="form-grid"><Field label="Verzug von"><TextInput type="date" value={von} onChange={setVon} /></Field><Field label="Verzug bis (einschließlich)"><TextInput type="date" value={bis} onChange={setBis} /></Field><Field label="Verantwortliche Seite"><Select value={seite} onChange={(v) => setSeite(v as VerzugsSeite)} options={Object.entries(VERZUGS_SEITEN).map(([value, label]) => ({ value, label }))} /></Field><Field label="Begründung / Bezug auf Unterlagen" full><TextArea value={grund} onChange={setGrund} /></Field></div>
        <p className="small muted">Bei überlappenden Zuordnungen gilt die zuletzt dokumentierte. Frühere Zuordnungen bleiben nachvollziehbar.</p>
        <details><summary>{tage.length} Verzugstage anzeigen</summary><table className="table"><thead><tr><th>Tag</th><th>Zuordnung</th></tr></thead><tbody>{tage.map((t) => <tr key={t}><td>{formatDate(t)}</td><td>{VERZUGS_SEITEN[seiteAmTag(step, t)]}</td></tr>)}</tbody></table></details>
      </> : <p>Für diesen Durchlauf ist kein Verzug dokumentiert.</p>}
      {(step.verzugZuordnungen ?? []).map((z) => <p key={z.id} className="small">{formatDate(z.von)}–{formatDate(z.bis)} · <b>{VERZUGS_SEITEN[z.seite]}</b> · {z.begruendung} · {z.bearbeiter} ({new Date(z.zeitpunkt).toLocaleString('de-DE')})</p>)}
      <h4>Erinnerungen und Versand</h4>
      {step.erinnerungen?.length ? step.erinnerungen.map((e) => <details key={e.id}><summary>{new Date(e.zeitpunkt).toLocaleString('de-DE')} · {MAIL_AKTION[e.aktion]} · {e.empfaenger}</summary><p><b>{e.betreff}</b></p><p style={{ whiteSpace: 'pre-wrap' }}>{e.text}</p><p className="small muted">Erfasst von {e.bearbeiter || 'Altbestand'}</p>{!['versand_bestaetigt', 'altbestand'].includes(e.aktion) ? <button className="btn btn-sm" onClick={() => onSave({ erinnerungen: [...(step.erinnerungen ?? []), { ...e, id: newId('mail'), aktion: 'versand_bestaetigt', zeitpunkt: new Date().toISOString(), bearbeiter: data.bearbeiter.name }] })}>Tatsächlichen Versand jetzt bestätigen</button> : null}</details>) : <p className="small muted">Keine Erinnerungen erfasst.</p>}
    </div>
  </Modal>;
}

const FELDER: Record<string, string> = { name: 'Name', status: 'Status', fristTage: 'Frist (Tage)', fristOverride: 'Prüffrist nach Nachreichung', sollDatum: 'Fristende', istDatum: 'Ist-Termin', eingangDatum: 'Eingang', eingangOverride: 'Wiedereingang', prognoseDatum: 'Prognose', contactId: 'Person (Kennung)', personName: 'Person', roleName: 'Funktion', bemerkung: 'Bemerkung', nachweisNummer: 'Nachweisnummer', gewaehlteAntwortId: 'Entscheidung (Kennung)', durchlauf: 'Durchlauf', historie: 'Frühere Durchläufe', erinnerungen: 'Erinnerungen', verzugZuordnungen: 'Verzugszuordnungen', paketId: 'Planpaket (Kennung)', titel: 'Titel', eingangSoll: 'Eingang Soll', settings: 'Projekteinstellungen' };
function aenderungen(a: unknown, b: unknown) {
  const vorher = (a && typeof a === 'object' ? a : { Wert: a }) as Record<string, unknown>;
  const nachher = (b && typeof b === 'object' ? b : { Wert: b }) as Record<string, unknown>;
  return [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].filter((k) => JSON.stringify(vorher[k]) !== JSON.stringify(nachher[k])).map((k) => ({ feld: FELDER[k] ?? k, vorher: vorher[k], nachher: nachher[k] }));
}
const anzeigen = (x: unknown) => x === null || x === undefined ? '–' : typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x);
export function AuditPanel({ data, projectId, runId }: { data: AppData; projectId?: string; runId?: string }) {
  const [limit, setLimit] = useState(50);
  const eintraege = [...(data.protokoll ?? [])].reverse().filter((e) => (!projectId || e.projectId === projectId) && (!runId || e.runId === runId));
  return <Card><CardHeader titel="Änderungsprotokoll" sub={`${eintraege.length} Änderungen mit Bearbeiter, Zeitpunkt und Vorher/Nachher`} /><div className="card-pad">
    <details><summary>Protokoll anzeigen</summary>{eintraege.slice(0, limit).map((e) => <details key={e.id} style={{ marginTop: 12 }}><summary>{new Date(e.zeitpunkt).toLocaleString('de-DE')} · {e.bearbeiter} · {({ documents: 'Planliste', projects: 'Projekt', contacts: 'Person', templates: 'Workflow', roles: 'Funktion' } as Record<string, string>)[e.art] ?? e.art} · {e.vorher === null ? 'angelegt' : e.nachher === null ? 'gelöscht' : 'geändert'}</summary><div className="table-scroll"><table className="table"><thead><tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>{aenderungen(e.vorher, e.nachher).map((a) => <tr key={a.feld}><td>{a.feld}</td><td><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 400 }}>{anzeigen(a.vorher)}</pre></td><td><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 400 }}>{anzeigen(a.nachher)}</pre></td></tr>)}</tbody></table></div></details>)}{eintraege.length > limit ? <button className="btn btn-sm" onClick={() => setLimit((n) => n + 50)}>Weitere Änderungen</button> : null}{!eintraege.length ? <p className="small muted">Ab dieser Fassung werden Änderungen automatisch dokumentiert.</p> : null}</details>
    </div></Card>;
}
