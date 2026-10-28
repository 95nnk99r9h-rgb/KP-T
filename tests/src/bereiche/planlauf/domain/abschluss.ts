/**
 * Statuswechsel eines Prozessschritts – unabhängig von der Oberfläche.
 *
 * Die Funktion beschreibt nur, was geschehen soll (Reihenfolge der
 * Änderungen und die Rückmeldung an die Bearbeiterin); geschrieben wird in
 * der Oberfläche über `useSchrittStatus`. So verhalten sich der Planlauf und
 * die Übersichtslisten – Fristen, Dashboard, Pläne – identisch.
 */
import { archiviereSchritt, massgeblicheAntwort, rueckSprungAnwenden } from './engine';
import { ablaufGraph, bereiteSchritte, istFertig } from './ablaufGraph';
import { today } from '../../../shared/dates';
import { STEP_STATUS_LABEL, type PlanRun, type RunStep, type StepStatus } from './types';

/** Eine auszuführende Änderung am Lauf bzw. an einem Schritt. */
export type Aenderung =
  | { art: 'run'; patch: Partial<PlanRun> }
  | { art: 'step'; stepId: string; patch: Partial<RunStep> };

export type Abschluss =
  | { art: 'fehler'; meldung: string }
  /** Vor dem Erledigen muss erst die Freigabe- bzw. Prüfbericht-Nr. erfasst werden. */
  | { art: 'nachweis'; step: RunStep }
  | {
      art: 'aenderung';
      aenderungen: Aenderung[];
      meldung: string;
      /** Schritt, der nach dieser Änderung ansteht – Grundlage für eine E-Mail. */
      naechster: RunStep | null;
    };

/**
 * Ein Nachweis wird verlangt, wenn der Schritt erfolgreich abgeschlossen
 * wird: bei Entscheidungen nur bei der ersten (zustimmenden) Antwort.
 */
export function braucheNachweis(step: RunStep, status: StepStatus): boolean {
  if (status !== 'erledigt' || step.nachweis === 'keine' || step.nachweisNummer) return false;
  if (step.typ !== 'entscheidung') return true;
  return massgeblicheAntwort(step)?.id === step.antworten[0]?.id;
}

/**
 * Setzt den Status eines Schritts und rückt den Lauf ggf. weiter. Führt der
 * Schritt – über die Antwort einer Entscheidung oder das „Weiter mit“ einer
 * Aufgabe – zu einem bereits durchlaufenen Schritt zurück, beginnt dort ein
 * weiterer Durchlauf.
 */
export function schrittStatusSetzen(
  run: PlanRun,
  step: RunStep,
  status: StepStatus,
  nachweisNummer?: string,
): Abschluss {
  if (braucheNachweis(step, status) && !(nachweisNummer ?? step.nachweisNummer)?.trim()) {
    return { art: 'nachweis', step };
  }

  const abgeschlossen = status === 'erledigt' || status === 'uebersprungen';
  if (abgeschlossen && !bereiteSchritte(run.steps).some((s) => s.id === step.id) && !istFertig(step)) {
    return { art: 'fehler', meldung: 'Dieser Schritt wartet noch auf seine Vorgänger.' };
  }
  if (abgeschlossen && step.typ === 'entscheidung' && !step.gewaehlteAntwortId && status !== 'uebersprungen') {
    return { art: 'fehler', meldung: 'Bitte die Entscheidung ausdrücklich auswählen.' };
  }
  if (abgeschlossen && step.eingangDatum && (step.istDatum ?? today()) < step.eingangDatum) {
    return { art: 'fehler', meldung: 'Der Ist-Termin darf nicht vor dem tatsächlichen Eingang liegen.' };
  }
  let schritte = run.steps.map((s) => s.id === step.id ? {
    ...s, ...step, status,
    nachweisNummer: nachweisNummer ?? step.nachweisNummer,
    istDatum: abgeschlossen ? step.istDatum ?? today() : null,
  } : s);
  if (!abgeschlossen && istFertig(step)) {
    // Ein manuelles Wiederöffnen ist ein neuer Durchlauf einschließlich der
    // bereits bearbeiteten Folgeschritte; der alte Stand bleibt erhalten.
    const graph = ablaufGraph(run.steps);
    const betroffen = new Set<string>();
    const sammeln = (id: string) => {
      if (betroffen.has(id)) return;
      betroffen.add(id); graph.kanten.filter((k) => k.von === id).forEach((k) => sammeln(k.nach));
    };
    sammeln(step.id);
    schritte = run.steps.map((s) => !betroffen.has(s.id) ? s : ({
      ...archiviereSchritt(s, 'Manuell wieder geöffnet'), status: s.id === step.id ? status : 'offen',
      istDatum: null, sollDatum: null, sollManuell: false, eingangDatum: null,
      eingangOverride: s.id === step.id ? today() : null, prognoseDatum: null,
      gewaehlteAntwortId: null, nachweisNummer: null, letzteErinnerung: null,
      erinnerungen: [], verzugZuordnungen: [], verzugBis: undefined, durchlauf: s.durchlauf + 1,
    }));
  }
  const graph = ablaufGraph(schritte);
  const rueck = abgeschlossen ? graph.rueckkanten.find((k) => k.von === step.id) : undefined;
  if (rueck) {
    schritte = rueckSprungAnwenden(schritte, step.id, rueck.nach);
    return {
      art: 'aenderung', aenderungen: [{ art: 'run', patch: { steps: schritte, status: 'laufend' } }],
      meldung: `Rücksprung zu „${schritte.find((s) => s.id === rueck.nach)?.name}“ – neuer Durchlauf ab Wiedereingang.`,
      naechster: schritte.find((s) => s.id === rueck.nach) ?? null,
    };
  }
  const bereit = bereiteSchritte(schritte);
  schritte = schritte.map((s) => bereit.some((b) => b.id === s.id) && s.status === 'offen' ? { ...s, status: 'laufend' } : s);
  const fertig = ablaufGraph(schritte).schritte.length > 0 && ablaufGraph(schritte).schritte.every(istFertig);
  return {
    art: 'aenderung',
    aenderungen: [{ art: 'run', patch: { steps: schritte, status: fertig ? 'abgeschlossen' : 'laufend' } }],
    meldung: fertig ? 'Alle Schritte erledigt – Planlauf abgeschlossen.' : `„${step.name}“: ${STEP_STATUS_LABEL[status]}`,
    naechster: bereit[0] ?? null,
  };
}
