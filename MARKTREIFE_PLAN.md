# EduFlow: Analyse und Plan zur Marktreife

Stand: 3. August 2026

## Kurzurteil

EduFlow ist ein funktionsreicher, optisch überzeugender Prototyp mit einem grundsätzlich verkaufbaren Kern. Die App ist derzeit jedoch **nicht bereit für einen öffentlichen, bezahlten Betrieb**. Die wichtigsten Gründe sind kritische Sicherheits- und Berechtigungslücken, fehlende echte Abrechnung, kaum automatisierte Qualitätssicherung, eine stark überladene Architektur sowie ungelöste Datenschutz- und KI-Risiken bei Daten von Schülerinnen und Schülern.

Die richtige Strategie ist ein fokussierter Markteintritt:

1. Zuerst ein sicheres Produkt für Lehrpersonen verkaufen: Lernmaterial erzeugen, bearbeiten, differenzieren und exportieren.
2. Schülerkonten, Klassenanalysen und KI-Benotung zunächst deaktivieren oder nur in einem kontrollierten Pilot betreiben.
3. Erst nach Datenschutz-Folgenabschätzung, pädagogischer Evaluation und belastbarer Rechteverwaltung als Schulprodukt ausrollen.

Aktuelle Gesamtreife: **etwa 3 von 10**. Der Produktkern ist vorhanden; die fehlende Arbeit liegt vor allem in Sicherheit, Zuverlässigkeit, Produktfokus und Betriebsfähigkeit.

## Was bereits wertvoll ist

- Klare Schweizer Zielgruppe und Lehrplan-21-Bezug.
- Mehrere Materialtypen: Arbeitsblatt, Prüfung, Quiz, Wortschatz und Dossier.
- Umfangreicher Editor mit Differenzierung, Fragetypen, Bildern und KI-Aktionen.
- PDF-, DOCX-, PPTX- und Audio-Funktionen.
- Upload und Transformation bestehender Materialien.
- Bibliothek, Vorlagen, Lehrplanbrowser, Planung und Lernanalyse.
- Klassen-, Aufgaben- und Schülerportal als potenzieller späterer Wachstumspfad.
- PWA- und Capacitor-Vorarbeit.
- Der Produktions-Build ist grundsätzlich erfolgreich.

Diese Breite ist ein gutes Signal für Produktvision und Umsetzungsfähigkeit. Für den Verkauf ist sie momentan zugleich ein Risiko, weil zu viele sensible und wartungsintensive Funktionen gleichzeitig angeboten werden.

## Technische Bestandsaufnahme

### Aktiver Stack

- Hauptanwendung: `EduFlow/`, Next.js 14 App Router und React 18.
- Aktives Backend: Next.js Route Handler mit MongoDB, OpenAI und Gemini.
- Zusätzliches Python/FastAPI-Backend: weitgehend parallele beziehungsweise ältere Implementierung; von der aktuellen App nicht sichtbar verwendet.
- Älteres zweites Frontend: `frontend/`.
- Persistenz: MongoDB mit mindestens elf Collections (`users`, `students`, `worksheets`, `dossiers`, `classes`, `assignments`, `submissions`, `shares`, `comments`, `versions`, `learning_coach`).
- Authentifizierung: eigene JWT-Lösung, Token im Browser-`localStorage`.
- Mobile: PWA plus Capacitor-Konfiguration im Remote-Server-Modus; native Android-/iOS-Projekte fehlen.

### Repository-Zustand

- Es existieren drei überlappende Anwendungsbereiche: `EduFlow`, `frontend` und `backend`.
- `frontend_backup`, Testberichte, Transformationsberichte und historischer Code erhöhen die Unklarheit.
- Ein lokales 314-MB-Archiv liegt im Workspace; es ist zwar ignoriert, gehört aber nicht in das Projektverzeichnis.
- NPM- und Yarn-Lockfiles werden parallel geführt.
- Die App-README enthält ungelöste Git-Konfliktmarker und beschreibt einen älteren Produktstand.
- Das Paket heisst noch `nextjs-mongo-template` in Version `0.1.0`.
- Es gibt keine erkennbare CI-Pipeline, keine Deployment-Konfiguration, kein Lint-Script und kein Test-Script.

### Komplexität und Performance

- `components/AppContent.js`: 5.311 Zeilen.
- `app/api/[[...path]]/route.js`: 4.335 Zeilen und mehr als 50 Endpunkte in einem Catch-all-Handler.
- `components/views/GeneratorView.js`: 2.095 Zeilen.
- `app/schueler/page.js`: 1.672 Zeilen.
- Der geprüfte Produktions-Build dauerte 93,7 Sekunden.
- Die Hauptseite lädt 644 kB First-Load-JavaScript; allein die Route `/` umfasst 509 kB.
- Fast die gesamte Anwendung ist ein grosser Client-Tree. Dadurch werden Server Components, routebasiertes Code-Splitting und klare Sicherheitsgrenzen kaum genutzt.

### Build und Abhängigkeiten

