/**
 * Gemeinsame Schrittaktionen für Planlauf und Übersichtslisten.
 *
 * `useSchrittStatus` kapselt den Statuswechsel samt Erfassung der Freigabe-
 * bzw. Prüfbericht-Nummer. Der zurückgegebene Dialog muss in der jeweiligen
 * Seite gerendert werden; `ErledigtButton` ist der kleine Haken, mit dem sich
 * der anstehende Schritt direkt aus einer Liste heraus erledigen lässt.
 */
import { useState } from 'react';
import { formatDate, today } from '../../../shared/dates';
import { direkteNachreichung } from '../domain/nachreichung';
import { recalcRun } from '../domain/engine';
import { schrittStatusSetzen } from '../domain/abschluss';
import { NACHWEIS_LABEL, type PlanRun, type RunStep, type StepStatus } from '../domain/types';
import { newId, useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { ConfirmDialog, Field, Modal, TextInput, Select, TextArea, Callout } from '../../../shared/ui';
import { EmailDialog } from './EmailDialog';
import { Icon } from '../../../shared/icons';

export function useSchrittStatus() {
  const { data, updateRun } = useStore();
  const toast = useToast();
  const [nachweisFuer, setNachweisFuer] = useState<{ run: PlanRun; step: RunStep } | null>(null);
  const [frage, setFrage] = useState<{ run: PlanRun; step: RunStep; vorlageId: string | null } | null>(
    null,
  );
  const [mail, setMail] = useState<{ run: PlanRun; step: RunStep; vorlageId: string | null } | null>(
    null,
  );

  const ausfuehren = (run: PlanRun, step: RunStep, status: StepStatus, nachweisNummer?: string) => {
    const ergebnis = schrittStatusSetzen(run, step, status, nachweisNummer);
    if (ergebnis.art === 'fehler') { toast(ergebnis.meldung); return false; }
    if (ergebnis.art === 'nachweis') { setNachweisFuer({ run, step: ergebnis.step }); return false; }
    let neu = run;
    for (const a of ergebnis.aenderungen) neu = a.art === 'run' ? { ...neu, ...a.patch } : { ...neu, steps: neu.steps.map((s) => s.id === a.stepId ? { ...s, ...a.patch } : s) };
    neu = recalcRun(neu, data.projects.find((p) => p.id === run.projectId), data.documents.find((d) => d.id === run.documentId));
    updateRun(run.id, neu);
    toast(ergebnis.meldung);
    const naechster = neu.steps.find((s) => s.id === ergebnis.naechster?.id);
    if ((data.bearbeiter?.mailNachfrage ?? true) && status === 'erledigt' && step.mailFrage && naechster?.contactId) {
      setFrage({ run: neu, step: naechster, vorlageId: step.mailVorlageId });
    }
    return true;
  };
  const setzeStatus = (run: PlanRun, step: RunStep, status: StepStatus, nachweisNummer?: string) => {
    if (status === 'erledigt' && nachweisNummer === undefined) setNachweisFuer({ run, step });
    else ausfuehren(run, step, status, nachweisNummer);
  };

  const project = (run: PlanRun) => data.projects.find((p) => p.id === run.projectId);
  const kontakt = (step: RunStep) => data.contacts.find((c) => c.id === step.contactId);

  const nachweisDialog = (
    <>
      {nachweisFuer ? (
        <AbschlussDialog run={nachweisFuer.run} step={nachweisFuer.step} onClose={() => setNachweisFuer(null)}
          onErfassen={(run, step, nummer) => { if (ausfuehren(run, step, 'erledigt', nummer)) setNachweisFuer(null); }} />
      ) : null}

      {frage ? (
        <ConfirmDialog
          titel="E-Mail schreiben?"
          text={`Der nächste Schritt „${frage.step.name}“ liegt bei ${
            kontakt(frage.step)
              ? `${kontakt(frage.step)!.vorname} ${kontakt(frage.step)!.nachname}`
              : 'der zuständigen Person'
          } (${frage.step.roleName}). Soll dazu eine E-Mail vorbereitet werden?`}
          bestaetigenLabel="E-Mail vorbereiten"
          abbrechenLabel="Nein, danke"
          ton="blau"
          onConfirm={() => setMail(frage)}
          onClose={() => setFrage(null)}
        />
      ) : null}

      {mail && project(mail.run) ? (
        <EmailDialog
          project={project(mail.run)!}
          run={mail.run}
          step={mail.step}
          vorlageId={mail.vorlageId}
          onClose={() => setMail(null)}
        />
      ) : null}
    </>
  );

  return { setzeStatus, nachweisDialog };
}

/** Haken zum direkten Erledigen eines anstehenden Schritts aus einer Liste. */
export function ErledigtButton({
  run,
  step,
  onErledigen,
}: {
  run: PlanRun;
  step: RunStep;
  onErledigen: (run: PlanRun, step: RunStep) => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-sm btn-haken"
      title={`„${step.name}“ als erledigt vermerken`}
      aria-label="Schritt als erledigt vermerken"
      onClick={(e) => {
        e.stopPropagation();
        onErledigen(run, step);
      }}
    >
      <Icon name="check" size={13} />
    </button>
  );
}

/** Erfasst die Freigabe- bzw. Prüfbericht-Nummer beim Abschluss eines Schritts. */
export function NachweisDialog({
  step,
  onClose,
  onErfassen,
}: {
  step: RunStep;
  onClose: () => void;
  onErfassen: (nummer: string) => void;
}) {
  const toast = useToast();
  const [nummer, setNummer] = useState('');
  const bezeichnung = NACHWEIS_LABEL[step.nachweis];

  const uebernehmen = () => {
    if (!nummer.trim()) {
      toast(`Bitte die ${bezeichnung} angeben.`);
      return;
    }
    onErfassen(nummer.trim());
    onClose();
  };

  return (
    <Modal
      titel={`${bezeichnung} erfassen`}
      sub={`${step.name} – wird am Schritt und im Export dokumentiert`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={uebernehmen}>
            Übernehmen und erledigen
          </button>
        </>
      }
    >
      <Field label={bezeichnung}>
        <TextInput
          value={nummer}
          onChange={setNummer}
          autoFocus
          placeholder={step.nachweis === 'freigabe' ? 'z.B. FG-2026-0147' : 'z.B. PB-2026-0032'}
          onKeyDown={(e) => e.key === 'Enter' && uebernehmen()}
        />
      </Field>
    </Modal>
  );
}

/** Datum, Entscheidung, Nachweis und Rücklaufziel gemeinsam erfassen. */
function AbschlussDialog({ run, step, onClose, onErfassen }: {
  run: PlanRun; step: RunStep; onClose: () => void;
  onErfassen: (run: PlanRun, step: RunStep, nummer: string) => void;
}) {
  const toast = useToast();
  const [datum, setDatum] = useState(step.istDatum ?? today());
  const [antwort, setAntwort] = useState(step.gewaehlteAntwortId ?? '');
  const [nummer, setNummer] = useState(step.nachweisNummer ?? '');
  const [direkt, setDirekt] = useState(false);
  const [korrektur, setKorrektur] = useState('5');
  const [pruefung, setPruefung] = useState('3');
  const [grund, setGrund] = useState('');
  const ablehnung = step.typ === 'entscheidung' && Boolean(antwort) && antwort !== step.antworten[0]?.id;
  const nachweis = step.nachweis !== 'keine' && !ablehnung;
  const speichern = () => {
    if (!datum || datum > today() || (step.eingangDatum && datum < step.eingangDatum)) { toast('Bitte einen tatsächlichen Ist-Termin zwischen Eingang und heute angeben.'); return; }
    if (step.typ === 'entscheidung' && !antwort) { toast('Bitte eine Antwort wählen.'); return; }
    if (nachweis && !nummer.trim()) { toast(`Bitte ${NACHWEIS_LABEL[step.nachweis]} angeben.`); return; }
    let schritt = { ...step, istDatum: datum, gewaehlteAntwortId: antwort || null };
    let lauf = run;
    if (ablehnung && direkt) {
      if (!grund.trim() || ![korrektur, pruefung].every((x) => /^\d+$/.test(x) && Number(x) <= 3650)) { toast('Bitte Begründung und gültige Fristen angeben.'); return; }
      lauf = direkteNachreichung(run, schritt, Number(korrektur), Number(pruefung), grund.trim(), () => newId('rs'));
      schritt = lauf.steps.find((s) => s.id === step.id)! as typeof schritt;
    }
    onErfassen(lauf, schritt, nummer.trim());
  };
  return <Modal titel="Schritt abschließen" sub={step.name} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={speichern}>Übernehmen und erledigen</button></>}>
    <div className="stack">
      <Field label="Tatsächlicher Ist-Termin"><TextInput type="date" value={datum} onChange={setDatum} /></Field>
      <p className="small muted">Eingang: {formatDate(step.eingangDatum)} · Fristende: {formatDate(step.sollDatum)}</p>
      {step.typ === 'entscheidung' ? <Field label="Entscheidung"><Select value={antwort} onChange={setAntwort} options={[{ value: '', label: 'Bitte wählen …' }, ...step.antworten.map((a) => ({ value: a.id, label: a.text }))]} /></Field> : null}
      {nachweis ? <Field label={NACHWEIS_LABEL[step.nachweis]}><TextInput value={nummer} onChange={setNummer} /></Field> : null}
      {ablehnung ? <><Field label="Rücklauf"><Select value={direkt ? 'direkt' : 'standard'} onChange={(v) => setDirekt(v === 'direkt')} options={[{ value: 'standard', label: 'Rücklauf laut Workflow' }, { value: 'direkt', label: 'Nachreichung direkt an diesen Prüfer' }]} /></Field>
        {direkt ? <><Callout>Die übrigen Prüfungen bleiben erhalten. Die kurze Prüffrist beginnt erst mit der tatsächlichen Nachreichung.</Callout><div className="form-grid"><Field label="Frist für Nachreichung (Tage)"><TextInput type="number" value={korrektur} onChange={setKorrektur} /></Field><Field label="Neue Prüffrist (Tage)"><TextInput type="number" value={pruefung} onChange={setPruefung} /></Field><Field label="Begründung" full><TextArea value={grund} onChange={setGrund} /></Field></div></> : null}
      </> : null}
    </div>
  </Modal>;
}
