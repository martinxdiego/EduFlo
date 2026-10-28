# EduFlow Motion und Sicherheitsupdate

Stand: 28. Oktober 2026. Dieser Quellstand erteilt keine neue Datenbank- oder öffentliche Backendfreigabe.

## Gestaltung

Drei wiederverwendbare Intros in `components/motion/FlowIntro.js`: `paper` (6,4 Sekunden), `orbit` (6,6 Sekunden) und `focus` (5,8 Sekunden). Die Sequenzen laufen einmal und enden in einer ruhigen Komposition. Sie blockieren weder Navigation noch Eingaben und erzeugen keine künstliche Ladezeit. Keine externen Grafikdateien, Videos, Canvas-Flächen oder neuen Animationsabhängigkeiten.

Die Startseite verwendet Paper, der echte Anmeldebereich Focus und die tatsächlichen Ladezustände Orbit. `/intro` zeigt alle Varianten mit heller/dunkler Bühne, Wiederholung, Standbild und gekennzeichneter Anmeldevorschau. Die Anmeldevorschau fragt keine Zugangsdaten ab. Bestehende Auth-Handler, Pflichtfelder, Passwortanzeige und Kontoabläufe bleiben im echten Formular erhalten.

Gemeinsame Pauseneinstellung und `prefers-reduced-motion` schalten dekorative Animationen ab. Das Startseitenintro spielt pro Sitzung einmal; die Session-Initialisierung ist gegen doppelte React-Effects geschützt. Wiederholung setzt nur die Szene zurück. Auf kleinen Bildschirmen wird der Anmeldekopf kompakt, damit die Eingaben erreichbar bleiben.

Designreferenzen: [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design), [Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Motion Accessibility](https://motion.dev/docs/react-accessibility). Gestaltung und EduFlow-Zeichen sind eigenständig.

## Sicherheitsänderungen

- Next.js 16.3.8 → 16.4.3, einschliesslich konsistenter Root-Overrides und SWC-Pakete.
- Zod 3.25.76 → 4.6.7. Zehn Records erhalten explizite String-Schlüssel bei unverändert unbekannten Werten. Der verschachtelte Audience-Default verwendet `prefault`, damit spätere Parses keine veränderten Arrays vorheriger Ausgaben übernehmen.
- DOMPurify 3.4.16 → 3.4.17 im bestehenden jsPDF-Transitpfad.
- PostCSS Selector Parser 6.1.4 → 6.1.5 im Entwicklungswerkzeug.
- Keine neuen direkten Abhängigkeiten; Hosting-, Signatur-, Kosten- und Produktionsgrenzen unverändert. Keine Zod-v3-Umgehung und keine gelockerten negativen Tests.

Die tatsächlichen installierten Versionen und das Lockfile sind abgeglichen. `npm audit` und `npm audit --omit=dev` melden nach den Updates jeweils null bekannte Schwachstellen. Das beschreibt die Auditbeobachtung dieses Tages, keine unbegrenzte Sicherheitsgarantie.

## Abnahme

| Prüfung | Ergebnis |
| --- | --- |
| Material, Kosten, Sicherheit, Demo-Speicher und Exporte | 86/86 bestanden |
| Hosting und Learning-V2-Regressionen | 986/986 bestanden |
| Signatur- und Aktivierungsvertrag | 46/46 bestanden |
| Atomare Quota-/Speichertransaktionen mit lokalem MongoDB-Replikat | 1/1 bestanden |
| Gebootete Production-Grenzen, alle Funktionen aus und alle angefragt | 2/2 bestanden, beide Datenbank-Cleanups bestätigt |
| Produktionsbuild der echten App und der Browser-Demo | Beide erfolgreich |

Die beiden Demo-Speicher-/Export-Testdateien sind nun Teil des direkten Sicherheitslaufs und des verpflichtenden Release-Manifests; dessen Security-Erwartung entspricht den tatsächlich ausgeführten 86 Tests. Die unabhängige Diff-Prüfung fand keine Grenzlockerung oder widersprüchlichen Versionspins.

Lokale Browserabnahme vor Upload: Desktop, 375-px-Mobilansicht ohne horizontalen Überlauf, Variantenwechsel, helle/dunkle Bühne, Pause mit null laufenden Intro-CSS-Animationen, echte Formulareingaben nach Replay unverändert sichtbar. Der Replay-Test verwendete ausschliesslich erfundene Eingaben und sendete keine Anmeldung ab. Betriebssystemweite Reduced Motion wurde anhand der Implementierung geprüft; die Systemeinstellung des Nutzers wurde nicht verändert. Ein CSS-Hot-Reload-Fehler im Entwicklungsmodus trat während einer Stiländerung auf; die bereitgestellte Version wird zusätzlich frisch ohne Hot Reload geprüft.

Die Tests verwenden synthetische Daten und keine bezahlten Anbieteraufrufe. Lokale Logs liegen Git-ignoriert unter `.tmp/security-update/`.
