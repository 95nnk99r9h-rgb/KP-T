import { type AppData } from './types';

export const IMPORT_LISTEN = ['projects', 'roles', 'contacts', 'documents', 'templates', 'runs', 'standardRollen', 'emailVorlagen'] as const;
export type ImportListe = typeof IMPORT_LISTEN[number];
export type ImportObjekt = AppData[ImportListe][number];
export const IMPORT_LABEL: Record<ImportListe, string> = { projects: 'Projekte', roles: 'Projektfunktionen', contacts: 'Personen', documents: 'Planliste', templates: 'Workflows', runs: 'Planläufe', standardRollen: 'Standardfunktionen', emailVorlagen: 'E-Mail-Vorlagen' };
export interface AbgleichZeile { key: string; liste: ImportListe; id: string; name: string; projectId?: string | null; status: 'neu' | 'gleich' | 'konflikt'; bestand?: ImportObjekt; importiert: ImportObjekt }
function kanonisch(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(kanonisch).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.entries(x).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${kanonisch(v)}`).join(',')}}`;
  return JSON.stringify(x);
}
export function sicherungsAbgleich(bestand: AppData, eingang: AppData): AbgleichZeile[] {
  return IMPORT_LISTEN.flatMap((liste) => eingang[liste].map((objekt) => {
    const alt = bestand[liste].find((x) => x.id === objekt.id);
    const o = objekt as ImportObjekt & { nummer?: string; titel?: string; name?: string; vorname?: string; nachname?: string; projectId?: string | null };
    return { key: `${liste}:${o.id}`, liste, id: o.id, name: [o.nummer, o.titel ?? o.name ?? [o.vorname, o.nachname].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || o.id, projectId: liste === 'projects' ? o.id : o.projectId, status: !alt ? 'neu' as const : kanonisch(alt) === kanonisch(objekt) ? 'gleich' as const : 'konflikt' as const, bestand: alt, importiert: objekt };
  }));
}

function bezuege(liste: ImportListe, objekt: ImportObjekt): [ImportListe, string][] {
  const refs: [ImportListe, string][] = [];
  const o = objekt as unknown as Record<string, unknown>;
  const ref = (l: ImportListe, id: unknown) => { if (typeof id === 'string' && id) refs.push([l, id]); };
  ref('projects', o.projectId);
  if (liste === 'documents') { ref('documents', o.parentId); ref('documents', o.paketId); }
  if (liste === 'runs') {
    ref('documents', o.documentId);
    for (const s of (o.steps ?? []) as { contactId?: string | null }[]) ref('contacts', s.contactId);
  }
  if (liste === 'contacts') for (const z of (o.zuordnungen ?? []) as { roleId: string }[]) ref('roles', z.roleId);
  return refs;
}

/** ID-basierter, selektiver Import. Vorhandene Objekte werden nur bei Auswahl ersetzt. */
export function sicherungMischen(bestand: AppData, eingang: AppData, auswahl: string[]) {
  const zeilen = sicherungsAbgleich(bestand, eingang);
  const keys = new Set(auswahl);
  const automatisch = new Set<string>();
  const prufung = [...keys];
  for (let i = 0; i < prufung.length; i++) {
    const z = zeilen.find((x) => x.key === prufung[i]);
    if (!z) throw new Error('Die Importauswahl enthält einen unbekannten Eintrag.');
    for (const [liste, id] of bezuege(z.liste, z.importiert)) {
      if (bestand[liste].some((x) => x.id === id)) continue;
      const key = `${liste}:${id}`;
      if (!zeilen.some((x) => x.key === key)) throw new Error(`„${z.name}“ verweist auf einen fehlenden Eintrag (${IMPORT_LABEL[liste]}).`);
      if (!keys.has(key)) { keys.add(key); automatisch.add(key); prufung.push(key); }
    }
  }
  const neu = structuredClone(bestand);
  for (const liste of IMPORT_LISTEN) {
    const map = new Map<string, ImportObjekt>(neu[liste].map((x) => [x.id, x]));
    for (const z of zeilen.filter((z) => z.liste === liste && keys.has(z.key))) {
      // Vorherige Durchläufe und Kommunikationsnachweise gehen auch beim
      // ausdrücklich gewählten Konfliktstand nicht verloren.
      let objekt = structuredClone(z.importiert);
      if (liste === 'runs') {
        const r = objekt as AppData['runs'][number];
        const alt = bestand.runs.find((x) => x.id === r.id);
        if (alt) r.steps = r.steps.map((s) => {
          const a = alt.steps.find((x) => x.id === s.id);
          if (!a) return s;
          const historie = new Map([...(a.historie ?? []), ...(s.historie ?? [])].map((h) => [h.id, h]));
          return { ...s, historie: [...historie.values()] };
        });
        objekt = r;
      }
      map.set(z.id, objekt);
    }
    (neu as unknown as Record<ImportListe, ImportObjekt[]>)[liste] = [...map.values()];
  }
  // Nur prüfen, was importiert wird; Altbestände können gelöschte Kontakte
  // historischer Läufe enthalten. Sie sollen einen unabhängigen Import nicht blockieren.
  for (const z of zeilen.filter((z) => keys.has(z.key))) {
    const o = z.importiert as unknown as { projectId?: string; parentId?: string; paketId?: string; documentId?: string };
    for (const id of [o.parentId, o.paketId, o.documentId].filter(Boolean)) {
      const doc = neu.documents.find((x) => x.id === id);
      if (doc && o.projectId && doc.projectId !== o.projectId) throw new Error(`„${z.name}“ hat einen Bezug in ein anderes Projekt.`);
    }
    if (z.liste === 'documents') {
      const d = neu.documents.find((x) => x.id === z.id)!;
      if (d.parentId && (d.kind !== 'plan' || neu.documents.find((x) => x.id === d.parentId)?.kind !== 'verzeichnis')) throw new Error(`„${z.name}“ hat kein gültiges Planverzeichnis.`);
      if (d.paketId && (d.paketId === d.id || neu.documents.find((x) => x.id === d.paketId)?.kind !== 'paket')) throw new Error(`„${z.name}“ hat keine gültige Planpaketzuordnung.`);
    }
  }
  const aktive = new Set<string>();
  for (const r of neu.runs.filter((r) => r.status === 'laufend')) {
    if (aktive.has(r.documentId)) throw new Error('Der Import würde mehrere laufende Planläufe für denselben Eintrag erzeugen. Bitte die betroffenen Planläufe gemeinsam abgleichen.');
    aktive.add(r.documentId);
  }
  neu.gewerke = [...new Set([...bestand.gewerke, ...eingang.gewerke.filter((g) => neu.documents.some((d) => d.gewerk === g) || neu.roles.some((r) => r.gewerk === g) || neu.standardRollen.some((r) => r.gewerk === g))])];
  const ids = new Set(zeilen.filter((z) => keys.has(z.key)).map((z) => z.id));
  const audit = new Map([...(eingang.protokoll ?? []).filter((e) => ids.has(e.objektId) || Boolean(e.runId && ids.has(e.runId))), ...(bestand.protokoll ?? [])].map((e) => [e.id, e]));
  neu.protokoll = [...audit.values()];
  return { daten: neu, automatisch: [...automatisch], uebernommen: [...keys] };
}
