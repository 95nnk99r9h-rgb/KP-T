import { addDays } from '../../../shared/dates';
import { ablaufGraph } from './ablaufGraph';
import { istEingangPLM, type ProcessTemplateStep, type ProjectSettings } from './types';

export interface TerminZeile { id: string; name: string; frist: number; eingang: string; ende: string; vorgaenger: string[] }
export function terminBerechnen(steps: ProcessTemplateStep[], datum: string, richtung: 'vorwaerts' | 'rueckwaerts', settings: Pick<ProjectSettings, 'fristenInArbeitstagen' | 'feiertage'>): TerminZeile[] {
  const g = ablaufGraph(steps);
  if (g.zyklus || g.rueckkanten.length) throw new Error('Der Standardverlauf enthält eine Schleife. Bitte zuerst einen endlichen Standardverlauf festlegen.');
  if (g.schritte.some((s) => (g.vorgaenger.get(s.id) ?? []).some((id) => !g.schritte.some((v) => v.id === id)))) throw new Error('Eine benötigte Freigabe wird im Standardverlauf nicht erreicht. Bitte den Workflow prüfen.');
  const frist = (s: ProcessTemplateStep) => s === steps[0] && istEingangPLM(s.name) ? 0 : s.fristTage;
  const add = (d: string, n: number) => addDays(d, n, settings.fristenInArbeitstagen, settings.feiertage);
  const termine = new Map<string, TerminZeile>();
  for (const s of richtung === 'vorwaerts' ? g.schritte : [...g.schritte].reverse()) {
    const vorgaenger = g.vorgaenger.get(s.id) ?? [];
    let eingang: string, ende: string;
    if (richtung === 'vorwaerts') {
      eingang = vorgaenger.map((id) => termine.get(id)?.ende ?? datum).sort().at(-1) ?? datum;
      ende = add(eingang, frist(s));
    } else {
      const folgende = g.schritte.filter((x) => (g.vorgaenger.get(x.id) ?? []).includes(s.id));
      ende = folgende.map((x) => termine.get(x.id)?.eingang ?? datum).sort()[0] ?? datum;
      eingang = add(ende, -frist(s));
      // Ein Ziel am Wochenende/Feiertag ist eine Obergrenze. Die Vorwärts-
      // rechnung darf sie auch bei gemischten Null-Tage-Schritten nie reißen.
      while (add(eingang, frist(s)) > ende) eingang = addDays(eingang, -1);
      if (frist(s) > 0) ende = add(eingang, frist(s));
    }
    termine.set(s.id, { id: s.id, name: s.name, frist: frist(s), eingang, ende, vorgaenger });
  }
  return g.schritte.map((s) => termine.get(s.id)!);
}
