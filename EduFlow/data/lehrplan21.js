// ============================================================
// LEHRPLAN 21 – Vollständige Kompetenzen (Erweitert)
// Alle Zyklen, Fachbereiche und Kompetenzbereiche
// 300+ Kompetenzen, 500+ Sub-Kompetenzen
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
        { code: 'D.2.B.1', name: 'Lesen – Verstehen', description: 'Texte verstehen und darüber nachdenken', level: 'Grundanspruch', goals: ['Bilder und Text verbinden', 'Einfache Fragen zum Text beantworten', 'Texte nacherzählen'], sequence: ['Arbeitsblatt: Leseverständnis', 'Quiz: Was passiert im Text?'],
          subCompetencies: [
            { code: 'D.2.B.1.a', name: 'Bild-Text-Zuordnung', description: 'Bilder und zugehörige Textstellen verbinden' },
            { code: 'D.2.B.1.b', name: 'Fragen beantworten', description: 'Einfache W-Fragen zu einem Text beantworten' },
            { code: 'D.2.B.1.c', name: 'Nacherzählen', description: 'Den Inhalt eines Textes in eigenen Worten wiedergeben' },
          ]
        },
        { code: 'D.4.A.1', name: 'Schreiben – Grundfertigkeiten', description: 'Buchstaben und Wörter abschreiben und schreiben', level: 'Grundanspruch', goals: ['Buchstaben korrekt formen', 'Einfache Wörter schreiben', 'Kurze Sätze bilden'], sequence: ['Arbeitsblatt: Buchstaben üben', 'Arbeitsblatt: Wörter schreiben'],
          subCompetencies: [
            { code: 'D.4.A.1.a', name: 'Handschrift', description: 'Buchstaben formklar schreiben' },
            { code: 'D.4.A.1.b', name: 'Abschreiben', description: 'Wörter und kurze Sätze fehlerfrei abschreiben' },
          ]
        },
        { code: 'D.4.B.1', name: 'Schreiben – Textproduktion', description: 'Eigene kurze Texte verfassen', level: 'Grundanspruch', goals: ['Kurze Sätze schreiben', 'Zu Bildern schreiben', 'Eigene Geschichten erfinden'], sequence: ['Arbeitsblatt: Bildgeschichte schreiben', 'Arbeitsblatt: Sätze ergänzen'],
          subCompetencies: [
            { code: 'D.4.B.1.a', name: 'Sätze bilden', description: 'Vollständige Sätze mit Punkt und Grossbuchstabe schreiben' },
            { code: 'D.4.B.1.b', name: 'Bildgeschichten', description: 'Zu einer Bilderfolge eine Geschichte schreiben' },
            { code: 'D.4.B.1.c', name: 'Freies Schreiben', description: 'Eigene kleine Texte und Geschichten erfinden' },
          ]
        },
        { code: 'D.5.A.1', name: 'Sprache im Fokus – Wortlehre', description: 'Sprachliche Regelmässigkeiten entdecken', level: 'Grundanspruch', goals: ['Einzahl und Mehrzahl unterscheiden', 'Wortarten entdecken', 'Satzzeichen kennenlernen'], sequence: ['Quiz: Einzahl/Mehrzahl', 'Arbeitsblatt: Nomen erkennen'],
          subCompetencies: [
            { code: 'D.5.A.1.a', name: 'Nomen', description: 'Nomen erkennen und gross schreiben' },
            { code: 'D.5.A.1.b', name: 'Verben', description: 'Verben als Tuwörter erkennen' },
            { code: 'D.5.A.1.c', name: 'Adjektive', description: 'Adjektive als Wiewörter erkennen' },
          ]
        },
        { code: 'D.5.B.1', name: 'Sprache im Fokus – Rechtschreibung', description: 'Grundlegende Rechtschreibregeln anwenden', level: 'Grundanspruch', goals: ['Lautgetreu schreiben', 'Grossschreibung von Satzanfängen', 'Häufige Wörter richtig schreiben'], sequence: ['Arbeitsblatt: Rechtschreibung', 'Quiz: Gross/Kleinschreibung'],
          subCompetencies: [
            { code: 'D.5.B.1.a', name: 'Lautgetreu schreiben', description: 'Wörter so schreiben, wie man sie hört' },
            { code: 'D.5.B.1.b', name: 'Grossschreibung', description: 'Satzanfänge und Nomen gross schreiben' },
            { code: 'D.5.B.1.c', name: 'Häufige Wörter', description: 'Häufig gebrauchte Wörter korrekt schreiben' },
          ]
        },
      ]},

      // ── MATHEMATIK ──
      { id: 'z1-m', name: 'Mathematik', icon: '🔢', competencies: [
        { code: 'MA.1.A.1', name: 'Zahl und Variable – Operieren', description: 'Zahlen bis 100 verstehen und anwenden', level: 'Grundanspruch', goals: ['Zahlen bis 20 lesen und schreiben', 'Zahlen vergleichen und ordnen', 'Einfache Additionen und Subtraktionen'], sequence: ['Arbeitsblatt: Zahlen schreiben', 'Quiz: Grösser/Kleiner', 'Prüfung: Rechnen bis 20'],
          subCompetencies: [
            { code: 'MA.1.A.1.a', name: 'Zahlen bis 20', description: 'Im Zahlenraum bis 20 addieren und subtrahieren' },
            { code: 'MA.1.A.1.b', name: 'Zahlen bis 100', description: 'Zahlen bis 100 lesen, schreiben und vergleichen' },
            { code: 'MA.1.A.1.c', name: 'Verdoppeln/Halbieren', description: 'Verdoppeln und Halbieren als Rechenstrategien nutzen' },
            { code: 'MA.1.A.1.d', name: 'Einmaleins anbahnen', description: 'Erste Multiplikationsreihen (2, 5, 10) kennenlernen' },
          ]
        },
        { code: 'MA.1.B.1', name: 'Zahl und Variable – Erforschen', description: 'Zahlbeziehungen und Muster entdecken', level: 'Grundanspruch', goals: ['Zahlenmuster erkennen', 'Nachbarzahlen bestimmen', 'Gerade und ungerade Zahlen unterscheiden'], sequence: ['Arbeitsblatt: Zahlenmuster', 'Quiz: Gerade/Ungerade'],
          subCompetencies: [
            { code: 'MA.1.B.1.a', name: 'Zahlenmuster', description: 'Regelmässigkeiten in Zahlenreihen erkennen und fortsetzen' },
            { code: 'MA.1.B.1.b', name: 'Nachbarzahlen', description: 'Vorgänger und Nachfolger von Zahlen bestimmen' },
            { code: 'MA.1.B.1.c', name: 'Gerade/Ungerade', description: 'Gerade und ungerade Zahlen unterscheiden und erklären' },
          ]
        },
        { code: 'MA.2.A.1', name: 'Form und Raum – Operieren', description: 'Geometrische Formen erkennen und benennen', level: 'Grundanspruch', goals: ['Grundformen erkennen', 'Formen vergleichen', 'Einfache Muster legen'], sequence: ['Quiz: Formen erkennen', 'Arbeitsblatt: Formen zuordnen'],
          subCompetencies: [
            { code: 'MA.2.A.1.a', name: 'Formen benennen', description: 'Kreis, Dreieck, Viereck, Rechteck benennen' },
            { code: 'MA.2.A.1.b', name: 'Formen sortieren', description: 'Formen nach Eigenschaften sortieren' },
            { code: 'MA.2.A.1.c', name: 'Muster legen', description: 'Muster mit Formen legen und fortsetzen' },
          ]
        },
        { code: 'MA.2.B.1', name: 'Form und Raum – Erforschen', description: 'Räumliche Beziehungen erkunden', level: 'Grundanspruch', goals: ['Lagebeziehungen beschreiben', 'Spiegelungen erkennen', 'Einfache Pläne lesen'], sequence: ['Arbeitsblatt: Lage beschreiben', 'Quiz: Spiegelungen'],
          subCompetencies: [
            { code: 'MA.2.B.1.a', name: 'Lagebeziehungen', description: 'Oben/unten, links/rechts, vor/hinter beschreiben' },
            { code: 'MA.2.B.1.b', name: 'Spiegelungen', description: 'Einfache Spiegelungen an einer Achse erkennen' },
            { code: 'MA.2.B.1.c', name: 'Pläne lesen', description: 'Einfache Pläne und Grundrisse lesen' },
          ]
        },
        { code: 'MA.3.A.1', name: 'Grössen, Funktionen, Daten – Operieren', description: 'Grössen vergleichen und messen', level: 'Grundanspruch', goals: ['Längen vergleichen', 'Zeitabschnitte kennen', 'Einfache Daten sammeln'], sequence: ['Arbeitsblatt: Längen vergleichen', 'Quiz: Uhrzeit'],
          subCompetencies: [
            { code: 'MA.3.A.1.a', name: 'Längen', description: 'Längen mit Körpermassen und einfachen Messgeräten messen' },
            { code: 'MA.3.A.1.b', name: 'Zeit', description: 'Uhrzeiten lesen, Tageszeiten und Wochentage kennen' },
            { code: 'MA.3.A.1.c', name: 'Geld', description: 'Münzen und Noten kennen, einfache Beträge berechnen' },
          ]
        },
        { code: 'MA.3.B.1', name: 'Grössen, Funktionen, Daten – Erforschen', description: 'Daten sammeln und darstellen', level: 'Grundanspruch', goals: ['Strichlisten führen', 'Einfache Diagramme lesen', 'Informationen aus Tabellen entnehmen'], sequence: ['Arbeitsblatt: Strichliste', 'Quiz: Diagramme lesen'],
          subCompetencies: [
            { code: 'MA.3.B.1.a', name: 'Strichlisten', description: 'Daten mit Strichlisten erfassen und darstellen' },
            { code: 'MA.3.B.1.b', name: 'Tabellen lesen', description: 'Einfache Tabellen und Piktogramme lesen' },
            { code: 'MA.3.B.1.c', name: 'Daten vergleichen', description: 'Informationen aus Darstellungen vergleichen' },
          ]
        },
      ]},

      // ── NMG ──
      { id: 'z1-nmg', name: 'NMG', icon: '🌍', competencies: [
        { code: 'NMG.1.1', name: 'Identität, Körper, Gesundheit', description: 'Sich selber und andere wahrnehmen', level: 'Grundanspruch', goals: ['Über sich erzählen', 'Gefühle benennen', 'Regeln im Zusammenleben verstehen'], sequence: ['Arbeitsblatt: Über mich', 'Quiz: Gefühle erkennen'],
          subCompetencies: [
            { code: 'NMG.1.1.a', name: 'Körper kennen', description: 'Körperteile benennen und Funktionen kennen' },
            { code: 'NMG.1.1.b', name: 'Gesundheit', description: 'Gesunde Ernährung und Hygiene verstehen' },
            { code: 'NMG.1.1.c', name: 'Gefühle', description: 'Eigene Gefühle wahrnehmen und benennen' },
          ]
        },
        { code: 'NMG.1.2', name: 'Gemeinschaft & Zusammenleben', description: 'In der Gemeinschaft leben und mitbestimmen', level: 'Grundanspruch', goals: ['Regeln aushandeln', 'Konflikte friedlich lösen', 'Verschiedenheit respektieren'], sequence: ['Arbeitsblatt: Regeln', 'Quiz: Zusammenleben'],
          subCompetencies: [
            { code: 'NMG.1.2.a', name: 'Regeln', description: 'Klassenregeln verstehen, einhalten und mitgestalten' },
            { code: 'NMG.1.2.b', name: 'Konflikte lösen', description: 'Konflikte erkennen und friedlich lösen' },
            { code: 'NMG.1.2.c', name: 'Vielfalt', description: 'Unterschiedliche Lebenssituationen respektieren' },
          ]
        },
        { code: 'NMG.2.1', name: 'Tiere, Pflanzen, Lebensräume', description: 'Tiere und Pflanzen in der Umgebung erkunden', level: 'Grundanspruch', goals: ['Tiere benennen und beschreiben', 'Pflanzen beobachten', 'Lebensräume unterscheiden'], sequence: ['Quiz: Tiere erkennen', 'Arbeitsblatt: Pflanzen beobachten', 'Prüfung: Lebensräume'],
          subCompetencies: [
            { code: 'NMG.2.1.a', name: 'Tiere beobachten', description: 'Tiere in der näheren Umgebung beobachten und beschreiben' },
            { code: 'NMG.2.1.b', name: 'Pflanzen kennen', description: 'Häufige Pflanzen benennen und unterscheiden' },
            { code: 'NMG.2.1.c', name: 'Lebensräume', description: 'Verschiedene Lebensräume erkunden (Wald, Wiese, Wasser)' },
          ]
        },
        { code: 'NMG.2.2', name: 'Wachstum & Entwicklung', description: 'Wachstum und Veränderungen bei Lebewesen beobachten', level: 'Grundanspruch', goals: ['Wachstumsphasen kennen', 'Jahreszeiten und Natur', 'Keimung beobachten'], sequence: ['Arbeitsblatt: Jahreszeitenbuch', 'Quiz: Wachstum'],
          subCompetencies: [
            { code: 'NMG.2.2.a', name: 'Lebenszyklus', description: 'Wachstum und Entwicklung von Pflanzen und Tieren beobachten' },
            { code: 'NMG.2.2.b', name: 'Jahreszeiten', description: 'Veränderungen in der Natur über die Jahreszeiten beschreiben' },
          ]
        },
        { code: 'NMG.3.1', name: 'Stoffe, Energie, Bewegung', description: 'Materialien untersuchen und Eigenschaften beschreiben', level: 'Grundanspruch', goals: ['Materialien benennen', 'Eigenschaften vergleichen', 'Einfache Versuche durchführen'], sequence: ['Arbeitsblatt: Materialien sortieren'],
          subCompetencies: [
            { code: 'NMG.3.1.a', name: 'Materialien erkunden', description: 'Verschiedene Materialien mit allen Sinnen erkunden' },
            { code: 'NMG.3.1.b', name: 'Wasser', description: 'Wasser in verschiedenen Zuständen erleben' },
            { code: 'NMG.3.1.c', name: 'Eigenschaften', description: 'Materialien nach Eigenschaften sortieren und beschreiben' },
          ]
        },
        { code: 'NMG.4.1', name: 'Phänomene der Natur', description: 'Naturphänomene beobachten und beschreiben', level: 'Grundanspruch', goals: ['Wetter beobachten', 'Tag und Nacht verstehen', 'Jahreszeiten kennen'], sequence: ['Arbeitsblatt: Wetterbeobachtung', 'Quiz: Jahreszeiten'],
          subCompetencies: [
            { code: 'NMG.4.1.a', name: 'Wetter', description: 'Wetter beobachten und einfache Wetterphänomene beschreiben' },
            { code: 'NMG.4.1.b', name: 'Tag und Nacht', description: 'Den Wechsel von Tag und Nacht verstehen' },
            { code: 'NMG.4.1.c', name: 'Licht und Schatten', description: 'Licht und Schatten beobachten und beschreiben' },
          ]
        },
        { code: 'NMG.5.1', name: 'Technische Entwicklungen', description: 'Technische Geräte und Erfindungen erkunden', level: 'Grundanspruch', goals: ['Werkzeuge kennen', 'Einfache Maschinen verstehen', 'Technische Geräte im Alltag'], sequence: ['Arbeitsblatt: Werkzeuge', 'Quiz: Technik im Alltag'],
          subCompetencies: [
            { code: 'NMG.5.1.a', name: 'Werkzeuge', description: 'Einfache Werkzeuge kennen und deren Zweck beschreiben' },
            { code: 'NMG.5.1.b', name: 'Alltagstechnik', description: 'Technische Geräte im Alltag erkunden und deren Nutzen beschreiben' },
          ]
        },
        { code: 'NMG.6.1', name: 'Arbeit & Produktion', description: 'Berufe und Arbeitswelt kennenlernen', level: 'Grundanspruch', goals: ['Berufe kennen', 'Arbeitsabläufe verstehen', 'Tauschen und Handeln'], sequence: ['Arbeitsblatt: Berufe', 'Quiz: Wer arbeitet wo?'],
          subCompetencies: [
            { code: 'NMG.6.1.a', name: 'Berufe', description: 'Verschiedene Berufe in der Umgebung kennenlernen' },
            { code: 'NMG.6.1.b', name: 'Tauschen', description: 'Einfache Tausch- und Handelsbeziehungen verstehen' },
          ]
        },
        { code: 'NMG.7.1', name: 'Lebensweisen & Kulturen', description: 'Unterschiedliche Lebensweisen kennenlernen', level: 'Grundanspruch', goals: ['Feste und Bräuche', 'Unterschiedliche Familien', 'Kulturelle Vielfalt'], sequence: ['Arbeitsblatt: Feste', 'Quiz: Kulturen'],
          subCompetencies: [
            { code: 'NMG.7.1.a', name: 'Feste', description: 'Feste und Bräuche verschiedener Kulturen kennenlernen' },
            { code: 'NMG.7.1.b', name: 'Familien', description: 'Verschiedene Familienformen kennen und respektieren' },
          ]
        },
        { code: 'NMG.8.1', name: 'Menschen nutzen Räume', description: 'Den eigenen Lebensraum erkunden', level: 'Grundanspruch', goals: ['Schulweg kennen', 'Orte in der Umgebung beschreiben', 'Einfache Pläne lesen'], sequence: ['Arbeitsblatt: Mein Schulweg', 'Quiz: Orte'],
          subCompetencies: [
            { code: 'NMG.8.1.a', name: 'Umgebung', description: 'Die nähere Umgebung erkunden und beschreiben' },
            { code: 'NMG.8.1.b', name: 'Orientierung', description: 'Sich im Schulhaus und in der Umgebung orientieren' },
          ]
        },
        { code: 'NMG.9.1', name: 'Zeit, Dauer, Wandel', description: 'Zeitbegriffe und Veränderungen verstehen', level: 'Grundanspruch', goals: ['Gestern, heute, morgen', 'Zeitliche Reihenfolgen ordnen', 'Früher und heute vergleichen'], sequence: ['Arbeitsblatt: Zeitstrahl', 'Quiz: Früher und heute'],
          subCompetencies: [
            { code: 'NMG.9.1.a', name: 'Zeitbegriffe', description: 'Begriffe wie gestern, heute, morgen richtig verwenden' },
            { code: 'NMG.9.1.b', name: 'Veränderungen', description: 'Veränderungen im Laufe der Zeit erkennen' },
          ]
        },
      ]},

      // ── BILDNERISCHES GESTALTEN ──
      { id: 'z1-bg', name: 'Bildnerisches Gestalten', icon: '🎨', competencies: [
        { code: 'BG.1.A.1', name: 'Wahrnehmung & Kommunikation – Wahrnehmen', description: 'Bilder und Kunstwerke betrachten und besprechen', level: 'Grundanspruch', goals: ['Bilder beschreiben', 'Farben und Formen benennen', 'Eigene Eindrücke mitteilen'], sequence: ['Arbeitsblatt: Bild beschreiben', 'Quiz: Farben erkennen'],
          subCompetencies: [
            { code: 'BG.1.A.1.a', name: 'Bilder betrachten', description: 'Bilder aufmerksam betrachten und Details benennen' },
            { code: 'BG.1.A.1.b', name: 'Farben kennen', description: 'Grundfarben und Mischfarben benennen' },
          ]
        },
        { code: 'BG.1.B.1', name: 'Wahrnehmung & Kommunikation – Sich ausdrücken', description: 'Eigene Vorstellungen und Erlebnisse darstellen', level: 'Grundanspruch', goals: ['Erlebnisse zeichnen', 'Fantasiebilder gestalten', 'Gefühle in Bildern ausdrücken'], sequence: ['Arbeitsblatt: Mein Erlebnis', 'Arbeitsblatt: Fantasiebild'],
          subCompetencies: [
            { code: 'BG.1.B.1.a', name: 'Erlebnisse darstellen', description: 'Eigene Erlebnisse bildnerisch umsetzen' },
            { code: 'BG.1.B.1.b', name: 'Fantasie', description: 'Fantasievorstellungen in Bildern ausdrücken' },
          ]
        },
        { code: 'BG.2.A.1', name: 'Prozesse & Produkte – Experimentieren', description: 'Mit verschiedenen Materialien und Techniken experimentieren', level: 'Grundanspruch', goals: ['Malen mit verschiedenen Farben', 'Collagen gestalten', 'Drucktechniken ausprobieren'], sequence: ['Arbeitsblatt: Farbexperimente', 'Arbeitsblatt: Collage'],
          subCompetencies: [
            { code: 'BG.2.A.1.a', name: 'Malen', description: 'Mit Wasserfarben, Farbstiften und Wachskreiden experimentieren' },
            { code: 'BG.2.A.1.b', name: 'Collagen', description: 'Materialien schneiden, reissen und kleben' },
          ]
        },
        { code: 'BG.2.B.1', name: 'Prozesse & Produkte – Gestalten', description: 'Bildnerische Arbeiten planen und umsetzen', level: 'Grundanspruch', goals: ['Bilder farbig gestalten', 'Verschiedene Materialien nutzen', 'Eigene Arbeiten beurteilen'], sequence: ['Arbeitsblatt: Mein Kunstwerk'] },
        { code: 'BG.3.A.1', name: 'Kontexte & Orientierung', description: 'Kunst und Bilder in der Umgebung entdecken', level: 'Grundanspruch', goals: ['Bilder in der Umwelt finden', 'Künstler kennenlernen', 'Museum/Ausstellung besuchen'], sequence: ['Quiz: Kunst in der Umgebung'] },
      ]},

      // ── TEXTILES UND TECHNISCHES GESTALTEN ──
      { id: 'z1-ttg', name: 'Textiles und Technisches Gestalten', icon: '✂️', competencies: [
        { code: 'TTG.1.A.1', name: 'Wahrnehmung & Kommunikation', description: 'Objekte und Materialien erkunden', level: 'Grundanspruch', goals: ['Materialien ertasten', 'Alltagsgegenstände untersuchen', 'Funktionen entdecken'], sequence: ['Arbeitsblatt: Materialien erkunden'],
          subCompetencies: [
            { code: 'TTG.1.A.1.a', name: 'Sinneserfahrungen', description: 'Materialien mit verschiedenen Sinnen erkunden' },
            { code: 'TTG.1.A.1.b', name: 'Funktion erkennen', description: 'Funktionen von Alltagsgegenständen beschreiben' },
          ]
        },
        { code: 'TTG.2.A.1', name: 'Prozesse – Ideen entwickeln', description: 'Ideen für gestalterische Arbeiten entwickeln', level: 'Grundanspruch', goals: ['Eigene Ideen sammeln', 'Skizzen anfertigen', 'Gestaltungsaufgaben verstehen'], sequence: ['Arbeitsblatt: Meine Idee'] },
        { code: 'TTG.2.B.1', name: 'Prozesse – Planen & Herstellen', description: 'Einfache Werkstücke planen und herstellen', level: 'Grundanspruch', goals: ['Arbeitsschritte planen', 'Werkzeuge sachgerecht einsetzen', 'Sorgfältig arbeiten'], sequence: ['Arbeitsblatt: Werkstück planen'] },
        { code: 'TTG.2.C.1', name: 'Textil – Verfahren', description: 'Textile Grundverfahren anwenden', level: 'Grundanspruch', goals: ['Flechten und Weben', 'Schneiden und Kleben', 'Einfache Näharbeiten'], sequence: ['Arbeitsblatt: Weben', 'Arbeitsblatt: Nähen Grundstich'],
          subCompetencies: [
            { code: 'TTG.2.C.1.a', name: 'Flechten/Weben', description: 'Einfache Flecht- und Webtechniken anwenden' },
            { code: 'TTG.2.C.1.b', name: 'Nähen', description: 'Erste Näharbeiten mit der Hand ausführen' },
          ]
        },
        { code: 'TTG.2.D.1', name: 'Technisch – Verfahren', description: 'Technische Grundverfahren anwenden', level: 'Grundanspruch', goals: ['Sägen und Feilen', 'Bohren und Schrauben', 'Verbindungen herstellen'], sequence: ['Arbeitsblatt: Werkzeuge kennen'],
          subCompetencies: [
            { code: 'TTG.2.D.1.a', name: 'Holzbearbeitung', description: 'Einfache Holzarbeiten mit Säge und Feile ausführen' },
            { code: 'TTG.2.D.1.b', name: 'Verbinden', description: 'Materialien mit Leim, Nägeln oder Schrauben verbinden' },
          ]
        },
      ]},

      // ── MUSIK ──
      { id: 'z1-mu', name: 'Musik', icon: '🎵', competencies: [
        { code: 'MU.1.A.1', name: 'Singen und Sprechen', description: 'Lieder singen und Verse sprechen', level: 'Grundanspruch', goals: ['Lieder auswendig singen', 'Rhythmisch sprechen', 'Stimmexperimente machen'], sequence: ['Arbeitsblatt: Liedtext lernen', 'Quiz: Rhythmus klatschen'],
          subCompetencies: [
            { code: 'MU.1.A.1.a', name: 'Lieder singen', description: 'Einfache Lieder auswendig und im Takt singen' },
            { code: 'MU.1.A.1.b', name: 'Verse sprechen', description: 'Verse und Reime rhythmisch sprechen' },
          ]
        },
        { code: 'MU.2.A.1', name: 'Hören und Sich-Orientieren', description: 'Klänge und Musik bewusst hören', level: 'Grundanspruch', goals: ['Instrumente am Klang erkennen', 'Laut-leise unterscheiden', 'Hoch-tief unterscheiden'], sequence: ['Quiz: Instrumente erkennen', 'Arbeitsblatt: Klangdetektiv'],
          subCompetencies: [
            { code: 'MU.2.A.1.a', name: 'Klänge erkennen', description: 'Verschiedene Klänge und Geräusche unterscheiden' },
            { code: 'MU.2.A.1.b', name: 'Laut/Leise', description: 'Lautstärkeunterschiede wahrnehmen und beschreiben' },
            { code: 'MU.2.A.1.c', name: 'Hoch/Tief', description: 'Tonhöhenunterschiede wahrnehmen' },
          ]
        },
        { code: 'MU.3.A.1', name: 'Bewegen und Tanzen', description: 'Sich zu Musik bewegen', level: 'Grundanspruch', goals: ['Im Takt klatschen', 'Einfache Tanzschritte lernen', 'Bewegungslieder umsetzen'], sequence: ['Arbeitsblatt: Bewegungslied'] },
        { code: 'MU.4.A.1', name: 'Musizieren', description: 'Mit Instrumenten musizieren', level: 'Grundanspruch', goals: ['Körperinstrumente einsetzen', 'Rhythmusinstrumente spielen', 'Einfache Begleitungen spielen'], sequence: ['Arbeitsblatt: Rhythmusinstrumente'] },
        { code: 'MU.5.A.1', name: 'Gestaltungsprozesse', description: 'Musikalische Ideen gestalten', level: 'Grundanspruch', goals: ['Klanggeschichten erfinden', 'Lieder begleiten', 'Eigene Rhythmen erfinden'], sequence: ['Arbeitsblatt: Klanggeschichte'] },
        { code: 'MU.6.A.1', name: 'Praxis des musikalischen Wissens', description: 'Musikalische Grundbegriffe kennenlernen', level: 'Grundanspruch', goals: ['Notenwerte kennen', 'Taktarten erfahren', 'Musikalische Zeichen lesen'], sequence: ['Quiz: Notenwerte', 'Arbeitsblatt: Noten lesen'],
          subCompetencies: [
            { code: 'MU.6.A.1.a', name: 'Notenwerte', description: 'Ganze, halbe und Viertelnoten kennen' },
            { code: 'MU.6.A.1.b', name: 'Takt', description: 'Einen Grundschlag mitklatschen und Taktarten spüren' },
          ]
        },
      ]},

      // ── BEWEGUNG UND SPORT ──
      { id: 'z1-bs', name: 'Bewegung und Sport', icon: '⚽', competencies: [
        { code: 'BS.1.A.1', name: 'Laufen, Springen, Werfen', description: 'Grundbewegungen vielseitig ausführen', level: 'Grundanspruch', goals: ['Verschiedene Laufformen', 'Weit und hoch springen', 'Werfen und Fangen'], sequence: ['Arbeitsblatt: Bewegungsformen'],
          subCompetencies: [
            { code: 'BS.1.A.1.a', name: 'Laufen', description: 'Verschiedene Laufformen (schnell, langsam, seitwärts) ausführen' },
            { code: 'BS.1.A.1.b', name: 'Springen', description: 'Einbeinig und beidbeinig springen' },
            { code: 'BS.1.A.1.c', name: 'Werfen/Fangen', description: 'Bälle werfen und fangen' },
          ]
        },
        { code: 'BS.2.A.1', name: 'Bewegen an Geräten', description: 'An Geräten klettern, balancieren, schwingen', level: 'Grundanspruch', goals: ['Balancieren auf der Bank', 'An Geräten klettern', 'Rollen und Drehen'], sequence: ['Arbeitsblatt: Geräteparcours'],
          subCompetencies: [
            { code: 'BS.2.A.1.a', name: 'Balancieren', description: 'Auf verschiedenen Geräten balancieren' },
            { code: 'BS.2.A.1.b', name: 'Klettern', description: 'An Sprossenwand und Geräten sicher klettern' },
            { code: 'BS.2.A.1.c', name: 'Rollen', description: 'Vorwärts- und Rückwärtsrolle ausführen' },
          ]
        },
        { code: 'BS.3.A.1', name: 'Darstellen und Tanzen', description: 'Sich ausdrücken und Bewegungen gestalten', level: 'Grundanspruch', goals: ['Bewegungen nachmachen', 'Einfache Tänze lernen', 'Rhythmisch bewegen'], sequence: ['Arbeitsblatt: Tanzschritte'] },
        { code: 'BS.4.A.1', name: 'Spielen', description: 'In Spielen fair miteinander umgehen', level: 'Grundanspruch', goals: ['Fangspiele spielen', 'Regeln einhalten', 'In der Gruppe spielen'], sequence: ['Arbeitsblatt: Spielregeln'],
          subCompetencies: [
            { code: 'BS.4.A.1.a', name: 'Fangspiele', description: 'Verschiedene Fangspiele kennen und spielen' },
            { code: 'BS.4.A.1.b', name: 'Regeln', description: 'Spielregeln verstehen und einhalten' },
            { code: 'BS.4.A.1.c', name: 'Fair Play', description: 'Fair und rücksichtsvoll spielen' },
          ]
        },
        { code: 'BS.5.A.1', name: 'Gleiten, Rollen, Fahren', description: 'Sich mit Geräten fortbewegen', level: 'Grundanspruch', goals: ['Rollbrett fahren', 'Schlittschuhe laufen', 'Gleichgewicht halten'], sequence: ['Arbeitsblatt: Gleiten und Rollen'] },
        { code: 'BS.6.A.1', name: 'Bewegen im Wasser', description: 'Sich sicher im Wasser bewegen', level: 'Grundanspruch', goals: ['Wassergewöhnung', 'Gleiten und Tauchen', 'Schwimmtechniken anbahnen'], sequence: ['Arbeitsblatt: Schwimmtest'],
          subCompetencies: [
            { code: 'BS.6.A.1.a', name: 'Wassergewöhnung', description: 'Sich im Wasser wohlfühlen und Gesicht untertauchen' },
            { code: 'BS.6.A.1.b', name: 'Gleiten', description: 'In Bauchlage und Rückenlage gleiten' },
          ]
        },
      ]},

      // ── MEDIEN UND INFORMATIK ──
      { id: 'z1-mi', name: 'Medien und Informatik', icon: '💻', competencies: [
        { code: 'MI.1.1', name: 'Medien – Leben in der Mediengesellschaft', description: 'Erfahrungen mit Medien sammeln und darüber sprechen', level: 'Grundanspruch', goals: ['Medien im Alltag benennen', 'Eigene Mediennutzung beschreiben', 'Realität und Fiktion unterscheiden'], sequence: ['Quiz: Medien erkennen', 'Arbeitsblatt: Meine Medien'],
          subCompetencies: [
            { code: 'MI.1.1.a', name: 'Medien benennen', description: 'Verschiedene Medien im Alltag erkennen und benennen' },
            { code: 'MI.1.1.b', name: 'Realität/Fiktion', description: 'Zwischen realen und fiktiven Medieninhalten unterscheiden' },
          ]
        },
        { code: 'MI.1.2', name: 'Medien – Sich schützen', description: 'Grundregeln für den Umgang mit Medien kennen', level: 'Grundanspruch', goals: ['Regeln für Mediennutzung', 'Persönliche Daten schützen', 'Unangenehmes melden'], sequence: ['Arbeitsblatt: Medienregeln'],
          subCompetencies: [
            { code: 'MI.1.2.a', name: 'Medienregeln', description: 'Regeln für die Mediennutzung kennen und einhalten' },
            { code: 'MI.1.2.b', name: 'Hilfe holen', description: 'Bei unangenehmen Medienerlebnissen Hilfe holen' },
          ]
        },
        { code: 'MI.2.1', name: 'Informatik – Datenstrukturen', description: 'Daten ordnen und darstellen', level: 'Grundanspruch', goals: ['Informationen sammeln', 'Einfach sortieren und ordnen', 'Symbole und Codes nutzen'], sequence: ['Arbeitsblatt: Sortieren'],
          subCompetencies: [
            { code: 'MI.2.1.a', name: 'Ordnen', description: 'Gegenstände und Informationen nach Kriterien ordnen' },
            { code: 'MI.2.1.b', name: 'Symbole', description: 'Einfache Symbole und Codes verwenden und verstehen' },
          ]
        },
        { code: 'MI.2.2', name: 'Informatik – Algorithmen', description: 'Abläufe erkennen und beschreiben', level: 'Grundanspruch', goals: ['Handlungsabläufe beschreiben', 'Einfache Anleitungen befolgen', 'Muster erkennen'], sequence: ['Arbeitsblatt: Ablauf beschreiben', 'Quiz: Muster erkennen'],
          subCompetencies: [
            { code: 'MI.2.2.a', name: 'Abläufe', description: 'Einfache Handlungsabläufe Schritt für Schritt beschreiben' },
            { code: 'MI.2.2.b', name: 'Muster', description: 'Sich wiederholende Muster erkennen und fortsetzen' },
          ]
        },
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
            { code: 'D.1.A.2.c', name: 'Absichten erkennen', description: 'Die Absicht eines Hörtextes erkennen (informieren, unterhalten, überzeugen)' },
          ]
        },
        { code: 'D.1.B.2', name: 'Sprechen – Monologisch', description: 'Zusammenhängend über Erfahrungen und Sachverhalte berichten', level: 'Grundanspruch', goals: ['Vorträge halten', 'Geschichten nacherzählen', 'Diskussionen führen'], sequence: ['Arbeitsblatt: Vortrag vorbereiten', 'Quiz: Redewendungen'],
          subCompetencies: [
            { code: 'D.1.B.2.a', name: 'Vortragen', description: 'Kurze Vorträge strukturiert vortragen' },
            { code: 'D.1.B.2.b', name: 'Erzählen', description: 'Erlebnisse und Geschichten spannend erzählen' },
            { code: 'D.1.B.2.c', name: 'Berichten', description: 'Sachlich und geordnet über Erfahrungen berichten' },
          ]
        },
        { code: 'D.1.C.2', name: 'Sprechen – Dialogisch', description: 'In Gesprächen und Diskussionen aktiv teilnehmen', level: 'Grundanspruch', goals: ['Gesprächsregeln einhalten', 'Nachfragen stellen', 'Eigene Meinung begründen'], sequence: ['Arbeitsblatt: Diskussionsregeln', 'Quiz: Argumentieren'],
          subCompetencies: [
            { code: 'D.1.C.2.a', name: 'Gesprächsregeln', description: 'Gesprächsregeln kennen und einhalten' },
            { code: 'D.1.C.2.b', name: 'Meinung begründen', description: 'Die eigene Meinung mit Argumenten begründen' },
            { code: 'D.1.C.2.c', name: 'Nachfragen', description: 'Gezielt nachfragen und auf Beiträge eingehen' },
          ]
        },
        { code: 'D.2.A.2', name: 'Lesen – Grundfertigkeiten', description: 'Texte flüssig und genau lesen', level: 'Grundanspruch', goals: ['Leseflüssigkeit steigern', 'Lesetempo anpassen', 'Betont vorlesen'], sequence: ['Arbeitsblatt: Lesetraining', 'Prüfung: Vorlesen'],
          subCompetencies: [
            { code: 'D.2.A.2.a', name: 'Leseflüssigkeit', description: 'Texte flüssig und mit angemessenem Tempo lesen' },
            { code: 'D.2.A.2.b', name: 'Betontes Lesen', description: 'Texte sinngestaltend und betont vorlesen' },
          ]
        },
        { code: 'D.2.B.2', name: 'Lesen – Verstehen', description: 'Texte verstehen und Informationen verarbeiten', level: 'Grundanspruch', goals: ['Sachtexte verstehen', 'Informationen herauslesen', 'Texte zusammenfassen', 'Leseflüssigkeit steigern'], sequence: ['Arbeitsblatt: Leseverständnis', 'Quiz: Textverständnis', 'Prüfung: Lesen & Verstehen'],
          subCompetencies: [
            { code: 'D.2.B.2.a', name: 'Informationen entnehmen', description: 'Gezielt Informationen aus Texten entnehmen' },
            { code: 'D.2.B.2.b', name: 'Zusammenfassen', description: 'Texte in eigenen Worten zusammenfassen' },
            { code: 'D.2.B.2.c', name: 'Interpretieren', description: 'Texte deuten und darüber nachdenken' },
            { code: 'D.2.B.2.d', name: 'Lesestrategien', description: 'Verschiedene Lesestrategien gezielt einsetzen' },
          ]
        },
        { code: 'D.2.C.1', name: 'Lesen – Reflexion', description: 'Texte kritisch beurteilen und vergleichen', level: 'Erweitert', goals: ['Texte vergleichen', 'Absichten erkennen', 'Texte bewerten'], sequence: ['Arbeitsblatt: Textvergleich'],
          subCompetencies: [
            { code: 'D.2.C.1.a', name: 'Texte vergleichen', description: 'Verschiedene Texte zum gleichen Thema vergleichen' },
            { code: 'D.2.C.1.b', name: 'Bewerten', description: 'Texte nach Kriterien bewerten und einordnen' },
          ]
        },
        { code: 'D.4.A.2', name: 'Schreiben – Grundfertigkeiten', description: 'Korrekt und flüssig schreiben', level: 'Grundanspruch', goals: ['Verbundene Schrift beherrschen', 'Am Computer schreiben', 'Texte sauber gestalten'], sequence: ['Arbeitsblatt: Schreibtraining'],
          subCompetencies: [
            { code: 'D.4.A.2.a', name: 'Verbundene Schrift', description: 'In einer verbundenen Schrift flüssig schreiben' },
            { code: 'D.4.A.2.b', name: 'Tastaturschreiben', description: 'Texte am Computer eingeben' },
          ]
        },
        { code: 'D.4.B.2', name: 'Schreiben – Textproduktion', description: 'Texte planen, schreiben und überarbeiten', level: 'Grundanspruch', goals: ['Texte strukturiert aufbauen', 'Verschiedene Textsorten kennen', 'Texte überarbeiten', 'Rechtschreibung anwenden'], sequence: ['Arbeitsblatt: Aufsatz schreiben', 'Arbeitsblatt: Rechtschreibung', 'Prüfung: Diktat'],
          subCompetencies: [
            { code: 'D.4.B.2.a', name: 'Planen', description: 'Texte mithilfe von Clustern und Stichwörtern planen' },
            { code: 'D.4.B.2.b', name: 'Formulieren', description: 'Verschiedene Textsorten verfassen (Bericht, Brief, Erzählung)' },
            { code: 'D.4.B.2.c', name: 'Überarbeiten', description: 'Eigene Texte mithilfe von Kriterien überarbeiten' },
            { code: 'D.4.B.2.d', name: 'Beschreiben', description: 'Gegenstände, Personen und Vorgänge genau beschreiben' },
          ]
        },
        { code: 'D.5.A.2', name: 'Sprache im Fokus – Wortlehre', description: 'Wortarten und Wortbildung verstehen', level: 'Grundanspruch', goals: ['Wortarten bestimmen', 'Wortfamilien erkennen', 'Zusammengesetzte Wörter verstehen'], sequence: ['Quiz: Wortarten', 'Arbeitsblatt: Wortfamilien'],
          subCompetencies: [
            { code: 'D.5.A.2.a', name: 'Wortarten', description: 'Nomen, Verben, Adjektive sicher bestimmen' },
            { code: 'D.5.A.2.b', name: 'Wortfamilien', description: 'Wörter gleicher Wortfamilie erkennen und bilden' },
            { code: 'D.5.A.2.c', name: 'Wortbildung', description: 'Zusammengesetzte Wörter und Ableitungen verstehen' },
          ]
        },
        { code: 'D.5.B.2', name: 'Sprache im Fokus – Satzlehre', description: 'Grammatik und Sprachstrukturen verstehen und anwenden', level: 'Grundanspruch', goals: ['Wortarten bestimmen', 'Satzglieder erkennen', 'Zeitformen anwenden', 'Fälle erkennen'], sequence: ['Arbeitsblatt: Wortarten', 'Quiz: Zeitformen', 'Prüfung: Grammatik'],
          subCompetencies: [
            { code: 'D.5.B.2.a', name: 'Satzglieder', description: 'Subjekt, Prädikat, Objekt erkennen' },
            { code: 'D.5.B.2.b', name: 'Zeitformen', description: 'Präsens, Präteritum, Perfekt, Futur anwenden' },
            { code: 'D.5.B.2.c', name: 'Fälle', description: 'Die vier Fälle erkennen und anwenden' },
            { code: 'D.5.B.2.d', name: 'Pronomen', description: 'Personalpronomen und Possessivpronomen richtig einsetzen' },
          ]
        },
        { code: 'D.5.C.2', name: 'Sprache im Fokus – Rechtschreibung', description: 'Rechtschreibregeln kennen und anwenden', level: 'Grundanspruch', goals: ['Dehnung und Schärfung', 'Gross-/Kleinschreibung', 'Zeichensetzung anwenden'], sequence: ['Arbeitsblatt: Rechtschreibung', 'Prüfung: Diktat'],
          subCompetencies: [
            { code: 'D.5.C.2.a', name: 'Dehnung/Schärfung', description: 'Dehnungs- und Schärfungsregeln anwenden' },
            { code: 'D.5.C.2.b', name: 'Gross-/Kleinschreibung', description: 'Regeln der Gross-/Kleinschreibung sicher anwenden' },
            { code: 'D.5.C.2.c', name: 'Zeichensetzung', description: 'Punkt, Komma, Fragezeichen und Ausrufezeichen setzen' },
          ]
        },
        { code: 'D.6.A.1', name: 'Literatur im Fokus', description: 'Literarische Texte lesen und darüber nachdenken', level: 'Erweitert', goals: ['Bücher lesen und besprechen', 'Figuren charakterisieren', 'Geschichten weiterschreiben'], sequence: ['Arbeitsblatt: Buchbesprechung', 'Quiz: Literarische Begriffe'],
          subCompetencies: [
            { code: 'D.6.A.1.a', name: 'Figuren', description: 'Figuren in Geschichten beschreiben und charakterisieren' },
            { code: 'D.6.A.1.b', name: 'Handlung', description: 'Handlungsverlauf erkennen und nacherzählen' },
            { code: 'D.6.A.1.c', name: 'Lesetagebuch', description: 'Ein Lesetagebuch führen und Eindrücke festhalten' },
          ]
        },
      ]},

      // ── MATHEMATIK ──
      { id: 'z2-m', name: 'Mathematik', icon: '🔢', competencies: [
        { code: 'MA.1.A.2', name: 'Zahl und Variable – Operieren', description: 'Mit natürlichen Zahlen und Brüchen rechnen', level: 'Grundanspruch', goals: ['Grundoperationen beherrschen', 'Schriftliche Verfahren anwenden', 'Brüche verstehen', 'Textaufgaben lösen'], sequence: ['Arbeitsblatt: Grundoperationen', 'Arbeitsblatt: Bruchrechnen', 'Prüfung: Zahlen & Operationen'],
          subCompetencies: [
            { code: 'MA.1.A.2.a', name: 'Kopfrechnen', description: 'Im Kopf addieren, subtrahieren, multiplizieren und dividieren' },
            { code: 'MA.1.A.2.b', name: 'Schriftliche Verfahren', description: 'Schriftliche Addition, Subtraktion, Multiplikation und Division' },
            { code: 'MA.1.A.2.c', name: 'Brüche', description: 'Brüche und Dezimalzahlen verstehen und damit rechnen' },
            { code: 'MA.1.A.2.d', name: 'Textaufgaben', description: 'Textaufgaben lesen, verstehen und in Rechnungen umsetzen' },
          ]
        },
        { code: 'MA.1.B.2', name: 'Zahl und Variable – Erforschen', description: 'Zahlbeziehungen und Muster erforschen', level: 'Grundanspruch', goals: ['Teilbarkeitsregeln', 'Primzahlen kennen', 'Zahlenrätsel lösen'], sequence: ['Arbeitsblatt: Teilbarkeit', 'Quiz: Primzahlen'],
          subCompetencies: [
            { code: 'MA.1.B.2.a', name: 'Teilbarkeit', description: 'Teilbarkeitsregeln (2, 3, 5, 9, 10) kennen und anwenden' },
            { code: 'MA.1.B.2.b', name: 'Primzahlen', description: 'Primzahlen erkennen und von zusammengesetzten Zahlen unterscheiden' },
            { code: 'MA.1.B.2.c', name: 'Zahlenrätsel', description: 'Mathematische Rätsel und Knobelaufgaben lösen' },
          ]
        },
        { code: 'MA.2.A.2', name: 'Form und Raum – Operieren', description: 'Geometrische Figuren und Körper untersuchen', level: 'Grundanspruch', goals: ['Flächen und Umfang berechnen', 'Symmetrie erkennen', 'Koordinatensystem nutzen', 'Körper und Netze kennen'], sequence: ['Arbeitsblatt: Flächen berechnen', 'Quiz: Symmetrie', 'Prüfung: Geometrie'],
          subCompetencies: [
            { code: 'MA.2.A.2.a', name: 'Umfang und Fläche', description: 'Umfang und Fläche von Rechtecken und Dreiecken berechnen' },
            { code: 'MA.2.A.2.b', name: 'Winkel', description: 'Winkel messen und zeichnen' },
            { code: 'MA.2.A.2.c', name: 'Koordinaten', description: 'Punkte im Koordinatensystem einzeichnen und ablesen' },
            { code: 'MA.2.A.2.d', name: 'Körpernetze', description: 'Netze von Würfeln und Quadern erkennen und falten' },
          ]
        },
        { code: 'MA.2.B.2', name: 'Form und Raum – Erforschen', description: 'Geometrische Zusammenhänge erforschen', level: 'Grundanspruch', goals: ['Symmetrien entdecken', 'Parkettierungen untersuchen', 'Körpernetze falten'], sequence: ['Arbeitsblatt: Symmetrie', 'Quiz: Körpernetze'],
          subCompetencies: [
            { code: 'MA.2.B.2.a', name: 'Symmetrien', description: 'Achsensymmetrische Figuren erkennen und zeichnen' },
            { code: 'MA.2.B.2.b', name: 'Parkettierungen', description: 'Parkettierungen mit verschiedenen Formen erstellen' },
          ]
        },
        { code: 'MA.3.A.2', name: 'Grössen, Funktionen, Daten – Operieren', description: 'Grössen messen, Daten darstellen und interpretieren', level: 'Grundanspruch', goals: ['Masseinheiten umrechnen', 'Diagramme lesen und erstellen', 'Sachaufgaben lösen', 'Funktionale Zusammenhänge erkennen'], sequence: ['Arbeitsblatt: Masseinheiten', 'Arbeitsblatt: Diagramme', 'Prüfung: Sachaufgaben'],
          subCompetencies: [
            { code: 'MA.3.A.2.a', name: 'Masseinheiten', description: 'Längen-, Gewichts-, Hohl- und Zeitmasse umrechnen' },
            { code: 'MA.3.A.2.b', name: 'Diagramme', description: 'Säulen-, Kreis- und Liniendiagramme lesen und erstellen' },
            { code: 'MA.3.A.2.c', name: 'Sachrechnen', description: 'Sachaufgaben mit mehreren Rechenschritten lösen' },
            { code: 'MA.3.A.2.d', name: 'Massstab', description: 'Massstäbe verstehen und damit rechnen' },
          ]
        },
        { code: 'MA.3.B.2', name: 'Grössen, Funktionen, Daten – Erforschen', description: 'Zusammenhänge zwischen Grössen entdecken', level: 'Grundanspruch', goals: ['Proportionale Zuordnungen', 'Tabellen und Wertepaare', 'Eigene Datenerhebungen'], sequence: ['Arbeitsblatt: Proportionalität', 'Quiz: Daten erheben'],
          subCompetencies: [
            { code: 'MA.3.B.2.a', name: 'Proportionalität', description: 'Proportionale Zuordnungen erkennen und anwenden' },
            { code: 'MA.3.B.2.b', name: 'Daten erheben', description: 'Eigene Daten erheben, ordnen und darstellen' },
          ]
        },
      ]},

      // ── NMG ──
      { id: 'z2-nmg', name: 'NMG', icon: '🌍', competencies: [
        { code: 'NMG.1.2', name: 'Identität, Körper, Gesundheit', description: 'Zusammenleben, Rechte und Pflichten verstehen', level: 'Grundanspruch', goals: ['Demokratische Grundwerte kennen', 'Konflikte lösen', 'Diversität verstehen'], sequence: ['Quiz: Kinderrechte', 'Arbeitsblatt: Zusammenleben'],
          subCompetencies: [
            { code: 'NMG.1.2.a', name: 'Pubertät', description: 'Körperliche Veränderungen in der Pubertät kennen' },
            { code: 'NMG.1.2.b', name: 'Gesundheit', description: 'Ernährung, Bewegung und Erholung für Gesundheit verstehen' },
            { code: 'NMG.1.2.c', name: 'Suchtprävention', description: 'Gefahren von Suchtmitteln kennen und einordnen' },
          ]
        },
        { code: 'NMG.1.3', name: 'Gemeinschaft & Gesellschaft', description: 'Zusammenleben gestalten und reflektieren', level: 'Grundanspruch', goals: ['Rechte und Pflichten kennen', 'Demokratie erleben', 'Vielfalt respektieren'], sequence: ['Arbeitsblatt: Kinderrechte', 'Quiz: Demokratie'],
          subCompetencies: [
            { code: 'NMG.1.3.a', name: 'Kinderrechte', description: 'Die wichtigsten Kinderrechte kennen und erklären' },
            { code: 'NMG.1.3.b', name: 'Demokratie erleben', description: 'Demokratische Prozesse im Schulalltag erleben (Klassenrat)' },
          ]
        },
        { code: 'NMG.2.2', name: 'Tiere, Pflanzen, Lebensräume', description: 'Lebewesen und Ökosysteme erforschen', level: 'Grundanspruch', goals: ['Lebenszyklen verstehen', 'Nahrungsketten erklären', 'Ökosysteme beschreiben', 'Artenvielfalt erkunden'], sequence: ['Arbeitsblatt: Nahrungsketten', 'Quiz: Ökosysteme', 'Prüfung: Lebensräume'],
          subCompetencies: [
            { code: 'NMG.2.2.a', name: 'Nahrungsketten', description: 'Nahrungsbeziehungen in einem Ökosystem darstellen' },
            { code: 'NMG.2.2.b', name: 'Anpassungen', description: 'Anpassungen von Lebewesen an ihren Lebensraum erklären' },
            { code: 'NMG.2.2.c', name: 'Artenkenntnis', description: 'Einheimische Tier- und Pflanzenarten bestimmen' },
            { code: 'NMG.2.2.d', name: 'Biodiversität', description: 'Die Bedeutung der Artenvielfalt verstehen' },
          ]
        },
        { code: 'NMG.2.3', name: 'Körperfunktionen', description: 'Aufbau und Funktionen des menschlichen Körpers kennen', level: 'Grundanspruch', goals: ['Organe und ihre Funktionen', 'Bewegungsapparat verstehen', 'Sinnesorgane erforschen'], sequence: ['Arbeitsblatt: Organe', 'Quiz: Sinnesorgane'],
          subCompetencies: [
            { code: 'NMG.2.3.a', name: 'Organe', description: 'Wichtige Organe und ihre Funktionen kennen' },
            { code: 'NMG.2.3.b', name: 'Skelett', description: 'Aufbau des Skeletts und wichtige Knochen kennen' },
            { code: 'NMG.2.3.c', name: 'Sinne', description: 'Die fünf Sinne und ihre Funktion beschreiben' },
          ]
        },
        { code: 'NMG.3.2', name: 'Stoffe, Energie, Bewegung', description: 'Stoffe untersuchen und Energieformen kennen', level: 'Grundanspruch', goals: ['Aggregatzustände kennen', 'Energieformen unterscheiden', 'Experimente planen und auswerten'], sequence: ['Arbeitsblatt: Aggregatzustände', 'Quiz: Energieformen'],
          subCompetencies: [
            { code: 'NMG.3.2.a', name: 'Aggregatzustände', description: 'Fest, flüssig und gasförmig unterscheiden und Übergänge erklären' },
            { code: 'NMG.3.2.b', name: 'Energie', description: 'Verschiedene Energieformen und Energieumwandlungen kennen' },
            { code: 'NMG.3.2.c', name: 'Experimente', description: 'Einfache Experimente planen, durchführen und auswerten' },
          ]
        },
        { code: 'NMG.4.2', name: 'Phänomene der Natur', description: 'Naturphänomene untersuchen und erklären', level: 'Grundanspruch', goals: ['Wetter und Klima', 'Wasserkreislauf', 'Magnetismus und Elektrizität'], sequence: ['Arbeitsblatt: Wasserkreislauf', 'Quiz: Magnetismus'],
          subCompetencies: [
            { code: 'NMG.4.2.a', name: 'Wasserkreislauf', description: 'Den Wasserkreislauf beschreiben und erklären' },
            { code: 'NMG.4.2.b', name: 'Magnetismus', description: 'Magnetische Phänomene untersuchen und beschreiben' },
            { code: 'NMG.4.2.c', name: 'Wetter/Klima', description: 'Wetter beobachten und Wetterelemente beschreiben' },
          ]
        },
        { code: 'NMG.5.2', name: 'Technische Entwicklungen', description: 'Technische Entwicklungen verstehen und beurteilen', level: 'Grundanspruch', goals: ['Erfindungen kennen', 'Technische Abläufe verstehen', 'Technische Lösungen entwickeln'], sequence: ['Arbeitsblatt: Erfindungen', 'Quiz: Technik verstehen'],
          subCompetencies: [
            { code: 'NMG.5.2.a', name: 'Erfindungen', description: 'Wichtige Erfindungen und ihre Auswirkungen kennen' },
            { code: 'NMG.5.2.b', name: 'Konstruieren', description: 'Einfache technische Konstruktionen planen und bauen' },
          ]
        },
        { code: 'NMG.6.1', name: 'Wirtschaft & Konsum', description: 'Wirtschaftliche Zusammenhänge entdecken', level: 'Grundanspruch', goals: ['Bedürfnisse und Güter unterscheiden', 'Produktionswege verstehen', 'Nachhaltigen Konsum reflektieren'], sequence: ['Quiz: Bedürfnisse', 'Arbeitsblatt: Fairer Handel'],
          subCompetencies: [
            { code: 'NMG.6.1.a', name: 'Bedürfnisse', description: 'Zwischen Bedürfnissen und Wünschen unterscheiden' },
            { code: 'NMG.6.1.b', name: 'Produktion', description: 'Produktionswege von Alltagsgütern nachverfolgen' },
            { code: 'NMG.6.1.c', name: 'Nachhaltigkeit', description: 'Nachhaltigen Konsum verstehen und reflektieren' },
          ]
        },
        { code: 'NMG.7.1', name: 'Lebensweisen & Kulturen', description: 'Kulturelle und religiöse Vielfalt kennenlernen', level: 'Grundanspruch', goals: ['Weltreligionen kennen', 'Feste und Bräuche vergleichen', 'Toleranz und Respekt'], sequence: ['Quiz: Weltreligionen', 'Arbeitsblatt: Feste vergleichen'],
          subCompetencies: [
            { code: 'NMG.7.1.a', name: 'Weltreligionen', description: 'Die fünf Weltreligionen und ihre Grundzüge kennen' },
            { code: 'NMG.7.1.b', name: 'Feste', description: 'Religiöse und kulturelle Feste vergleichen' },
          ]
        },
        { code: 'NMG.8.1', name: 'Raum & Mobilität', description: 'Räume erkunden und Orientierung gewinnen', level: 'Grundanspruch', goals: ['Karten lesen und zeichnen', 'Himmelsrichtungen kennen', 'Schweizer Kantone benennen'], sequence: ['Quiz: Kantone', 'Arbeitsblatt: Karten lesen', 'Prüfung: Geographie Schweiz'],
          subCompetencies: [
            { code: 'NMG.8.1.a', name: 'Kartenlesen', description: 'Karten und Pläne lesen und selbst zeichnen' },
            { code: 'NMG.8.1.b', name: 'Schweizer Geographie', description: 'Kantone, Städte, Gewässer und Gebirge der Schweiz kennen' },
            { code: 'NMG.8.1.c', name: 'Himmelsrichtungen', description: 'Die vier Himmelsrichtungen kennen und sich orientieren' },
          ]
        },
        { code: 'NMG.9.1', name: 'Zeit & Wandel', description: 'Historische Zusammenhänge verstehen', level: 'Grundanspruch', goals: ['Zeitstrahl nutzen', 'Historische Epochen kennen', 'Quellen auswerten'], sequence: ['Arbeitsblatt: Zeitstrahl', 'Quiz: Epochen', 'Prüfung: Geschichte'],
          subCompetencies: [
            { code: 'NMG.9.1.a', name: 'Zeitbegriff', description: 'Zeitliche Abfolgen und Dauer einschätzen' },
            { code: 'NMG.9.1.b', name: 'Quellen nutzen', description: 'Historische Quellen untersuchen und einordnen' },
            { code: 'NMG.9.1.c', name: 'Epochen', description: 'Wichtige historische Epochen auf dem Zeitstrahl einordnen' },
          ]
        },
        { code: 'NMG.10.1', name: 'Demokratie & Menschenrechte', description: 'Politische Grundlagen verstehen', level: 'Grundanspruch', goals: ['Gemeinde und Kanton kennen', 'Kinderrechte verstehen', 'Abstimmen und Wählen'], sequence: ['Quiz: Kinderrechte', 'Arbeitsblatt: Demokratie'],
          subCompetencies: [
            { code: 'NMG.10.1.a', name: 'Gemeinde', description: 'Aufgaben und Struktur der Gemeinde kennen' },
            { code: 'NMG.10.1.b', name: 'Menschenrechte', description: 'Grundlegende Menschen- und Kinderrechte kennen' },
          ]
        },
        { code: 'NMG.11.1', name: 'Grunderfahrungen & Werte', description: 'Ethische Fragen und Werte reflektieren', level: 'Grundanspruch', goals: ['Gerechtigkeit diskutieren', 'Regeln hinterfragen', 'Verantwortung übernehmen'], sequence: ['Arbeitsblatt: Werte', 'Quiz: Fairness'],
          subCompetencies: [
            { code: 'NMG.11.1.a', name: 'Gerechtigkeit', description: 'Fragen der Gerechtigkeit und Fairness diskutieren' },
            { code: 'NMG.11.1.b', name: 'Verantwortung', description: 'Verantwortung für das eigene Handeln übernehmen' },
          ]
        },
        { code: 'NMG.12.1', name: 'Religionen & Weltanschauungen', description: 'Religiöse Traditionen kennenlernen', level: 'Grundanspruch', goals: ['Feste verschiedener Religionen', 'Heilige Schriften kennen', 'Gemeinsamkeiten und Unterschiede'], sequence: ['Arbeitsblatt: Religionen', 'Quiz: Feste'],
          subCompetencies: [
            { code: 'NMG.12.1.a', name: 'Religiöse Feste', description: 'Feste der verschiedenen Religionen kennen und vergleichen' },
            { code: 'NMG.12.1.b', name: 'Heilige Schriften', description: 'Ausgewählte Geschichten aus heiligen Schriften kennen' },
          ]
        },
      ]},

      // ── ENGLISCH ──
      { id: 'z2-e', name: 'Englisch', icon: '🇬🇧', competencies: [
        { code: 'FS1E.1.A.1', name: 'Hören – Verstehen', description: 'Einfache gesprochene Texte verstehen', level: 'Grundanspruch', goals: ['Einfache Anweisungen verstehen', 'Kurze Gespräche folgen', 'Wörter heraushören'], sequence: ['Quiz: Listening', 'Arbeitsblatt: Hörverständnis'],
          subCompetencies: [
            { code: 'FS1E.1.A.1.a', name: 'Classroom Language', description: 'Anweisungen im Unterricht verstehen' },
            { code: 'FS1E.1.A.1.b', name: 'Stories', description: 'Einfache Geschichten hörend verstehen' },
            { code: 'FS1E.1.A.1.c', name: 'Songs & Rhymes', description: 'Englische Lieder und Reime verstehen' },
          ]
        },
        { code: 'FS1E.2.A.1', name: 'Lesen – Verstehen', description: 'Einfache geschriebene Texte verstehen', level: 'Grundanspruch', goals: ['Kurze Texte lesen', 'Wörter wiedererkennen', 'Sätze verstehen'], sequence: ['Arbeitsblatt: Reading Comprehension', 'Quiz: Vocabulary'],
          subCompetencies: [
            { code: 'FS1E.2.A.1.a', name: 'Wörter lesen', description: 'Bekannte englische Wörter lesen und verstehen' },
            { code: 'FS1E.2.A.1.b', name: 'Kurze Texte', description: 'Kurze, einfache Texte sinnverstehend lesen' },
          ]
        },
        { code: 'FS1E.3.A.1', name: 'Sprechen – Dialogisch', description: 'Sich in einfachen Situationen verständigen', level: 'Grundanspruch', goals: ['Sich vorstellen', 'Einfache Fragen stellen', 'Kurze Sätze bilden'], sequence: ['Arbeitsblatt: Dialoge', 'Quiz: Phrases'],
          subCompetencies: [
            { code: 'FS1E.3.A.1.a', name: 'Sich vorstellen', description: 'Name, Alter, Herkunft auf Englisch mitteilen' },
            { code: 'FS1E.3.A.1.b', name: 'Einfache Gespräche', description: 'Kurze Gespräche zu vertrauten Themen führen' },
          ]
        },
        { code: 'FS1E.3.B.1', name: 'Sprechen – Monologisch', description: 'Zusammenhängend kurz über vertraute Themen sprechen', level: 'Grundanspruch', goals: ['Sich selbst beschreiben', 'Bilder beschreiben', 'Kurz über Hobbys sprechen'], sequence: ['Arbeitsblatt: About me', 'Quiz: Describe'] },
        { code: 'FS1E.4.A.1', name: 'Schreiben', description: 'Einfache Wörter und Sätze schreiben', level: 'Grundanspruch', goals: ['Wörter korrekt schreiben', 'Einfache Sätze bilden', 'Kurze Texte schreiben'], sequence: ['Arbeitsblatt: Writing', 'Prüfung: Englisch Grundlagen'],
          subCompetencies: [
            { code: 'FS1E.4.A.1.a', name: 'Words', description: 'Bekannte Wörter korrekt schreiben' },
            { code: 'FS1E.4.A.1.b', name: 'Sentences', description: 'Einfache Sätze nach Modell schreiben' },
            { code: 'FS1E.4.A.1.c', name: 'Short Texts', description: 'Kurze Texte zu vertrauten Themen verfassen' },
          ]
        },
        { code: 'FS1E.5.A.1', name: 'Sprache im Fokus – Bewusstheit', description: 'Sprachliche Strukturen entdecken und anwenden', level: 'Grundanspruch', goals: ['Grundgrammatik anwenden', 'Wortschatz aufbauen', 'Sprachvergleiche anstellen'], sequence: ['Quiz: Grammar Basics', 'Arbeitsblatt: Vocabulary'],
          subCompetencies: [
            { code: 'FS1E.5.A.1.a', name: 'Grammar Basics', description: 'Einfache Grammatikstrukturen (Present Simple, Plurals) anwenden' },
            { code: 'FS1E.5.A.1.b', name: 'Vocabulary', description: 'Grundwortschatz zu Alltagsthemen aufbauen' },
            { code: 'FS1E.5.A.1.c', name: 'Sprachvergleich', description: 'Deutsch und Englisch vergleichen und Ähnlichkeiten entdecken' },
          ]
        },
        { code: 'FS1E.6.A.1', name: 'Kulturen im Fokus', description: 'Englischsprachige Kulturen kennenlernen', level: 'Grundanspruch', goals: ['Länder und Regionen kennen', 'Feste und Bräuche entdecken', 'Kulturelle Unterschiede verstehen'], sequence: ['Quiz: English-speaking countries', 'Arbeitsblatt: Festivals'],
          subCompetencies: [
            { code: 'FS1E.6.A.1.a', name: 'Countries', description: 'Wichtige englischsprachige Länder auf der Karte finden' },
            { code: 'FS1E.6.A.1.b', name: 'Festivals', description: 'Feste wie Halloween, Thanksgiving, Christmas kennenlernen' },
          ]
        },
      ]},

      // ── FRANZÖSISCH ──
      { id: 'z2-f', name: 'Französisch', icon: '🇫🇷', competencies: [
        { code: 'FS2F.1.A.1', name: 'Hören – Verstehen', description: 'Einfache gesprochene Texte auf Französisch verstehen', level: 'Grundanspruch', goals: ['Begrüssungen verstehen', 'Einfache Aufforderungen folgen', 'Zahlen verstehen'], sequence: ['Quiz: Compréhension orale', 'Arbeitsblatt: Écouter'],
          subCompetencies: [
            { code: 'FS2F.1.A.1.a', name: 'Consignes', description: 'Einfache Unterrichtsanweisungen verstehen' },
            { code: 'FS2F.1.A.1.b', name: 'Histoires', description: 'Kurze Geschichten hörend verstehen' },
            { code: 'FS2F.1.A.1.c', name: 'Chansons', description: 'Französische Lieder verstehen und mitsingen' },
          ]
        },
        { code: 'FS2F.2.A.1', name: 'Lesen – Verstehen', description: 'Einfache französische Texte lesen und verstehen', level: 'Grundanspruch', goals: ['Kurze Texte erlesen', 'Wörter wiedererkennen', 'Bilder und Text verbinden'], sequence: ['Arbeitsblatt: Lecture', 'Quiz: Vocabulaire'],
          subCompetencies: [
            { code: 'FS2F.2.A.1.a', name: 'Mots', description: 'Bekannte französische Wörter lesen und verstehen' },
            { code: 'FS2F.2.A.1.b', name: 'Textes simples', description: 'Kurze, einfache Texte sinnverstehend lesen' },
          ]
        },
        { code: 'FS2F.3.A.1', name: 'Sprechen – Dialogisch', description: 'Sich auf Französisch in einfachen Situationen verständigen', level: 'Grundanspruch', goals: ['Sich vorstellen', 'Einfache Gespräche führen', 'Aussprache üben'], sequence: ['Arbeitsblatt: Dialogues', 'Quiz: Parler'],
          subCompetencies: [
            { code: 'FS2F.3.A.1.a', name: 'Se présenter', description: 'Sich auf Französisch vorstellen (Name, Alter, Wohnort)' },
            { code: 'FS2F.3.A.1.b', name: 'Conversations', description: 'Kurze Alltagsgespräche auf Französisch führen' },
          ]
        },
        { code: 'FS2F.3.B.1', name: 'Sprechen – Monologisch', description: 'Kurze zusammenhängende Aussagen machen', level: 'Grundanspruch', goals: ['Sich beschreiben', 'Über Vorlieben sprechen', 'Kurze Präsentationen halten'], sequence: ['Arbeitsblatt: Se présenter'] },
        { code: 'FS2F.4.A.1', name: 'Schreiben', description: 'Einfache Wörter und Sätze auf Französisch schreiben', level: 'Grundanspruch', goals: ['Wörter korrekt schreiben', 'Einfache Sätze bilden'], sequence: ['Arbeitsblatt: Écrire', 'Prüfung: Französisch Grundlagen'],
          subCompetencies: [
            { code: 'FS2F.4.A.1.a', name: 'Mots', description: 'Bekannte französische Wörter korrekt schreiben' },
            { code: 'FS2F.4.A.1.b', name: 'Phrases', description: 'Einfache Sätze nach Modell auf Französisch schreiben' },
          ]
        },
        { code: 'FS2F.5.A.1', name: 'Sprache im Fokus – Bewusstheit', description: 'Französische Sprachstrukturen entdecken', level: 'Grundanspruch', goals: ['Artikel kennen', 'Verben konjugieren', 'Wortschatz aufbauen'], sequence: ['Quiz: Grammaire', 'Arbeitsblatt: Vocabulaire'],
          subCompetencies: [
            { code: 'FS2F.5.A.1.a', name: 'Articles', description: 'Bestimmte und unbestimmte Artikel kennen (le, la, les, un, une)' },
            { code: 'FS2F.5.A.1.b', name: 'Verbes', description: 'Regelmässige Verben auf -er im Présent konjugieren' },
            { code: 'FS2F.5.A.1.c', name: 'Vocabulaire', description: 'Grundwortschatz zu Alltagsthemen aufbauen' },
          ]
        },
        { code: 'FS2F.6.A.1', name: 'Kulturen im Fokus', description: 'Frankophone Kulturen kennenlernen', level: 'Grundanspruch', goals: ['Frankophone Länder kennen', 'Feste und Traditionen', 'Kulturvergleiche anstellen'], sequence: ['Quiz: Pays francophones', 'Arbeitsblatt: Fêtes'],
          subCompetencies: [
            { code: 'FS2F.6.A.1.a', name: 'Suisse romande', description: 'Die Westschweiz als frankophonen Raum kennenlernen' },
            { code: 'FS2F.6.A.1.b', name: 'Fêtes', description: 'Französische Feste und Traditionen kennenlernen' },
          ]
        },
      ]},

      // ── BILDNERISCHES GESTALTEN ──
      { id: 'z2-bg', name: 'Bildnerisches Gestalten', icon: '🎨', competencies: [
        { code: 'BG.1.A.2', name: 'Wahrnehmen & Kommunizieren – Wahrnehmen', description: 'Bilder und Kunstwerke differenziert wahrnehmen', level: 'Grundanspruch', goals: ['Bildsprache verstehen', 'Gestaltungselemente erkennen', 'Wirkung von Bildern beschreiben'], sequence: ['Arbeitsblatt: Bildanalyse', 'Quiz: Gestaltungselemente'],
          subCompetencies: [
            { code: 'BG.1.A.2.a', name: 'Bildsprache', description: 'Farben, Formen und Komposition in Bildern erkennen' },
            { code: 'BG.1.A.2.b', name: 'Wirkung', description: 'Die Wirkung von Bildern beschreiben und vergleichen' },
          ]
        },
        { code: 'BG.1.B.2', name: 'Wahrnehmen & Kommunizieren – Sich ausdrücken', description: 'Ideen und Vorstellungen bildnerisch ausdrücken', level: 'Grundanspruch', goals: ['Stimmungen darstellen', 'Szenen gestalten', 'Perspektive anbahnen'], sequence: ['Arbeitsblatt: Stimmungsbild'] },
        { code: 'BG.2.A.2', name: 'Prozesse & Produkte – Experimentieren', description: 'Vielfältige Materialien und Techniken erproben', level: 'Grundanspruch', goals: ['Mischtechniken anwenden', 'Farbmischung verstehen', 'Drucktechniken vertiefen'], sequence: ['Arbeitsblatt: Farbmischung', 'Arbeitsblatt: Drucktechnik'],
          subCompetencies: [
            { code: 'BG.2.A.2.a', name: 'Farbenlehre', description: 'Primär-, Sekundär- und Komplementärfarben kennen' },
            { code: 'BG.2.A.2.b', name: 'Mischtechniken', description: 'Verschiedene Materialien und Techniken kombinieren' },
          ]
        },
        { code: 'BG.2.B.2', name: 'Prozesse & Produkte – Gestalten', description: 'Bildnerische Projekte selbstständig umsetzen', level: 'Grundanspruch', goals: ['Gestaltungsprozess planen', 'Verschiedene Techniken kombinieren', 'Portfolio führen'], sequence: ['Arbeitsblatt: Projektplanung'] },
        { code: 'BG.2.C.2', name: 'Prozesse & Produkte – Bildnerische Verfahren', description: 'Verschiedene bildnerische Verfahren anwenden', level: 'Grundanspruch', goals: ['Zeichnen', 'Malen', 'Plastisches Gestalten', 'Fotografieren'], sequence: ['Arbeitsblatt: Zeichentechnik'] },
        { code: 'BG.3.A.2', name: 'Kontexte & Orientierung', description: 'Kunstwerke und Bilder im Kontext betrachten', level: 'Grundanspruch', goals: ['Künstler/innen kennenlernen', 'Kunststile unterscheiden', 'Kunst und Alltag verbinden'], sequence: ['Quiz: Kunststile', 'Arbeitsblatt: Künstlerportrait'] },
      ]},

      // ── TEXTILES UND TECHNISCHES GESTALTEN ──
      { id: 'z2-ttg', name: 'Textiles und Technisches Gestalten', icon: '✂️', competencies: [
        { code: 'TTG.1.A.2', name: 'Wahrnehmung & Kommunikation', description: 'Produkte und Materialien gezielt erkunden', level: 'Grundanspruch', goals: ['Materialien vergleichen', 'Produkte analysieren', 'Funktionen beurteilen'], sequence: ['Arbeitsblatt: Materialvergleich'] },
        { code: 'TTG.2.A.2', name: 'Prozesse – Ideen entwickeln', description: 'Kreative Lösungen für Gestaltungsaufgaben entwickeln', level: 'Grundanspruch', goals: ['Brainstorming und Skizzen', 'Modelle bauen', 'Varianten entwickeln'], sequence: ['Arbeitsblatt: Ideenentwicklung'] },
        { code: 'TTG.2.B.2', name: 'Prozesse – Planen & Herstellen', description: 'Werkstücke sorgfältig planen und herstellen', level: 'Grundanspruch', goals: ['Arbeitsplanung erstellen', 'Werkzeuge fachgerecht einsetzen', 'Qualitätskriterien beachten'], sequence: ['Arbeitsblatt: Arbeitsplanung'] },
        { code: 'TTG.2.C.2', name: 'Textil – Verfahren', description: 'Textile Verfahren erweitern und vertiefen', level: 'Grundanspruch', goals: ['Verschiedene Stiche anwenden', 'Stricken/Häkeln Grundlagen', 'Textile Flächen gestalten'], sequence: ['Arbeitsblatt: Sticktechniken', 'Arbeitsblatt: Stricken'],
          subCompetencies: [
            { code: 'TTG.2.C.2.a', name: 'Stiche', description: 'Verschiedene Handstiche sicher anwenden' },
            { code: 'TTG.2.C.2.b', name: 'Stricken/Häkeln', description: 'Grundtechniken des Strickens und Häkelns beherrschen' },
          ]
        },
        { code: 'TTG.2.D.2', name: 'Technisch – Verfahren', description: 'Technische Verfahren erweitern und vertiefen', level: 'Grundanspruch', goals: ['Verschiedene Holzverbindungen', 'Mit Metall und Kunststoff arbeiten', 'Elektrische Schaltungen bauen'], sequence: ['Arbeitsblatt: Holzverbindungen', 'Arbeitsblatt: Schaltungen'],
          subCompetencies: [
            { code: 'TTG.2.D.2.a', name: 'Holzverbindungen', description: 'Verschiedene Holzverbindungen kennen und herstellen' },
            { code: 'TTG.2.D.2.b', name: 'Schaltungen', description: 'Einfache elektrische Schaltungen bauen und verstehen' },
          ]
        },
        { code: 'TTG.3.A.2', name: 'Kontexte & Orientierung', description: 'Design und Technik im Alltag erkunden', level: 'Grundanspruch', goals: ['Designprozesse verstehen', 'Nachhaltigkeit reflektieren', 'Berufe im Bereich TTG kennen'], sequence: ['Quiz: Design im Alltag'] },
      ]},

      // ── MUSIK ──
      { id: 'z2-mu', name: 'Musik', icon: '🎵', competencies: [
        { code: 'MU.1.A.2', name: 'Singen und Sprechen', description: 'Lieder in verschiedenen Stilen singen', level: 'Grundanspruch', goals: ['Mehrstimmig singen', 'Lieder verschiedener Kulturen singen', 'Stimme bewusst einsetzen'], sequence: ['Arbeitsblatt: Mehrstimmigkeit', 'Quiz: Lieder der Welt'],
          subCompetencies: [
            { code: 'MU.1.A.2.a', name: 'Mehrstimmigkeit', description: 'Im Kanon und zweistimmig singen' },
            { code: 'MU.1.A.2.b', name: 'Stilvielfalt', description: 'Lieder aus verschiedenen Stilen und Kulturen singen' },
          ]
        },
        { code: 'MU.2.A.2', name: 'Hören und Sich-Orientieren', description: 'Musik differenziert hören und beschreiben', level: 'Grundanspruch', goals: ['Musikstile unterscheiden', 'Instrumente erkennen', 'Musikalische Formen erfassen'], sequence: ['Quiz: Musikstile', 'Arbeitsblatt: Instrumentenkunde'],
          subCompetencies: [
            { code: 'MU.2.A.2.a', name: 'Instrumente', description: 'Orchesterinstrumente erkennen und nach Familien ordnen' },
            { code: 'MU.2.A.2.b', name: 'Musikstile', description: 'Verschiedene Musikstile (Klassik, Pop, Jazz) unterscheiden' },
          ]
        },
        { code: 'MU.3.A.2', name: 'Bewegen und Tanzen', description: 'Bewegungsabläufe und Tänze gestalten', level: 'Grundanspruch', goals: ['Choreografien lernen', 'Eigene Bewegungen gestalten', 'Verschiedene Tanzstile kennen'], sequence: ['Arbeitsblatt: Tanzchoreografie'] },
        { code: 'MU.4.A.2', name: 'Musizieren', description: 'Auf Instrumenten spielen und begleiten', level: 'Grundanspruch', goals: ['Melodien spielen', 'Rhythmische Begleitungen', 'Zusammen musizieren'], sequence: ['Arbeitsblatt: Melodie spielen', 'Quiz: Rhythmus'] },
        { code: 'MU.5.A.2', name: 'Gestaltungsprozesse', description: 'Musikalische Projekte gestalten', level: 'Grundanspruch', goals: ['Lieder arrangieren', 'Musik zu Szenen gestalten', 'Eigene Stücke komponieren'], sequence: ['Arbeitsblatt: Arrangement'] },
        { code: 'MU.6.A.2', name: 'Praxis des musikalischen Wissens', description: 'Musikalische Begriffe und Notation anwenden', level: 'Grundanspruch', goals: ['Noten lesen und schreiben', 'Tonleitern kennen', 'Dynamikzeichen verstehen'], sequence: ['Arbeitsblatt: Notenschrift', 'Quiz: Tonleitern', 'Prüfung: Musiktheorie'],
          subCompetencies: [
            { code: 'MU.6.A.2.a', name: 'Notenschrift', description: 'Noten im Violinschlüssel lesen und schreiben' },
            { code: 'MU.6.A.2.b', name: 'Tonleitern', description: 'Dur- und Moll-Tonleitern kennen' },
            { code: 'MU.6.A.2.c', name: 'Dynamik', description: 'Dynamikzeichen (piano, forte, crescendo) kennen und anwenden' },
          ]
        },
      ]},

      // ── BEWEGUNG UND SPORT ──
      { id: 'z2-bs', name: 'Bewegung und Sport', icon: '⚽', competencies: [
        { code: 'BS.1.A.2', name: 'Laufen, Springen, Werfen', description: 'Leichtathletische Grundformen verbessern', level: 'Grundanspruch', goals: ['Ausdauernd laufen', 'Verschiedene Sprungformen', 'Wurf- und Stosstechniken'], sequence: ['Arbeitsblatt: Leichtathletik'],
          subCompetencies: [
            { code: 'BS.1.A.2.a', name: 'Ausdauer', description: 'Ausdauernd laufen und die Leistung steigern' },
            { code: 'BS.1.A.2.b', name: 'Sprint', description: 'Schnell und technisch korrekt sprinten' },
            { code: 'BS.1.A.2.c', name: 'Weitsprung', description: 'Weitsprungtechnik erlernen und anwenden' },
          ]
        },
        { code: 'BS.2.A.2', name: 'Bewegen an Geräten', description: 'An Geräten turnerische Elemente ausführen', level: 'Grundanspruch', goals: ['Rollen und Überschläge', 'Schwingen am Reck', 'Gerätekombinationen turnen'], sequence: ['Arbeitsblatt: Geräteturnen'] },
        { code: 'BS.3.A.2', name: 'Darstellen und Tanzen', description: 'Bewegungsfolgen und Tänze gestalten', level: 'Grundanspruch', goals: ['Tänze einstudieren', 'Bewegungsfolgen gestalten', 'Ausdruck und Rhythmus verbinden'], sequence: ['Arbeitsblatt: Tanzgestaltung'] },
        { code: 'BS.4.A.2', name: 'Spielen – Regelspiele', description: 'Sportspiele kennen und fair spielen', level: 'Grundanspruch', goals: ['Spielregeln verstehen und einhalten', 'Kleine Spielformen', 'Teamstrategien entwickeln'], sequence: ['Arbeitsblatt: Spieltaktik'],
          subCompetencies: [
            { code: 'BS.4.A.2.a', name: 'Ballspiele', description: 'Grundtechniken in Ballspielen (Passen, Fangen, Werfen)' },
            { code: 'BS.4.A.2.b', name: 'Teamspiel', description: 'Im Team zusammenspielen und Strategien entwickeln' },
          ]
        },
        { code: 'BS.4.B.2', name: 'Spielen – Rückschlagspiele', description: 'Rückschlagspiele kennenlernen', level: 'Grundanspruch', goals: ['Badminton Grundtechniken', 'Tischtennis spielen', 'Fair Play leben'], sequence: ['Arbeitsblatt: Rückschlagspiele'] },
        { code: 'BS.5.A.2', name: 'Gleiten, Rollen, Fahren', description: 'Bewegungsfertigkeiten auf Geräten erweitern', level: 'Grundanspruch', goals: ['Inline-Skating', 'Skifahren', 'Velofahren im Strassenverkehr'], sequence: ['Arbeitsblatt: Verkehrssicherheit'] },
        { code: 'BS.6.A.2', name: 'Bewegen im Wasser', description: 'Sicher schwimmen und Schwimmtechniken lernen', level: 'Grundanspruch', goals: ['Schwimmarten lernen', 'Ausdauer im Wasser', 'Rettungsschwimmen Grundlagen'], sequence: ['Arbeitsblatt: Schwimmtechniken'],
          subCompetencies: [
            { code: 'BS.6.A.2.a', name: 'Kraul', description: 'Kraulen als Schwimmtechnik erlernen' },
            { code: 'BS.6.A.2.b', name: 'Brust', description: 'Brustschwimmen korrekt ausführen' },
            { code: 'BS.6.A.2.c', name: 'Rücken', description: 'Rückenschwimmen erlernen' },
          ]
        },
      ]},

      // ── MEDIEN UND INFORMATIK ──
      { id: 'z2-mi', name: 'Medien und Informatik', icon: '💻', competencies: [
        { code: 'MI.1.1.2', name: 'Medien – Leben in der Mediengesellschaft', description: 'Medien und Medienbeiträge verstehen und hinterfragen', level: 'Grundanspruch', goals: ['Medienarten unterscheiden', 'Werbung erkennen', 'Informationsquellen vergleichen'], sequence: ['Quiz: Medienarten', 'Arbeitsblatt: Werbung analysieren'],
          subCompetencies: [
            { code: 'MI.1.1.2.a', name: 'Medienlandschaft', description: 'Verschiedene Medienformen und ihre Funktionen kennen' },
            { code: 'MI.1.1.2.b', name: 'Medienkritik', description: 'Medieninhalte kritisch hinterfragen' },
            { code: 'MI.1.1.2.c', name: 'Werbung', description: 'Werbung erkennen und ihre Wirkungsweise verstehen' },
          ]
        },
        { code: 'MI.1.2.2', name: 'Medien – Sich schützen', description: 'Risiken der Mediennutzung kennen und sich schützen', level: 'Grundanspruch', goals: ['Passwörter sicher gestalten', 'Cybermobbing erkennen', 'Urheberrecht verstehen'], sequence: ['Arbeitsblatt: Sicherheit im Netz', 'Quiz: Datenschutz'],
          subCompetencies: [
            { code: 'MI.1.2.2.a', name: 'Passwörter', description: 'Sichere Passwörter erstellen und verwenden' },
            { code: 'MI.1.2.2.b', name: 'Cybermobbing', description: 'Cybermobbing erkennen und richtig reagieren' },
            { code: 'MI.1.2.2.c', name: 'Urheberrecht', description: 'Grundlagen des Urheberrechts kennen' },
          ]
        },
        { code: 'MI.1.3.2', name: 'Medien – Produzieren', description: 'Eigene Medienbeiträge gestalten', level: 'Grundanspruch', goals: ['Texte am Computer schreiben', 'Fotos bearbeiten', 'Präsentationen erstellen'], sequence: ['Arbeitsblatt: Medienprojekt'],
          subCompetencies: [
            { code: 'MI.1.3.2.a', name: 'Textverarbeitung', description: 'Texte am Computer erstellen und formatieren' },
            { code: 'MI.1.3.2.b', name: 'Präsentationen', description: 'Einfache Präsentationen erstellen' },
          ]
        },
        { code: 'MI.2.1.2', name: 'Informatik – Datenstrukturen', description: 'Daten organisieren und darstellen', level: 'Grundanspruch', goals: ['Tabellen erstellen', 'Daten kodieren', 'Dateien organisieren'], sequence: ['Arbeitsblatt: Tabellen', 'Quiz: Dateiformate'],
          subCompetencies: [
            { code: 'MI.2.1.2.a', name: 'Tabellen', description: 'Daten in Tabellen organisieren und darstellen' },
            { code: 'MI.2.1.2.b', name: 'Kodierung', description: 'Informationen mit einfachen Codes darstellen (Binär)' },
          ]
        },
        { code: 'MI.2.2.2', name: 'Informatik – Algorithmen', description: 'Abläufe formalisieren und programmieren', level: 'Grundanspruch', goals: ['Algorithmen beschreiben', 'Visuelle Programmierung (Scratch)', 'Schleifen und Bedingungen verstehen'], sequence: ['Arbeitsblatt: Programmieren mit Scratch', 'Quiz: Algorithmen'],
          subCompetencies: [
            { code: 'MI.2.2.2.a', name: 'Sequenz', description: 'Anweisungen in der richtigen Reihenfolge anordnen' },
            { code: 'MI.2.2.2.b', name: 'Schleifen', description: 'Wiederholungen in Programmen einsetzen' },
            { code: 'MI.2.2.2.c', name: 'Bedingungen', description: 'Verzweigungen (wenn-dann) in Programmen nutzen' },
            { code: 'MI.2.2.2.d', name: 'Scratch', description: 'Eigene Programme in Scratch erstellen' },
          ]
        },
        { code: 'MI.2.3.2', name: 'Informatik – Informatiksysteme', description: 'Computer und Netzwerke verstehen', level: 'Grundanspruch', goals: ['Computerbestandteile kennen', 'Internet verstehen', 'Betriebssysteme bedienen'], sequence: ['Quiz: Computerbestandteile', 'Arbeitsblatt: Internet'],
          subCompetencies: [
            { code: 'MI.2.3.2.a', name: 'Hardware', description: 'Wichtige Computerbestandteile (CPU, RAM, Festplatte) kennen' },
            { code: 'MI.2.3.2.b', name: 'Internet', description: 'Grundprinzipien des Internets verstehen' },
          ]
        },
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
            { code: 'D.1.A.3.c', name: 'Manipulation erkennen', description: 'Manipulative Sprachmuster und rhetorische Tricks erkennen' },
          ]
        },
        { code: 'D.1.B.3', name: 'Sprechen – Monologisch', description: 'Überzeugend und strukturiert präsentieren', level: 'Erweitert', goals: ['Präsentationen halten', 'Frei sprechen', 'Rhetorik einsetzen'], sequence: ['Arbeitsblatt: Präsentation planen', 'Quiz: Rhetorik'],
          subCompetencies: [
            { code: 'D.1.B.3.a', name: 'Präsentieren', description: 'Präsentationen strukturiert aufbauen und frei vortragen' },
            { code: 'D.1.B.3.b', name: 'Rhetorik', description: 'Rhetorische Mittel gezielt einsetzen' },
            { code: 'D.1.B.3.c', name: 'Körpersprache', description: 'Körpersprache und Stimme bewusst einsetzen' },
          ]
        },
        { code: 'D.1.C.3', name: 'Sprechen – Dialogisch', description: 'Debatten führen und sachlich argumentieren', level: 'Erweitert', goals: ['Debatten führen', 'Feedback geben und annehmen', 'Moderieren'], sequence: ['Arbeitsblatt: Debatte', 'Quiz: Argumentieren'],
          subCompetencies: [
            { code: 'D.1.C.3.a', name: 'Debattieren', description: 'Formale Debatten mit klarer Argumentation führen' },
            { code: 'D.1.C.3.b', name: 'Feedback', description: 'Konstruktives Feedback geben und annehmen' },
            { code: 'D.1.C.3.c', name: 'Moderation', description: 'Diskussionen moderieren und zusammenfassen' },
          ]
        },
        { code: 'D.2.A.3', name: 'Lesen – Grundfertigkeiten', description: 'Lesetechniken situationsgerecht einsetzen', level: 'Erweitert', goals: ['Lesetempo variieren', 'Überfliegendes Lesen', 'Genaues Lesen für Details'], sequence: ['Arbeitsblatt: Lesetraining'],
          subCompetencies: [
            { code: 'D.2.A.3.a', name: 'Lesetechniken', description: 'Verschiedene Lesetechniken (scanning, skimming) gezielt einsetzen' },
            { code: 'D.2.A.3.b', name: 'Lesetempo', description: 'Das Lesetempo der Textart und dem Zweck anpassen' },
          ]
        },
        { code: 'D.2.B.3', name: 'Lesen – Verstehen', description: 'Komplexe Texte analysieren und interpretieren', level: 'Erweitert', goals: ['Sachtexte analysieren', 'Literarische Texte interpretieren', 'Quellen kritisch bewerten'], sequence: ['Arbeitsblatt: Textanalyse', 'Prüfung: Interpretation'],
          subCompetencies: [
            { code: 'D.2.B.3.a', name: 'Textanalyse', description: 'Texte systematisch analysieren (Aufbau, Sprache, Wirkung)' },
            { code: 'D.2.B.3.b', name: 'Interpretation', description: 'Literarische Texte interpretieren und deuten' },
            { code: 'D.2.B.3.c', name: 'Quellenkritik', description: 'Quellen und Informationen kritisch prüfen' },
            { code: 'D.2.B.3.d', name: 'Synthese', description: 'Informationen aus verschiedenen Texten zusammenführen' },
          ]
        },
        { code: 'D.4.A.3', name: 'Schreiben – Grundfertigkeiten', description: 'Effizient und mediengerecht schreiben', level: 'Erweitert', goals: ['10-Finger-System', 'Verschiedene Schreibmedien nutzen', 'Layout gestalten'], sequence: ['Arbeitsblatt: Schreibkompetenz'],
          subCompetencies: [
            { code: 'D.4.A.3.a', name: 'Tastaturschreiben', description: 'Im 10-Finger-System effizient schreiben' },
            { code: 'D.4.A.3.b', name: 'Layout', description: 'Texte ansprechend layouten und formatieren' },
          ]
        },
        { code: 'D.4.B.3', name: 'Schreiben – Textproduktion', description: 'Verschiedene Textsorten verfassen und überarbeiten', level: 'Erweitert', goals: ['Argumentative Texte schreiben', 'Berichte verfassen', 'Kreatives Schreiben', 'Bewerbung schreiben'], sequence: ['Arbeitsblatt: Erörterung', 'Prüfung: Aufsatz'],
          subCompetencies: [
            { code: 'D.4.B.3.a', name: 'Erörterung', description: 'Pro-Contra-Texte strukturiert aufbauen' },
            { code: 'D.4.B.3.b', name: 'Bericht', description: 'Sachliche Berichte und Protokolle verfassen' },
            { code: 'D.4.B.3.c', name: 'Kreatives Schreiben', description: 'Kreative Texte mit literarischen Mitteln verfassen' },
            { code: 'D.4.B.3.d', name: 'Bewerbung', description: 'Bewerbungsschreiben und Lebenslauf verfassen' },
            { code: 'D.4.B.3.e', name: 'Zusammenfassung', description: 'Texte präzise zusammenfassen und exzerpieren' },
          ]
        },
        { code: 'D.5.A.3', name: 'Sprache im Fokus – Wortlehre', description: 'Wortarten und Wortbildung vertiefen', level: 'Erweitert', goals: ['Alle Wortarten sicher bestimmen', 'Wortbildungsmuster kennen', 'Fremdwörter verstehen'], sequence: ['Arbeitsblatt: Wortarten', 'Quiz: Fremdwörter'],
          subCompetencies: [
            { code: 'D.5.A.3.a', name: 'Wortarten vertiefen', description: 'Alle Wortarten sicher bestimmen (inkl. Partikeln, Konjunktionen)' },
            { code: 'D.5.A.3.b', name: 'Fremdwörter', description: 'Häufige Fremdwörter verstehen und korrekt verwenden' },
            { code: 'D.5.A.3.c', name: 'Wortbildung', description: 'Wortbildungsmuster (Ableitung, Zusammensetzung) verstehen' },
          ]
        },
        { code: 'D.5.B.3', name: 'Sprache im Fokus – Satzlehre', description: 'Grammatik vertiefen und Sprachreflexion', level: 'Erweitert', goals: ['Satzanalyse durchführen', 'Stilmittel erkennen', 'Sprachgeschichte kennen'], sequence: ['Arbeitsblatt: Satzglieder', 'Quiz: Stilmittel', 'Prüfung: Grammatik'],
          subCompetencies: [
            { code: 'D.5.B.3.a', name: 'Satzglieder', description: 'Alle Satzglieder bestimmen und umstellen' },
            { code: 'D.5.B.3.b', name: 'Nebensätze', description: 'Haupt- und Nebensätze unterscheiden und verbinden' },
            { code: 'D.5.B.3.c', name: 'Stilmittel', description: 'Stilmittel erkennen und deren Wirkung beschreiben' },
            { code: 'D.5.B.3.d', name: 'Konjunktiv', description: 'Konjunktiv I und II bilden und anwenden (indirekte Rede)' },
          ]
        },
        { code: 'D.5.C.3', name: 'Sprache im Fokus – Rechtschreibung', description: 'Rechtschreibung sicher beherrschen', level: 'Erweitert', goals: ['Alle Rechtschreibregeln anwenden', 'Zeichensetzung beherrschen', 'Nachschlagewerke nutzen'], sequence: ['Arbeitsblatt: Rechtschreibung', 'Prüfung: Diktat'],
          subCompetencies: [
            { code: 'D.5.C.3.a', name: 'Rechtschreibregeln', description: 'Alle Rechtschreibregeln sicher anwenden' },
            { code: 'D.5.C.3.b', name: 'Zeichensetzung', description: 'Kommaregeln und Zeichensetzung sicher beherrschen' },
            { code: 'D.5.C.3.c', name: 'Nachschlagen', description: 'Wörterbücher und digitale Hilfsmittel gezielt nutzen' },
          ]
        },
        { code: 'D.6.A.3', name: 'Literatur im Fokus', description: 'Literarische Werke einordnen und interpretieren', level: 'Erweitert', goals: ['Epochen kennen', 'Werke vergleichen', 'Literaturkritik verfassen'], sequence: ['Arbeitsblatt: Epochen-Übersicht', 'Prüfung: Literatur'],
          subCompetencies: [
            { code: 'D.6.A.3.a', name: 'Epochen', description: 'Wichtige literarische Epochen und deren Merkmale kennen' },
            { code: 'D.6.A.3.b', name: 'Gattungen', description: 'Literarische Gattungen (Epik, Lyrik, Dramatik) unterscheiden' },
            { code: 'D.6.A.3.c', name: 'Literaturkritik', description: 'Literarische Texte begründet beurteilen und vergleichen' },
          ]
        },
      ]},

      // ── MATHEMATIK ──
      { id: 'z3-m', name: 'Mathematik', icon: '🔢', competencies: [
        { code: 'MA.1.A.3', name: 'Zahl und Variable – Operieren', description: 'Algebra und erweiterte Zahlbereiche', level: 'Erweitert', goals: ['Gleichungen lösen', 'Terme umformen', 'Mit negativen Zahlen rechnen', 'Proportionalität verstehen'], sequence: ['Arbeitsblatt: Gleichungen', 'Arbeitsblatt: Terme', 'Prüfung: Algebra'],
          subCompetencies: [
            { code: 'MA.1.A.3.a', name: 'Terme', description: 'Terme aufstellen, vereinfachen und umformen' },
            { code: 'MA.1.A.3.b', name: 'Gleichungen', description: 'Lineare Gleichungen und Gleichungssysteme lösen' },
            { code: 'MA.1.A.3.c', name: 'Potenzen & Wurzeln', description: 'Mit Potenzen und Wurzeln rechnen' },
            { code: 'MA.1.A.3.d', name: 'Negative Zahlen', description: 'Sicher mit negativen Zahlen in allen Grundoperationen rechnen' },
            { code: 'MA.1.A.3.e', name: 'Ungleichungen', description: 'Einfache lineare Ungleichungen lösen und darstellen' },
          ]
        },
        { code: 'MA.1.B.3', name: 'Zahl und Variable – Erforschen', description: 'Algebraische Zusammenhänge erforschen', level: 'Erweitert', goals: ['Zahlentheoretische Fragen', 'Formeln entdecken', 'Beweise nachvollziehen'], sequence: ['Arbeitsblatt: Formeln entdecken', 'Quiz: Zahlentheorie'],
          subCompetencies: [
            { code: 'MA.1.B.3.a', name: 'Zahlentheorie', description: 'Teilbarkeitsregeln, ggT und kgV anwenden' },
            { code: 'MA.1.B.3.b', name: 'Formeln', description: 'Formeln zur Beschreibung von Zusammenhängen entdecken und nutzen' },
          ]
        },
        { code: 'MA.2.A.3', name: 'Form und Raum – Operieren', description: 'Geometrie vertiefen und beweisen', level: 'Erweitert', goals: ['Satzgruppe des Pythagoras', 'Kreisberechnungen', 'Volumen und Oberfläche', 'Trigonometrie Grundlagen'], sequence: ['Arbeitsblatt: Pythagoras', 'Arbeitsblatt: Kreis', 'Prüfung: Geometrie'],
          subCompetencies: [
            { code: 'MA.2.A.3.a', name: 'Pythagoras', description: 'Den Satz des Pythagoras anwenden' },
            { code: 'MA.2.A.3.b', name: 'Kreis', description: 'Kreisumfang und Kreisfläche berechnen' },
            { code: 'MA.2.A.3.c', name: 'Körper', description: 'Volumen und Oberfläche von Prismen, Pyramiden und Zylindern berechnen' },
            { code: 'MA.2.A.3.d', name: 'Trigonometrie', description: 'Grundlagen der Trigonometrie (sin, cos, tan) anwenden' },
            { code: 'MA.2.A.3.e', name: 'Konstruktionen', description: 'Geometrische Konstruktionen mit Zirkel und Lineal durchführen' },
          ]
        },
        { code: 'MA.2.B.3', name: 'Form und Raum – Erforschen', description: 'Geometrische Zusammenhänge beweisen', level: 'Erweitert', goals: ['Konstruktionen begründen', 'Kongruenz und Ähnlichkeit', 'Raumvorstellung entwickeln'], sequence: ['Arbeitsblatt: Kongruenz', 'Quiz: Ähnlichkeit'],
          subCompetencies: [
            { code: 'MA.2.B.3.a', name: 'Kongruenz', description: 'Kongruenzsätze kennen und anwenden' },
            { code: 'MA.2.B.3.b', name: 'Ähnlichkeit', description: 'Ähnliche Figuren erkennen und Massstabsberechnungen durchführen' },
            { code: 'MA.2.B.3.c', name: 'Strahlensätze', description: 'Die Strahlensätze kennen und anwenden' },
          ]
        },
        { code: 'MA.3.A.3', name: 'Grössen, Funktionen, Daten – Operieren', description: 'Funktionen und Statistik', level: 'Erweitert', goals: ['Lineare Funktionen', 'Statistik und Wahrscheinlichkeit', 'Prozentrechnen', 'Zins und Zinseszins'], sequence: ['Arbeitsblatt: Funktionen', 'Arbeitsblatt: Prozent', 'Prüfung: Statistik'],
          subCompetencies: [
            { code: 'MA.3.A.3.a', name: 'Lineare Funktionen', description: 'Lineare Funktionen darstellen und interpretieren' },
            { code: 'MA.3.A.3.b', name: 'Prozent & Zins', description: 'Prozent-, Zins- und Zinseszinsrechnungen durchführen' },
            { code: 'MA.3.A.3.c', name: 'Statistik', description: 'Statistische Kenngrössen berechnen und interpretieren' },
            { code: 'MA.3.A.3.d', name: 'Wahrscheinlichkeit', description: 'Wahrscheinlichkeiten berechnen und Zufallsexperimente auswerten' },
            { code: 'MA.3.A.3.e', name: 'Dreisatz', description: 'Dreisatz und proportionale Zuordnungen anwenden' },
          ]
        },
        { code: 'MA.3.B.3', name: 'Grössen, Funktionen, Daten – Erforschen', description: 'Funktionale Zusammenhänge untersuchen', level: 'Erweitert', goals: ['Quadratische Funktionen entdecken', 'Wachstumsprozesse modellieren', 'Daten kritisch auswerten'], sequence: ['Arbeitsblatt: Wachstum', 'Quiz: Funktionstypen'],
          subCompetencies: [
            { code: 'MA.3.B.3.a', name: 'Quadratische Funktionen', description: 'Quadratische Funktionen erkennen und graphisch darstellen' },
            { code: 'MA.3.B.3.b', name: 'Wachstum', description: 'Lineares und exponentielles Wachstum unterscheiden und modellieren' },
          ]
        },
      ]},

      // ── NATUR UND TECHNIK ──
      { id: 'z3-nt', name: 'Natur und Technik', icon: '🔬', competencies: [
        { code: 'NT.1.1', name: 'Mechanik', description: 'Kräfte, Bewegungen und Energie untersuchen', level: 'Erweitert', goals: ['Kräfte und Bewegung', 'Arbeit und Leistung', 'Einfache Maschinen'], sequence: ['Arbeitsblatt: Kräfte', 'Quiz: Mechanik', 'Prüfung: Mechanik'],
          subCompetencies: [
            { code: 'NT.1.1.a', name: 'Kräfte', description: 'Kräfte messen, darstellen und ihre Wirkung beschreiben' },
            { code: 'NT.1.1.b', name: 'Bewegung', description: 'Gleichförmige und beschleunigte Bewegung beschreiben' },
            { code: 'NT.1.1.c', name: 'Arbeit & Leistung', description: 'Mechanische Arbeit und Leistung berechnen' },
            { code: 'NT.1.1.d', name: 'Einfache Maschinen', description: 'Hebel, Flaschenzug und schiefe Ebene verstehen' },
          ]
        },
        { code: 'NT.1.2', name: 'Elektrizität & Magnetismus', description: 'Elektrische und magnetische Phänomene verstehen', level: 'Erweitert', goals: ['Stromkreise bauen und analysieren', 'Spannung, Strom, Widerstand', 'Magnetismus verstehen'], sequence: ['Arbeitsblatt: Stromkreise', 'Quiz: Elektrizität', 'Prüfung: Elektrizität'],
          subCompetencies: [
            { code: 'NT.1.2.a', name: 'Stromkreise', description: 'Einfache und verzweigte Stromkreise bauen und analysieren' },
            { code: 'NT.1.2.b', name: 'Ohmsches Gesetz', description: 'Spannung, Strom und Widerstand berechnen (U=R·I)' },
            { code: 'NT.1.2.c', name: 'Magnetismus', description: 'Magnetfelder und Elektromagneten verstehen' },
          ]
        },
        { code: 'NT.1.3', name: 'Optik', description: 'Licht und optische Phänomene', level: 'Erweitert', goals: ['Lichtausbreitung', 'Reflexion und Brechung', 'Farben und Spektrum'], sequence: ['Arbeitsblatt: Optik', 'Quiz: Licht'],
          subCompetencies: [
            { code: 'NT.1.3.a', name: 'Lichtausbreitung', description: 'Die geradlinige Ausbreitung von Licht verstehen' },
            { code: 'NT.1.3.b', name: 'Reflexion', description: 'Das Reflexionsgesetz kennen und anwenden' },
            { code: 'NT.1.3.c', name: 'Brechung', description: 'Lichtbrechung an Grenzflächen erklären' },
            { code: 'NT.1.3.d', name: 'Linsen', description: 'Sammel- und Zerstreuungslinsen und ihre Anwendungen kennen' },
          ]
        },
        { code: 'NT.2.1', name: 'Stoffe und Stoffumwandlungen', description: 'Stoffe und chemische Reaktionen', level: 'Erweitert', goals: ['Periodensystem kennen', 'Chemische Reaktionen verstehen', 'Säuren und Basen', 'Atommodell'], sequence: ['Arbeitsblatt: Periodensystem', 'Quiz: Reaktionen', 'Prüfung: Chemie'],
          subCompetencies: [
            { code: 'NT.2.1.a', name: 'Atombau', description: 'Aufbau von Atomen und das Periodensystem verstehen' },
            { code: 'NT.2.1.b', name: 'Chemische Bindungen', description: 'Ionenbindung, Atombindung und metallische Bindung kennen' },
            { code: 'NT.2.1.c', name: 'Reaktionsgleichungen', description: 'Chemische Reaktionen in Gleichungen darstellen' },
            { code: 'NT.2.1.d', name: 'Säuren & Basen', description: 'Säuren, Basen und den pH-Wert verstehen' },
          ]
        },
        { code: 'NT.2.2', name: 'Organische Chemie', description: 'Kohlenstoffverbindungen und Alltagschemie', level: 'Erweitert', goals: ['Kohlenwasserstoffe', 'Alkohole und Carbonsäuren', 'Kunststoffe und Nahrungsmittelchemie'], sequence: ['Arbeitsblatt: Organische Chemie', 'Quiz: Alltagschemie'],
          subCompetencies: [
            { code: 'NT.2.2.a', name: 'Kohlenwasserstoffe', description: 'Aufbau und Eigenschaften von Alkanen, Alkenen und Alkinen' },
            { code: 'NT.2.2.b', name: 'Funktionelle Gruppen', description: 'Wichtige funktionelle Gruppen (Hydroxyl, Carboxyl) kennen' },
            { code: 'NT.2.2.c', name: 'Alltagschemie', description: 'Chemie in Nahrungsmitteln, Kunststoffen und Reinigungsmitteln verstehen' },
          ]
        },
        { code: 'NT.3.1', name: 'Biologie – Zelle & Organismus', description: 'Zellbiologie und Körperfunktionen', level: 'Erweitert', goals: ['Zellaufbau', 'Zellteilung', 'Organsysteme verstehen'], sequence: ['Arbeitsblatt: Zelle', 'Quiz: Organsysteme', 'Prüfung: Biologie'],
          subCompetencies: [
            { code: 'NT.3.1.a', name: 'Zellbiologie', description: 'Aufbau und Funktion von Zellen kennen' },
            { code: 'NT.3.1.b', name: 'Stoffwechsel', description: 'Fotosynthese und Zellatmung verstehen' },
            { code: 'NT.3.1.c', name: 'Verdauung', description: 'Den Verdauungsvorgang und die Nährstoffaufnahme beschreiben' },
            { code: 'NT.3.1.d', name: 'Blutkreislauf', description: 'Herz, Blutkreislauf und Atmung verstehen' },
          ]
        },
        { code: 'NT.3.2', name: 'Biologie – Ökologie', description: 'Ökosysteme und Biodiversität', level: 'Erweitert', goals: ['Ökosysteme analysieren', 'Stoffkreisläufe', 'Umweltschutz und Nachhaltigkeit'], sequence: ['Arbeitsblatt: Ökosysteme', 'Quiz: Stoffkreisläufe'],
          subCompetencies: [
            { code: 'NT.3.2.a', name: 'Ökosysteme', description: 'Aufbau und Funktionsweise von Ökosystemen analysieren' },
            { code: 'NT.3.2.b', name: 'Stoffkreisläufe', description: 'Kohlenstoff- und Stickstoffkreislauf beschreiben' },
            { code: 'NT.3.2.c', name: 'Klimawandel', description: 'Ursachen und Folgen des Klimawandels verstehen' },
            { code: 'NT.3.2.d', name: 'Nachhaltigkeit', description: 'Nachhaltige Entwicklung und Umweltschutz reflektieren' },
          ]
        },
        { code: 'NT.3.3', name: 'Biologie – Genetik & Evolution', description: 'Vererbung und Evolutionstheorie', level: 'Erweitert', goals: ['Genetik Grundlagen', 'DNA und Vererbung', 'Evolutionstheorie', 'Selektion und Anpassung'], sequence: ['Arbeitsblatt: Genetik', 'Quiz: Evolution', 'Prüfung: Genetik'],
          subCompetencies: [
            { code: 'NT.3.3.a', name: 'DNA', description: 'Aufbau der DNA und Proteinbiosynthese grundlegend verstehen' },
            { code: 'NT.3.3.b', name: 'Vererbung', description: 'Mendelsche Regeln kennen und anwenden' },
            { code: 'NT.3.3.c', name: 'Evolution', description: 'Evolutionstheorie und Selektionsmechanismen verstehen' },
            { code: 'NT.3.3.d', name: 'Gentechnik', description: 'Grundlagen und ethische Fragen der Gentechnik kennen' },
          ]
        },
        { code: 'NT.4.1', name: 'Technik & Informatik', description: 'Technische Systeme verstehen und konstruieren', level: 'Erweitert', goals: ['Technische Geräte analysieren', 'Einfache Programmierung', 'Konstruktion und Design', 'Robotik'], sequence: ['Arbeitsblatt: Technik-Analyse', 'Quiz: Informatik'],
          subCompetencies: [
            { code: 'NT.4.1.a', name: 'Technische Analyse', description: 'Technische Geräte und Systeme analysieren und erklären' },
            { code: 'NT.4.1.b', name: 'Robotik', description: 'Einfache Roboter programmieren und bauen' },
            { code: 'NT.4.1.c', name: 'Konstruktion', description: 'Technische Lösungen entwerfen und konstruieren' },
          ]
        },
      ]},

      // ── RÄUME, ZEITEN, GESELLSCHAFTEN ──
      { id: 'z3-rz', name: 'Räume, Zeiten, Gesellschaften', icon: '🏛️', competencies: [
        { code: 'RZG.1.1', name: 'Natürliche Grundlagen der Erde', description: 'Geomorphologische und klimatische Prozesse verstehen', level: 'Erweitert', goals: ['Klimazonen kennen', 'Plattentektonik', 'Wetter und Klima unterscheiden'], sequence: ['Arbeitsblatt: Klimazonen', 'Quiz: Plattentektonik'],
          subCompetencies: [
            { code: 'RZG.1.1.a', name: 'Klima', description: 'Klimazonen und Klimawandel verstehen' },
            { code: 'RZG.1.1.b', name: 'Geologie', description: 'Plattentektonik, Gebirgsbildung und Vulkanismus erklären' },
            { code: 'RZG.1.1.c', name: 'Naturgefahren', description: 'Naturgefahren (Erdbeben, Vulkane, Überschwemmungen) verstehen' },
          ]
        },
        { code: 'RZG.1.2', name: 'Lebensweisen & Lebensräume', description: 'Globale Zusammenhänge und Raumnutzung', level: 'Erweitert', goals: ['Globalisierung verstehen', 'Urbanisierung', 'Migration und Mobilität'], sequence: ['Arbeitsblatt: Globalisierung', 'Quiz: Urbanisierung'],
          subCompetencies: [
            { code: 'RZG.1.2.a', name: 'Globalisierung', description: 'Wirtschaftliche und kulturelle Globalisierung verstehen' },
            { code: 'RZG.1.2.b', name: 'Urbanisierung', description: 'Verstädterung und ihre Folgen analysieren' },
            { code: 'RZG.1.2.c', name: 'Migration', description: 'Ursachen und Folgen von Migration verstehen' },
          ]
        },
        { code: 'RZG.1.3', name: 'Schweiz – Geographie', description: 'Räumliche Strukturen der Schweiz', level: 'Erweitert', goals: ['Naturräume der Schweiz', 'Wirtschaftsräume', 'Verkehr und Raumplanung'], sequence: ['Arbeitsblatt: Schweizer Geographie', 'Prüfung: Geographie Schweiz'],
          subCompetencies: [
            { code: 'RZG.1.3.a', name: 'Naturräume', description: 'Jura, Mittelland und Alpen als Naturräume beschreiben' },
            { code: 'RZG.1.3.b', name: 'Wirtschaft', description: 'Wirtschaftssektoren und -räume der Schweiz kennen' },
            { code: 'RZG.1.3.c', name: 'Raumplanung', description: 'Grundlagen der Raumplanung und Verkehrspolitik verstehen' },
          ]
        },
        { code: 'RZG.2.1', name: 'Geschichte – Antike & Mittelalter', description: 'Frühe Hochkulturen bis Mittelalter', level: 'Erweitert', goals: ['Antike Hochkulturen', 'Römisches Reich', 'Mittelalter und Feudalismus'], sequence: ['Arbeitsblatt: Antike', 'Quiz: Mittelalter'],
          subCompetencies: [
            { code: 'RZG.2.1.a', name: 'Hochkulturen', description: 'Ägypten, Griechenland und Rom als Hochkulturen kennen' },
            { code: 'RZG.2.1.b', name: 'Mittelalter', description: 'Feudalismus, Ständegesellschaft und Kirche im Mittelalter verstehen' },
            { code: 'RZG.2.1.c', name: 'Schweiz im Mittelalter', description: 'Die Entstehung der Eidgenossenschaft kennen' },
          ]
        },
        { code: 'RZG.2.2', name: 'Geschichte – Neuzeit', description: 'Von der Renaissance bis zur Industrialisierung', level: 'Erweitert', goals: ['Renaissance und Reformation', 'Aufklärung', 'Französische Revolution', 'Industrialisierung'], sequence: ['Arbeitsblatt: Neuzeit', 'Quiz: Revolutionen', 'Prüfung: Geschichte'],
          subCompetencies: [
            { code: 'RZG.2.2.a', name: 'Renaissance', description: 'Renaissance und Humanismus als kulturelle Erneuerung verstehen' },
            { code: 'RZG.2.2.b', name: 'Reformation', description: 'Die Reformation und ihre Folgen kennen' },
            { code: 'RZG.2.2.c', name: 'Aufklärung', description: 'Aufklärung und ihre Ideen (Menschenrechte, Demokratie) verstehen' },
            { code: 'RZG.2.2.d', name: 'Industrialisierung', description: 'Die industrielle Revolution und ihre sozialen Folgen kennen' },
          ]
        },
        { code: 'RZG.2.3', name: 'Geschichte – 20./21. Jahrhundert', description: 'Weltkriege, Kalter Krieg und Gegenwart', level: 'Erweitert', goals: ['Erster und Zweiter Weltkrieg', 'Kalter Krieg', 'Schweiz im 20. Jahrhundert', 'Aktuelle Konflikte'], sequence: ['Arbeitsblatt: Weltkriege', 'Quiz: Kalter Krieg'],
          subCompetencies: [
            { code: 'RZG.2.3.a', name: 'Erster Weltkrieg', description: 'Ursachen, Verlauf und Folgen des Ersten Weltkriegs kennen' },
            { code: 'RZG.2.3.b', name: 'Zweiter Weltkrieg', description: 'Nationalsozialismus, Holocaust und Zweiten Weltkrieg verstehen' },
            { code: 'RZG.2.3.c', name: 'Kalter Krieg', description: 'Den Kalten Krieg und seine Auswirkungen verstehen' },
            { code: 'RZG.2.3.d', name: 'Schweiz im 20. Jh.', description: 'Die Rolle der Schweiz im 20. Jahrhundert kennen' },
          ]
        },
        { code: 'RZG.3.1', name: 'Politische Bildung', description: 'Politische Systeme und Partizipation', level: 'Erweitert', goals: ['Schweizer Demokratie', 'Grundrechte', 'Politische Parteien', 'Abstimmungen verstehen'], sequence: ['Quiz: Demokratie', 'Arbeitsblatt: Politisches System', 'Prüfung: Politische Bildung'],
          subCompetencies: [
            { code: 'RZG.3.1.a', name: 'Bundesverfassung', description: 'Aufbau und Grundprinzipien der Bundesverfassung kennen' },
            { code: 'RZG.3.1.b', name: 'Gewaltenteilung', description: 'Legislative, Exekutive und Judikative unterscheiden' },
            { code: 'RZG.3.1.c', name: 'Direkte Demokratie', description: 'Volksinitiative, Referendum und Abstimmungen verstehen' },
            { code: 'RZG.3.1.d', name: 'Parteien', description: 'Politische Parteien und ihre Positionen kennen' },
          ]
        },
        { code: 'RZG.3.2', name: 'Wirtschaft & Recht', description: 'Wirtschaftliche und rechtliche Grundlagen', level: 'Erweitert', goals: ['Wirtschaftskreislauf', 'Geld und Bankwesen', 'Steuern', 'Konsumentenrechte'], sequence: ['Arbeitsblatt: Wirtschaft', 'Quiz: Recht'],
          subCompetencies: [
            { code: 'RZG.3.2.a', name: 'Wirtschaftskreislauf', description: 'Den einfachen und erweiterten Wirtschaftskreislauf verstehen' },
            { code: 'RZG.3.2.b', name: 'Bankwesen', description: 'Funktionen von Banken und Geldpolitik verstehen' },
            { code: 'RZG.3.2.c', name: 'Steuern', description: 'Das Steuersystem der Schweiz grundlegend verstehen' },
            { code: 'RZG.3.2.d', name: 'Konsumentenrecht', description: 'Grundlegende Konsumentenrechte und Vertragsrecht kennen' },
          ]
        },
      ]},

      // ── ETHIK, RELIGIONEN, GEMEINSCHAFT ──
      { id: 'z3-erg', name: 'Ethik, Religionen, Gemeinschaft', icon: '🤝', competencies: [
        { code: 'ERG.1.1', name: 'Existentielle Grunderfahrungen', description: 'Grundfragen des Lebens reflektieren', level: 'Erweitert', goals: ['Sinnfragen stellen', 'Glück und Leid reflektieren', 'Identität entwickeln'], sequence: ['Arbeitsblatt: Sinnfragen', 'Quiz: Identität'],
          subCompetencies: [
            { code: 'ERG.1.1.a', name: 'Sinnfragen', description: 'Philosophische Grundfragen stellen und diskutieren' },
            { code: 'ERG.1.1.b', name: 'Identität', description: 'Die eigene Identität reflektieren und entwickeln' },
          ]
        },
        { code: 'ERG.2.1', name: 'Werte & Normen', description: 'Ethische Grundlagen und Wertvorstellungen', level: 'Erweitert', goals: ['Ethische Dilemmata diskutieren', 'Menschenrechte kennen', 'Gerechtigkeit reflektieren'], sequence: ['Arbeitsblatt: Dilemmata', 'Quiz: Menschenrechte'],
          subCompetencies: [
            { code: 'ERG.2.1.a', name: 'Ethische Dilemmata', description: 'Ethische Dilemmata analysieren und verschiedene Positionen abwägen' },
            { code: 'ERG.2.1.b', name: 'Menschenrechte', description: 'Die Allgemeine Erklärung der Menschenrechte kennen' },
            { code: 'ERG.2.1.c', name: 'Ethische Theorien', description: 'Grundzüge wichtiger ethischer Theorien kennen (Utilitarismus, Pflichtethik)' },
          ]
        },
        { code: 'ERG.3.1', name: 'Spuren & Einfluss von Religionen', description: 'Weltreligionen und ihre Bedeutung', level: 'Erweitert', goals: ['Weltreligionen kennen', 'Religiöse Texte verstehen', 'Interreligiöser Dialog'], sequence: ['Arbeitsblatt: Weltreligionen', 'Quiz: Religiöse Feste', 'Prüfung: Religionen'],
          subCompetencies: [
            { code: 'ERG.3.1.a', name: 'Weltreligionen', description: 'Die fünf Weltreligionen vergleichen und einordnen' },
            { code: 'ERG.3.1.b', name: 'Religiöse Texte', description: 'Zentrale Texte der Weltreligionen kennen und einordnen' },
            { code: 'ERG.3.1.c', name: 'Dialog', description: 'Interreligiösen Dialog führen und Toleranz zeigen' },
          ]
        },
        { code: 'ERG.4.1', name: 'Ich und die Gemeinschaft', description: 'Zusammenleben in einer vielfältigen Gesellschaft', level: 'Erweitert', goals: ['Vorurteile erkennen', 'Toleranz üben', 'Zivilcourage zeigen'], sequence: ['Arbeitsblatt: Vorurteile', 'Quiz: Toleranz'],
          subCompetencies: [
            { code: 'ERG.4.1.a', name: 'Vorurteile', description: 'Vorurteile und Stereotypen erkennen und hinterfragen' },
            { code: 'ERG.4.1.b', name: 'Zivilcourage', description: 'Zivilcourage zeigen und Verantwortung übernehmen' },
          ]
        },
        { code: 'ERG.5.1', name: 'Geschlechter & Gleichstellung', description: 'Geschlechterrollen und Gleichstellung reflektieren', level: 'Erweitert', goals: ['Geschlechterbilder hinterfragen', 'Gleichstellung kennen', 'Respektvoller Umgang'], sequence: ['Arbeitsblatt: Gleichstellung'],
          subCompetencies: [
            { code: 'ERG.5.1.a', name: 'Geschlechterrollen', description: 'Geschlechterrollen und -stereotypen kritisch reflektieren' },
            { code: 'ERG.5.1.b', name: 'Gleichstellung', description: 'Rechtliche Grundlagen der Gleichstellung kennen' },
          ]
        },
      ]},

      // ── ENGLISCH ──
      { id: 'z3-e', name: 'Englisch', icon: '🇬🇧', competencies: [
        { code: 'FS1E.1.B.1', name: 'Hören – Verstehen', description: 'Längere gesprochene Texte verstehen', level: 'Erweitert', goals: ['Nachrichten verstehen', 'Diskussionen folgen', 'Verschiedene Akzente verstehen'], sequence: ['Quiz: Listening Advanced', 'Arbeitsblatt: News Comprehension'],
          subCompetencies: [
            { code: 'FS1E.1.B.1.a', name: 'Authentisches Material', description: 'Authentische englische Hörtexte verstehen (Podcasts, Nachrichten)' },
            { code: 'FS1E.1.B.1.b', name: 'Akzente', description: 'Verschiedene englische Akzente verstehen' },
            { code: 'FS1E.1.B.1.c', name: 'Vorlesungen', description: 'Längeren Vorträgen und Präsentationen folgen' },
          ]
        },
        { code: 'FS1E.2.B.1', name: 'Lesen – Verstehen', description: 'Komplexere englische Texte verstehen', level: 'Erweitert', goals: ['Zeitungsartikel verstehen', 'Literarische Texte lesen', 'Informationen zusammenfassen'], sequence: ['Arbeitsblatt: Reading Comprehension', 'Prüfung: Reading'],
          subCompetencies: [
            { code: 'FS1E.2.B.1.a', name: 'Newspaper Articles', description: 'Englische Zeitungsartikel verstehen und zusammenfassen' },
            { code: 'FS1E.2.B.1.b', name: 'Literature', description: 'Englischsprachige Literatur lesen und verstehen' },
          ]
        },
        { code: 'FS1E.3.B.1', name: 'Sprechen – Dialogisch', description: 'In verschiedenen Situationen kommunizieren', level: 'Erweitert', goals: ['Meinungen austauschen', 'Über aktuelle Themen diskutieren', 'Bewerbungsgespräche üben'], sequence: ['Arbeitsblatt: Discussion', 'Quiz: Dialogues'],
          subCompetencies: [
            { code: 'FS1E.3.B.1.a', name: 'Discussions', description: 'Auf Englisch diskutieren und Meinungen austauschen' },
            { code: 'FS1E.3.B.1.b', name: 'Job Interviews', description: 'Einfache Bewerbungsgespräche auf Englisch führen' },
          ]
        },
        { code: 'FS1E.3.C.1', name: 'Sprechen – Monologisch', description: 'Zusammenhängend über komplexe Themen sprechen', level: 'Erweitert', goals: ['Präsentationen auf Englisch', 'Bücher/Filme vorstellen', 'Argumentieren'], sequence: ['Arbeitsblatt: Presentation'],
          subCompetencies: [
            { code: 'FS1E.3.C.1.a', name: 'Presentations', description: 'Strukturierte Präsentationen auf Englisch halten' },
            { code: 'FS1E.3.C.1.b', name: 'Argumentation', description: 'Standpunkte auf Englisch überzeugend darlegen' },
          ]
        },
        { code: 'FS1E.4.B.1', name: 'Schreiben', description: 'Verschiedene Textsorten auf Englisch verfassen', level: 'Erweitert', goals: ['Essays schreiben', 'Formelle Briefe/E-Mails', 'Kreatives Schreiben'], sequence: ['Arbeitsblatt: Essay Writing', 'Prüfung: Writing'],
          subCompetencies: [
            { code: 'FS1E.4.B.1.a', name: 'Essays', description: 'Argumentative und beschreibende Essays verfassen' },
            { code: 'FS1E.4.B.1.b', name: 'Formal Writing', description: 'Formelle Briefe, E-Mails und Bewerbungen schreiben' },
            { code: 'FS1E.4.B.1.c', name: 'Creative Writing', description: 'Kreative Texte auf Englisch verfassen' },
          ]
        },
        { code: 'FS1E.5.B.1', name: 'Sprache im Fokus', description: 'Grammatik und Wortschatz vertiefen', level: 'Erweitert', goals: ['Erweiterte Grammatik', 'Wortschatz ausbauen', 'Sprachstrategien anwenden'], sequence: ['Arbeitsblatt: Grammar Advanced', 'Quiz: Vocabulary', 'Prüfung: Englisch'],
          subCompetencies: [
            { code: 'FS1E.5.B.1.a', name: 'Tenses', description: 'Alle englischen Zeitformen sicher anwenden' },
            { code: 'FS1E.5.B.1.b', name: 'Conditional', description: 'Conditional Sentences (If-Sätze) korrekt bilden' },
            { code: 'FS1E.5.B.1.c', name: 'Passive Voice', description: 'Active und Passive Voice unterscheiden und anwenden' },
            { code: 'FS1E.5.B.1.d', name: 'Reported Speech', description: 'Direkte und indirekte Rede korrekt umwandeln' },
          ]
        },
        { code: 'FS1E.6.B.1', name: 'Kulturen im Fokus', description: 'Anglophone Kulturen vertieft kennenlernen', level: 'Erweitert', goals: ['Kulturelle Unterschiede verstehen', 'Interkulturelle Kompetenz', 'Medien in englischer Sprache nutzen'], sequence: ['Arbeitsblatt: Cultural Awareness'],
          subCompetencies: [
            { code: 'FS1E.6.B.1.a', name: 'Interkulturell', description: 'Interkulturelle Unterschiede erkennen und respektieren' },
            { code: 'FS1E.6.B.1.b', name: 'Englische Medien', description: 'Englischsprachige Medien (Filme, Podcasts, Bücher) nutzen' },
          ]
        },
      ]},

      // ── FRANZÖSISCH ──
      { id: 'z3-f', name: 'Französisch', icon: '🇫🇷', competencies: [
        { code: 'FS2F.1.B.1', name: 'Hören – Verstehen', description: 'Komplexere französische Hörtexte verstehen', level: 'Erweitert', goals: ['Alltagsgespräche verstehen', 'Medientexte folgen', 'Verschiedene Sprechtempi verstehen'], sequence: ['Quiz: Compréhension orale avancée', 'Arbeitsblatt: Écouter'],
          subCompetencies: [
            { code: 'FS2F.1.B.1.a', name: 'Alltagsgespräche', description: 'Französische Alltagsgespräche verstehen' },
            { code: 'FS2F.1.B.1.b', name: 'Medien', description: 'Französischen Medientexten (Radio, TV) folgen' },
          ]
        },
        { code: 'FS2F.2.B.1', name: 'Lesen – Verstehen', description: 'Anspruchsvollere französische Texte lesen', level: 'Erweitert', goals: ['Zeitungsartikel verstehen', 'Literarische Texte lesen', 'Informationen zusammenfassen'], sequence: ['Arbeitsblatt: Lecture avancée', 'Prüfung: Lecture'],
          subCompetencies: [
            { code: 'FS2F.2.B.1.a', name: 'Articles', description: 'Französische Zeitungsartikel und Sachtexte verstehen' },
            { code: 'FS2F.2.B.1.b', name: 'Littérature', description: 'Einfache französischsprachige Literatur lesen' },
          ]
        },
        { code: 'FS2F.3.B.1', name: 'Sprechen – Dialogisch', description: 'In verschiedenen Situationen auf Französisch kommunizieren', level: 'Erweitert', goals: ['Meinungen austauschen', 'Im Alltag kommunizieren', 'Rollenspiele durchführen'], sequence: ['Arbeitsblatt: Dialogues avancés'],
          subCompetencies: [
            { code: 'FS2F.3.B.1.a', name: 'Conversations', description: 'In Alltagssituationen auf Französisch kommunizieren' },
            { code: 'FS2F.3.B.1.b', name: 'Débats', description: 'Meinungen auf Französisch austauschen und begründen' },
          ]
        },
        { code: 'FS2F.3.C.1', name: 'Sprechen – Monologisch', description: 'Zusammenhängend auf Französisch erzählen', level: 'Erweitert', goals: ['Erlebnisse erzählen', 'Präsentationen halten', 'Meinungen begründen'], sequence: ['Arbeitsblatt: Présentation'] },
        { code: 'FS2F.4.B.1', name: 'Schreiben', description: 'Verschiedene Textsorten auf Französisch verfassen', level: 'Erweitert', goals: ['Briefe und E-Mails schreiben', 'Beschreibungen verfassen', 'Texte zu aktuellen Themen'], sequence: ['Arbeitsblatt: Écrire avancé', 'Prüfung: Écriture'],
          subCompetencies: [
            { code: 'FS2F.4.B.1.a', name: 'Lettres', description: 'Formelle und informelle Briefe auf Französisch schreiben' },
            { code: 'FS2F.4.B.1.b', name: 'Textes', description: 'Verschiedene Textsorten (Beschreibung, Bericht, Meinung) verfassen' },
          ]
        },
        { code: 'FS2F.5.B.1', name: 'Sprache im Fokus', description: 'Französische Grammatik und Wortschatz vertiefen', level: 'Erweitert', goals: ['Zeitformen vertiefen', 'Pronomen korrekt einsetzen', 'Wortschatz ausbauen'], sequence: ['Arbeitsblatt: Grammaire avancée', 'Quiz: Vocabulaire', 'Prüfung: Französisch'],
          subCompetencies: [
            { code: 'FS2F.5.B.1.a', name: 'Temps', description: 'Alle wichtigen Zeitformen (Présent, Passé composé, Imparfait, Futur) anwenden' },
            { code: 'FS2F.5.B.1.b', name: 'Pronoms', description: 'Objekt- und Relativpronomen korrekt einsetzen' },
            { code: 'FS2F.5.B.1.c', name: 'Subjonctif', description: 'Den Subjonctif in häufigen Ausdrücken anwenden' },
          ]
        },
        { code: 'FS2F.6.B.1', name: 'Kulturen im Fokus', description: 'Frankophone Kulturen vertieft kennenlernen', level: 'Erweitert', goals: ['Westschweiz kennenlernen', 'Frankophone Welt entdecken', 'Kulturvergleiche anstellen'], sequence: ['Arbeitsblatt: La Suisse romande'],
          subCompetencies: [
            { code: 'FS2F.6.B.1.a', name: 'Suisse romande', description: 'Die Westschweiz und ihre Besonderheiten kennenlernen' },
            { code: 'FS2F.6.B.1.b', name: 'Francophonie', description: 'Die frankophone Welt (Afrika, Kanada, Karibik) entdecken' },
          ]
        },
      ]},

      // ── BILDNERISCHES GESTALTEN ──
      { id: 'z3-bg', name: 'Bildnerisches Gestalten', icon: '🎨', competencies: [
        { code: 'BG.1.A.3', name: 'Wahrnehmen & Kommunizieren – Wahrnehmen', description: 'Bilder und Kunstwerke analysieren', level: 'Erweitert', goals: ['Bildanalyse durchführen', 'Gestaltungsprinzipien erkennen', 'Wirkung analysieren'], sequence: ['Arbeitsblatt: Bildanalyse', 'Prüfung: Kunstbetrachtung'],
          subCompetencies: [
            { code: 'BG.1.A.3.a', name: 'Bildanalyse', description: 'Kunstwerke systematisch analysieren (Komposition, Farbe, Form)' },
            { code: 'BG.1.A.3.b', name: 'Wirkung', description: 'Die Wirkung von Bildern begründet beurteilen' },
          ]
        },
        { code: 'BG.1.B.3', name: 'Wahrnehmen & Kommunizieren – Sich ausdrücken', description: 'Komplexe Ideen bildnerisch umsetzen', level: 'Erweitert', goals: ['Konzepte visualisieren', 'Abstrakt gestalten', 'Serien und Reihen entwickeln'], sequence: ['Arbeitsblatt: Konzeptkunst'] },
        { code: 'BG.2.A.3', name: 'Prozesse & Produkte – Experimentieren', description: 'Gestalterische Prozesse experimentell erweitern', level: 'Erweitert', goals: ['Intermediale Arbeiten', 'Digitale Gestaltung', 'Mixed Media'], sequence: ['Arbeitsblatt: Digitale Kunst'],
          subCompetencies: [
            { code: 'BG.2.A.3.a', name: 'Digital', description: 'Digitale Gestaltungstools einsetzen (Fotografie, Bildbearbeitung)' },
            { code: 'BG.2.A.3.b', name: 'Mixed Media', description: 'Verschiedene Medien und Techniken kreativ kombinieren' },
          ]
        },
        { code: 'BG.2.B.3', name: 'Prozesse & Produkte – Gestalten', description: 'Eigenständige künstlerische Projekte realisieren', level: 'Erweitert', goals: ['Projektarbeit', 'Portfolio erstellen', 'Ausstellung gestalten'], sequence: ['Arbeitsblatt: Kunstprojekt'] },
        { code: 'BG.3.A.3', name: 'Kontexte & Orientierung', description: 'Kunst im historischen und gesellschaftlichen Kontext', level: 'Erweitert', goals: ['Kunstgeschichte kennen', 'Zeitgenössische Kunst verstehen', 'Kunst und Gesellschaft reflektieren'], sequence: ['Quiz: Kunstgeschichte', 'Arbeitsblatt: Kunstepoche'],
          subCompetencies: [
            { code: 'BG.3.A.3.a', name: 'Kunstepochen', description: 'Wichtige Kunstepochen und deren Merkmale kennen' },
            { code: 'BG.3.A.3.b', name: 'Zeitgenössisch', description: 'Zeitgenössische Kunst verstehen und einordnen' },
          ]
        },
      ]},

      // ── TEXTILES UND TECHNISCHES GESTALTEN ──
      { id: 'z3-ttg', name: 'Textiles und Technisches Gestalten', icon: '✂️', competencies: [
        { code: 'TTG.1.A.3', name: 'Wahrnehmung & Kommunikation', description: 'Produkte und Designs kritisch analysieren', level: 'Erweitert', goals: ['Produktdesign analysieren', 'Nachhaltigkeit beurteilen', 'Funktionalität und Ästhetik bewerten'], sequence: ['Arbeitsblatt: Designanalyse'] },
        { code: 'TTG.2.A.3', name: 'Prozesse – Ideen entwickeln', description: 'Innovative Lösungen entwickeln', level: 'Erweitert', goals: ['Design Thinking anwenden', 'Prototypen bauen', 'Iterativ arbeiten'], sequence: ['Arbeitsblatt: Design Thinking'],
          subCompetencies: [
            { code: 'TTG.2.A.3.a', name: 'Design Thinking', description: 'Den Design-Thinking-Prozess anwenden' },
            { code: 'TTG.2.A.3.b', name: 'Prototyping', description: 'Prototypen bauen, testen und iterativ verbessern' },
          ]
        },
        { code: 'TTG.2.B.3', name: 'Prozesse – Planen & Herstellen', description: 'Komplexe Werkstücke professionell umsetzen', level: 'Erweitert', goals: ['Präzise Werkzeichnungen', 'Fachgerechte Verarbeitung', 'Qualitätskontrolle'], sequence: ['Arbeitsblatt: Werkzeichnung'] },
        { code: 'TTG.2.C.3', name: 'Textil – Verfahren', description: 'Erweiterte textile Verfahren', level: 'Erweitert', goals: ['Schnittmuster erstellen', 'Maschinennähen', 'Textile Materialien kombinieren'], sequence: ['Arbeitsblatt: Schnittmuster', 'Arbeitsblatt: Maschinennähen'],
          subCompetencies: [
            { code: 'TTG.2.C.3.a', name: 'Schnittmuster', description: 'Schnittmuster lesen, anpassen und erstellen' },
            { code: 'TTG.2.C.3.b', name: 'Nähmaschine', description: 'Sicher und präzise mit der Nähmaschine arbeiten' },
          ]
        },
        { code: 'TTG.2.D.3', name: 'Technisch – Verfahren', description: 'Erweiterte technische Verfahren', level: 'Erweitert', goals: ['CNC-Grundlagen', 'Elektronik einbinden', '3D-Druck Grundlagen', 'Komplexe Verbindungen'], sequence: ['Arbeitsblatt: Elektronik', 'Arbeitsblatt: 3D-Druck'],
          subCompetencies: [
            { code: 'TTG.2.D.3.a', name: 'Elektronik', description: 'Elektronische Komponenten in Werkstücke integrieren' },
            { code: 'TTG.2.D.3.b', name: '3D-Druck', description: 'Grundlagen des 3D-Drucks kennen und anwenden' },
            { code: 'TTG.2.D.3.c', name: 'CNC', description: 'Grundlagen der computergesteuerten Fertigung kennen' },
          ]
        },
        { code: 'TTG.3.A.3', name: 'Kontexte & Orientierung', description: 'Design, Technik und Berufsorientierung', level: 'Erweitert', goals: ['Berufsfelder kennen', 'Nachhaltiges Design', 'Produktionsverfahren verstehen'], sequence: ['Arbeitsblatt: Berufe TTG'] },
      ]},

      // ── MUSIK ──
      { id: 'z3-mu', name: 'Musik', icon: '🎵', competencies: [
        { code: 'MU.1.A.3', name: 'Singen und Sprechen', description: 'Anspruchsvolle Lieder und Stimmarbeit', level: 'Erweitert', goals: ['Mehrstimmig singen', 'Songs verschiedener Genres', 'Stimme gezielt einsetzen'], sequence: ['Arbeitsblatt: Mehrstimmigkeit'],
          subCompetencies: [
            { code: 'MU.1.A.3.a', name: 'Mehrstimmig', description: 'Mehrstimmige Lieder und Songs sicher singen' },
            { code: 'MU.1.A.3.b', name: 'Genres', description: 'Songs aus verschiedenen Genres stilgerecht singen' },
          ]
        },
        { code: 'MU.2.A.3', name: 'Hören und Sich-Orientieren', description: 'Musik analysieren und einordnen', level: 'Erweitert', goals: ['Musikepochen kennen', 'Musik analysieren', 'Musikkritik verfassen'], sequence: ['Quiz: Musikepochen', 'Arbeitsblatt: Musikanalyse', 'Prüfung: Musikgeschichte'],
          subCompetencies: [
            { code: 'MU.2.A.3.a', name: 'Epochen', description: 'Musikepochen (Barock, Klassik, Romantik, Moderne) kennen' },
            { code: 'MU.2.A.3.b', name: 'Analyse', description: 'Musikstücke nach Form, Instrumentierung und Ausdruck analysieren' },
          ]
        },
        { code: 'MU.3.A.3', name: 'Bewegen und Tanzen', description: 'Tänze und Choreografien gestalten', level: 'Erweitert', goals: ['Eigene Choreografien', 'Verschiedene Tanzstile', 'Tanz als Ausdruck'], sequence: ['Arbeitsblatt: Choreografie'] },
        { code: 'MU.4.A.3', name: 'Musizieren', description: 'Im Ensemble musizieren', level: 'Erweitert', goals: ['Bandmusik spielen', 'Arrangement umsetzen', 'Solo und Begleitung'], sequence: ['Arbeitsblatt: Ensemble'] },
        { code: 'MU.5.A.3', name: 'Gestaltungsprozesse', description: 'Eigene Musikprojekte realisieren', level: 'Erweitert', goals: ['Songwriting', 'Musikproduktion digital', 'Musikvideo gestalten'], sequence: ['Arbeitsblatt: Songwriting'],
          subCompetencies: [
            { code: 'MU.5.A.3.a', name: 'Songwriting', description: 'Eigene Songs schreiben (Text und Melodie)' },
            { code: 'MU.5.A.3.b', name: 'Produktion', description: 'Musik digital aufnehmen und bearbeiten' },
          ]
        },
        { code: 'MU.6.A.3', name: 'Praxis des musikalischen Wissens', description: 'Musiktheorie vertiefen', level: 'Erweitert', goals: ['Harmonielehre', 'Akkorde und Tonleitern', 'Formenlehre'], sequence: ['Arbeitsblatt: Harmonielehre', 'Quiz: Akkorde', 'Prüfung: Musiktheorie'],
          subCompetencies: [
            { code: 'MU.6.A.3.a', name: 'Harmonielehre', description: 'Akkorde, Dreiklänge und Kadenz verstehen' },
            { code: 'MU.6.A.3.b', name: 'Tonleitern', description: 'Dur-, Moll- und pentatonische Tonleitern kennen' },
            { code: 'MU.6.A.3.c', name: 'Formenlehre', description: 'Musikalische Formen (Liedform, Rondo, Sonatenform) erkennen' },
          ]
        },
      ]},

      // ── BEWEGUNG UND SPORT ──
      { id: 'z3-bs', name: 'Bewegung und Sport', icon: '⚽', competencies: [
        { code: 'BS.1.A.3', name: 'Laufen, Springen, Werfen', description: 'Leichtathletische Disziplinen vertiefen', level: 'Erweitert', goals: ['Ausdauerlauf', 'Hochsprung/Weitsprung Technik', 'Kugelstossen/Speerwurf'], sequence: ['Arbeitsblatt: Leichtathletik'] },
        { code: 'BS.2.A.3', name: 'Bewegen an Geräten', description: 'Anspruchsvolle Übungen an Geräten', level: 'Erweitert', goals: ['Kürübungen', 'Akrobatik', 'Parkour-Elemente'], sequence: ['Arbeitsblatt: Geräteturnen'] },
        { code: 'BS.3.A.3', name: 'Darstellen und Tanzen', description: 'Ausdrucksformen und Choreografien gestalten', level: 'Erweitert', goals: ['Tanzprojekte', 'Fitness-Choreografien', 'Ausdruck und Kreativität'], sequence: ['Arbeitsblatt: Tanzprojekt'] },
        { code: 'BS.4.A.3', name: 'Spielen – Sportspiele', description: 'Sportspiele auf fortgeschrittenem Niveau', level: 'Erweitert', goals: ['Basketball, Fussball, Handball, Volleyball', 'Taktik und Spielzüge', 'Schiedsrichter und Fairplay'], sequence: ['Arbeitsblatt: Spieltaktik'],
          subCompetencies: [
            { code: 'BS.4.A.3.a', name: 'Taktik', description: 'Spieltaktiken verstehen und im Spiel anwenden' },
            { code: 'BS.4.A.3.b', name: 'Technik', description: 'Sportartspezifische Techniken beherrschen' },
            { code: 'BS.4.A.3.c', name: 'Fair Play', description: 'Fair Play und Schiedsrichterentscheide respektieren' },
          ]
        },
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
            { code: 'WAH.1.1.c', name: 'Lebensmittelkennzeichnung', description: 'Nährwerttabellen und Labels lesen und beurteilen' },
          ]
        },
        { code: 'WAH.1.2', name: 'Nahrungszubereitung', description: 'Lebensmittel fachgerecht verarbeiten', level: 'Erweitert', goals: ['Kochtechniken anwenden', 'Hygieneregeln einhalten', 'Rezepte umsetzen'], sequence: ['Arbeitsblatt: Kochtechniken', 'Quiz: Küchenhygiene'],
          subCompetencies: [
            { code: 'WAH.1.2.a', name: 'Kochtechniken', description: 'Grundlegende Kochtechniken (Braten, Dünsten, Backen) anwenden' },
            { code: 'WAH.1.2.b', name: 'Hygiene', description: 'Lebensmittelhygiene und Küchenhygiene einhalten' },
          ]
        },
        { code: 'WAH.2.1', name: 'Wirtschaft & Haushalt', description: 'Wirtschaftlich und nachhaltig haushalten', level: 'Erweitert', goals: ['Budget erstellen', 'Konsumverhalten reflektieren', 'Nachhaltiger Konsum'], sequence: ['Arbeitsblatt: Budget', 'Quiz: Nachhaltigkeit'],
          subCompetencies: [
            { code: 'WAH.2.1.a', name: 'Budget', description: 'Ein persönliches Budget erstellen und überwachen' },
            { code: 'WAH.2.1.b', name: 'Konsum', description: 'Konsumentscheide kritisch reflektieren' },
            { code: 'WAH.2.1.c', name: 'Nachhaltigkeit', description: 'Nachhaltiges Wirtschaften und ökologischen Fussabdruck verstehen' },
          ]
        },
        { code: 'WAH.3.1', name: 'Berufliche Orientierung', description: 'Den Berufswahlprozess aktiv gestalten', level: 'Erweitert', goals: ['Berufsfelder kennen', 'Schnupperlehre planen', 'Bewerbungsunterlagen erstellen', 'Vorstellungsgespräch üben'], sequence: ['Arbeitsblatt: Berufswahl', 'Arbeitsblatt: Bewerbung', 'Quiz: Berufsfelder'],
          subCompetencies: [
            { code: 'WAH.3.1.a', name: 'Interessen & Stärken', description: 'Eigene Interessen und Stärken erkennen und mit Berufen abgleichen' },
            { code: 'WAH.3.1.b', name: 'Bewerbungsprozess', description: 'Bewerbungsschreiben, Lebenslauf und Vorstellungsgespräch vorbereiten' },
            { code: 'WAH.3.1.c', name: 'Berufsfelder', description: 'Verschiedene Berufsfelder und Ausbildungswege kennen' },
            { code: 'WAH.3.1.d', name: 'Schnupperlehre', description: 'Schnupperlehren planen, durchführen und auswerten' },
          ]
        },
        { code: 'WAH.4.1', name: 'Wohnen & Zusammenleben', description: 'Wohnsituationen gestalten', level: 'Erweitert', goals: ['Wohnformen kennen', 'Mietvertrag verstehen', 'Haushalt organisieren'], sequence: ['Arbeitsblatt: Wohnen'],
          subCompetencies: [
            { code: 'WAH.4.1.a', name: 'Wohnformen', description: 'Verschiedene Wohnformen kennen und vergleichen' },
            { code: 'WAH.4.1.b', name: 'Mietrecht', description: 'Grundlagen des Mietrechts und Mietverträge verstehen' },
          ]
        },
      ]},

      // ── MEDIEN UND INFORMATIK ──
      { id: 'z3-mi', name: 'Medien und Informatik', icon: '💻', competencies: [
        { code: 'MI.1.1.3', name: 'Medien – Leben in der Mediengesellschaft', description: 'Medien und ihre Wirkung kritisch reflektieren', level: 'Erweitert', goals: ['Fake News erkennen', 'Medienkompetenz vertiefen', 'Medienethik reflektieren'], sequence: ['Quiz: Fake News', 'Arbeitsblatt: Medienanalyse'],
          subCompetencies: [
            { code: 'MI.1.1.3.a', name: 'Medienkritik', description: 'Medieninhalte und Quellen kritisch beurteilen' },
            { code: 'MI.1.1.3.b', name: 'Meinungsbildung', description: 'Die Rolle der Medien in der Meinungsbildung verstehen' },
            { code: 'MI.1.1.3.c', name: 'Fake News', description: 'Falschinformationen erkennen und Fakten überprüfen' },
            { code: 'MI.1.1.3.d', name: 'Medienethik', description: 'Ethische Fragen im Umgang mit Medien reflektieren' },
          ]
        },
        { code: 'MI.1.2.3', name: 'Medien – Sich schützen', description: 'Datenschutz und Sicherheit im digitalen Raum', level: 'Erweitert', goals: ['Datenschutz verstehen', 'Digitaler Fussabdruck', 'Recht am eigenen Bild', 'Cybersicherheit'], sequence: ['Arbeitsblatt: Datenschutz', 'Quiz: Cybersicherheit'],
          subCompetencies: [
            { code: 'MI.1.2.3.a', name: 'Datenschutz', description: 'Datenschutzgesetze und Privatsphäre im Internet verstehen' },
            { code: 'MI.1.2.3.b', name: 'Digitaler Fussabdruck', description: 'Den eigenen digitalen Fussabdruck kennen und steuern' },
            { code: 'MI.1.2.3.c', name: 'Recht am Bild', description: 'Das Recht am eigenen Bild und Persönlichkeitsrechte kennen' },
            { code: 'MI.1.2.3.d', name: 'Cybersicherheit', description: 'Phishing, Malware und andere Cybergefahren erkennen' },
          ]
        },
        { code: 'MI.1.3.3', name: 'Medien – Produzieren', description: 'Professionelle Medienbeiträge erstellen', level: 'Erweitert', goals: ['Videos produzieren', 'Podcasts erstellen', 'Webseiten gestalten'], sequence: ['Arbeitsblatt: Medienprojekt'],
          subCompetencies: [
            { code: 'MI.1.3.3.a', name: 'Video', description: 'Videos planen, drehen, schneiden und veröffentlichen' },
            { code: 'MI.1.3.3.b', name: 'Audio', description: 'Podcasts und Audiobeiträge produzieren' },
            { code: 'MI.1.3.3.c', name: 'Web', description: 'Einfache Webseiten gestalten' },
          ]
        },
        { code: 'MI.2.1.3', name: 'Informatik – Datenstrukturen', description: 'Daten strukturieren und verwalten', level: 'Erweitert', goals: ['Datenbanken verstehen', 'Datenkompression', 'Verschlüsselung Grundlagen'], sequence: ['Arbeitsblatt: Datenbanken', 'Quiz: Datenkompression'],
          subCompetencies: [
            { code: 'MI.2.1.3.a', name: 'Datenbanken', description: 'Aufbau und Abfrage von Datenbanken verstehen' },
            { code: 'MI.2.1.3.b', name: 'Kompression', description: 'Grundprinzipien der Datenkompression verstehen' },
            { code: 'MI.2.1.3.c', name: 'Verschlüsselung', description: 'Grundlagen der Verschlüsselung verstehen (symmetrisch, asymmetrisch)' },
          ]
        },
        { code: 'MI.2.2.3', name: 'Informatik – Algorithmen & Programmierung', description: 'Programme entwickeln und Probleme lösen', level: 'Erweitert', goals: ['Textbasierte Programmierung', 'Variablen und Schleifen', 'Funktionen schreiben', 'Debugging'], sequence: ['Arbeitsblatt: Programmieren', 'Quiz: Algorithmen', 'Prüfung: Informatik'],
          subCompetencies: [
            { code: 'MI.2.2.3.a', name: 'Variablen & Datentypen', description: 'Variablen und Datentypen in Programmen einsetzen' },
            { code: 'MI.2.2.3.b', name: 'Kontrollstrukturen', description: 'Schleifen und Bedingungen in Programmen nutzen' },
            { code: 'MI.2.2.3.c', name: 'Funktionen', description: 'Eigene Funktionen schreiben und nutzen' },
            { code: 'MI.2.2.3.d', name: 'Debugging', description: 'Fehler in Programmen systematisch finden und beheben' },
            { code: 'MI.2.2.3.e', name: 'Algorithmen', description: 'Algorithmen entwerfen, implementieren und analysieren' },
          ]
        },
        { code: 'MI.2.3.3', name: 'Informatik – Informatiksysteme', description: 'Aufbau und Funktionsweise von Informatiksystemen', level: 'Erweitert', goals: ['Netzwerke verstehen', 'Cloud Computing', 'Betriebssysteme', 'Künstliche Intelligenz Grundlagen'], sequence: ['Arbeitsblatt: Netzwerke', 'Quiz: KI Grundlagen'],
          subCompetencies: [
            { code: 'MI.2.3.3.a', name: 'Netzwerke', description: 'Aufbau und Funktion von Netzwerken (LAN, WLAN, Internet) verstehen' },
            { code: 'MI.2.3.3.b', name: 'Cloud', description: 'Cloud-Dienste und ihre Vor-/Nachteile verstehen' },
            { code: 'MI.2.3.3.c', name: 'KI', description: 'Grundlagen und Anwendungen von Künstlicher Intelligenz kennen' },
          ]
        },
      ]},
    ]
  }
]

