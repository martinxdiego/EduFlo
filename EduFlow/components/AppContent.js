'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/ui/card'
import { Slider } from '@/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Badge } from '@/ui/badge'
import { Separator } from '@/ui/separator'
import { Alert, AlertDescription } from '@/ui/alert'
import LandingPage from './LandingPage'
import {
  BookOpen, FileText, PlusCircle, Download, Trash2, RefreshCw,
  Crown, LogOut, Sparkles, Settings, Command as CommandIcon,
  Edit, Copy, BarChart3, Zap, Upload, LayoutTemplate, GraduationCap,
  Clock, Search, Filter, ChevronRight, ChevronDown, FolderOpen,
  Info, CheckCircle2, ArrowRight,
  Target, Layers,
  User, Lightbulb,
  MoreHorizontal, Calendar, Star, X,
  Languages, ClipboardList, MessageCircle, Send,
  Minus,
  ListChecks, ToggleLeft, MessageSquare, Calculator, Image,
  ArrowLeftRight, Type, ListOrdered, GitBranch,
  ChevronUp, Save, Shuffle, Bot, CircleDot,
  Users, UserMinus, LayoutDashboard,
  Table2, School, Check
} from 'lucide-react'
import dynamic from 'next/dynamic'
import jsPDF from 'jspdf'

const DossierEditor = dynamic(() => import('@/components/dossier/DossierEditor'), { ssr: false, loading: () => <div className="h-96 bg-gray-50 rounded-lg animate-pulse" /> })
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel, UnderlineType } from 'docx'
import { saveAs } from 'file-saver'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/ui/command'
import { LEHRPLAN_CYCLES, searchCompetencies, getAllSubjects, getSubjectsForCycle, getCompetenciesForSubject, getTotalCompetencyCount } from '@/data/lehrplan21'
import { getThemeById } from '@/data/worksheetThemes'
import { DashboardView, GeneratorView, LibraryView, UploadView, SettingsView } from '@/components/views'
import { useEduFlow } from '@/contexts/EduFlowContext'
import OnboardingHint from '@/components/OnboardingHint'

// ============================================================
// CONSTANTS
// ============================================================

const RESOURCE_TYPES = [
  { id: 'worksheet', label: 'Arbeitsblatt', icon: FileText, description: 'Klassische Aufgabenblätter mit verschiedenen Fragetypen', color: 'blue' },
  { id: 'exam', label: 'Prüfung', icon: ClipboardList, description: 'Benotete Prüfung mit Punkteverteilung und Lösungsschlüssel', color: 'red' },
  { id: 'quiz', label: 'Quiz', icon: Lightbulb, description: 'Kurze Lernkontrollen mit sofortigem Feedback', color: 'green' },
  { id: 'vocabulary', label: 'Wortschatz', icon: Languages, description: 'Vokabellisten mit Übungen und Abfragen', color: 'purple' },
  { id: 'dossier', label: 'Arbeitsdossier', icon: BookOpen, description: 'Komplettes Lerndossier mit 15-20 Seiten: Theorie, Aufgaben, Lernziele und Lösungen', color: 'indigo' },
]

const SUBJECTS_PRIMAR = [
  'Deutsch', 'Mathematik', 'NMG', 'Englisch', 'Französisch',
  'Bildnerisches Gestalten', 'Musik', 'Bewegung und Sport'
]

const SUBJECTS_SEK = [
  'Deutsch', 'Mathematik', 'Französisch', 'Englisch',
  'RZG', 'Natur und Technik', 'Bildnerisches Gestalten',
  'Musik', 'TTG', 'Bewegung und Sport', 'Medien und Informatik',
  'Berufliche Orientierung', 'Projektunterricht'
]

// Legacy reference – used where no grade context is available
const SUBJECTS = [...new Set([...SUBJECTS_PRIMAR, ...SUBJECTS_SEK])]

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// Helper: subjects for a given grade
const getSubjectsForGrade = (grade) => {
  const g = parseInt(grade, 10)
  if (g >= 7) return SUBJECTS_SEK
  return SUBJECTS_PRIMAR
}

const DIFFICULTY_LABELS = {
  easy: 'Einfach',
  medium: 'Mittel',
  hard: 'Schwierig'
}

const QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Multiple Choice', icon: ListChecks, description: 'Mehrere Antwortmöglichkeiten, eine richtig', color: 'blue' },
  { id: 'true_false', label: 'Wahr oder Falsch', icon: ToggleLeft, description: 'Aussage bewerten: richtig oder falsch', color: 'green' },
  { id: 'open', label: 'Offene Frage', icon: MessageSquare, description: 'Freitext-Antwort in eigenen Worten', color: 'purple' },
  { id: 'math', label: 'Rechenfrage', icon: Calculator, description: 'Mathematische Aufgabe mit Lösungsweg', color: 'orange' },
  { id: 'image', label: 'Bilderfrage', icon: Image, description: 'Bild beschreiben, zuordnen oder analysieren', color: 'pink' },
  { id: 'matching', label: 'Zuordnung', icon: ArrowLeftRight, description: 'Begriffe oder Bilder einander zuordnen', color: 'cyan' },
  { id: 'fill_blank', label: 'Lückentext', icon: Type, description: 'Fehlende Wörter im Text ergänzen', color: 'yellow' },
  { id: 'ordering', label: 'Reihenfolge', icon: ListOrdered, description: 'Elemente in die richtige Reihenfolge bringen', color: 'indigo' },
  { id: 'either_or', label: 'Entweder-Oder', icon: GitBranch, description: 'Zwischen zwei Optionen entscheiden', color: 'red' },
  { id: 'table', label: 'Tabelle', icon: Table2, description: 'Vergleichstabelle, Zuordnung oder Ausfülltabelle', color: 'slate' },
]

const KI_ACTIONS = [
  { id: 'harder', label: 'Schwieriger machen', icon: ChevronUp, prompt: 'Mache diese Frage anspruchsvoller' },
  { id: 'easier', label: 'Einfacher machen', icon: ChevronDown, prompt: 'Vereinfache diese Frage' },
  { id: 'to_mc', label: 'In Multiple Choice', icon: ListChecks, prompt: 'Wandle in Multiple Choice um' },
  { id: 'to_open', label: 'Als offene Frage', icon: MessageSquare, prompt: 'Schreibe als offene Frage um' },
  { id: 'more_options', label: 'Mehr Optionen', icon: PlusCircle, prompt: 'Erstelle mehr Antwortmöglichkeiten' },
  { id: 'better_distractors', label: 'Bessere Falschantworten', icon: Shuffle, prompt: 'Bessere falsche Antwortoptionen' },
  { id: 'precise_answer', label: 'Lösung präziser', icon: Target, prompt: 'Formuliere die Lösung präziser' },
  { id: 'child_friendly', label: 'Kindgerechter', icon: Sparkles, prompt: 'Kindgerechter formulieren' },
  { id: 'swiss_context', label: 'CH-Schulkontext', icon: Target, prompt: 'Schweizer Schulkontext berücksichtigen' },
  { id: 'more_variety', label: 'Abwechslung', icon: Shuffle, prompt: 'Mehr Abwechslung in die Aufgabe bringen' },
]

const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'Alle' },
  { id: 'arbeitsblatt', label: 'Arbeitsblätter' },
  { id: 'pruefung', label: 'Prüfungen' },
  { id: 'quiz', label: 'Quizze' },
  { id: 'uebung', label: 'Übungen' },
  { id: 'sozial', label: 'Sozialformen' },
  { id: 'wortschatz', label: 'Wortschatz' },
  { id: 'foerderung', label: 'Förderung' },
  { id: 'digital', label: 'Digital & MI' },
]

