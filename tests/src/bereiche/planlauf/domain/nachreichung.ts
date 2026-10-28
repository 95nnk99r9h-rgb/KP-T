import type { PlanRun, RunStep } from './types';

/** Eine Korrektur geht nur an den ablehnenden Prüfer zurück. */
export function direkteNachreichung(run: PlanRun, pruefer: RunStep, korrekturFrist: number, pruefFrist: number, grund: string, neueId: () => string): PlanRun {
  const antwort = pruefer.antworten.find((a) => a.id === pruefer.gewaehlteAntwortId);
  if (!antwort || antwort.id === pruefer.antworten[0]?.id) throw new Error('Eine Nachreichung benötigt eine ablehnende Entscheidung.');
  const id = neueId();
  const korr: RunStep = {
    id, name: `Nachreichung an ${pruefer.name}`, typ: 'aufgabe', roleName: 'Fachplaner',
    contactId: null, contactManuell: false, fristTage: korrekturFrist,
    sollDatum: null, sollManuell: false, istDatum: null, status: 'offen', abweichung: true,
    bemerkung: grund, letzteErinnerung: null, antworten: [], gewaehlteAntwortId: null,
    naechster: pruefer.id, durchlauf: 1, nachweis: 'keine', nachweisNummer: null,
    mailFrage: true, mailVorlageId: null, nachreichungFuer: pruefer.id, nachreichungFrist: pruefFrist,
    nachreichungAntwortId: antwort.id, nachreichungOriginalZiel: antwort.ziel,
  };
  return { ...run, steps: [...run.steps.map((s) => s.id === pruefer.id ? { ...pruefer, antworten: pruefer.antworten.map((a) => a.id === antwort.id ? { ...a, ziel: id } : a) } : s), korr] };
}
