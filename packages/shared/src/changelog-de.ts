import type { ChangelogEntry } from "./changelog.js";

export const deEntries: ChangelogEntry[] = [
  {
    version: "1.0.4",
    date: "2026-11-20",
    highlights: [
      "Das Asset Center ist ein neuer Haupteintrag in der Seitenleiste und bündelt Übersicht, Memory, Skills und Subagenten in einer gemeinsamen Werkbank statt in getrennten Einstellungswegen.",
      "Die Übersicht zeigt integrierte und benutzereigene Assets, unterscheidet globale und projektbezogene Gültigkeit und fasst aktuelle Memory- und Capability-Bestände vor dem Wechsel in einen Tab zusammen.",
      "Memory unterstützt Projekt- und Projektgruppenauswahl, Suche, schnelles Anlegen, Bearbeiten und Speichern; weiterhin gilt derselben host-verwaltete Speicher wie im bisherigen Projekt-Memory-Dialog.",
      "Der gemeinsame Memory-Editor migriert alten Text in strukturierte Einträge, normalisiert IDs und leere Inhalte und sperrt Projektwechsel bei ungespeicherten Änderungen, damit Entwürfe nicht verloren gehen.",
      "Skills nutzt den vollständigen Capability-Manager für globale und Projekt-Skills – mit Erstellen, Bearbeiten, Aktivieren, Importieren, Verschieben und Verzeichnisverwaltung statt einer reinen Leseliste.",
      "Subagenten enthält den vollständigen Katalog integrierter und eigener Agenten mit den bekannten Erstellungs-, Bearbeitungs- und Aktivierungsabläufen; Asset-Verwaltung bleibt damit an einem Ort.",
      "Besuchte Tabs bleiben montiert und die Asset-Center-Route wird erst bei Bedarf geladen; Wechsel zwischen Übersicht und Editoren löschen keine Entwürfe und laden nicht die ganze Werkbank neu.",
      "Das versionierte JSON-Backup erfasst beim Export einen frischen Host-Snapshot mit dem Memory des aktuellen Projekts oder der Projektgruppe sowie eigenen Skills und Subagenten im globalen und aktuellen Projektgültigkeitsbereich.",
      "Backups enthalten die zur Wiederherstellung nötigen Inhalte eigener Skills und Subagenten, aber keine integrierten Dokumente oder Zugangsdaten; der Renderer führt keinen zweiten persistenten Datenspeicher ein.",
      "Alle neun Sprachen enthalten die neuen Texte; responsive Layouts, Reduced-Motion-Stile und Regressionstests für Navigation, Migration, Backup und Host-Grenzen sind ebenfalls enthalten.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-11-17",
    highlights: [
      "Einstellungen › Allgemein › Darstellung bietet einen Layoutwechsel: Das ganze Fenster bleibt eine durchgehende Werkbank, während die schwebende Karte den Hauptbereich als abgerundete Karte über den Seitenleisten-Grund hebt.",
      "Die schwebende Karte integriert auch das rechte Arbeitsdock in dieselbe Fläche, sodass es als Teil der Werkbank und nicht als separate Spalte erscheint.",
      "Die Einstellungsseite selbst kann unabhängig davon als ganze Seite oder schwebende Ebene erscheinen; die Auswahl befindet sich ebenfalls unter Darstellung und ändert die Gesprächslayouts nicht.",
      "Der Denkstufen-Regler zeigt in einer klaren Kopfzeile aktuelle Stufe und Ctrl+T-Hinweis, besitzt eine grün-blaue Schiene mit sechs Stufen und fließende Lichtpartikel auf der höchsten Stufe.",
      "Ctrl+T wechselt die Denkstufe direkt im Composer, sodass sich die Modellparameter ganz per Tastatur anpassen lassen, ohne das Modellmenü zu öffnen.",
      "Die Modell-Chip im Composer verwendet das jeweilige Anbieterzeichen, wodurch sich ähnlich benannte Modelle leichter unterscheiden lassen.",
      "Projektordner lassen sich aus der Seitenleiste in VS Code, Trae oder IntelliJ IDEA öffnen; Editoren werden über PATH, übliche Installationsorte oder Windows App Paths gefunden.",
      "Ist der gewählte Editor nicht verfügbar, erscheint eine klare Fehlermeldung, statt eine andere ausführbare Datei zu raten oder ohne brauchbare Erklärung zu scheitern.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-06",
    highlights: [
      "Jedes Projekt kann ein eigenes Workspace-Symbol und eine eigene Farbe erhalten, die direkt in der Seitenleiste erscheinen und Projekte besser unterscheidbar machen.",
      "Die Dialoge zum Erstellen und Bearbeiten besitzen einen eigenen Schalter für den Workspace-Index, der sich nur für nicht benötigte Projekte deaktivieren lässt.",
      "Bei deaktiviertem Index listen @-Vorschläge keine Dateien mehr, bereits in Unterhaltungen referenzierte Pfade bleiben jedoch weiterhin auflösbar.",
      "Eine Token-Karte über dem Composer auf der Startseite zeigt die Gesamtnutzung der letzten zwölf Monate und einen täglichen Heatmap-Streifen für Aktivitätsmuster.",
      "Dieselbe Karte kann den Verbrauch nach Modell aufteilen und macht sichtbar, welche Modelle zuletzt den größten Anteil hatten.",
      "Die neue Fenster-Karte in den Einstellungen bietet Minimieren und Vollbild direkt an, ohne die Menüleiste des Betriebssystems zu benötigen.",
      "Weitere Anbieter zeigen offizielle Markenzeichen in den Listen, darunter Mistral, Kimi und Moonshot, damit Dienste bei der Modellkonfiguration leichter zu erkennen sind.",
      "Das Anwendungssymbol ist auf allen Fensterflächen vereinheitlicht, einschließlich Windows-Taskleiste und Alt+Tab-Wechsler.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-04",
    highlights: [
      "Erste Trail-Version: eine lokal-first Desktop-Werkbank für KI-Agenten, in der Projekte, Sitzungen, Reviews, Vorschauen und Agenten eine gemeinsame dauerhafte Umgebung nutzen.",
      "Trail läuft als eigenständige Anwendung statt als IDE-Erweiterung oder Terminal-Oberfläche; Workspace-Daten bleiben auf dem eigenen Rechner.",
      "Cloud-Modelle, lokale Modelle, eigene Endpunkte und kompatible APIs verwenden denselben Workflow, sodass ein Anbieterwechsel keinen Neuaufbau erfordert.",
      "Unterhaltungen werden mit Token-Verbrauch und Dauer je Runde gespeichert, sodass beim Zurückkehren sowohl Transkript als auch Ausführungskontext verfügbar sind.",
      "Parallele Unterhaltungen innerhalb eines Projekts laufen jeweils in einem eigenen Git-Worktree, um Konflikte zwischen gleichzeitigen Aufgaben zu verringern.",
      "Arbeit lässt sich an Subagenten delegieren und mehrere Worker-Sitzungen parallel koordinieren, während das Hauptgespräch die zentrale Koordinationsfläche bleibt.",
      "Plugins können Panels, Ansichten, Werkzeuge, MCP-Server, Themes und Hintergrunddienste beitragen und die Werkbank schrittweise erweitern.",
      "Verfügbar für macOS, Windows und Linux mit demselben lokal-first Agenten-Workflow auf allen drei Desktop-Plattformen.",
    ],
  },
];