// ============================================================
// ÜBERFACHLICHE KOMPETENZEN
// ============================================================
export const UEBERFACHLICHE_KOMPETENZEN = {
  personale: [
    { code: 'PK.1', name: 'Selbstreflexion', description: 'Eigene Stärken und Schwächen einschätzen', goals: ['Lernstand einschätzen', 'Fehler als Lernchance nutzen', 'Selbstbild entwickeln'] },
    { code: 'PK.2', name: 'Selbstständigkeit', description: 'Aufgaben selbstständig bearbeiten', goals: ['Arbeitsaufträge verstehen', 'Eigenständig Lösungswege suchen', 'Verantwortung übernehmen'] },
    { code: 'PK.3', name: 'Eigenständigkeit', description: 'Eigene Ziele setzen und verfolgen', goals: ['Lernziele formulieren', 'Strategien entwickeln', 'Ausdauer zeigen'] },
  ],
  soziale: [
    { code: 'SK.1', name: 'Dialog- und Kooperationsfähigkeit', description: 'Mit anderen zusammenarbeiten', goals: ['Aufgaben im Team lösen', 'Kompromisse finden', 'Verantwortung teilen'] },
    { code: 'SK.2', name: 'Konfliktfähigkeit', description: 'Konflikte konstruktiv lösen', goals: ['Konflikte erkennen', 'Lösungen aushandeln', 'Respektvoll kommunizieren'] },
    { code: 'SK.3', name: 'Umgang mit Vielfalt', description: 'Vielfalt respektieren und wertschätzen', goals: ['Unterschiede respektieren', 'Verschiedene Perspektiven einnehmen', 'Inklusion leben'] },
  ],
  methodische: [
    { code: 'MK.1', name: 'Sprachfähigkeit', description: 'Sprache situationsgerecht einsetzen', goals: ['Fachsprache verwenden', 'Verständlich kommunizieren', 'Präsentieren'] },
    { code: 'MK.2', name: 'Informationen nutzen', description: 'Informationen suchen, bewerten und verarbeiten', goals: ['Recherchieren', 'Quellen beurteilen', 'Informationen verarbeiten'] },
    { code: 'MK.3', name: 'Aufgaben/Probleme lösen', description: 'Aufgaben analysieren und Lösungsstrategien entwickeln', goals: ['Probleme erkennen', 'Strategien anwenden', 'Lösungen überprüfen'] },
    { code: 'MK.4', name: 'ICT-Kompetenz', description: 'Digitale Werkzeuge kompetent nutzen', goals: ['Programme bedienen', 'Digital kommunizieren', 'Verantwortungsvoll mit Daten umgehen'] },
  ]
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

// Helper: Get competency by code
export function getCompetencyByCode(code) {
  for (const cycle of LEHRPLAN_CYCLES) {
    for (const area of cycle.areas) {
      for (const comp of area.competencies) {
        if (comp.code === code) return { ...comp, cycleName: cycle.name, cycleId: cycle.id, subjectName: area.name, subjectId: area.id }
        if (comp.subCompetencies) {
          const sub = comp.subCompetencies.find(s => s.code === code)
          if (sub) return { ...sub, parentCode: comp.code, cycleName: cycle.name, cycleId: cycle.id, subjectName: area.name, subjectId: area.id }
        }
      }
    }
  }
  return null
}

// Helper: Get competencies by niveau level
export function getCompetenciesByLevel(level) {
  const results = []
  for (const cycle of LEHRPLAN_CYCLES) {
    for (const area of cycle.areas) {
      for (const comp of area.competencies) {
        if (comp.level === level) {
          results.push({ ...comp, cycleName: cycle.name, cycleId: cycle.id, subjectName: area.name, subjectId: area.id })
        }
      }
    }
  }
  return results
}

// Helper: Get learning sequence for a competency
export function getLearningSequence(code) {
  const comp = getCompetencyByCode(code)
  if (!comp) return []
  return comp.sequence || []
}

// Helper: Get all competency codes for a cycle
export function getAllCodesForCycle(cycleId) {
  const cycle = LEHRPLAN_CYCLES.find(c => c.id === cycleId)
  if (!cycle) return []
  const codes = []
  for (const area of cycle.areas) {
    for (const comp of area.competencies) {
      codes.push(comp.code)
      if (comp.subCompetencies) {
        for (const sub of comp.subCompetencies) {
          codes.push(sub.code)
        }
      }
    }
  }
  return codes
}
