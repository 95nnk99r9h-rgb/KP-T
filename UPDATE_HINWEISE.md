# KaPlan – Update Planlaufmanagement

Fassung 13 · 28. Oktober 2026

## Update einspielen

1. In der bisherigen Anwendung über **Sicherung** den aktuellen Datenbestand als JSON herunterladen.
2. Das ZIP entpacken. Der Ordner `MC-Plan-main` enthält das vollständige Projekt einschließlich aktualisiertem `app/`-Build. Für GitHub den Inhalt dieses Ordners in das bestehende Repository übernehmen, ohne eine zusätzliche Ordnerebene anzulegen. Alte Dateien unter `app/assets/` durch den beiliegenden Stand ersetzen.
3. Bei der bisherigen GitHub-Pages-Konfiguration bleiben. Die vorhandene GitHub Action prüft und baut bei einem Push auf `main`; auch der beiliegende `app/`-Build ist aktuell. Die Wege zur Veröffentlichung stehen in `README.md`.
4. Die Anwendung unter derselben Adresse im bisherigen Browser öffnen und neu laden. Der vorhandene Browserbestand wird automatisch auf Fassung 13 gehoben. **Zurücksetzen** ist dafür nicht erforderlich. Beim Wechsel von Adresse oder Browser die zuvor gesicherte JSON über **Einspielen** abgleichen.

Lokal entwickeln: `npm ci`, `npm test`, `npm run build`, anschließend `npm run preview`.
Der Quellcode benötigt wie bisher Node.js; die fertige Anwendung unter `app/` wird über einen Webserver ausgeliefert.

## Die neun Anpassungen

1. **Fristen ab tatsächlichem Eingang.** Der Abschluss eines Vorgängers setzt den Eingang seines Nachfolgers. Ab dann zählt dessen volle Frist; bei Zusammenführungen zählt der letzte erforderliche Eingang. Ohne Eingang erscheint nur eine Prognose. Beispiel: 15 Arbeitstage ab 26.10.2026 ergeben bei Mo–Fr ohne Feiertage den 16.11.2026. Der angekündigte erste Eingang und ausdrücklich manuelle Termine bleiben gesonderte Vorgaben.
2. **Terminrechner.** Links unter Vorlagen: vom Baustellentermin rückwärts oder vom Planungseingang vorwärts. Workflow und Projektkalender wählen; die Zwischenergebnisse nennen Eingang und Ende jedes Schritts. Der erste „Eingang PLM“ ist der Übergabepunkt. Weitere Transporte bis zur Baustelle müssen im Workflow enthalten sein. Es gilt der Standardweg ohne unvorhersehbare Korrekturschleifen.
3. **Neue Termine im zweiten Durchlauf.** Rückläufe beginnen am tatsächlichen Wiedereingang. Die alten Durchläufe werden archiviert.
4. **Gewichteter Fortschritt.** Fristdauer statt bloßer Schrittzahl; eine lange Prüfung zählt entsprechend mehr als ein kurzer Versand. Alle erforderlichen Schritte müssen beendet sein, bevor 100 % angezeigt werden.
5. **Nachweisführung.** Im Planlauf stehen alle Durchläufe samt Eingang, Soll, Ist, Nachweis, Bearbeitungsdauer und Erinnerungen. „Nachweis öffnen“ erlaubt die begründete Zuordnung von Verzugstagen zu Planer, Prüfer, Auftraggeber oder PLM. Unbewertete Tage bleiben ungeklärt. CSV enthält tägliche Zuordnungen; JSON den vollständigen Lauf mit Protokoll. Änderungen und Löschungen werden mit Vorher/Nachher, Zeitpunkt und Bearbeiter erfasst. Vorbereitete/kopierte E-Mails werden von einem ausdrücklich bestätigten Versand unterschieden.
6. **Parallele Schritte.** Drei zusätzliche Standardvorlagen tragen den Zusatz „(parallel)“. Die Variante mit Prüfstatik lässt fachtechnische Prüfung und Prüfstatik gleichzeitig laufen und wartet anschließend auf beide Freigaben. Versandzweige können ebenfalls gleichzeitig laufen. Im Workflow-Editor werden „Gleichzeitige Nachfolger“ und „Zusätzliche Freigaben“ festgelegt. Vorhandene Workflows und Läufe behalten ihren Aufbau; die parallele Variante für neue Läufe wählen oder bewusst über „Workflow ändern …“ neu starten.
7. **Direkte Nachreichung.** Bei einer negativen Entscheidung im Abschlussdialog „Nachreichung direkt an diesen Prüfer“ wählen, Grund sowie Korrektur- und neue Prüffrist eintragen. Andere Parallelfreigaben bleiben erhalten. Die kurze Prüffrist beginnt mit der tatsächlichen Nachreichung. Bei einer weiteren Ablehnung steht auch der ursprüngliche Rücklauf wieder zur Wahl.
8. **Mehrfachauswahl.** Links in Planläufen und Planliste. Ein Paket oder Verzeichnis wählt seine Einträge mit. „Auswahl bearbeiten“ zeigt die tatsächlich betroffenen Einträge. Planläufe: aktive Schritte abschließen, Fristen oder Zuständigkeit ändern. Planliste: Pakete zuweisen/entfernen oder Einträge löschen. Die Sammellöschung eines Verzeichnisses umfasst seine enthaltenen Pläne und deren Läufe; der Dialog führt sie vorab auf.
9. **Selektiver Import.** „Einspielen“ zeigt den Abgleich mit dem Bestand. Neue Datensätze sind markiert, Konflikte zunächst nicht. „Vergleichen“ zeigt die abweichenden Werte. Nur gewählte Datensätze und notwendige neue Bezüge werden übernommen; der Import löscht nichts aus dem Bestand. Der Abgleich erfolgt über Kennungen. Gleich benannte, unabhängig neu angelegte Objekte gelten daher als verschiedene Datensätze. Persönliche Einstellungen sind separat wählbar.

