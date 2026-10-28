import { addDays, diffDays, today } from '../../../shared/dates';
import type { AenderungsEintrag, AppData, PlanRun, Project, RunStep, VerzugsSeite } from './types';

/** Alle Änderungen mit Vorher/Nachher erhalten, auch Löschungen. */
export function protokolliere(alt: AppData, neu: AppData, id: () => string): AppData {
  const eintraege: AenderungsEintrag[] = [];
  const zeitpunkt = new Date().toISOString();
  const merken = (art: string, objektId: string, vorher: unknown, nachher: unknown, projectId?: string, runId?: string) => {
    if (JSON.stringify(vorher) === JSON.stringify(nachher)) return;
    eintraege.push({ id: id(), zeitpunkt, bearbeiter: neu.bearbeiter.name, art, objektId, projectId, runId, vorher: vorher ?? null, nachher: nachher ?? null });
  };
  for (const art of ['projects', 'documents', 'contacts', 'roles', 'templates', 'emailVorlagen', 'standardRollen'] as const) {
    const vorher = new Map<string, { id: string; projectId?: string | null }>(alt[art].map((x) => [x.id, x]));
    const nachher = new Map<string, { id: string; projectId?: string | null }>(neu[art].map((x) => [x.id, x]));
    for (const k of new Set([...vorher.keys(), ...nachher.keys()])) {
      const a = vorher.get(k), n = nachher.get(k);
      merken(art, k, a, n, art === 'projects' ? k : n?.projectId ?? a?.projectId ?? undefined);
    }
  }
  for (const k of new Set([...alt.runs.map((r) => r.id), ...neu.runs.map((r) => r.id)])) {
    const a = alt.runs.find((r) => r.id === k), n = neu.runs.find((r) => r.id === k);
    const kopf = (r?: PlanRun) => r ? { ...r, steps: undefined } : null;
    merken('Planlauf', k, kopf(a), kopf(n), n?.projectId ?? a?.projectId, k);
    for (const sid of new Set([...(a?.steps ?? []).map((s) => s.id), ...(n?.steps ?? []).map((s) => s.id)])) {
      merken('Schritt', sid, a?.steps.find((s) => s.id === sid), n?.steps.find((s) => s.id === sid), n?.projectId ?? a?.projectId, k);
    }
  }
  merken('Einstellungen', 'bearbeiter', alt.bearbeiter, neu.bearbeiter);
  merken('Gewerke', 'gewerke', alt.gewerke, neu.gewerke);
  const vorhanden = new Map([...(alt.protokoll ?? []), ...(neu.protokoll ?? [])].map((e) => [e.id, e]));
  return { ...neu, protokoll: [...vorhanden.values(), ...eintraege] };
}

export function verzugsTage(step: RunStep, project: Project, stichtag = today()): string[] {
  if (!step.sollDatum || !step.eingangDatum) return [];
  const ende = step.istDatum ?? (step.verzugBis && step.verzugBis < stichtag ? step.verzugBis : stichtag);
  const tage: string[] = [];
  for (let d = addDays(step.sollDatum, 1); d <= ende; d = addDays(d, 1)) {
    const tag = new Date(`${d}T12:00:00`).getDay();
    if (!project.settings.fristenInArbeitstagen || (tag !== 0 && tag !== 6 && !project.settings.feiertage.includes(d))) tage.push(d);
  }
  return tage;
}

export function seiteAmTag(step: RunStep, datum: string): VerzugsSeite {
  return [...(step.verzugZuordnungen ?? [])].reverse().find((z) => z.von <= datum && z.bis >= datum)?.seite ?? 'ungeklaert';
}

export function dauerTage(step: RunStep, project: Project): number | null {
  if (!step.eingangDatum || !step.istDatum) return null;
  if (!project.settings.fristenInArbeitstagen) return diffDays(step.eingangDatum, step.istDatum);
  return verzugsTage({ ...step, sollDatum: step.eingangDatum }, project, step.istDatum).length;
}

export function durchlaeufe(run: PlanRun): RunStep[] {
  return nachweisZeilen(run).map((z) => z.step);
}

export function nachweisZeilen(run: PlanRun): { step: RunStep; historienId?: string }[] {
  return run.steps.flatMap((s) => [
    ...(s.historie ?? []).map((h) => ({ step: { ...h.stand, verzugBis: h.stand.verzugBis ?? h.archiviertAm.slice(0, 10) }, historienId: h.id })),
    { step: { ...s, verzugBis: s.verzugBis ?? (run.status === 'abgebrochen' ? run.abbruchDatum ?? undefined : undefined) }, historienId: undefined },
  ]);
}
