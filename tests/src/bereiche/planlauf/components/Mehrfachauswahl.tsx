import { useEffect, useRef, useState } from 'react';
import type { PlanDocument, PlanRun, Project, RunStep } from '../domain/types';
import { useStore } from '../store/store';
import { aktuelleSchritte, recalcRun } from '../domain/engine';
import { schrittStatusSetzen } from '../domain/abschluss';
import { formatDate, today } from '../../../shared/dates';
import { Field, Modal, Select, TextInput, Callout } from '../../../shared/ui';
import { useToast } from '../../../shared/toast';

export function AuswahlHaken({ ids, auswahl, onChange, label }: { ids: string[]; auswahl: string[]; onChange: (ids: string[], checked: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const anzahl = ids.filter((id) => auswahl.includes(id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = anzahl > 0 && anzahl < ids.length; }, [anzahl, ids.length]);
  return <input ref={ref} type="checkbox" aria-label={label} title={label} disabled={!ids.length} checked={ids.length > 0 && anzahl === ids.length} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(ids, e.target.checked)} />;
}
export function auswahlAendern(alt: string[], ids: string[], wert: boolean): string[] {
  return wert ? [...new Set([...alt, ...ids])] : alt.filter((id) => !ids.includes(id));
}

export function PlaeneSammelDialog({ ids, project, onClose }: { ids: string[]; project: Project; onClose: () => void }) {
  const { data, updateDocuments, deleteDocuments } = useStore();
  const toast = useToast();
  const [aktion, setAktion] = useState('paket');
  const [paket, setPaket] = useState('');
  const gewaehlt = data.documents.filter((d) => d.projectId === project.id && ids.includes(d.id));
  const wurzeln = new Set(gewaehlt.map((d) => aktion === 'paket' && d.parentId ? d.parentId : d.id));
  const betroffen = data.documents.filter((d) => d.projectId === project.id && (wurzeln.has(d.id) || Boolean(d.parentId && wurzeln.has(d.parentId))));
  const anwenden = () => {
    if (aktion === 'loeschen') deleteDocuments(betroffen.map((d) => d.id));
    else updateDocuments([...wurzeln], { paketId: paket || null });
    toast(aktion === 'loeschen' ? `${betroffen.length} Einträge samt Planläufen gelöscht und protokolliert.` : `${betroffen.length} Einträge dem Planpaket zugeordnet.`);
    onClose();
  };
  return <Modal wide titel="Pläne gemeinsam bearbeiten" sub={`${gewaehlt.length} Einträge ausgewählt`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className={`btn ${aktion === 'loeschen' ? 'btn-danger' : 'btn-primary'}`} onClick={anwenden}>{aktion === 'loeschen' ? `${betroffen.length} Einträge löschen` : 'Zuordnung übernehmen'}</button></>}>
    <div className="stack"><Field label="Aktion"><Select value={aktion} onChange={setAktion} options={[{ value: 'paket', label: 'Planpaket zuweisen / Zuordnung entfernen' }, { value: 'loeschen', label: 'Auswahl löschen' }]} /></Field>
      {aktion === 'paket' ? <><Field label="Planpaket"><Select value={paket} onChange={setPaket} options={[{ value: '', label: 'Ohne Planpaket' }, ...data.documents.filter((d) => d.projectId === project.id && d.kind === 'paket').map((d) => ({ value: d.id, label: `${d.nummer} · ${d.titel}` }))]} /></Field><Callout>Pläne innerhalb eines Verzeichnisses folgen dessen Planpaket. Deshalb werden gegebenenfalls das gesamte Verzeichnis und seine Pläne zugeordnet. Die vollständige betroffene Auswahl steht unten.</Callout></> : <Callout ton="warn" icon="!">Die unten aufgeführten Einträge und ihre Planläufe werden gelöscht. Bei ausgewählten Verzeichnissen gehören die enthaltenen Pläne dazu. Vorherige Werte bleiben im Änderungsprotokoll; eine JSON-Sicherung ermöglicht die Wiederherstellung.</Callout>}
      <AuswahlListe docs={betroffen} />
    </div>
  </Modal>;
}
function AuswahlListe({ docs }: { docs: PlanDocument[] }) {
  return <div className="table-scroll" style={{ maxHeight: 300, overflowY: 'auto' }}><table className="table"><thead><tr><th>Betroffene Einträge ({docs.length})</th></tr></thead><tbody>{docs.map((d) => <tr key={d.id}><td>{d.nummer} · {d.titel}</td></tr>)}</tbody></table></div>;
}

export function LaeufeSammelDialog({ runs, project, onClose }: { runs: PlanRun[]; project: Project; onClose: () => void }) {
  const { data, updateRuns } = useStore();
  const toast = useToast();
  const [aktion, setAktion] = useState('erledigt');
  const [name, setName] = useState('');
  const [datum, setDatum] = useState(today());
  const [frist, setFrist] = useState('5');
  const [person, setPerson] = useState('');
  const [nummern, setNummern] = useState<Record<string, string>>({});
  const [antworten, setAntworten] = useState<Record<string, string>>({});
  const moeglich = runs.flatMap((run) => aktuelleSchritte(run).map((step) => ({ run, step })));
  const namen = [...new Set(moeglich.map((x) => x.step.name))];
  const ziel = moeglich.filter((x) => !name || x.step.name === name);
  const anwenden = () => {
    if (!ziel.length) return;
    const neue = new Map(runs.map((r) => [r.id, r]));
    if (aktion === 'frist' && (!/^\d+$/.test(frist) || Number(frist) > 3650)) { toast('Bitte eine Frist von 0 bis 3650 Tagen angeben.'); return; }
    if (aktion === 'erledigt' && (!datum || datum > today())) { toast('Bitte einen tatsächlichen Ist-Termin bis heute angeben.'); return; }
    for (const { run, step } of ziel) {
      let lauf = neue.get(run.id)!;
      const schritt = lauf.steps.find((s) => s.id === step.id)!;
      if (aktion === 'erledigt') {
        const antwort = antworten[step.id] ?? schritt.gewaehlteAntwortId;
        const nr = nummern[step.id]?.trim() || schritt.nachweisNummer;
        if (schritt.typ === 'entscheidung' && !antwort) { toast(`Bitte die Entscheidung für „${run.name} / ${step.name}“ wählen.`); return; }
        const positiv = schritt.typ !== 'entscheidung' || antwort === schritt.antworten[0]?.id;
        if (positiv && schritt.nachweis !== 'keine' && !nr) { toast(`Bitte den Nachweis für „${run.name} / ${step.name}“ erfassen.`); return; }
        const e = schrittStatusSetzen(lauf, { ...schritt, istDatum: datum, gewaehlteAntwortId: antwort ?? null }, 'erledigt', nr ?? '');
        if (e.art !== 'aenderung') { toast(e.art === 'fehler' ? e.meldung : 'Ein Nachweis fehlt.'); return; }
        for (const a of e.aenderungen) lauf = a.art === 'run' ? { ...lauf, ...a.patch } : { ...lauf, steps: lauf.steps.map((s) => s.id === a.stepId ? { ...s, ...a.patch } : s) };
      } else {
        const patch: Partial<RunStep> = aktion === 'frist' ? { fristTage: Number(frist), fristOverride: undefined, sollManuell: false, abweichung: true } : { contactId: person || null, contactManuell: Boolean(person) };
        lauf = { ...lauf, steps: lauf.steps.map((s) => s.id === step.id ? { ...s, ...patch } : s) };
      }
      neue.set(lauf.id, recalcRun(lauf, project, data.documents.find((d) => d.id === lauf.documentId)));
    }
    updateRuns([...neue.values()]); toast(`${ziel.length} Schritte gemeinsam bearbeitet.`); onClose();
  };
  return <Modal wide titel="Planläufe gemeinsam bearbeiten" sub={`${runs.length} ausgewählte Planläufe · ${ziel.length} betroffene Schritte`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={!ziel.length} onClick={anwenden}>Auf {ziel.length} Schritte anwenden</button></>}>
    <div className="stack"><div className="form-grid"><Field label="Aktion"><Select value={aktion} onChange={setAktion} options={[{ value: 'erledigt', label: 'Aktive Schritte abschließen' }, { value: 'frist', label: 'Frist aktiver Schritte ändern' }, { value: 'person', label: 'Zuständigkeit aktiver Schritte ändern' }]} /></Field><Field label="Betroffene Schritte"><Select value={name} onChange={setName} options={[{ value: '', label: 'Alle aktuell bearbeitbaren Schritte' }, ...namen.map((n) => ({ value: n, label: n }))]} /></Field>
      {aktion === 'erledigt' ? <Field label="Gemeinsamer Ist-Termin"><TextInput type="date" value={datum} onChange={setDatum} /></Field> : aktion === 'frist' ? <Field label="Neue Frist ab tatsächlichem Eingang (Tage)"><TextInput type="number" value={frist} onChange={setFrist} /></Field> : <Field label="Person"><Select value={person} onChange={setPerson} options={[{ value: '', label: 'Automatisch nach Funktion' }, ...data.contacts.filter((c) => c.projectId === project.id).map((c) => ({ value: c.id, label: `${c.vorname} ${c.nachname}` }))]} /></Field>}
    </div><p className="small muted">Es werden ausschließlich die unten aufgeführten, bereits aktiven Schritte bearbeitet. Bei Ablehnung gilt der Rücklauf des Workflows; eine direkte Nachreichung wird im einzelnen Planlauf gewählt.</p>
    <div className="table-scroll"><table className="table"><thead><tr><th>Planlauf</th><th>Schritt / Eingang</th>{aktion === 'erledigt' ? <><th>Entscheidung</th><th>Nachweisnummer</th></> : null}</tr></thead><tbody>{ziel.map(({ run, step }) => <tr key={`${run.id}:${step.id}`}><td>{run.name}</td><td>{step.name}<div className="small muted">{formatDate(step.eingangDatum)}</div></td>{aktion === 'erledigt' ? <><td>{step.typ === 'entscheidung' ? <Select value={antworten[step.id] ?? step.gewaehlteAntwortId ?? ''} onChange={(v) => setAntworten((a) => ({ ...a, [step.id]: v }))} options={[{ value: '', label: 'Bitte wählen …' }, ...step.antworten.map((a) => ({ value: a.id, label: a.text }))]} /> : '–'}</td><td>{step.nachweis !== 'keine' ? <TextInput value={nummern[step.id] ?? step.nachweisNummer ?? ''} onChange={(v) => setNummern((a) => ({ ...a, [step.id]: v }))} /> : '–'}</td></> : null}</tr>)}</tbody></table></div>
    </div>
  </Modal>;
}