## Nachweise aus bestehenden Daten

Bereits von älteren Fassungen gelöschte Ist-Termine oder frühere Erinnerungen können nicht nachträglich rekonstruiert werden. Noch vorhandene Daten werden übernommen; die lückenlose Aufzeichnung weiterer Änderungen beginnt mit diesem Update.

Verzug wird pro Schritt und Durchlauf im Projektkalender gezählt. Parallele Verzugszeiträume können sich überlagern; ihre Summe ist kein ermittelter Gesamtprojektverzug. Die verantwortliche Seite wird fachlich mit Begründung zugeordnet, nicht automatisch aus einer Rolle abgeleitet. Offene archivierte Durchläufe wachsen nach Rücklauf/Abbruch nicht weiter.

Die vorhandene lokale Browserablage bleibt bestehen. Das Protokoll ist nachvollziehbar, aber nicht manipulationsgeschützt oder zentral archiviert. JSON-Sicherungen regelmäßig außerhalb des Browsers aufbewahren. Sollte ein Speichern wegen ausgeschöpften Browserspeichers fehlschlagen, zeigt die Anwendung einen konkreten Hinweis mit Sicherungsschaltfläche.

## Prüfung dieses Updates

- 22 automatisierte Domänentests: Ist-basierte Termine, Wochenenden/Feiertage, parallele Freigaben, Rückläufe, direkte Nachreichung, gewichteter Fortschritt, Migration, selektiver Import und Nachweise.
- TypeScript-Prüfung und Produktionsbuild.
- Browserprüfung: Terminrechner, Sammelauswahl/-änderung, Paketzuordnung, Löschung mit Protokoll, Importkonflikte und Persistenz, direkte Nachreichung, Verzugszuordnung und CSV-Export, Workflow-Editor mit parallelen Verbindungen und Validierung, schmale Ansicht.
- Die Quelltexte der Bereiche Baubetriebsplanung und Projektsteuerung sowie gemeinsame Grafik-/UI-Bausteine bleiben unverändert.