Der Produktions-Build ist erfolgreich. Der Abhängigkeitsscan meldet jedoch 20 bekannte Schwachstellen: 3 kritisch, 12 hoch und 5 moderat. Betroffen sind unter anderem Next.js 14.2.3 sowie Axios, jsPDF/DOMPurify, XML-, Archiv- und Parser-Abhängigkeiten. Das ist vor einem öffentlichen Launch ein Stop-Kriterium.

Die Capacitor-Versionen sind inkonsistent (`core`/Plattformen 8.x, CLI 7.x). Das Manifest verweist auf PNG-App-Icons, die nicht existieren. Die konfigurierte Mobile-URL ist noch `eduflow.example.ch`.

## Kritische Launch-Blocker

### 1. Bezahlung und Berechtigungen

- `POST /api/subscribe/premium` setzt jeden eingeloggten Benutzer ohne Zahlung direkt auf Premium.
- Es gibt keine Stripe-Checkout-Session, keine Webhook-Verifikation, keine Rechnungen, keine Kündigung, keine Rückerstattung und keine belastbare Entitlement-Logik.
- „Unbegrenzt“ ist bei variablen KI-Kosten wirtschaftlich gefährlich.

Folge: Das aktuelle Geschäftsmodell kann technisch nicht funktionieren und lässt sich trivial umgehen.

### 2. Ungeschützte KI-Kosten

- `POST /api/ai/gemini` ist ohne Anmeldung, Rate Limit oder Nutzungsbudget erreichbar.
- Öffentliche Schülerabgaben können KI-Benotung auslösen und sind ebenfalls nicht rate-limitiert.
- Uploads werden im aktiven Next.js-Backend vor `arrayBuffer()` nicht hart nach Dateigrösse begrenzt.

Folge: Ein Angreifer kann API-Kosten und Speicher-/CPU-Last verursachen.

### 3. Autorisierungsfehler und IDOR-Risiken

- Beim Teilen eines Arbeitsblatts als Aufgabe wird nicht geprüft, ob das Arbeitsblatt dem Lehrer gehört.
- Beim Erstellen einer Freigabe wird nicht geprüft, ob der Freigebende Eigentümer des Materials ist.
- Kommentare und Versionslisten prüfen teilweise nur, ob irgendein gültiges Token vorhanden ist, nicht den Zugriff auf das konkrete Material.
- Wiederherstellung und Rückgaben prüfen Update-Ergebnisse nicht überall konsequent.
- Sechsstellige Klassen-/Aufgabencodes werden mit `Math.random()` erzeugt, ohne Eindeutigkeitsindex oder Rate Limit.

Folge: Daten anderer Nutzer könnten erraten, geteilt oder ausgelesen werden.

### 4. Authentifizierung

- Lehrer-JWTs liegen sieben Tage im `localStorage`, Schüler-JWTs 30 Tage. Bei XSS wären sie direkt auslesbar.
- Es gibt keine Token-Rotation, serverseitige Sitzungssperre oder „alle Geräte abmelden“.
- Das UI behauptet mindestens acht Passwortzeichen; der Lehrer-Registrierungsendpunkt erzwingt dies nicht.
- Schülerpasswörter dürfen vier Zeichen lang sein.
- Keine E-Mail-Verifikation, Passwort-zurücksetzen-Funktion, Account-Löschung oder Schutz vor Credential Stuffing.
- Google OAuth verwendet keinen sichtbaren `state`-/PKCE-Schutz im eigenen Flow und baut Redirect-Ursprünge aus Request-Headern.

Empfehlung: bewährte Session-/Auth-Lösung, sichere `HttpOnly`-, `Secure`- und `SameSite`-Cookies, OAuth `state` und PKCE sowie nachvollziehbare Sessionverwaltung.

### 5. Unsichere HTTP-Konfiguration

- `X-Frame-Options: ALLOWALL` und `Content-Security-Policy: frame-ancestors *` erlauben beliebiges Einbetten und begünstigen Clickjacking.
- CORS ist standardmässig `*`, gleichzeitig wird `Access-Control-Allow-Credentials: true` gesetzt.
- Erlaubte Header sind global teilweise `*`.
- Eine echte CSP, HSTS, `X-Content-Type-Options`, Referrer Policy und Permissions Policy fehlen.
- Interne Exception-Nachrichten werden teilweise an Clients zurückgegeben.

### 6. Eingabe- und Ausgabenvalidierung

- `zod` ist installiert, wird für API-Grenzen aber nicht genutzt.
- Themen, Fragetypen, Punktzahlen, Arraygrössen, Textlängen und KI-JSON werden nicht konsequent gegen Schemas geprüft.
- KI-Antworten werden überwiegend mit tolerantem `JSON.parse` übernommen.
- Hochgeladener Text und Schülerantworten gelangen direkt in KI-Prompts; Prompt-Injection wird nicht systematisch abgegrenzt.
- Parser für PDFs, Office-Dateien und Bilder verarbeiten nicht vertrauenswürdige Dateien im Webprozess.
- Externe Bild-URLs werden direkt in `<img>` verwendet.

### 7. Datenschutz und Minderjährige

