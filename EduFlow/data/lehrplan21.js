// ============================================================
// LEHRPLAN 21 – Vollständige Kompetenzen
// Alle Zyklen, Fachbereiche und Kompetenzbereiche
// ============================================================

export const LEHRPLAN_CYCLES = [
  {
    id: 'z1', name: 'Zyklus 1', grades: '1.–2. Klasse', color: 'emerald',
    areas: [
      // ── DEUTSCH ──
      { id: 'z1-d', name: 'Deutsch', icon: '📖', competencies: [
        { code: 'D.1.A.1', name: 'Hören', description: 'Laute, Silben und Reime erkennen und unterscheiden', level: 'Grundanspruch', goals: ['Einfache Anweisungen verstehen', 'Geschichten aufmerksam zuhören', 'Geräusche und Laute unterscheiden'], sequence: ['Quiz: Reimwörter erkennen', 'Arbeitsblatt: Silben klatschen', 'Prüfung: Hörverständnis'],
          subCompetencies: [
            { code: 'D.1.A.1.a', name: 'Laute unterscheiden', description: 'Einzelne Laute in Wörtern hören und unterscheiden' },
            { code: 'D.1.A.1.b', name: 'Silben erkennen', description: 'Wörter in Silben gliedern und Silben zählen' },
            { code: 'D.1.A.1.c', name: 'Reime bilden', description: 'Reimwörter erkennen und eigene Reime bilden' },
          ]
        },
        { code: 'D.1.B.1', name: 'Sprechen', description: 'Sich verständlich und zusammenhängend ausdrücken', level: 'Grundanspruch', goals: ['In Sätzen erzählen', 'Bilder beschreiben', 'Erlebnisse nacherzählen'], sequence: ['Arbeitsblatt: Bildbeschreibung', 'Quiz: Satzanfänge'],
          subCompetencies: [
            { code: 'D.1.B.1.a', name: 'Erzählen', description: 'Erlebnisse chronologisch erzählen' },
            { code: 'D.1.B.1.b', name: 'Beschreiben', description: 'Gegenstände und Bilder beschreiben' },
            { code: 'D.1.B.1.c', name: 'Dialogisch sprechen', description: 'In Gesprächen auf andere eingehen' },
          ]
        },
        { code: 'D.2.A.1', name: 'Lesen – Grundfertigkeiten', description: 'Wörter und kurze Texte lesen und verstehen', level: 'Grundanspruch', goals: ['Buchstaben kennen', 'Einfache Wörter erlesen', 'Kurze Sätze sinnentnehmend lesen'], sequence: ['Arbeitsblatt: Buchstaben-Zuordnung', 'Quiz: Wörter lesen', 'Prüfung: Leseverständnis'],
          subCompetencies: [
            { code: 'D.2.A.1.a', name: 'Buchstabenkenntnis', description: 'Alle Buchstaben kennen und den Lauten zuordnen' },
            { code: 'D.2.A.1.b', name: 'Wörter erlesen', description: 'Bekannte Wörter auf einen Blick erkennen' },
            { code: 'D.2.A.1.c', name: 'Leseflüssigkeit', description: 'Kurze Texte fliessend vorlesen' },
          ]
        },
        { code: 'D.2.B.1', name: 'Lesen – Verstehen', description: 'Texte verstehen und darüber nachdenken', level: 'Grundanspruch', goals: ['Bilder und Text verbinden', 'Einfache Fragen zum Text beantworten', 'Texte nacherzählen'], sequence: ['Arbeitsblatt: Leseverständnis', 'Quiz: Was passiert im Text?'] },
        { code: 'D.4.A.1', name: 'Schreiben – Grundfertigkeiten', description: 'Buchstaben und Wörter abschreiben und schreiben', level: 'Grundanspruch', goals: ['Buchstaben korrekt formen', 'Einfache Wörter schreiben', 'Kurze Sätze bilden'], sequence: ['Arbeitsblatt: Buchstaben üben', 'Arbeitsblatt: Wörter schreiben'],
          subCompetencies: [
            { code: 'D.4.A.1.a', name: 'Handschrift', description: 'Buchstaben formklar schreiben' },
            { code: 'D.4.A.1.b', name: 'Abschreiben', description: 'Wörter und kurze Sätze fehlerfrei abschreiben' },
          ]
        },
        { code: 'D.4.B.1', name: 'Schreiben – Textproduktion', description: 'Eigene kurze Texte verfassen', level: 'Grundanspruch', goals: ['Kurze Sätze schreiben', 'Zu Bildern schreiben', 'Eigene Geschichten erfinden'], sequence: ['Arbeitsblatt: Bildgeschichte schreiben', 'Arbeitsblatt: Sätze ergänzen'] },
        { code: 'D.5.A.1', name: 'Sprache im Fokus – Wortlehre', description: 'Sprachliche Regelmässigkeiten entdecken', level: 'Grundanspruch', goals: ['Einzahl und Mehrzahl unterscheiden', 'Wortarten entdecken', 'Satzzeichen kennenlernen'], sequence: ['Quiz: Einzahl/Mehrzahl', 'Arbeitsblatt: Nomen erkennen'],
          subCompetencies: [
            { code: 'D.5.A.1.a', name: 'Nomen', description: 'Nomen erkennen und gross schreiben' },
            { code: 'D.5.A.1.b', name: 'Verben', description: 'Verben als Tuwörter erkennen' },
            { code: 'D.5.A.1.c', name: 'Adjektive', description: 'Adjektive als Wiewörter erkennen' },
          ]
        },
        { code: 'D.5.B.1', name: 'Sprache im Fokus – Rechtschreibung', description: 'Grundlegende Rechtschreibregeln anwenden', level: 'Grundanspruch', goals: ['Lautgetreu schreiben', 'Grossschreibung von Satzanfängen', 'Häufige Wörter richtig schreiben'], sequence: ['Arbeitsblatt: Rechtschreibung', 'Quiz: Gross/Kleinschreibung'] },
      ]},

      // ── MATHEMATIK ──
      { id: 'z1-m', name: 'Mathematik', icon: '🔢', competencies: [
        { code: 'MA.1.A.1', name: 'Zahl und Variable – Operieren', description: 'Zahlen bis 100 verstehen und anwenden', level: 'Grundanspruch', goals: ['Zahlen bis 20 lesen und schreiben', 'Zahlen vergleichen und ordnen', 'Einfache Additionen und Subtraktionen'], sequence: ['Arbeitsblatt: Zahlen schreiben', 'Quiz: Grösser/Kleiner', 'Prüfung: Rechnen bis 20'],
          subCompetencies: [
            { code: 'MA.1.A.1.a', name: 'Zahlen bis 20', description: 'Im Zahlenraum bis 20 addieren und subtrahieren' },
            { code: 'MA.1.A.1.b', name: 'Zahlen bis 100', description: 'Zahlen bis 100 lesen, schreiben und vergleichen' },
            { code: 'MA.1.A.1.c', name: 'Verdoppeln/Halbieren', description: 'Verdoppeln und Halbieren als Rechenstrategien nutzen' },
          ]
        },
        { code: 'MA.1.B.1', name: 'Zahl und Variable – Erforschen', description: 'Zahlbeziehungen und Muster entdecken', level: 'Grundanspruch', goals: ['Zahlenmuster erkennen', 'Nachbarzahlen bestimmen', 'Gerade und ungerade Zahlen unterscheiden'], sequence: ['Arbeitsblatt: Zahlenmuster', 'Quiz: Gerade/Ungerade'] },
        { code: 'MA.2.A.1', name: 'Form und Raum – Operieren', description: 'Geometrische Formen erkennen und benennen', level: 'Grundanspruch', goals: ['Grundformen erkennen', 'Formen vergleichen', 'Einfache Muster legen'], sequence: ['Quiz: Formen erkennen', 'Arbeitsblatt: Formen zuordnen'],
          subCompetencies: [
            { code: 'MA.2.A.1.a', name: 'Formen benennen', description: 'Kreis, Dreieck, Viereck, Rechteck benennen' },
            { code: 'MA.2.A.1.b', name: 'Formen sortieren', description: 'Formen nach Eigenschaften sortieren' },
            { code: 'MA.2.A.1.c', name: 'Muster legen', description: 'Muster mit Formen legen und fortsetzen' },
          ]
        },
        { code: 'MA.2.B.1', name: 'Form und Raum – Erforschen', description: 'Räumliche Beziehungen erkunden', level: 'Grundanspruch', goals: ['Lagebeziehungen beschreiben', 'Spiegelungen erkennen', 'Einfache Pläne lesen'], sequence: ['Arbeitsblatt: Lage beschreiben', 'Quiz: Spiegelungen'] },
        { code: 'MA.3.A.1', name: 'Grössen, Funktionen, Daten – Operieren', description: 'Grössen vergleichen und messen', level: 'Grundanspruch', goals: ['Längen vergleichen', 'Zeitabschnitte kennen', 'Einfache Daten sammeln'], sequence: ['Arbeitsblatt: Längen vergleichen', 'Quiz: Uhrzeit'],
          subCompetencies: [
            { code: 'MA.3.A.1.a', name: 'Längen', description: 'Längen mit Körpermassen und einfachen Messgeräten messen' },
            { code: 'MA.3.A.1.b', name: 'Zeit', description: 'Uhrzeiten lesen, Tageszeiten und Wochentage kennen' },
            { code: 'MA.3.A.1.c', name: 'Geld', description: 'Münzen und Noten kennen, einfache Beträge berechnen' },
          ]
        },
        { code: 'MA.3.B.1', name: 'Grössen, Funktionen, Daten – Erforschen', description: 'Daten sammeln und darstellen', level: 'Grundanspruch', goals: ['Strichlisten führen', 'Einfache Diagramme lesen', 'Informationen aus Tabellen entnehmen'], sequence: ['Arbeitsblatt: Strichliste', 'Quiz: Diagramme lesen'] },
      ]},

      // ── NMG ──
      { id: 'z1-nmg', name: 'NMG', icon: '🌍', competencies: [
        { code: 'NMG.1.1', name: 'Identität, Körper, Gesundheit', description: 'Sich selber und andere wahrnehmen', level: 'Grundanspruch', goals: ['Über sich erzählen', 'Gefühle benennen', 'Regeln im Zusammenleben verstehen'], sequence: ['Arbeitsblatt: Über mich', 'Quiz: Gefühle erkennen'],
          subCompetencies: [
            { code: 'NMG.1.1.a', name: 'Körper kennen', description: 'Körperteile benennen und Funktionen kennen' },
            { code: 'NMG.1.1.b', name: 'Gesundheit', description: 'Gesunde Ernährung und Hygiene verstehen' },
          ]
        },
        { code: 'NMG.1.2', name: 'Gemeinschaft & Zusammenleben', description: 'In der Gemeinschaft leben und mitbestimmen', level: 'Grundanspruch', goals: ['Regeln aushandeln', 'Konflikte friedlich lösen', 'Verschiedenheit respektieren'], sequence: ['Arbeitsblatt: Regeln', 'Quiz: Zusammenleben'] },
        { code: 'NMG.2.1', name: 'Tiere, Pflanzen, Lebensräume', description: 'Tiere und Pflanzen in der Umgebung erkunden', level: 'Grundanspruch', goals: ['Tiere benennen und beschreiben', 'Pflanzen beobachten', 'Lebensräume unterscheiden'], sequence: ['Quiz: Tiere erkennen', 'Arbeitsblatt: Pflanzen beobachten', 'Prüfung: Lebensräume'],
          subCompetencies: [
            { code: 'NMG.2.1.a', name: 'Tiere beobachten', description: 'Tiere in der näheren Umgebung beobachten und beschreiben' },
            { code: 'NMG.2.1.b', name: 'Pflanzen kennen', description: 'Häufige Pflanzen benennen und unterscheiden' },
            { code: 'NMG.2.1.c', name: 'Lebensräume', description: 'Verschiedene Lebensräume erkunden (Wald, Wiese, Wasser)' },
          ]
        },
        { code: 'NMG.2.2', name: 'Wachstum & Entwicklung', description: 'Wachstum und Veränderungen bei Lebewesen beobachten', level: 'Grundanspruch', goals: ['Wachstumsphasen kennen', 'Jahreszeiten und Natur', 'Keimung beobachten'], sequence: ['Arbeitsblatt: Jahreszeitenbuch', 'Quiz: Wachstum'] },
        { code: 'NMG.3.1', name: 'Stoffe, Energie, Bewegung', description: 'Materialien untersuchen und Eigenschaften beschreiben', level: 'Grundanspruch', goals: ['Materialien benennen', 'Eigenschaften vergleichen', 'Einfache Versuche durchführen'], sequence: ['Arbeitsblatt: Materialien sortieren'],
          subCompetencies: [
            { code: 'NMG.3.1.a', name: 'Materialien erkunden', description: 'Verschiedene Materialien mit allen Sinnen erkunden' },
            { code: 'NMG.3.1.b', name: 'Wasser', description: 'Wasser in verschiedenen Zuständen erleben' },
          ]
        },
        { code: 'NMG.4.1', name: 'Phänomene der Natur', description: 'Naturphänomene beobachten und beschreiben', level: 'Grundanspruch', goals: ['Wetter beobachten', 'Tag und Nacht verstehen', 'Jahreszeiten kennen'], sequence: ['Arbeitsblatt: Wetterbeobachtung', 'Quiz: Jahreszeiten'] },
        { code: 'NMG.5.1', name: 'Technische Entwicklungen', description: 'Technische Geräte und Erfindungen erkunden', level: 'Grundanspruch', goals: ['Werkzeuge kennen', 'Einfache Maschinen verstehen', 'Technische Geräte im Alltag'], sequence: ['Arbeitsblatt: Werkzeuge', 'Quiz: Technik im Alltag'] },
        { code: 'NMG.6.1', name: 'Arbeit & Produktion', description: 'Berufe und Arbeitswelt kennenlernen', level: 'Grundanspruch', goals: ['Berufe kennen', 'Arbeitsabläufe verstehen', 'Tauschen und Handeln'], sequence: ['Arbeitsblatt: Berufe', 'Quiz: Wer arbeitet wo?'] },
        { code: 'NMG.7.1', name: 'Lebensweisen & Kulturen', description: 'Unterschiedliche Lebensweisen kennenlernen', level: 'Grundanspruch', goals: ['Feste und Bräuche', 'Unterschiedliche Familien', 'Kulturelle Vielfalt'], sequence: ['Arbeitsblatt: Feste', 'Quiz: Kulturen'] },
        { code: 'NMG.8.1', name: 'Menschen nutzen Räume', description: 'Den eigenen Lebensraum erkunden', level: 'Grundanspruch', goals: ['Schulweg kennen', 'Orte in der Umgebung beschreiben', 'Einfache Pläne lesen'], sequence: ['Arbeitsblatt: Mein Schulweg', 'Quiz: Orte'] },
        { code: 'NMG.9.1', name: 'Zeit, Dauer, Wandel', description: 'Zeitbegriffe und Veränderungen verstehen', level: 'Grundanspruch', goals: ['Gestern, heute, morgen', 'Zeitliche Reihenfolgen ordnen', 'Früher und heute vergleichen'], sequence: ['Arbeitsblatt: Zeitstrahl', 'Quiz: Früher und heute'] },
      ]},

      // ── BILDNERISCHES GESTALTEN ──
      { id: 'z1-bg', name: 'Bildnerisches Gestalten', icon: '🎨', competencies: [
        { code: 'BG.1.A.1', name: 'Wahrnehmung & Kommunikation – Wahrnehmen', description: 'Bilder und Kunstwerke betrachten und besprechen', level: 'Grundanspruch', goals: ['Bilder beschreiben', 'Farben und Formen benennen', 'Eigene Eindrücke mitteilen'], sequence: ['Arbeitsblatt: Bild beschreiben', 'Quiz: Farben erkennen'] },
        { code: 'BG.1.B.1', name: 'Wahrnehmung & Kommunikation – Sich ausdrücken', description: 'Eigene Vorstellungen und Erlebnisse darstellen', level: 'Grundanspruch', goals: ['Erlebnisse zeichnen', 'Fantasiebilder gestalten', 'Gefühle in Bildern ausdrücken'], sequence: ['Arbeitsblatt: Mein Erlebnis', 'Arbeitsblatt: Fantasiebild'] },
        { code: 'BG.2.A.1', name: 'Prozesse & Produkte – Experimentieren', description: 'Mit verschiedenen Materialien und Techniken experimentieren', level: 'Grundanspruch', goals: ['Malen mit verschiedenen Farben', 'Collagen gestalten', 'Drucktechniken ausprobieren'], sequence: ['Arbeitsblatt: Farbexperimente', 'Arbeitsblatt: Collage'] },
        { code: 'BG.2.B.1', name: 'Prozesse & Produkte – Gestalten', description: 'Bildnerische Arbeiten planen und umsetzen', level: 'Grundanspruch', goals: ['Bilder farbig gestalten', 'Verschiedene Materialien nutzen', 'Eigene Arbeiten beurteilen'], sequence: ['Arbeitsblatt: Mein Kunstwerk'] },
        { code: 'BG.3.A.1', name: 'Kontexte & Orientierung', description: 'Kunst und Bilder in der Umgebung entdecken', level: 'Grundanspruch', goals: ['Bilder in der Umwelt finden', 'Künstler kennenlernen', 'Museum/Ausstellung besuchen'], sequence: ['Quiz: Kunst in der Umgebung'] },
      ]},

      // ── TEXTILES UND TECHNISCHES GESTALTEN ──
      { id: 'z1-ttg', name: 'Textiles und Technisches Gestalten', icon: '✂️', competencies: [
        { code: 'TTG.1.A.1', name: 'Wahrnehmung & Kommunikation', description: 'Objekte und Materialien erkunden', level: 'Grundanspruch', goals: ['Materialien ertasten', 'Alltagsgegenstände untersuchen', 'Funktionen entdecken'], sequence: ['Arbeitsblatt: Materialien erkunden'] },
        { code: 'TTG.2.A.1', name: 'Prozesse – Ideen entwickeln', description: 'Ideen für gestalterische Arbeiten entwickeln', level: 'Grundanspruch', goals: ['Eigene Ideen sammeln', 'Skizzen anfertigen', 'Gestaltungsaufgaben verstehen'], sequence: ['Arbeitsblatt: Meine Idee'] },
        { code: 'TTG.2.B.1', name: 'Prozesse – Planen & Herstellen', description: 'Einfache Werkstücke planen und herstellen', level: 'Grundanspruch', goals: ['Arbeitsschritte planen', 'Werkzeuge sachgerecht einsetzen', 'Sorgfältig arbeiten'], sequence: ['Arbeitsblatt: Werkstück planen'] },
        { code: 'TTG.2.C.1', name: 'Textil – Verfahren', description: 'Textile Grundverfahren anwenden', level: 'Grundanspruch', goals: ['Flechten und Weben', 'Schneiden und Kleben', 'Einfache Näharbeiten'], sequence: ['Arbeitsblatt: Weben', 'Arbeitsblatt: Nähen Grundstich'] },
        { code: 'TTG.2.D.1', name: 'Technisch – Verfahren', description: 'Technische Grundverfahren anwenden', level: 'Grundanspruch', goals: ['Sägen und Feilen', 'Bohren und Schrauben', 'Verbindungen herstellen'], sequence: ['Arbeitsblatt: Werkzeuge kennen'] },
      ]},

      // ── MUSIK ──
      { id: 'z1-mu', name: 'Musik', icon: '🎵', competencies: [
        { code: 'MU.1.A.1', name: 'Singen und Sprechen', description: 'Lieder singen und Verse sprechen', level: 'Grundanspruch', goals: ['Lieder auswendig singen', 'Rhythmisch sprechen', 'Stimmexperimente machen'], sequence: ['Arbeitsblatt: Liedtext lernen', 'Quiz: Rhythmus klatschen'] },
        { code: 'MU.2.A.1', name: 'Hören und Sich-Orientieren', description: 'Klänge und Musik bewusst hören', level: 'Grundanspruch', goals: ['Instrumente am Klang erkennen', 'Laut-leise unterscheiden', 'Hoch-tief unterscheiden'], sequence: ['Quiz: Instrumente erkennen', 'Arbeitsblatt: Klangdetektiv'] },
        { code: 'MU.3.A.1', name: 'Bewegen und Tanzen', description: 'Sich zu Musik bewegen', level: 'Grundanspruch', goals: ['Im Takt klatschen', 'Einfache Tanzschritte lernen', 'Bewegungslieder umsetzen'], sequence: ['Arbeitsblatt: Bewegungslied'] },
        { code: 'MU.4.A.1', name: 'Musizieren', description: 'Mit Instrumenten musizieren', level: 'Grundanspruch', goals: ['Körperinstrumente einsetzen', 'Rhythmusinstrumente spielen', 'Einfache Begleitungen spielen'], sequence: ['Arbeitsblatt: Rhythmusinstrumente'] },
        { code: 'MU.5.A.1', name: 'Gestaltungsprozesse', description: 'Musikalische Ideen gestalten', level: 'Grundanspruch', goals: ['Klanggeschichten erfinden', 'Lieder begleiten', 'Eigene Rhythmen erfinden'], sequence: ['Arbeitsblatt: Klanggeschichte'] },
        { code: 'MU.6.A.1', name: 'Praxis des musikalischen Wissens', description: 'Musikalische Grundbegriffe kennenlernen', level: 'Grundanspruch', goals: ['Notenwerte kennen', 'Taktarten erfahren', 'Musikalische Zeichen lesen'], sequence: ['Quiz: Notenwerte', 'Arbeitsblatt: Noten lesen'] },
      ]},

      // ── BEWEGUNG UND SPORT ──
      { id: 'z1-bs', name: 'Bewegung und Sport', icon: '⚽', competencies: [
        { code: 'BS.1.A.1', name: 'Laufen, Springen, Werfen', description: 'Grundbewegungen vielseitig ausführen', level: 'Grundanspruch', goals: ['Verschiedene Laufformen', 'Weit und hoch springen', 'Werfen und Fangen'], sequence: ['Arbeitsblatt: Bewegungsformen'] },
        { code: 'BS.2.A.1', name: 'Bewegen an Geräten', description: 'An Geräten klettern, balancieren, schwingen', level: 'Grundanspruch', goals: ['Balancieren auf der Bank', 'An Geräten klettern', 'Rollen und Drehen'], sequence: ['Arbeitsblatt: Geräteparcours'] },
        { code: 'BS.3.A.1', name: 'Darstellen und Tanzen', description: 'Sich ausdrücken und Bewegungen gestalten', level: 'Grundanspruch', goals: ['Bewegungen nachmachen', 'Einfache Tänze lernen', 'Rhythmisch bewegen'], sequence: ['Arbeitsblatt: Tanzschritte'] },
        { code: 'BS.4.A.1', name: 'Spielen', description: 'In Spielen fair miteinander umgehen', level: 'Grundanspruch', goals: ['Fangspiele spielen', 'Regeln einhalten', 'In der Gruppe spielen'], sequence: ['Arbeitsblatt: Spielregeln'] },
        { code: 'BS.5.A.1', name: 'Gleiten, Rollen, Fahren', description: 'Sich mit Geräten fortbewegen', level: 'Grundanspruch', goals: ['Rollbrett fahren', 'Schlittschuhe laufen', 'Gleichgewicht halten'], sequence: ['Arbeitsblatt: Gleiten und Rollen'] },
        { code: 'BS.6.A.1', name: 'Bewegen im Wasser', description: 'Sich sicher im Wasser bewegen', level: 'Grundanspruch', goals: ['Wassergewöhnung', 'Gleiten und Tauchen', 'Schwimmtechniken anbahnen'], sequence: ['Arbeitsblatt: Schwimmtest'] },
      ]},

      // ── MEDIEN UND INFORMATIK ──
      { id: 'z1-mi', name: 'Medien und Informatik', icon: '💻', competencies: [
        { code: 'MI.1.1', name: 'Medien – Leben in der Mediengesellschaft', description: 'Erfahrungen mit Medien sammeln und darüber sprechen', level: 'Grundanspruch', goals: ['Medien im Alltag benennen', 'Eigene Mediennutzung beschreiben', 'Realität und Fiktion unterscheiden'], sequence: ['Quiz: Medien erkennen', 'Arbeitsblatt: Meine Medien'] },
        { code: 'MI.1.2', name: 'Medien – Sich schützen', description: 'Grundregeln für den Umgang mit Medien kennen', level: 'Grundanspruch', goals: ['Regeln für Mediennutzung', 'Persönliche Daten schützen', 'Unangenehmes melden'], sequence: ['Arbeitsblatt: Medienregeln'] },
        { code: 'MI.2.1', name: 'Informatik – Datenstrukturen', description: 'Daten ordnen und darstellen', level: 'Grundanspruch', goals: ['Informationen sammeln', 'Einfach sortieren und ordnen', 'Symbole und Codes nutzen'], sequence: ['Arbeitsblatt: Sortieren'] },
        { code: 'MI.2.2', name: 'Informatik – Algorithmen', description: 'Abläufe erkennen und beschreiben', level: 'Grundanspruch', goals: ['Handlungsabläufe beschreiben', 'Einfache Anleitungen befolgen', 'Muster erkennen'], sequence: ['Arbeitsblatt: Ablauf beschreiben', 'Quiz: Muster erkennen'] },
      ]},
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // ZYKLUS 2
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'z2', name: 'Zyklus 2', grades: '3.–6. Klasse', color: 'blue',
    areas: [
      // ── DEUTSCH ──
      { id: 'z2-d', name: 'Deutsch', icon: '📖', competencies: [
        { code: 'D.1.A.2', name: 'Hören – Verstehen', description: 'Informationen aus Hörtexten gezielt entnehmen', level: 'Grundanspruch', goals: ['Hauptgedanken erfassen', 'Reihenfolge von Ereignissen wiedergeben', 'Auf Argumente eingehen'], sequence: ['Quiz: Hörverständnis', 'Arbeitsblatt: Notizen machen', 'Prüfung: Hörtext verstehen'],
          subCompetencies: [
            { code: 'D.1.A.2.a', name: 'Kernaussagen erfassen', description: 'Wesentliche Informationen aus Hörtexten herausfiltern' },
            { code: 'D.1.A.2.b', name: 'Notizen machen', description: 'Beim Zuhören Notizen zu wichtigen Punkten machen' },
          ]
        },
        { code: 'D.1.B.2', name: 'Sprechen – Monologisch', description: 'Zusammenhängend über Erfahrungen und Sachverhalte berichten', level: 'Grundanspruch', goals: ['Vorträge halten', 'Geschichten nacherzählen', 'Diskussionen führen'], sequence: ['Arbeitsblatt: Vortrag vorbereiten', 'Quiz: Redewendungen'],
          subCompetencies: [
            { code: 'D.1.B.2.a', name: 'Vortragen', description: 'Kurze Vorträge strukturiert vortragen' },
            { code: 'D.1.B.2.b', name: 'Erzählen', description: 'Erlebnisse und Geschichten spannend erzählen' },
          ]
        },
        { code: 'D.1.C.2', name: 'Sprechen – Dialogisch', description: 'In Gesprächen und Diskussionen aktiv teilnehmen', level: 'Grundanspruch', goals: ['Gesprächsregeln einhalten', 'Nachfragen stellen', 'Eigene Meinung begründen'], sequence: ['Arbeitsblatt: Diskussionsregeln', 'Quiz: Argumentieren'] },
        { code: 'D.2.A.2', name: 'Lesen – Grundfertigkeiten', description: 'Texte flüssig und genau lesen', level: 'Grundanspruch', goals: ['Leseflüssigkeit steigern', 'Lesetempo anpassen', 'Betont vorlesen'], sequence: ['Arbeitsblatt: Lesetraining', 'Prüfung: Vorlesen'] },
        { code: 'D.2.B.1', name: 'Lesen – Verstehen', description: 'Texte verstehen und Informationen verarbeiten', level: 'Grundanspruch', goals: ['Sachtexte verstehen', 'Informationen herauslesen', 'Texte zusammenfassen', 'Leseflüssigkeit steigern'], sequence: ['Arbeitsblatt: Leseverständnis', 'Quiz: Textverständnis', 'Prüfung: Lesen & Verstehen'],
          subCompetencies: [
            { code: 'D.2.B.1.a', name: 'Informationen entnehmen', description: 'Gezielt Informationen aus Texten entnehmen' },
            { code: 'D.2.B.1.b', name: 'Zusammenfassen', description: 'Texte in eigenen Worten zusammenfassen' },
            { code: 'D.2.B.1.c', name: 'Interpretieren', description: 'Texte deuten und darüber nachdenken' },
          ]
        },
        { code: 'D.2.C.1', name: 'Lesen – Reflexion', description: 'Texte kritisch beurteilen und vergleichen', level: 'Erweitert', goals: ['Texte vergleichen', 'Absichten erkennen', 'Texte bewerten'], sequence: ['Arbeitsblatt: Textvergleich'] },
        { code: 'D.4.A.2', name: 'Schreiben – Grundfertigkeiten', description: 'Korrekt und flüssig schreiben', level: 'Grundanspruch', goals: ['Verbundene Schrift beherrschen', 'Am Computer schreiben', 'Texte sauber gestalten'], sequence: ['Arbeitsblatt: Schreibtraining'] },
        { code: 'D.4.B.1', name: 'Schreiben – Textproduktion', description: 'Texte planen, schreiben und überarbeiten', level: 'Grundanspruch', goals: ['Texte strukturiert aufbauen', 'Verschiedene Textsorten kennen', 'Texte überarbeiten', 'Rechtschreibung anwenden'], sequence: ['Arbeitsblatt: Aufsatz schreiben', 'Arbeitsblatt: Rechtschreibung', 'Prüfung: Diktat'],
          subCompetencies: [
            { code: 'D.4.B.1.a', name: 'Planen', description: 'Texte mithilfe von Clustern und Stichwörtern planen' },
            { code: 'D.4.B.1.b', name: 'Formulieren', description: 'Verschiedene Textsorten verfassen (Bericht, Brief, Erzählung)' },
            { code: 'D.4.B.1.c', name: 'Überarbeiten', description: 'Eigene Texte mithilfe von Kriterien überarbeiten' },
          ]
        },
        { code: 'D.5.A.2', name: 'Sprache im Fokus – Wortlehre', description: 'Wortarten und Wortbildung verstehen', level: 'Grundanspruch', goals: ['Wortarten bestimmen', 'Wortfamilien erkennen', 'Zusammengesetzte Wörter verstehen'], sequence: ['Quiz: Wortarten', 'Arbeitsblatt: Wortfamilien'] },
        { code: 'D.5.B.1', name: 'Sprache im Fokus – Satzlehre', description: 'Grammatik und Sprachstrukturen verstehen und anwenden', level: 'Grundanspruch', goals: ['Wortarten bestimmen', 'Satzglieder erkennen', 'Zeitformen anwenden', 'Fälle erkennen'], sequence: ['Arbeitsblatt: Wortarten', 'Quiz: Zeitformen', 'Prüfung: Grammatik'],
          subCompetencies: [
            { code: 'D.5.B.1.a', name: 'Satzglieder', description: 'Subjekt, Prädikat, Objekt erkennen' },
            { code: 'D.5.B.1.b', name: 'Zeitformen', description: 'Präsens, Präteritum, Perfekt, Futur anwenden' },
            { code: 'D.5.B.1.c', name: 'Fälle', description: 'Die vier Fälle erkennen und anwenden' },
          ]
        },
        { code: 'D.5.C.1', name: 'Sprache im Fokus – Rechtschreibung', description: 'Rechtschreibregeln kennen und anwenden', level: 'Grundanspruch', goals: ['Dehnung und Schärfung', 'Gross-/Kleinschreibung', 'Zeichensetzung anwenden'], sequence: ['Arbeitsblatt: Rechtschreibung', 'Prüfung: Diktat'] },
        { code: 'D.6.A.1', name: 'Literatur im Fokus', description: 'Literarische Texte lesen und darüber nachdenken', level: 'Erweitert', goals: ['Bücher lesen und besprechen', 'Figuren charakterisieren', 'Geschichten weiterschreiben'], sequence: ['Arbeitsblatt: Buchbesprechung', 'Quiz: Literarische Begriffe'] },
      ]},

      // ── MATHEMATIK ──
      { id: 'z2-m', name: 'Mathematik', icon: '🔢', competencies: [
        { code: 'MA.1.A.2', name: 'Zahl und Variable – Operieren', description: 'Mit natürlichen Zahlen und Brüchen rechnen', level: 'Grundanspruch', goals: ['Grundoperationen beherrschen', 'Schriftliche Verfahren anwenden', 'Brüche verstehen', 'Textaufgaben lösen'], sequence: ['Arbeitsblatt: Grundoperationen', 'Arbeitsblatt: Bruchrechnen', 'Prüfung: Zahlen & Operationen'],
          subCompetencies: [
            { code: 'MA.1.A.2.a', name: 'Kopfrechnen', description: 'Im Kopf addieren, subtrahieren, multiplizieren und dividieren' },
            { code: 'MA.1.A.2.b', name: 'Schriftliche Verfahren', description: 'Schriftliche Addition, Subtraktion, Multiplikation und Division' },
            { code: 'MA.1.A.2.c', name: 'Brüche', description: 'Brüche und Dezimalzahlen verstehen und damit rechnen' },
          ]
        },
        { code: 'MA.1.B.2', name: 'Zahl und Variable – Erforschen', description: 'Zahlbeziehungen und Muster erforschen', level: 'Grundanspruch', goals: ['Teilbarkeitsregeln', 'Primzahlen kennen', 'Zahlenrätsel lösen'], sequence: ['Arbeitsblatt: Teilbarkeit', 'Quiz: Primzahlen'] },
        { code: 'MA.2.A.2', name: 'Form und Raum – Operieren', description: 'Geometrische Figuren und Körper untersuchen', level: 'Grundanspruch', goals: ['Flächen und Umfang berechnen', 'Symmetrie erkennen', 'Koordinatensystem nutzen', 'Körper und Netze kennen'], sequence: ['Arbeitsblatt: Flächen berechnen', 'Quiz: Symmetrie', 'Prüfung: Geometrie'],
          subCompetencies: [
            { code: 'MA.2.A.2.a', name: 'Umfang und Fläche', description: 'Umfang und Fläche von Rechtecken und Dreiecken berechnen' },
            { code: 'MA.2.A.2.b', name: 'Winkel', description: 'Winkel messen und zeichnen' },
            { code: 'MA.2.A.2.c', name: 'Koordinaten', description: 'Punkte im Koordinatensystem einzeichnen und ablesen' },
          ]
        },
        { code: 'MA.2.B.2', name: 'Form und Raum – Erforschen', description: 'Geometrische Zusammenhänge erforschen', level: 'Grundanspruch', goals: ['Symmetrien entdecken', 'Parkettierungen untersuchen', 'Körpernetze falten'], sequence: ['Arbeitsblatt: Symmetrie', 'Quiz: Körpernetze'] },
        { code: 'MA.3.A.2', name: 'Grössen, Funktionen, Daten – Operieren', description: 'Grössen messen, Daten darstellen und interpretieren', level: 'Grundanspruch', goals: ['Masseinheiten umrechnen', 'Diagramme lesen und erstellen', 'Sachaufgaben lösen', 'Funktionale Zusammenhänge erkennen'], sequence: ['Arbeitsblatt: Masseinheiten', 'Arbeitsblatt: Diagramme', 'Prüfung: Sachaufgaben'],
          subCompetencies: [
            { code: 'MA.3.A.2.a', name: 'Masseinheiten', description: 'Längen-, Gewichts-, Hohl- und Zeitmasse umrechnen' },
            { code: 'MA.3.A.2.b', name: 'Diagramme', description: 'Säulen-, Kreis- und Liniendiagramme lesen und erstellen' },
            { code: 'MA.3.A.2.c', name: 'Sachrechnen', description: 'Sachaufgaben mit mehreren Rechenschritten lösen' },
          ]
        },
        { code: 'MA.3.B.2', name: 'Grössen, Funktionen, Daten – Erforschen', description: 'Zusammenhänge zwischen Grössen entdecken', level: 'Grundanspruch', goals: ['Proportionale Zuordnungen', 'Tabellen und Wertepaare', 'Eigene Datenerhebungen'], sequence: ['Arbeitsblatt: Proportionalität', 'Quiz: Daten erheben'] },
      ]},

      // ── NMG ──
      { id: 'z2-nmg', name: 'NMG', icon: '🌍', competencies: [
        { code: 'NMG.1.2', name: 'Identität, Körper, Gesundheit', description: 'Zusammenleben, Rechte und Pflichten verstehen', level: 'Grundanspruch', goals: ['Demokratische Grundwerte kennen', 'Konflikte lösen', 'Diversität verstehen'], sequence: ['Quiz: Kinderrechte', 'Arbeitsblatt: Zusammenleben'],
          subCompetencies: [
            { code: 'NMG.1.2.a', name: 'Pubertät', description: 'Körperliche Veränderungen in der Pubertät kennen' },
            { code: 'NMG.1.2.b', name: 'Gesundheit', description: 'Ernährung, Bewegung und Erholung für Gesundheit verstehen' },
          ]
        },
        { code: 'NMG.1.3', name: 'Gemeinschaft & Gesellschaft', description: 'Zusammenleben gestalten und reflektieren', level: 'Grundanspruch', goals: ['Rechte und Pflichten kennen', 'Demokratie erleben', 'Vielfalt respektieren'], sequence: ['Arbeitsblatt: Kinderrechte', 'Quiz: Demokratie'] },
        { code: 'NMG.2.2', name: 'Tiere, Pflanzen, Lebensräume', description: 'Lebewesen und Ökosysteme erforschen', level: 'Grundanspruch', goals: ['Lebenszyklen verstehen', 'Nahrungsketten erklären', 'Ökosysteme beschreiben', 'Artenvielfalt erkunden'], sequence: ['Arbeitsblatt: Nahrungsketten', 'Quiz: Ökosysteme', 'Prüfung: Lebensräume'],
          subCompetencies: [
            { code: 'NMG.2.2.a', name: 'Nahrungsketten', description: 'Nahrungsbeziehungen in einem Ökosystem darstellen' },
            { code: 'NMG.2.2.b', name: 'Anpassungen', description: 'Anpassungen von Lebewesen an ihren Lebensraum erklären' },
            { code: 'NMG.2.2.c', name: 'Artenkenntnis', description: 'Einheimische Tier- und Pflanzenarten bestimmen' },
          ]
        },
        { code: 'NMG.2.3', name: 'Körperfunktionen', description: 'Aufbau und Funktionen des menschlichen Körpers kennen', level: 'Grundanspruch', goals: ['Organe und ihre Funktionen', 'Bewegungsapparat verstehen', 'Sinnesorgane erforschen'], sequence: ['Arbeitsblatt: Organe', 'Quiz: Sinnesorgane'] },
        { code: 'NMG.3.2', name: 'Stoffe, Energie, Bewegung', description: 'Stoffe untersuchen und Energieformen kennen', level: 'Grundanspruch', goals: ['Aggregatzustände kennen', 'Energieformen unterscheiden', 'Experimente planen und auswerten'], sequence: ['Arbeitsblatt: Aggregatzustände', 'Quiz: Energieformen'],
          subCompetencies: [
            { code: 'NMG.3.2.a', name: 'Aggregatzustände', description: 'Fest, flüssig und gasförmig unterscheiden und Übergänge erklären' },
            { code: 'NMG.3.2.b', name: 'Energie', description: 'Verschiedene Energieformen und Energieumwandlungen kennen' },
          ]
        },
        { code: 'NMG.4.2', name: 'Phänomene der Natur', description: 'Naturphänomene untersuchen und erklären', level: 'Grundanspruch', goals: ['Wetter und Klima', 'Wasserkreislauf', 'Magnetismus und Elektrizität'], sequence: ['Arbeitsblatt: Wasserkreislauf', 'Quiz: Magnetismus'] },
        { code: 'NMG.5.2', name: 'Technische Entwicklungen', description: 'Technische Entwicklungen verstehen und beurteilen', level: 'Grundanspruch', goals: ['Erfindungen kennen', 'Technische Abläufe verstehen', 'Technische Lösungen entwickeln'], sequence: ['Arbeitsblatt: Erfindungen', 'Quiz: Technik verstehen'] },
        { code: 'NMG.6.1', name: 'Wirtschaft & Konsum', description: 'Wirtschaftliche Zusammenhänge entdecken', level: 'Grundanspruch', goals: ['Bedürfnisse und Güter unterscheiden', 'Produktionswege verstehen', 'Nachhaltigen Konsum reflektieren'], sequence: ['Quiz: Bedürfnisse', 'Arbeitsblatt: Fairer Handel'] },
        { code: 'NMG.7.1', name: 'Lebensweisen & Kulturen', description: 'Kulturelle und religiöse Vielfalt kennenlernen', level: 'Grundanspruch', goals: ['Weltreligionen kennen', 'Feste und Bräuche vergleichen', 'Toleranz und Respekt'], sequence: ['Quiz: Weltreligionen', 'Arbeitsblatt: Feste vergleichen'] },
        { code: 'NMG.8.1', name: 'Raum & Mobilität', description: 'Räume erkunden und Orientierung gewinnen', level: 'Grundanspruch', goals: ['Karten lesen und zeichnen', 'Himmelsrichtungen kennen', 'Schweizer Kantone benennen'], sequence: ['Quiz: Kantone', 'Arbeitsblatt: Karten lesen', 'Prüfung: Geographie Schweiz'],
          subCompetencies: [
            { code: 'NMG.8.1.a', name: 'Kartenlesen', description: 'Karten und Pläne lesen und selbst zeichnen' },
            { code: 'NMG.8.1.b', name: 'Schweizer Geographie', description: 'Kantone, Städte, Gewässer und Gebirge der Schweiz kennen' },
          ]
        },
        { code: 'NMG.9.1', name: 'Zeit & Wandel', description: 'Historische Zusammenhänge verstehen', level: 'Grundanspruch', goals: ['Zeitstrahl nutzen', 'Historische Epochen kennen', 'Quellen auswerten'], sequence: ['Arbeitsblatt: Zeitstrahl', 'Quiz: Epochen', 'Prüfung: Geschichte'],
          subCompetencies: [
            { code: 'NMG.9.1.a', name: 'Zeitbegriff', description: 'Zeitliche Abfolgen und Dauer einschätzen' },
            { code: 'NMG.9.1.b', name: 'Quellen nutzen', description: 'Historische Quellen untersuchen und einordnen' },
          ]
        },
        { code: 'NMG.10.1', name: 'Demokratie & Menschenrechte', description: 'Politische Grundlagen verstehen', level: 'Grundanspruch', goals: ['Gemeinde und Kanton kennen', 'Kinderrechte verstehen', 'Abstimmen und Wählen'], sequence: ['Quiz: Kinderrechte', 'Arbeitsblatt: Demokratie'] },
        { code: 'NMG.11.1', name: 'Grunderfahrungen & Werte', description: 'Ethische Fragen und Werte reflektieren', level: 'Grundanspruch', goals: ['Gerechtigkeit diskutieren', 'Regeln hinterfragen', 'Verantwortung übernehmen'], sequence: ['Arbeitsblatt: Werte', 'Quiz: Fairness'] },
        { code: 'NMG.12.1', name: 'Religionen & Weltanschauungen', description: 'Religiöse Traditionen kennenlernen', level: 'Grundanspruch', goals: ['Feste verschiedener Religionen', 'Heilige Schriften kennen', 'Gemeinsamkeiten und Unterschiede'], sequence: ['Arbeitsblatt: Religionen', 'Quiz: Feste'] },
      ]},

      // ── ENGLISCH ──
      { id: 'z2-e', name: 'Englisch', icon: '🇬🇧', competencies: [
        { code: 'FS1E.1.A.1', name: 'Hören – Verstehen', description: 'Einfache gesprochene Texte verstehen', level: 'Grundanspruch', goals: ['Einfache Anweisungen verstehen', 'Kurze Gespräche folgen', 'Wörter heraushören'], sequence: ['Quiz: Listening', 'Arbeitsblatt: Hörverständnis'],
          subCompetencies: [
            { code: 'FS1E.1.A.1.a', name: 'Classroom Language', description: 'Anweisungen im Unterricht verstehen' },
            { code: 'FS1E.1.A.1.b', name: 'Stories', description: 'Einfache Geschichten hörend verstehen' },
          ]
        },
        { code: 'FS1E.2.A.1', name: 'Lesen – Verstehen', description: 'Einfache geschriebene Texte verstehen', level: 'Grundanspruch', goals: ['Kurze Texte lesen', 'Wörter wiedererkennen', 'Sätze verstehen'], sequence: ['Arbeitsblatt: Reading Comprehension', 'Quiz: Vocabulary'] },
        { code: 'FS1E.3.A.1', name: 'Sprechen – Dialogisch', description: 'Sich in einfachen Situationen verständigen', level: 'Grundanspruch', goals: ['Sich vorstellen', 'Einfache Fragen stellen', 'Kurze Sätze bilden'], sequence: ['Arbeitsblatt: Dialoge', 'Quiz: Phrases'] },
        { code: 'FS1E.3.B.1', name: 'Sprechen – Monologisch', description: 'Zusammenhängend kurz über vertraute Themen sprechen', level: 'Grundanspruch', goals: ['Sich selbst beschreiben', 'Bilder beschreiben', 'Kurz über Hobbys sprechen'], sequence: ['Arbeitsblatt: About me', 'Quiz: Describe'] },
        { code: 'FS1E.4.A.1', name: 'Schreiben', description: 'Einfache Wörter und Sätze schreiben', level: 'Grundanspruch', goals: ['Wörter korrekt schreiben', 'Einfache Sätze bilden', 'Kurze Texte schreiben'], sequence: ['Arbeitsblatt: Writing', 'Prüfung: Englisch Grundlagen'],
          subCompetencies: [
            { code: 'FS1E.4.A.1.a', name: 'Words', description: 'Bekannte Wörter korrekt schreiben' },
            { code: 'FS1E.4.A.1.b', name: 'Sentences', description: 'Einfache Sätze nach Modell schreiben' },
          ]
        },
        { code: 'FS1E.5.A.1', name: 'Sprache im Fokus – Bewusstheit', description: 'Sprachliche Strukturen entdecken und anwenden', level: 'Grundanspruch', goals: ['Grundgrammatik anwenden', 'Wortschatz aufbauen', 'Sprachvergleiche anstellen'], sequence: ['Quiz: Grammar Basics', 'Arbeitsblatt: Vocabulary'] },
        { code: 'FS1E.6.A.1', name: 'Kulturen im Fokus', description: 'Englischsprachige Kulturen kennenlernen', level: 'Grundanspruch', goals: ['Länder und Regionen kennen', 'Feste und Bräuche entdecken', 'Kulturelle Unterschiede verstehen'], sequence: ['Quiz: English-speaking countries', 'Arbeitsblatt: Festivals'] },
      ]},

      // ── FRANZÖSISCH ──
      { id: 'z2-f', name: 'Französisch', icon: '🇫🇷', competencies: [
        { code: 'FS2F.1.A.1', name: 'Hören – Verstehen', description: 'Einfache gesprochene Texte auf Französisch verstehen', level: 'Grundanspruch', goals: ['Begrüssungen verstehen', 'Einfache Aufforderungen folgen', 'Zahlen verstehen'], sequence: ['Quiz: Compréhension orale', 'Arbeitsblatt: Écouter'],
          subCompetencies: [
            { code: 'FS2F.1.A.1.a', name: 'Consignes', description: 'Einfache Unterrichtsanweisungen verstehen' },
            { code: 'FS2F.1.A.1.b', name: 'Histoires', description: 'Kurze Geschichten hörend verstehen' },
          ]
        },
        { code: 'FS2F.2.A.1', name: 'Lesen – Verstehen', description: 'Einfache französische Texte lesen und verstehen', level: 'Grundanspruch', goals: ['Kurze Texte erlesen', 'Wörter wiedererkennen', 'Bilder und Text verbinden'], sequence: ['Arbeitsblatt: Lecture', 'Quiz: Vocabulaire'] },
        { code: 'FS2F.3.A.1', name: 'Sprechen – Dialogisch', description: 'Sich auf Französisch in einfachen Situationen verständigen', level: 'Grundanspruch', goals: ['Sich vorstellen', 'Einfache Gespräche führen', 'Aussprache üben'], sequence: ['Arbeitsblatt: Dialogues', 'Quiz: Parler'] },
        { code: 'FS2F.3.B.1', name: 'Sprechen – Monologisch', description: 'Kurze zusammenhängende Aussagen machen', level: 'Grundanspruch', goals: ['Sich beschreiben', 'Über Vorlieben sprechen', 'Kurze Präsentationen halten'], sequence: ['Arbeitsblatt: Se présenter'] },
        { code: 'FS2F.4.A.1', name: 'Schreiben', description: 'Einfache Wörter und Sätze auf Französisch schreiben', level: 'Grundanspruch', goals: ['Wörter korrekt schreiben', 'Einfache Sätze bilden'], sequence: ['Arbeitsblatt: Écrire', 'Prüfung: Französisch Grundlagen'] },
        { code: 'FS2F.5.A.1', name: 'Sprache im Fokus – Bewusstheit', description: 'Französische Sprachstrukturen entdecken', level: 'Grundanspruch', goals: ['Artikel kennen', 'Verben konjugieren', 'Wortschatz aufbauen'], sequence: ['Quiz: Grammaire', 'Arbeitsblatt: Vocabulaire'] },
        { code: 'FS2F.6.A.1', name: 'Kulturen im Fokus', description: 'Frankophone Kulturen kennenlernen', level: 'Grundanspruch', goals: ['Frankophone Länder kennen', 'Feste und Traditionen', 'Kulturvergleiche anstellen'], sequence: ['Quiz: Pays francophones', 'Arbeitsblatt: Fêtes'] },
      ]},

      // ── BILDNERISCHES GESTALTEN ──
      { id: 'z2-bg', name: 'Bildnerisches Gestalten', icon: '🎨', competencies: [
        { code: 'BG.1.A.2', name: 'Wahrnehmen & Kommunizieren – Wahrnehmen', description: 'Bilder und Kunstwerke differenziert wahrnehmen', level: 'Grundanspruch', goals: ['Bildsprache verstehen', 'Gestaltungselemente erkennen', 'Wirkung von Bildern beschreiben'], sequence: ['Arbeitsblatt: Bildanalyse', 'Quiz: Gestaltungselemente'] },
        { code: 'BG.1.B.2', name: 'Wahrnehmen & Kommunizieren – Sich ausdrücken', description: 'Ideen und Vorstellungen bildnerisch ausdrücken', level: 'Grundanspruch', goals: ['Stimmungen darstellen', 'Szenen gestalten', 'Perspektive anbahnen'], sequence: ['Arbeitsblatt: Stimmungsbild'] },
        { code: 'BG.2.A.2', name: 'Prozesse & Produkte – Experimentieren', description: 'Vielfältige Materialien und Techniken erproben', level: 'Grundanspruch', goals: ['Mischtechniken anwenden', 'Farbmischung verstehen', 'Drucktechniken vertiefen'], sequence: ['Arbeitsblatt: Farbmischung', 'Arbeitsblatt: Drucktechnik'] },
        { code: 'BG.2.B.2', name: 'Prozesse & Produkte – Gestalten', description: 'Bildnerische Projekte selbstständig umsetzen', level: 'Grundanspruch', goals: ['Gestaltungsprozess planen', 'Verschiedene Techniken kombinieren', 'Portfolio führen'], sequence: ['Arbeitsblatt: Projektplanung'] },
        { code: 'BG.2.C.2', name: 'Prozesse & Produkte – Bildnerische Verfahren', description: 'Verschiedene bildnerische Verfahren anwenden', level: 'Grundanspruch', goals: ['Zeichnen', 'Malen', 'Plastisches Gestalten', 'Fotografieren'], sequence: ['Arbeitsblatt: Zeichentechnik'] },
        { code: 'BG.3.A.2', name: 'Kontexte & Orientierung', description: 'Kunstwerke und Bilder im Kontext betrachten', level: 'Grundanspruch', goals: ['Künstler/innen kennenlernen', 'Kunststile unterscheiden', 'Kunst und Alltag verbinden'], sequence: ['Quiz: Kunststile', 'Arbeitsblatt: Künstlerportrait'] },
      ]},

      // ── TEXTILES UND TECHNISCHES GESTALTEN ──
      { id: 'z2-ttg', name: 'Textiles und Technisches Gestalten', icon: '✂️', competencies: [
        { code: 'TTG.1.A.2', name: 'Wahrnehmung & Kommunikation', description: 'Produkte und Materialien gezielt erkunden', level: 'Grundanspruch', goals: ['Materialien vergleichen', 'Produkte analysieren', 'Funktionen beurteilen'], sequence: ['Arbeitsblatt: Materialvergleich'] },
        { code: 'TTG.2.A.2', name: 'Prozesse – Ideen entwickeln', description: 'Kreative Lösungen für Gestaltungsaufgaben entwickeln', level: 'Grundanspruch', goals: ['Brainstorming und Skizzen', 'Modelle bauen', 'Varianten entwickeln'], sequence: ['Arbeitsblatt: Ideenentwicklung'] },
        { code: 'TTG.2.B.2', name: 'Prozesse – Planen & Herstellen', description: 'Werkstücke sorgfältig planen und herstellen', level: 'Grundanspruch', goals: ['Arbeitsplanung erstellen', 'Werkzeuge fachgerecht einsetzen', 'Qualitätskriterien beachten'], sequence: ['Arbeitsblatt: Arbeitsplanung'] },
        { code: 'TTG.2.C.2', name: 'Textil – Verfahren', description: 'Textile Verfahren erweitern und vertiefen', level: 'Grundanspruch', goals: ['Verschiedene Stiche anwenden', 'Stricken/Häkeln Grundlagen', 'Textile Flächen gestalten'], sequence: ['Arbeitsblatt: Sticktechniken', 'Arbeitsblatt: Stricken'] },
        { code: 'TTG.2.D.2', name: 'Technisch – Verfahren', description: 'Technische Verfahren erweitern und vertiefen', level: 'Grundanspruch', goals: ['Verschiedene Holzverbindungen', 'Mit Metall und Kunststoff arbeiten', 'Elektrische Schaltungen bauen'], sequence: ['Arbeitsblatt: Holzverbindungen', 'Arbeitsblatt: Schaltungen'] },
        { code: 'TTG.3.A.2', name: 'Kontexte & Orientierung', description: 'Design und Technik im Alltag erkunden', level: 'Grundanspruch', goals: ['Designprozesse verstehen', 'Nachhaltigkeit reflektieren', 'Berufe im Bereich TTG kennen'], sequence: ['Quiz: Design im Alltag'] },
      ]},

      // ── MUSIK ──
      { id: 'z2-mu', name: 'Musik', icon: '🎵', competencies: [
        { code: 'MU.1.A.2', name: 'Singen und Sprechen', description: 'Lieder in verschiedenen Stilen singen', level: 'Grundanspruch', goals: ['Mehrstimmig singen', 'Lieder verschiedener Kulturen singen', 'Stimme bewusst einsetzen'], sequence: ['Arbeitsblatt: Mehrstimmigkeit', 'Quiz: Lieder der Welt'] },
        { code: 'MU.2.A.2', name: 'Hören und Sich-Orientieren', description: 'Musik differenziert hören und beschreiben', level: 'Grundanspruch', goals: ['Musikstile unterscheiden', 'Instrumente erkennen', 'Musikalische Formen erfassen'], sequence: ['Quiz: Musikstile', 'Arbeitsblatt: Instrumentenkunde'] },
        { code: 'MU.3.A.2', name: 'Bewegen und Tanzen', description: 'Bewegungsabläufe und Tänze gestalten', level: 'Grundanspruch', goals: ['Choreografien lernen', 'Eigene Bewegungen gestalten', 'Verschiedene Tanzstile kennen'], sequence: ['Arbeitsblatt: Tanzchoreografie'] },
        { code: 'MU.4.A.2', name: 'Musizieren', description: 'Auf Instrumenten spielen und begleiten', level: 'Grundanspruch', goals: ['Melodien spielen', 'Rhythmische Begleitungen', 'Zusammen musizieren'], sequence: ['Arbeitsblatt: Melodie spielen', 'Quiz: Rhythmus'] },
        { code: 'MU.5.A.2', name: 'Gestaltungsprozesse', description: 'Musikalische Projekte gestalten', level: 'Grundanspruch', goals: ['Lieder arrangieren', 'Musik zu Szenen gestalten', 'Eigene Stücke komponieren'], sequence: ['Arbeitsblatt: Arrangement'] },
        { code: 'MU.6.A.2', name: 'Praxis des musikalischen Wissens', description: 'Musikalische Begriffe und Notation anwenden', level: 'Grundanspruch', goals: ['Noten lesen und schreiben', 'Tonleitern kennen', 'Dynamikzeichen verstehen'], sequence: ['Arbeitsblatt: Notenschrift', 'Quiz: Tonleitern', 'Prüfung: Musiktheorie'] },
      ]},

      // ── BEWEGUNG UND SPORT ──
      { id: 'z2-bs', name: 'Bewegung und Sport', icon: '⚽', competencies: [
        { code: 'BS.1.A.2', name: 'Laufen, Springen, Werfen', description: 'Leichtathletische Grundformen verbessern', level: 'Grundanspruch', goals: ['Ausdauernd laufen', 'Verschiedene Sprungformen', 'Wurf- und Stosstechniken'], sequence: ['Arbeitsblatt: Leichtathletik'] },
        { code: 'BS.2.A.2', name: 'Bewegen an Geräten', description: 'An Geräten turnerische Elemente ausführen', level: 'Grundanspruch', goals: ['Rollen und Überschläge', 'Schwingen am Reck', 'Gerätekombinationen turnen'], sequence: ['Arbeitsblatt: Geräteturnen'] },
        { code: 'BS.3.A.2', name: 'Darstellen und Tanzen', description: 'Bewegungsfolgen und Tänze gestalten', level: 'Grundanspruch', goals: ['Tänze einstudieren', 'Bewegungsfolgen gestalten', 'Ausdruck und Rhythmus verbinden'], sequence: ['Arbeitsblatt: Tanzgestaltung'] },
        { code: 'BS.4.A.2', name: 'Spielen – Regelspiele', description: 'Sportspiele kennen und fair spielen', level: 'Grundanspruch', goals: ['Spielregeln verstehen und einhalten', 'Kleine Spielformen', 'Teamstrategien entwickeln'], sequence: ['Arbeitsblatt: Spieltaktik'] },
        { code: 'BS.4.B.2', name: 'Spielen – Rückschlagspiele', description: 'Rückschlagspiele kennenlernen', level: 'Grundanspruch', goals: ['Badminton Grundtechniken', 'Tischtennis spielen', 'Fair Play leben'], sequence: ['Arbeitsblatt: Rückschlagspiele'] },
        { code: 'BS.5.A.2', name: 'Gleiten, Rollen, Fahren', description: 'Bewegungsfertigkeiten auf Geräten erweitern', level: 'Grundanspruch', goals: ['Inline-Skating', 'Skifahren', 'Velofahren im Strassenverkehr'], sequence: ['Arbeitsblatt: Verkehrssicherheit'] },
        { code: 'BS.6.A.2', name: 'Bewegen im Wasser', description: 'Sicher schwimmen und Schwimmtechniken lernen', level: 'Grundanspruch', goals: ['Schwimmarten lernen', 'Ausdauer im Wasser', 'Rettungsschwimmen Grundlagen'], sequence: ['Arbeitsblatt: Schwimmtechniken'] },
      ]},

      // ── MEDIEN UND INFORMATIK ──
      { id: 'z2-mi', name: 'Medien und Informatik', icon: '💻', competencies: [
        { code: 'MI.1.1.2', name: 'Medien – Leben in der Mediengesellschaft', description: 'Medien und Medienbeiträge verstehen und hinterfragen', level: 'Grundanspruch', goals: ['Medienarten unterscheiden', 'Werbung erkennen', 'Informationsquellen vergleichen'], sequence: ['Quiz: Medienarten', 'Arbeitsblatt: Werbung analysieren'],
          subCompetencies: [
            { code: 'MI.1.1.2.a', name: 'Medienlandschaft', description: 'Verschiedene Medienformen und ihre Funktionen kennen' },
            { code: 'MI.1.1.2.b', name: 'Medienkritik', description: 'Medieninhalte kritisch hinterfragen' },
          ]
        },
        { code: 'MI.1.2.2', name: 'Medien – Sich schützen', description: 'Risiken der Mediennutzung kennen und sich schützen', level: 'Grundanspruch', goals: ['Passwörter sicher gestalten', 'Cybermobbing erkennen', 'Urheberrecht verstehen'], sequence: ['Arbeitsblatt: Sicherheit im Netz', 'Quiz: Datenschutz'] },
        { code: 'MI.1.3.2', name: 'Medien – Produzieren', description: 'Eigene Medienbeiträge gestalten', level: 'Grundanspruch', goals: ['Texte am Computer schreiben', 'Fotos bearbeiten', 'Präsentationen erstellen'], sequence: ['Arbeitsblatt: Medienprojekt'] },
        { code: 'MI.2.1.2', name: 'Informatik – Datenstrukturen', description: 'Daten organisieren und darstellen', level: 'Grundanspruch', goals: ['Tabellen erstellen', 'Daten kodieren', 'Dateien organisieren'], sequence: ['Arbeitsblatt: Tabellen', 'Quiz: Dateiformate'] },
        { code: 'MI.2.2.2', name: 'Informatik – Algorithmen', description: 'Abläufe formalisieren und programmieren', level: 'Grundanspruch', goals: ['Algorithmen beschreiben', 'Visuelle Programmierung (Scratch)', 'Schleifen und Bedingungen verstehen'], sequence: ['Arbeitsblatt: Programmieren mit Scratch', 'Quiz: Algorithmen'],
          subCompetencies: [
            { code: 'MI.2.2.2.a', name: 'Sequenz', description: 'Anweisungen in der richtigen Reihenfolge anordnen' },
            { code: 'MI.2.2.2.b', name: 'Schleifen', description: 'Wiederholungen in Programmen einsetzen' },
            { code: 'MI.2.2.2.c', name: 'Bedingungen', description: 'Verzweigungen (wenn-dann) in Programmen nutzen' },
          ]
        },
        { code: 'MI.2.3.2', name: 'Informatik – Informatiksysteme', description: 'Computer und Netzwerke verstehen', level: 'Grundanspruch', goals: ['Computerbestandteile kennen', 'Internet verstehen', 'Betriebssysteme bedienen'], sequence: ['Quiz: Computerbestandteile', 'Arbeitsblatt: Internet'] },
      ]},
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // ZYKLUS 3
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'z3', name: 'Zyklus 3', grades: '7.–9. Klasse', color: 'purple',
    areas: [
      // ── DEUTSCH ──
      { id: 'z3-d', name: 'Deutsch', icon: '📖', competencies: [
        { code: 'D.1.A.3', name: 'Hören – Verstehen', description: 'Komplexere Hörtexte verstehen und kritisch einordnen', level: 'Erweitert', goals: ['Argumentationen folgen', 'Manipulative Sprache erkennen', 'Debatten analysieren'], sequence: ['Arbeitsblatt: Argumentation', 'Quiz: Mediensprache', 'Prüfung: Hör-Analyse'],
          subCompetencies: [
            { code: 'D.1.A.3.a', name: 'Argumentationen analysieren', description: 'Aufbau und Überzeugungskraft von Argumentationen beurteilen' },
            { code: 'D.1.A.3.b', name: 'Mediensprache', description: 'Sprachliche Mittel in Medien erkennen und beurteilen' },
          ]
        },
        { code: 'D.1.B.3', name: 'Sprechen – Monologisch', description: 'Überzeugend und strukturiert präsentieren', level: 'Erweitert', goals: ['Präsentationen halten', 'Frei sprechen', 'Rhetorik einsetzen'], sequence: ['Arbeitsblatt: Präsentation planen', 'Quiz: Rhetorik'] },
        { code: 'D.1.C.3', name: 'Sprechen – Dialogisch', description: 'Debatten führen und sachlich argumentieren', level: 'Erweitert', goals: ['Debatten führen', 'Feedback geben und annehmen', 'Moderieren'], sequence: ['Arbeitsblatt: Debatte', 'Quiz: Argumentieren'] },
        { code: 'D.2.A.3', name: 'Lesen – Grundfertigkeiten', description: 'Lesetechniken situationsgerecht einsetzen', level: 'Erweitert', goals: ['Lesetempo variieren', 'Überfliegendes Lesen', 'Genaues Lesen für Details'], sequence: ['Arbeitsblatt: Lesetraining'] },
        { code: 'D.2.B.3', name: 'Lesen – Verstehen', description: 'Komplexe Texte analysieren und interpretieren', level: 'Erweitert', goals: ['Sachtexte analysieren', 'Literarische Texte interpretieren', 'Quellen kritisch bewerten'], sequence: ['Arbeitsblatt: Textanalyse', 'Prüfung: Interpretation'],
          subCompetencies: [
            { code: 'D.2.B.3.a', name: 'Textanalyse', description: 'Texte systematisch analysieren (Aufbau, Sprache, Wirkung)' },
            { code: 'D.2.B.3.b', name: 'Interpretation', description: 'Literarische Texte interpretieren und deuten' },
            { code: 'D.2.B.3.c', name: 'Quellenkritik', description: 'Quellen und Informationen kritisch prüfen' },
          ]
        },
        { code: 'D.4.A.3', name: 'Schreiben – Grundfertigkeiten', description: 'Effizient und mediengerecht schreiben', level: 'Erweitert', goals: ['10-Finger-System', 'Verschiedene Schreibmedien nutzen', 'Layout gestalten'], sequence: ['Arbeitsblatt: Schreibkompetenz'] },
        { code: 'D.4.B.3', name: 'Schreiben – Textproduktion', description: 'Verschiedene Textsorten verfassen und überarbeiten', level: 'Erweitert', goals: ['Argumentative Texte schreiben', 'Berichte verfassen', 'Kreatives Schreiben', 'Bewerbung schreiben'], sequence: ['Arbeitsblatt: Erörterung', 'Prüfung: Aufsatz'],
          subCompetencies: [
            { code: 'D.4.B.3.a', name: 'Erörterung', description: 'Pro-Contra-Texte strukturiert aufbauen' },
            { code: 'D.4.B.3.b', name: 'Bericht', description: 'Sachliche Berichte und Protokolle verfassen' },
            { code: 'D.4.B.3.c', name: 'Kreatives Schreiben', description: 'Kreative Texte mit literarischen Mitteln verfassen' },
            { code: 'D.4.B.3.d', name: 'Bewerbung', description: 'Bewerbungsschreiben und Lebenslauf verfassen' },
          ]
        },
        { code: 'D.5.A.3', name: 'Sprache im Fokus – Wortlehre', description: 'Wortarten und Wortbildung vertiefen', level: 'Erweitert', goals: ['Alle Wortarten sicher bestimmen', 'Wortbildungsmuster kennen', 'Fremdwörter verstehen'], sequence: ['Arbeitsblatt: Wortarten', 'Quiz: Fremdwörter'] },
        { code: 'D.5.B.3', name: 'Sprache im Fokus – Satzlehre', description: 'Grammatik vertiefen und Sprachreflexion', level: 'Erweitert', goals: ['Satzanalyse durchführen', 'Stilmittel erkennen', 'Sprachgeschichte kennen'], sequence: ['Arbeitsblatt: Satzglieder', 'Quiz: Stilmittel', 'Prüfung: Grammatik'],
          subCompetencies: [
            { code: 'D.5.B.3.a', name: 'Satzglieder', description: 'Alle Satzglieder bestimmen und umstellen' },
            { code: 'D.5.B.3.b', name: 'Nebensätze', description: 'Haupt- und Nebensätze unterscheiden und verbinden' },
            { code: 'D.5.B.3.c', name: 'Stilmittel', description: 'Stilmittel erkennen und deren Wirkung beschreiben' },
          ]
        },
        { code: 'D.5.C.3', name: 'Sprache im Fokus – Rechtschreibung', description: 'Rechtschreibung sicher beherrschen', level: 'Erweitert', goals: ['Alle Rechtschreibregeln anwenden', 'Zeichensetzung beherrschen', 'Nachschlagewerke nutzen'], sequence: ['Arbeitsblatt: Rechtschreibung', 'Prüfung: Diktat'] },
        { code: 'D.6.A.3', name: 'Literatur im Fokus', description: 'Literarische Werke einordnen und interpretieren', level: 'Erweitert', goals: ['Epochen kennen', 'Werke vergleichen', 'Literaturkritik verfassen'], sequence: ['Arbeitsblatt: Epochen-Übersicht', 'Prüfung: Literatur'] },
      ]},

      // ── MATHEMATIK ──
      { id: 'z3-m', name: 'Mathematik', icon: '🔢', competencies: [
        { code: 'MA.1.A.3', name: 'Zahl und Variable – Operieren', description: 'Algebra und erweiterte Zahlbereiche', level: 'Erweitert', goals: ['Gleichungen lösen', 'Terme umformen', 'Mit negativen Zahlen rechnen', 'Proportionalität verstehen'], sequence: ['Arbeitsblatt: Gleichungen', 'Arbeitsblatt: Terme', 'Prüfung: Algebra'],
          subCompetencies: [
            { code: 'MA.1.A.3.a', name: 'Terme', description: 'Terme aufstellen, vereinfachen und umformen' },
            { code: 'MA.1.A.3.b', name: 'Gleichungen', description: 'Lineare Gleichungen und Gleichungssysteme lösen' },
            { code: 'MA.1.A.3.c', name: 'Potenzen & Wurzeln', description: 'Mit Potenzen und Wurzeln rechnen' },
          ]
        },
        { code: 'MA.1.B.3', name: 'Zahl und Variable – Erforschen', description: 'Algebraische Zusammenhänge erforschen', level: 'Erweitert', goals: ['Zahlentheoretische Fragen', 'Formeln entdecken', 'Beweise nachvollziehen'], sequence: ['Arbeitsblatt: Formeln entdecken', 'Quiz: Zahlentheorie'] },
        { code: 'MA.2.A.3', name: 'Form und Raum – Operieren', description: 'Geometrie vertiefen und beweisen', level: 'Erweitert', goals: ['Satzgruppe des Pythagoras', 'Kreisberechnungen', 'Volumen und Oberfläche', 'Trigonometrie Grundlagen'], sequence: ['Arbeitsblatt: Pythagoras', 'Arbeitsblatt: Kreis', 'Prüfung: Geometrie'],
          subCompetencies: [
            { code: 'MA.2.A.3.a', name: 'Pythagoras', description: 'Den Satz des Pythagoras anwenden' },
            { code: 'MA.2.A.3.b', name: 'Kreis', description: 'Kreisumfang und Kreisfläche berechnen' },
            { code: 'MA.2.A.3.c', name: 'Körper', description: 'Volumen und Oberfläche von Prismen, Pyramiden und Zylindern berechnen' },
            { code: 'MA.2.A.3.d', name: 'Trigonometrie', description: 'Grundlagen der Trigonometrie (sin, cos, tan) anwenden' },
          ]
        },
        { code: 'MA.2.B.3', name: 'Form und Raum – Erforschen', description: 'Geometrische Zusammenhänge beweisen', level: 'Erweitert', goals: ['Konstruktionen begründen', 'Kongruenz und Ähnlichkeit', 'Raumvorstellung entwickeln'], sequence: ['Arbeitsblatt: Kongruenz', 'Quiz: Ähnlichkeit'] },
        { code: 'MA.3.A.3', name: 'Grössen, Funktionen, Daten – Operieren', description: 'Funktionen und Statistik', level: 'Erweitert', goals: ['Lineare Funktionen', 'Statistik und Wahrscheinlichkeit', 'Prozentrechnen', 'Zins und Zinseszins'], sequence: ['Arbeitsblatt: Funktionen', 'Arbeitsblatt: Prozent', 'Prüfung: Statistik'],
          subCompetencies: [
            { code: 'MA.3.A.3.a', name: 'Lineare Funktionen', description: 'Lineare Funktionen darstellen und interpretieren' },
            { code: 'MA.3.A.3.b', name: 'Prozent & Zins', description: 'Prozent-, Zins- und Zinseszinsrechnungen durchführen' },
            { code: 'MA.3.A.3.c', name: 'Statistik', description: 'Statistische Kenngrössen berechnen und interpretieren' },
            { code: 'MA.3.A.3.d', name: 'Wahrscheinlichkeit', description: 'Wahrscheinlichkeiten berechnen und Zufallsexperimente auswerten' },
          ]
        },
        { code: 'MA.3.B.3', name: 'Grössen, Funktionen, Daten – Erforschen', description: 'Funktionale Zusammenhänge untersuchen', level: 'Erweitert', goals: ['Quadratische Funktionen entdecken', 'Wachstumsprozesse modellieren', 'Daten kritisch auswerten'], sequence: ['Arbeitsblatt: Wachstum', 'Quiz: Funktionstypen'] },
      ]},

      // ── NATUR UND TECHNIK ──
      { id: 'z3-nt', name: 'Natur und Technik', icon: '🔬', competencies: [
        { code: 'NT.1.1', name: 'Mechanik', description: 'Kräfte, Bewegungen und Energie untersuchen', level: 'Erweitert', goals: ['Kräfte und Bewegung', 'Arbeit und Leistung', 'Einfache Maschinen'], sequence: ['Arbeitsblatt: Kräfte', 'Quiz: Mechanik', 'Prüfung: Mechanik'],
          subCompetencies: [
            { code: 'NT.1.1.a', name: 'Kräfte', description: 'Kräfte messen, darstellen und ihre Wirkung beschreiben' },
            { code: 'NT.1.1.b', name: 'Bewegung', description: 'Gleichförmige und beschleunigte Bewegung beschreiben' },
          ]
        },
        { code: 'NT.1.2', name: 'Elektrizität & Magnetismus', description: 'Elektrische und magnetische Phänomene verstehen', level: 'Erweitert', goals: ['Stromkreise bauen und analysieren', 'Spannung, Strom, Widerstand', 'Magnetismus verstehen'], sequence: ['Arbeitsblatt: Stromkreise', 'Quiz: Elektrizität', 'Prüfung: Elektrizität'] },
        { code: 'NT.1.3', name: 'Optik', description: 'Licht und optische Phänomene', level: 'Erweitert', goals: ['Lichtausbreitung', 'Reflexion und Brechung', 'Farben und Spektrum'], sequence: ['Arbeitsblatt: Optik', 'Quiz: Licht'] },
        { code: 'NT.2.1', name: 'Stoffe und Stoffumwandlungen', description: 'Stoffe und chemische Reaktionen', level: 'Erweitert', goals: ['Periodensystem kennen', 'Chemische Reaktionen verstehen', 'Säuren und Basen', 'Atommodell'], sequence: ['Arbeitsblatt: Periodensystem', 'Quiz: Reaktionen', 'Prüfung: Chemie'],
          subCompetencies: [
            { code: 'NT.2.1.a', name: 'Atombau', description: 'Aufbau von Atomen und das Periodensystem verstehen' },
            { code: 'NT.2.1.b', name: 'Chemische Bindungen', description: 'Ionenbindung, Atombindung und metallische Bindung kennen' },
            { code: 'NT.2.1.c', name: 'Reaktionsgleichungen', description: 'Chemische Reaktionen in Gleichungen darstellen' },
          ]
        },
        { code: 'NT.2.2', name: 'Organische Chemie', description: 'Kohlenstoffverbindungen und Alltagschemie', level: 'Erweitert', goals: ['Kohlenwasserstoffe', 'Alkohole und Carbonsäuren', 'Kunststoffe und Nahrungsmittelchemie'], sequence: ['Arbeitsblatt: Organische Chemie', 'Quiz: Alltagschemie'] },
        { code: 'NT.3.1', name: 'Biologie – Zelle & Organismus', description: 'Zellbiologie und Körperfunktionen', level: 'Erweitert', goals: ['Zellaufbau', 'Zellteilung', 'Organsysteme verstehen'], sequence: ['Arbeitsblatt: Zelle', 'Quiz: Organsysteme', 'Prüfung: Biologie'],
          subCompetencies: [
            { code: 'NT.3.1.a', name: 'Zellbiologie', description: 'Aufbau und Funktion von Zellen kennen' },
            { code: 'NT.3.1.b', name: 'Stoffwechsel', description: 'Fotosynthese und Zellatmung verstehen' },
          ]
        },
        { code: 'NT.3.2', name: 'Biologie – Ökologie', description: 'Ökosysteme und Biodiversität', level: 'Erweitert', goals: ['Ökosysteme analysieren', 'Stoffkreisläufe', 'Umweltschutz und Nachhaltigkeit'], sequence: ['Arbeitsblatt: Ökosysteme', 'Quiz: Stoffkreisläufe'] },
        { code: 'NT.3.3', name: 'Biologie – Genetik & Evolution', description: 'Vererbung und Evolutionstheorie', level: 'Erweitert', goals: ['Genetik Grundlagen', 'DNA und Vererbung', 'Evolutionstheorie', 'Selektion und Anpassung'], sequence: ['Arbeitsblatt: Genetik', 'Quiz: Evolution', 'Prüfung: Genetik'] },
        { code: 'NT.4.1', name: 'Technik & Informatik', description: 'Technische Systeme verstehen und konstruieren', level: 'Erweitert', goals: ['Technische Geräte analysieren', 'Einfache Programmierung', 'Konstruktion und Design', 'Robotik'], sequence: ['Arbeitsblatt: Technik-Analyse', 'Quiz: Informatik'] },
      ]},

      // ── RÄUME, ZEITEN, GESELLSCHAFTEN ──
      { id: 'z3-rz', name: 'Räume, Zeiten, Gesellschaften', icon: '🏛️', competencies: [
        { code: 'RZG.1.1', name: 'Natürliche Grundlagen der Erde', description: 'Geomorphologische und klimatische Prozesse verstehen', level: 'Erweitert', goals: ['Klimazonen kennen', 'Plattentektonik', 'Wetter und Klima unterscheiden'], sequence: ['Arbeitsblatt: Klimazonen', 'Quiz: Plattentektonik'],
          subCompetencies: [
            { code: 'RZG.1.1.a', name: 'Klima', description: 'Klimazonen und Klimawandel verstehen' },
            { code: 'RZG.1.1.b', name: 'Geologie', description: 'Plattentektonik, Gebirgsbildung und Vulkanismus erklären' },
          ]
        },
        { code: 'RZG.1.2', name: 'Lebensweisen & Lebensräume', description: 'Globale Zusammenhänge und Raumnutzung', level: 'Erweitert', goals: ['Globalisierung verstehen', 'Urbanisierung', 'Migration und Mobilität'], sequence: ['Arbeitsblatt: Globalisierung', 'Quiz: Urbanisierung'] },
        { code: 'RZG.1.3', name: 'Schweiz – Geographie', description: 'Räumliche Strukturen der Schweiz', level: 'Erweitert', goals: ['Naturräume der Schweiz', 'Wirtschaftsräume', 'Verkehr und Raumplanung'], sequence: ['Arbeitsblatt: Schweizer Geographie', 'Prüfung: Geographie Schweiz'] },
        { code: 'RZG.2.1', name: 'Geschichte – Antike & Mittelalter', description: 'Frühe Hochkulturen bis Mittelalter', level: 'Erweitert', goals: ['Antike Hochkulturen', 'Römisches Reich', 'Mittelalter und Feudalismus'], sequence: ['Arbeitsblatt: Antike', 'Quiz: Mittelalter'] },
        { code: 'RZG.2.2', name: 'Geschichte – Neuzeit', description: 'Von der Renaissance bis zur Industrialisierung', level: 'Erweitert', goals: ['Renaissance und Reformation', 'Aufklärung', 'Französische Revolution', 'Industrialisierung'], sequence: ['Arbeitsblatt: Neuzeit', 'Quiz: Revolutionen', 'Prüfung: Geschichte'] },
        { code: 'RZG.2.3', name: 'Geschichte – 20./21. Jahrhundert', description: 'Weltkriege, Kalter Krieg und Gegenwart', level: 'Erweitert', goals: ['Erster und Zweiter Weltkrieg', 'Kalter Krieg', 'Schweiz im 20. Jahrhundert', 'Aktuelle Konflikte'], sequence: ['Arbeitsblatt: Weltkriege', 'Quiz: Kalter Krieg'] },
        { code: 'RZG.3.1', name: 'Politische Bildung', description: 'Politische Systeme und Partizipation', level: 'Erweitert', goals: ['Schweizer Demokratie', 'Grundrechte', 'Politische Parteien', 'Abstimmungen verstehen'], sequence: ['Quiz: Demokratie', 'Arbeitsblatt: Politisches System', 'Prüfung: Politische Bildung'],
          subCompetencies: [
            { code: 'RZG.3.1.a', name: 'Bundesverfassung', description: 'Aufbau und Grundprinzipien der Bundesverfassung kennen' },
            { code: 'RZG.3.1.b', name: 'Gewaltenteilung', description: 'Legislative, Exekutive und Judikative unterscheiden' },
            { code: 'RZG.3.1.c', name: 'Direkte Demokratie', description: 'Volksinitiative, Referendum und Abstimmungen verstehen' },
          ]
        },
        { code: 'RZG.3.2', name: 'Wirtschaft & Recht', description: 'Wirtschaftliche und rechtliche Grundlagen', level: 'Erweitert', goals: ['Wirtschaftskreislauf', 'Geld und Bankwesen', 'Steuern', 'Konsumentenrechte'], sequence: ['Arbeitsblatt: Wirtschaft', 'Quiz: Recht'] },
      ]},

      // ── ETHIK, RELIGIONEN, GEMEINSCHAFT ──
      { id: 'z3-erg', name: 'Ethik, Religionen, Gemeinschaft', icon: '🤝', competencies: [
        { code: 'ERG.1.1', name: 'Existentielle Grunderfahrungen', description: 'Grundfragen des Lebens reflektieren', level: 'Erweitert', goals: ['Sinnfragen stellen', 'Glück und Leid reflektieren', 'Identität entwickeln'], sequence: ['Arbeitsblatt: Sinnfragen', 'Quiz: Identität'] },
        { code: 'ERG.2.1', name: 'Werte & Normen', description: 'Ethische Grundlagen und Wertvorstellungen', level: 'Erweitert', goals: ['Ethische Dilemmata diskutieren', 'Menschenrechte kennen', 'Gerechtigkeit reflektieren'], sequence: ['Arbeitsblatt: Dilemmata', 'Quiz: Menschenrechte'] },
        { code: 'ERG.3.1', name: 'Spuren & Einfluss von Religionen', description: 'Weltreligionen und ihre Bedeutung', level: 'Erweitert', goals: ['Weltreligionen kennen', 'Religiöse Texte verstehen', 'Interreligiöser Dialog'], sequence: ['Arbeitsblatt: Weltreligionen', 'Quiz: Religiöse Feste', 'Prüfung: Religionen'] },
        { code: 'ERG.4.1', name: 'Ich und die Gemeinschaft', description: 'Zusammenleben in einer vielfältigen Gesellschaft', level: 'Erweitert', goals: ['Vorurteile erkennen', 'Toleranz üben', 'Zivilcourage zeigen'], sequence: ['Arbeitsblatt: Vorurteile', 'Quiz: Toleranz'] },
        { code: 'ERG.5.1', name: 'Geschlechter & Gleichstellung', description: 'Geschlechterrollen und Gleichstellung reflektieren', level: 'Erweitert', goals: ['Geschlechterbilder hinterfragen', 'Gleichstellung kennen', 'Respektvoller Umgang'], sequence: ['Arbeitsblatt: Gleichstellung'] },
      ]},

      // ── ENGLISCH ──
      { id: 'z3-e', name: 'Englisch', icon: '🇬🇧', competencies: [
        { code: 'FS1E.1.B.1', name: 'Hören – Verstehen', description: 'Längere gesprochene Texte verstehen', level: 'Erweitert', goals: ['Nachrichten verstehen', 'Diskussionen folgen', 'Verschiedene Akzente verstehen'], sequence: ['Quiz: Listening Advanced', 'Arbeitsblatt: News Comprehension'],
          subCompetencies: [
            { code: 'FS1E.1.B.1.a', name: 'Authentisches Material', description: 'Authentische englische Hörtexte verstehen (Podcasts, Nachrichten)' },
            { code: 'FS1E.1.B.1.b', name: 'Akzente', description: 'Verschiedene englische Akzente verstehen' },
          ]
        },
        { code: 'FS1E.2.B.1', name: 'Lesen – Verstehen', description: 'Komplexere englische Texte verstehen', level: 'Erweitert', goals: ['Zeitungsartikel verstehen', 'Literarische Texte lesen', 'Informationen zusammenfassen'], sequence: ['Arbeitsblatt: Reading Comprehension', 'Prüfung: Reading'] },
        { code: 'FS1E.3.B.1', name: 'Sprechen – Dialogisch', description: 'In verschiedenen Situationen kommunizieren', level: 'Erweitert', goals: ['Meinungen austauschen', 'Über aktuelle Themen diskutieren', 'Bewerbungsgespräche üben'], sequence: ['Arbeitsblatt: Discussion', 'Quiz: Dialogues'] },
        { code: 'FS1E.3.C.1', name: 'Sprechen – Monologisch', description: 'Zusammenhängend über komplexe Themen sprechen', level: 'Erweitert', goals: ['Präsentationen auf Englisch', 'Bücher/Filme vorstellen', 'Argumentieren'], sequence: ['Arbeitsblatt: Presentation'] },
        { code: 'FS1E.4.B.1', name: 'Schreiben', description: 'Verschiedene Textsorten auf Englisch verfassen', level: 'Erweitert', goals: ['Essays schreiben', 'Formelle Briefe/E-Mails', 'Kreatives Schreiben'], sequence: ['Arbeitsblatt: Essay Writing', 'Prüfung: Writing'],
          subCompetencies: [
            { code: 'FS1E.4.B.1.a', name: 'Essays', description: 'Argumentative und beschreibende Essays verfassen' },
            { code: 'FS1E.4.B.1.b', name: 'Formal Writing', description: 'Formelle Briefe, E-Mails und Bewerbungen schreiben' },
          ]
        },
        { code: 'FS1E.5.B.1', name: 'Sprache im Fokus', description: 'Grammatik und Wortschatz vertiefen', level: 'Erweitert', goals: ['Erweiterte Grammatik', 'Wortschatz ausbauen', 'Sprachstrategien anwenden'], sequence: ['Arbeitsblatt: Grammar Advanced', 'Quiz: Vocabulary', 'Prüfung: Englisch'] },
        { code: 'FS1E.6.B.1', name: 'Kulturen im Fokus', description: 'Anglophone Kulturen vertieft kennenlernen', level: 'Erweitert', goals: ['Kulturelle Unterschiede verstehen', 'Interkulturelle Kompetenz', 'Medien in englischer Sprache nutzen'], sequence: ['Arbeitsblatt: Cultural Awareness'] },
      ]},

      // ── FRANZÖSISCH ──
      { id: 'z3-f', name: 'Französisch', icon: '🇫🇷', competencies: [
        { code: 'FS2F.1.B.1', name: 'Hören – Verstehen', description: 'Komplexere französische Hörtexte verstehen', level: 'Erweitert', goals: ['Alltagsgespräche verstehen', 'Medientexte folgen', 'Verschiedene Sprechtempi verstehen'], sequence: ['Quiz: Compréhension orale avancée', 'Arbeitsblatt: Écouter'] },
        { code: 'FS2F.2.B.1', name: 'Lesen – Verstehen', description: 'Anspruchsvollere französische Texte lesen', level: 'Erweitert', goals: ['Zeitungsartikel verstehen', 'Literarische Texte lesen', 'Informationen zusammenfassen'], sequence: ['Arbeitsblatt: Lecture avancée', 'Prüfung: Lecture'] },
        { code: 'FS2F.3.B.1', name: 'Sprechen – Dialogisch', description: 'In verschiedenen Situationen auf Französisch kommunizieren', level: 'Erweitert', goals: ['Meinungen austauschen', 'Im Alltag kommunizieren', 'Rollenspiele durchführen'], sequence: ['Arbeitsblatt: Dialogues avancés'] },
        { code: 'FS2F.3.C.1', name: 'Sprechen – Monologisch', description: 'Zusammenhängend auf Französisch erzählen', level: 'Erweitert', goals: ['Erlebnisse erzählen', 'Präsentationen halten', 'Meinungen begründen'], sequence: ['Arbeitsblatt: Présentation'] },
        { code: 'FS2F.4.B.1', name: 'Schreiben', description: 'Verschiedene Textsorten auf Französisch verfassen', level: 'Erweitert', goals: ['Briefe und E-Mails schreiben', 'Beschreibungen verfassen', 'Texte zu aktuellen Themen'], sequence: ['Arbeitsblatt: Écrire avancé', 'Prüfung: Écriture'] },
        { code: 'FS2F.5.B.1', name: 'Sprache im Fokus', description: 'Französische Grammatik und Wortschatz vertiefen', level: 'Erweitert', goals: ['Zeitformen vertiefen', 'Pronomen korrekt einsetzen', 'Wortschatz ausbauen'], sequence: ['Arbeitsblatt: Grammaire avancée', 'Quiz: Vocabulaire', 'Prüfung: Französisch'] },
        { code: 'FS2F.6.B.1', name: 'Kulturen im Fokus', description: 'Frankophone Kulturen vertieft kennenlernen', level: 'Erweitert', goals: ['Westschweiz kennenlernen', 'Frankophone Welt entdecken', 'Kulturvergleiche anstellen'], sequence: ['Arbeitsblatt: La Suisse romande'] },
      ]},

      // ── BILDNERISCHES GESTALTEN ──
      { id: 'z3-bg', name: 'Bildnerisches Gestalten', icon: '🎨', competencies: [
        { code: 'BG.1.A.3', name: 'Wahrnehmen & Kommunizieren – Wahrnehmen', description: 'Bilder und Kunstwerke analysieren', level: 'Erweitert', goals: ['Bildanalyse durchführen', 'Gestaltungsprinzipien erkennen', 'Wirkung analysieren'], sequence: ['Arbeitsblatt: Bildanalyse', 'Prüfung: Kunstbetrachtung'] },
        { code: 'BG.1.B.3', name: 'Wahrnehmen & Kommunizieren – Sich ausdrücken', description: 'Komplexe Ideen bildnerisch umsetzen', level: 'Erweitert', goals: ['Konzepte visualisieren', 'Abstrakt gestalten', 'Serien und Reihen entwickeln'], sequence: ['Arbeitsblatt: Konzeptkunst'] },
        { code: 'BG.2.A.3', name: 'Prozesse & Produkte – Experimentieren', description: 'Gestalterische Prozesse experimentell erweitern', level: 'Erweitert', goals: ['Intermediale Arbeiten', 'Digitale Gestaltung', 'Mixed Media'], sequence: ['Arbeitsblatt: Digitale Kunst'] },
        { code: 'BG.2.B.3', name: 'Prozesse & Produkte – Gestalten', description: 'Eigenständige künstlerische Projekte realisieren', level: 'Erweitert', goals: ['Projektarbeit', 'Portfolio erstellen', 'Ausstellung gestalten'], sequence: ['Arbeitsblatt: Kunstprojekt'] },
        { code: 'BG.3.A.3', name: 'Kontexte & Orientierung', description: 'Kunst im historischen und gesellschaftlichen Kontext', level: 'Erweitert', goals: ['Kunstgeschichte kennen', 'Zeitgenössische Kunst verstehen', 'Kunst und Gesellschaft reflektieren'], sequence: ['Quiz: Kunstgeschichte', 'Arbeitsblatt: Kunstepoche'] },
      ]},

      // ── TEXTILES UND TECHNISCHES GESTALTEN ──
      { id: 'z3-ttg', name: 'Textiles und Technisches Gestalten', icon: '✂️', competencies: [
        { code: 'TTG.1.A.3', name: 'Wahrnehmung & Kommunikation', description: 'Produkte und Designs kritisch analysieren', level: 'Erweitert', goals: ['Produktdesign analysieren', 'Nachhaltigkeit beurteilen', 'Funktionalität und Ästhetik bewerten'], sequence: ['Arbeitsblatt: Designanalyse'] },
        { code: 'TTG.2.A.3', name: 'Prozesse – Ideen entwickeln', description: 'Innovative Lösungen entwickeln', level: 'Erweitert', goals: ['Design Thinking anwenden', 'Prototypen bauen', 'Iterativ arbeiten'], sequence: ['Arbeitsblatt: Design Thinking'] },
        { code: 'TTG.2.B.3', name: 'Prozesse – Planen & Herstellen', description: 'Komplexe Werkstücke professionell umsetzen', level: 'Erweitert', goals: ['Präzise Werkzeichnungen', 'Fachgerechte Verarbeitung', 'Qualitätskontrolle'], sequence: ['Arbeitsblatt: Werkzeichnung'] },
        { code: 'TTG.2.C.3', name: 'Textil – Verfahren', description: 'Erweiterte textile Verfahren', level: 'Erweitert', goals: ['Schnittmuster erstellen', 'Maschinennähen', 'Textile Materialien kombinieren'], sequence: ['Arbeitsblatt: Schnittmuster', 'Arbeitsblatt: Maschinennähen'] },
        { code: 'TTG.2.D.3', name: 'Technisch – Verfahren', description: 'Erweiterte technische Verfahren', level: 'Erweitert', goals: ['CNC-Grundlagen', 'Elektronik einbinden', '3D-Druck Grundlagen', 'Komplexe Verbindungen'], sequence: ['Arbeitsblatt: Elektronik', 'Arbeitsblatt: 3D-Druck'] },
        { code: 'TTG.3.A.3', name: 'Kontexte & Orientierung', description: 'Design, Technik und Berufsorientierung', level: 'Erweitert', goals: ['Berufsfelder kennen', 'Nachhaltiges Design', 'Produktionsverfahren verstehen'], sequence: ['Arbeitsblatt: Berufe TTG'] },
      ]},

      // ── MUSIK ──
      { id: 'z3-mu', name: 'Musik', icon: '🎵', competencies: [
        { code: 'MU.1.A.3', name: 'Singen und Sprechen', description: 'Anspruchsvolle Lieder und Stimmarbeit', level: 'Erweitert', goals: ['Mehrstimmig singen', 'Songs verschiedener Genres', 'Stimme gezielt einsetzen'], sequence: ['Arbeitsblatt: Mehrstimmigkeit'] },
        { code: 'MU.2.A.3', name: 'Hören und Sich-Orientieren', description: 'Musik analysieren und einordnen', level: 'Erweitert', goals: ['Musikepochen kennen', 'Musik analysieren', 'Musikkritik verfassen'], sequence: ['Quiz: Musikepochen', 'Arbeitsblatt: Musikanalyse', 'Prüfung: Musikgeschichte'] },
        { code: 'MU.3.A.3', name: 'Bewegen und Tanzen', description: 'Tänze und Choreografien gestalten', level: 'Erweitert', goals: ['Eigene Choreografien', 'Verschiedene Tanzstile', 'Tanz als Ausdruck'], sequence: ['Arbeitsblatt: Choreografie'] },
        { code: 'MU.4.A.3', name: 'Musizieren', description: 'Im Ensemble musizieren', level: 'Erweitert', goals: ['Bandmusik spielen', 'Arrangement umsetzen', 'Solo und Begleitung'], sequence: ['Arbeitsblatt: Ensemble'] },
        { code: 'MU.5.A.3', name: 'Gestaltungsprozesse', description: 'Eigene Musikprojekte realisieren', level: 'Erweitert', goals: ['Songwriting', 'Musikproduktion digital', 'Musikvideo gestalten'], sequence: ['Arbeitsblatt: Songwriting'] },
        { code: 'MU.6.A.3', name: 'Praxis des musikalischen Wissens', description: 'Musiktheorie vertiefen', level: 'Erweitert', goals: ['Harmonielehre', 'Akkorde und Tonleitern', 'Formenlehre'], sequence: ['Arbeitsblatt: Harmonielehre', 'Quiz: Akkorde', 'Prüfung: Musiktheorie'] },
      ]},

      // ── BEWEGUNG UND SPORT ──
      { id: 'z3-bs', name: 'Bewegung und Sport', icon: '⚽', competencies: [
        { code: 'BS.1.A.3', name: 'Laufen, Springen, Werfen', description: 'Leichtathletische Disziplinen vertiefen', level: 'Erweitert', goals: ['Ausdauerlauf', 'Hochsprung/Weitsprung Technik', 'Kugelstossen/Speerwurf'], sequence: ['Arbeitsblatt: Leichtathletik'] },
        { code: 'BS.2.A.3', name: 'Bewegen an Geräten', description: 'Anspruchsvolle Übungen an Geräten', level: 'Erweitert', goals: ['Kürübungen', 'Akrobatik', 'Parkour-Elemente'], sequence: ['Arbeitsblatt: Geräteturnen'] },
        { code: 'BS.3.A.3', name: 'Darstellen und Tanzen', description: 'Ausdrucksformen und Choreografien gestalten', level: 'Erweitert', goals: ['Tanzprojekte', 'Fitness-Choreografien', 'Ausdruck und Kreativität'], sequence: ['Arbeitsblatt: Tanzprojekt'] },
        { code: 'BS.4.A.3', name: 'Spielen – Sportspiele', description: 'Sportspiele auf fortgeschrittenem Niveau', level: 'Erweitert', goals: ['Basketball, Fussball, Handball, Volleyball', 'Taktik und Spielzüge', 'Schiedsrichter und Fairplay'], sequence: ['Arbeitsblatt: Spieltaktik'] },
        { code: 'BS.4.B.3', name: 'Spielen – Rückschlagspiele', description: 'Rückschlagspiele vertiefen', level: 'Erweitert', goals: ['Badminton vertiefen', 'Tennis Grundlagen', 'Taktisches Spielen'], sequence: ['Arbeitsblatt: Rückschlagspiele'] },
        { code: 'BS.5.A.3', name: 'Gleiten, Rollen, Fahren', description: 'Fortbewegung auf Rädern und im Schnee', level: 'Erweitert', goals: ['Skifahren/Snowboarden vertiefen', 'Trendsportarten', 'Sicherheit im Sport'], sequence: ['Arbeitsblatt: Schneesport'] },
        { code: 'BS.6.A.3', name: 'Bewegen im Wasser', description: 'Schwimmtechniken und Wassersicherheit', level: 'Erweitert', goals: ['Alle Schwimmarten beherrschen', 'Rettungsschwimmen', 'Wasserspiele und Wasserball'], sequence: ['Arbeitsblatt: Rettungsschwimmen'] },
      ]},

      // ── WIRTSCHAFT, ARBEIT, HAUSHALT ──
      { id: 'z3-wah', name: 'Wirtschaft, Arbeit, Haushalt', icon: '🏠', competencies: [
        { code: 'WAH.1.1', name: 'Ernährung & Gesundheit', description: 'Gesunde und nachhaltige Ernährung', level: 'Erweitert', goals: ['Nährstoffe und Ernährungspyramide', 'Mahlzeiten planen', 'Lebensmittel beurteilen'], sequence: ['Arbeitsblatt: Ernährungspyramide', 'Quiz: Nährstoffe', 'Prüfung: Ernährung'],
          subCompetencies: [
            { code: 'WAH.1.1.a', name: 'Nährstoffe', description: 'Makro- und Mikronährstoffe und ihre Funktionen kennen' },
            { code: 'WAH.1.1.b', name: 'Mahlzeiten planen', description: 'Ausgewogene Mahlzeiten zusammenstellen und zubereiten' },
          ]
        },
        { code: 'WAH.1.2', name: 'Nahrungszubereitung', description: 'Lebensmittel fachgerecht verarbeiten', level: 'Erweitert', goals: ['Kochtechniken anwenden', 'Hygieneregeln einhalten', 'Rezepte umsetzen'], sequence: ['Arbeitsblatt: Kochtechniken', 'Quiz: Küchenhygiene'] },
        { code: 'WAH.2.1', name: 'Wirtschaft & Haushalt', description: 'Wirtschaftlich und nachhaltig haushalten', level: 'Erweitert', goals: ['Budget erstellen', 'Konsumverhalten reflektieren', 'Nachhaltiger Konsum'], sequence: ['Arbeitsblatt: Budget', 'Quiz: Nachhaltigkeit'],
          subCompetencies: [
            { code: 'WAH.2.1.a', name: 'Budget', description: 'Ein persönliches Budget erstellen und überwachen' },
            { code: 'WAH.2.1.b', name: 'Konsum', description: 'Konsumentscheide kritisch reflektieren' },
          ]
        },
        { code: 'WAH.3.1', name: 'Berufliche Orientierung', description: 'Den Berufswahlprozess aktiv gestalten', level: 'Erweitert', goals: ['Berufsfelder kennen', 'Schnupperlehre planen', 'Bewerbungsunterlagen erstellen', 'Vorstellungsgespräch üben'], sequence: ['Arbeitsblatt: Berufswahl', 'Arbeitsblatt: Bewerbung', 'Quiz: Berufsfelder'],
          subCompetencies: [
            { code: 'WAH.3.1.a', name: 'Interessen & Stärken', description: 'Eigene Interessen und Stärken erkennen und mit Berufen abgleichen' },
            { code: 'WAH.3.1.b', name: 'Bewerbungsprozess', description: 'Bewerbungsschreiben, Lebenslauf und Vorstellungsgespräch vorbereiten' },
          ]
        },
        { code: 'WAH.4.1', name: 'Wohnen & Zusammenleben', description: 'Wohnsituationen gestalten', level: 'Erweitert', goals: ['Wohnformen kennen', 'Mietvertrag verstehen', 'Haushalt organisieren'], sequence: ['Arbeitsblatt: Wohnen'] },
      ]},

      // ── MEDIEN UND INFORMATIK ──
      { id: 'z3-mi', name: 'Medien und Informatik', icon: '💻', competencies: [
        { code: 'MI.1.1.3', name: 'Medien – Leben in der Mediengesellschaft', description: 'Medien und ihre Wirkung kritisch reflektieren', level: 'Erweitert', goals: ['Fake News erkennen', 'Medienkompetenz vertiefen', 'Medienethik reflektieren'], sequence: ['Quiz: Fake News', 'Arbeitsblatt: Medienanalyse'],
          subCompetencies: [
            { code: 'MI.1.1.3.a', name: 'Medienkritik', description: 'Medieninhalte und Quellen kritisch beurteilen' },
            { code: 'MI.1.1.3.b', name: 'Meinungsbildung', description: 'Die Rolle der Medien in der Meinungsbildung verstehen' },
          ]
        },
        { code: 'MI.1.2.3', name: 'Medien – Sich schützen', description: 'Datenschutz und Sicherheit im digitalen Raum', level: 'Erweitert', goals: ['Datenschutz verstehen', 'Digitaler Fussabdruck', 'Recht am eigenen Bild', 'Cybersicherheit'], sequence: ['Arbeitsblatt: Datenschutz', 'Quiz: Cybersicherheit'] },
        { code: 'MI.1.3.3', name: 'Medien – Produzieren', description: 'Professionelle Medienbeiträge erstellen', level: 'Erweitert', goals: ['Videos produzieren', 'Podcasts erstellen', 'Webseiten gestalten'], sequence: ['Arbeitsblatt: Medienprojekt'] },
        { code: 'MI.2.1.3', name: 'Informatik – Datenstrukturen', description: 'Daten strukturieren und verwalten', level: 'Erweitert', goals: ['Datenbanken verstehen', 'Datenkompression', 'Verschlüsselung Grundlagen'], sequence: ['Arbeitsblatt: Datenbanken', 'Quiz: Datenkompression'] },
        { code: 'MI.2.2.3', name: 'Informatik – Algorithmen & Programmierung', description: 'Programme entwickeln und Probleme lösen', level: 'Erweitert', goals: ['Textbasierte Programmierung', 'Variablen und Schleifen', 'Funktionen schreiben', 'Debugging'], sequence: ['Arbeitsblatt: Programmieren', 'Quiz: Algorithmen', 'Prüfung: Informatik'],
          subCompetencies: [
            { code: 'MI.2.2.3.a', name: 'Variablen & Datentypen', description: 'Variablen und Datentypen in Programmen einsetzen' },
            { code: 'MI.2.2.3.b', name: 'Kontrollstrukturen', description: 'Schleifen und Bedingungen in Programmen nutzen' },
            { code: 'MI.2.2.3.c', name: 'Funktionen', description: 'Eigene Funktionen schreiben und nutzen' },
            { code: 'MI.2.2.3.d', name: 'Debugging', description: 'Fehler in Programmen systematisch finden und beheben' },
          ]
        },
        { code: 'MI.2.3.3', name: 'Informatik – Informatiksysteme', description: 'Aufbau und Funktionsweise von Informatiksystemen', level: 'Erweitert', goals: ['Netzwerke verstehen', 'Cloud Computing', 'Betriebssysteme', 'Künstliche Intelligenz Grundlagen'], sequence: ['Arbeitsblatt: Netzwerke', 'Quiz: KI Grundlagen'] },
      ]},
    ]
  }
]

// Helper: Get all subjects for a cycle
export function getSubjectsForCycle(cycleId) {
  const cycle = LEHRPLAN_CYCLES.find(c => c.id === cycleId)
  return cycle ? cycle.areas.map(a => ({ id: a.id, name: a.name, icon: a.icon })) : []
}

// Helper: Get competencies for a subject in a cycle
export function getCompetenciesForSubject(cycleId, subjectId) {
  const cycle = LEHRPLAN_CYCLES.find(c => c.id === cycleId)
  if (!cycle) return []
  const subject = cycle.areas.find(a => a.id === subjectId)
  return subject ? subject.competencies : []
}

// Helper: Search competencies across all cycles
export function searchCompetencies(query) {
  const q = query.toLowerCase()
  const results = []
  for (const cycle of LEHRPLAN_CYCLES) {
    for (const area of cycle.areas) {
      for (const comp of area.competencies) {
        if (
          comp.code.toLowerCase().includes(q) ||
          comp.name.toLowerCase().includes(q) ||
          comp.description.toLowerCase().includes(q) ||
          comp.goals?.some(g => g.toLowerCase().includes(q))
        ) {
          results.push({ ...comp, cycleName: cycle.name, cycleId: cycle.id, subjectName: area.name, subjectId: area.id })
        }
        // Also search sub-competencies
        if (comp.subCompetencies) {
          for (const sub of comp.subCompetencies) {
            if (sub.code.toLowerCase().includes(q) || sub.name.toLowerCase().includes(q) || sub.description.toLowerCase().includes(q)) {
              results.push({ ...sub, parentCode: comp.code, cycleName: cycle.name, cycleId: cycle.id, subjectName: area.name, subjectId: area.id })
            }
          }
        }
      }
    }
  }
  return results
}

// Helper: Get all unique subject names across all cycles
export function getAllSubjects() {
  const subjects = new Map()
  for (const cycle of LEHRPLAN_CYCLES) {
    for (const area of cycle.areas) {
      if (!subjects.has(area.name)) {
        subjects.set(area.name, { name: area.name, icon: area.icon, cycles: [] })
      }
      subjects.get(area.name).cycles.push(cycle.id)
    }
  }
  return Array.from(subjects.values())
}

// Helper: Count total competencies
export function getTotalCompetencyCount() {
  let count = 0
  let subCount = 0
  for (const cycle of LEHRPLAN_CYCLES) {
    for (const area of cycle.areas) {
      count += area.competencies.length
      for (const comp of area.competencies) {
        if (comp.subCompetencies) subCount += comp.subCompetencies.length
      }
    }
  }
  return { competencies: count, subCompetencies: subCount, total: count + subCount }
}