const STARTER_TEMPLATES = [
  // ============ ARBEITSBLÄTTER ============
  // Deutsch
  { id: 't1', name: 'Leseverständnis Kurztext', topic: 'Leseverständnis: Kurztext lesen und Fragen beantworten', subject: 'Deutsch', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 6, description: 'Kurztext mit Verständnisfragen und Wortschatzübung', tags: ['Lesen', 'Wortschatz'] },
  { id: 't2', name: 'Leseverständnis Sachtext', topic: 'Sachtext lesen, Informationen entnehmen und Fragen beantworten', subject: 'Deutsch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Sachtext lesen, Informationen entnehmen und Fragen beantworten', tags: ['Lesen', 'Textarbeit'] },
  { id: 't3', name: 'Diktat-Vorlage', topic: 'Diktat: Rechtschreibtraining mit schwierigen Wörtern', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 10, description: 'Standardvorlage für wöchentliche Diktate', tags: ['Schreiben', 'Rechtschreibung'] },
  { id: 't4', name: 'Wochenplan-Aufgaben', topic: 'Wochenplan Deutsch: Gemischte Übungen zu Grammatik, Lesen, Schreiben', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 12, description: 'Gemischte Aufgaben für die Wochenplanarbeit', tags: ['Wochenplan', 'Gemischt'] },
  { id: 't5', name: 'Textanalyse Erzählung', topic: 'Erzähltext analysieren: Aufbau, Figuren, Spannungskurve', subject: 'Deutsch', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Erzähltext analysieren: Aufbau, Figuren, Spannungskurve', tags: ['Textanalyse', 'Literatur'] },
  { id: 't6', name: 'Argumentieren & Diskutieren', topic: 'Argumentieren lernen: Pro/Contra abwägen und Stellungnahme schreiben', subject: 'Deutsch', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'hard', questionCount: 6, description: 'Argumente formulieren, Pro/Contra abwägen, Stellungnahme schreiben', tags: ['Argumentieren', 'Schreiben'] },
  { id: 't7', name: 'Satzglieder bestimmen', topic: 'Satzglieder bestimmen: Subjekt, Prädikat, Objekte, Adverbiale', subject: 'Deutsch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Subjekt, Prädikat, Objekte, Adverbiale erkennen und bestimmen', tags: ['Grammatik', 'Satzglieder'] },
  { id: 't8', name: 'Bericht schreiben', topic: 'Einen Bericht schreiben: W-Fragen, sachlicher Stil, Aufbau', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 5, description: 'Aufbau und Merkmale eines Berichts üben (W-Fragen, sachlicher Stil)', tags: ['Schreiben', 'Bericht'] },
  { id: 't9', name: 'Buchstaben & Laute', topic: 'Buchstaben erkennen, Anlaute zuordnen und erste Wörter lesen', subject: 'Deutsch', grade: '1', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Buchstaben erkennen, Anlaute zuordnen, erste Wörter lesen', tags: ['Erstlesen', 'Zyklus 1'] },
  { id: 't10', name: 'Gedichte verstehen', topic: 'Gedichte lesen und verstehen: Reimschema, Stilmittel, Interpretation', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 6, description: 'Gedichte lesen, Reimschema erkennen, Stilmittel benennen', tags: ['Lyrik', 'Literatur'] },
  // Mathematik
  { id: 't11', name: 'Multiplikations-Drill', topic: 'Einmaleins-Training: Alle Reihen üben mit aufsteigender Schwierigkeit', subject: 'Mathematik', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 15, description: 'Einmaleins-Training mit aufsteigender Schwierigkeit', tags: ['Rechnen', 'Grundlagen'] },
  { id: 't12', name: 'Sachaufgaben Alltag', topic: 'Sachaufgaben: Mathematik im Alltag (Einkaufen, Messen, Vergleichen)', subject: 'Mathematik', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Textaufgaben aus dem Alltag der Schüler', tags: ['Rechnen', 'Textaufgaben'] },
  { id: 't13', name: 'Geometrie Formen', topic: 'Geometrische Formen: Erkennen, benennen und Eigenschaften beschreiben', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Formen erkennen, benennen, Eigenschaften beschreiben', tags: ['Geometrie', 'Formen'] },
  { id: 't14', name: 'Hausaufgabenblatt', topic: 'Mathematik-Hausaufgaben: Grundoperationen festigen', subject: 'Mathematik', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Kurze Hausaufgaben zur Festigung des Stoffes', tags: ['Hausaufgaben', 'Festigung'] },
  { id: 't15', name: 'Bruchrechnen Grundlagen', topic: 'Bruchrechnen: Kürzen, erweitern, addieren und subtrahieren', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 12, description: 'Brüche kürzen, erweitern, addieren und subtrahieren', tags: ['Brüche', 'Grundlagen'] },
  { id: 't16', name: 'Dezimalzahlen & Prozent', topic: 'Dezimalzahlen und Prozent: Umwandlung Bruch–Dezimal–Prozent', subject: 'Mathematik', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Umwandlung Bruch–Dezimalzahl–Prozent, Grundaufgaben', tags: ['Dezimalzahlen', 'Prozent'] },
  { id: 't17', name: 'Gleichungen lösen', topic: 'Lineare Gleichungen schrittweise lösen (mit Äquivalenzumformungen)', subject: 'Mathematik', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Lineare Gleichungen schrittweise lösen', tags: ['Algebra', 'Gleichungen'] },
  { id: 't18', name: 'Fläche & Umfang', topic: 'Fläche und Umfang berechnen: Rechteck, Quadrat, Dreieck', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Fläche und Umfang von Rechteck, Quadrat, Dreieck berechnen', tags: ['Geometrie', 'Berechnung'] },
  { id: 't19', name: 'Zahlenraum bis 100', topic: 'Addition und Subtraktion im Zahlenraum bis 100', subject: 'Mathematik', grade: '2', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 12, description: 'Addition und Subtraktion im Zahlenraum bis 100', tags: ['Rechnen', 'Zyklus 1'] },
  { id: 't20', name: 'Proportionalität & Dreisatz', topic: 'Direkte und indirekte Proportionalität, Dreisatz anwenden', subject: 'Mathematik', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'hard', questionCount: 8, description: 'Direkte und indirekte Proportionalität, Dreisatz anwenden', tags: ['Proportionalität', 'Dreisatz'] },
  // NMG
  { id: 't21', name: 'Unser Körper', topic: 'Mein Körper: Körperteile, Organe und ihre Funktionen', subject: 'NMG', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Körperteile, Organe und ihre Funktionen kennenlernen', tags: ['Körper', 'Gesundheit'] },
  { id: 't22', name: 'Tiere im Wald', topic: 'Tiere im Schweizer Wald: Nahrungsketten und Lebensräume', subject: 'NMG', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Waldtiere, Nahrungsketten, Lebensräume', tags: ['Tiere', 'Lebensraum'] },
  { id: 't23', name: 'Wetter & Klima', topic: 'Wetter und Klima: Wasserkreislauf, Wetterphänomene, Klimazonen der Schweiz', subject: 'NMG', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Wetterphänomene, Wasserkreislauf, Klimazonen der Schweiz', tags: ['Wetter', 'Klima'] },
  { id: 't24', name: 'Die Schweiz entdecken', topic: 'Die Schweiz: Kantone, Geographie, Sprachen und Kultur', subject: 'NMG', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Kantone, Geographie, Sprachen und Kultur der Schweiz', tags: ['Schweiz', 'Geographie'] },
  { id: 't25', name: 'Strom & Energie', topic: 'Strom und Energie: Stromkreis, erneuerbare Energien, Energiesparen', subject: 'NMG', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Stromkreis, erneuerbare Energien, Energiesparen im Alltag', tags: ['Energie', 'Technik'] },
  // Englisch
  { id: 't26', name: 'My Daily Routine', topic: 'My Daily Routine: Tagesablauf auf Englisch beschreiben (Present Simple)', subject: 'Englisch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Tagesablauf beschreiben, Present Simple üben', tags: ['Speaking', 'Writing'] },
  { id: 't27', name: 'Reading Comprehension', topic: 'Reading Comprehension: Englischen Text lesen und verstehen', subject: 'Englisch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Englischen Text lesen und Verständnisfragen beantworten', tags: ['Reading', 'Comprehension'] },
  { id: 't28', name: 'Past Simple Stories', topic: 'Past Simple: Regelmässige und unregelmässige Verben in Geschichten', subject: 'Englisch', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Vergangenheitsform: regelmässige und unregelmässige Verben', tags: ['Grammar', 'Past Simple'] },
  // Französisch
  { id: 't29', name: 'Se présenter', topic: 'Se présenter: Sich auf Französisch vorstellen (Name, Alter, Hobbys)', subject: 'Französisch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Sich vorstellen, Name, Alter, Hobbys auf Französisch', tags: ['Sprechen', 'Grundlagen'] },
  { id: 't30', name: 'Les verbes au présent', topic: 'Französisch Verben konjugieren: être, avoir und -er Verben im Präsens', subject: 'Französisch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 12, description: 'Verben konjugieren: être, avoir, -er Verben', tags: ['Grammatik', 'Verben'] },
  // Natur & Technik (Zyklus 3)
  { id: 't31', name: 'Zellen & Mikroskopieren', topic: 'Pflanzliche und tierische Zellen: Aufbau, Unterschiede, Mikroskopieren', subject: 'Natur und Technik', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Pflanzliche und tierische Zellen, Mikroskop-Aufbau', tags: ['Biologie', 'Zellen'] },
  { id: 't32', name: 'Periodensystem Grundlagen', topic: 'Periodensystem der Elemente: Ordnungszahl, Gruppen und Perioden', subject: 'Natur und Technik', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'hard', questionCount: 10, description: 'Elemente, Ordnungszahl, Gruppen und Perioden', tags: ['Chemie', 'PSE'] },
  { id: 't33', name: 'Kräfte & Bewegung', topic: 'Kräfte und Bewegung: Schwerkraft, Reibung, Newtonsche Gesetze', subject: 'Natur und Technik', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Schwerkraft, Reibung, Geschwindigkeit, Newtonsche Gesetze', tags: ['Physik', 'Mechanik'] },
  // RZG (Zyklus 3)
  { id: 't34', name: 'Mittelalter in der Schweiz', topic: 'Mittelalter in der Schweiz: Burgen, Ritter, Eidgenossenschaft', subject: 'RZG', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Burgen, Ritter, Stadtgründungen, Eidgenossenschaft', tags: ['Geschichte', 'Mittelalter'] },
  { id: 't35', name: 'Demokratie & Staatskunde', topic: 'Schweizer Demokratie: Gewaltenteilung, Bundesrat, Volksinitiative, Referendum', subject: 'RZG', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Gewaltenteilung, Bundesrat, Volksinitiative, Referendum', tags: ['Staatskunde', 'Politik'] },

  // ============ PRÜFUNGEN ============
  { id: 't36', name: 'Bruchrechnen Prüfung', topic: 'Prüfung Bruchrechnen: Kürzen, erweitern, Grundoperationen mit Brüchen', subject: 'Mathematik', grade: '6', type: 'exam', category: 'pruefung', difficulty: 'hard', questionCount: 12, description: 'Formale Prüfung zu Brüchen mit Notenskala', tags: ['Prüfung', 'Brüche'] },
  { id: 't37', name: 'Deutsch Grammatik-Test', topic: 'Grammatikprüfung: Zeiten, Fälle, Satzglieder bestimmen', subject: 'Deutsch', grade: '5', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 15, description: 'Grammatikprüfung: Zeiten, Fälle, Satzglieder', tags: ['Prüfung', 'Grammatik'] },
  { id: 't38', name: 'NMG Lernzielkontrolle', topic: 'NMG Lernzielkontrolle: Themenabschluss-Prüfung', subject: 'NMG', grade: '4', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 10, description: 'Themenabschluss-Prüfung für NMG', tags: ['Prüfung', 'Sachunterricht'] },
  { id: 't39', name: 'Repetitionstest Mathe', topic: 'Mathematik Repetitionstest: Gemischte Themen wiederholen', subject: 'Mathematik', grade: '5', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 15, description: 'Wiederholungsprüfung über mehrere Themen', tags: ['Repetition', 'Gemischt'] },
  { id: 't40', name: 'Schnelltest 10 Min', topic: 'Deutsch Schnelltest: Kurzüberprüfung in 10 Minuten', subject: 'Deutsch', grade: '3', type: 'exam', category: 'pruefung', difficulty: 'easy', questionCount: 5, description: 'Kurzer Schnelltest für den Stundenbeginn', tags: ['Schnelltest', 'Kurz'] },
  { id: 't41', name: 'Englisch Halbjahrsprüfung', topic: 'Englisch Halbjahrsprüfung: Vocabulary, Grammar, Reading Comprehension', subject: 'Englisch', grade: '6', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 20, description: 'Vocabulary, Grammar, Reading Comprehension', tags: ['Prüfung', 'Halbjahr'] },
  { id: 't42', name: 'Französisch Unité-Test', topic: 'Französisch Unité-Abschlusstest: Vokabeln, Grammatik, Leseverständnis', subject: 'Französisch', grade: '6', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 15, description: 'Abschlusstest einer Unité: Vokabeln, Grammatik, Leseverständnis', tags: ['Prüfung', 'Unité'] },
  { id: 't43', name: 'Algebra Lernkontrolle', topic: 'Algebra Lernkontrolle: Gleichungen, Ungleichungen, Terme vereinfachen', subject: 'Mathematik', grade: '8', type: 'exam', category: 'pruefung', difficulty: 'hard', questionCount: 10, description: 'Gleichungen, Ungleichungen, Terme vereinfachen', tags: ['Prüfung', 'Algebra'] },
  { id: 't44', name: 'Aufsatz-Prüfung', topic: 'Aufsatz schreiben: Erörterung oder Erzählung mit Bewertungskriterien', subject: 'Deutsch', grade: '7', type: 'exam', category: 'pruefung', difficulty: 'hard', questionCount: 3, description: 'Erörterung oder Erzählung schreiben mit Bewertungskriterien', tags: ['Prüfung', 'Schreiben'] },
  { id: 't45', name: 'NT Lernkontrolle Biologie', topic: 'Biologie Lernkontrolle: Zellen, Organe, Ökosysteme', subject: 'Natur und Technik', grade: '7', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 12, description: 'Zellen, Organe, Ökosysteme – Grundlagen der Biologie', tags: ['Prüfung', 'Biologie'] },

  // ============ QUIZZE ============
  { id: 't46', name: 'NMG Lernkontrolle', topic: 'NMG Quiz: Kurze Lernkontrolle zu Sachunterrichts-Themen', subject: 'NMG', grade: '4', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 10, description: 'Kurze Lernkontrolle zu NMG-Themen', tags: ['Quiz', 'Sachunterricht'] },
  { id: 't47', name: 'Wahr oder Falsch', topic: 'Wahr oder Falsch Quiz: Stimmt diese Behauptung?', subject: 'NMG', grade: '5', type: 'quiz', category: 'quiz', difficulty: 'easy', questionCount: 10, description: 'Aussagen bewerten – stimmt das wirklich?', tags: ['Quiz', 'Wahr/Falsch'] },
  { id: 't48', name: 'Kopfrechnen-Quiz', topic: 'Kopfrechnen-Quiz: Schnelles Rechnen mit aufsteigendem Schwierigkeitsgrad', subject: 'Mathematik', grade: '4', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 15, description: 'Schnelles Kopfrechnen mit aufsteigendem Schwierigkeitsgrad', tags: ['Quiz', 'Kopfrechnen'] },
  { id: 't49', name: 'Kantone-Quiz', topic: 'Schweizer Kantone Quiz: Hauptorte und Wappen erkennen', subject: 'NMG', grade: '5', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 12, description: 'Schweizer Kantone, Hauptorte und Wappen erkennen', tags: ['Quiz', 'Schweiz'] },
  { id: 't50', name: 'Englisch Irregular Verbs', topic: 'Irregular Verbs Quiz: Infinitive, Past Simple, Past Participle', subject: 'Englisch', grade: '6', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 20, description: 'Unregelmässige Verben: Infinitive, Past Simple, Past Participle', tags: ['Quiz', 'Verben'] },
  { id: 't51', name: 'Wortarten-Quiz', topic: 'Wortarten-Quiz: Nomen, Verben, Adjektive richtig zuordnen', subject: 'Deutsch', grade: '4', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 12, description: 'Nomen, Verben, Adjektive – Wörter richtig zuordnen', tags: ['Quiz', 'Grammatik'] },
  { id: 't52', name: 'Einmaleins-Blitz', topic: 'Einmaleins-Blitz: Schnelles Training aller Reihen', subject: 'Mathematik', grade: '3', type: 'quiz', category: 'quiz', difficulty: 'easy', questionCount: 20, description: 'Schnelles Einmaleins-Training mit allen Reihen', tags: ['Quiz', 'Einmaleins'] },
  { id: 't53', name: 'Tier-Quiz Schweiz', topic: 'Schweizer Tiere Quiz: Heimische Tiere erkennen und Fakten wissen', subject: 'NMG', grade: '3', type: 'quiz', category: 'quiz', difficulty: 'easy', questionCount: 10, description: 'Heimische Tiere erkennen und Fakten wissen', tags: ['Quiz', 'Tiere'] },

  // ============ SOZIALFORMEN ============
  { id: 't54', name: 'Partnerarbeit Deutsch', topic: 'Partnerarbeit Deutsch: Gegenseitig abfragen und üben', subject: 'Deutsch', grade: '5', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 6, description: 'Aufgaben für die Arbeit zu zweit – gegenseitig abfragen', tags: ['Partnerarbeit', 'Kooperativ'] },
  { id: 't55', name: 'Gruppenarbeit Forschen', topic: 'NMG Gruppenarbeit: Forschungsauftrag mit Präsentation', subject: 'NMG', grade: '5', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 5, description: 'Forschungsaufträge für Gruppen mit Präsentation', tags: ['Gruppenarbeit', 'Forschen'] },
  { id: 't56', name: 'Lernstationen Mathe', topic: 'Mathe Lernstationen: Stationsarbeit mit verschiedenen Aufgabentypen', subject: 'Mathematik', grade: '4', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 8, description: 'Stationsarbeit mit unterschiedlichen Aufgabentypen', tags: ['Stationen', 'Differenziert'] },
  { id: 't57', name: 'Lerntempoduett', topic: 'Lerntempoduett Mathematik: Zwei Niveaus kooperativ bearbeiten', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 8, description: 'Zwei Niveaus: Schnelle helfen Langsameren, alle lernen', tags: ['Kooperativ', 'Differenziert'] },
  { id: 't58', name: 'Placemat-Methode', topic: 'Placemat-Methode NMG: Erst einzeln denken, dann gemeinsam diskutieren', subject: 'NMG', grade: '6', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 4, description: 'Vierergruppen: Erst einzeln denken, dann gemeinsam diskutieren', tags: ['Placemat', 'Kooperativ'] },
  { id: 't59', name: 'Expertengruppen Jigsaw', topic: 'Jigsaw-Methode Deutsch: Jeder wird Experte für ein Teilthema', subject: 'Deutsch', grade: '7', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 6, description: 'Jigsaw-Methode: Jeder wird Experte für ein Thema', tags: ['Jigsaw', 'Kooperativ'] },

  // ============ WORTSCHATZ ============
  { id: 't60', name: 'Vokabeltest Englisch', topic: 'Englisch Vokabeltest: Wörterliste mit Übersetzungsübungen', subject: 'Englisch', grade: '5', type: 'vocabulary', category: 'wortschatz', difficulty: 'medium', questionCount: 20, description: 'Wörterliste mit Übersetzungsübungen', tags: ['Vokabeln', 'Englisch'] },
  { id: 't61', name: 'Französisch Grundwortschatz', topic: 'Französisch Grundwortschatz: Basisvokabular lernen und üben', subject: 'Französisch', grade: '5', type: 'vocabulary', category: 'wortschatz', difficulty: 'easy', questionCount: 25, description: 'Basisvokabular mit Übungen', tags: ['Vokabeln', 'Französisch'] },
  { id: 't62', name: 'Lückentext Sprache', topic: 'Deutsch Lückentext: Wortschatz und Sprachgefühl trainieren', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'wortschatz', difficulty: 'medium', questionCount: 10, description: 'Lückentext zum Wortschatz und Sprachgefühl', tags: ['Lückentext', 'Wortschatz'] },
  { id: 't63', name: 'Fachwörter NMG', topic: 'NMG Fachwörter: Fachbegriffe aus dem Sachunterricht üben', subject: 'NMG', grade: '5', type: 'vocabulary', category: 'wortschatz', difficulty: 'medium', questionCount: 15, description: 'Fachbegriffe aus dem NMG-Unterricht üben und zuordnen', tags: ['Fachbegriffe', 'NMG'] },
  { id: 't64', name: 'Fremdwörter Deutsch', topic: 'Fremdwörter verstehen und richtig verwenden', subject: 'Deutsch', grade: '7', type: 'vocabulary', category: 'wortschatz', difficulty: 'medium', questionCount: 15, description: 'Häufige Fremdwörter verstehen und richtig verwenden', tags: ['Fremdwörter', 'Wortschatz'] },
  { id: 't65', name: 'Englisch Phrasal Verbs', topic: 'Phrasal Verbs: look up, give in, turn out und weitere wichtige Ausdrücke', subject: 'Englisch', grade: '8', type: 'vocabulary', category: 'wortschatz', difficulty: 'hard', questionCount: 20, description: 'Wichtige Phrasal Verbs: look up, give in, turn out...', tags: ['Phrasal Verbs', 'Advanced'] },

  // ============ ÜBUNGEN ============
  { id: 't66', name: 'Aufsatz-Training', topic: 'Aufsatz-Training: Kriterienbasierte Schreibaufgabe mit Selbstbewertung', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 5, description: 'Kriterienbasierte Schreibaufgabe mit Selbstbewertung', tags: ['Schreiben', 'Bewertung'] },
  { id: 't67', name: 'Differenzierte Aufgaben', topic: 'Differenzierte Mathe-Aufgaben: Drei Niveaus (Basis, Erweitert, Profi)', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 12, description: 'Drei Niveaus: Basis, Erweitert, Profi', tags: ['Differenzierung', 'Niveaus'] },
  { id: 't68', name: 'Prüfungsvorbereitung', topic: 'Deutsch Prüfungsvorbereitung: Gemischte Übungen zur Repetition', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'uebung', difficulty: 'hard', questionCount: 15, description: 'Gemischte Übungen zur Prüfungsvorbereitung', tags: ['Vorbereitung', 'Repetition'] },
  { id: 't69', name: 'Rechtschreib-Training', topic: 'Rechtschreib-Training: Fehlerwörter, Doppelkonsonanten, Dehnungs-h', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 12, description: 'Häufige Fehlerwörter, Doppelkonsonanten, Dehnungs-h', tags: ['Rechtschreibung', 'Übung'] },
  { id: 't70', name: 'Terme vereinfachen', topic: 'Terme vereinfachen: Zusammenfassen, ausmultiplizieren, faktorisieren', subject: 'Mathematik', grade: '7', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 15, description: 'Terme zusammenfassen, ausmultiplizieren, faktorisieren', tags: ['Algebra', 'Terme'] },
  { id: 't71', name: 'Hörverständnis Englisch', topic: 'Englisch Hörverständnis: Listening mit Lückentexten und Multiple Choice', subject: 'Englisch', grade: '7', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 8, description: 'Übungen zum Hörverstehen mit Lückentexten und Multiple Choice', tags: ['Listening', 'Comprehension'] },

  // ============ FÖRDERUNG ============
  { id: 't72', name: 'DaZ Grundwortschatz', topic: 'Deutsch als Zweitsprache: Alltagswörter lernen und üben', subject: 'Deutsch', grade: '3', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 10, description: 'Deutsch als Zweitsprache: Alltagswörter mit Bildern', tags: ['DaZ', 'Grundwortschatz'] },
  { id: 't73', name: 'Leseförderung Silben', topic: 'Leseförderung: Silbentraining, Silbenbögen, einfache Wörter erlesen', subject: 'Deutsch', grade: '2', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 8, description: 'Silbentraining, Silbenbögen, einfache Wörter erlesen', tags: ['Leseförderung', 'Silben'] },
  { id: 't74', name: 'Dyskalkulie Übungen', topic: 'Dyskalkulie-Förderung: Mengenverständnis, Zahlzerlegung, Stellenwerte', subject: 'Mathematik', grade: '3', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 10, description: 'Grundlegendes Mengenverständnis, Zahlzerlegung, Stellenwerte', tags: ['Dyskalkulie', 'Förderung'] },
  { id: 't75', name: 'Begabtenförderung Mathe', topic: 'Begabtenförderung Mathematik: Knobelaufgaben, Logikrätsel, Muster', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'foerderung', difficulty: 'hard', questionCount: 6, description: 'Knobelaufgaben, Logikrätsel und Muster erkennen', tags: ['Begabtenförderung', 'Knobeln'] },
  { id: 't76', name: 'Lesen lernen Zyklus 1', topic: 'Lesen lernen: Erste Wörter und Sätze, Bild-Wort-Zuordnung', subject: 'Deutsch', grade: '1', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 6, description: 'Erste Wörter und Sätze lesen, Bild-Wort-Zuordnung', tags: ['Erstlesen', 'Zyklus 1'] },
  { id: 't77', name: 'LRS-Training', topic: 'LRS-Training: Visualisierung, Rechtschreibregeln, Merkwörter', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 10, description: 'Lese-Rechtschreib-Schwäche: Visualisierung, Regeln, Merkwörter', tags: ['LRS', 'Förderung'] },

  // ============ DIGITAL & MI ============
  { id: 't78', name: 'Sicher im Internet', topic: 'Internetsicherheit: Passwortsicherheit, Datenschutz, Cybermobbing', subject: 'Medien und Informatik', grade: '5', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 8, description: 'Passwortsicherheit, Datenschutz, Cybermobbing erkennen', tags: ['Medienkompetenz', 'Sicherheit'] },
  { id: 't79', name: 'Algorithmen verstehen', topic: 'Algorithmen: Einfache Algorithmen lesen, verstehen und erstellen', subject: 'Medien und Informatik', grade: '5', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 6, description: 'Einfache Algorithmen lesen, verstehen und selber erstellen', tags: ['Informatik', 'Algorithmen'] },
  { id: 't80', name: 'Fake News erkennen', topic: 'Fake News erkennen: Nachrichten prüfen, Quellen bewerten', subject: 'Medien und Informatik', grade: '7', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 8, description: 'Nachrichten prüfen, Quellen bewerten, Manipulation erkennen', tags: ['Medienkompetenz', 'Fake News'] },
  { id: 't81', name: 'Programmieren Grundlagen', topic: 'Programmieren mit Scratch: Sequenz, Schleife, Bedingung', subject: 'Medien und Informatik', grade: '6', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 6, description: 'Scratch/Blockly: Sequenz, Schleife, Bedingung verstehen', tags: ['Programmieren', 'Scratch'] },
  { id: 't82', name: 'Daten & Diagramme', topic: 'Daten und Diagramme: Sammeln, ordnen und darstellen', subject: 'Medien und Informatik', grade: '5', type: 'worksheet', category: 'digital', difficulty: 'easy', questionCount: 8, description: 'Daten sammeln, ordnen und in Diagrammen darstellen', tags: ['Daten', 'Diagramme'] },
]

// LEHRPLAN_CYCLES imported from @/data/lehrplan21

// ============================================================
// MAIN COMPONENT
// ============================================================

const AppContent = () => {
  // All state comes from centralized context (hooks + EduFlowContext)
  const {
    // Auth
    token, user, setUser, authMode, setAuthMode, authForm, setAuthForm,
    showOnboarding, setShowOnboarding, selectedTeacherType, setSelectedTeacherType,
    savingTeacherType, handleAuth: _ctxHandleAuth, handleGoogleLogin, handleLogout,
    handleSaveTeacherType: _ctxHandleSaveTeacherType,
    fetchCurrentUser, onAuthSuccess,
    // Worksheets
    worksheets, setWorksheets, selectedWorksheet, setSelectedWorksheet,
    showEditorPanel, setShowEditorPanel, fetchWorksheets,
    handleDeleteWorksheet, handleDuplicate,
    // Generation
    generating, generationProgress, streamingQuestions,
    showGenerationTheater, setShowGenerationTheater,
    handleGenerate, handleGenerateDossier,
    handleRegenerate: _ctxHandleRegenerate,
    // Editor
    worksheetStatuses, setWorksheetStatuses,
    // Settings
    settings, setSettings,
    // handleSaveSettings — defined locally below (also updates form state)
    // App state
    activeView, setActiveView, error, setError, successMessage, setSuccessMessage,
    mobileNavOpen, setMobileNavOpen, commandOpen, setCommandOpen,
    // Form
    form, setForm,
    // Dossiers
    dossiers, setDossiers, selectedDossier, setSelectedDossier, dossierSaving, setDossierSaving,
    fetchDossiers,
    // Templates
    templateSearch, setTemplateSearch, templateFilterSubject, setTemplateFilterSubject,
    templateCategory, setTemplateCategory,
    // Curriculum
    expandedCycle, setExpandedCycle, expandedArea, setExpandedArea,
    curriculumSearch, setCurriculumSearch, curriculumFilterSubject, setCurriculumFilterSubject,
    curriculumFilterCycle, setCurriculumFilterCycle, competencyTracker, setCompetencyTracker,
    showSequenceFor, setShowSequenceFor,
    // Export
    exportHistory, setExportHistory,
    // Chat
    chatOpen, setChatOpen, chatMessages, setChatMessages,
    chatInput, setChatInput, chatLoading, setChatLoading, chatEndRef,
    // Planner
    showPlanner, setShowPlanner, plannerEvents, setPlannerEvents,
    plannerMonth, setPlannerMonth, plannerYear, setPlannerYear,
    plannerView, setPlannerView, plannerWeekStart, setPlannerWeekStart,
    quickAddForm, setQuickAddForm,
    // Assignments
    assignments, setAssignments, selectedAssignment, setSelectedAssignment,
    assignmentSubmissions, setAssignmentSubmissions, errorAnalysis, setErrorAnalysis,
    analysisLoading, setAnalysisLoading, expandedSubmission, setExpandedSubmission,
    errorAnalysisOpen, setErrorAnalysisOpen, shareModalOpen, setShareModalOpen,
    shareForm, setShareForm, editingQuestion, setEditingQuestion,
    classOverview, setClassOverview, classOverviewOpen, setClassOverviewOpen,
    deleteConfirm, setDeleteConfirm, loadAssignments,
    // loadSubmissions — defined locally below (different API path + richer logic)
    // Classes
    teacherClasses, setTeacherClasses, selectedClass, setSelectedClass,
    classDetailData, setClassDetailData, newClassName, setNewClassName,
    classLoading, setClassLoading, classStats, setClassStats,
    classInsights, setClassInsights, insightsLoading, setInsightsLoading,
    loadTeacherClasses,
    // Collaboration
    comments, setComments, versions, setVersions,
    shareEmail, setShareEmail, shareRole, setShareRole,
    sharedWithMe, setSharedWithMe,
    // Gamification
    studentProgress, setStudentProgress,
    // Editor
    editMode, setEditMode, editedQuestions, setEditedQuestions,
    saveStatus, setSaveStatus, hasUnsavedChanges, setHasUnsavedChanges,
    // Library filters
    librarySearch, setLibrarySearch,
    libraryFilterSubject, setLibraryFilterSubject,
    libraryFilterGrade, setLibraryFilterGrade,
  } = useEduFlow()

  // Wrappers for context functions that use callback patterns
  const handleAuth = async (e) => {
    setError('')
    const result = await _ctxHandleAuth(e, onAuthSuccess)
    if (result && !result.success) setError(result.error)
  }

  const handleSaveTeacherType = async () => {
    await _ctxHandleSaveTeacherType(() => onAuthSuccess(token))
  }

  const handleRegenerate = async (worksheetId, newDifficulty) => {
    await _ctxHandleRegenerate(worksheetId, newDifficulty, {
      onComplete: (data) => {
        setSelectedWorksheet(data)
        fetchWorksheets(token)
        setSuccessMessage('Material wurde mit neuer Schwierigkeit neu generiert.')
      },
      onError: (msg) => setError(msg)
    })
  }

  const handleDelete = async (worksheetId) => {
    const ok = await handleDeleteWorksheet(worksheetId)
    if (ok) {
      if (selectedWorksheet?.id === worksheetId) { setSelectedWorksheet(null); setShowEditorPanel(false) }
      setSuccessMessage('Material wurde gelöscht.')
    } else {
      setError('Fehler beim Löschen.')
    }
  }

  // ============================================================
  // DOSSIERS (AppContent-only functions)
  // ============================================================

  const handleSaveDossier = async (updatedDossier) => {
    setDossierSaving(true)
    try {
      const response = await fetch(`/api/dossiers/${updatedDossier.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: updatedDossier.title,
          theme: updatedDossier.theme,
          sections: updatedDossier.sections,
          competency_codes: updatedDossier.competency_codes
        })
      })
      if (response.ok) {
        const saved = await response.json()
        setSelectedDossier(saved)
        fetchDossiers(token)
        setSuccessMessage('Dossier gespeichert.')
      } else {
        throw new Error('Speichern fehlgeschlagen')
      }
    } catch (error) {
      setError('Fehler beim Speichern des Dossiers.')
    } finally {
      setDossierSaving(false)
    }
  }

  const handleExportDossierPDF = async (dossier, version = 'student') => {
    try {
      const response = await fetch('/api/export/dossier/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ dossier, version })
      })
      if (!response.ok) throw new Error('PDF-Export fehlgeschlagen')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const versionLabel = version === 'teacher' ? 'Lehrerversion' : 'Schülerversion'
      a.download = `${dossier.title || 'Dossier'}_${versionLabel}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const exportEntry = {
        id: Date.now().toString(),
        worksheetId: dossier.id,
        worksheetTitle: dossier.title,
        format: 'PDF',
        version: versionLabel,
        exportedAt: new Date().toISOString(),
        filename: a.download
      }
      const newHistory = [exportEntry, ...exportHistory].slice(0, 50)
      setExportHistory(newHistory)
      localStorage.setItem('eduflow_export_history', JSON.stringify(newHistory))
      setSuccessMessage(`Dossier ${versionLabel} als PDF exportiert.`)
    } catch (error) {
      setError('Fehler beim PDF-Export des Dossiers.')
    }
  }

  const handleDeleteDossier = async (dossierId) => {
    try {
      await fetch(`/api/dossiers/${dossierId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      fetchDossiers(token)
      if (selectedDossier?.id === dossierId) { setSelectedDossier(null) }
      setSuccessMessage('Dossier wurde gelöscht.')
    } catch (error) { setError('Fehler beim Löschen des Dossiers.') }
  }

  // ============================================================
  // EXPORT - PDF with writing lines + Schüler/Lehrer versions
  // ============================================================

  // Sanitize text for jsPDF (replace characters outside Latin-1 that helvetica can't render)
  const sanitizePdfText = (text) => {
    if (!text) return ''
    return String(text)
      .replace(/–/g, '-')   // en-dash
      .replace(/—/g, '-')   // em-dash
      .replace(/'/g, "'")   // smart quote
      .replace(/'/g, "'")   // smart quote
      .replace(/"/g, '"')   // smart quote
      .replace(/"/g, '"')   // smart quote
      .replace(/…/g, '...')  // ellipsis
      .replace(/→/g, '->')   // arrow (used in matching)
      .replace(/✓/g, 'X')   // checkmark
      .replace(/•/g, '-')    // bullet
      .replace(/\u2610/g, '[ ]') // ballot box
      // Strip all emojis and symbols outside Latin-1 range
      .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')  // emoticons & supplemental symbols
      .replace(/[\u{2600}-\u{27BF}]/gu, '')     // misc symbols & dingbats
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')     // variation selectors
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')   // misc symbols & pictographs
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')   // chess symbols & extended
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')   // symbols extended-A
      .replace(/[\u{200D}]/gu, '')               // zero-width joiner
      .replace(/[\u{20E3}]/gu, '')               // combining enclosing keycap
      .replace(/[\u{E0020}-\u{E007F}]/gu, '')   // tags
      .trim()
  }

  const generatePDF = (worksheet, version = 'student') => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const isExam = worksheet.resourceType === 'exam' || worksheet.content?.resourceType === 'exam'
    const isQuiz = worksheet.resourceType === 'quiz' || worksheet.content?.resourceType === 'quiz'
    const isVocab = worksheet.resourceType === 'vocabulary' || worksheet.content?.resourceType === 'vocabulary'
    const showPoints = isExam
    const pdfTheme = getThemeById(worksheet.theme || form.theme || 'classic')
    const tc = pdfTheme.colors
    const tp_pdf = pdfTheme.pdf
    let yPosition = 20

    // Helper: parse hex to RGB
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return [r, g, b]
    }
    const setColor = (hex) => { const [r, g, b] = hexToRgb(hex); doc.setTextColor(r, g, b) }
    const setDrawHex = (hex) => { const [r, g, b] = hexToRgb(hex); doc.setDrawColor(r, g, b) }
    const setFillHex = (hex) => { const [r, g, b] = hexToRgb(hex); doc.setFillColor(r, g, b) }

    const checkPage = (needed = 40) => {
      if (yPosition > pageHeight - needed) {
        doc.addPage()
        yPosition = 20
        // Re-draw theme accent line at top of new page
        setFillHex(tc.accent)
        doc.rect(0, 0, pageWidth, 2, 'F')
      }
    }

    // Theme accent bar at top
    setFillHex(tc.accent)
    doc.rect(0, 0, pageWidth, 2.5, 'F')
    yPosition = 14

    // ---- EXAM HEADER ----
    if (isExam) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      doc.text('Schule: ___________________________________________', 20, yPosition)
      doc.text(`Datum: ______________`, pageWidth - 70, yPosition)
      yPosition += 10

      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      setColor(tc.primary)
      doc.text('PRÜFUNG', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.setFontSize(14)
      const titleText = worksheet.title || worksheet.content?.title || 'Prüfung'
      const titleLines = doc.splitTextToSize(titleText, pageWidth - 40)
      doc.text(titleLines, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += titleLines.length * 7 + 4

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      doc.text(`Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 7

      if (version === 'student') {
        doc.setTextColor(0, 0, 0)
        doc.setFontSize(11)
        doc.text('Vorname / Name: ______________________________________', 20, yPosition)
        yPosition += 8
        // Exam info box with theme color
        setDrawHex(tc.accent)
        doc.setLineWidth(0.8)
        setFillHex(tc.primaryLight)
        doc.roundedRect(20, yPosition, pageWidth - 40, 22, 2, 2, 'FD')
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        doc.text(`Anzahl Aufgaben: ${worksheet.content?.questions?.length || '–'}`, 25, yPosition + 7)
        doc.text(`Maximale Punktzahl: ${worksheet.content?.total_points || '–'}`, 25, yPosition + 14)
        doc.text(`Zeit: ${worksheet.content?.estimated_time || '–'}`, pageWidth / 2, yPosition + 7)
        doc.text('Erreichte Punkte: _______ ', pageWidth / 2, yPosition + 14)
        doc.setLineWidth(0.2)
        yPosition += 28
        // Grading scale
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(120, 120, 120)
        const tp = worksheet.content?.total_points || 0
        if (tp > 0) {
          doc.text(`Notenskala: 6 = ${Math.round(tp * 0.92)}–${tp}P | 5.5 = ${Math.round(tp * 0.84)}–${Math.round(tp * 0.91)}P | 5 = ${Math.round(tp * 0.76)}–${Math.round(tp * 0.83)}P | 4.5 = ${Math.round(tp * 0.68)}–${Math.round(tp * 0.75)}P | 4 = ${Math.round(tp * 0.5)}–${Math.round(tp * 0.67)}P`, 20, yPosition)
          yPosition += 6
        }
      } else {
        doc.setFontSize(9)
        doc.setTextColor(180, 0, 0)
        doc.setFont('helvetica', 'bold')
        doc.text('LEHRERVERSION – MIT LÖSUNGEN', pageWidth / 2, yPosition, { align: 'center' })
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        yPosition += 8
      }
    } else {
      // ---- WORKSHEET / QUIZ / VOCAB HEADER (Canva-inspired) ----
      // Subtle header background block
      setFillHex(tc.primaryLight)
      doc.roundedRect(15, yPosition - 8, pageWidth - 30, 32, 3, 3, 'F')

      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      setColor(tc.primary)
      const titleText = worksheet.title || worksheet.content?.title || 'Material'
      const titleLines = doc.splitTextToSize(titleText, pageWidth - 50)
      doc.text(titleLines, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += titleLines.length * 7 + 3

      // Metadata badges inline
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      const metaText = `${worksheet.grade}. Klasse  ·  ${worksheet.subject}  ·  ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`
      doc.text(metaText, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 12

      if (version === 'student') {
        doc.setTextColor(0, 0, 0)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text('Name: ___________________________________________', 20, yPosition)
        doc.text('Datum: ______________', pageWidth - 60, yPosition)
        yPosition += 10
      } else {
        doc.setFontSize(9)
        doc.setTextColor(180, 0, 0)
        doc.setFont('helvetica', 'bold')
        doc.text('LEHRERVERSION – MIT LÖSUNGEN', pageWidth / 2, yPosition, { align: 'center' })
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        yPosition += 10
      }
    }

    // Themed divider line
    setDrawHex(tc.accent)
    doc.setLineWidth(tp_pdf.headerLineWidth)
    doc.line(20, yPosition, pageWidth - 20, yPosition)
    doc.setLineWidth(0.2)
    yPosition += 10

    // Questions - type-specific rendering with theme
    worksheet.content?.questions?.forEach((q, qIdx) => {
      checkPage(60)
      const qType = q.type || (q.options ? 'multiple_choice' : 'open')

      // Question number in themed circle/badge
      setFillHex(tc.accent)
      doc.circle(22, yPosition - 1, 4, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(String(q.number), 22, yPosition + 0.5, { align: 'center' })

      // Question text - use normal weight for readability, bold only for first few words
      doc.setFontSize(10.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      const questionText = sanitizePdfText(q.question)
      const maxWidth = showPoints ? pageWidth - 60 : pageWidth - 45
      const questionLines = doc.splitTextToSize(questionText, maxWidth)
      doc.text(questionLines, 29, yPosition)

      // Themed left border spanning full question height
      const qTextHeight = questionLines.length * 5 + 2
      setFillHex(tc.questionBorder)
      doc.rect(15, yPosition - 5, 1.5, qTextHeight + 3, 'F')

      // Points badge (only for exams)
      if (showPoints) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        setColor(tc.primary)
        setFillHex(tc.primaryLight)
        const ptText = `${q.points || 1}P`
        doc.roundedRect(pageWidth - 30, yPosition - 4, 12, 6, 1, 1, 'F')
        doc.text(ptText, pageWidth - 24, yPosition, { align: 'center' })
        doc.setTextColor(0, 0, 0)
      }

      yPosition += questionLines.length * 5 + 4

      // === MC / True-False / Either-Or: clean print-friendly style ===
      if (['multiple_choice', 'true_false', 'either_or'].includes(qType) && q.options) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        yPosition += 3
        q.options.forEach((option, oi) => {
          checkPage(12)
          const letter = String.fromCharCode(65 + oi)
          const cleanOption = sanitizePdfText(option.replace(/^[A-Z]\)\s*/, ''))
          const optionLines = doc.splitTextToSize(cleanOption, pageWidth - 60)
          const optionHeight = optionLines.length * 5 + 2

          // Checkbox square with letter
          doc.setDrawColor(120, 120, 120)
          doc.setLineWidth(0.4)
          doc.rect(30, yPosition - 3.5, 4, 4)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(100, 100, 100)
          doc.text(letter, 32, yPosition - 0.3, { align: 'center' })

          // Option text
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(40, 40, 40)
          doc.text(optionLines, 38, yPosition)
          yPosition += optionHeight + 2
        })
        yPosition += 2
      }

      // === Fill in the blank: inline text with underline gaps ===
      if (qType === 'fill_blank') {
        checkPage(25)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(50, 50, 50)
        const blankedText = sanitizePdfText(q.question).replace(/___+/g, ' ________________ ')
        const fullLines = doc.splitTextToSize(blankedText, pageWidth - 50)
        fullLines.forEach(line => {
          checkPage(10)
          doc.text(line, 25, yPosition)
          yPosition += 6
        })
        if (version === 'student') {
          yPosition += 4
          setDrawHex(tp_pdf.lineColor)
          for (let i = 0; i < 2; i++) {
            checkPage(8)
            doc.line(25, yPosition, pageWidth - 25, yPosition)
            yPosition += 8
          }
        }
        yPosition += 3
      }

      // === Matching: two columns ===
      if (qType === 'matching' && q.answer) {
        checkPage(30)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(50, 50, 50)
        const pairs = (q.answer || '').split(',').filter(Boolean)
        const colLeft = 25
        const colRight = pageWidth / 2 + 10
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        setColor(tc.primary)
        doc.text('Begriff', colLeft, yPosition)
        doc.text('Zuordnung', colRight, yPosition)
        yPosition += 3
        setDrawHex(tc.accent)
        doc.setLineWidth(0.4)
        doc.line(colLeft, yPosition, pageWidth - 25, yPosition)
        doc.setLineWidth(0.2)
        yPosition += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(50, 50, 50)
        const shuffledRight = version === 'student' ? [...pairs].sort(() => 0.5 - Math.random()) : pairs
        pairs.forEach((pair, pi) => {
          checkPage(10)
          const [left] = pair.split('→').map(s => s?.trim())
          const rightPair = shuffledRight[pi] || pair
          const [, right] = rightPair.split('→').map(s => s?.trim())
          doc.text(sanitizePdfText(`${pi + 1}. ${left || ''}`), colLeft, yPosition)
          if (version === 'student') {
            doc.text(sanitizePdfText(`___  ${right || ''}`), colRight, yPosition)
          } else {
            doc.text(sanitizePdfText(`${pi + 1}. ${right || ''}`), colRight, yPosition)
          }
          yPosition += 7
        })
        yPosition += 3
      }

      // === Ordering: numbered items (shuffled for student) ===
      if (qType === 'ordering' && q.answer) {
        checkPage(30)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(50, 50, 50)
        const items = (q.answer || '').split(',').filter(Boolean).map((s, i) => ({ text: s.trim(), origIdx: i }))
        const seed = (q.number || 1) * 13 + items.length
        const displayItems = version === 'student'
          ? [...items].sort((a, b) => ((a.origIdx * 37 + seed) % 89) - ((b.origIdx * 37 + seed) % 89))
          : items
        displayItems.forEach((item, ii) => {
          checkPage(12)
          if (version === 'student') {
            setDrawHex(tc.accent)
            setFillHex(tc.primaryLight)
            doc.setLineWidth(0.3)
            doc.roundedRect(28, yPosition - 4, 8, 5, 1, 1, 'FD')
            doc.setLineWidth(0.2)
            doc.setTextColor(50, 50, 50)
            doc.text(sanitizePdfText(item.text), 40, yPosition)
          } else {
            doc.setFont('helvetica', 'bold')
            setColor(tc.primary)
            doc.text(`${ii + 1}.`, 28, yPosition)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(50, 50, 50)
            doc.text(sanitizePdfText(item.text), 36, yPosition)
          }
          yPosition += 8
        })
        yPosition += 3
      }

      // === Math: equation + answer space ===
      if (qType === 'math') {
        checkPage(45)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        if (version === 'student') {
          doc.setFontSize(9)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(120, 120, 120)
          doc.text('Rechnung / Lösungsweg:', 25, yPosition)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'normal')
          yPosition += 6
          setDrawHex(tp_pdf.lineColor)
          for (let i = 0; i < 5; i++) {
            checkPage(8)
            doc.line(25, yPosition, pageWidth - 25, yPosition)
            yPosition += 8
          }
          yPosition += 2
          setDrawHex(tc.accent)
          setFillHex(tc.primaryLight)
          doc.setLineWidth(0.5)
          doc.roundedRect(25, yPosition - 1, pageWidth - 50, 10, 2, 2, 'FD')
          doc.setLineWidth(0.2)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          setColor(tc.primary)
          doc.text('Antwort:', 28, yPosition + 6)
          doc.setTextColor(0, 0, 0)
          yPosition += 14
        }
      }

      // === Image: placeholder box with better styling ===
      if (qType === 'image') {
        checkPage(60)
        setDrawHex(tc.accent + '80')
        setFillHex(tc.primaryLight)
        doc.setLineWidth(0.3)
        const imgBoxWidth = Math.min(pageWidth - 60, 120)
        const imgBoxX = (pageWidth - imgBoxWidth) / 2
        doc.roundedRect(imgBoxX, yPosition, imgBoxWidth, 40, 3, 3, 'FD')
        // Cross lines to indicate image area
        setDrawHex(tp_pdf.lineColor)
        doc.line(imgBoxX, yPosition, imgBoxX + imgBoxWidth, yPosition + 40)
        doc.line(imgBoxX + imgBoxWidth, yPosition, imgBoxX, yPosition + 40)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(140, 140, 140)
        doc.text('[Bild hier einkleben oder einf' + String.fromCharCode(252) + 'gen]', pageWidth / 2, yPosition + 22, { align: 'center' })
        doc.setTextColor(0, 0, 0)
        doc.setLineWidth(0.2)
        yPosition += 46
        // Answer lines
        if (version === 'student') {
          doc.setFontSize(9)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(120, 120, 120)
          doc.text('Antwort:', 25, yPosition)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'normal')
          yPosition += 4
          setDrawHex(tp_pdf.lineColor)
          for (let i = 0; i < 3; i++) {
            checkPage(8)
            doc.line(25, yPosition, pageWidth - 25, yPosition)
            yPosition += 8
          }
        }
      }

      // === Table: render grid ===
      if (qType === 'table' && q.tableHeaders) {
        const headers = q.tableHeaders || []
        const rows = q.tableRows || []
        const colCount = headers.length
        const tableWidth = pageWidth - 50
        const colWidth = tableWidth / colCount
        const rowHeight = 8
        const startX = 25

        checkPage((rows.length + 1) * rowHeight + 10)
        // Header row
        doc.setFillColor(240, 240, 240)
        doc.rect(startX, yPosition, tableWidth, rowHeight, 'F')
        doc.setDrawColor(160, 160, 160)
        doc.setLineWidth(0.3)
        doc.rect(startX, yPosition, tableWidth, rowHeight, 'S')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(50, 50, 50)
        headers.forEach((h, hi) => {
          if (hi > 0) doc.line(startX + hi * colWidth, yPosition, startX + hi * colWidth, yPosition + rowHeight)
          doc.text(sanitizePdfText(h), startX + hi * colWidth + 2, yPosition + 5.5)
        })
        yPosition += rowHeight
        // Data rows
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        rows.forEach((row) => {
          checkPage(rowHeight + 2)
          doc.setDrawColor(160, 160, 160)
          doc.rect(startX, yPosition, tableWidth, rowHeight, 'S')
          row.forEach((cell, ci) => {
            if (ci > 0) doc.line(startX + ci * colWidth, yPosition, startX + ci * colWidth, yPosition + rowHeight)
            doc.text(sanitizePdfText(cell || ''), startX + ci * colWidth + 2, yPosition + 5.5)
          })
          yPosition += rowHeight
        })
        doc.setLineWidth(0.2)
        yPosition += 4
      }

      // === Open questions: writing lines ===
      if (qType === 'open' && version === 'student') {
        const pts = q.points || 1
        const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
        setDrawHex(tp_pdf.lineColor)
        for (let i = 0; i < lineCount; i++) {
          checkPage(10)
          yPosition += 8
          doc.line(25, yPosition, pageWidth - 25, yPosition)
        }
        yPosition += 5
      }

      // Generic writing lines for types without specific handler
      if (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image', 'open', 'table'].includes(qType) && version === 'student' && !q.options) {
        const pts = q.points || 1
        const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
        setDrawHex(tp_pdf.lineColor)
        for (let i = 0; i < lineCount; i++) {
          checkPage(10)
          yPosition += 8
          doc.line(25, yPosition, pageWidth - 25, yPosition)
        }
        yPosition += 5
      }

      // For teacher version: show answer with clean formatting
      if (version === 'teacher' && q.answer) {
        checkPage(20)
        const answerLabel = qType === 'fill_blank' ? 'Lücken' : qType === 'matching' ? 'Zuordnung' : qType === 'ordering' ? 'Reihenfolge' : 'Lösung'
        const answerText = sanitizePdfText(`${answerLabel}: ${q.answer}`)
        const answerLines = doc.splitTextToSize(answerText, pageWidth - 55)
        const boxHeight = answerLines.length * 5 + 6

        doc.setFillColor(240, 255, 240)
        doc.setDrawColor(0, 160, 0)
        doc.setLineWidth(0.3)
        doc.roundedRect(23, yPosition - 3, pageWidth - 46, boxHeight, 2, 2, 'FD')
        doc.setLineWidth(0.2)

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 120, 0)
        doc.text(answerLines, 27, yPosition + 2)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        yPosition += boxHeight + 3
      }

      yPosition += 6

      // Themed separator between questions
      if (isExam) {
        checkPage(10)
        setDrawHex(tp_pdf.lineColor)
        doc.setLineWidth(0.3)
        doc.line(20, yPosition, pageWidth - 20, yPosition)
        doc.setLineWidth(0.2)
        yPosition += 6
      }
    })

    // Teacher notes (teacher version only)
    if (version === 'teacher' && worksheet.content?.teacher_notes) {
      checkPage(40)
      yPosition += 10
      doc.setDrawColor(200, 200, 200)
      doc.line(20, yPosition, pageWidth - 20, yPosition)
      yPosition += 10
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Lehrernotizen', 20, yPosition)
      yPosition += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const notesLines = doc.splitTextToSize(sanitizePdfText(worksheet.content.teacher_notes), pageWidth - 40)
      notesLines.forEach(line => {
        checkPage(10)
        doc.text(line, 20, yPosition)
        yPosition += 5
      })
    }

    // Footer with theme — Canva-style info bar
    checkPage(25)
    yPosition += 10
    setFillHex(tc.primaryLight)
    setDrawHex(tc.accent + '40')
    doc.setLineWidth(0.3)
    doc.roundedRect(15, yPosition - 2, pageWidth - 30, 14, 2, 2, 'FD')
    doc.setLineWidth(0.2)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    setColor(tc.primary)
    if (showPoints) {
      doc.text(`Total: ${worksheet.content?.total_points || '–'} Punkte`, 22, yPosition + 6)
      doc.setFont('helvetica', 'normal')
      doc.text(`Geschätzte Zeit: ${worksheet.content?.estimated_time || '–'}`, pageWidth - 22, yPosition + 6, { align: 'right' })
    } else {
      doc.text(`Geschätzte Zeit: ${worksheet.content?.estimated_time || '–'}`, pageWidth / 2, yPosition + 6, { align: 'center' })
    }
    doc.setTextColor(0, 0, 0)

    // Exam: add note signature line at bottom
    if (isExam && version === 'student') {
      checkPage(30)
      yPosition += 15
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Note: ________     Unterschrift Lehrperson: ________________________________', 20, yPosition)
      yPosition += 8
      doc.text('Unterschrift Eltern: ____________________________________________', 20, yPosition)
    }

    return doc
  }

  const handleExportPDF = (worksheet, version = 'student') => {
    const doc = generatePDF(worksheet, version)
    const versionLabel = version === 'teacher' ? 'Lehrerversion' : 'Schülerversion'
    const filename = `${worksheet.title || 'material'}_${versionLabel}.pdf`
    doc.save(filename)

    const exportEntry = {
      id: Date.now().toString(),
      worksheetId: worksheet.id,
      worksheetTitle: worksheet.title,
      format: 'PDF',
      version: versionLabel,
      exportedAt: new Date().toISOString(),
      filename
    }
    const newHistory = [exportEntry, ...exportHistory].slice(0, 50)
    setExportHistory(newHistory)
    localStorage.setItem('eduflow_export_history', JSON.stringify(newHistory))
    setSuccessMessage(`${versionLabel} als PDF exportiert.`)
  }

  // ============================================================
  // DOCX EXPORT
  // ============================================================

  const generateDOCX = (worksheet, version = 'student') => {
    const isExam = worksheet.resourceType === 'exam' || worksheet.content?.resourceType === 'exam'
    const showPoints = isExam
    const questions = worksheet.content?.questions || []
    const tp = worksheet.content?.total_points || 0

    const noBorder = {
      top: { style: BorderStyle.NONE, size: 0 },
      bottom: { style: BorderStyle.NONE, size: 0 },
      left: { style: BorderStyle.NONE, size: 0 },
      right: { style: BorderStyle.NONE, size: 0 },
    }

    const thinBorder = {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    }

    const children = []

    // ---- HEADER ----
    if (isExam) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Schule: ___________________________________________', size: 20 }),
            new TextRun({ text: '     Datum: ______________', size: 20 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'PRÜFUNG', bold: true, size: 36 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: worksheet.title || worksheet.content?.title || 'Prüfung', bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, size: 20 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      )

      if (version === 'student') {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Vorname / Name: ______________________________________', size: 22 })],
            spacing: { after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              insideHorizontal: { style: BorderStyle.NONE, size: 0 },
              insideVertical: { style: BorderStyle.NONE, size: 0 },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: `Anzahl Aufgaben: ${questions.length || '–'}`, size: 18 })], spacing: { before: 40, after: 40 } })],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: `Zeit: ${worksheet.content?.estimated_time || '–'}`, size: 18 })], spacing: { before: 40, after: 40 } })],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: `Maximale Punktzahl: ${tp || '–'}`, size: 18 })], spacing: { before: 40, after: 40 } })],
                    borders: noBorder,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: 'Erreichte Punkte: _______', size: 18 })], spacing: { before: 40, after: 40 } })],
                    borders: noBorder,
                  }),
                ],
              }),
            ],
          })
        )

        if (tp > 0) {
          children.push(
            new Paragraph({
              children: [new TextRun({
                text: `Notenskala: 6 = ${Math.round(tp * 0.92)}–${tp}P | 5.5 = ${Math.round(tp * 0.84)}–${Math.round(tp * 0.91)}P | 5 = ${Math.round(tp * 0.76)}–${Math.round(tp * 0.83)}P | 4.5 = ${Math.round(tp * 0.68)}–${Math.round(tp * 0.75)}P | 4 = ${Math.round(tp * 0.5)}–${Math.round(tp * 0.67)}P`,
                size: 16, italics: true,
              })],
              spacing: { before: 100, after: 200 },
            })
          )
        }
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'LEHRERVERSION – MIT LÖSUNGEN', bold: true, size: 18, color: 'B40000' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        )
      }
    } else {
      // Worksheet / Quiz / Vocab header
      children.push(
        new Paragraph({
          children: [new TextRun({ text: worksheet.title || worksheet.content?.title || 'Material', bold: true, size: 36 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, size: 20 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      )

      if (version === 'student') {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Name: ____________________________________________     Datum: ______________', size: 22 })],
            spacing: { after: 300 },
          })
        )
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'LEHRERVERSION – MIT LÖSUNGEN', bold: true, size: 18, color: 'B40000' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          })
        )
      }
    }

    // Separator
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        spacing: { after: 200 },
      })
    )

    // ---- QUESTIONS ----
    questions.forEach((q) => {
      const qType = q.type || (q.options ? 'multiple_choice' : 'open')
      const pointsSuffix = showPoints ? `  (${q.points || 1}P)` : ''

      // Question text
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${q.number}. ${q.question}`, bold: true, size: 22 }),
            ...(showPoints ? [new TextRun({ text: pointsSuffix, size: 16 })] : []),
          ],
          spacing: { before: 240, after: 120 },
        })
      )

      // === MC / True-False / Either-Or ===
      if (['multiple_choice', 'true_false', 'either_or'].includes(qType) && q.options) {
        q.options.forEach((option, oi) => {
          const letter = String.fromCharCode(65 + oi)
          const cleanOption = option.replace(/^[A-Z]\)\s*/, '')
          if (isExam) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: '\u2610 ', size: 20 }),
                  new TextRun({ text: `${letter}) `, bold: true, size: 20 }),
                  new TextRun({ text: cleanOption, size: 20 }),
                ],
                indent: { left: 360 },
                spacing: { after: 60 },
              })
            )
          } else {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `\u25CB  ${letter}) `, bold: true, size: 20 }),
                  new TextRun({ text: cleanOption, size: 20 }),
                ],
                indent: { left: 360 },
                spacing: { after: 60 },
              })
            )
          }
        })
      }

      // === Fill in the blank ===
      if (qType === 'fill_blank') {
        const parts = q.question.split(/___+/)
        const runs = []
        parts.forEach((part, pi) => {
          if (part.trim()) runs.push(new TextRun({ text: part.trim(), size: 20 }))
          if (pi < parts.length - 1) {
            runs.push(new TextRun({ text: ' ________________________ ', size: 20, underline: { type: UnderlineType.SINGLE } }))
          }
        })
        children.push(
          new Paragraph({
            children: runs,
            indent: { left: 360 },
            spacing: { after: 120 },
          })
        )
      }

      // === Matching ===
      if (qType === 'matching' && q.answer) {
        const pairs = (q.answer || '').split(',').filter(Boolean)
        const shuffledRight = version === 'student' ? [...pairs].sort(() => 0.5 - Math.random()) : pairs

        const tableRows = [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Begriff', bold: true, size: 18 })], spacing: { before: 40, after: 40 } })],
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: thinBorder,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Zuordnung', bold: true, size: 18 })], spacing: { before: 40, after: 40 } })],
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: thinBorder,
              }),
            ],
          }),
        ]

        pairs.forEach((pair, pi) => {
          const [left] = pair.split('\u2192').map(s => s?.trim())
          const rightPair = shuffledRight[pi] || pair
          const [, right] = rightPair.split('\u2192').map(s => s?.trim())
          tableRows.push(
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: `${pi + 1}. ${left || ''}`, size: 20 })], spacing: { before: 40, after: 40 } })],
                  borders: thinBorder,
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: version === 'student' ? `___  ${right || ''}` : `${pi + 1}. ${right || ''}`, size: 20 })], spacing: { before: 40, after: 40 } })],
                  borders: thinBorder,
                }),
              ],
            })
          )
        })

        children.push(
          new Table({
            width: { size: 90, type: WidthType.PERCENTAGE },
            rows: tableRows,
          })
        )
      }

      // === Ordering ===
      if (qType === 'ordering' && q.answer) {
        const items = (q.answer || '').split(',').filter(Boolean).map(s => s.trim())
        const displayItems = version === 'student' ? [...items].sort(() => 0.5 - Math.random()) : items
        displayItems.forEach((item, ii) => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: version === 'student' ? `___  ${item}` : `${ii + 1}.  ${item}`, size: 20 })],
              indent: { left: 540 },
              spacing: { after: 60 },
            })
          )
        })
      }

      // === Math ===
      if (qType === 'math') {
        if (version === 'student') {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: 'Rechnung:', size: 20 })],
              indent: { left: 360 },
              spacing: { after: 60 },
            })
          )
          for (let i = 0; i < 4; i++) {
            children.push(
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
                indent: { left: 360 },
                spacing: { after: 120 },
                children: [new TextRun({ text: ' ', size: 20 })],
              })
            )
          }
          children.push(
            new Paragraph({
              children: [new TextRun({ text: 'Antwort: _________________________________', bold: true, size: 20 })],
              indent: { left: 360 },
              spacing: { after: 120 },
            })
          )
        }
      }

      // === Image ===
      if (qType === 'image') {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '[Bild wird hier eingefügt]', italics: true, size: 18, color: '999999' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
          })
        )
        if (version === 'student') {
          for (let i = 0; i < 3; i++) {
            children.push(
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
                indent: { left: 360 },
                spacing: { after: 120 },
                children: [new TextRun({ text: ' ', size: 20 })],
              })
            )
          }
        }
      }

      // === Open questions: writing lines ===
      if (qType === 'open' && version === 'student') {
        const pts = q.points || 1
        const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
        for (let i = 0; i < lineCount; i++) {
          children.push(
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
              indent: { left: 360 },
              spacing: { after: 120 },
              children: [new TextRun({ text: ' ', size: 20 })],
            })
          )
        }
      }

      // Generic writing lines for unknown types
      if (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image', 'open'].includes(qType) && version === 'student' && !q.options) {
        const pts = q.points || 1
        const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
        for (let i = 0; i < lineCount; i++) {
          children.push(
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
              indent: { left: 360 },
              spacing: { after: 120 },
              children: [new TextRun({ text: ' ', size: 20 })],
            })
          )
        }
      }

      // Teacher version: show answer
      if (version === 'teacher' && q.answer) {
        const answerLabel = qType === 'fill_blank' ? 'Lücken' : qType === 'matching' ? 'Zuordnung' : qType === 'ordering' ? 'Reihenfolge' : 'Lösung'
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${answerLabel}: ${q.answer}`, bold: true, size: 18, color: '008000' })],
            indent: { left: 360 },
            spacing: { before: 80, after: 80 },
            shading: { type: 'clear', fill: 'F0FFF0' },
            border: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
            },
          })
        )
      }

      // Exam separator
      if (isExam) {
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
            spacing: { after: 120 },
          })
        )
      }
    })

    // ---- TEACHER NOTES ----
    if (version === 'teacher' && worksheet.content?.teacher_notes) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
          spacing: { before: 300, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Lehrernotizen', bold: true, size: 26 })],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: worksheet.content.teacher_notes, size: 20 })],
          spacing: { after: 200 },
        })
      )
    }

    // ---- FOOTER ----
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        spacing: { before: 200, after: 120 },
      })
    )

    if (showPoints) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Total: ${worksheet.content?.total_points || '–'} Punkte | Geschätzte Zeit: ${worksheet.content?.estimated_time || '–'}`, bold: true, size: 20 })],
          spacing: { after: 120 },
        })
      )
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Geschätzte Zeit: ${worksheet.content?.estimated_time || '–'}`, bold: true, size: 20 })],
          spacing: { after: 120 },
        })
      )
    }

    // Exam signature lines
    if (isExam && version === 'student') {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Note: ________     Unterschrift Lehrperson: ________________________________', size: 18 })],
          spacing: { before: 300, after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Unterschrift Eltern: ____________________________________________', size: 18 })],
          spacing: { after: 120 },
        })
      )
    }

    return new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      }],
    })
  }

  const handleExportDOCX = async (worksheet, version = 'student') => {
    try {
      const doc = generateDOCX(worksheet, version)
      const blob = await Packer.toBlob(doc)
      const versionLabel = version === 'teacher' ? 'Lehrerversion' : 'Schülerversion'
      const filename = `${worksheet.title || 'material'}_${versionLabel}.docx`
      saveAs(blob, filename)

      const exportEntry = {
        id: Date.now().toString(),
        worksheetId: worksheet.id,
        worksheetTitle: worksheet.title,
        format: 'DOCX',
        version: versionLabel,
        exportedAt: new Date().toISOString(),
        filename
      }
      const newHistory = [exportEntry, ...exportHistory].slice(0, 50)
      setExportHistory(newHistory)
      localStorage.setItem('eduflow_export_history', JSON.stringify(newHistory))
      setSuccessMessage(`${versionLabel} als Word exportiert.`)
    } catch (err) {
      console.error('DOCX export error:', err)
      setError('Fehler beim Word-Export.')
    }
  }

  const handleUpgrade = async () => {
    try {
      const response = await fetch('/api/subscribe/premium', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } })
      if (response.ok) { fetchCurrentUser(token); setSuccessMessage('Erfolgreich auf Premium aktualisiert!') }
    } catch (error) { setError('Fehler beim Upgrade.') }
  }

  // ============================================================
  // CHAT ASSISTANT
  // ============================================================

  const handleChatSend = async (directMessage) => {
    const message = (typeof directMessage === 'string' && directMessage) ? directMessage : chatInput
    if (!message || !message.trim()) return
    const userMsg = { role: 'user', content: message }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const worksheetContext = selectedWorksheet ? {
        title: selectedWorksheet.title,
        subject: selectedWorksheet.subject,
        grade: selectedWorksheet.grade,
        difficulty: selectedWorksheet.difficulty,
        questionCount: selectedWorksheet.content?.questions?.length || 0,
        questionTypes: [...new Set((selectedWorksheet.content?.questions || []).map(q => q.type).filter(Boolean))].join(', ')
      } : null

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          message,
          worksheetContext,
          chatHistory: chatMessages.slice(-10)
        })
      })

      if (response.ok) {
        const data = await response.json()
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        // Fallback to local responses if API fails
        setChatMessages(prev => [...prev, { role: 'assistant', content: getLocalChatResponse(message, selectedWorksheet) }])
      }
    } catch (err) {
      // Fallback to local responses on network error
      setChatMessages(prev => [...prev, { role: 'assistant', content: getLocalChatResponse(message, selectedWorksheet) }])
    }
    setChatLoading(false)
  }

  // Track last response to avoid repetition
  const lastChatResponseRef = useRef('')

  // Pick a non-repeating response from array
  const pickUnique = (responses) => {
    const filtered = responses.filter(r => r !== lastChatResponseRef.current)
    const pick = filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : responses[0]
    lastChatResponseRef.current = pick
    return pick
  }

  // Smart contextual chat responses
  const getLocalChatResponse = (input, worksheet) => {
    const lower = input.toLowerCase()
    const qCount = worksheet?.content?.questions?.length || 0
    const wsTitle = worksheet?.title || ''
    const wsSubject = worksheet?.subject || ''

    // Difficulty
    if (lower.includes('einfacher') || lower.includes('leichter') || lower.includes('vereinfach')) {
      if (worksheet) {
        return pickUnique([
          `Klar! Für "${wsTitle}" können Sie:\n\n1. Im Werkzeuge-Panel rechts auf "Einfach" klicken – dann werden alle ${qCount} Fragen neu generiert\n2. Oder: "Bearbeiten" klicken und bei einzelnen Fragen die KI-Aktion "Einfacher machen" nutzen\n\nWas passt besser?`,
          `Gerne! Ich empfehle, zuerst in den Bearbeitungsmodus zu wechseln. Dort hat jede Frage einen "Einfacher machen"-Button. So können Sie gezielt die Fragen anpassen, die Ihren Schülern Mühe machen.`,
        ])
      }
      return 'Erstellen Sie zuerst ein Material, dann können Sie es einfacher machen – entweder komplett über das Werkzeuge-Panel oder einzelne Fragen im Bearbeitungsmodus.'
    }
    if (lower.includes('schwieriger') || lower.includes('schwerer') || lower.includes('anspruchsvoll')) {
      if (worksheet) {
        return pickUnique([
          `"${wsTitle}" anspruchsvoller gestalten? So geht's:\n\n• Werkzeuge-Panel → "Schwierig" für komplett neue Fragen\n• Bearbeitungsmodus → "Schwieriger machen" pro Frage\n• Oder: Offene Fragen statt Multiple Choice einfügen\n\nSoll ich eine bestimmte Frage schwieriger machen?`,
          `Gute Idee! Im Bearbeitungsmodus können Sie jede der ${qCount} Fragen einzeln schwieriger machen. Tipp: Wandeln Sie einige MC-Fragen in offene Fragen um – das steigert die Schwierigkeit automatisch.`,
        ])
      }
      return 'Erstellen Sie zuerst ein Material, dann kann ich den Schwierigkeitsgrad anpassen.'
    }

    // Export
    if (lower.includes('export') || lower.includes('pdf') || lower.includes('herunterladen') || lower.includes('download')) {
      return pickUnique([
        'Sie haben zwei Export-Optionen:\n\n📄 Schülerversion – Sauberes Layout mit Schreiblinien, Name/Datum-Feld, ohne Lösungen\n📋 Lehrerversion – Enthält alle Lösungen (grün markiert) und Lehrernotizen\n\nBeide als PDF über den "PDF"-Button oben oder das Werkzeuge-Panel rechts.',
        'Klicken Sie auf den "PDF"-Button oben in der Aktionsleiste für einen schnellen Export. Im Werkzeuge-Panel rechts finden Sie beide Versionen: Schüler (sauber) und Lehrer (mit Lösungen).',
      ])
    }

    // Edit / Bearbeiten
    if (lower.includes('bearbeiten') || lower.includes('ändern') || lower.includes('editieren')) {
      if (worksheet) {
        return pickUnique([
          `Klicken Sie oben auf "Bearbeiten" – dann öffnet sich der volle Editor für "${wsTitle}":\n\n✏️ Fragen umformulieren und umschreiben\n🔄 Fragetyp ändern (z.B. MC → Offene Frage)\n➕ Neue Fragen jedes Typs hinzufügen\n🤖 KI-Aktionen pro Frage nutzen\n↕️ Fragen verschieben oder duplizieren\n\nNach dem Bearbeiten → "Speichern & Vorschau"`,
          `Im Bearbeitungsmodus von "${wsTitle}" haben Sie volle Kontrolle:\n\n• Jede Frage hat KI-Aktionen (schwieriger, einfacher, umwandeln...)\n• Fragetyp-Wechsel per Dropdown\n• Drag-Reihenfolge ändern\n• "Als Entwurf" speichern wenn Sie noch nicht fertig sind`,
        ])
      }
      return 'Wählen oder erstellen Sie zuerst ein Material, dann erscheint der "Bearbeiten"-Button oben links.'
    }

    // Lehrplan
    if (lower.includes('lehrplan') || lower.includes('kompetenz') || lower.includes('curriculum')) {
      return pickUnique([
        'Unter "Lehrplan 21" finden Sie alle Kompetenzbereiche nach Zyklen:\n\n🔵 Zyklus 1 (1.–2. Klasse)\n🟢 Zyklus 2 (3.–6. Klasse)\n🟣 Zyklus 3 (7.–9. Klasse)\n\nKlicken Sie auf eine Kompetenz → "Material erstellen" und die KI generiert Aufgaben, die genau auf diese Kompetenz abgestimmt sind.',
        'Der Lehrplan-21-Bereich ist perfekt, um gezielt Material nach Kompetenz zu erstellen. Navigieren Sie zu "Lehrplan 21", wählen Sie den Zyklus und das Fach – jede Kompetenz hat einen direkten "Material erstellen"-Button.',
      ])
    }

    // Questions
    if (lower.includes('frage') && (lower.includes('hinzufügen') || lower.includes('mehr') || lower.includes('zusätzlich'))) {
      if (worksheet) {
        return `So fügen Sie Fragen zu "${wsTitle}" hinzu:\n\n1. Klicken Sie auf "Bearbeiten"\n2. Scrollen Sie nach unten zu "Frage hinzufügen"\n3. Wählen Sie den gewünschten Fragetyp\n4. Bearbeiten Sie die neue Frage\n\nVerfügbare Fragetypen: Multiple Choice, Wahr/Falsch, Offene Frage, Rechenfrage, Lückentext, Zuordnung, Reihenfolge, Entweder-Oder, Bilderfrage.`
      }
      return 'Nutzen Sie den Slider beim Erstellen, um die Fragenanzahl anzupassen (3–25 Fragen). Sie können auch die gewünschten Fragetypen vorab wählen!'
    }

    // Upload
    if (lower.includes('hochladen') || lower.includes('upload') || lower.includes('datei')) {
      return pickUnique([
        'Unter "Hochladen" können Sie verschiedene Dateitypen verwenden:\n\n📄 PDF, Word, PowerPoint, Text\n🖼️ Bilder (PNG, JPG, GIF, WebP)\n🎵 Audio (MP3, WAV, M4A)\n📊 Excel, CSV\n\nDie KI analysiert den Inhalt und Sie wählen dann, was daraus erstellt werden soll.',
        'Gehen Sie zu "Hochladen", ziehen Sie Ihre Dateien rein und klicken Sie auf "Analysieren". Danach können Sie wählen: Arbeitsblatt, Prüfung, Quiz oder Vokabelliste – alles basierend auf Ihrem Material.',
      ])
    }

    // Prüfung / Exam
    if (lower.includes('prüfung') || lower.includes('test') || lower.includes('exam') || lower.includes('klausur')) {
      return pickUnique([
        'Prüfungen in EduFlow sind professionell aufgebaut:\n\n📋 Formaler Prüfungskopf (Schule, Name, Datum)\n🔢 Punkteverteilung pro Aufgabe\n📊 Schweizer Notenskala (1–6)\n✍️ Antwortboxen und Schreiblinien\n✅ Unterschriftenfelder\n\nWählen Sie beim Erstellen den Typ "Prüfung" – die KI strukturiert alles automatisch.',
        'Wählen Sie bei "Erstellen" den Materialtyp "Prüfung". Das Layout enthält dann automatisch: Prüfungskopf, Punkteverteilung, Notenskala und Unterschriftenfelder. Soll ich Ihnen dabei helfen?',
      ])
    }

    // Greeting
    if (lower.includes('hallo') || lower.includes('hi') || lower.includes('hey') || lower.includes('guten')) {
      return pickUnique([
        `Hallo! Schön, dass Sie da sind. 🎒 ${worksheet ? `Ich sehe, Sie arbeiten an "${wsTitle}". Soll ich Ihnen dabei helfen – Fragen anpassen, Schwierigkeit ändern, oder exportieren?` : 'Was möchten Sie heute vorbereiten? Ich kann Arbeitsblätter, Prüfungen, Quizze und Vokabellisten erstellen.'}`,
        `Grüezi! ${worksheet ? `"${wsTitle}" sieht gut aus! Brauchen Sie Hilfe beim Bearbeiten oder Exportieren?` : 'Was steht heute auf dem Programm? Ich bin bereit, Ihnen den Schulalltag zu erleichtern.'}`,
        `Willkommen bei EduFlow! ${worksheet ? `Ich kann "${wsTitle}" für Sie optimieren – sagen Sie einfach, was geändert werden soll.` : 'Wie kann ich Ihnen helfen? Sagen Sie mir ein Thema und ich erstelle passendes Material.'}`,
      ])
    }

    // Thanks
    if (lower.includes('danke') || lower.includes('merci') || lower.includes('super') || lower.includes('toll')) {
      return pickUnique([
        `Gerne geschehen! ${worksheet ? `Tipp: Im Bearbeitungsmodus können Sie jede Frage in "${wsTitle}" noch feinjustieren. Oder soll ich eine differenzierte Version erstellen?` : 'Soll ich noch etwas für Sie vorbereiten?'}`,
        `Freut mich! ${worksheet ? `Sie können "${wsTitle}" jetzt als PDF exportieren (Schüler- oder Lehrerversion) oder weiter bearbeiten.` : 'Falls Sie eine Idee für den Unterricht brauchen – fragen Sie einfach!'}`,
        `Bitte sehr! Wussten Sie, dass EduFlow 9 verschiedene Fragetypen unterstützt? Probieren Sie mal Lückentext, Zuordnung oder Reihenfolge-Fragen aus!`,
      ])
    }

    // Tip / general
    if (lower.includes('tipp') || lower.includes('idee') || lower.includes('vorschlag')) {
      return pickUnique([
        `Hier ein paar Profi-Tipps:\n\n💡 Je genauer das Thema, desto besser – z.B. "Bauernleben im Mittelalter" statt nur "Mittelalter"\n💡 Im Bearbeitungsmodus: KI-Aktionen pro Frage nutzen\n💡 Mischen Sie Fragetypen für abwechslungsreiche Arbeitsblätter\n💡 Speichern Sie als Entwurf, wenn Sie noch nicht fertig sind`,
        `Drei Ideen für diese Woche:\n\n1. 🧩 Erstellen Sie ein Quiz mit Wahr/Falsch-Fragen als Stundeneinstieg\n2. 📝 Kombinieren Sie Lückentext mit offenen Fragen\n3. 🔄 Erstellen Sie differenzierte Versionen: Leicht, Mittel, Schwer\n\nSoll ich eines davon direkt umsetzen?`,
        `${worksheet ? `Für "${wsTitle}" schlage ich vor:\n\n• Fügen Sie 2-3 Zuordnungsfragen hinzu\n• Erstellen Sie eine Lehrerversion als PDF\n• Nutzen Sie "Als Entwurf speichern" wenn Sie noch nicht fertig sind` : 'Starten Sie mit einer Vorlage unter "Vorlagen" – das geht am schnellsten! Sie können danach alles im Bearbeitungsmodus anpassen.'}`,
      ])
    }

    // Material erstellen
    if (lower.includes('arbeitsblatt') || lower.includes('erstellen') || lower.includes('neues material') || lower.includes('generieren')) {
      if (worksheet) {
        return pickUnique([
          `Sie haben "${wsTitle}" (${wsSubject}, ${qCount} Fragen) offen. Möchten Sie:\n\n✏️ Im Bearbeitungsmodus optimieren?\n🆕 Ein neues Material zum gleichen Thema?\n📊 Die Schwierigkeit anpassen?\n📥 Als PDF exportieren?\n\nOder geben Sie mir ein neues Thema!`,
          `"${wsTitle}" ist bereit! Sie können:\n\n• Oben auf "Neues Material" klicken für etwas Neues\n• "Bearbeiten" für Feinjustierung\n• "PDF" für den Export\n\nWas soll es sein?`,
        ])
      }
      return 'Gehen Sie zu "Erstellen" in der Navigation. Wählen Sie Thema, Klasse, Fach und Fragetypen – die KI erstellt in Sekunden passendes Material!\n\n💡 Tipp: Unter "Vorlagen" finden Sie vorgefertigte Strukturen für den schnellen Start.'
    }

    // Differenzierung
    if (lower.includes('differenz') || lower.includes('niveau')) {
      return pickUnique([
        'Differenzierung in 3 Schritten:\n\n1️⃣ Erstellen Sie ein Material auf mittlerem Niveau\n2️⃣ Bearbeitungsmodus → einzelne Fragen "Einfacher machen"\n3️⃣ Neues Material mit Schwierigkeit "Schwierig" erstellen\n\nSo haben Sie schnell 3 Niveaus. Soll ich damit starten?',
        'Im Bearbeitungsmodus können Sie jede Frage einzeln anpassen:\n\n• "Einfacher machen" für schwächere Schüler\n• "Schwieriger machen" für stärkere Schüler\n• Fragetyp wechseln (z.B. offene Frage → MC)\n\nSo differenzieren Sie innerhalb eines Arbeitsblatts!',
      ])
    }

    // Fragetypen
    if (lower.includes('fragetyp') || lower.includes('fragen')) {
      return 'EduFlow unterstützt 9 Fragetypen:\n\n📝 Multiple Choice • ✅ Wahr/Falsch\n💬 Offene Frage • 🧮 Rechenfrage\n🖼️ Bilderfrage • 🔗 Zuordnung\n📝 Lückentext • 📋 Reihenfolge\n⚡ Entweder-Oder\n\nSie können beim Erstellen gewünschte Typen vorauswählen oder im Bearbeitungsmodus nachträglich ändern.'

    }

    // Default - context-aware, non-repeating
    const defaults = [
      `${worksheet ? `Ich arbeite gerade mit Ihnen an "${wsTitle}". ` : ''}Was kann ich für Sie tun? Ich helfe bei:\n\n📝 Material erstellen & bearbeiten\n📊 Schwierigkeit anpassen\n📥 PDF exportieren (Schüler- & Lehrerversion)\n💡 Ideen und Tipps für den Unterricht\n\nFragen Sie einfach drauflos!`,
      `${worksheet ? `"${wsTitle}" hat ${qCount} Fragen in ${wsSubject}. ` : ''}Hier ein paar Möglichkeiten:\n\n• Neues Material erstellen lassen\n• Vorlagen durchstöbern\n• Bestehendes Material optimieren\n• Lehrplan-21-Kompetenzen nutzen\n\nWomit soll ich starten?`,
      `Ich bin Ihr EduFlow-Assistent und helfe Ihnen bei allem rund um Unterrichtsmaterial. ${worksheet ? `Aktuell offen: "${wsTitle}". Soll ich etwas daran anpassen?` : 'Geben Sie mir ein Thema und eine Klassenstufe – ich erstelle sofort passendes Material!'}`
    ]
    return pickUnique(defaults)
  }

  // ============================================================
  // EDIT MODE
  // ============================================================

  const startEditMode = () => {
    if (selectedWorksheet?.content?.questions) {
      setEditedQuestions(JSON.parse(JSON.stringify(selectedWorksheet.content.questions)))
      setEditMode(true)
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setShowPostCreationBar(false)
    }
  }

  const markUnsaved = () => {
    setHasUnsavedChanges(true)
    setSaveStatus('unsaved')
  }

  const saveEdits = async () => {
    if (selectedWorksheet && editedQuestions.length > 0) {
      setSaveStatus('saving')
      const totalPoints = editedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
      const updatedContent = {
        ...selectedWorksheet.content,
        questions: editedQuestions,
        total_points: totalPoints
      }
      const updated = { ...selectedWorksheet, content: updatedContent }

      // Persist to DB
      try {
        const res = await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ content: updatedContent, title: selectedWorksheet.title })
        })
        if (!res.ok) throw new Error('Save failed')
      } catch (err) {
        console.error('Save error:', err)
        setError('Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.')
        setSaveStatus('unsaved')
        return
      }

      setSelectedWorksheet(updated)
      setWorksheets(prev => prev.map(ws => ws.id === updated.id ? updated : ws))
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setEditMode(false)
      setEditedQuestions([])
      setUseRichEditor(false)
      setSuccessMessage('Gespeichert! Vorschau wird angezeigt.')
    }
  }

  // Autosave is handled by EduFlowContext (setupAutosave)

  const saveDraft = async () => {
    if (selectedWorksheet && editedQuestions.length > 0) {
      setSaveStatus('saving')
      const totalPoints = editedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
      const updatedContent = { ...selectedWorksheet.content, questions: editedQuestions, total_points: totalPoints }
      const updated = { ...selectedWorksheet, content: updatedContent }

      // Persist to DB
      try {
        await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ content: updatedContent, status: 'draft' })
        })
      } catch (err) {
        console.error('Draft save error:', err)
      }

      setSelectedWorksheet(updated)
      setWorksheets(prev => prev.map(ws => ws.id === updated.id ? updated : ws))
      setWorksheetStatuses(prev => ({ ...prev, [updated.id]: 'draft' }))
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setEditMode(false)
      setEditedQuestions([])
      setSuccessMessage('Als Entwurf gespeichert. Sie können jederzeit weiterarbeiten.')
    }
  }

  const getWorksheetStatus = (wsId) => worksheetStatuses[wsId] || 'complete'

  const startNewMaterial = () => {
    setSelectedWorksheet(null)
    setShowEditorPanel(false)
    setEditMode(false)
    setEditedQuestions([])
    setShowPostCreationBar(false)
    setForm({ topic: '', grade: form.grade, subject: form.subject, difficulty: form.difficulty, questionCount: form.questionCount, resourceType: 'worksheet', dyslexiaFont: false })
    setActiveView('create')
  }

  const cancelEdits = () => {
    setEditMode(false)
    setEditedQuestions([])
    setHasUnsavedChanges(false)
    setSaveStatus('saved')
  }

  const updateEditedQuestion = (index, field, value) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    markUnsaved()
  }

  const updateEditedOption = (qIndex, optIndex, value) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const options = [...(updated[qIndex].options || [])]
      options[optIndex] = value
      updated[qIndex] = { ...updated[qIndex], options }
      return updated
    })
    markUnsaved()
  }

  const addOptionToQuestion = (qIndex) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const options = [...(updated[qIndex].options || [])]
      const letter = String.fromCharCode(65 + options.length) // A, B, C, D...
      options.push(`${letter}) Neue Option`)
      updated[qIndex] = { ...updated[qIndex], options }
      return updated
    })
    markUnsaved()
  }

  const removeOptionFromQuestion = (qIndex, optIndex) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const options = [...(updated[qIndex].options || [])].filter((_, i) => i !== optIndex)
      updated[qIndex] = { ...updated[qIndex], options: options.length > 0 ? options : undefined }
      return updated
    })
    markUnsaved()
  }

  const addQuestionOfType = (type, afterIndex = -1) => {
    const templates = {
      multiple_choice: { question: 'Neue Multiple-Choice-Frage', options: ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'], answer: 'A) Option 1', type: 'multiple_choice' },
      true_false: { question: 'Neue Wahr-oder-Falsch-Aussage', options: ['A) Wahr', 'B) Falsch'], answer: 'A) Wahr', type: 'true_false' },
      open: { question: 'Neue offene Frage', answer: 'Beispielantwort', type: 'open' },
      math: { question: 'Berechne: ', answer: '', type: 'math' },
      image: { question: 'Beschreibe das folgende Bild:', answer: '', type: 'image' },
      matching: { question: 'Ordne die folgenden Begriffe richtig zu:', answer: '', type: 'matching' },
      fill_blank: { question: 'Ergänze die Lücken: Der ___ ist ein ___ Tier.', answer: 'Hund, treues', type: 'fill_blank' },
      ordering: { question: 'Bringe die folgenden Schritte in die richtige Reihenfolge:', answer: '', type: 'ordering' },
      either_or: { question: 'Wähle die richtige Aussage:', options: ['A) Erste Aussage', 'B) Zweite Aussage'], answer: 'A) Erste Aussage', type: 'either_or' },
      table: { question: 'Fülle die Tabelle aus:', answer: '', type: 'table', tableHeaders: ['Spalte 1', 'Spalte 2', 'Spalte 3'], tableRows: [['', '', ''], ['', '', '']] },
    }
    const template = templates[type] || templates.open
    setEditedQuestions(prev => {
      const insertAt = afterIndex >= 0 ? afterIndex + 1 : prev.length
      const newQ = { ...template, number: insertAt + 1, points: 1 }
      const result = [...prev.slice(0, insertAt), newQ, ...prev.slice(insertAt)]
      return result.map((q, i) => ({ ...q, number: i + 1 }))
    })
    setShowQuestionTypeSelector(false)
    markUnsaved()
  }

  const removeQuestion = (index) => {
    setEditedQuestions(prev => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, number: i + 1 })))
    markUnsaved()
  }

  const duplicateQuestion = (index) => {
    setEditedQuestions(prev => {
      const dup = { ...JSON.parse(JSON.stringify(prev[index])) }
      const result = [...prev.slice(0, index + 1), dup, ...prev.slice(index + 1)]
      return result.map((q, i) => ({ ...q, number: i + 1 }))
    })
    markUnsaved()
  }

  const moveQuestion = (index, direction) => {
    setEditedQuestions(prev => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.length) return prev
      const updated = [...prev]
      const temp = updated[index]
      updated[index] = updated[newIndex]
      updated[newIndex] = temp
      return updated.map((q, i) => ({ ...q, number: i + 1 }))
    })
    markUnsaved()
  }

  const changeQuestionType = (index, newType) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const q = { ...updated[index], type: newType }
      // Add or remove options based on type
      if (['multiple_choice', 'true_false', 'either_or'].includes(newType) && !q.options) {
        if (newType === 'true_false') q.options = ['A) Wahr', 'B) Falsch']
        else if (newType === 'either_or') q.options = ['A) Erste Aussage', 'B) Zweite Aussage']
        else q.options = ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4']
      }
      if (['open', 'math', 'image', 'fill_blank', 'ordering', 'matching'].includes(newType)) {
        delete q.options
      }
      updated[index] = q
      return updated
    })
    markUnsaved()
  }

  // KI action on single question - uses real OpenAI API
  const handleKiAction = async (questionIndex, actionId) => {
    setKiActionLoading(true)
    setActiveKiAction({ questionIndex, actionId })

    const question = editedQuestions[questionIndex]
    const worksheetContext = selectedWorksheet ? {
      subject: selectedWorksheet.subject,
      grade: selectedWorksheet.grade,
      difficulty: selectedWorksheet.difficulty,
    } : null

    try {
      const response = await fetch('/api/ki-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ question, actionId, worksheetContext })
      })

      if (response.ok) {
        const data = await response.json()
        const updatedQ = data.question
        setEditedQuestions(prev => {
          const updated = [...prev]
          updated[questionIndex] = {
            ...updated[questionIndex],
            question: updatedQ.question || updated[questionIndex].question,
            type: updatedQ.type || updated[questionIndex].type,
            options: updatedQ.options || ((['multiple_choice', 'true_false', 'either_or'].includes(updatedQ.type)) ? updated[questionIndex].options : undefined),
            answer: updatedQ.answer || updated[questionIndex].answer,
            points: updatedQ.points || updated[questionIndex].points,
          }
          // Remove options for types that don't need them
          if (['open', 'math', 'image', 'fill_blank', 'ordering', 'matching'].includes(updatedQ.type)) {
            delete updated[questionIndex].options
          }
          return updated
        })
        markUnsaved()
        setSuccessMessage(`KI-Aktion "${KI_ACTIONS.find(a => a.id === actionId)?.label}" ausgeführt.`)
      } else {
        // Fallback: simple local transformations
        handleKiActionLocal(questionIndex, actionId)
      }
    } catch (err) {
      // Fallback on network error
      handleKiActionLocal(questionIndex, actionId)
    }

    setKiActionLoading(false)
    setActiveKiAction(null)
  }

  // Local fallback for KI actions when API is unavailable
  const handleKiActionLocal = (questionIndex, actionId) => {
    setEditedQuestions(prev => {
      const updated = [...prev]
      const q = { ...updated[questionIndex] }
      switch (actionId) {
        case 'harder':
          q.question = q.question.replace(/\?$/, '? Begründe deine Antwort ausführlich.')
          if (q.points) q.points = Math.min(q.points + 1, 10)
          break
        case 'easier':
          q.question = q.question.replace(/ Begründe.*$/, '?').replace(/\?\?/, '?')
          break
        case 'to_mc':
          if (!q.options) {
            q.options = ['A) Mögliche Antwort 1', 'B) Mögliche Antwort 2', 'C) Mögliche Antwort 3', 'D) Mögliche Antwort 4']
            q.type = 'multiple_choice'
          }
          break
        case 'to_open':
          delete q.options
          q.type = 'open'
          break
        default:
          break
      }
      updated[questionIndex] = q
      return updated
    })
    markUnsaved()
    setSuccessMessage(`KI-Aktion "${KI_ACTIONS.find(a => a.id === actionId)?.label}" ausgeführt (lokal).`)
  }

  // ============================================================
  // IMAGE GENERATION
  // ============================================================

  const handleGenerateImage = async (questionIndex, prompt, style = 'educational') => {
    if (!prompt.trim()) return
    setImageGenerating(true)
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt, style })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.imageUrl) {
          updateEditedQuestion(questionIndex, 'imageUrl', data.imageUrl)
          setSuccessMessage('Bild wurde erfolgreich generiert!')
        }
      } else {
        const err = await response.json().catch(() => ({}))
        setError(err.error || 'Bildgenerierung fehlgeschlagen.')
      }
    } catch (err) {
      console.error('Image gen error:', err)
      setError('Bildgenerierung fehlgeschlagen. Bitte versuchen Sie es erneut.')
    }
    setImageGenerating(false)
  }

  // ============================================================
  // SCHULJAHRESPLANER
  // ============================================================

  // Load planner events
  useEffect(() => {
    const saved = localStorage.getItem('eduflow_planner_events')
    if (saved) { try { setPlannerEvents(JSON.parse(saved)) } catch(e) {} }
  }, [])

  // Save planner events
  useEffect(() => {
    if (plannerEvents.length > 0) {
      localStorage.setItem('eduflow_planner_events', JSON.stringify(plannerEvents))
    }
  }, [plannerEvents])

  const addPlannerEvent = (date, title, type = 'material', competencyCode = '', subject = '') => {
    const newEvent = {
      id: Date.now().toString(),
      date,
      title,
      type, // 'material', 'exam', 'deadline', 'holiday', 'lesson', 'project'
      subject,
      competencyCode,
      createdAt: new Date().toISOString()
    }
    setPlannerEvents(prev => [...prev, newEvent])
  }

  const SUBJECT_COLORS = {
    'Deutsch': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
    'Mathematik': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
    'NMG': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
    'Englisch': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    'Französisch': { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
    'Bildnerisches Gestalten': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
    'Musik': { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
    'Bewegung und Sport': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  }

  const getWeekDays = (startDate) => {
    const days = []
    const start = new Date(startDate)
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      days.push({ day: d.getDate(), date: dateStr, dayName: d.toLocaleDateString('de-CH', { weekday: 'short' }), events: plannerEvents.filter(e => e.date === dateStr) })
    }
    return days
  }

  const removePlannerEvent = (eventId) => {
    setPlannerEvents(prev => prev.filter(e => e.id !== eventId))
  }

  const getPlannerDays = () => {
    const firstDay = new Date(plannerYear, plannerMonth, 1)
    const lastDay = new Date(plannerYear, plannerMonth + 1, 0)
    const startOffset = (firstDay.getDay() + 6) % 7 // Monday = 0
    const days = []

    // Empty cells for days before month start
    for (let i = 0; i < startOffset; i++) days.push(null)

    // Days of the month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${plannerYear}-${String(plannerMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const events = plannerEvents.filter(e => e.date === dateStr)
      days.push({ day: d, date: dateStr, events })
    }

    return days
  }

  const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

  // ============================================================
  // SCHÜLER-MODUS / ASSIGNMENTS
  // ============================================================

  const shareWorksheetAsAssignment = async (worksheetId) => {
    try {
      const res = await fetch('/api/assignments/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId, className: shareForm.className, classId: shareForm.classId || null, deadline: shareForm.deadline || null, targetNiveau: shareForm.targetNiveau || null })
      })
      if (res.ok) {
        const data = await res.json()
        const studentUrl = `${window.location.origin}/schueler?code=${data.code}`
        setSuccessMessage(`Zugangscode: ${data.code} — Schüler-Link wurde in die Zwischenablage kopiert! Teilen Sie diesen Link mit Ihren Schülern: ${studentUrl}`)
        try { navigator.clipboard.writeText(studentUrl) } catch(e) {}
        setShareModalOpen(false)
        setShareForm({ className: '', classId: '', deadline: '', targetNiveau: '' })
        loadAssignments()
      }
    } catch (err) { setError('Freigabe fehlgeschlagen.') }
  }

  const loadSubmissions = async (assignmentId) => {
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setAssignmentSubmissions(data.submissions || [])
        setSelectedAssignment(data.assignment)
      }
    } catch (err) { console.error('Load submissions error:', err) }
  }

  const runErrorAnalysis = async (assignmentId) => {
    setAnalysisLoading(true)
    setErrorAnalysis(null)
    try {
      const res = await fetch('/api/analyze-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ assignmentId })
      })
      if (res.ok) { const data = await res.json(); setErrorAnalysis(data) }
      else { setError('Analyse fehlgeschlagen.') }
    } catch (err) { setError('Analyse fehlgeschlagen.') }
    setAnalysisLoading(false)
  }

  // Teacher grade override
  const saveTeacherGrade = async (submissionId, questionIndex, pointsAwarded, feedback, teacherComment) => {
    try {
      const res = await fetch(`/api/submissions/${submissionId}/grade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ questionIndex, pointsAwarded, feedback, teacherComment })
      })
      if (res.ok) {
        const data = await res.json()
        // Update local submission data
        setAssignmentSubmissions(prev => prev.map(sub => {
          if (sub.id !== submissionId) return sub
          return {
            ...sub,
            question_results: data.questionResults,
            earned_points: data.earnedPoints,
            total_points: data.totalPoints,
            score_percentage: data.scorePercentage,
            swiss_grade: data.swissGrade,
            needs_review: data.needsReview
          }
        }))
        setEditingQuestion(null)
        setSuccessMessage('Bewertung gespeichert.')
      } else { setError('Speichern fehlgeschlagen.') }
    } catch (err) { setError('Speichern fehlgeschlagen.') }
  }

  // Delete assignment
  const deleteAssignment = async (assignmentId) => {
    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setAssignments(prev => prev.filter(a => a.id !== assignmentId))
        setDeleteConfirm(null)
        setSuccessMessage('Aufgabe gelöscht.')
      } else { setError('Löschen fehlgeschlagen.') }
    } catch (err) { setError('Löschen fehlgeschlagen.') }
  }

  // ========== KLASSENVERWALTUNG ==========

  const createClass = async () => {
    if (!newClassName.trim()) return
    setClassLoading(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newClassName.trim() })
      })
      if (res.ok) {
        const data = await res.json()
        setTeacherClasses(prev => [...prev, data])
        setNewClassName('')
        setSuccessMessage(`Klasse "${data.name}" erstellt. Beitritts-Code: ${data.join_code}`)
      }
    } catch (e) { setError('Klasse erstellen fehlgeschlagen.') }
    setClassLoading(false)
  }

  const loadClassDetail = async (classId) => {
    try {
      const res = await fetch(`/api/classes/${classId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setClassDetailData(data)
        setSelectedClass(classId)
        loadClassStats(classId)
      }
    } catch (e) { console.error('Class detail error:', e) }
  }

  const updateStudentNiveau = async (classId, studentId, niveau) => {
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}/niveau`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ niveau })
      })
      if (res.ok) {
        setClassDetailData(prev => ({
          ...prev,
          enrolled_students: prev.enrolled_students.map(s =>
            s.student_id === studentId ? { ...s, niveau } : s
          )
        }))
      }
    } catch (e) { setError('Niveau-Änderung fehlgeschlagen.') }
  }

  const removeStudentFromClass = async (classId, studentId) => {
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setClassDetailData(prev => ({
          ...prev,
          enrolled_students: prev.enrolled_students.filter(s => s.student_id !== studentId)
        }))
        setSuccessMessage('Schüler/in entfernt.')
      }
    } catch (e) { setError('Entfernen fehlgeschlagen.') }
  }

  const deleteClass = async (classId) => {
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setTeacherClasses(prev => prev.filter(c => c.id !== classId))
        if (selectedClass === classId) { setSelectedClass(null); setClassDetailData(null) }
        setSuccessMessage('Klasse gelöscht.')
      }
    } catch (e) { setError('Löschen fehlgeschlagen.') }
  }

  const loadClassStats = async (classId) => {
    try {
      const res = await fetch(`/api/classes/${classId}/stats`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setClassStats(await res.json())
    } catch (e) { console.error('Class stats error:', e) }
  }

  const loadClassInsights = async (classId) => {
    setInsightsLoading(true)
    setClassInsights(null)
    try {
      const res = await fetch(`/api/classes/${classId}/insights`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setClassInsights(await res.json())
    } catch (e) { console.error('Class insights error:', e) }
    setInsightsLoading(false)
  }

  // Load class overview
  const loadClassOverview = async (assignmentId) => {
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/overview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setClassOverview(data)
        setClassOverviewOpen(true)
      }
    } catch (err) { console.error('Overview error:', err) }
  }

  // Swiss grade calculation helper
  const calcSwissGrade = (earned, total) => {
    if (!total || total === 0) return 1
    return Math.round((earned / total * 5 + 1) * 2) / 2
  }

  const gradeColor = (grade) => {
    if (grade >= 5.5) return 'text-green-600'
    if (grade >= 4.5) return 'text-green-500'
    if (grade >= 4) return 'text-amber-600'
    if (grade >= 3) return 'text-orange-600'
    return 'text-red-600'
  }

  // Generate PDF for corrected student exam
  const exportCorrectedPDF = (sub, assignmentTitle) => {
    const doc = new jsPDF()
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    let y = 20

    const checkPage = (needed = 40) => { if (y > ph - needed) { doc.addPage(); y = 20 } }

    // Header
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Korrigierte Prüfung', pw / 2, y, { align: 'center' })
    y += 10

    doc.setFontSize(12)
    doc.text(assignmentTitle || 'Prüfung', pw / 2, y, { align: 'center' })
    y += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Schüler/in: ${sub.student_name}`, 20, y)
    const swissGrade = sub.swiss_grade || calcSwissGrade(sub.earned_points, sub.total_points)
    doc.text(`Note: ${swissGrade}`, pw - 50, y)
    y += 7
    doc.text(`Punkte: ${sub.earned_points ?? 0} / ${sub.total_points ?? 0} (${sub.score_percentage}%)`, 20, y)
    doc.text(`Datum: ${new Date(sub.submitted_at).toLocaleDateString('de-CH')}`, pw - 70, y)
    y += 7
    if (sub.duration) {
      doc.text(`Bearbeitungszeit: ${Math.floor(sub.duration / 60)}:${String(sub.duration % 60).padStart(2, '0')} Min.`, 20, y)
      y += 7
    }

    // Separator
    doc.setDrawColor(180, 180, 180)
    doc.line(20, y, pw - 20, y)
    y += 10

    // Questions
    const results = sub.question_results || []
    results.forEach((qr, qi) => {
      checkPage(55)

      // Question header with status indicator
      const status = qr.isCorrect === true ? '[RICHTIG]' : qr.isCorrect === 'partial' ? '[TEILWEISE]' : '[FALSCH]'
      const statusColor = qr.isCorrect === true ? [0, 150, 0] : qr.isCorrect === 'partial' ? [200, 150, 0] : [200, 0, 0]

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)

      const qText = `${qr.questionNumber || qi + 1}. ${qr.question || 'Frage ' + (qi + 1)}`
      const qLines = doc.splitTextToSize(qText, pw - 75)
      doc.text(qLines, 20, y)

      // Points on right
      doc.setTextColor(...statusColor)
      doc.text(`${qr.pointsAwarded ?? 0}/${qr.maxPoints ?? 1}P`, pw - 25, y, { align: 'right' })
      y += qLines.length * 5 + 3

      // Student answer
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const answer = Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : String(qr.studentAnswer || '–')
      const answerLines = doc.splitTextToSize(`Antwort: ${answer}`, pw - 45)
      doc.text(answerLines, 25, y)
      y += answerLines.length * 4.5 + 2

      // Feedback
      if (qr.feedback) {
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(80, 80, 80)
        const fbLines = doc.splitTextToSize(qr.feedback, pw - 45)
        doc.text(fbLines, 25, y)
        y += fbLines.length * 4.5 + 2
      }

      // Teacher comment
      if (qr.teacherComment) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 70, 180)
        const cmLines = doc.splitTextToSize(`Kommentar: ${qr.teacherComment}`, pw - 45)
        doc.text(cmLines, 25, y)
        y += cmLines.length * 4.5 + 2
      }

      // Grading source
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(140, 140, 140)
      const source = qr.teacherOverride ? 'Lehrperson korrigiert' : qr.aiGraded ? 'KI-bewertet' : 'Automatisch'
      doc.text(source, 25, y)
      y += 8
      doc.setTextColor(0, 0, 0)
    })

    // Footer: Grade summary
    checkPage(30)
    doc.setDrawColor(180, 180, 180)
    doc.line(20, y, pw - 20, y)
    y += 8
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Gesamtnote: ${swissGrade}`, pw / 2, y, { align: 'center' })
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`${sub.earned_points ?? 0} von ${sub.total_points ?? 0} Punkten (${sub.score_percentage}%)`, pw / 2, y, { align: 'center' })

    doc.save(`Pruefung_${sub.student_name.replace(/\s/g, '_')}_korrigiert.pdf`)
    setSuccessMessage(`PDF für ${sub.student_name} exportiert.`)
  }

  // Text-to-Speech
  const speakText = async (text) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text, voice: 'nova', speed: 0.9 })
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.play()
      }
    } catch (err) { console.error('TTS error:', err) }
  }

  // Collaboration
  const shareWorksheetWithUser = async (worksheetId) => {
    try {
      const res = await fetch('/api/collaborate/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId, email: shareEmail, role: shareRole })
      })
      if (res.ok) { setSuccessMessage('Material geteilt!'); setShareEmail('') }
      else { const data = await res.json(); setError(data.error || 'Teilen fehlgeschlagen.') }
    } catch (err) { setError('Teilen fehlgeschlagen.') }
  }

  const saveVersion = async (worksheetId, label) => {
    try {
      const res = await fetch('/api/collaborate/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId, label })
      })
      if (res.ok) { setSuccessMessage('Version gespeichert!') }
    } catch (err) { setError('Version speichern fehlgeschlagen.') }
  }

  const loadVersions = async (worksheetId) => {
    try {
      const res = await fetch(`/api/collaborate/versions/${worksheetId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) { const data = await res.json(); setVersions(data) }
    } catch (err) { console.error('Load versions error:', err) }
  }

  const restoreVersion = async (worksheetId, versionId) => {
    try {
      const res = await fetch('/api/collaborate/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId, versionId })
      })
      if (res.ok) {
        setSuccessMessage('Version wiederhergestellt!')
        fetchWorksheets()
      }
    } catch (err) { setError('Wiederherstellung fehlgeschlagen.') }
  }

  // ============================================================
  // SETTINGS
  // ============================================================

  const handleSaveSettings = () => {
    localStorage.setItem('eduflow_settings', JSON.stringify(settings))
    setForm(prev => ({ ...prev, grade: settings.defaultGrade, subject: settings.defaultSubject, difficulty: settings.defaultDifficulty, questionCount: settings.defaultQuestionCount, dyslexiaFont: settings.dyslexiaFont }))
    setSuccessMessage('Einstellungen wurden gespeichert.')
  }

  const handleUseTemplate = (template) => {
    setForm({ topic: template.topic || '', grade: template.grade, subject: template.subject, difficulty: template.difficulty, questionCount: template.questionCount, resourceType: template.type, dyslexiaFont: false, theme: 'classic', competencyCode: '' })
    setActiveView('create')
    setSelectedWorksheet(null)
    setShowEditorPanel(false)
    setSuccessMessage(template.topic ? `Vorlage "${template.name}" geladen – Thema vorausgefüllt. Passen Sie es bei Bedarf an.` : `Vorlage "${template.name}" geladen. Geben Sie jetzt ein Thema ein.`)
  }

  // ============================================================
  // CURRICULUM HELPERS
  // ============================================================

  const toggleCompetencyStatus = (code) => {
    setCompetencyTracker(prev => {
      const current = prev[code]
      const next = !current ? 'planned' : current === 'planned' ? 'in_progress' : current === 'in_progress' ? 'done' : null
      if (!next) { const { [code]: _, ...rest } = prev; return rest }
      return { ...prev, [code]: next }
    })
  }

  const getCompetencyStatusInfo = (status) => {
    if (status === 'planned') return { label: 'Geplant', color: 'text-blue-600 bg-blue-50 border-blue-200', dot: 'bg-blue-500' }
    if (status === 'in_progress') return { label: 'In Arbeit', color: 'text-amber-600 bg-amber-50 border-amber-200', dot: 'bg-amber-500' }
    if (status === 'done') return { label: 'Erledigt', color: 'text-green-600 bg-green-50 border-green-200', dot: 'bg-green-500' }
    return { label: 'Offen', color: 'text-gray-400 bg-gray-50 border-gray-200', dot: 'bg-gray-300' }
  }

  const generateFromCompetency = (comp, areaName, cycleName) => {
    setForm(prev => ({ ...prev, topic: `${comp.name}: ${comp.description} (${areaName}, ${cycleName}) – Lernziele: ${(comp.goals || []).slice(0, 3).join(', ')}`, subject: areaName, competencyCode: comp.code }))
    setActiveView('create')
    setSelectedWorksheet(null)
    setShowEditorPanel(false)
    setSuccessMessage(`Kompetenz ${comp.code} "${comp.name}" übernommen.`)
  }

  const generateSequence = (comp, areaName, cycleName) => {
    // Generate first material in the sequence
    const firstItem = (comp.sequence || [])[0] || 'Arbeitsblatt'
    const type = firstItem.toLowerCase().includes('quiz') ? 'quiz' : firstItem.toLowerCase().includes('prüfung') ? 'exam' : 'worksheet'
    setForm(prev => ({ ...prev, topic: `${comp.name}: ${comp.description} (${areaName}, ${cycleName})`, subject: areaName, resourceType: type }))
    setActiveView('create')
    setSelectedWorksheet(null)
    setShowEditorPanel(false)
    setSuccessMessage(`Lernsequenz für ${comp.code} gestartet. Erstellen Sie zuerst: "${firstItem}"`)
  }

  // Flatten all competencies for search
  const allCompetencies = LEHRPLAN_CYCLES.flatMap(cycle =>
    cycle.areas.flatMap(area =>
      (area.competencies || []).map(comp => ({
        ...comp,
        areaName: area.name,
        areaIcon: area.icon,
        cycleName: cycle.name,
        cycleId: cycle.id,
        areaId: area.id,
      }))
    )
  )

  const filteredCompetencies = curriculumSearch.trim()
    ? allCompetencies.filter(c => {
        const q = curriculumSearch.toLowerCase()
        return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.goals || []).some(g => g.toLowerCase().includes(q)) || c.areaName.toLowerCase().includes(q)
      })
    : []

  // ============================================================
  // FILTERED DATA
  // ============================================================

  const filteredWorksheets = worksheets.filter(ws => {
    const matchesSearch = librarySearch === '' || ws.title?.toLowerCase().includes(librarySearch.toLowerCase()) || ws.topic?.toLowerCase().includes(librarySearch.toLowerCase())
    const matchesSubject = libraryFilterSubject === 'all' || ws.subject === libraryFilterSubject
    const matchesGrade = libraryFilterGrade === 'all' || ws.grade === libraryFilterGrade
    return matchesSearch && matchesSubject && matchesGrade
  })

  const filteredTemplates = STARTER_TEMPLATES.filter(t => {
    const matchesSearch = templateSearch === '' || t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.description.toLowerCase().includes(templateSearch.toLowerCase()) || (t.tags || []).some(tag => tag.toLowerCase().includes(templateSearch.toLowerCase()))
    const matchesSubject = templateFilterSubject === 'all' || t.subject === templateFilterSubject
    const matchesCategory = templateCategory === 'all' || t.category === templateCategory
    return matchesSearch && matchesSubject && matchesCategory
  })

  // ============================================================
  // COMMAND PALETTE
  // ============================================================

  const commandActions = [
    { label: 'Neues Material erstellen', icon: PlusCircle, action: () => { setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false); setCommandOpen(false) } },
    { label: 'Bibliothek öffnen', icon: FolderOpen, action: () => { setActiveView('library'); setCommandOpen(false) } },
    { label: 'Material hochladen', icon: Upload, action: () => { setActiveView('upload'); setCommandOpen(false) } },
    { label: 'Vorlagen durchsuchen', icon: LayoutTemplate, action: () => { setActiveView('templates'); setCommandOpen(false) } },
    { label: 'Lehrplan 21', icon: GraduationCap, action: () => { setActiveView('curriculum'); setCommandOpen(false) } },
    { label: 'Schuljahresplaner', icon: Calendar, action: () => { setActiveView('planner'); setCommandOpen(false) } },
    { label: 'Export-Historie', icon: Clock, action: () => { setActiveView('exports'); setCommandOpen(false) } },
    { label: 'Einstellungen', icon: Settings, action: () => { setActiveView('settings'); setCommandOpen(false) } },
    ...(selectedWorksheet ? [
      { label: 'PDF Schülerversion exportieren', icon: Download, action: () => { handleExportPDF(selectedWorksheet, 'student'); setCommandOpen(false) } },
      { label: 'PDF Lehrerversion exportieren', icon: Download, action: () => { handleExportPDF(selectedWorksheet, 'teacher'); setCommandOpen(false) } },
      { label: 'Word Schülerversion exportieren', icon: FileText, action: () => { handleExportDOCX(selectedWorksheet, 'student'); setCommandOpen(false) } },
      { label: 'Word Lehrerversion exportieren', icon: FileText, action: () => { handleExportDOCX(selectedWorksheet, 'teacher'); setCommandOpen(false) } },
    ] : [])
  ]

  const navGroups = [
    { label: 'Inhalte', items: [
      { id: 'home', label: 'Start', icon: LayoutDashboard },
      { id: 'create', label: 'Erstellen', icon: PlusCircle },
      { id: 'library', label: 'Bibliothek', icon: FolderOpen },
      { id: 'upload', label: 'Hochladen', icon: Upload },
      { id: 'templates', label: 'Vorlagen', icon: LayoutTemplate },
    ]},
    { label: 'Unterricht', items: [
      { id: 'curriculum', label: 'Lehrplan 21', icon: GraduationCap },
      { id: 'planner', label: 'Jahresplaner', icon: Calendar },
      { id: 'students', label: 'Schüler', icon: User },
      { id: 'classes', label: 'Klassen', icon: Users },
    ]},
    { label: 'System', items: [
      { id: 'exports', label: 'Exporte', icon: Clock },
      { id: 'settings', label: 'Einstellungen', icon: Settings },
    ]},
  ]
  const navItems = navGroups.flatMap(g => g.items)

  // ============================================================
  // LANDING PAGE
  // ============================================================

  if (!token) {
    return (
      <LandingPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        handleAuth={handleAuth}
        handleGoogleLogin={handleGoogleLogin}
        error={error}
        setError={setError}
      />
    )
  }

  // ============================================================
  // ONBOARDING - Teacher Type Selection
  // ============================================================

  const teacherTypeOptions = [
    { id: 'primar', label: 'Primarlehrperson', description: 'Zyklus 1 & 2 (1.–6. Klasse)', icon: School,
      active: 'border-blue-400 bg-blue-50 shadow-md', iconBg: 'bg-blue-200', iconColor: 'text-blue-600', checkBg: 'bg-blue-500' },
    { id: 'sekundar', label: 'Sekundarlehrperson', description: 'Zyklus 3 (7.–9. Klasse)', icon: GraduationCap,
      active: 'border-purple-400 bg-purple-50 shadow-md', iconBg: 'bg-purple-200', iconColor: 'text-purple-600', checkBg: 'bg-purple-500' },
    { id: 'sonstiges', label: 'Sonstiges', description: 'Heilpädagogik, DaZ, Förderlehrperson etc.', icon: Users,
      active: 'border-emerald-400 bg-emerald-50 shadow-md', iconBg: 'bg-emerald-200', iconColor: 'text-emerald-600', checkBg: 'bg-emerald-500' },
  ]

  if (showOnboarding && token) {
    return (
      <div className="min-h-screen gradient-liquid flex items-center justify-center p-4">
        <motion.div className="w-full max-w-lg" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <div className="text-center mb-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}>
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BookOpen className="h-8 w-8 text-blue-600" />
              </div>
            </motion.div>
            <motion.h2 className="text-3xl font-bold text-gradient mb-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              Willkommen bei EduFlow
            </motion.h2>
            <motion.p className="text-gray-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              Welche Art Lehrperson sind Sie?
            </motion.p>
          </div>

          <div className="space-y-3">
            {teacherTypeOptions.map((opt, i) => (
              <motion.button key={opt.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
                onClick={() => setSelectedTeacherType(opt.id)}
                className={`w-full p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-4 ${selectedTeacherType === opt.id
                  ? opt.active
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${selectedTeacherType === opt.id ? opt.iconBg : 'bg-gray-100'}`}>
                  <opt.icon className={`h-6 w-6 ${selectedTeacherType === opt.id ? opt.iconColor : 'text-gray-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${selectedTeacherType === opt.id ? 'text-gray-900' : 'text-gray-700'}`}>{opt.label}</p>
                  <p className="text-sm text-gray-400">{opt.description}</p>
                </div>
                {selectedTeacherType === opt.id && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                    <div className={`w-8 h-8 ${opt.checkBg} rounded-full flex items-center justify-center`}>
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>

          <motion.div className="mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <Button onClick={handleSaveTeacherType} disabled={!selectedTeacherType || savingTeacherType}
              className="w-full btn-premium h-12 text-base">
              {savingTeacherType ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              {savingTeacherType ? 'Wird gespeichert...' : 'Weiter zu EduFlow'}
            </Button>
            <p className="text-center text-xs text-gray-400 mt-3">Sie können dies später in den Einstellungen ändern.</p>
          </motion.div>
        </motion.div>
      </div>
    )
  }

  // ============================================================
  // MAIN DASHBOARD
  // ============================================================

  return (
    <div className="min-h-screen gradient-liquid">
      {/* NAVIGATION */}
      <motion.header className="fixed top-0 left-0 right-0 z-50" initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 25 }}>
        <div className="glass px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg border-b border-white/20">
          <div className="flex items-center gap-4 sm:gap-6">
            <button onClick={() => { setActiveView('home'); setSelectedWorksheet(null); setShowEditorPanel(false) }} className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer" title="Zur Startseite">
              <BookOpen className="h-6 w-6 text-blue-500" />
              <h1 className="text-xl font-bold text-gradient">EduFlow</h1>
            </button>

            <nav className="hidden xl:flex items-center gap-0.5" role="navigation">
              {navGroups.map((group, gi) => (
                <div key={group.label} className="flex items-center">
                  {gi > 0 && <div className="w-px h-5 bg-gray-300/50 mx-1.5" />}
                  {group.items.map(item => (
                    <Button key={item.id} variant="ghost" size="sm" onClick={() => { setActiveView(item.id); setMobileNavOpen(false) }} className={`transition-smooth text-xs ${activeView === item.id ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm ring-1 ring-blue-200/60' : 'text-gray-600 hover:text-gray-900'}`}>
                      <item.icon className={`h-3.5 w-3.5 mr-1.5 ${activeView === item.id ? 'text-blue-600' : ''}`} />
                      {item.label}
                    </Button>
                  ))}
                </div>
              ))}
            </nav>

            <Button variant="ghost" size="sm" className="xl:hidden" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Navigation öffnen">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)} className="hidden sm:flex items-center gap-2 glass-card border-0" aria-label="Befehlspalette öffnen">
              <CommandIcon className="h-4 w-4" /><kbd className="text-xs opacity-60">Ctrl+K</kbd>
            </Button>
            <div className="text-right hidden sm:block">
              <p className="font-medium text-sm text-gray-900">{user?.name}</p>
              {user?.subscription_tier === 'premium' ? (
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-xs"><Crown className="h-3 w-3 mr-1" /> Premium</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Free ({user?.worksheets_used_this_month || 0}/5)</Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="glass-card border-0" aria-label="Abmelden"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="xl:hidden glass p-3 shadow-lg border-b border-white/20">
              <nav className="space-y-3">
                {navGroups.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">{group.label}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.items.map(item => (
                        <Button key={item.id} variant="ghost" size="sm" onClick={() => { setActiveView(item.id); setMobileNavOpen(false) }} className={`justify-start text-xs ${activeView === item.id ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/60' : 'text-gray-600'}`}>
                          <item.icon className={`h-3.5 w-3.5 mr-1.5 ${activeView === item.id ? 'text-blue-600' : ''}`} />{item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* SUCCESS TOAST */}
      <AnimatePresence>
        {successMessage && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] max-w-md w-full px-4">
            <Alert className="bg-green-50 border-green-200 shadow-lg"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800">{successMessage}</AlertDescription></Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <main className="container mx-auto px-4 pt-20 pb-32" role="main">
        <AnimatePresence mode="wait">

          {/* ============ HOME VIEW ============ */}
          {activeView === 'home' && (
            <DashboardView STARTER_TEMPLATES={STARTER_TEMPLATES} handleUseTemplate={handleUseTemplate} />
          )}

          {/* ============ CREATE VIEW ============ */}
          {activeView === 'create' && (
            <GeneratorView handleExportPDF={handleExportPDF} handleExportDOCX={handleExportDOCX} handleRegenerate={handleRegenerate} handleUpgrade={handleUpgrade} />
          )}

          {/* ============ LIBRARY VIEW ============ */}
          {activeView === 'library' && (
            <LibraryView SUBJECTS={SUBJECTS} GRADES={GRADES} handleExportPDF={handleExportPDF} handleExportDossierPDF={handleExportDossierPDF} handleDeleteDossier={handleDeleteDossier} />
          )}

          {/* ============ UPLOAD VIEW ============ */}
          {activeView === 'upload' && (
            <UploadView RESOURCE_TYPES={RESOURCE_TYPES} SUBJECTS={SUBJECTS} />
          )}

          {/* ============ TEMPLATES VIEW ============ */}
          {activeView === 'templates' && (
            <motion.div key="templates" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-2">Vorlagen</h2>
                <p className="text-gray-600">Starten Sie schneller mit vorgefertigten Vorlagen. Wählen Sie eine Vorlage, geben Sie Ihr Thema ein – fertig.</p>
              </div>

              {/* Category Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {TEMPLATE_CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setTemplateCategory(cat.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-smooth ${templateCategory === cat.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}>
                    {cat.label}
                    <span className="ml-1.5 text-xs opacity-70">
                      {STARTER_TEMPLATES.filter(t => cat.id === 'all' || t.category === cat.id).length}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search + Filter */}
              <div className="glass-card rounded-xl p-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Vorlagen, Tags oder Fächer durchsuchen..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} className="pl-9" /></div>
                  <Select value={templateFilterSubject} onValueChange={setTemplateFilterSubject}><SelectTrigger className="w-full sm:w-[180px]"><Filter className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Fach" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Fächer</SelectItem>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>

              {filteredTemplates.length === 0 ? (
                <Card className="glass-card border-0"><CardContent className="py-16 text-center">
                  <Search className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Keine Vorlagen gefunden</h3>
                  <p className="text-gray-500 mb-4">Versuchen Sie andere Suchbegriffe oder Filter.</p>
                  <Button variant="outline" onClick={() => { setTemplateSearch(''); setTemplateFilterSubject('all'); setTemplateCategory('all') }}>Filter zurücksetzen</Button>
                </CardContent></Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...filteredTemplates].sort((a, b) => {
                    if (!user?.teacher_type) return 0
                    const gA = parseInt(a.grade, 10), gB = parseInt(b.grade, 10)
                    const relevantA = user.teacher_type === 'sekundar' ? gA >= 7 : gA <= 6
                    const relevantB = user.teacher_type === 'sekundar' ? gB >= 7 : gB <= 6
                    return (relevantB ? 1 : 0) - (relevantA ? 1 : 0)
                  }).map((template, index) => {
                    const typeInfo = RESOURCE_TYPES.find(r => r.id === template.type)
                    const TypeIcon = typeInfo?.icon || FileText
                    return (
                    <motion.div key={template.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                      <Card className="glass-card border-0 hover-lift h-full flex flex-col group cursor-pointer" onClick={() => handleUseTemplate(template)}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${template.type === 'exam' ? 'bg-red-50' : template.type === 'quiz' ? 'bg-green-50' : template.type === 'vocabulary' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                              <TypeIcon className={`h-5 w-5 ${template.type === 'exam' ? 'text-red-500' : template.type === 'quiz' ? 'text-green-500' : template.type === 'vocabulary' ? 'text-purple-500' : 'text-blue-500'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm leading-tight">{template.name}</CardTitle>
                              <CardDescription className="text-xs mt-1 line-clamp-2">{template.description}</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 pt-0">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">{template.grade}. Klasse</Badge>
                            <Badge variant="secondary" className="text-[10px]">{template.subject}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{DIFFICULTY_LABELS[template.difficulty]}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{template.questionCount} Fragen</Badge>
                          </div>
                          {template.tags && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {template.tags.map(tag => (
                                <span key={tag} className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{tag}</span>
                              ))}
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="pt-0">
                          <Button className="w-full transition-smooth group-hover:bg-blue-600 group-hover:text-white" variant="outline" size="sm">
                            <ArrowRight className="h-4 w-4 mr-2" /> Verwenden
                          </Button>
                        </CardFooter>
                      </Card>
                    </motion.div>
                  )})}
                </div>
              )}

              <div className="mt-8">
                <Card className="glass-card border-0 bg-gradient-to-br from-blue-50 to-purple-50"><CardContent className="py-8 text-center">
                  <Star className="h-10 w-10 mx-auto text-blue-400 mb-3" />
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Eigene Vorlagen speichern</h3>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">Bald können Sie Ihre besten Materialien als eigene Vorlagen speichern und mit einem Klick wiederverwenden.</p>
                  <Badge variant="secondary" className="mt-4">Demnächst verfügbar</Badge>
                </CardContent></Card>
              </div>
            </motion.div>
          )}

          {/* ============ LEHRPLAN 21 VIEW ============ */}
          {activeView === 'curriculum' && (
            <motion.div key="curriculum" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-6xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-2">Lehrplan 21</h2>
                <p className="text-gray-600">Kompetenzen durchsuchen, Jahresplanung verwalten und gezielt Material erstellen.</p>
              </div>

              {/* Search + Stats Bar */}
              <div className="glass-card rounded-xl p-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Kompetenzen durchsuchen – z.B. «Brüche», «Lesen», «Magnetismus»..." value={curriculumSearch} onChange={(e) => setCurriculumSearch(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={curriculumFilterSubject} onValueChange={setCurriculumFilterSubject}>
                    <SelectTrigger className="w-full sm:w-[180px]"><Filter className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Fach" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Fächer</SelectItem>
                      {[...new Set(allCompetencies.map(c => c.areaName))].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Planning Stats */}
                {Object.keys(competencyTracker).length > 0 && (
                  <div className="flex gap-4 mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-gray-600">Geplant: <strong>{Object.values(competencyTracker).filter(v => v === 'planned').length}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-gray-600">In Arbeit: <strong>{Object.values(competencyTracker).filter(v => v === 'in_progress').length}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-600">Erledigt: <strong>{Object.values(competencyTracker).filter(v => v === 'done').length}</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Search Results */}
              <AnimatePresence>
                {curriculumSearch.trim() && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6">
                    <p className="text-sm text-gray-500 mb-3">{filteredCompetencies.length} Treffer für «{curriculumSearch}»</p>
                    {filteredCompetencies.length > 0 ? (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {filteredCompetencies.filter(c => curriculumFilterSubject === 'all' || c.areaName === curriculumFilterSubject).slice(0, 12).map((comp, i) => {
                          const status = competencyTracker[comp.code]
                          const statusInfo = getCompetencyStatusInfo(status)
                          return (
                            <motion.div key={comp.code} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                              <Card className="glass-card border-0 hover-lift h-full">
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">{comp.areaIcon}</span>
                                      <Badge variant="outline" className="text-[10px] font-mono">{comp.code}</Badge>
                                    </div>
                                    <button onClick={() => toggleCompetencyStatus(comp.code)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-smooth ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </button>
                                  </div>
                                  <h4 className="font-semibold text-sm text-gray-900 mb-1">{comp.name}</h4>
                                  <p className="text-xs text-gray-500 mb-2">{comp.description}</p>
                                  <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-3">
                                    <span>{comp.cycleName}</span> • <span>{comp.areaName}</span> • <Badge variant="secondary" className="text-[10px]">{comp.level}</Badge>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" className="flex-1 text-xs btn-premium" onClick={() => generateFromCompetency(comp, comp.areaName, comp.cycleName)}>
                                      <Sparkles className="h-3 w-3 mr-1" /> Material erstellen
                                    </Button>
                                    {comp.sequence && comp.sequence.length > 1 && (
                                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowSequenceFor(showSequenceFor === comp.code ? null : comp.code)}>
                                        <Layers className="h-3 w-3 mr-1" /> Sequenz
                                      </Button>
                                    )}
                                  </div>
                                  {/* Learning Goals */}
                                  {comp.goals && comp.goals.length > 0 && (
                                    <div className="mt-3 pt-2 border-t">
                                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Lernziele</p>
                                      <div className="space-y-1">
                                        {comp.goals.map((goal, gi) => (
                                          <div key={gi} className="flex items-start gap-1.5">
                                            <Target className="h-3 w-3 text-blue-400 mt-0.5 flex-shrink-0" />
                                            <span className="text-[11px] text-gray-600">{goal}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Sequence Dropdown */}
                                  <AnimatePresence>
                                    {showSequenceFor === comp.code && comp.sequence && (
                                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 pt-2 border-t overflow-hidden">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Empfohlene Lernsequenz</p>
                                        <div className="space-y-1.5">
                                          {comp.sequence.map((item, si) => (
                                            <div key={si} className="flex items-center gap-2">
                                              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                <span className="text-[10px] font-bold text-blue-600">{si + 1}</span>
                                              </div>
                                              <span className="text-xs text-gray-700 flex-1">{item}</span>
                                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-blue-600" onClick={() => {
                                                const type = item.toLowerCase().includes('quiz') ? 'quiz' : item.toLowerCase().includes('prüfung') ? 'exam' : 'worksheet'
                                                setForm(prev => ({ ...prev, topic: `${comp.name}: ${comp.description}`, subject: comp.areaName, resourceType: type }))
                                                setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false)
                                              }}>
                                                <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Erstellen
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </CardContent>
                              </Card>
                            </motion.div>
                          )
                        })}
                      </div>
                    ) : (
                      <Card className="glass-card border-0"><CardContent className="py-8 text-center">
                        <Search className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-500">Keine Kompetenzen für «{curriculumSearch}» gefunden.</p>
                      </CardContent></Card>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Cycle Cards */}
              {!curriculumSearch.trim() && (
                <div className="space-y-4">
                  {[...LEHRPLAN_CYCLES].sort((a, b) => {
                    if (!user?.teacher_type) return 0
                    const relevant = user.teacher_type === 'sekundar' ? ['z3'] : ['z1', 'z2']
                    return (relevant.includes(a.id) ? 0 : 1) - (relevant.includes(b.id) ? 0 : 1)
                  }).map(cycle => {
                    const cycleColor = cycle.color === 'emerald' ? 'from-emerald-50 to-green-50' : cycle.color === 'blue' ? 'from-blue-50 to-indigo-50' : 'from-purple-50 to-pink-50'
                    const iconBg = cycle.color === 'emerald' ? 'bg-emerald-100' : cycle.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100'
                    const iconColor = cycle.color === 'emerald' ? 'text-emerald-600' : cycle.color === 'blue' ? 'text-blue-600' : 'text-purple-600'
                    const totalComps = cycle.areas.reduce((sum, a) => sum + (a.competencies?.length || 0), 0)
                    const doneComps = cycle.areas.reduce((sum, a) => sum + (a.competencies || []).filter(c => competencyTracker[c.code] === 'done').length, 0)

                    return (
                    <Card key={cycle.id} className="glass-card border-0 overflow-hidden">
                      <button onClick={() => setExpandedCycle(expandedCycle === cycle.id ? null : cycle.id)} className={`w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gradient-to-r ${cycleColor} transition-smooth`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}><GraduationCap className={`h-6 w-6 ${iconColor}`} /></div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{cycle.name}</h3>
                            <p className="text-sm text-gray-500">{cycle.grades} • {cycle.areas.length} Fächer • {totalComps} Kompetenzen</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {doneComps > 0 && (
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-green-600 font-medium">{doneComps}/{totalComps} erledigt</p>
                              <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(doneComps/totalComps)*100}%` }} />
                              </div>
                            </div>
                          )}
                          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expandedCycle === cycle.id ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedCycle === cycle.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="px-6 pb-5 space-y-3">
                              {cycle.areas.map(area => (
                                <div key={area.id} className="border rounded-xl overflow-hidden">
                                  <button onClick={() => setExpandedArea(expandedArea === area.id ? null : area.id)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-smooth">
                                    <div className="flex items-center gap-2.5">
                                      <span className="text-lg">{area.icon}</span>
                                      <span className="font-medium text-gray-800">{area.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs">{(area.competencies || []).length} Kompetenzen</Badge>
                                      {(area.competencies || []).some(c => competencyTracker[c.code]) && (
                                        <div className="flex -space-x-0.5">
                                          {(area.competencies || []).map(c => competencyTracker[c.code]).filter(Boolean).slice(0, 8).map((status, si) => (
                                            <div key={si} className={`w-2 h-2 rounded-full ${getCompetencyStatusInfo(status).dot}`} />
                                          ))}
                                        </div>
                                      )}
                                      <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${expandedArea === area.id ? 'rotate-90' : ''}`} />
                                    </div>
                                  </button>
                                  <AnimatePresence>
                                    {expandedArea === area.id && (
                                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                        <div className="px-4 pb-4 space-y-3">
                                          {(area.competencies || []).map((comp, ci) => {
                                            const status = competencyTracker[comp.code]
                                            const statusInfo = getCompetencyStatusInfo(status)
                                            return (
                                              <motion.div key={comp.code || ci} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.03 }}
                                                className="bg-white border rounded-xl p-4 hover:shadow-md transition-all">
                                                {/* Competency Header */}
                                                <div className="flex items-start justify-between mb-2">
                                                  <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                      <Badge variant="outline" className="text-[10px] font-mono px-1.5">{comp.code}</Badge>
                                                      <Badge variant="secondary" className="text-[10px]">{comp.level}</Badge>
                                                    </div>
                                                    <h4 className="font-semibold text-sm text-gray-900">{comp.name}</h4>
                                                    <p className="text-xs text-gray-500 mt-0.5">{comp.description}</p>
                                                  </div>
                                                  <button onClick={() => toggleCompetencyStatus(comp.code)}
                                                    className={`ml-3 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-smooth flex-shrink-0 ${statusInfo.color}`}
                                                    title="Klicken um Status zu ändern: Offen → Geplant → In Arbeit → Erledigt">
                                                    <div className="flex items-center gap-1">
                                                      <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                                      {statusInfo.label}
                                                    </div>
                                                  </button>
                                                </div>

                                                {/* Learning Goals */}
                                                {comp.goals && comp.goals.length > 0 && (
                                                  <div className="mb-3">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Lernziele</p>
                                                    <div className="grid sm:grid-cols-2 gap-1">
                                                      {comp.goals.map((goal, gi) => (
                                                        <div key={gi} className="flex items-start gap-1.5">
                                                          <Target className="h-3 w-3 text-blue-400 mt-0.5 flex-shrink-0" />
                                                          <span className="text-[11px] text-gray-600">{goal}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Action Buttons */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <Button size="sm" className="text-xs btn-premium" onClick={() => generateFromCompetency(comp, area.name, cycle.name)}>
                                                    <Sparkles className="h-3 w-3 mr-1" /> Material erstellen
                                                  </Button>
                                                  {comp.sequence && comp.sequence.length > 1 && (
                                                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowSequenceFor(showSequenceFor === comp.code ? null : comp.code)}>
                                                      <Layers className="h-3 w-3 mr-1" /> Lernsequenz ({comp.sequence.length})
                                                    </Button>
                                                  )}
                                                </div>

                                                {/* Sequence Expandable */}
                                                <AnimatePresence>
                                                  {showSequenceFor === comp.code && comp.sequence && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 pt-3 border-t overflow-hidden">
                                                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Empfohlene Lernsequenz</p>
                                                      <div className="space-y-2">
                                                        {comp.sequence.map((item, si) => (
                                                          <div key={si} className="flex items-center gap-3 bg-gradient-to-r from-blue-50/50 to-purple-50/50 rounded-lg p-2.5">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                              <span className="text-[10px] font-bold text-blue-600">{si + 1}</span>
                                                            </div>
                                                            <div className="flex-1">
                                                              <span className="text-xs font-medium text-gray-700">{item}</span>
                                                            </div>
                                                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => {
                                                              const type = item.toLowerCase().includes('quiz') ? 'quiz' : item.toLowerCase().includes('prüfung') ? 'exam' : 'worksheet'
                                                              setForm(prev => ({ ...prev, topic: `${comp.name}: ${comp.description}`, subject: area.name, resourceType: type }))
                                                              setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false)
                                                              setSuccessMessage(`"${item}" für ${comp.code} vorbereitet.`)
                                                            }}>
                                                              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Erstellen
                                                            </Button>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </motion.div>
                                                  )}
                                                </AnimatePresence>
                                              </motion.div>
                                            )
                                          })}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  )})}
                </div>
              )}

              {/* Info + Tips */}
              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                <Card className="glass-card border-0 bg-gradient-to-br from-blue-50 to-green-50">
                  <CardContent className="py-5">
                    <div className="flex gap-3">
                      <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-800 mb-1">Über den Lehrplan 21</p>
                        <p className="text-xs text-blue-700">Der Lehrplan 21 ist der gemeinsame Lehrplan der deutschsprachigen Kantone der Schweiz. Klicken Sie auf eine Kompetenz, um gezielt Material zu erstellen.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass-card border-0 bg-gradient-to-br from-purple-50 to-pink-50">
                  <CardContent className="py-5">
                    <div className="flex gap-3">
                      <Lightbulb className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-purple-800 mb-1">Jahresplanung</p>
                        <p className="text-xs text-purple-700">Klicken Sie auf den Status-Button jeder Kompetenz, um Ihre Planung zu verwalten: Offen → Geplant → In Arbeit → Erledigt. Der Fortschritt wird gespeichert.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {/* ============ SCHULJAHRESPLANER VIEW ============ */}
          {activeView === 'planner' && (
            <motion.div key="planner" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-6xl mx-auto">
              <OnboardingHint id="planner">
                Planen Sie hier Ihr gesamtes Schuljahr — ordnen Sie Themen den Kalenderwochen zu und behalten Sie den Überblick über Ihre Materialien und Prüfungen.
              </OnboardingHint>
              <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-gradient mb-1">Schuljahresplaner</h2>
                  <p className="text-gray-600 text-sm">Planen Sie Ihr Schuljahr mit Fächern, Materialien und Prüfungen.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button onClick={() => setPlannerView('month')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${plannerView === 'month' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Monat</button>
                    <button onClick={() => setPlannerView('week')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${plannerView === 'week' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Woche</button>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => { setPlannerMonth(new Date().getMonth()); setPlannerYear(new Date().getFullYear()); const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setPlannerWeekStart(d.toISOString().split('T')[0]) }}>
                    Heute
                  </Button>
                </div>
              </div>

              {/* Navigation */}
              <div className="glass-card rounded-xl p-4 mb-6">
                {plannerView === 'month' ? (
                  <>
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" onClick={() => { if (plannerMonth === 0) { setPlannerMonth(11); setPlannerYear(plannerYear - 1) } else setPlannerMonth(plannerMonth - 1) }}>
                        <ChevronRight className="h-4 w-4 rotate-180" />
                      </Button>
                      <div className="text-center">
                        <h3 className="text-xl font-bold text-gray-900">{MONTH_NAMES[plannerMonth]} {plannerYear}</h3>
                        <p className="text-xs text-gray-500">{plannerEvents.filter(e => e.date?.startsWith(`${plannerYear}-${String(plannerMonth + 1).padStart(2, '0')}`)).length} Einträge</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { if (plannerMonth === 11) { setPlannerMonth(0); setPlannerYear(plannerYear + 1) } else setPlannerMonth(plannerMonth + 1) }}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
                      {[8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6].map(m => (
                        <button key={m} onClick={() => { setPlannerMonth(m); if (m >= 8) setPlannerYear(new Date().getFullYear()); else setPlannerYear(new Date().getFullYear() + 1) }}
                          className={`w-8 h-8 rounded-full text-[10px] font-medium transition-all ${plannerMonth === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-blue-100'}`}>
                          {MONTH_NAMES[m].substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => { const d = new Date(plannerWeekStart); d.setDate(d.getDate() - 7); setPlannerWeekStart(d.toISOString().split('T')[0]) }}>
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </Button>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-gray-900">
                        {new Date(plannerWeekStart).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })} – {(() => { const d = new Date(plannerWeekStart); d.setDate(d.getDate() + 6); return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short', year: 'numeric' }) })()}
                      </h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { const d = new Date(plannerWeekStart); d.setDate(d.getDate() + 7); setPlannerWeekStart(d.toISOString().split('T')[0]) }}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  {/* Month Calendar Grid */}
                  {plannerView === 'month' && (
                    <Card className="glass-card border-0 overflow-hidden">
                      <div className="grid grid-cols-7">
                        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                          <div key={day} className="p-2 text-center text-xs font-semibold text-gray-500 border-b bg-gray-50/50">{day}</div>
                        ))}
                        {getPlannerDays().map((cell, idx) => {
                          if (!cell) return <div key={`empty-${idx}`} className="min-h-[85px] border-b border-r border-gray-100 bg-gray-50/30" />
                          const isToday = cell.date === new Date().toISOString().split('T')[0]
                          const isWeekend = (idx % 7) >= 5
                          return (
                            <div key={cell.date}
                              className={`min-h-[85px] border-b border-r border-gray-100 p-1.5 transition-colors cursor-pointer hover:bg-blue-50/50 ${isToday ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : isWeekend ? 'bg-gray-50/50' : ''}`}
                              onClick={() => setQuickAddForm(prev => ({ ...prev, date: cell.date }))}
                            >
                              <div className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-700 font-bold' : 'text-gray-700'}`}>{cell.day}</div>
                              <div className="space-y-0.5">
                                {cell.events.slice(0, 3).map(event => {
                                  const subjectColor = event.subject && SUBJECT_COLORS[event.subject]
                                  return (
                                    <div key={event.id}
                                      className={`text-[9px] px-1 py-0.5 rounded truncate font-medium ${
                                        subjectColor ? `${subjectColor.bg} ${subjectColor.text}` :
                                        event.type === 'exam' ? 'bg-red-100 text-red-700' :
                                        event.type === 'deadline' ? 'bg-amber-100 text-amber-700' :
                                        event.type === 'holiday' ? 'bg-green-100 text-green-700' :
                                        event.type === 'project' ? 'bg-purple-100 text-purple-700' :
                                        'bg-blue-100 text-blue-700'
                                      }`}
                                      title={`${event.title}${event.subject ? ` (${event.subject})` : ''}`}
                                      onClick={(e) => { e.stopPropagation(); if (confirm(`"${event.title}" löschen?`)) removePlannerEvent(event.id) }}
                                    >
                                      {event.title}
                                    </div>
                                  )
                                })}
                                {cell.events.length > 3 && <div className="text-[8px] text-gray-400 text-center">+{cell.events.length - 3}</div>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}

                  {/* Week View */}
                  {plannerView === 'week' && (
                    <Card className="glass-card border-0 overflow-hidden">
                      <div className="divide-y">
                        {getWeekDays(plannerWeekStart).map(day => {
                          const isToday = day.date === new Date().toISOString().split('T')[0]
                          return (
                            <div key={day.date} className={`p-3 ${isToday ? 'bg-blue-50/50' : ''} hover:bg-gray-50/50 transition-colors cursor-pointer`}
                              onClick={() => setQuickAddForm(prev => ({ ...prev, date: day.date }))}>
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                  <span className="text-[10px] font-medium leading-none">{day.dayName}</span>
                                  <span className="text-sm font-bold leading-none">{day.day}</span>
                                </div>
                                <div className="flex-1">
                                  {day.events.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">Keine Einträge</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {day.events.map(event => {
                                        const subjectColor = event.subject && SUBJECT_COLORS[event.subject]
                                        return (
                                          <div key={event.id} className={`text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 ${
                                            subjectColor ? `${subjectColor.bg} ${subjectColor.text}` :
                                            event.type === 'exam' ? 'bg-red-100 text-red-700' :
                                            event.type === 'deadline' ? 'bg-amber-100 text-amber-700' :
                                            event.type === 'holiday' ? 'bg-green-100 text-green-700' :
                                            'bg-blue-100 text-blue-700'
                                          }`}>
                                            {event.title}
                                            <button onClick={(e) => { e.stopPropagation(); removePlannerEvent(event.id) }} className="opacity-50 hover:opacity-100"><X className="h-3 w-3" /></button>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Quick Add - React state driven */}
                  <Card className="glass-card border-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><PlusCircle className="h-4 w-4 text-blue-500" /> Eintrag hinzufügen</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs">Datum</Label>
                        <Input type="date" value={quickAddForm.date} onChange={(e) => setQuickAddForm(prev => ({ ...prev, date: e.target.value }))} className="mt-1 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Titel</Label>
                        <Input value={quickAddForm.title} onChange={(e) => setQuickAddForm(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="z.B. Mathe-Prüfung Kapitel 3..." className="mt-1 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Fach</Label>
                        <Select value={quickAddForm.subject} onValueChange={(val) => setQuickAddForm(prev => ({ ...prev, subject: val }))}>
                          <SelectTrigger className="mt-1 text-sm"><SelectValue placeholder="Fach wählen (optional)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Kein Fach</SelectItem>
                            {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Typ</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {[
                            { id: 'material', label: 'Material', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                            { id: 'exam', label: 'Prüfung', color: 'bg-red-50 text-red-700 border-red-200' },
                            { id: 'lesson', label: 'Lektion', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                            { id: 'project', label: 'Projekt', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                            { id: 'deadline', label: 'Frist', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                            { id: 'holiday', label: 'Ferien', color: 'bg-green-50 text-green-700 border-green-200' },
                          ].map(t => (
                            <button key={t.id} onClick={() => setQuickAddForm(prev => ({ ...prev, type: t.id }))}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${t.color} ${quickAddForm.type === t.id ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button className="w-full btn-premium text-sm" size="sm" disabled={!quickAddForm.date || !quickAddForm.title}
                        onClick={() => {
                          addPlannerEvent(quickAddForm.date, quickAddForm.title, quickAddForm.type, '', quickAddForm.subject === 'none' ? '' : quickAddForm.subject)
                          setQuickAddForm(prev => ({ ...prev, title: '' }))
                          setSuccessMessage('Termin hinzugefügt!')
                        }}>
                        <PlusCircle className="h-4 w-4 mr-1" /> Hinzufügen
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Upcoming events */}
                  <Card className="glass-card border-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-500" /> Nächste Termine</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const upcoming = plannerEvents
                          .filter(e => new Date(e.date) >= new Date(new Date().toISOString().split('T')[0]))
                          .sort((a, b) => new Date(a.date) - new Date(b.date))
                          .slice(0, 8)
                        return upcoming.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">Keine kommenden Termine.</p>
                        ) : (
                          <div className="space-y-2">
                            {upcoming.map(event => (
                              <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  event.type === 'exam' ? 'bg-red-500' : event.type === 'deadline' ? 'bg-amber-500' : event.type === 'holiday' ? 'bg-green-500' : 'bg-blue-500'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                                  <p className="text-xs text-gray-500">{new Date(event.date).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    {event.subject && <span className="ml-1 text-gray-400">· {event.subject}</span>}
                                  </p>
                                </div>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-300 hover:text-red-500" onClick={() => removePlannerEvent(event.id)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </CardContent>
                  </Card>

                  {/* Curriculum link */}
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                    <div className="flex gap-2">
                      <Lightbulb className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-purple-800">Lehrplan-Verknüpfung</p>
                        <p className="text-[10px] text-purple-600 mt-0.5">Im Lehrplan-21-Bereich können Sie Kompetenzen direkt mit Terminen verknüpfen.</p>
                        <Button variant="ghost" size="sm" className="text-[10px] text-purple-700 p-0 h-auto mt-1" onClick={() => setActiveView('curriculum')}>
                          Zum Lehrplan 21 →
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Year Overview Stats */}
              <Card className="glass-card border-0 mt-6">
                <CardContent className="py-5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
                    <div className="bg-blue-50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-blue-600">{plannerEvents.filter(e => e.type === 'material').length}</p>
                      <p className="text-xs text-gray-600">Materialien</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-red-600">{plannerEvents.filter(e => e.type === 'exam').length}</p>
                      <p className="text-xs text-gray-600">Prüfungen</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-amber-600">{plannerEvents.filter(e => e.type === 'deadline').length}</p>
                      <p className="text-xs text-gray-600">Fristen</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-purple-600">{plannerEvents.filter(e => e.type === 'project').length}</p>
                      <p className="text-xs text-gray-600">Projekte</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-green-600">{Object.values(competencyTracker).filter(v => v === 'done').length}</p>
                      <p className="text-xs text-gray-600">Kompetenzen erledigt</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============ SCHÜLER-MODUS VIEW ============ */}
          {activeView === 'students' && (
            <motion.div key="students" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-6xl mx-auto">
              <OnboardingHint id="students">
                Weisen Sie hier Arbeitsblätter an Ihre Klassen zu. Ihre Schüler:innen können die Aufgaben online lösen — Sie sehen die Ergebnisse und häufige Fehler auf einen Blick.
              </OnboardingHint>
              <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-gradient mb-1">Schüler-Modus</h2>
                  <p className="text-gray-600 text-sm">Geben Sie Aufgaben frei, sehen Sie Ergebnisse und analysieren Sie Fehler.</p>
                </div>
                <Button size="sm" className="btn-premium text-xs" onClick={() => { loadAssignments() }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Aktualisieren
                </Button>
              </div>

              {!selectedAssignment ? (
                <>
                  {/* Share new assignment */}
                  <Card className="glass-card border-0 mb-6">
                    <CardContent className="py-6">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                          <Send className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">Aufgabe freigeben</h3>
                          <p className="text-sm text-gray-500">Wählen Sie ein Material aus der Bibliothek und geben Sie es an Ihre Klasse weiter.</p>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { setShareModalOpen(true); loadAssignments() }}>
                          Material freigeben
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Share Modal */}
                  <AnimatePresence>
                    {shareModalOpen && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                        onClick={() => setShareModalOpen(false)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
                          onClick={(e) => e.stopPropagation()}>
                          <h3 className="text-lg font-bold text-gray-900 mb-4">Aufgabe freigeben</h3>
                          <div className="space-y-4">
                            <div>
                              <Label className="text-xs">Material auswählen</Label>
                              <select
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                value={shareForm.worksheetId || ''}
                                onChange={(e) => setShareForm(prev => ({ ...prev, worksheetId: e.target.value }))}
                              >
                                <option value="" disabled>Material wählen...</option>
                                {worksheets.map(ws => (
                                  <option key={ws.id} value={ws.id}>{ws.title} ({ws.subject})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">Klasse (optional)</Label>
                              <select
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                value={shareForm.classId || ''}
                                onChange={(e) => {
                                  const cls = teacherClasses.find(c => c.id === e.target.value)
                                  setShareForm(prev => ({ ...prev, classId: e.target.value, className: cls?.name || '' }))
                                }}
                              >
                                <option value="">Keine Klasse</option>
                                {teacherClasses.map(cls => (
                                  <option key={cls.id} value={cls.id}>{cls.name} ({(cls.enrolled_students || []).length} Schüler)</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">Niveau-Zuweisung (optional, Lehrplan 21)</Label>
                              <select
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                value={shareForm.targetNiveau || ''}
                                onChange={(e) => setShareForm(prev => ({ ...prev, targetNiveau: e.target.value }))}
                              >
                                <option value="">Alle Niveaus</option>
                                <option value="A">A — Grundanforderungen</option>
                                <option value="B">B — Mittlere Anforderungen</option>
                                <option value="C">C — Erweiterte Anforderungen</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">Abgabefrist (optional)</Label>
                              <Input type="datetime-local" value={shareForm.deadline} onChange={(e) => setShareForm(prev => ({ ...prev, deadline: e.target.value }))}
                                className="mt-1 text-sm" />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" size="sm" onClick={() => setShareModalOpen(false)}>Abbrechen</Button>
                              <Button size="sm" className="btn-premium" disabled={!shareForm.worksheetId}
                                onClick={() => shareWorksheetAsAssignment(shareForm.worksheetId)}>
                                <Send className="h-3.5 w-3.5 mr-1" /> Freigeben
                              </Button>
                            </div>
                          </div>

                          <Separator className="my-4" />
                          <p className="text-xs text-gray-500">
                            Nach der Freigabe erhalten Sie einen Schüler-Link, der automatisch in die Zwischenablage kopiert wird. Teilen Sie diesen Link mit Ihrer Klasse.
                          </p>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Existing assignments */}
                  {assignments.length > 0 ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {assignments.map(a => (
                        <Card key={a.id} className="glass-card border-0 cursor-pointer hover:shadow-lg transition-all group relative" onClick={() => loadSubmissions(a.id)}>
                          <CardContent className="py-4">
                            <div className="flex items-center justify-between mb-2">
                              <Badge className={`text-xs ${a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {a.status === 'active' ? 'Aktiv' : 'Geschlossen'}
                              </Badge>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{a.code}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(a.id) }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                                  title="Aufgabe löschen"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-400 hover:text-red-600" />
                                </button>
                              </div>
                            </div>
                            <p className="font-medium text-gray-900 text-sm truncate">{a.worksheet_title || a.class_name || 'Alle Schüler'}</p>
                            <p className="text-xs text-gray-500 mt-1">{a.class_name ? `${a.class_name} · ` : ''}{new Date(a.created_at).toLocaleDateString('de-CH')}</p>
                            {a.submission_count > 0 && <p className="text-xs text-blue-600 mt-1">{a.submission_count} Abgabe{a.submission_count !== 1 ? 'n' : ''}</p>}
                            {a.deadline && <p className="text-xs text-amber-600 mt-1">Frist: {new Date(a.deadline).toLocaleDateString('de-CH')}</p>}
                            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100" onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] text-gray-500 mb-1">Schüler-Link:</p>
                              <div className="flex items-center gap-1.5">
                                <p className="text-[11px] font-mono text-blue-700 truncate flex-1">{window.location.origin}/schueler?code={a.code}</p>
                                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/schueler?code=${a.code}`); setSuccessMessage('Schüler-Link kopiert!') }}
                                  className="shrink-0 text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 transition-colors flex items-center gap-1">
                                  <Copy className="h-3 w-3" /> Kopieren
                                </button>
                              </div>
                            </div>
                          </CardContent>
                          {/* Delete confirmation overlay */}
                          {deleteConfirm === a.id && (
                            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
                              <p className="text-sm font-medium text-gray-900">Aufgabe löschen?</p>
                              <p className="text-xs text-gray-500 text-center px-4">Alle Abgaben werden ebenfalls gelöscht.</p>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="text-xs" onClick={() => setDeleteConfirm(null)}>Abbrechen</Button>
                                <Button size="sm" variant="destructive" className="text-xs" onClick={() => deleteAssignment(a.id)}>
                                  <Trash2 className="h-3 w-3 mr-1" /> Löschen
                                </Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="glass-card border-0"><CardContent className="py-16 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 rounded-2xl flex items-center justify-center"><User className="h-8 w-8 text-blue-400" /></div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">Noch keine Aufgaben freigegeben</h3>
                      <p className="text-gray-500 text-sm mb-4">Geben Sie ein Material frei, damit Schüler es digital lösen können.</p>
                      <Button onClick={() => setShareModalOpen(true)} className="btn-premium text-xs"><Send className="h-3.5 w-3.5 mr-1" /> Erste Aufgabe freigeben</Button>
                    </CardContent></Card>
                  )}
                </>
              ) : (
                /* Assignment detail + submissions + error analysis */
                <div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedAssignment(null); setAssignmentSubmissions([]); setErrorAnalysis(null) }} className="mb-4 text-xs">
                    <ArrowRight className="h-3.5 w-3.5 mr-1 rotate-180" /> Zurück zur Übersicht
                  </Button>

                  <Card className="glass-card border-0 mb-6">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{selectedAssignment.worksheet_title || selectedAssignment.class_name || 'Aufgabe'}</h3>
                          <p className="text-xs text-gray-500 mb-1">{selectedAssignment.class_name ? `${selectedAssignment.class_name} · ` : ''}Code: <span className="font-mono text-blue-600">{selectedAssignment.code}</span> · {assignmentSubmissions.length} Abgaben</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400 font-mono truncate max-w-[300px]">{typeof window !== 'undefined' ? `${window.location.origin}/schueler?code=${selectedAssignment.code}` : ''}</p>
                            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/schueler?code=${selectedAssignment.code}`); setSuccessMessage('Schüler-Link kopiert!') }}
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 flex-shrink-0">
                              <Copy className="h-3 w-3" /> Kopieren
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => loadClassOverview(selectedAssignment.id)}>
                            <Target className="h-3.5 w-3.5 mr-1" /> Klassenübersicht
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => runErrorAnalysis(selectedAssignment.id)} disabled={analysisLoading}>
                            {analysisLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5 mr-1" />}
                            Fehleranalyse
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Submissions table */}
                  {assignmentSubmissions.length > 0 && (
                    <Card className="glass-card border-0 mb-6 overflow-hidden">
                      <table className="w-full">
                        <thead><tr className="border-b bg-gray-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Name</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Punkte</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Note</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Ergebnis</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Zeit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Aktionen</th>
                        </tr></thead>
                        <tbody>
                          {assignmentSubmissions.map(sub => {
                            const grade = sub.swiss_grade || calcSwissGrade(sub.earned_points, sub.total_points)
                            return (
                            <tr key={sub.id} className="border-b last:border-0 hover:bg-gray-50/50 cursor-pointer"
                              onClick={() => setExpandedSubmission(expandedSubmission === sub.id ? null : sub.id)}>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{sub.student_name}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-600">
                                {sub.earned_points ?? sub.correct_count ?? '–'}/{sub.total_points ?? sub.total_questions}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-lg font-bold ${gradeColor(grade)}`}>{grade}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-sm font-bold ${sub.score_percentage >= 80 ? 'text-green-600' : sub.score_percentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {sub.score_percentage}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {sub.needs_review ? (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Prüfen</span>
                                ) : sub.teacher_reviewed ? (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Korrigiert</span>
                                ) : (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Fertig</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-500">
                                {sub.duration ? `${Math.floor(sub.duration / 60)}:${String(sub.duration % 60).padStart(2, '0')}` : '–'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={(e) => { e.stopPropagation(); exportCorrectedPDF(sub, selectedAssignment?.worksheet_title || selectedAssignment?.class_name) }}
                                  className="text-xs text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                  title="PDF exportieren"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>

                      {/* Expanded submission detail with teacher correction */}
                      {expandedSubmission && (() => {
                        const sub = assignmentSubmissions.find(s => s.id === expandedSubmission)
                        if (!sub || !sub.question_results) return null
                        const subGrade = sub.swiss_grade || calcSwissGrade(sub.earned_points, sub.total_points)
                        return (
                          <div className="border-t bg-gray-50/50 p-4">
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <h4 className="text-sm font-semibold text-gray-900">Detailkorrektur — {sub.student_name}</h4>
                                <span className={`text-lg font-bold ${gradeColor(subGrade)}`}>Note: {subGrade}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" className="text-xs" onClick={(e) => { e.stopPropagation(); exportCorrectedPDF(sub, selectedAssignment?.worksheet_title) }}>
                                  <Download className="h-3 w-3 mr-1" /> PDF
                                </Button>
                                <button onClick={(e) => { e.stopPropagation(); setExpandedSubmission(null); setEditingQuestion(null) }} className="text-xs text-gray-400 hover:text-gray-600">Schliessen</button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {sub.question_results.map((qr, qi) => (
                                <div key={qi} className={`p-3 rounded-lg text-sm ${
                                  qr.isCorrect === true ? 'bg-green-50 border border-green-200' :
                                  qr.isCorrect === 'partial' ? 'bg-yellow-50 border border-yellow-200' :
                                  qr.isCorrect === false ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-200'
                                }`}>
                                  <div className="flex items-start gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                      qr.isCorrect === true ? 'bg-green-200' :
                                      qr.isCorrect === 'partial' ? 'bg-yellow-200' :
                                      qr.isCorrect === false ? 'bg-red-200' : 'bg-gray-200'
                                    }`}>
                                      <span className="text-[10px] font-bold">{qr.questionNumber || qi + 1}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-gray-500 mb-1">{qr.question || `Frage ${qr.questionNumber || qi + 1}`}</p>
                                      <p className="text-sm"><span className="text-gray-400">Antwort:</span> {Array.isArray(qr.studentAnswer) ? qr.studentAnswer.join(', ') : String(qr.studentAnswer || '–')}</p>
                                      {qr.feedback && <p className="text-xs mt-1 font-medium text-gray-700">{qr.feedback}</p>}
                                      {qr.teacherComment && <p className="text-xs mt-1 text-blue-600 italic">Kommentar: {qr.teacherComment}</p>}
                                    </div>
                                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                                      <span className="text-sm font-bold">{qr.pointsAwarded ?? '–'}/{qr.maxPoints ?? 1}</span>
                                      <div className="flex items-center gap-1">
                                        {qr.teacherOverride && <span className="text-[10px] text-blue-500">Korrigiert</span>}
                                        {qr.aiGraded && !qr.teacherOverride && <span className="text-[10px] text-purple-500">KI</span>}
                                        {qr.needsManualReview && <span className="text-[10px] text-amber-500 font-bold">Prüfen</span>}
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEditingQuestion(editingQuestion?.subId === sub.id && editingQuestion?.qIndex === qi ? null : {
                                            subId: sub.id, qIndex: qi,
                                            points: qr.pointsAwarded ?? 0,
                                            feedback: qr.feedback || '',
                                            comment: qr.teacherComment || ''
                                          })
                                        }}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                                      >
                                        {editingQuestion?.subId === sub.id && editingQuestion?.qIndex === qi ? 'Abbrechen' : 'Korrigieren'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Inline editing form */}
                                  {editingQuestion?.subId === sub.id && editingQuestion?.qIndex === qi && (
                                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center gap-3">
                                        <Label className="text-xs w-16">Punkte:</Label>
                                        <div className="flex items-center gap-1">
                                          {Array.from({ length: (qr.maxPoints || 1) + 1 }, (_, i) => (
                                            <button key={i}
                                              className={`w-7 h-7 rounded text-xs font-bold transition-colors ${
                                                editingQuestion.points === i
                                                  ? i === (qr.maxPoints || 1) ? 'bg-green-500 text-white' : i === 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                                                  : 'bg-white border border-gray-300 hover:border-blue-400'
                                              }`}
                                              onClick={() => setEditingQuestion(prev => ({ ...prev, points: i }))}
                                            >{i}</button>
                                          ))}
                                          <span className="text-xs text-gray-400 ml-1">/ {qr.maxPoints || 1}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-start gap-3">
                                        <Label className="text-xs w-16 mt-1.5">Feedback:</Label>
                                        <Input
                                          value={editingQuestion.feedback}
                                          onChange={(e) => setEditingQuestion(prev => ({ ...prev, feedback: e.target.value }))}
                                          placeholder="Feedback zur Antwort..."
                                          className="text-xs h-8 flex-1"
                                        />
                                      </div>
                                      <div className="flex items-start gap-3">
                                        <Label className="text-xs w-16 mt-1.5">Kommentar:</Label>
                                        <Input
                                          value={editingQuestion.comment}
                                          onChange={(e) => setEditingQuestion(prev => ({ ...prev, comment: e.target.value }))}
                                          placeholder="Persönlicher Kommentar für Schüler..."
                                          className="text-xs h-8 flex-1"
                                        />
                                      </div>
                                      <div className="flex justify-end">
                                        <Button size="sm" className="text-xs btn-premium" onClick={() => {
                                          saveTeacherGrade(sub.id, qi, editingQuestion.points, editingQuestion.feedback, editingQuestion.comment)
                                        }}>
                                          <CheckCircle2 className="h-3 w-3 mr-1" /> Speichern
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </Card>
                  )}

                  {/* Klassenübersicht (Class Overview) */}
                  {classOverview && classOverview.stats && classOverviewOpen && (
                    <Card className="glass-card border-0 mb-6">
                      <CardHeader className="pb-3 cursor-pointer" onClick={() => setClassOverviewOpen(!classOverviewOpen)}>
                        <CardTitle className="text-lg flex items-center justify-between">
                          <span className="flex items-center gap-2"><Target className="h-5 w-5 text-blue-500" /> Klassenübersicht — Notenspiegel</span>
                          <button onClick={(e) => { e.stopPropagation(); setClassOverview(null) }} className="text-xs text-gray-400 hover:text-gray-600">Schliessen</button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Stats overview */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <p className={`text-2xl font-bold ${gradeColor(classOverview.stats.averageGrade)}`}>{classOverview.stats.averageGrade}</p>
                            <p className="text-xs text-gray-600">Ø Note</p>
                          </div>
                          <div className="bg-green-50 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-green-600">{classOverview.stats.bestGrade}</p>
                            <p className="text-xs text-gray-600">Beste Note</p>
                          </div>
                          <div className="bg-purple-50 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-purple-600">{classOverview.stats.passRate}%</p>
                            <p className="text-xs text-gray-600">Bestanden (≥4)</p>
                          </div>
                          <div className="bg-amber-50 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-amber-600">{classOverview.stats.averageScore}%</p>
                            <p className="text-xs text-gray-600">Ø Punkte</p>
                          </div>
                        </div>

                        {/* Grade distribution bar chart */}
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">Notenverteilung</p>
                          <div className="flex items-end gap-1 h-32">
                            {Object.entries(classOverview.stats.gradeDistribution).map(([grade, count]) => {
                              const maxCount = Math.max(...Object.values(classOverview.stats.gradeDistribution), 1)
                              const heightPct = count > 0 ? Math.max((count / maxCount) * 100, 8) : 0
                              const gNum = parseFloat(grade)
                              const bg = gNum >= 5.5 ? 'bg-green-500' : gNum >= 4.5 ? 'bg-green-400' : gNum >= 4 ? 'bg-amber-400' : gNum >= 3 ? 'bg-orange-400' : 'bg-red-400'
                              return (
                                <div key={grade} className="flex-1 flex flex-col items-center gap-1">
                                  {count > 0 && <span className="text-[10px] font-bold text-gray-600">{count}</span>}
                                  <div className={`w-full rounded-t ${bg} transition-all`} style={{ height: `${heightPct}%`, minHeight: count > 0 ? '4px' : '0' }} />
                                  <span className="text-[9px] text-gray-500 font-medium">{grade}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Student ranking */}
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">Alle Schüler</p>
                          <div className="space-y-1 max-h-60 overflow-y-auto">
                            {classOverview.students
                              .sort((a, b) => b.swissGrade - a.swissGrade)
                              .map((s, i) => (
                                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-sm">
                                  <span className="w-5 text-xs text-gray-400 text-right">{i + 1}.</span>
                                  <span className="flex-1 font-medium text-gray-900">{s.name}</span>
                                  <span className="text-xs text-gray-500">{s.earnedPoints}/{s.totalPoints}P</span>
                                  <span className="text-xs text-gray-500">{s.scorePercentage}%</span>
                                  <span className={`text-sm font-bold w-8 text-right ${gradeColor(s.swissGrade)}`}>{s.swissGrade}</span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Pass/Fail summary */}
                        <div className="flex gap-3">
                          <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-green-600">{classOverview.stats.passing}</p>
                            <p className="text-xs text-gray-600">Bestanden</p>
                          </div>
                          <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-red-600">{classOverview.stats.failing}</p>
                            <p className="text-xs text-gray-600">Nicht bestanden</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Error Analysis Results */}
                  {errorAnalysis && (
                    <div className="space-y-4">
                      <Card className="glass-card border-0">
                        <CardHeader className="pb-3 cursor-pointer" onClick={() => setErrorAnalysisOpen(!errorAnalysisOpen)}>
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-purple-500" /> Fehleranalyse</span>
                            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${errorAnalysisOpen ? 'rotate-180' : ''}`} />
                          </CardTitle>
                        </CardHeader>
                        {errorAnalysisOpen && <CardContent className="space-y-4">
                          {/* Class overview */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                              <p className="text-2xl font-bold text-blue-600">{errorAnalysis.totalSubmissions}</p>
                              <p className="text-xs text-gray-600">Abgaben</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-3 text-center">
                              <p className="text-2xl font-bold text-green-600">{errorAnalysis.averageScore}%</p>
                              <p className="text-xs text-gray-600">Durchschnitt</p>
                            </div>
                            <div className="bg-red-50 rounded-xl p-3 text-center">
                              <p className="text-2xl font-bold text-red-600">
                                {errorAnalysis.questionAnalysis?.filter(q => q.errorRate > 50).length || 0}
                              </p>
                              <p className="text-xs text-gray-600">Problemfragen</p>
                            </div>
                          </div>

                          {/* Per-question analysis */}
                          <div className="space-y-2">
                            {(errorAnalysis.questionAnalysis || []).map((qa, qi) => (
                              <div key={qi} className={`flex items-center gap-3 p-3 rounded-lg ${qa.errorRate > 50 ? 'bg-red-50' : qa.errorRate > 25 ? 'bg-amber-50' : 'bg-green-50'}`}>
                                <div className="flex-shrink-0 w-8 text-center">
                                  <span className="text-xs font-bold text-gray-600">#{qa.questionNumber}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700 truncate">{qa.question}</p>
                                  {qa.commonErrors.length > 0 && (
                                    <p className="text-[10px] text-gray-500 mt-0.5">Häufige Fehler: {qa.commonErrors.map(e => typeof e.answer === 'string' ? e.answer : JSON.stringify(e.answer)).join(', ')}</p>
                                  )}
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  <span className={`text-sm font-bold ${qa.errorRate > 50 ? 'text-red-600' : qa.errorRate > 25 ? 'text-amber-600' : 'text-green-600'}`}>{qa.errorRate}%</span>
                                  <p className="text-[10px] text-gray-400">Fehlerquote</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* AI Analysis */}
                          {errorAnalysis.aiAnalysis && (
                            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                              <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1"><Sparkles className="h-3 w-3" /> KI-Analyse</p>
                              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{errorAnalysis.aiAnalysis}</div>
                            </div>
                          )}
                        </CardContent>}
                      </Card>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ============ EXPORTS VIEW ============ */}
          {activeView === 'exports' && (
            <motion.div key="exports" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-2">Export-Historie</h2>
                <p className="text-gray-600">Alle Ihre bisherigen Exporte auf einen Blick.</p>
              </div>
              {exportHistory.length === 0 ? (
                <Card className="glass-card border-0"><CardContent className="py-20 text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-blue-50 rounded-2xl flex items-center justify-center"><Download className="h-10 w-10 text-blue-400" /></div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Noch keine Exporte</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">Sobald Sie ein Material als PDF exportieren, erscheint es hier.</p>
                  <Button onClick={() => setActiveView('library')} variant="outline"><FolderOpen className="h-4 w-4 mr-2" /> Zur Bibliothek</Button>
                </CardContent></Card>
              ) : (
                <Card className="glass-card border-0 overflow-hidden"><div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b bg-gray-50/50">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Format</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Version</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Datum</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Aktion</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {exportHistory.map((entry) => { const ws = worksheets.find(w => w.id === entry.worksheetId); return (
                        <tr key={entry.id} className="hover:bg-blue-50/30">
                          <td className="px-6 py-4"><p className="text-sm font-medium text-gray-900 truncate max-w-[250px]">{entry.worksheetTitle}</p></td>
                          <td className="px-6 py-4"><Badge variant="outline" className="text-xs">{entry.format}</Badge></td>
                          <td className="px-6 py-4"><span className="text-sm text-gray-600">{entry.version}</span></td>
                          <td className="px-6 py-4"><span className="text-sm text-gray-600">{new Date(entry.exportedAt).toLocaleDateString('de-CH')}</span></td>
                          <td className="px-6 py-4 text-right">{ws ? (<Button size="sm" variant="outline" onClick={() => {
                            const ver = entry.version?.includes('Lehrer') ? 'teacher' : 'student'
                            if (entry.format === 'DOCX') handleExportDOCX(ws, ver)
                            else handleExportPDF(ws, ver)
                          }} className="text-xs"><Download className="h-3.5 w-3.5 mr-1" /> Erneut laden</Button>) : (<span className="text-xs text-gray-400">Material gelöscht</span>)}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div></Card>
              )}
            </motion.div>
          )}

          {/* ============ KLASSEN VIEW ============ */}
          {activeView === 'classes' && (
            <motion.div key="classes" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-6xl mx-auto">
              <OnboardingHint id="classes">
                Erstellen Sie Klassen und fügen Sie Ihre Schüler:innen hinzu. So können Sie Materialien gezielt zuweisen und den Lernfortschritt pro Klasse verfolgen.
              </OnboardingHint>
              <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-gradient mb-1">Klassenverwaltung</h2>
                  <p className="text-gray-600 text-sm">Klassen erstellen, Schüler verwalten und Niveaus zuweisen (Lehrplan 21).</p>
                </div>
                <Button size="sm" className="btn-premium text-xs" onClick={loadTeacherClasses}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Aktualisieren
                </Button>
              </div>

              {/* Create new class */}
              <Card className="glass-card border-0 mb-6">
                <CardContent className="py-4">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Neue Klasse erstellen</Label>
                      <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="z.B. 4a, 6b, Deutsch 5c..." className="mt-1 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && createClass()} />
                    </div>
                    <Button size="sm" className="btn-premium" onClick={createClass} disabled={!newClassName.trim() || classLoading}>
                      <PlusCircle className="h-3.5 w-3.5 mr-1" /> Erstellen
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Class list */}
                <div className="space-y-3">
                  {teacherClasses.length === 0 ? (
                    <Card className="glass-card border-0">
                      <CardContent className="py-12 text-center">
                        <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">Noch keine Klassen</p>
                        <p className="text-xs text-gray-400 mt-1">Erstellen Sie oben eine Klasse.</p>
                      </CardContent>
                    </Card>
                  ) : teacherClasses.map(cls => (
                    <Card key={cls.id} className={`glass-card border-0 cursor-pointer transition-all hover:shadow-lg ${selectedClass === cls.id ? 'ring-2 ring-blue-400' : ''}`}
                      onClick={() => loadClassDetail(cls.id)}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-gray-900">{cls.name}</h4>
                            <p className="text-xs text-gray-500">{(cls.enrolled_students || []).length} Schüler/innen</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">{cls.join_code || '–'}</p>
                            <p className="text-[10px] text-gray-400 mt-1">Beitritts-Code</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Class detail / Roster */}
                <div className="lg:col-span-2">
                  {classDetailData ? (
                    <>
                    <Card className="glass-card border-0">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">Klasse {classDetailData.name}</CardTitle>
                            <CardDescription>
                              Beitritts-Code: <span className="font-mono font-bold text-blue-600">{classDetailData.join_code || '–'}</span>
                              {' · '}{(classDetailData.enrolled_students || []).length} Schüler/innen
                            </CardDescription>
                          </div>
                          <Button variant="outline" size="sm" className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { if (confirm(`Klasse "${classDetailData.name}" wirklich löschen?`)) deleteClass(classDetailData.id) }}>
                            <Trash2 className="h-3 w-3 mr-1" /> Löschen
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Niveau legend */}
                        <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-xl">
                          <span className="text-xs font-semibold text-gray-600">Niveaus (Lehrplan 21):</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">A — Grundanforderungen</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">B — Mittlere Anforderungen</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">C — Erweiterte Anforderungen</span>
                        </div>

                        {(classDetailData.enrolled_students || []).length === 0 ? (
                          <div className="text-center py-8">
                            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Noch keine Schüler/innen beigetreten.</p>
                            <p className="text-xs text-gray-400 mt-1">Teilen Sie den Code <span className="font-mono font-bold text-blue-600">{classDetailData.join_code}</span> mit Ihren Schülern.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-gray-200">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Niveau</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">XP</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Level</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Streak</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Ø Note</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Prüfungen</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600"></th>
                              </tr></thead>
                              <tbody>
                                {(classDetailData.enrolled_students || []).map((s, i) => (
                                  <tr key={s.student_id} className="border-b last:border-0 hover:bg-gray-50/50">
                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{s.display_name}</td>
                                    <td className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        {['A', 'B', 'C'].map(n => (
                                          <button key={n} onClick={() => updateStudentNiveau(classDetailData.id, s.student_id, n)}
                                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                                              s.niveau === n
                                                ? n === 'A' ? 'bg-green-500 text-white' : n === 'B' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                                                : 'bg-white border border-gray-300 hover:border-blue-400 text-gray-500'
                                            }`}>
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm font-bold text-amber-600">{s.xp || 0}</td>
                                    <td className="px-3 py-2.5 text-center text-sm">{s.level || 1}</td>
                                    <td className="px-3 py-2.5 text-center text-sm">{s.streak || 0} 🔥</td>
                                    <td className={`px-3 py-2.5 text-center text-sm font-bold ${s.avg_grade ? gradeColor(s.avg_grade) : 'text-gray-400'}`}>
                                      {s.avg_grade || '–'}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm text-gray-600">{s.total_quizzes || 0}</td>
                                    <td className="px-3 py-2.5 text-right">
                                      <button onClick={() => removeStudentFromClass(classDetailData.id, s.student_id)}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Aus Klasse entfernen">
                                        <UserMinus className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Class-wide statistics */}
                    {classStats?.classStats && (
                      <Card className="glass-card border-0 mt-4">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-500" /> Klassenstatistik (alle Aufgaben)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                              <p className="text-xl font-bold text-blue-600">{classStats.classStats.totalAssignments}</p>
                              <p className="text-[10px] text-gray-500">Aufgaben</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-3 text-center">
                              <p className={`text-xl font-bold ${gradeColor(classStats.classStats.avgGrade)}`}>{classStats.classStats.avgGrade}</p>
                              <p className="text-[10px] text-gray-500">Ø Note</p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-3 text-center">
                              <p className="text-xl font-bold text-emerald-600">{classStats.classStats.passRate}%</p>
                              <p className="text-[10px] text-gray-500">Bestehensquote</p>
                            </div>
                            <div className="bg-purple-50 rounded-xl p-3 text-center">
                              <p className="text-xl font-bold text-purple-600">{classStats.classStats.totalSubmissions}</p>
                              <p className="text-[10px] text-gray-500">Abgaben total</p>
                            </div>
                          </div>

                          {/* Niveau breakdown */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-600">Durchschnitt nach Niveau:</p>
                            {['A', 'B', 'C'].map(n => {
                              const students = classStats.classStats.niveauStats?.[n] || []
                              const withGrades = students.filter(s => s.avg_grade)
                              const avg = withGrades.length > 0 ? Math.round(withGrades.reduce((sum, s) => sum + s.avg_grade, 0) / withGrades.length * 10) / 10 : null
                              return (
                                <div key={n} className="flex items-center gap-3">
                                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg ${
                                    n === 'A' ? 'bg-green-100 text-green-700' : n === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                  }`}>{n}</span>
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full">
                                    <div className={`h-full rounded-full ${n === 'A' ? 'bg-green-400' : n === 'B' ? 'bg-blue-400' : 'bg-purple-400'}`}
                                      style={{ width: avg ? `${Math.min((avg / 6) * 100, 100)}%` : '0%' }} />
                                  </div>
                                  <span className="text-xs font-bold text-gray-700 w-10 text-right">{avg || '–'}</span>
                                  <span className="text-[10px] text-gray-400 w-16 text-right">{students.length} SuS</span>
                                </div>
                              )
                            })}
                          </div>

                          {/* Assignments overview */}
                          {classStats.assignments?.length > 0 && (
                            <div className="mt-4">
                              <p className="text-xs font-semibold text-gray-600 mb-2">Aufgaben-Übersicht:</p>
                              <div className="space-y-1.5">
                                {classStats.assignments.map(a => (
                                  <div key={a.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-900 truncate">{a.title}</p>
                                      <p className="text-[10px] text-gray-400">{a.submission_count} Abgaben{a.target_niveau ? ` · Niveau ${a.target_niveau}` : ''}</p>
                                    </div>
                                    <span className={`text-sm font-bold ${a.avg_grade ? gradeColor(a.avg_grade) : 'text-gray-300'}`}>
                                      {a.avg_grade || '–'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* AI Learning Insights */}
                    <Card className="glass-card border-0 mt-4">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-500" /> AI-Lerncoach Insights</CardTitle>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => loadClassInsights(classDetailData.id)} disabled={insightsLoading}>
                            {insightsLoading ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Analysiert...</> : <><Sparkles className="h-3 w-3 mr-1" /> Klasse analysieren</>}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {!classInsights && !insightsLoading && (
                          <p className="text-xs text-gray-400 text-center py-4">Klicken Sie "Klasse analysieren" für KI-gestützte Empfehlungen zu Schwächen und Fördermassnahmen.</p>
                        )}

                        {classInsights && (
                          <div className="space-y-4">
                            {/* Students needing help */}
                            {classInsights.students?.filter(s => s.needsHelp).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-red-600 mb-2">⚠️ Schüler/innen mit Förderbedarf:</p>
                                <div className="space-y-2">
                                  {classInsights.students.filter(s => s.needsHelp).map(s => (
                                    <div key={s.student_id} className="flex items-center gap-3 p-2.5 bg-red-50 rounded-xl">
                                      <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-bold text-red-600">{s.errorRate}%</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-900">{s.display_name} <span className={`text-[10px] px-1 py-0.5 rounded ${s.niveau === 'A' ? 'bg-green-100 text-green-700' : s.niveau === 'C' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>Niveau {s.niveau}</span></p>
                                        <p className="text-[10px] text-gray-500 truncate">Schwächen: {s.weakTopics.map(t => t.topic).join(', ')}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Topic weaknesses across class */}
                            {classInsights.topicWeaknesses?.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-amber-600 mb-2">📊 Schwache Themen der Klasse:</p>
                                <div className="space-y-1.5">
                                  {classInsights.topicWeaknesses.slice(0, 5).map((tw, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2 bg-amber-50 rounded-lg">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-900">{tw.topic} <span className="text-[10px] text-gray-400">({tw.subject})</span></p>
                                        <p className="text-[10px] text-gray-500">{tw.affectedStudents}/{tw.totalStudents} Schüler betroffen · {tw.errorRate}% Fehler</p>
                                      </div>
                                      <div className="w-16 h-1.5 bg-amber-200 rounded-full flex-shrink-0">
                                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${tw.errorRate}%` }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* AI Recommendations */}
                            {classInsights.recommendations && (
                              <div>
                                <p className="text-xs font-semibold text-emerald-600 mb-2">💡 KI-Empfehlungen:</p>
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                  <div className="prose prose-xs max-w-none text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                                    {classInsights.recommendations}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    </>
                  ) : (
                    <Card className="glass-card border-0">
                      <CardContent className="py-16 text-center">
                        <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-700 mb-1">Klasse auswählen</h3>
                        <p className="text-sm text-gray-400">Wählen Sie links eine Klasse, um die Schülerliste und Niveaus zu verwalten.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ============ DOSSIER EDITOR VIEW ============ */}
          {activeView === 'dossier-editor' && selectedDossier && (
            <motion.div key="dossier-editor" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto">
              <DossierEditor
                dossier={selectedDossier}
                onSave={handleSaveDossier}
                onBack={() => { setSelectedDossier(null); setActiveView('library') }}
                onExportPDF={handleExportDossierPDF}
                saving={dossierSaving}
                apiBase=""
              />
            </motion.div>
          )}

          {/* ============ SETTINGS VIEW ============ */}
          {activeView === 'settings' && (
            <SettingsView GRADES={GRADES} SUBJECTS={SUBJECTS} DIFFICULTY_LABELS={DIFFICULTY_LABELS} />
          )}

        </AnimatePresence>
      </main>

      {/* ====== COMMAND PALETTE ====== */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Aktion suchen..." />
        <CommandList>
          <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>
          <CommandGroup heading="Navigation & Aktionen">
            {commandActions.map((action, index) => (<CommandItem key={index} onSelect={action.action}><action.icon className="mr-2 h-4 w-4" /><span>{action.label}</span></CommandItem>))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* ====== AI CHAT ASSISTANT ====== */}
      <div className={`fixed ${editMode ? 'bottom-16' : 'bottom-6'} right-6 z-50 transition-all duration-300`}>
        <AnimatePresence>
          {chatOpen && (
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="mb-4 w-[380px] max-h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
              {/* Chat Header */}
              <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">EduFlow Assistent</p>
                      <p className="text-xs opacity-80">Ihr pädagogischer KI-Helfer</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)} className="text-white hover:bg-white/20 h-8 w-8 p-0"><X className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[340px]">
                {chatMessages.length === 0 && (
                  <div className="space-y-4">
                    {/* Welcome */}
                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-6 w-6 text-blue-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-800 mb-1">Hallo! Ich bin Ihr EduFlow-Assistent.</p>
                      <p className="text-xs text-gray-500">Ich helfe Ihnen beim Erstellen, Bearbeiten und Optimieren Ihrer Materialien.</p>
                    </div>
                    {/* Quick Actions */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Schnellaktionen</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { text: 'Arbeitsblatt erstellen', icon: FileText },
                          { text: 'Fragen vereinfachen', icon: ChevronDown },
                          { text: 'Prüfung vorbereiten', icon: ClipboardList },
                          { text: 'Lehrplan 21 nutzen', icon: GraduationCap },
                        ].map((action, i) => (
                          <button key={i} onClick={() => handleChatSend(action.text)}
                            className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left">
                            <action.icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-xs text-gray-700">{action.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Context-aware suggestions */}
                    {selectedWorksheet && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Für «{selectedWorksheet.title}»</p>
                        <div className="space-y-1.5">
                          {[
                            `Mach die Fragen in "${selectedWorksheet.title}" einfacher`,
                            'Erstelle eine differenzierte Version davon',
                            'Füge Bilderfragen hinzu',
                            'In eine Prüfung umwandeln',
                          ].map((s, i) => (
                            <button key={i} onClick={() => setChatInput(s)}
                              className="block w-full text-left text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg px-3 py-2 transition-smooth">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick reply chips after messages */}
              {chatMessages.length > 0 && !chatLoading && (
                <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto">
                  {(selectedWorksheet ? [
                    'Schwieriger machen', 'PDF exportieren', 'Mehr Fragen'
                  ] : [
                    'Neues Material', 'Vorlagen zeigen', 'Tipps geben'
                  ]).map((chip, i) => (
                    <button key={i} onClick={() => handleChatSend(chip)}
                      className="px-3 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 whitespace-nowrap transition-smooth flex-shrink-0">
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Input */}
              <div className="p-3 border-t bg-gray-50/50">
                <div className="flex gap-2">
                  <Input placeholder="Was kann ich für Sie tun?" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }} className="text-sm bg-white" />
                  <Button size="sm" onClick={handleChatSend} disabled={!chatInput.trim() || chatLoading} className="btn-premium px-3"><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Toggle Button */}
        <motion.button
          onClick={() => setChatOpen(!chatOpen)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-smooth ${chatOpen ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="KI-Assistent öffnen"
        >
          {chatOpen ? <X className="h-6 w-6 text-white" /> : <MessageCircle className="h-6 w-6 text-white" />}
        </motion.button>
      </div>

      {/* ====== STICKY SAVE BAR ====== */}
      <AnimatePresence>
        {editMode && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-6xl">
              <div className="flex items-center gap-3">
                {saveStatus === 'saved' && !hasUnsavedChanges && (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Gespeichert</span>
                  </div>
                )}
                {saveStatus === 'unsaved' && (
                  <div className="flex items-center gap-1.5 text-amber-600">
                    <CircleDot className="h-4 w-4" />
                    <span className="text-sm font-medium">Ungespeicherte Änderungen</span>
                  </div>
                )}
                {saveStatus === 'saving' && (
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <RefreshCw className="h-4 w-4" />
                    </motion.div>
                    <span className="text-sm font-medium">Speichert...</span>
                  </div>
                )}
                {saveStatus === 'autosaved' && (
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Automatisch gespeichert</span>
                  </div>
                )}
                <span className="text-xs text-gray-400">{editedQuestions.length} Fragen</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={cancelEdits} className="text-xs">
                  Abbrechen
                </Button>
                <Button variant="outline" size="sm" onClick={saveDraft} disabled={saveStatus === 'saving'} className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Save className="h-4 w-4 mr-1.5" /> Entwurf
                </Button>
                <Button size="sm" onClick={saveEdits} disabled={saveStatus === 'saving'} className="btn-premium text-xs px-6">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Speichern & Vorschau
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== GENERATION THEATER ====== */}
      <AnimatePresence>
        {showGenerationTheater && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="glass-card rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="text-center mb-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-block mb-4">
                  <Sparkles className="h-12 w-12 text-blue-500" />
                </motion.div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">KI erstellt Ihr Material</h2>
                <p className="text-gray-600 text-sm">Geschätzte Zeit: ~{Math.max(10, form.questionCount * 2)} Sekunden für {form.questionCount} Fragen</p>
              </div>
              <div className="space-y-3 mb-8">
                {generationProgress.map((stage, index) => (
                  <motion.div key={`${stage.step}-${index}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    className={`p-3 rounded-xl ${stage.type === 'question' ? 'bg-blue-50 border border-blue-200' : stage.type === 'complete' ? 'bg-green-50 border border-green-200' : 'bg-white/50'}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {stage.progress === 100 ? (<div className="h-8 w-8 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-white" /></div>)
                        : stage.type === 'question' ? (<div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">{stage.number || '?'}</div>)
                        : (<div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-5 w-5 border-2 border-white border-t-transparent rounded-full" /></div>)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">{stage.message}</p>
                        {stage.type === 'question' && stage.question && (<p className="text-xs text-gray-600 mt-1 italic truncate">«{stage.question}»</p>)}
                      </div>
                      <span className="text-xs font-semibold text-gray-500">{stage.progress}%</span>
                    </div>
                  </motion.div>
                ))}
              </div>
              {streamingQuestions.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border border-blue-200">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> Frage {streamingQuestions.length} von {form.questionCount} generiert</h3>
                  <div className="space-y-2">
                    {streamingQuestions.slice(-3).map((q) => (<div key={q.number} className="p-2.5 bg-white rounded-lg shadow-sm"><span className="font-semibold text-blue-600 text-xs">Frage {q.number}:</span><span className="ml-2 text-gray-700 text-xs">{q.question}</span></div>))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-600"><span>Gesamtfortschritt</span><span>{generationProgress.length > 0 ? generationProgress[generationProgress.length - 1].progress : 0}%</span></div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: generationProgress.length > 0 ? `${generationProgress[generationProgress.length - 1].progress}%` : '0%', backgroundSize: '200% 100%' }} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AppContent