EduFlow speichert Namen, Benutzernamen, Klassenzugehörigkeiten, Antworten, Fehlerprofile, Noten, Lernschwächen, Kommentare und KI-Auswertungen von Minderjährigen. Teile davon werden an externe KI-Anbieter übermittelt. Aktuell fehlen sichtbar:

- Datenschutzerklärung, Impressum, AGB und Auftragsbearbeitungsvertrag.
- Dateninventar, Zweck- und Rechtsgrundlagen, Löschfristen und Löschjobs.
- Self-Service-Auskunft, Export, Berichtigung und vollständige Löschung.
- Dokumentierte Unterauftragsbearbeiter und Datenstandorte.
- Datenschutz-Folgenabschätzung und Incident-Prozess.
- Mandanten-/Schultrennung und Rollenmodell.
- Einwilligungs-/Informationskonzept für Eltern, Schulen und Lernende.
- Regeln, welche Schülerdaten an OpenAI/Gemini gesendet werden dürfen.

Der EDÖB stellt klar, dass der Verantwortliche auch bei Cloud-Auftragsbearbeitung verantwortlich bleibt, Auslandbekanntgaben geregelt werden müssen und bei hohem Risiko eine Datenschutz-Folgenabschätzung erforderlich sein kann. Quellen: [EDÖB zum neuen DSG](https://www.edoeb.admin.ch/de/das-neue-datenschutzgesetz-aus-sicht-des-edob), [EDÖB zu Cloud-Computing](https://www.edoeb.admin.ch/de/datenbearbeitungen-in-der-cloud), [EDÖB zu Auftragsdatenbearbeitung](https://www.edoeb.admin.ch/de/outsourcing-auftragsdatenbearbeitung).

Für einen späteren EU-Vertrieb ist zusätzlich zu beachten: KI-Systeme zur Bewertung von Lernergebnissen oder zur Bestimmung des Bildungsniveaus können unter den Hochrisikobereich des EU AI Act fallen. Quelle: [Verordnung (EU) 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32024R1689). Das ist keine Rechtsberatung; vor dem Schulrollout sollte ein Schweizer Datenschutzjurist die konkrete Verarbeitung prüfen.

### 8. Tests und Betrieb

- Die Python-Tests sind Remote-Integrationstests gegen eine alte Preview-Domain, keine isolierten Tests des aktuellen Next.js-Backends.
- Im lokalen Python-Setup fehlt `pytest`.
- Keine Unit-, Component- oder Browser-End-to-End-Tests für den aktuellen Hauptstand.
- Keine Tests für Mandantentrennung, IDOR, Rate Limits, Payment-Webhooks oder Datenlöschung.
- Keine CI/CD-Gates, Migrationen, Seed-Strategie oder Indexverwaltung.
- Keine strukturierte Observability, Error Tracking, Audit Logs, SLOs, Runbooks oder verifizierten Backups.
- Kein Health- oder Readiness-Endpoint.

## UX- und Verkaufsanalyse

Die Startseite sieht sauber und professioneller als ein typischer Prototyp aus. Für zahlende Kunden fehlen jedoch die wichtigsten Vertrauens- und Conversion-Elemente:

- keine Preise oder Tarifübersicht;
- keine Live-Demo oder Beispielmaterialien vor Registrierung;
- keine Kundenstimmen, Pilotpartner oder pädagogischen Qualitätsnachweise;
- keine Datenschutz-, AGB-, Impressums- oder Supportlinks;
- kein Passwort-zurücksetzen;
- keine klare Aussage zu Datenstandort und KI-Anbietern;
- keine Landingpage für Schulen;
- keine Produktanalytik für Funnel, Aktivierung, Retention und Conversion;
- Login-Formular ohne sinnvolle `autocomplete`-Attribute und ohne semantische `main`-Struktur;
- der Login zeigt „mindestens 8 Zeichen“, obwohl das Backend diese Regel nicht umsetzt;
- ein 2,2-Sekunden-Start-Splash verzögert wiederkehrende Nutzer unnötig.

Das Produkt verspricht „perfekte Arbeitsblätter“ und „alle Inhalte an den Lehrplan angepasst“. Solche absoluten Qualitätsbehauptungen sind bei generativer KI schwer belegbar. Besser: „editierbare Entwürfe“, „mit Lehrplan-21-Kompetenzen verknüpft“ und sichtbare Quellen-/Prüfhinweise.

## Markt und Positionierung

Der Schweizer Markt ist bereits besetzt. Aktuelle Beispiele sind LearningLevels, Wisskit, LehrPilot, Swiss Teach AI, PHORO, TeachPilot und Neoskool. Preise liegen bei vergleichbaren Einzelprodukten grob zwischen CHF 12 und CHF 29 pro Monat; Schulangebote beginnen teilweise um CHF 2.400 pro Jahr. Beispiele: [Swiss Teach AI](https://swiss-teach.ai/), [PHORO](https://phoro.ch/), [LearningLevels](https://www.learninglevels.ch/en), [Neoskool](https://www.neoskool.com/).

EduFlow sollte daher nicht als weiterer allgemeiner „KI-Assistent für Lehrpersonen“ starten. Die stärkste Positionierung aus dem vorhandenen Code ist:

> Aus eigenem Material in wenigen Minuten zu differenzierten, Lehrplan-21-verknüpften Arbeitsblättern und Prüfungen – vollständig editierbar und druckfertig.

Das verbindet Upload, Transformation, Differenzierung, Editor und Export zu einem konkreten Job-to-be-done. Planung, Chat, Präsentationsstudio, Klassenverwaltung, Gamification und KI-Lerncoach schwächen diese Botschaft im ersten Release.

### Empfohlenes erstes Angebot

- **Free:** 5 Generierungen pro Monat, Wasserzeichen-freier Basisexport, begrenzter Verlauf.
- **Pro:** CHF 15–19 pro Monat oder CHF 149–179 pro Jahr; monatliches KI-Kontingent statt „unbegrenzt“, faire Nachkaufoption.
- **School Pilot:** 10–30 Lehrpersonen, zentrale Rechnung, AVV, Admin und Onboarding; CHF 1.500–3.000 pro Jahr abhängig vom Umfang.

Preise erst nach 10–15 Interviews und einem bezahlten Pilot finalisieren. Entscheidend ist nicht die Zahl der Features, sondern nachweisbare Zeitersparnis und Wiederverwendung pro Woche.

### Kernmetriken

- Aktivierung: erstes exportiertes Material innerhalb von 10 Minuten.
- Time-to-first-value: Zeit von Registrierung bis erfolgreichem Export.
- Woche-4-Retention aktiver Lehrpersonen.
- Materialien pro aktiver Lehrperson und Woche.
- Anteil generierter Materialien, die exportiert oder wieder geöffnet werden.
- KI-Kosten pro aktivem Nutzer und pro Export.
- Free-to-paid-Conversion.
- Supportfälle und inhaltliche Fehlermeldungen pro 100 Generierungen.

## Zielarchitektur

### Repository

Ein einziges Produktverzeichnis, ein Package Manager und eine dokumentierte Quelle der Wahrheit. Historische Frontends und das ungenutzte Python-Backend nach Prüfung in einen Archiv-Branch verschieben, nicht parallel weiterpflegen.

### Anwendung

- Next.js auf eine unterstützte, gepatchte Version migrieren.
- Routen nach Produktbereichen trennen: Auth, Materialien, Generierung, Upload, Billing, Klassen und Kollaboration.
- Datenbank-, Auth-, Billing-, AI- und Storage-Code in server-only Services kapseln.
- API-Schemas mit Zod und standardisierten Fehlerantworten.
- UI nach echten Routen und lazy geladenen Featurebereichen strukturieren.
- Server Components für Shell und initiale Reads; kleine Client Components für Interaktion.
- Hintergrundjobs für lange Generierungen, OCR, Exporte und Löschvorgänge.
- Objekt-Storage mit signierten URLs statt grosse Dateien/Blobs im Webprozess.
- Versionierte Prompt-Templates, strukturierte Ausgabeschemas, Evaluationsdatensatz und Provider-Abstraktion.

### Daten und Mandanten

- Organisation/Schule, Mitgliedschaft, Rolle und Berechtigungen als explizites Modell.
- Datenzugriff standardmässig über `tenant_id` plus Eigentümer-/Rollenprüfung.
- Eindeutige MongoDB-Indizes für E-Mail, Benutzername, Codes und IDs.
- TTL-/Löschkonzept für Uploads, Logs, Gastabgaben und KI-Zwischendaten.
- Transaktionen oder idempotente Operationen für Nutzungskontingente, Zahlungen und Abgaben.
- Keine Klarnamen oder vollständigen Schülerantworten an KI-Anbieter, wenn sie für den Zweck nicht zwingend nötig sind.

## Roadmap zur Marktreife

### Phase 0 – Produktgrenze festlegen (2–3 Tage)

Ziel: Ein klarer, verkaufbarer MVP statt eines unfertigen All-in-one-Systems.

- MVP aktiv: Registrierung, Upload, Generierung, Editor, Differenzierung, Bibliothek, PDF/DOCX, Lehrplanbezug, Billing.
- Vorläufig hinter Feature-Flags: Schülerportal, Klassen, KI-Benotung, Lerncoach, Lernprofile, Kollaboration, Studio/PPTX/Audio und native Apps.
- Eine Zielperson definieren: deutschschweizer Primar- oder Sek-I-Lehrperson; nicht beide gleichzeitig ohne Tests.
- Zehn Interviews und fünf beobachtete Workflow-Tests planen.

Abnahme: Ein einseitiges Produktversprechen, definierter MVP und Liste ausdrücklich späterer Funktionen.

### Phase 1 – Sicherheitsnotfall und Repository-Basis (1 Woche)

- Mock-Premium-Endpunkt entfernen/deaktivieren.
- Ungeschützte Gemini-Route entfernen oder mit Auth, Kontingent und Rate Limit sichern.
- Eigentums- und Rollenprüfungen für jeden Endpunkt zentralisieren.
- Uploadgrösse, MIME, Magic Bytes, Seiten-/Zeichenlimits und Zeitouts erzwingen.
- Strikte CORS- und Security-Header setzen; Clickjacking verhindern.
- Passwortrichtlinien serverseitig erzwingen; Login und öffentliche Codes rate-limitieren.
- Geheimnisse rotieren, falls sie je in Preview-/Agentenumgebungen exponiert waren.
- Kritische Dependency-Fixes einspielen; Next.js zunächst auf den gepatchten kompatiblen Stand bringen.
- CI mit Install, Lint, Typecheck, Unit-Tests, Build und Audit-Gate einrichten.

Abnahme: Kein kostenloser Premium-Upgrade, kein anonymer KI-Endpunkt, negative Autorisierungstests grün, keine bekannten kritischen Produktionsabhängigkeiten.

### Phase 2 – Auth, Datenschutz und Datenmodell (2–3 Wochen)

- Auth auf sichere Cookie-Sessions umstellen; E-Mail-Verifikation, Passwort-Reset, Sitzungsverwaltung und Account-Löschung.
- OAuth mit `state`, PKCE und erlaubten Redirect-URIs.
- Dateninventar, Bearbeitungsverzeichnis, Löschfristen und Datenflussdiagramm.
- Datenschutzerklärung, AGB, Impressum, AVV und Subprozessorliste juristisch prüfen lassen.
- Export-/Löschprozess für Nutzerdaten implementieren.
- Mandanten- und Rollenmodell einführen; MongoDB-Indizes und Migrationen versionieren.
- Datenschutz-Folgenabschätzung für Schülerprofile und KI-Benotung starten.

Abnahme: vollständiger Account-Lifecycle, getestete Tenant-Isolation, ausführbare Löschfristen und freigegebene Rechtstexte.

### Phase 3 – Architektur und Kernqualität (2–3 Wochen)

- Catch-all-API in fachliche Route Handler und Services zerlegen.
- `AppContent` und `GeneratorView` in routen- und domänenspezifische Module teilen.
- TypeScript schrittweise für Domainmodelle und APIs einführen.
- Zod-Schemas an allen API-Grenzen; validierte KI-Ausgaben.
- Einheitliches Fehlerhandling ohne interne Meldungen an Clients.
- Teure Exportbibliotheken dynamisch laden; Dashboard-/Editor-Bereiche code-splitten.
- Hauptbundle deutlich reduzieren; Ziel für `/`: unter 250 kB First Load, danach weiter optimieren.
- Fehler-, Loading-, Not-found- und Offline-Zustände ergänzen.

Abnahme: kein fachlicher Handler über etwa 300–500 Zeilen, klar getrennte Services, messbar kleineres Bundle, dokumentierte API.

### Phase 4 – Echte Monetarisierung (1–2 Wochen)

- Stripe Checkout und Billing Portal.
- Signaturgeprüfte, idempotente Webhooks.
- Serverseitige Entitlements und atomare Nutzungszähler.
- Produkte/Preise nicht im UI hardcoden; Billing-Status aus Stripe ableiten.
- Monatskontingente, Kostenlimits und Schutzschalter je AI-Provider.
- Rechnungs-, Kündigungs-, Downgrade- und Grace-Period-Flows testen.

Abnahme: Kauf, Verlängerung, fehlgeschlagene Zahlung, Kündigung und Rückerstattung in Stripe-Testmode automatisiert getestet.

### Phase 5 – Qualitätsnetz und Betrieb (2–3 Wochen)

- Unit-Tests für Rechte, Limits, Notenberechnung, KI-Parsing und Billing.
- API-Integrationstests mit lokaler Testdatenbank und gemockten AI-/Stripe-Providern.
- Browser-E2E für Registrierung, ersten Export, Upgrade, Bibliothek und Löschung.
- Security-Regressionstests für IDOR, Uploads, CORS und öffentliche Codes.
- Strukturierte Logs mit Request-ID, Error Tracking, Metriken und Kosten-Dashboard.
- Health-/Readiness-Endpunkte, Backups und Restore-Test.
- Staging/Production-Trennung, IaC/Deployment-Dokumentation und Rollback.

Abnahme: grüne CI, wiederholbare Deployments, getesteter Restore, Alarmierung für Fehlerquote, Latenz und AI-Kosten.

### Phase 6 – Verkaufsfähige Oberfläche (1–2 Wochen)

- Marketingseite mit Nutzen, Beispielen, Preisen, FAQ und Datenschutzversprechen.
- Öffentliche, anonymisierte Beispieldokumente und interaktive Demo.
- Onboarding auf „erster Export in unter 10 Minuten“ optimieren.
- Supportkanal, Feedbackfunktion und Statusseite.
- WCAG-orientierter Accessibility-Pass; Formulare, Tastatur, Fokus, Kontrast und Screenreader.
- PWA-Manifest/Icons korrigieren; native Apps bis nach Web-PMF zurückstellen.

Abnahme: fünf neue Testpersonen schaffen Registrierung bis Export ohne Hilfe; Rechtstexte und Support sind von jeder öffentlichen Seite erreichbar.

### Phase 7 – Bezahlter Pilot und Launch (4–6 Wochen)

- 10–20 Lehrpersonen oder 1–2 Schulen als Pilotpartner.
- Nicht kostenlos „testen lassen“: kleiner bezahlter Pilot mit klaren Erfolgsmetriken.
- Wöchentliche Review von Aktivierung, Retention, Kosten und Inhaltsfehlern.
- Pädagogischer Qualitätsdatensatz mit repräsentativen Fächern, Klassen und Fragetypen.
- Human-in-the-loop: KI-Inhalte immer als Entwurf kennzeichnen; Lehrerfreigabe vor Schülernutzung.
- Erst nach stabiler Nutzung öffentlicher Launch.

Abnahme: mindestens 40 % Woche-4-Retention im Pilot, wiederkehrende wöchentliche Nutzung, positive Deckungsbeiträge und keine offenen P0/P1-Sicherheitsprobleme.

## Empfohlener erster 14-Tage-Sprint

1. MVP-Scope schriftlich einfrieren und sensible Features per Flag deaktivieren.
2. Mock-Premium und anonyme Gemini-Nutzung schliessen.
3. Zentrale `requireUser`, `requireOwner` und `requireRole`-Guards einführen.
4. Rate Limits für Auth, Codes, Upload, Generierung, TTS und Schülerabgaben.
5. Harte Request-/Uploadlimits und Zod-Schemas.
6. Sicherheitsheader und enge Same-Origin-CORS-Konfiguration.
7. Next.js und direkt behebbaren Abhängigkeiten patchen.
8. Ein Package-Manager; CI mit Build, Audit und ersten Autorisierungstests.
9. Historische Verzeichnisse klassifizieren und einen Archivierungsentscheid dokumentieren.
10. Zehn Lehrpersonen für Interviews/Pilot ansprechen und den Kernworkflow beobachten.

## Umsetzungsstand – Sicherheitssprint 1 (3. August 2026)

Bereits umgesetzt:

- Mock-Premium-Endpunkt deaktiviert; Premium kann nicht mehr ohne Zahlungsanbieter freigeschaltet werden.
- Gemini- und Studio-Endpunkte verlangen eine authentifizierte Lehrperson.
- Zentrale Bearer-Token-, CORS-, Passwort-, Requestgrössen- und Fehlerhilfen eingeführt.
- Eigentümer- und Rollenprüfungen für Freigaben, Kommentare, Versionen und Klassenzuordnung verschärft.
- Persistente Rate Limits für Authentifizierung, öffentliche Zuweisungscodes, Abgaben und teure Generierung eingebaut.
- Uploads auf erlaubte Dateitypen und 10 MB begrenzt; Texte und Prompts erhalten harte Grössenlimits.
- Zufällige, kryptografisch sichere Klassen- und Zuweisungscodes statt kurzer Zeitstempel-Codes.
- Google OAuth um `state` und PKCE erweitert und Redirect-Ursprung auf `NEXT_PUBLIC_BASE_URL` gebunden.
- CORS-Wildcard entfernt sowie CSP, HSTS, Frame-, MIME- und weitere Browser-Sicherheitsheader aktiviert.
- Next.js auf 16.2.12 und React auf 19.2.8 aktualisiert; Produktions-Build erfolgreich.
- Abhängigkeits-Audit ohne bekannte Schwachstellen und sechs Security-Regressionstests eingerichtet.
- npm als verbindlicher Package-Manager im Manifest festgelegt.

Noch offen in diesem Sprint:

- Historische Verzeichnisse und den nicht mehr aktiven Python-Stack archivieren oder entfernen.
- Produktionswerte für Origins, OAuth-Redirects, Secrets und Datenbankindizes in Staging verifizieren.

## Umsetzungsstand – Sicherheitssprint 2 (3. August 2026)

Bereits umgesetzt:

- Lehrpersonen- und Schüler-Sessions von LocalStorage-JWTs auf HttpOnly-, Secure- und SameSite-Cookies migriert.
- Auth-Antworten enthalten kein JWT mehr; alte Browser-Tokens werden beim nächsten Start entfernt.
- Zentraler Logout-Endpunkt löscht die serverseitig verwendete Session-Cookie zuverlässig.
- Cookie-basierte Schreibzugriffe erhalten eine zusätzliche Origin-Prüfung gegen CSRF.
- Acht Security-Unit-Tests prüfen jetzt zusätzlich Cookie-Priorität und Cross-Site-Schreibschutz.
- Datenbankgestützter API-Test prüft Login-Cookie, anonyme Zugriffe, Rollen, fremde Materialien, CSRF und Logout.
- GitHub-Actions-CI mit gesperrter npm-Installation, Security-Tests, Dependency-Audit, Produktions-Build, MongoDB 7 und API-Integrationstest eingerichtet.

Noch offen vor Abschluss von Phase 2:

- Sitzungswiderruf pro Gerät und serverseitige Session-Tabelle statt ausschliesslich kurzlebiger signierter Cookies.
- E-Mail-Verifikation, Passwort-Reset und sichere Account-Löschung.
- Staging-Deployment mit echten OAuth-Redirects und separaten Secrets abnehmen.
- Datenexport, Löschfristen und juristisch geprüfte Datenschutzunterlagen ergänzen.

## Umsetzungsstand – Architektursprint 3 (3. August 2026)

Bereits umgesetzt:

- Lehrer-Authentifizierung vollständig aus der Catch-all-API in `/api/auth/[[...path]]` ausgelagert.
- Kollaboration mit Freigaben, Kommentaren und Versionen vollständig nach `/api/collaborate/[[...path]]` verschoben.
- Alte Auth- und Kollaborationsimplementierungen aus dem Monolithen entfernt; bestehende Client-URLs bleiben kompatibel.
- Gemeinsame MongoDB-Verbindungsverwaltung und Indexinitialisierung als Servermodul eingeführt.
- Rate-Limit-Logik aus dem Route Handler in ein wiederverwendbares Modul extrahiert.
- Zentraler Parser begrenzt JSON-Requests auf 32 KB, behandelt ungültiges JSON und validiert mit Zod.
- Strikte Zod-Schemas für Registrierung, Login, Lehrerprofil, Google OAuth, Freigaben, Kommentare und Versionen eingeführt.
- Passwort-Hashing neuer Lehrerkonten von bcrypt-Kostenfaktor 10 auf 12 erhöht.
- Schüler-Registrierung, -Login und Session-Wiederherstellung in drei statische Route Handler ausgelagert und mit Zod abgesichert.
- Neue Lehrer- und Schülerpasswörter werden einheitlich mit bcrypt-Kostenfaktor 12 gehasht.
- Zwölf Security- und Validierungstests sowie der Next.js-Produktions-Build sind erfolgreich.

Nächster Architekturschnitt:

- Materialien, Klassen und Zuweisungen in eigene Domänenrouten und Services zerlegen.
- Den verbleibenden Catch-all-Handler von aktuell rund 3.900 Zeilen schrittweise auflösen.
- Fehlerantworten und CORS in allen verbleibenden Legacy-Routen auf die gemeinsamen Serverhelfer umstellen.

## Umsetzungsstand – Klassendomäne (3. August 2026)

Bereits umgesetzt:

- Sämtliche Lehrer-Endpunkte für Klassen nach `/api/classes/[[...path]]` ausgelagert.
- Erstellen, Auflisten, Detailansicht, Löschen, Schülerentfernung und Niveauänderung verwenden zentrale Eigentümerprüfung.
- Klassenname, manuelle Schülerliste, Klassen-, Schüler- und Niveauwerte werden strikt mit Zod validiert.
- Klassen- und Schüleränderungen verwenden atomare MongoDB-Updates statt geladene Arrays ungeschützt zurückzuschreiben.
- Klassenstatistik und Schwächenanalyse berücksichtigen nur noch Zuweisungen der gewählten Klasse; klassenfremde Abgaben werden ausgeschlossen.
- KI-gestützte Klassenanalyse ist auf zehn Aufrufe pro Lehrperson und Stunde begrenzt.
- Schüler- und Abgabedaten für die Detailansicht werden gebündelt statt mit einer Datenbankabfrage pro Schüler geladen.
- Kryptografische Zugangscode-Erzeugung in ein wiederverwendbares Servermodul verschoben.
- CI-Integrationstest prüft jetzt zusätzlich, dass fremde Lehrpersonen keinen Zugriff auf Klassen erhalten.
- Vierzehn lokale Security- und Validierungstests, Dependency-Audit und Produktions-Build sind erfolgreich.
- Der Catch-all-Handler ist auf rund 3.550 Zeilen gesunken.

Nächster Architekturschnitt:

- Zuweisungen, Abgaben und manuelle Bewertung als zusammenhängende Domäne extrahieren.
- Eigentümerprüfung für jede Änderung an Zuweisung und Bewertung zentralisieren.
- Status, Frist, Niveau, Punktzahlen und Bewertungsdaten mit Zod-Schemas absichern.

## Umsetzungsstand – Zuweisungs- und Bewertungsdomäne (3. August 2026)

Bereits umgesetzt:

- Lehrer-Endpunkte für Zuweisungen nach `/api/assignments/[[...path]]` ausgelagert.
- Manuelle Korrektur und Abschluss einer Bewertung nach `/api/submissions/[[...path]]` verschoben.
- Freigabe, Statusänderung, Frist, Zielniveau, Schülerlisten, Fragenindex, Punkte und Kommentare werden mit Zod validiert.
- Jede Abgabeänderung prüft nun durchgängig die Kette Abgabe → Zuweisung → Eigentümer.
- Fremde Zuweisungen können nach einem abgelehnten Update nicht mehr über die Antwort ausgelesen werden.
- Zuweisungslisten laden Titel und Abgabezahlen gebündelt statt mit mehreren Abfragen pro Eintrag.
- Schülerabgaben verwenden wieder korrekt die HttpOnly-Session; das nach der Cookie-Migration wirkungslose Token-Feld wurde entfernt.
- Öffentliche Abgaben sind auf 128 KB, 200 Antworten, plausible Bearbeitungsdauer sowie gültige Codes und Namen begrenzt.
- Abgaben nach Ablauf der Frist werden auch beim direkten POST abgewiesen.
- Debug-Ausgaben mit Namen, Antworten und internen Zuweisungszuständen wurden entfernt.
- Fehleranalyse einer Zuweisung prüft jetzt vor dem Lesen von Schülerabgaben die Eigentümerschaft.
- CI-Integrationstest deckt fremde Zuweisungen, fremde Bewertung und erlaubte Eigentümerkorrektur ab.
- Fünfzehn lokale Security- und Validierungstests, Dependency-Audit und Produktions-Build sind erfolgreich.
- Der Catch-all-Handler ist auf rund 3.285 Zeilen gesunken.

Nächster Architekturschnitt:

- KI-Bewertung als explizit überprüfbaren Entwurf behandeln und Kosten-/Abuse-Grenzen weiter verschärfen.
- Fehleranalyse in eine eigene autorisierte Analytics-Route verschieben.

## Umsetzungsstand – Öffentliche Aufgaben und Abgaben (3. August 2026)

Bereits umgesetzt:

- Öffentlicher Aufgabenzugriff nach `/api/student/assignment/[code]` ausgelagert.
- Abgabeerstellung und automatische Bewertung nach `/api/student/submit` verschoben.
- Zugriffscode, Rate Limit, Status, Frist und Zielniveau werden serverseitig geprüft.
- Eingeloggte Schüler können dieselbe Zuweisung nicht mehrfach abgeben.
- Die Anzahl eingereichter Antworten muss exakt zur Aufgabe passen.
- Matching- und Sortieraufgaben erhalten eigene Darstellungsdaten; Musterlösungen werden nicht mehr an den Browser geliefert.
- Bewertungsantworten entfernen korrekte Lösungen, bevor sie an Schüler zurückgegeben werden.
- Offene Antworten bleiben bei fehlender oder fehlerhafter KI-Bewertung sichtbar als manuell zu prüfenfender Entwurf.
- CI-Integrationstest prüft explizit, dass der öffentliche Aufgabenpayload keine Lösung enthält.
- Produktions-Build, fünfzehn lokale Tests und Dependency-Audit sind erfolgreich.
- Der Catch-all-Handler ist auf rund 3.000 Zeilen gesunken.

## Was ausdrücklich noch nicht gebaut werden sollte

- Keine native iOS-/Android-Veröffentlichung vor Product-Market-Fit im Web.
- Kein weiterer Materialtyp, bevor bestehende Exporte zuverlässig sind.
- Keine zusätzlichen Dashboards ohne gemessenen Nutzerbedarf.
- Keine vollautomatische KI-Benotung als verbindliche Note.
- Kein „unbegrenzter“ Tarif ohne Kostenmodell und Abuse-Schutz.
- Kein Schul-Self-Service-Rollout ohne Mandantentrennung, AVV und Adminfunktionen.

## Definition von „marktreif“

EduFlow ist für einen ersten bezahlten Lehrer-Launch bereit, wenn alle folgenden Punkte erfüllt sind:

- Keine offenen kritischen oder hohen Sicherheitslücken im eigenen Code und keine ausnutzbaren kritischen Produktionsabhängigkeiten.
- Rechteprüfung und Tenant-Isolation sind automatisiert getestet.
- Echte, webhook-basierte Zahlung und serverseitige Entitlements funktionieren.
- Datenschutz-, Vertrags-, Lösch- und Supportprozesse sind vorhanden.
- Die fünf wichtigsten E2E-Flows laufen in CI.
- Backups wurden erfolgreich wiederhergestellt.
- Kosten pro Nutzer und harte Budgets sind messbar.
- Mindestens zehn Pilotnutzer haben den Kernworkflow real verwendet.
- Kritische KI-Inhalte werden vor Verwendung durch eine Lehrperson geprüft.
- Betrieb, Alarmierung und Rollback sind dokumentiert.

## Realistische Zeitschätzung

Für eine erfahrene Vollzeitperson mit punktueller Hilfe für Design, Datenschutz und Security: ungefähr **10–14 Wochen bis zu einem fokussierten bezahlten Lehrer-MVP**, zuzüglich 4–6 Wochen Pilot. Für das vollständige heutige Funktionsversprechen inklusive Schülerkonten, KI-Benotung, Schulen, Kollaboration und Mobile ist eher mit **6–12 Monaten** und mehr als einer Person zu rechnen.

Diese Schätzung setzt voraus, dass der Scope konsequent begrenzt wird. Der grösste Hebel ist nicht schnelleres Programmieren, sondern das bewusste Verschieben riskanter Nebenprodukte.

## Prüfgrenzen dieser Analyse

Geprüft wurden Repository-Struktur, aktiver Next.js-Code, das parallele Python-Backend, Konfiguration, Auth-/API-Flows, Build, Dependency-Audit, vorhandene Tests, PWA/Mobile-Konfiguration und die nicht eingeloggten Weboberflächen. Nicht geprüft werden konnten reale Produktionsdaten, Cloud-/MongoDB-Konfiguration, Providerverträge, Backups, Zahlungsanbieter, tatsächliche Last unter Produktion oder die pädagogische Richtigkeit einer repräsentativen Menge generierter Inhalte.
