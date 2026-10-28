/** Gemeinsamer gerichteter Ablaufgraph für Termine, Ausführung und Vorschau. */
import type { ID, ProcessTemplateStep, RunStep } from './types';

export type AblaufSchritt = ProcessTemplateStep | RunStep;
export function nachfolgerIds(steps: AblaufSchritt[], step: AblaufSchritt): ID[] {
  if (step.typ !== 'entscheidung' && step.parallelNachfolger?.length) return [...new Set(step.parallelNachfolger)];
  const antwort = step.antworten.find((a) => 'gewaehlteAntwortId' in step && a.id === step.gewaehlteAntwortId) ?? step.antworten[0];
  const ziel = step.typ === 'entscheidung' && antwort ? antwort.ziel : step.naechster;
  if (ziel === 'ende') return [];
  const id = ziel ?? steps[steps.indexOf(step) + 1]?.id;
  return id ? [id] : [];
}

export function ablaufGraph<T extends AblaufSchritt>(steps: T[]) {
  const map = new Map(steps.map((s) => [s.id, s]));
  const besucht = new Set<ID>();
  const aktiv = new Set<ID>();
  const kanten: { von: ID; nach: ID }[] = [];
  const rueckkanten: { von: ID; nach: ID }[] = [];
  const besuchen = (id: ID) => {
    if (besucht.has(id) || !map.has(id)) return;
    besucht.add(id); aktiv.add(id);
    for (const nach of nachfolgerIds(steps, map.get(id)!)) {
      if (!map.has(nach)) continue;
      if (aktiv.has(nach)) { rueckkanten.push({ von: id, nach }); continue; }
      kanten.push({ von: id, nach }); besuchen(nach);
    }
    aktiv.delete(id);
  };
  if (steps[0]) besuchen(steps[0].id);
  const vorgaenger = new Map<ID, ID[]>();
  for (const id of besucht) vorgaenger.set(id, []);
  for (const k of kanten) vorgaenger.get(k.nach)!.push(k.von);
  // Zusätzliche Freigaben halten eine Zusammenführung auch während einer
  // abgelehnten Parallelprüfung geschlossen.
  for (const id of besucht) {
    const s = map.get(id)!;
    vorgaenger.set(id, [...new Set([...(vorgaenger.get(id) ?? []), ...(s.wartetAuf ?? [])])]);
  }
  const reihenfolge: T[] = [];
  const rest = steps.filter((s) => besucht.has(s.id));
  while (rest.length) {
    const i = rest.findIndex((s) => (vorgaenger.get(s.id) ?? []).every((p) => !rest.some((x) => x.id === p)));
    if (i < 0) break;
    reihenfolge.push(...rest.splice(i, 1));
  }
  return { schritte: reihenfolge, vorgaenger, kanten, rueckkanten, zyklus: rest.length > 0 };
}

export const istFertig = (s: RunStep) => s.status === 'erledigt' || s.status === 'uebersprungen';
export const istFreigegeben = (s: RunStep) => istFertig(s) &&
  (s.typ !== 'entscheidung' || s.status === 'uebersprungen' || !s.gewaehlteAntwortId || s.gewaehlteAntwortId === s.antworten[0]?.id);

export function bereiteSchritte(steps: RunStep[]): RunStep[] {
  const g = ablaufGraph(steps);
  return g.schritte.filter((s) => !istFertig(s) && (g.vorgaenger.get(s.id) ?? []).every((id) => {
    const v = steps.find((x) => x.id === id);
    return v && istFertig(v) && Boolean(v.istDatum) && (!(s.wartetAuf ?? []).includes(id) || istFreigegeben(v));
  }));
}
