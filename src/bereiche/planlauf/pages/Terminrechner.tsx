import './terminrechner.css';
import { useState } from 'react';
import { useStore } from '../store/store';
import { terminBerechnen } from '../domain/terminrechner';
import { formatDate, today } from '../../../shared/dates';
import { Card, CardHeader, Field, Select, TextInput, Segmented, Callout } from '../../../shared/ui';

export function Terminrechner() {
  const { data } = useStore();
  const [projektId, setProjektId] = useState(data.projects[0]?.id ?? '');
  const [workflowId, setWorkflowId] = useState(data.templates[0]?.id ?? '');
  const [richtung, setRichtung] = useState<'vorwaerts' | 'rueckwaerts'>('rueckwaerts');
  const [datum, setDatum] = useState(today());
  const projekt = data.projects.find((p) => p.id === projektId);
  const vorlagen = data.templates.filter((t) => !t.projectId || t.projectId === projektId);
  const workflow = vorlagen.find((t) => t.id === workflowId) ?? vorlagen[0];
  const settings = projekt?.settings ?? { fristenInArbeitstagen: true, feiertage: [] };
  let fehler = '';
  let zeilen: ReturnType<typeof terminBerechnen> = [];
  try { if (workflow && datum) zeilen = terminBerechnen(workflow.steps, datum, richtung, settings); }
  catch (e) { fehler = e instanceof Error ? e.message : 'Berechnung nicht möglich.'; }
  const ende = zeilen.map((z) => z.ende).sort().at(-1);
  return <div className="stack terminrechner">
    <Card><CardHeader titel="Terminrechner" sub="Planübergabe und Baustellentermin mit Zwischenergebnissen berechnen" />
      <div className="card-pad stack">
        <Segmented value={richtung} onChange={setRichtung} options={[{ value: 'rueckwaerts', label: 'Vom Baustellentermin zurück' }, { value: 'vorwaerts', label: 'Vom Eingang vorwärts' }]} />
        <div className="form-grid">
          <Field label="Projekt / Kalender"><Select value={projektId} onChange={setProjektId} options={[{ value: '', label: 'Mo–Fr, ohne Feiertage' }, ...data.projects.map((p) => ({ value: p.id, label: `${p.nummer} · ${p.name}` }))]} /></Field>
          <Field label="Workflow"><Select value={workflow?.id ?? ''} onChange={setWorkflowId} options={vorlagen.map((t) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label={richtung === 'rueckwaerts' ? 'Pläne spätestens auf der Baustelle' : 'Tatsächlicher Eingang der Planung beim PLM'}><TextInput type="date" value={datum} onChange={setDatum} /></Field>
        </div>
        <p className="small muted">{settings.fristenInArbeitstagen ? 'Arbeitstage (Mo–Fr)' : 'Kalendertage'} · {settings.feiertage.length} hinterlegte Feiertage. Es gilt der Standardverlauf mit der jeweils ersten Antwort. Rückläufe und zusätzliche Transporte benötigen einen eigenen Zeitansatz im Workflow. Der Eingangstag selbst zählt nicht als erster Fristtag.</p>
        {fehler ? <Callout ton="warn" icon="!">{fehler}</Callout> : zeilen.length ? <Callout ton="" icon="→">
          <strong>{richtung === 'rueckwaerts' ? `Planübergabe spätestens am ${formatDate(zeilen[0].eingang)}` : `Planlauf vollständig durchlaufen am ${formatDate(ende)}`}</strong>
          <div className="small">{richtung === 'rueckwaerts' ? `Baustellenbereit nach Workflow bis ${formatDate(ende)}.` : `Eingang der Planung: ${formatDate(datum)}.`} Parallele Wege werden gleichzeitig gerechnet; Zusammenführungen warten auf den längsten Weg.</div>
        </Callout> : <p>Bitte einen Workflow und ein Datum auswählen.</p>}
      </div>
    </Card>
    {zeilen.length ? <Card><CardHeader titel="Zwischenergebnisse" sub={richtung === 'rueckwaerts' ? 'Späteste Termine je Zweig bis zum Zieltermin' : 'Früheste Termine bei Einhaltung aller Fristen'} />
      <div className="table-scroll"><table className="table"><thead><tr><th>Schritt</th><th>Vorgänger / Freigaben</th><th>Frist</th><th>Eingang</th><th>Fristende</th></tr></thead><tbody>{zeilen.map((z) => <tr key={z.id}><td><strong>{z.name}</strong></td><td className="small muted">{z.vorgaenger.map((id) => workflow?.steps.find((s) => s.id === id)?.name).join(' + ') || 'Planübergabe'}</td><td>{z.frist} {settings.fristenInArbeitstagen ? 'AT' : 'KT'}</td><td>{formatDate(z.eingang)}</td><td>{formatDate(z.ende)}</td></tr>)}</tbody></table></div>
    </Card> : null}
  </div>;
}
