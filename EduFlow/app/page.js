'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
import { Switch } from '@/ui/switch'
import { Textarea } from '@/ui/textarea'
import {
  BookOpen, FileText, PlusCircle, Download, Trash2, RefreshCw,
  Crown, LogOut, Sparkles, Eye, Settings, Command as CommandIcon,
  Edit, Copy, BarChart3, Zap, Upload, LayoutTemplate, GraduationCap,
  Clock, Search, Filter, ChevronRight, ChevronDown, FolderOpen,
  FileType, Info, CheckCircle2, ArrowRight,
  Target, Layers, Printer,
  User, Bell, Lightbulb,
  MoreHorizontal, Calendar, Hash, Star, X,
  Languages, ClipboardList, MessageCircle, Send, PanelRightOpen,
  Minus,
  ListChecks, ToggleLeft, MessageSquare, Calculator, Image,
  ArrowLeftRight, Type, ListOrdered, GitBranch,
  ChevronUp, Wand2, Save, GripVertical, ArrowUp, ArrowDown,
  RotateCcw, Shuffle, Bot, CircleDot, Palette,
  AlignLeft, Pen, SquarePen, Users, UserMinus, LayoutDashboard, Brain, TrendingDown, Rocket
} from 'lucide-react'
import dynamic from 'next/dynamic'
import jsPDF from 'jspdf'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false, loading: () => <div className="h-24 bg-gray-50 rounded-lg animate-pulse" /> })
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel, UnderlineType } from 'docx'
import { saveAs } from 'file-saver'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/ui/command'
import { LEHRPLAN_CYCLES, searchCompetencies, getAllSubjects, getSubjectsForCycle, getCompetenciesForSubject, getTotalCompetencyCount } from '@/data/lehrplan21'

// ============================================================
// CONSTANTS
// ============================================================

const RESOURCE_TYPES = [
  { id: 'worksheet', label: 'Arbeitsblatt', icon: FileText, description: 'Klassische Aufgabenblätter mit verschiedenen Fragetypen', color: 'blue' },
  { id: 'exam', label: 'Prüfung', icon: ClipboardList, description: 'Benotete Prüfung mit Punkteverteilung und Lösungsschlüssel', color: 'red' },
  { id: 'quiz', label: 'Quiz', icon: Lightbulb, description: 'Kurze Lernkontrollen mit sofortigem Feedback', color: 'green' },
  { id: 'vocabulary', label: 'Wortschatz', icon: Languages, description: 'Vokabellisten mit Übungen und Abfragen', color: 'purple' },
]

const SUBJECTS = [
  'Deutsch', 'Mathematik', 'NMG', 'Englisch', 'Französisch',
  'Bildnerisches Gestalten', 'Musik', 'Bewegung und Sport'
]

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

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
  { id: 't1', name: 'Leseverständnis Kurztext', subject: 'Deutsch', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 6, description: 'Kurztext mit Verständnisfragen und Wortschatzübung', tags: ['Lesen', 'Wortschatz'] },
  { id: 't2', name: 'Leseverständnis Sachtext', subject: 'Deutsch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Sachtext lesen, Informationen entnehmen und Fragen beantworten', tags: ['Lesen', 'Textarbeit'] },
  { id: 't3', name: 'Diktat-Vorlage', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 10, description: 'Standardvorlage für wöchentliche Diktate', tags: ['Schreiben', 'Rechtschreibung'] },
  { id: 't4', name: 'Wochenplan-Aufgaben', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 12, description: 'Gemischte Aufgaben für die Wochenplanarbeit', tags: ['Wochenplan', 'Gemischt'] },
  { id: 't5', name: 'Textanalyse Erzählung', subject: 'Deutsch', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Erzähltext analysieren: Aufbau, Figuren, Spannungskurve', tags: ['Textanalyse', 'Literatur'] },
  { id: 't6', name: 'Argumentieren & Diskutieren', subject: 'Deutsch', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'hard', questionCount: 6, description: 'Argumente formulieren, Pro/Contra abwägen, Stellungnahme schreiben', tags: ['Argumentieren', 'Schreiben'] },
  { id: 't7', name: 'Satzglieder bestimmen', subject: 'Deutsch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Subjekt, Prädikat, Objekte, Adverbiale erkennen und bestimmen', tags: ['Grammatik', 'Satzglieder'] },
  { id: 't8', name: 'Bericht schreiben', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 5, description: 'Aufbau und Merkmale eines Berichts üben (W-Fragen, sachlicher Stil)', tags: ['Schreiben', 'Bericht'] },
  { id: 't9', name: 'Buchstaben & Laute', subject: 'Deutsch', grade: '1', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Buchstaben erkennen, Anlaute zuordnen, erste Wörter lesen', tags: ['Erstlesen', 'Zyklus 1'] },
  { id: 't10', name: 'Gedichte verstehen', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 6, description: 'Gedichte lesen, Reimschema erkennen, Stilmittel benennen', tags: ['Lyrik', 'Literatur'] },
  // Mathematik
  { id: 't11', name: 'Multiplikations-Drill', subject: 'Mathematik', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 15, description: 'Einmaleins-Training mit aufsteigender Schwierigkeit', tags: ['Rechnen', 'Grundlagen'] },
  { id: 't12', name: 'Sachaufgaben Alltag', subject: 'Mathematik', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Textaufgaben aus dem Alltag der Schüler', tags: ['Rechnen', 'Textaufgaben'] },
  { id: 't13', name: 'Geometrie Formen', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Formen erkennen, benennen, Eigenschaften beschreiben', tags: ['Geometrie', 'Formen'] },
  { id: 't14', name: 'Hausaufgabenblatt', subject: 'Mathematik', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Kurze Hausaufgaben zur Festigung des Stoffes', tags: ['Hausaufgaben', 'Festigung'] },
  { id: 't15', name: 'Bruchrechnen Grundlagen', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 12, description: 'Brüche kürzen, erweitern, addieren und subtrahieren', tags: ['Brüche', 'Grundlagen'] },
  { id: 't16', name: 'Dezimalzahlen & Prozent', subject: 'Mathematik', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Umwandlung Bruch–Dezimalzahl–Prozent, Grundaufgaben', tags: ['Dezimalzahlen', 'Prozent'] },
  { id: 't17', name: 'Gleichungen lösen', subject: 'Mathematik', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Lineare Gleichungen schrittweise lösen', tags: ['Algebra', 'Gleichungen'] },
  { id: 't18', name: 'Fläche & Umfang', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Fläche und Umfang von Rechteck, Quadrat, Dreieck berechnen', tags: ['Geometrie', 'Berechnung'] },
  { id: 't19', name: 'Zahlenraum bis 100', subject: 'Mathematik', grade: '2', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 12, description: 'Addition und Subtraktion im Zahlenraum bis 100', tags: ['Rechnen', 'Zyklus 1'] },
  { id: 't20', name: 'Proportionalität & Dreisatz', subject: 'Mathematik', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'hard', questionCount: 8, description: 'Direkte und indirekte Proportionalität, Dreisatz anwenden', tags: ['Proportionalität', 'Dreisatz'] },
  // NMG
  { id: 't21', name: 'Unser Körper', subject: 'NMG', grade: '3', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Körperteile, Organe und ihre Funktionen kennenlernen', tags: ['Körper', 'Gesundheit'] },
  { id: 't22', name: 'Tiere im Wald', subject: 'NMG', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Waldtiere, Nahrungsketten, Lebensräume', tags: ['Tiere', 'Lebensraum'] },
  { id: 't23', name: 'Wetter & Klima', subject: 'NMG', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Wetterphänomene, Wasserkreislauf, Klimazonen der Schweiz', tags: ['Wetter', 'Klima'] },
  { id: 't24', name: 'Die Schweiz entdecken', subject: 'NMG', grade: '4', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Kantone, Geographie, Sprachen und Kultur der Schweiz', tags: ['Schweiz', 'Geographie'] },
  { id: 't25', name: 'Strom & Energie', subject: 'NMG', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Stromkreis, erneuerbare Energien, Energiesparen im Alltag', tags: ['Energie', 'Technik'] },
  // Englisch
  { id: 't26', name: 'My Daily Routine', subject: 'Englisch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Tagesablauf beschreiben, Present Simple üben', tags: ['Speaking', 'Writing'] },
  { id: 't27', name: 'Reading Comprehension', subject: 'Englisch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Englischen Text lesen und Verständnisfragen beantworten', tags: ['Reading', 'Comprehension'] },
  { id: 't28', name: 'Past Simple Stories', subject: 'Englisch', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Vergangenheitsform: regelmässige und unregelmässige Verben', tags: ['Grammar', 'Past Simple'] },
  // Französisch
  { id: 't29', name: 'Se présenter', subject: 'Französisch', grade: '5', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'easy', questionCount: 8, description: 'Sich vorstellen, Name, Alter, Hobbys auf Französisch', tags: ['Sprechen', 'Grundlagen'] },
  { id: 't30', name: 'Les verbes au présent', subject: 'Französisch', grade: '6', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 12, description: 'Verben konjugieren: être, avoir, -er Verben', tags: ['Grammatik', 'Verben'] },
  // Natur & Technik (Zyklus 3)
  { id: 't31', name: 'Zellen & Mikroskopieren', subject: 'Natur und Technik', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Pflanzliche und tierische Zellen, Mikroskop-Aufbau', tags: ['Biologie', 'Zellen'] },
  { id: 't32', name: 'Periodensystem Grundlagen', subject: 'Natur und Technik', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'hard', questionCount: 10, description: 'Elemente, Ordnungszahl, Gruppen und Perioden', tags: ['Chemie', 'PSE'] },
  { id: 't33', name: 'Kräfte & Bewegung', subject: 'Natur und Technik', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Schwerkraft, Reibung, Geschwindigkeit, Newtonsche Gesetze', tags: ['Physik', 'Mechanik'] },
  // RZG (Zyklus 3)
  { id: 't34', name: 'Mittelalter in der Schweiz', subject: 'RZG', grade: '7', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 8, description: 'Burgen, Ritter, Stadtgründungen, Eidgenossenschaft', tags: ['Geschichte', 'Mittelalter'] },
  { id: 't35', name: 'Demokratie & Staatskunde', subject: 'RZG', grade: '8', type: 'worksheet', category: 'arbeitsblatt', difficulty: 'medium', questionCount: 10, description: 'Gewaltenteilung, Bundesrat, Volksinitiative, Referendum', tags: ['Staatskunde', 'Politik'] },

  // ============ PRÜFUNGEN ============
  { id: 't36', name: 'Bruchrechnen Prüfung', subject: 'Mathematik', grade: '6', type: 'exam', category: 'pruefung', difficulty: 'hard', questionCount: 12, description: 'Formale Prüfung zu Brüchen mit Notenskala', tags: ['Prüfung', 'Brüche'] },
  { id: 't37', name: 'Deutsch Grammatik-Test', subject: 'Deutsch', grade: '5', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 15, description: 'Grammatikprüfung: Zeiten, Fälle, Satzglieder', tags: ['Prüfung', 'Grammatik'] },
  { id: 't38', name: 'NMG Lernzielkontrolle', subject: 'NMG', grade: '4', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 10, description: 'Themenabschluss-Prüfung für NMG', tags: ['Prüfung', 'Sachunterricht'] },
  { id: 't39', name: 'Repetitionstest Mathe', subject: 'Mathematik', grade: '5', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 15, description: 'Wiederholungsprüfung über mehrere Themen', tags: ['Repetition', 'Gemischt'] },
  { id: 't40', name: 'Schnelltest 10 Min', subject: 'Deutsch', grade: '3', type: 'exam', category: 'pruefung', difficulty: 'easy', questionCount: 5, description: 'Kurzer Schnelltest für den Stundenbeginn', tags: ['Schnelltest', 'Kurz'] },
  { id: 't41', name: 'Englisch Halbjahrsprüfung', subject: 'Englisch', grade: '6', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 20, description: 'Vocabulary, Grammar, Reading Comprehension', tags: ['Prüfung', 'Halbjahr'] },
  { id: 't42', name: 'Französisch Unité-Test', subject: 'Französisch', grade: '6', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 15, description: 'Abschlusstest einer Unité: Vokabeln, Grammatik, Leseverständnis', tags: ['Prüfung', 'Unité'] },
  { id: 't43', name: 'Algebra Lernkontrolle', subject: 'Mathematik', grade: '8', type: 'exam', category: 'pruefung', difficulty: 'hard', questionCount: 10, description: 'Gleichungen, Ungleichungen, Terme vereinfachen', tags: ['Prüfung', 'Algebra'] },
  { id: 't44', name: 'Aufsatz-Prüfung', subject: 'Deutsch', grade: '7', type: 'exam', category: 'pruefung', difficulty: 'hard', questionCount: 3, description: 'Erörterung oder Erzählung schreiben mit Bewertungskriterien', tags: ['Prüfung', 'Schreiben'] },
  { id: 't45', name: 'NT Lernkontrolle Biologie', subject: 'Natur und Technik', grade: '7', type: 'exam', category: 'pruefung', difficulty: 'medium', questionCount: 12, description: 'Zellen, Organe, Ökosysteme – Grundlagen der Biologie', tags: ['Prüfung', 'Biologie'] },

  // ============ QUIZZE ============
  { id: 't46', name: 'NMG Lernkontrolle', subject: 'NMG', grade: '4', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 10, description: 'Kurze Lernkontrolle zu NMG-Themen', tags: ['Quiz', 'Sachunterricht'] },
  { id: 't47', name: 'Wahr oder Falsch', subject: 'NMG', grade: '5', type: 'quiz', category: 'quiz', difficulty: 'easy', questionCount: 10, description: 'Aussagen bewerten – stimmt das wirklich?', tags: ['Quiz', 'Wahr/Falsch'] },
  { id: 't48', name: 'Kopfrechnen-Quiz', subject: 'Mathematik', grade: '4', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 15, description: 'Schnelles Kopfrechnen mit aufsteigendem Schwierigkeitsgrad', tags: ['Quiz', 'Kopfrechnen'] },
  { id: 't49', name: 'Kantone-Quiz', subject: 'NMG', grade: '5', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 12, description: 'Schweizer Kantone, Hauptorte und Wappen erkennen', tags: ['Quiz', 'Schweiz'] },
  { id: 't50', name: 'Englisch Irregular Verbs', subject: 'Englisch', grade: '6', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 20, description: 'Unregelmässige Verben: Infinitive, Past Simple, Past Participle', tags: ['Quiz', 'Verben'] },
  { id: 't51', name: 'Wortarten-Quiz', subject: 'Deutsch', grade: '4', type: 'quiz', category: 'quiz', difficulty: 'medium', questionCount: 12, description: 'Nomen, Verben, Adjektive – Wörter richtig zuordnen', tags: ['Quiz', 'Grammatik'] },
  { id: 't52', name: 'Einmaleins-Blitz', subject: 'Mathematik', grade: '3', type: 'quiz', category: 'quiz', difficulty: 'easy', questionCount: 20, description: 'Schnelles Einmaleins-Training mit allen Reihen', tags: ['Quiz', 'Einmaleins'] },
  { id: 't53', name: 'Tier-Quiz Schweiz', subject: 'NMG', grade: '3', type: 'quiz', category: 'quiz', difficulty: 'easy', questionCount: 10, description: 'Heimische Tiere erkennen und Fakten wissen', tags: ['Quiz', 'Tiere'] },

  // ============ SOZIALFORMEN ============
  { id: 't54', name: 'Partnerarbeit Deutsch', subject: 'Deutsch', grade: '5', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 6, description: 'Aufgaben für die Arbeit zu zweit – gegenseitig abfragen', tags: ['Partnerarbeit', 'Kooperativ'] },
  { id: 't55', name: 'Gruppenarbeit Forschen', subject: 'NMG', grade: '5', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 5, description: 'Forschungsaufträge für Gruppen mit Präsentation', tags: ['Gruppenarbeit', 'Forschen'] },
  { id: 't56', name: 'Lernstationen Mathe', subject: 'Mathematik', grade: '4', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 8, description: 'Stationsarbeit mit unterschiedlichen Aufgabentypen', tags: ['Stationen', 'Differenziert'] },
  { id: 't57', name: 'Lerntempoduett', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 8, description: 'Zwei Niveaus: Schnelle helfen Langsameren, alle lernen', tags: ['Kooperativ', 'Differenziert'] },
  { id: 't58', name: 'Placemat-Methode', subject: 'NMG', grade: '6', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 4, description: 'Vierergruppen: Erst einzeln denken, dann gemeinsam diskutieren', tags: ['Placemat', 'Kooperativ'] },
  { id: 't59', name: 'Expertengruppen Jigsaw', subject: 'Deutsch', grade: '7', type: 'worksheet', category: 'sozial', difficulty: 'medium', questionCount: 6, description: 'Jigsaw-Methode: Jeder wird Experte für ein Thema', tags: ['Jigsaw', 'Kooperativ'] },

  // ============ WORTSCHATZ ============
  { id: 't60', name: 'Vokabeltest Englisch', subject: 'Englisch', grade: '5', type: 'vocabulary', category: 'wortschatz', difficulty: 'medium', questionCount: 20, description: 'Wörterliste mit Übersetzungsübungen', tags: ['Vokabeln', 'Englisch'] },
  { id: 't61', name: 'Französisch Grundwortschatz', subject: 'Französisch', grade: '5', type: 'vocabulary', category: 'wortschatz', difficulty: 'easy', questionCount: 25, description: 'Basisvokabular mit Übungen', tags: ['Vokabeln', 'Französisch'] },
  { id: 't62', name: 'Lückentext Sprache', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'wortschatz', difficulty: 'medium', questionCount: 10, description: 'Lückentext zum Wortschatz und Sprachgefühl', tags: ['Lückentext', 'Wortschatz'] },
  { id: 't63', name: 'Fachwörter NMG', subject: 'NMG', grade: '5', type: 'vocabulary', category: 'wortschatz', difficulty: 'medium', questionCount: 15, description: 'Fachbegriffe aus dem NMG-Unterricht üben und zuordnen', tags: ['Fachbegriffe', 'NMG'] },
  { id: 't64', name: 'Fremdwörter Deutsch', subject: 'Deutsch', grade: '7', type: 'vocabulary', category: 'wortschatz', difficulty: 'medium', questionCount: 15, description: 'Häufige Fremdwörter verstehen und richtig verwenden', tags: ['Fremdwörter', 'Wortschatz'] },
  { id: 't65', name: 'Englisch Phrasal Verbs', subject: 'Englisch', grade: '8', type: 'vocabulary', category: 'wortschatz', difficulty: 'hard', questionCount: 20, description: 'Wichtige Phrasal Verbs: look up, give in, turn out...', tags: ['Phrasal Verbs', 'Advanced'] },

  // ============ ÜBUNGEN ============
  { id: 't66', name: 'Aufsatz-Training', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 5, description: 'Kriterienbasierte Schreibaufgabe mit Selbstbewertung', tags: ['Schreiben', 'Bewertung'] },
  { id: 't67', name: 'Differenzierte Aufgaben', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 12, description: 'Drei Niveaus: Basis, Erweitert, Profi', tags: ['Differenzierung', 'Niveaus'] },
  { id: 't68', name: 'Prüfungsvorbereitung', subject: 'Deutsch', grade: '6', type: 'worksheet', category: 'uebung', difficulty: 'hard', questionCount: 15, description: 'Gemischte Übungen zur Prüfungsvorbereitung', tags: ['Vorbereitung', 'Repetition'] },
  { id: 't69', name: 'Rechtschreib-Training', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 12, description: 'Häufige Fehlerwörter, Doppelkonsonanten, Dehnungs-h', tags: ['Rechtschreibung', 'Übung'] },
  { id: 't70', name: 'Terme vereinfachen', subject: 'Mathematik', grade: '7', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 15, description: 'Terme zusammenfassen, ausmultiplizieren, faktorisieren', tags: ['Algebra', 'Terme'] },
  { id: 't71', name: 'Hörverständnis Englisch', subject: 'Englisch', grade: '7', type: 'worksheet', category: 'uebung', difficulty: 'medium', questionCount: 8, description: 'Übungen zum Hörverstehen mit Lückentexten und Multiple Choice', tags: ['Listening', 'Comprehension'] },

  // ============ FÖRDERUNG ============
  { id: 't72', name: 'DaZ Grundwortschatz', subject: 'Deutsch', grade: '3', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 10, description: 'Deutsch als Zweitsprache: Alltagswörter mit Bildern', tags: ['DaZ', 'Grundwortschatz'] },
  { id: 't73', name: 'Leseförderung Silben', subject: 'Deutsch', grade: '2', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 8, description: 'Silbentraining, Silbenbögen, einfache Wörter erlesen', tags: ['Leseförderung', 'Silben'] },
  { id: 't74', name: 'Dyskalkulie Übungen', subject: 'Mathematik', grade: '3', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 10, description: 'Grundlegendes Mengenverständnis, Zahlzerlegung, Stellenwerte', tags: ['Dyskalkulie', 'Förderung'] },
  { id: 't75', name: 'Begabtenförderung Mathe', subject: 'Mathematik', grade: '5', type: 'worksheet', category: 'foerderung', difficulty: 'hard', questionCount: 6, description: 'Knobelaufgaben, Logikrätsel und Muster erkennen', tags: ['Begabtenförderung', 'Knobeln'] },
  { id: 't76', name: 'Lesen lernen Zyklus 1', subject: 'Deutsch', grade: '1', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 6, description: 'Erste Wörter und Sätze lesen, Bild-Wort-Zuordnung', tags: ['Erstlesen', 'Zyklus 1'] },
  { id: 't77', name: 'LRS-Training', subject: 'Deutsch', grade: '4', type: 'worksheet', category: 'foerderung', difficulty: 'easy', questionCount: 10, description: 'Lese-Rechtschreib-Schwäche: Visualisierung, Regeln, Merkwörter', tags: ['LRS', 'Förderung'] },

  // ============ DIGITAL & MI ============
  { id: 't78', name: 'Sicher im Internet', subject: 'Medien und Informatik', grade: '5', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 8, description: 'Passwortsicherheit, Datenschutz, Cybermobbing erkennen', tags: ['Medienkompetenz', 'Sicherheit'] },
  { id: 't79', name: 'Algorithmen verstehen', subject: 'Medien und Informatik', grade: '5', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 6, description: 'Einfache Algorithmen lesen, verstehen und selber erstellen', tags: ['Informatik', 'Algorithmen'] },
  { id: 't80', name: 'Fake News erkennen', subject: 'Medien und Informatik', grade: '7', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 8, description: 'Nachrichten prüfen, Quellen bewerten, Manipulation erkennen', tags: ['Medienkompetenz', 'Fake News'] },
  { id: 't81', name: 'Programmieren Grundlagen', subject: 'Medien und Informatik', grade: '6', type: 'worksheet', category: 'digital', difficulty: 'medium', questionCount: 6, description: 'Scratch/Blockly: Sequenz, Schleife, Bedingung verstehen', tags: ['Programmieren', 'Scratch'] },
  { id: 't82', name: 'Daten & Diagramme', subject: 'Medien und Informatik', grade: '5', type: 'worksheet', category: 'digital', difficulty: 'easy', questionCount: 8, description: 'Daten sammeln, ordnen und in Diagrammen darstellen', tags: ['Daten', 'Diagramme'] },
]

// LEHRPLAN_CYCLES imported from @/data/lehrplan21

// ============================================================
// MAIN COMPONENT
// ============================================================

const Home = () => {
  // Auth state
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })

  // App state
  const [worksheets, setWorksheets] = useState([])
  const [selectedWorksheet, setSelectedWorksheet] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activeView, setActiveView] = useState('home')
  const [showEditorPanel, setShowEditorPanel] = useState(false)
  const [hoveredCard, setHoveredCard] = useState(null)

  // Command Palette
  const [commandOpen, setCommandOpen] = useState(false)

  // Library state
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryFilterSubject, setLibraryFilterSubject] = useState('all')
  const [libraryFilterGrade, setLibraryFilterGrade] = useState('all')

  // Upload state
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadInstructions, setUploadInstructions] = useState('')
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false)
  const [uploadAnalysisComplete, setUploadAnalysisComplete] = useState(false)
  const fileInputRef = useRef(null)

  // Template state
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateFilterSubject, setTemplateFilterSubject] = useState('all')

  // Lehrplan state
  const [expandedCycle, setExpandedCycle] = useState(null)
  const [expandedArea, setExpandedArea] = useState(null)
  const [curriculumSearch, setCurriculumSearch] = useState('')
  const [curriculumFilterSubject, setCurriculumFilterSubject] = useState('all')
  const [curriculumFilterCycle, setCurriculumFilterCycle] = useState('all')
  const [competencyTracker, setCompetencyTracker] = useState({}) // { compCode: 'planned'|'in_progress'|'done' }
  const [showSequenceFor, setShowSequenceFor] = useState(null) // competency code

  // Export history state
  const [exportHistory, setExportHistory] = useState([])

  // Chat assistant state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Settings state
  const [settings, setSettings] = useState({
    defaultGrade: '3',
    defaultSubject: 'Deutsch',
    defaultDifficulty: 'medium',
    defaultQuestionCount: 10,
    includeTeacherNotes: true,
    includeAnswerKey: true,
    dyslexiaFont: false,
    emailNotifications: true,
    language: 'de-CH',
  })

  // Form state
  const [form, setForm] = useState({
    topic: '',
    grade: '3',
    subject: 'Deutsch',
    difficulty: 'medium',
    questionCount: 10,
    resourceType: 'worksheet',
    dyslexiaFont: false,
    competencyCode: ''
  })

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editedQuestions, setEditedQuestions] = useState([])
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'unsaved' | 'saving'
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [activeKiAction, setActiveKiAction] = useState(null) // { questionIndex, actionId }
  const [showQuestionTypeSelector, setShowQuestionTypeSelector] = useState(false) // index or false
  const [kiActionLoading, setKiActionLoading] = useState(false)

  // Draft / Status system
  const [worksheetStatuses, setWorksheetStatuses] = useState({}) // { worksheetId: 'draft'|'in_progress'|'complete' }
  const [showPostCreationBar, setShowPostCreationBar] = useState(false) // Show prominent actions after creating

  // Rich text editor toggle
  const [useRichEditor, setUseRichEditor] = useState(false)

  // Form question type preferences
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState([]) // empty = all/mixed

  // Template filter
  const [templateCategory, setTemplateCategory] = useState('all')

  // Image generation state
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageStyle, setImageStyle] = useState('educational')

  // Schuljahresplaner state
  const [showPlanner, setShowPlanner] = useState(false)
  const [plannerEvents, setPlannerEvents] = useState([])
  const [plannerMonth, setPlannerMonth] = useState(new Date().getMonth())
  const [plannerYear, setPlannerYear] = useState(new Date().getFullYear())
  const [plannerView, setPlannerView] = useState('month') // 'month' | 'week'
  const [plannerWeekStart, setPlannerWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().split('T')[0]
  })
  const [quickAddForm, setQuickAddForm] = useState({ date: '', title: '', type: 'material', subject: '' })

  // Schüler-Modus / Assignments
  const [assignments, setAssignments] = useState([])
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [assignmentSubmissions, setAssignmentSubmissions] = useState([])
  const [errorAnalysis, setErrorAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [expandedSubmission, setExpandedSubmission] = useState(null)
  const [errorAnalysisOpen, setErrorAnalysisOpen] = useState(true)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareForm, setShareForm] = useState({ className: '', classId: '', deadline: '', targetNiveau: '' })
  const [editingQuestion, setEditingQuestion] = useState(null) // { subId, qIndex, points, feedback, comment }
  const [classOverview, setClassOverview] = useState(null)
  const [classOverviewOpen, setClassOverviewOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Klassenverwaltung
  const [teacherClasses, setTeacherClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [classDetailData, setClassDetailData] = useState(null)
  const [newClassName, setNewClassName] = useState('')
  const [classLoading, setClassLoading] = useState(false)
  const [classStats, setClassStats] = useState(null)
  const [classInsights, setClassInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  // Collaboration
  const [comments, setComments] = useState([])
  const [versions, setVersions] = useState([])
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState('view')
  const [sharedWithMe, setSharedWithMe] = useState([])

  // Gamification
  const [studentProgress, setStudentProgress] = useState({ totalCreated: 0, totalExported: 0, streak: 0 })

  // Mobile nav
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    const savedToken = localStorage.getItem('teachertime_token')
    if (savedToken) {
      setToken(savedToken)
      fetchCurrentUser(savedToken)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('eduflow_export_history')
    if (saved) { try { setExportHistory(JSON.parse(saved)) } catch(e) {} }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('eduflow_settings')
    if (saved) { try { setSettings(prev => ({ ...prev, ...JSON.parse(saved) })) } catch(e) {} }
  }, [])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Persist competency tracker
  useEffect(() => {
    const saved = localStorage.getItem('eduflow_competency_tracker')
    if (saved) { try { setCompetencyTracker(JSON.parse(saved)) } catch(e) {} }
  }, [])

  useEffect(() => {
    if (Object.keys(competencyTracker).length > 0) {
      localStorage.setItem('eduflow_competency_tracker', JSON.stringify(competencyTracker))
    }
  }, [competencyTracker])

  // Load classes when switching to classes view
  useEffect(() => {
    if (activeView === 'classes' && token) loadTeacherClasses()
  }, [activeView])

  // ============================================================
  // AUTH
  // ============================================================

  const fetchCurrentUser = async (authToken) => {
    try {
      const response = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${authToken}` } })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        fetchWorksheets(authToken)
        loadAssignments(authToken)
        loadTeacherClasses(authToken)
      } else {
        localStorage.removeItem('teachertime_token')
        setToken(null)
      }
    } catch (error) {
      console.error('Fehler beim Laden des Nutzers:', error)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      })
      const data = await response.json()
      if (response.ok) {
        setToken(data.token)
        setUser(data.user)
        localStorage.setItem('teachertime_token', data.token)
        fetchWorksheets(data.token)
      } else {
        setError(data.error === 'Invalid credentials' ? 'E-Mail oder Passwort ist falsch.' :
                 data.error === 'User already exists' ? 'Diese E-Mail-Adresse ist bereits registriert.' :
                 data.error || 'Ein Fehler ist aufgetreten.')
      }
    } catch (error) {
      setError('Verbindungsfehler. Bitte versuchen Sie es erneut.')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('teachertime_token')
    setToken(null)
    setUser(null)
    setWorksheets([])
  }

  // ============================================================
  // WORKSHEETS
  // ============================================================

  const fetchWorksheets = async (authToken) => {
    try {
      const response = await fetch('/api/worksheets', { headers: { 'Authorization': `Bearer ${authToken || token}` } })
      if (response.ok) { setWorksheets(await response.json()) }
    } catch (error) {
      console.error('Fehler beim Laden der Materialien:', error)
    }
  }

  const [generationProgress, setGenerationProgress] = useState([])
  const [streamingQuestions, setStreamingQuestions] = useState([])
  const [showGenerationTheater, setShowGenerationTheater] = useState(false)

  const handleGenerate = async (e) => {
    e.preventDefault()
    setError('')
    setGenerating(true)
    setGenerationProgress([])
    setStreamingQuestions([])
    setShowGenerationTheater(true)

    try {
      const response = await fetch('/api/generate-worksheet-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...form, questionTypes: selectedQuestionTypes.length > 0 ? selectedQuestionTypes : undefined })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Generierung fehlgeschlagen')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'status') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: data.message, progress: data.progress, type: 'status' }])
              } else if (data.type === 'question') {
                setStreamingQuestions(prev => [...prev, { number: data.number, question: data.question }])
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: `Frage ${data.number} erstellt...`, progress: data.progress, type: 'question', question: data.question }])
              } else if (data.type === 'complete') {
                setGenerationProgress(prev => [...prev, { step: prev.length + 1, message: 'Arbeitsblatt erfolgreich erstellt!', progress: 100, type: 'complete' }])
                await new Promise(resolve => setTimeout(resolve, 1500))
                setSelectedWorksheet(data.worksheet)
                setShowEditorPanel(true)
                setShowGenerationTheater(false)
                setShowPostCreationBar(true)
                fetchWorksheets(token)
                fetchCurrentUser(token)
                setSuccessMessage('Ihr Material wurde erfolgreich erstellt. Klicken Sie auf «Bearbeiten» um es anzupassen.')
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              if (parseError.message !== 'Generierung fehlgeschlagen') console.error('Parse-Fehler:', parseError)
              else throw parseError
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming-Fehler:', error)
      setError(error.message || 'Fehler bei der Generierung. Bitte versuchen Sie es erneut.')
      setShowGenerationTheater(false)
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async (worksheetId, newDifficulty) => {
    setGenerating(true)
    try {
      const response = await fetch('/api/regenerate-worksheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ worksheetId, newDifficulty })
      })
      const data = await response.json()
      if (response.ok) {
        setSelectedWorksheet(data)
        fetchWorksheets(token)
        setSuccessMessage('Material wurde mit neuer Schwierigkeit neu generiert.')
      }
    } catch (error) { setError('Fehler bei der Neugenerierung.') }
    finally { setGenerating(false) }
  }

  const handleDelete = async (worksheetId) => {
    try {
      await fetch(`/api/worksheets/${worksheetId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      fetchWorksheets(token)
      if (selectedWorksheet?.id === worksheetId) { setSelectedWorksheet(null); setShowEditorPanel(false) }
      setSuccessMessage('Material wurde gelöscht.')
    } catch (error) { setError('Fehler beim Löschen.') }
  }

  const handleDuplicate = async (worksheet) => {
    const duplicate = { ...worksheet, id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), title: `${worksheet.title} (Kopie)`, created_at: new Date().toISOString() }
    setWorksheets(prev => [duplicate, ...prev])
    setSuccessMessage('Material wurde dupliziert.')
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
  }

  const generatePDF = (worksheet, version = 'student') => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const isExam = worksheet.resourceType === 'exam' || worksheet.content?.resourceType === 'exam'
    const isQuiz = worksheet.resourceType === 'quiz' || worksheet.content?.resourceType === 'quiz'
    const isVocab = worksheet.resourceType === 'vocabulary' || worksheet.content?.resourceType === 'vocabulary'
    const showPoints = isExam // Only exams show points
    let yPosition = 20

    const checkPage = (needed = 40) => {
      if (yPosition > pageHeight - needed) { doc.addPage(); yPosition = 20 }
    }

    // ---- EXAM HEADER ----
    if (isExam) {
      // Formal exam header
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Schule: ___________________________________________', 20, yPosition)
      doc.text(`Datum: ______________`, pageWidth - 70, yPosition)
      yPosition += 10

      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('PRÜFUNG', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.setFontSize(14)
      const titleText = worksheet.title || worksheet.content?.title || 'Prüfung'
      const titleLines = doc.splitTextToSize(titleText, pageWidth - 40)
      doc.text(titleLines, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += titleLines.length * 7 + 4

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 7

      if (version === 'student') {
        doc.setFontSize(11)
        doc.text('Vorname / Name: ______________________________________', 20, yPosition)
        yPosition += 8
        // Exam info box
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.5)
        doc.rect(20, yPosition, pageWidth - 40, 22)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(`Anzahl Aufgaben: ${worksheet.content?.questions?.length || '–'}`, 25, yPosition + 7)
        doc.text(`Maximale Punktzahl: ${worksheet.content?.total_points || '–'}`, 25, yPosition + 14)
        doc.text(`Zeit: ${worksheet.content?.estimated_time || '–'}`, pageWidth / 2, yPosition + 7)
        doc.text('Erreichte Punkte: _______ ', pageWidth / 2, yPosition + 14)
        doc.setLineWidth(0.2)
        yPosition += 28
        // Grading scale
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
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
      // ---- WORKSHEET / QUIZ / VOCAB HEADER ----
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      const titleText = worksheet.title || worksheet.content?.title || 'Material'
      const titleLines = doc.splitTextToSize(titleText, pageWidth - 40)
      doc.text(titleLines, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += titleLines.length * 8 + 2

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 5

      if (version === 'student') {
        yPosition += 5
        doc.setFontSize(11)
        doc.text('Name: ____________________________________________     Datum: ______________', 20, yPosition)
        yPosition += 10
      } else {
        yPosition += 3
        doc.setFontSize(9)
        doc.setTextColor(180, 0, 0)
        doc.setFont('helvetica', 'bold')
        doc.text('LEHRERVERSION – MIT LÖSUNGEN', pageWidth / 2, yPosition, { align: 'center' })
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        yPosition += 10
      }
    }

    doc.setDrawColor(200, 200, 200)
    doc.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 10

    // Questions - type-specific rendering
    worksheet.content?.questions?.forEach((q) => {
      checkPage(60)
      const qType = q.type || (q.options ? 'multiple_choice' : 'open')

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      const questionText = sanitizePdfText(`${q.number}. ${q.question}`)
      const questionLines = doc.splitTextToSize(questionText, showPoints ? pageWidth - 55 : pageWidth - 40)
      doc.text(questionLines, 20, yPosition)

      // Points badge (only for exams)
      if (showPoints) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(`${q.points || 1}P`, pageWidth - 25, yPosition)
      }

      yPosition += questionLines.length * 6 + 3

      // === MC / True-False / Either-Or: clean option rendering ===
      if (['multiple_choice', 'true_false', 'either_or'].includes(qType) && q.options) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        yPosition += 1
        q.options.forEach((option, oi) => {
          checkPage(10)
          const letter = String.fromCharCode(65 + oi)
          const cleanOption = sanitizePdfText(option.replace(/^[A-Z]\)\s*/, ''))
          if (isExam) {
            // Exam: checkbox style
            doc.setDrawColor(80, 80, 80)
            doc.setLineWidth(0.4)
            doc.rect(28, yPosition - 3.5, 3.5, 3.5)
            doc.setLineWidth(0.2)
            doc.text(`${letter})`, 34, yPosition)
            const optionLines = doc.splitTextToSize(cleanOption, pageWidth - 65)
            doc.text(optionLines, 42, yPosition)
            yPosition += optionLines.length * 5 + 3
          } else {
            // Worksheet: circle indicator
            doc.setDrawColor(160, 160, 160)
            doc.setLineWidth(0.3)
            doc.circle(30, yPosition - 1.2, 2)
            doc.setLineWidth(0.2)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.text(letter, 28.8, yPosition)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            const optionLines = doc.splitTextToSize(cleanOption, pageWidth - 60)
            doc.text(optionLines, 37, yPosition)
            yPosition += optionLines.length * 5 + 3
          }
        })
        yPosition += 3
      }

      // === Fill in the blank: inline text with underline gaps ===
      if (qType === 'fill_blank') {
        checkPage(25)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        // Rebuild the sentence with blanks as a single text
        const blankedText = sanitizePdfText(q.question).replace(/___+/g, ' ________________ ')
        const fullLines = doc.splitTextToSize(blankedText, pageWidth - 50)
        fullLines.forEach(line => {
          checkPage(10)
          doc.text(line, 25, yPosition)
          yPosition += 6
        })
        // For student version, add extra writing space
        if (version === 'student') {
          yPosition += 4
          doc.setDrawColor(180, 180, 180)
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
        const pairs = (q.answer || '').split(',').filter(Boolean)
        const colLeft = 25
        const colRight = pageWidth / 2 + 10
        // Draw headers
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text('Begriff', colLeft, yPosition)
        doc.text('Zuordnung', colRight, yPosition)
        yPosition += 3
        doc.setDrawColor(180, 180, 180)
        doc.line(colLeft, yPosition, pageWidth - 25, yPosition)
        yPosition += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
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
        const items = (q.answer || '').split(',').filter(Boolean).map((s, i) => ({ text: s.trim(), origIdx: i }))
        // Deterministic shuffle for student
        const seed = (q.number || 1) * 13 + items.length
        const displayItems = version === 'student'
          ? [...items].sort((a, b) => ((a.origIdx * 37 + seed) % 89) - ((b.origIdx * 37 + seed) % 89))
          : items
        displayItems.forEach((item, ii) => {
          checkPage(12)
          if (version === 'student') {
            // Draw a small box for numbering
            doc.setDrawColor(120, 120, 120)
            doc.setLineWidth(0.3)
            doc.rect(28, yPosition - 4, 8, 5)
            doc.setLineWidth(0.2)
            doc.text(sanitizePdfText(item.text), 40, yPosition)
          } else {
            doc.setFont('helvetica', 'bold')
            doc.text(`${ii + 1}.`, 28, yPosition)
            doc.setFont('helvetica', 'normal')
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
          // Computation area with grid-like lines
          doc.setFontSize(9)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(120, 120, 120)
          doc.text('Rechnung / Lösungsweg:', 25, yPosition)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'normal')
          yPosition += 6
          doc.setDrawColor(200, 200, 200)
          for (let i = 0; i < 5; i++) {
            checkPage(8)
            doc.line(25, yPosition, pageWidth - 25, yPosition)
            yPosition += 8
          }
          yPosition += 2
          // Answer box
          doc.setDrawColor(100, 100, 100)
          doc.setLineWidth(0.5)
          doc.rect(25, yPosition - 1, pageWidth - 50, 10)
          doc.setLineWidth(0.2)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          doc.text('Antwort:', 28, yPosition + 6)
          yPosition += 14
        }
      }

      // === Image: placeholder box with better styling ===
      if (qType === 'image') {
        checkPage(60)
        // Dashed border image placeholder
        doc.setDrawColor(180, 180, 180)
        doc.setFillColor(248, 248, 252)
        doc.setLineWidth(0.3)
        const imgBoxWidth = Math.min(pageWidth - 60, 120)
        const imgBoxX = (pageWidth - imgBoxWidth) / 2
        doc.rect(imgBoxX, yPosition, imgBoxWidth, 40, 'FD')
        // Cross lines to indicate image area
        doc.setDrawColor(210, 210, 220)
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
          doc.setDrawColor(180, 180, 180)
          for (let i = 0; i < 3; i++) {
            checkPage(8)
            doc.line(25, yPosition, pageWidth - 25, yPosition)
            yPosition += 8
          }
        }
      }

      // === Open questions: writing lines ===
      if (qType === 'open' && version === 'student') {
        const pts = q.points || 1
        const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
        doc.setDrawColor(180, 180, 180)
        for (let i = 0; i < lineCount; i++) {
          checkPage(10)
          yPosition += 8
          doc.line(25, yPosition, pageWidth - 25, yPosition)
        }
        yPosition += 5
      }

      // Generic writing lines for types without specific handler
      if (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image', 'open'].includes(qType) && version === 'student' && !q.options) {
        const pts = q.points || 1
        const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
        doc.setDrawColor(180, 180, 180)
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
        // Draw a subtle green background box
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

      // Separator line between exam questions for professional look
      if (isExam) {
        checkPage(10)
        doc.setDrawColor(220, 220, 220)
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

    // Footer
    checkPage(20)
    yPosition += 10
    doc.setDrawColor(200, 200, 200)
    doc.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    if (showPoints) {
      doc.text(`Total: ${worksheet.content?.total_points || '–'} Punkte | Geschätzte Zeit: ${worksheet.content?.estimated_time || '–'}`, 20, yPosition)
    } else {
      doc.text(`Geschätzte Zeit: ${worksheet.content?.estimated_time || '–'}`, 20, yPosition)
    }

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
  // UPLOAD HANDLERS
  // ============================================================

  const handleFileDrop = (e) => {
    e.preventDefault()
    setUploadDragOver(false)
    const files = Array.from(e.dataTransfer?.files || e.target?.files || [])
    const validExtensions = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pptx', '.ppt', '.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.xlsx', '.xls', '.csv', '.rtf']
    const validFiles = files.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/') || f.type.startsWith('audio/') || f.type.startsWith('video/') || validExtensions.some(ext => f.name.toLowerCase().endsWith(ext)))
    if (validFiles.length > 0) setUploadedFiles(prev => [...prev, ...validFiles])
  }

  const handleRemoveFile = (index) => setUploadedFiles(prev => prev.filter((_, i) => i !== index))

  const [uploadAnalysisResult, setUploadAnalysisResult] = useState(null)

  const handleAnalyzeUpload = async () => {
    if (uploadedFiles.length === 0) return
    setUploadAnalyzing(true)
    setUploadAnalysisResult(null)

    try {
      // Analyze the first file via API
      const formData = new FormData()
      formData.append('file', uploadedFiles[0])
      if (uploadInstructions) formData.append('instructions', uploadInstructions)

      const response = await fetch('/api/analyze-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setUploadAnalysisResult(data.analysis)
        setUploadAnalysisComplete(true)
        setSuccessMessage('Analyse abgeschlossen! Die KI hat den Inhalt erkannt.')
      } else {
        // Fallback on API error
        setUploadAnalysisComplete(true)
        setUploadAnalysisResult({
          title: uploadedFiles.map(f => f.name).join(', '),
          subject: 'Allgemein',
          grade_suggestion: '5',
          content_summary: 'Datei wurde hochgeladen. Geben Sie ein Thema ein, um Material zu generieren.',
          key_topics: [],
          suggested_questions: [],
          difficulty_suggestion: 'medium',
          material_type_suggestion: 'worksheet'
        })
        setSuccessMessage('Analyse abgeschlossen. Sie können nun Materialien erstellen.')
      }
    } catch (err) {
      console.error('Upload analysis error:', err)
      setUploadAnalysisComplete(true)
      setSuccessMessage('Analyse abgeschlossen. Sie können nun Materialien erstellen.')
    }
    setUploadAnalyzing(false)
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

  // Autosave: save draft every 30 seconds if there are unsaved changes
  const autosaveTimerRef = useRef(null)
  useEffect(() => {
    if (editMode && hasUnsavedChanges && selectedWorksheet) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = setTimeout(async () => {
        const totalPoints = editedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
        const updatedContent = { ...selectedWorksheet.content, questions: editedQuestions, total_points: totalPoints }
        try {
          await fetch(`/api/worksheets/${selectedWorksheet.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content: updatedContent })
          })
          setSaveStatus('autosaved')
          setTimeout(() => { if (editMode) setSaveStatus('saved') }, 2000)
        } catch (err) { console.error('Autosave error:', err) }
      }, 30000)
    }
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [editMode, hasUnsavedChanges, editedQuestions])

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

  const loadAssignments = async (authToken) => {
    try {
      const t = authToken || token
      if (!t) return
      const res = await fetch('/api/assignments', { headers: { 'Authorization': `Bearer ${t}` } })
      if (res.ok) { const data = await res.json(); setAssignments(data) }
    } catch (err) { console.error('Load assignments error:', err) }
  }

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

  const loadTeacherClasses = async (authToken) => {
    try {
      const res = await fetch('/api/classes', { headers: { 'Authorization': `Bearer ${authToken || token}` } })
      if (res.ok) setTeacherClasses(await res.json())
    } catch (e) { console.error('Classes error:', e) }
  }

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
    setForm({ topic: '', grade: template.grade, subject: template.subject, difficulty: template.difficulty, questionCount: template.questionCount, resourceType: template.type, dyslexiaFont: false })
    setActiveView('create')
    setSelectedWorksheet(null)
    setShowEditorPanel(false)
    setSuccessMessage(`Vorlage "${template.name}" geladen. Geben Sie jetzt ein Thema ein.`)
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

  const navItems = [
    { id: 'home', label: 'Start', icon: LayoutDashboard },
    { id: 'create', label: 'Erstellen', icon: PlusCircle },
    { id: 'library', label: 'Bibliothek', icon: FolderOpen },
    { id: 'upload', label: 'Hochladen', icon: Upload },
    { id: 'templates', label: 'Vorlagen', icon: LayoutTemplate },
    { id: 'curriculum', label: 'Lehrplan 21', icon: GraduationCap },
    { id: 'planner', label: 'Jahresplaner', icon: Calendar },
    { id: 'students', label: 'Schüler', icon: User },
    { id: 'classes', label: 'Klassen', icon: Users },
    { id: 'exports', label: 'Exporte', icon: Clock },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ]

  // ============================================================
  // LANDING PAGE
  // ============================================================

  if (!token) {
    return (
      <div className="min-h-screen gradient-liquid overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" animate={{ x: [0, 100, 0], y: [0, 50, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" animate={{ x: [0, -100, 0], y: [0, -50, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        <div className="container mx-auto px-4 py-16 relative z-10">
          <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="flex items-center justify-center mb-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1, rotate: 360 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
                <BookOpen className="h-16 w-16 text-blue-500 mr-4" />
              </motion.div>
              <h1 className="text-5xl sm:text-7xl font-bold text-gradient">EduFlow</h1>
            </div>
            <motion.p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              Erstellen Sie in Sekunden perfekte Arbeitsblätter mit KI – abgestimmt auf den <span className="font-semibold text-blue-600">Lehrplan 21</span>
            </motion.p>
          </motion.div>

          <motion.div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mb-16 max-w-6xl mx-auto" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            {[
              { icon: Sparkles, title: 'KI-Generierung', description: 'Arbeitsblätter, Prüfungen, Quizze und Vokabellisten in Sekunden' },
              { icon: Target, title: 'Lehrplan 21', description: 'Alle Inhalte an den Schweizer Lehrplan angepasst' },
              { icon: Layers, title: 'Differenzierung', description: 'Drei Schwierigkeitsstufen für jeden Lernenden' },
              { icon: Download, title: 'PDF-Export', description: 'Schüler- und Lehrerversion direkt als PDF' },
            ].map((feature, index) => (
              <motion.div key={index} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + index * 0.1 }} whileHover={{ y: -8 }}>
                <Card className="glass-card hover-lift border-0 h-full">
                  <CardHeader className="pb-3">
                    <feature.icon className="h-10 w-10 text-blue-500 mb-3" />
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent><p className="text-gray-600 text-sm">{feature.description}</p></CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div className="max-w-md mx-auto" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}>
            <Card className="glass-card border-0">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl">{authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}</CardTitle>
                <CardDescription className="text-base">{authMode === 'login' ? 'Willkommen zurück bei EduFlow.' : 'Kostenlos starten – 5 Materialien gratis pro Monat.'}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAuth} className="space-y-5">
                  {authMode === 'register' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <Label className="text-sm font-medium">Ihr Name</Label>
                      <Input type="text" placeholder="z.B. Anna Müller" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required className="input-premium mt-1.5" />
                    </motion.div>
                  )}
                  <div>
                    <Label className="text-sm font-medium">E-Mail-Adresse</Label>
                    <Input type="email" placeholder="name@schule.ch" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required className="input-premium mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Passwort</Label>
                    <Input type="password" placeholder="Mindestens 8 Zeichen" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required className="input-premium mt-1.5" />
                  </div>
                  {error && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></motion.div>)}
                  <Button type="submit" className="w-full btn-premium">{authMode === 'login' ? 'Anmelden' : 'Kostenlos registrieren'}</Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError('') }}>
                    {authMode === 'login' ? 'Noch kein Konto? Jetzt registrieren' : 'Bereits registriert? Anmelden'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
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

            <nav className="hidden xl:flex items-center gap-1" role="navigation">
              {navItems.map(item => (
                <Button key={item.id} variant={activeView === item.id ? 'default' : 'ghost'} size="sm" onClick={() => { setActiveView(item.id); setMobileNavOpen(false) }} className="transition-smooth text-xs">
                  <item.icon className="h-3.5 w-3.5 mr-1.5" />
                  {item.label}
                </Button>
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
              <nav className="grid grid-cols-2 gap-2">
                {navItems.map(item => (
                  <Button key={item.id} variant={activeView === item.id ? 'default' : 'ghost'} size="sm" onClick={() => { setActiveView(item.id); setMobileNavOpen(false) }} className="justify-start text-xs">
                    <item.icon className="h-3.5 w-3.5 mr-1.5" />{item.label}
                  </Button>
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
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="max-w-6xl mx-auto">

              {/* Hero greeting */}
              <div className="mb-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <h2 className="text-4xl font-bold text-gradient mb-2">
                    {(() => { const h = new Date().getHours(); return h < 12 ? 'Guten Morgen' : h < 17 ? 'Guten Nachmittag' : 'Guten Abend' })()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
                  </h2>
                  <p className="text-gray-500 text-lg">Willkommen zurück bei EduFlow. Was möchten Sie heute machen?</p>
                </motion.div>
              </div>

              {/* Quick Actions */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <button onClick={() => { setActiveView('create'); setSelectedWorksheet(null); setShowEditorPanel(false) }}
                    className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-blue-200 transition-all text-left">
                    <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <PlusCircle className="h-6 w-6 text-blue-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">Material erstellen</p>
                    <p className="text-xs text-gray-400 mt-0.5">KI-gestützt generieren</p>
                  </button>
                  <button onClick={() => { setActiveView('students'); loadAssignments() }}
                    className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-purple-200 transition-all text-left">
                    <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Send className="h-6 w-6 text-purple-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">Aufgabe freigeben</p>
                    <p className="text-xs text-gray-400 mt-0.5">An Schüler verteilen</p>
                  </button>
                  <button onClick={() => { setActiveView('classes'); loadTeacherClasses() }}
                    className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-emerald-200 transition-all text-left">
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Users className="h-6 w-6 text-emerald-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">Klassen verwalten</p>
                    <p className="text-xs text-gray-400 mt-0.5">Roster & Niveaus</p>
                  </button>
                  <button onClick={() => setActiveView('curriculum')}
                    className="group p-5 bg-white rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-amber-200 transition-all text-left">
                    <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <GraduationCap className="h-6 w-6 text-amber-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">Lehrplan 21</p>
                    <p className="text-xs text-gray-400 mt-0.5">Kompetenzen & Material</p>
                  </button>
                </div>
              </motion.div>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left column: Stats + Recent materials */}
                <div className="lg:col-span-2 space-y-6">

                  {/* Stats overview */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
                        <p className="text-3xl font-bold text-blue-600">{worksheets.length}</p>
                        <p className="text-xs text-gray-500 mt-1">Materialien</p>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
                        <p className="text-3xl font-bold text-purple-600">{assignments.length}</p>
                        <p className="text-xs text-gray-500 mt-1">Aufgaben</p>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
                        <p className="text-3xl font-bold text-emerald-600">{teacherClasses.length}</p>
                        <p className="text-xs text-gray-500 mt-1">Klassen</p>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
                        <p className="text-3xl font-bold text-amber-600">{teacherClasses.reduce((sum, c) => sum + (c.enrolled_students?.length || 0), 0)}</p>
                        <p className="text-xs text-gray-500 mt-1">Schüler/innen</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Recent materials */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <Card className="glass-card border-0">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Letzte Materialien</CardTitle>
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveView('library')}>Alle anzeigen <ChevronRight className="h-3 w-3 ml-1" /></Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {worksheets.length === 0 ? (
                          <div className="text-center py-8">
                            <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Noch keine Materialien erstellt.</p>
                            <Button size="sm" className="btn-premium mt-3 text-xs" onClick={() => setActiveView('create')}><PlusCircle className="h-3 w-3 mr-1" /> Erstes Material</Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {worksheets.slice(0, 5).map(ws => (
                              <div key={ws.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => { setSelectedWorksheet(ws); setShowEditorPanel(true); setActiveView('create') }}>
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <FileText className="h-5 w-5 text-blue-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{ws.title}</p>
                                  <p className="text-xs text-gray-400">{ws.subject} · {ws.grade}. Klasse · {ws.content?.questions?.length || 0} Fragen</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Active assignments */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="glass-card border-0">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Aktive Aufgaben</CardTitle>
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setActiveView('students'); loadAssignments() }}>Alle anzeigen <ChevronRight className="h-3 w-3 ml-1" /></Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {assignments.length === 0 ? (
                          <div className="text-center py-6">
                            <Send className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Noch keine Aufgaben freigegeben.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {assignments.filter(a => a.status === 'active').slice(0, 4).map(a => (
                              <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                                onClick={() => { setActiveView('students'); loadSubmissions(a.id) }}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.submission_count > 0 ? 'bg-green-100' : 'bg-amber-100'}`}>
                                  <span className={`text-sm font-bold ${a.submission_count > 0 ? 'text-green-600' : 'text-amber-600'}`}>{a.submission_count || 0}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{a.worksheet_title}</p>
                                  <p className="text-xs text-gray-400">{a.class_name || 'Ohne Klasse'} · Code: <span className="font-mono">{a.code}</span></p>
                                </div>
                                <span className="text-xs text-gray-400">{a.submission_count || 0} Abgaben</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>

                {/* Right column: Classes + Tips */}
                <div className="space-y-6">

                  {/* My classes */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="glass-card border-0">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Meine Klassen</CardTitle>
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveView('classes')}>Verwalten <ChevronRight className="h-3 w-3 ml-1" /></Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {teacherClasses.length === 0 ? (
                          <div className="text-center py-6">
                            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Noch keine Klassen.</p>
                            <Button size="sm" className="btn-premium mt-3 text-xs" onClick={() => setActiveView('classes')}><PlusCircle className="h-3 w-3 mr-1" /> Klasse erstellen</Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {teacherClasses.slice(0, 5).map(cls => (
                              <div key={cls.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => { setActiveView('classes'); setTimeout(() => loadClassDetail(cls.id), 100) }}>
                                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <Users className="h-5 w-5 text-emerald-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{cls.name}</p>
                                  <p className="text-xs text-gray-400">{(cls.enrolled_students?.length || 0)} Schüler/innen</p>
                                </div>
                                <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{cls.join_code}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* AI Coach tip */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-5 text-white">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                          <Brain className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">AI-Lerncoach</p>
                          <p className="text-xs opacity-80">Neu in EduFlow</p>
                        </div>
                      </div>
                      <p className="text-xs opacity-90 leading-relaxed mb-3">Schüler/innen erhalten jetzt personalisierte Übungen basierend auf ihren Schwächen. Die KI analysiert Fehler und generiert massgeschneiderte Aufgaben.</p>
                      <button onClick={() => setActiveView('classes')} className="text-xs font-semibold bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition-colors">
                        Klassen-Insights ansehen →
                      </button>
                    </div>
                  </motion.div>

                  {/* Quick links */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <Card className="glass-card border-0">
                      <CardContent className="py-4">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Schnellzugriff</p>
                        <div className="space-y-1">
                          {[
                            { label: 'Vorlagen durchstöbern', icon: LayoutTemplate, view: 'templates' },
                            { label: 'Material hochladen', icon: Upload, view: 'upload' },
                            { label: 'Jahresplaner', icon: Calendar, view: 'planner' },
                            { label: 'Export-Historie', icon: Clock, view: 'exports' },
                          ].map(item => (
                            <button key={item.view} onClick={() => setActiveView(item.view)}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors">
                              <item.icon className="h-4 w-4 text-gray-400" />
                              <span className="text-xs text-gray-700">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============ CREATE VIEW ============ */}
          {activeView === 'create' && (
            <motion.div key="create" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="max-w-6xl mx-auto">
              {selectedWorksheet ? (
                <div className="grid lg:grid-cols-12 gap-6">
                  {/* Document Preview */}
                  <div className={showEditorPanel ? "lg:col-span-8" : "lg:col-span-10 lg:col-start-2"}>
                    {/* Top action bar */}
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {editMode ? (
                          <>
                            <Button size="sm" onClick={saveEdits} className="btn-premium text-xs">
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Speichern & Vorschau
                            </Button>
                            <Button variant="outline" size="sm" onClick={saveDraft} className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                              <Save className="h-4 w-4 mr-1" /> Als Entwurf
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setUseRichEditor(!useRichEditor)}
                              className={`text-xs ${useRichEditor ? 'border-purple-300 text-purple-700 bg-purple-50' : ''}`}
                              title={useRichEditor ? 'Zum einfachen Editor wechseln' : 'Rich-Text-Editor aktivieren'}>
                              <Pen className="h-4 w-4 mr-1" /> {useRichEditor ? 'Rich-Text' : 'WYSIWYG'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={cancelEdits} className="text-xs">
                              <X className="h-4 w-4 mr-1" /> Abbrechen
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={startEditMode} className="glass-card border-0 text-xs">
                              <Edit className="h-4 w-4 mr-1" /> Bearbeiten
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleExportPDF(selectedWorksheet, 'student')} className="glass-card border-0 text-xs">
                              <Download className="h-4 w-4 mr-1" /> PDF
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleExportDOCX(selectedWorksheet, 'student')} className="glass-card border-0 text-xs">
                              <FileText className="h-4 w-4 mr-1" /> Word
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setShareModalOpen(true); loadTeacherClasses(); setShareForm(prev => ({ ...prev, worksheetId: selectedWorksheet.id })) }} className="glass-card border-0 text-xs" title="An Schüler freigeben">
                              <Send className="h-4 w-4 mr-1" /> Freigeben
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => saveVersion(selectedWorksheet.id)} className="glass-card border-0 text-xs" title="Version speichern">
                              <Layers className="h-4 w-4 mr-1" /> Version
                            </Button>
                            {getWorksheetStatus(selectedWorksheet?.id) === 'draft' && (
                              <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs">Entwurf</Badge>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={startNewMaterial} className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                          <PlusCircle className="h-4 w-4 mr-1" /> Neues Material
                        </Button>
                        {!showEditorPanel && (
                          <Button variant="outline" size="sm" onClick={() => setShowEditorPanel(true)} className="glass-card border-0 text-xs">
                            <PanelRightOpen className="h-4 w-4 mr-1" /> Werkzeuge
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Post-Creation Action Bar */}
                    <AnimatePresence>
                      {showPostCreationBar && !editMode && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="mb-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                          <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-gray-900">Material erstellt!</p>
                                <p className="text-xs text-gray-500">Bearbeiten Sie Fragen, passen Sie den Inhalt an oder exportieren Sie direkt.</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => { startEditMode(); setShowPostCreationBar(false) }} className="btn-premium text-xs">
                                <Edit className="h-4 w-4 mr-1" /> Jetzt bearbeiten
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { handleExportPDF(selectedWorksheet, 'student'); setShowPostCreationBar(false) }} className="text-xs">
                                <Download className="h-4 w-4 mr-1" /> PDF exportieren
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setShowPostCreationBar(false)} className="text-xs text-gray-400">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {(() => {
                      const isExam = selectedWorksheet.resourceType === 'exam' || selectedWorksheet.content?.resourceType === 'exam'
                      const isQuiz = selectedWorksheet.resourceType === 'quiz' || selectedWorksheet.content?.resourceType === 'quiz'
                      const showPts = isExam
                      const questions = editMode ? editedQuestions : (selectedWorksheet.content?.questions || [])

                      return (
                    <div className="bg-white rounded-lg shadow-lg p-6 sm:p-10">
                      {/* Header - different for exams */}
                      {isExam ? (
                        <div className="mb-6">
                          <div className="text-center mb-4">
                            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Prüfung</p>
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{selectedWorksheet.title}</h2>
                            <div className="flex gap-2 justify-center flex-wrap">
                              <Badge variant="outline">{selectedWorksheet.grade}. Klasse</Badge>
                              <Badge variant="outline">{selectedWorksheet.subject}</Badge>
                              <Badge variant="outline">{DIFFICULTY_LABELS[selectedWorksheet.difficulty] || selectedWorksheet.difficulty}</Badge>
                            </div>
                          </div>
                          <div className="bg-gray-50 border rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
                            <div><p className="text-xs text-gray-500">Aufgaben</p><p className="font-bold text-gray-900">{questions.length}</p></div>
                            <div><p className="text-xs text-gray-500">Punkte</p><p className="font-bold text-gray-900">{selectedWorksheet.content?.total_points || '–'}</p></div>
                            <div><p className="text-xs text-gray-500">Zeit</p><p className="font-bold text-gray-900">{selectedWorksheet.content?.estimated_time || '–'}</p></div>
                            <div><p className="text-xs text-gray-500">Notenskala</p><p className="font-bold text-gray-900">1–6</p></div>
                          </div>
                          <div className="mt-4 border-b border-gray-200 pb-2">
                            <p className="text-sm text-gray-500">Name: _______________________________ Datum: _______________</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-6 text-center">
                          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{selectedWorksheet.title}</h2>
                          <div className="flex gap-2 justify-center flex-wrap">
                            <Badge variant="outline">{selectedWorksheet.grade}. Klasse</Badge>
                            <Badge variant="outline">{selectedWorksheet.subject}</Badge>
                            <Badge variant="outline">{DIFFICULTY_LABELS[selectedWorksheet.difficulty] || selectedWorksheet.difficulty}</Badge>
                            <Badge variant="outline" className="text-blue-600">{questions.length} Fragen</Badge>
                          </div>
                        </div>
                      )}
                      <Separator className="mb-6" />

                      {/* EDIT MODE */}
                      {editMode ? (
                        <div className="space-y-3">
                          {editedQuestions.map((q, index) => (
                            <motion.div key={`edit-${index}`} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                              className={`group border rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${activeKiAction?.questionIndex === index ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
                              {/* Question Header Bar */}
                              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-4 w-4 text-gray-300" />
                                  <span className="text-xs font-bold text-gray-500">#{q.number}</span>
                                  {/* Question Type Badge */}
                                  <Select value={q.type || 'open'} onValueChange={(val) => changeQuestionType(index, val)}>
                                    <SelectTrigger className="h-7 text-xs border-0 bg-blue-50 text-blue-700 w-auto gap-1 px-2">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {QUESTION_TYPES.map(qt => (
                                        <SelectItem key={qt.id} value={qt.id}>
                                          <span className="flex items-center gap-1.5"><qt.icon className="h-3 w-3" />{qt.label}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {showPts && (
                                    <div className="flex items-center gap-1">
                                      <Input type="number" min={1} max={10} value={q.points || 1} onChange={(e) => updateEditedQuestion(index, 'points', parseInt(e.target.value) || 1)}
                                        className="h-7 w-14 text-xs text-center bg-white border-gray-200" />
                                      <span className="text-xs text-gray-400">P</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <Button variant="ghost" size="sm" onClick={() => moveQuestion(index, 'up')} disabled={index === 0} className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"><ArrowUp className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => moveQuestion(index, 'down')} disabled={index === editedQuestions.length - 1} className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"><ArrowDown className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => duplicateQuestion(index)} className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600" title="Duplizieren"><Copy className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => removeQuestion(index)} className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" title="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </div>

                              {/* Question Body - Type-specific editors */}
                              <div className="p-4 space-y-3">
                                {useRichEditor ? (
                                  <RichTextEditor
                                    content={q.question}
                                    onChange={(html) => updateEditedQuestion(index, 'question', html.replace(/<[^>]*>/g, '').trim() ? html : '')}
                                    placeholder="Fragetext eingeben..."
                                    minHeight="60px"
                                  />
                                ) : (
                                  <Textarea value={q.question} onChange={(e) => updateEditedQuestion(index, 'question', e.target.value)}
                                    placeholder="Fragetext eingeben..." className="text-sm min-h-[50px] bg-gray-50 border-gray-200 focus:bg-white resize-y" />
                                )}

                                {/* === MC / True-False / Either-Or: Options editor === */}
                                {(q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'either_or' || (q.options && !['matching', 'ordering', 'fill_blank'].includes(q.type))) && q.options && (
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Antwortmöglichkeiten</Label>
                                    {q.options.map((opt, oi) => (
                                      <div key={oi} className="flex items-center gap-2">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${opt === q.answer ? 'bg-green-100' : 'bg-blue-50'}`}>
                                          <span className={`text-xs font-bold ${opt === q.answer ? 'text-green-600' : 'text-blue-600'}`}>{String.fromCharCode(65 + oi)}</span>
                                        </div>
                                        <Input value={opt} onChange={(e) => updateEditedOption(index, oi, e.target.value)} className="text-sm bg-gray-50 focus:bg-white flex-1" />
                                        <button onClick={() => updateEditedQuestion(index, 'answer', opt)} className={`h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${opt === q.answer ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-green-400'}`} title="Als korrekte Antwort markieren">
                                          {opt === q.answer && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                                        </button>
                                        {q.type !== 'true_false' && q.type !== 'either_or' && (
                                          <Button variant="ghost" size="sm" onClick={() => removeOptionFromQuestion(index, oi)} className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                        )}
                                      </div>
                                    ))}
                                    {q.type !== 'true_false' && q.type !== 'either_or' && (
                                      <Button variant="ghost" size="sm" onClick={() => addOptionToQuestion(index)} className="text-xs text-blue-600 hover:text-blue-700">
                                        <PlusCircle className="h-3 w-3 mr-1" /> Option hinzufügen
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {/* === Fill in the Blank editor === */}
                                {q.type === 'fill_blank' && (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lückentext</Label>
                                      <span className="text-[10px] px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                        {(q.question.match(/___+/g) || []).length} {(q.question.match(/___+/g) || []).length === 1 ? 'Lücke' : 'Lücken'}
                                      </span>
                                    </div>
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
                                      <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                      <span>Markiere Lücken mit <code className="bg-blue-100 px-1 rounded font-mono">___</code> (drei Unterstriche) im Text oben. Beispiel: «Der ___ frisst gerne ___»</span>
                                    </div>
                                    {/* Live Preview */}
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                                      <p className="text-[10px] uppercase tracking-wider text-yellow-600 font-semibold mb-2">Vorschau Schülerversion</p>
                                      <p className="text-sm text-gray-700 leading-loose">
                                        {q.question.split(/___+/).map((part, pi, arr) => (
                                          <span key={pi}>
                                            {part}
                                            {pi < arr.length - 1 && (
                                              <span className="inline-block mx-1 min-w-[80px] border-b-2 border-yellow-500 text-center pb-0.5">
                                                <span className="text-[10px] text-yellow-400">{pi + 1}</span>
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </p>
                                    </div>
                                    {/* Solution Preview */}
                                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                      <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold mb-2">Vorschau Lehrerversion</p>
                                      <p className="text-sm text-gray-700 leading-loose">
                                        {q.question.split(/___+/).map((part, pi, arr) => (
                                          <span key={pi}>
                                            {part}
                                            {pi < arr.length - 1 && (
                                              <span className="inline-block mx-1 px-3 py-0.5 bg-green-200 border-b-2 border-green-500 rounded text-green-800 font-semibold text-xs">
                                                {(q.answer || '').split(',')[pi]?.trim() || `Lücke ${pi + 1}`}
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </p>
                                    </div>
                                    {/* Solution words editor */}
                                    <div className="space-y-2">
                                      <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lösungswörter</Label>
                                      {(q.question.match(/___+/g) || []).map((_, gi) => (
                                        <div key={gi} className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                            <span className="text-[10px] font-bold text-green-600">{gi + 1}</span>
                                          </div>
                                          <Input
                                            value={(q.answer || '').split(',')[gi]?.trim() || ''}
                                            onChange={(e) => {
                                              const words = (q.answer || '').split(',').map(w => w.trim())
                                              while (words.length <= gi) words.push('')
                                              words[gi] = e.target.value
                                              updateEditedQuestion(index, 'answer', words.join(', '))
                                            }}
                                            placeholder={`Lösung für Lücke ${gi + 1}...`}
                                            className="text-sm bg-green-50 border-green-200 focus:bg-white flex-1"
                                          />
                                        </div>
                                      ))}
                                      {(q.question.match(/___+/g) || []).length === 0 && (
                                        <p className="text-xs text-gray-400 italic">Fügen Sie ___ im Fragetext ein, um Lücken zu erstellen.</p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* === Matching / Zuordnung editor === */}
                                {q.type === 'matching' && (
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Zuordnungspaare</Label>
                                    <p className="text-[10px] text-gray-500">Schreibe Paare in die Lösung: «links1→rechts1, links2→rechts2»</p>
                                    <div className="space-y-2">
                                      {(q.answer || '').split(',').filter(Boolean).map((pair, pi) => {
                                        const [left, right] = pair.split('→').map(s => s?.trim() || '')
                                        return (
                                          <div key={pi} className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                                              <span className="text-[10px] font-bold text-blue-600">{pi + 1}</span>
                                            </div>
                                            <Input value={left} onChange={(e) => {
                                              const pairs = (q.answer || '').split(',').map(p => p.trim())
                                              const [, r] = (pairs[pi] || '').split('→').map(s => s?.trim() || '')
                                              pairs[pi] = `${e.target.value}→${r}`
                                              updateEditedQuestion(index, 'answer', pairs.join(', '))
                                            }} placeholder="Begriff links" className="text-sm bg-blue-50 flex-1" />
                                            <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                            <Input value={right} onChange={(e) => {
                                              const pairs = (q.answer || '').split(',').map(p => p.trim())
                                              const [l] = (pairs[pi] || '').split('→').map(s => s?.trim() || '')
                                              pairs[pi] = `${l}→${e.target.value}`
                                              updateEditedQuestion(index, 'answer', pairs.join(', '))
                                            }} placeholder="Begriff rechts" className="text-sm bg-green-50 flex-1" />
                                            <Button variant="ghost" size="sm" onClick={() => {
                                              const pairs = (q.answer || '').split(',').map(p => p.trim()).filter((_, i) => i !== pi)
                                              updateEditedQuestion(index, 'answer', pairs.join(', '))
                                            }} className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                          </div>
                                        )
                                      })}
                                      <Button variant="ghost" size="sm" onClick={() => {
                                        const current = q.answer ? q.answer + ', ' : ''
                                        updateEditedQuestion(index, 'answer', current + 'Begriff→Zuordnung')
                                      }} className="text-xs text-blue-600 hover:text-blue-700">
                                        <PlusCircle className="h-3 w-3 mr-1" /> Paar hinzufügen
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* === Ordering / Reihenfolge editor === */}
                                {q.type === 'ordering' && (
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Richtige Reihenfolge</Label>
                                    <p className="text-[10px] text-gray-500">Elemente kommagetrennt in korrekter Reihenfolge eingeben</p>
                                    <div className="space-y-1.5">
                                      {(q.answer || '').split(',').filter(Boolean).map((item, ii) => (
                                        <div key={ii} className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xs font-bold text-indigo-600">{ii + 1}</span>
                                          </div>
                                          <Input value={item.trim()} onChange={(e) => {
                                            const items = (q.answer || '').split(',').map(s => s.trim())
                                            items[ii] = e.target.value
                                            updateEditedQuestion(index, 'answer', items.join(', '))
                                          }} className="text-sm bg-indigo-50 flex-1" />
                                          <Button variant="ghost" size="sm" onClick={() => {
                                            const items = (q.answer || '').split(',').map(s => s.trim())
                                            if (ii > 0) { [items[ii], items[ii-1]] = [items[ii-1], items[ii]] }
                                            updateEditedQuestion(index, 'answer', items.join(', '))
                                          }} disabled={ii === 0} className="h-6 w-6 p-0 text-gray-400"><ArrowUp className="h-3 w-3" /></Button>
                                          <Button variant="ghost" size="sm" onClick={() => {
                                            const items = (q.answer || '').split(',').map(s => s.trim())
                                            if (ii < items.length - 1) { [items[ii], items[ii+1]] = [items[ii+1], items[ii]] }
                                            updateEditedQuestion(index, 'answer', items.join(', '))
                                          }} disabled={ii === (q.answer || '').split(',').filter(Boolean).length - 1} className="h-6 w-6 p-0 text-gray-400"><ArrowDown className="h-3 w-3" /></Button>
                                          <Button variant="ghost" size="sm" onClick={() => {
                                            const items = (q.answer || '').split(',').map(s => s.trim()).filter((_, i) => i !== ii)
                                            updateEditedQuestion(index, 'answer', items.join(', '))
                                          }} className="h-6 w-6 p-0 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></Button>
                                        </div>
                                      ))}
                                      <Button variant="ghost" size="sm" onClick={() => {
                                        const current = q.answer ? q.answer + ', ' : ''
                                        updateEditedQuestion(index, 'answer', current + 'Neues Element')
                                      }} className="text-xs text-indigo-600 hover:text-indigo-700">
                                        <PlusCircle className="h-3 w-3 mr-1" /> Element hinzufügen
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* === Math / Rechenfrage editor === */}
                                {q.type === 'math' && (
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rechenaufgabe</Label>
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                                      <p className="text-lg font-mono font-bold text-gray-800">{q.question.replace(/^Berechne:\s*/i, '')}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lösung / Lösungsweg</Label>
                                      <Textarea value={q.answer || ''} onChange={(e) => updateEditedQuestion(index, 'answer', e.target.value)}
                                        placeholder="z.B. 42 oder '3 × 14 = 42'" className="text-sm bg-green-50 border-green-200 focus:bg-white mt-1 font-mono min-h-[60px]" />
                                    </div>
                                  </div>
                                )}

                                {/* === Image / Bilderfrage editor with KI generation === */}
                                {q.type === 'image' && (
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Bilderfrage</Label>
                                    <div className="bg-pink-50 border-2 border-dashed border-pink-300 rounded-lg p-4 text-center">
                                      {q.imageUrl ? (
                                        <div className="space-y-2">
                                          <img src={q.imageUrl} alt="Aufgabenbild" className="max-h-48 mx-auto rounded-lg object-contain shadow-sm" />
                                          <div className="flex items-center justify-center gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => updateEditedQuestion(index, 'imageUrl', '')} className="text-xs text-red-500">
                                              <Trash2 className="h-3 w-3 mr-1" /> Entfernen
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => updateEditedQuestion(index, 'imageUrl', '')} className="text-xs text-blue-500">
                                              <RefreshCw className="h-3 w-3 mr-1" /> Neues Bild
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <Image className="h-10 w-10 mx-auto text-pink-400 mb-1" />

                                          {/* KI Bildgenerierung */}
                                          <div className="bg-white rounded-xl p-4 border border-pink-200 max-w-md mx-auto text-left space-y-3">
                                            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                              <Sparkles className="h-3.5 w-3.5 text-purple-500" /> KI-Bild generieren
                                            </p>
                                            <Textarea
                                              placeholder="Beschreiben Sie das gewünschte Bild, z.B.&#10;• Ein Schmetterling im Garten&#10;• Verdauungssystem des Menschen&#10;• Mittelalterliches Schloss"
                                              value={imagePrompt}
                                              onChange={(e) => setImagePrompt(e.target.value)}
                                              className="text-xs min-h-[70px] resize-none"
                                            />
                                            <div>
                                              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Stil wählen</p>
                                              <div className="grid grid-cols-4 gap-1.5">
                                                {[
                                                  { id: 'educational', label: 'Lehr-Illustration', emoji: '📚' },
                                                  { id: 'kindgerecht', label: 'Kindgerecht', emoji: '🧒' },
                                                  { id: 'cartoon', label: 'Cartoon', emoji: '🎨' },
                                                  { id: 'realistic', label: 'Realistisch', emoji: '📷' },
                                                  { id: 'diagram', label: 'Diagramm', emoji: '📊' },
                                                  { id: 'line-art', label: 'Strichzeichnung', emoji: '✏️' },
                                                  { id: 'schwarz-weiss', label: 'Schwarz-Weiss', emoji: '🖤' },
                                                  { id: 'druckfreundlich', label: 'Druckfreundlich', emoji: '🖨️' },
                                                ].map(s => (
                                                  <button key={s.id} onClick={() => setImageStyle(s.id)}
                                                    className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all text-center ${imageStyle === s.id ? 'bg-purple-100 border-purple-300 text-purple-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-purple-200 hover:bg-purple-50/50'}`}>
                                                    <span className="block text-sm mb-0.5">{s.emoji}</span>
                                                    {s.label}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                            <Button size="sm" className="w-full btn-premium text-xs h-9"
                                              disabled={imageGenerating || !imagePrompt.trim()}
                                              onClick={() => handleGenerateImage(index, imagePrompt, imageStyle)}>
                                              {imageGenerating ? (
                                                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Bild wird generiert...</>
                                              ) : (
                                                <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Bild generieren</>
                                              )}
                                            </Button>
                                          </div>

                                          <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                            <div className="flex-1 h-px bg-gray-200" />
                                            <span>oder Bild-URL einfügen</span>
                                            <div className="flex-1 h-px bg-gray-200" />
                                          </div>

                                          {/* Manual URL */}
                                          <Input placeholder="https://..." onChange={(e) => updateEditedQuestion(index, 'imageUrl', e.target.value)}
                                            className="text-xs bg-white max-w-sm mx-auto" />
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Erwartete Antwort</Label>
                                      <Input value={q.answer || ''} onChange={(e) => updateEditedQuestion(index, 'answer', e.target.value)}
                                        placeholder="Beschreibung / Antwort zum Bild..." className="text-sm bg-green-50 border-green-200 focus:bg-white mt-1" />
                                    </div>
                                  </div>
                                )}

                                {/* === Open / Generic answer field (for 'open' and types without specific editor) === */}
                                {(q.type === 'open' || (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image'].includes(q.type) && !q.options)) && (
                                  <div>
                                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Erwartete Antwort / Lösung</Label>
                                    <Textarea value={q.answer || ''} onChange={(e) => updateEditedQuestion(index, 'answer', e.target.value)}
                                      placeholder="Musterantwort eingeben..." className="text-sm bg-green-50 border-green-200 focus:bg-white mt-1 min-h-[60px]" />
                                  </div>
                                )}
                              </div>

                              {/* KI Actions Bar */}
                              <div className="px-4 py-2 border-t bg-gradient-to-r from-purple-50/50 to-blue-50/50">
                                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                                  <Wand2 className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 mr-1" />
                                  {KI_ACTIONS.slice(0, 6).map(action => (
                                    <button key={action.id} onClick={() => handleKiAction(index, action.id)}
                                      disabled={kiActionLoading}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white border border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700 hover:bg-purple-50 transition-all whitespace-nowrap flex-shrink-0 disabled:opacity-50">
                                      <action.icon className="h-2.5 w-2.5" />
                                      {action.label}
                                    </button>
                                  ))}
                                  <Select onValueChange={(val) => handleKiAction(index, val)}>
                                    <SelectTrigger className="h-6 text-[10px] border-gray-200 bg-white w-auto gap-1 px-2 flex-shrink-0">
                                      <MoreHorizontal className="h-2.5 w-2.5" />
                                      <span>Mehr</span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {KI_ACTIONS.slice(6).map(action => (
                                        <SelectItem key={action.id} value={action.id}>
                                          <span className="flex items-center gap-1.5 text-xs"><action.icon className="h-3 w-3" />{action.label}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* KI Action Loading overlay */}
                              {activeKiAction?.questionIndex === index && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-2 bg-purple-50 border-t border-purple-200">
                                  <div className="flex items-center gap-2">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                      <Wand2 className="h-4 w-4 text-purple-500" />
                                    </motion.div>
                                    <span className="text-xs text-purple-700 font-medium">KI bearbeitet Frage...</span>
                                  </div>
                                </motion.div>
                              )}
                            </motion.div>
                          ))}

                          {/* Add Question Button with Type Selector */}
                          <div className="relative">
                            {showQuestionTypeSelector === 'bottom' ? (
                              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border-2 border-dashed border-blue-300 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <Label className="text-sm font-semibold text-gray-700">Frageart wählen</Label>
                                  <Button variant="ghost" size="sm" onClick={() => setShowQuestionTypeSelector(false)} className="h-7 w-7 p-0"><X className="h-4 w-4" /></Button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  {QUESTION_TYPES.map(qt => (
                                    <button key={qt.id} onClick={() => addQuestionOfType(qt.id)}
                                      className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all text-left">
                                      <qt.icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                      <span className="text-xs font-medium text-gray-700">{qt.label}</span>
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            ) : (
                              <Button variant="outline" className="w-full border-dashed border-2 py-6 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50" onClick={() => setShowQuestionTypeSelector('bottom')}>
                                <PlusCircle className="h-5 w-5 mr-2" /> Frage hinzufügen
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* PREVIEW MODE */
                        <div className="space-y-5">
                          {questions.map((q, index) => (
                            <motion.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}
                              className={`border-l-4 ${isExam ? 'border-red-400' : isQuiz ? 'border-green-400' : 'border-blue-500'} pl-5 py-3 hover:bg-blue-50/50 transition-smooth rounded-r`}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-semibold text-base text-gray-900 flex-1">
                                  {q.number}. {q.question}
                                  {showPts && <Badge variant="secondary" className="ml-2 text-xs">{q.points || 1}P</Badge>}
                                  {q.type && <Badge variant="outline" className="ml-2 text-[10px] text-gray-400">{QUESTION_TYPES.find(t => t.id === q.type)?.label || q.type}</Badge>}
                                </p>
                                <button onClick={() => speakText(q.question)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Frage vorlesen">
                                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                                </button>
                              </div>

                              {/* MC / True-False / Either-Or options */}
                              {q.options && ['multiple_choice', 'true_false', 'either_or'].includes(q.type || 'multiple_choice') && (
                                <div className="space-y-1.5 ml-4">
                                  {q.options.map((option, i) => (
                                    <div key={i} className="text-gray-700 text-sm flex items-center gap-2.5">
                                      {isExam ? (
                                        <span className="w-4 h-4 border-2 border-gray-400 rounded-sm inline-block flex-shrink-0" />
                                      ) : (
                                        <span className="w-5 h-5 rounded-full border-2 border-gray-300 inline-flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-500">{String.fromCharCode(65 + i)}</span>
                                      )}
                                      <span>{option.replace(/^[A-Z]\)\s*/, '')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Fill in the blank preview */}
                              {q.type === 'fill_blank' && (
                                <div className="mt-2 ml-1 bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                                  <p className="text-sm text-gray-700 leading-loose">
                                    {q.question.split(/___+/).map((part, pi, arr) => (
                                      <span key={pi}>
                                        {part}
                                        {pi < arr.length - 1 && (
                                          <span className="inline-block mx-1 min-w-[80px] border-b-2 border-amber-400 text-center align-bottom">
                                            <span className="text-[10px] text-amber-300 select-none">{pi + 1}</span>
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                  </p>
                                </div>
                              )}

                              {/* Matching preview */}
                              {q.type === 'matching' && q.answer && (() => {
                                const pairs = (q.answer || '').split(',').filter(Boolean)
                                const rightSide = pairs.map((p, i) => ({ text: p.split('→')[1]?.trim(), origIdx: i }))
                                // Deterministic shuffle based on question number
                                const seed = (q.number || index) * 7 + pairs.length
                                const shuffled = [...rightSide].sort((a, b) => ((a.origIdx * 31 + seed) % 97) - ((b.origIdx * 31 + seed) % 97))
                                return (
                                <div className="mt-3 ml-1 grid grid-cols-2 gap-2">
                                  <div className="space-y-1.5">
                                    {pairs.map((pair, pi) => (
                                      <div key={pi} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm text-gray-700">
                                        {pair.split('→')[0]?.trim()}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="space-y-1.5">
                                    {shuffled.map((item, pi) => (
                                      <div key={pi} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700">
                                        {item.text}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                )
                              })()}

                              {/* Ordering preview */}
                              {q.type === 'ordering' && q.answer && (() => {
                                const items = (q.answer || '').split(',').filter(Boolean).map((s, i) => ({ text: s.trim(), origIdx: i }))
                                const seed = (q.number || index) * 13 + items.length
                                const shuffled = [...items].sort((a, b) => ((a.origIdx * 37 + seed) % 89) - ((b.origIdx * 37 + seed) % 89))
                                return (
                                <div className="mt-3 ml-1 space-y-1.5">
                                  {shuffled.map((item, ii) => (
                                    <div key={ii} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                                      <span className="w-5 h-5 rounded bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-700 flex-shrink-0">?</span>
                                      <span className="text-sm text-gray-700">{item.text}</span>
                                    </div>
                                  ))}
                                </div>
                                )
                              })()}

                              {/* Math preview */}
                              {q.type === 'math' && (
                                <div className="mt-3 ml-1">
                                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                                    <p className="text-lg font-mono font-bold text-gray-800">{q.question.replace(/^Berechne:\s*/i, '')}</p>
                                  </div>
                                  <div className="mt-3 space-y-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                      <div key={i} className="border-b border-gray-300 h-6" />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Image preview */}
                              {q.type === 'image' && (
                                <div className="mt-3 ml-1">
                                  {q.imageUrl ? (
                                    <img src={q.imageUrl} alt="Aufgabenbild" className="max-h-48 rounded-lg object-contain border" />
                                  ) : (
                                    <div className="bg-pink-50 border-2 border-dashed border-pink-300 rounded-lg p-6 text-center">
                                      <Image className="h-8 w-8 mx-auto text-pink-400 mb-1" />
                                      <p className="text-xs text-pink-500">Bild wird hier angezeigt</p>
                                    </div>
                                  )}
                                  <div className="mt-3 space-y-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                      <div key={i} className="border-b border-gray-300 h-6" />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Writing lines for open/generic questions without specific type handling */}
                              {(q.type === 'open' || (!q.options && !['fill_blank', 'matching', 'ordering', 'math', 'image'].includes(q.type))) && (
                                <div className="mt-3 ml-1 space-y-3">
                                  {Array.from({ length: (q.points || 1) >= 3 ? 4 : (q.points || 1) >= 2 ? 3 : 2 }).map((_, i) => (
                                    <div key={i} className="border-b border-gray-300 h-6" />
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* Stats */}
                      <div className="mt-10 pt-6 border-t">
                        {showPts ? (
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div className="bg-gray-50 p-4 rounded-xl">
                              <p className="text-xs text-gray-500 mb-1">Gesamtpunkte</p>
                              <p className="text-2xl font-bold text-blue-600">{selectedWorksheet.content?.total_points}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl">
                              <p className="text-xs text-gray-500 mb-1">Geschätzte Zeit</p>
                              <p className="text-2xl font-bold text-blue-600">{selectedWorksheet.content?.estimated_time}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center bg-gray-50 p-4 rounded-xl">
                            <p className="text-xs text-gray-500 mb-1">Geschätzte Bearbeitungszeit</p>
                            <p className="text-2xl font-bold text-blue-600">{selectedWorksheet.content?.estimated_time}</p>
                          </div>
                        )}
                      </div>

                      {/* Teacher Notes */}
                      {selectedWorksheet.content?.teacher_notes && (
                        <div className="mt-6 bg-yellow-50 p-5 rounded-xl border border-yellow-200">
                          <h4 className="font-semibold text-sm mb-2 text-yellow-900 flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" /> Lehrernotizen
                          </h4>
                          <p className="text-sm text-yellow-800 leading-relaxed">{selectedWorksheet.content.teacher_notes}</p>
                        </div>
                      )}
                    </div>
                      )
                    })()}
                  </div>

                  {/* Editor Panel */}
                  <AnimatePresence>
                    {showEditorPanel && (
                      <motion.div className="lg:col-span-4" initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} transition={{ type: "spring", stiffness: 200, damping: 30 }}>
                        <div className="glass-card rounded-2xl p-5 sticky top-20 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Werkzeuge</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowEditorPanel(false)} aria-label="Panel schliessen"><X className="h-4 w-4" /></Button>
                          </div>
                          <Separator />

                          {/* Difficulty */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Schwierigkeit anpassen</Label>
                            <p className="text-xs text-gray-500">Generiert das Material mit anderem Niveau neu.</p>
                            <div className="grid grid-cols-3 gap-2">
                              {['easy', 'medium', 'hard'].map((level) => (
                                <Button key={level} size="sm" variant={selectedWorksheet.difficulty === level ? 'default' : 'outline'} onClick={() => handleRegenerate(selectedWorksheet.id, level)} disabled={generating || selectedWorksheet.difficulty === level} className="transition-smooth text-xs">
                                  {DIFFICULTY_LABELS[level]}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <Separator />

                          {/* Export Options */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2"><Download className="h-4 w-4" /> Exportieren</Label>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">PDF</p>
                            <Button className="w-full btn-premium text-sm" size="sm" onClick={() => handleExportPDF(selectedWorksheet, 'student')}>
                              <Download className="h-4 w-4 mr-2" /> PDF Schülerversion
                            </Button>
                            <Button variant="outline" className="w-full text-sm" size="sm" onClick={() => handleExportPDF(selectedWorksheet, 'teacher')}>
                              <Download className="h-4 w-4 mr-2" /> PDF Lehrerversion (mit Lösungen)
                            </Button>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold pt-1">Word (DOCX)</p>
                            <Button variant="outline" className="w-full text-sm border-blue-200 text-blue-700 hover:bg-blue-50" size="sm" onClick={() => handleExportDOCX(selectedWorksheet, 'student')}>
                              <FileText className="h-4 w-4 mr-2" /> Word Schülerversion
                            </Button>
                            <Button variant="outline" className="w-full text-sm border-blue-200 text-blue-700 hover:bg-blue-50" size="sm" onClick={() => handleExportDOCX(selectedWorksheet, 'teacher')}>
                              <FileText className="h-4 w-4 mr-2" /> Word Lehrerversion (mit Lösungen)
                            </Button>
                          </div>
                          <Separator />

                          {/* Actions */}
                          <div className="space-y-2">
                            {!editMode && (
                              <Button className="w-full text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200" size="sm" onClick={startEditMode}>
                                <Edit className="h-4 w-4 mr-2" /> Bearbeiten
                              </Button>
                            )}
                            <Button variant="outline" className="w-full text-sm" size="sm" onClick={() => handleDuplicate(selectedWorksheet)}>
                              <Copy className="h-4 w-4 mr-2" /> Duplizieren
                            </Button>
                            <Button className="w-full text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700" size="sm" onClick={startNewMaterial}>
                              <PlusCircle className="h-4 w-4 mr-2" /> Neues Material erstellen
                            </Button>
                          </div>
                          {getWorksheetStatus(selectedWorksheet?.id) === 'draft' && (
                            <>
                              <Separator />
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <CircleDot className="h-4 w-4 text-amber-500" />
                                  <span className="text-sm font-medium text-amber-800">Entwurf</span>
                                </div>
                                <p className="text-xs text-amber-600">Dieses Material ist noch nicht fertig. Klicken Sie auf "Bearbeiten" um weiterzuarbeiten.</p>
                              </div>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                /* CREATION FORM */
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  {/* Gamification Progress */}
                  {worksheets.length > 0 && (
                    <div className="max-w-2xl mx-auto mb-6">
                      <Card className="glass-card border-0 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                <Star className="h-5 w-5 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium text-gray-900">{worksheets.length} Materialien erstellt</p>
                                  <span className="text-xs text-gray-500">{exportHistory.length} Exporte</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all" style={{ width: `${Math.min(100, worksheets.length * 10)}%` }} />
                                </div>
                              </div>
                            </div>
                            {worksheets.length >= 5 && (
                              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">
                                <Star className="h-3 w-3 mr-0.5" /> Produktiv!
                              </Badge>
                            )}
                            {worksheets.length >= 10 && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">
                                <Crown className="h-3 w-3 mr-0.5" /> Power-User
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="max-w-2xl mx-auto mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button onClick={() => { setActiveView('library') }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
                      <FolderOpen className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                      <p className="text-xs font-medium text-gray-700">Bibliothek</p>
                      <p className="text-[10px] text-gray-400">{worksheets.length} Materialien</p>
                    </button>
                    <button onClick={() => { setActiveView('planner') }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
                      <Calendar className="h-5 w-5 text-green-500 mx-auto mb-1" />
                      <p className="text-xs font-medium text-gray-700">Jahresplaner</p>
                      <p className="text-[10px] text-gray-400">{plannerEvents.length} Termine</p>
                    </button>
                    <button onClick={() => { setActiveView('students'); loadAssignments() }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
                      <User className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                      <p className="text-xs font-medium text-gray-700">Schüler-Modus</p>
                      <p className="text-[10px] text-gray-400">Aufgaben freigeben</p>
                    </button>
                    <button onClick={() => { setActiveView('curriculum') }} className="p-3 rounded-xl bg-white/80 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-center">
                      <GraduationCap className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                      <p className="text-xs font-medium text-gray-700">Lehrplan 21</p>
                      <p className="text-[10px] text-gray-400">Kompetenzen</p>
                    </button>
                  </div>

                  <Card className="glass-card border-0 max-w-2xl mx-auto">
                    <CardHeader className="space-y-3">
                      <CardTitle className="text-2xl sm:text-3xl flex items-center gap-3">
                        <Sparkles className="h-7 w-7 text-blue-500" /> Material erstellen
                      </CardTitle>
                      <CardDescription className="text-base">Wählen Sie den Materialtyp und die Einstellungen. Die KI generiert passende Inhalte für Ihre Klasse.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleGenerate} className="space-y-6">
                        {/* Resource Type */}
                        <div>
                          <Label className="text-sm font-medium mb-3 block">Materialtyp</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {RESOURCE_TYPES.map(rt => (
                              <button key={rt.id} type="button" onClick={() => setForm({ ...form, resourceType: rt.id })}
                                className={`p-3 rounded-xl border-2 text-center transition-smooth hover:shadow-md ${form.resourceType === rt.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                <rt.icon className={`h-6 w-6 mx-auto mb-2 ${form.resourceType === rt.id ? 'text-blue-600' : 'text-gray-500'}`} />
                                <span className={`text-xs font-medium block ${form.resourceType === rt.id ? 'text-blue-700' : 'text-gray-700'}`}>{rt.label}</span>
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">{RESOURCE_TYPES.find(r => r.id === form.resourceType)?.description}</p>
                        </div>

                        {/* Topic */}
                        <div>
                          <Label className="text-sm font-medium">Thema</Label>
                          <Input placeholder={form.resourceType === 'vocabulary' ? 'z.B. Körperteile, Tiere, Essen und Trinken...' : form.resourceType === 'exam' ? 'z.B. Bruchrechnen Kapitel 3-5, Schweizer Geographie...' : 'z.B. Photosynthese, Bruchrechnen, Schweizer Geschichte...'}
                            value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} required className="input-premium mt-2" />
                          <p className="text-xs text-gray-500 mt-1.5">Je genauer das Thema, desto besser das Ergebnis.</p>
                        </div>

                        {/* Upload option in creation flow */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Upload className="h-5 w-5 text-blue-500" />
                              <div>
                                <p className="text-sm font-medium text-blue-800">Eigenes Material als Grundlage?</p>
                                <p className="text-xs text-blue-600">Laden Sie ein PDF oder Dokument hoch, aus dem die KI Fragen generiert.</p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setActiveView('upload')} className="text-xs flex-shrink-0">
                              <Upload className="h-3.5 w-3.5 mr-1" /> Hochladen
                            </Button>
                          </div>
                        </div>

                        {/* Grade + Subject */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium">Klasse</Label>
                            <Select value={form.grade} onValueChange={(value) => setForm({ ...form, grade: value })}>
                              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                              <SelectContent>{GRADES.map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Fach</Label>
                            <Select value={form.subject} onValueChange={(value) => setForm({ ...form, subject: value })}>
                              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                              <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Difficulty */}
                        <div>
                          <Label className="text-sm font-medium mb-3 block">Schwierigkeit: <span className="text-blue-600 font-semibold">{DIFFICULTY_LABELS[form.difficulty]}</span></Label>
                          <div className="flex gap-3">
                            {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
                              <Button key={key} type="button" variant={form.difficulty === key ? 'default' : 'outline'} onClick={() => setForm({ ...form, difficulty: key })} className="flex-1 transition-smooth">{label}</Button>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            {form.difficulty === 'easy' && 'Grundverständnis, einfache Wiedergabe, kurze Antworten.'}
                            {form.difficulty === 'medium' && 'Anwendung und Analyse, längere Aufgaben.'}
                            {form.difficulty === 'hard' && 'Synthese und Bewertung, komplexe Problemlösung.'}
                          </p>
                        </div>

                        {/* Question Types */}
                        <div>
                          <Label className="text-sm font-medium mb-3 block">Fragetypen <span className="text-gray-400 font-normal">(optional – leer = gemischt)</span></Label>
                          <div className="flex flex-wrap gap-2">
                            {QUESTION_TYPES.map(qt => (
                              <button key={qt.id} type="button" onClick={() => setSelectedQuestionTypes(prev => prev.includes(qt.id) ? prev.filter(t => t !== qt.id) : [...prev, qt.id])}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth ${selectedQuestionTypes.includes(qt.id) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                <qt.icon className="h-3 w-3" />
                                {qt.label}
                              </button>
                            ))}
                          </div>
                          {selectedQuestionTypes.length > 0 && (
                            <p className="text-xs text-blue-600 mt-2">{selectedQuestionTypes.length} Fragetyp{selectedQuestionTypes.length > 1 ? 'en' : ''} ausgewählt – KI erstellt passende Aufgaben</p>
                          )}
                        </div>

                        {/* Question Count */}
                        <div>
                          <Label className="text-sm font-medium mb-3 block">Anzahl Fragen: <span className="text-blue-600 font-semibold">{form.questionCount}</span></Label>
                          <Slider value={[form.questionCount]} onValueChange={(value) => setForm({ ...form, questionCount: value[0] })} min={3} max={25} step={1} className="mt-2" />
                          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>3</span><span>25</span></div>
                        </div>

                        {error && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></motion.div>)}

                        {user?.subscription_tier === 'free' && user?.worksheets_used_this_month >= 5 && (
                          <Alert><AlertDescription className="flex items-center justify-between"><span>Monatliches Limit (5 Materialien) erreicht.</span><Button variant="link" onClick={handleUpgrade} className="ml-2 text-blue-600">Jetzt upgraden</Button></AlertDescription></Alert>
                        )}

                        <Button type="submit" className="w-full btn-premium text-lg py-6" disabled={generating || !form.topic.trim() || (user?.subscription_tier === 'free' && user?.worksheets_used_this_month >= 5)}>
                          {generating ? (<><Zap className="h-5 w-5 mr-2 animate-pulse" /> Wird erstellt...</>) : (<><Sparkles className="h-5 w-5 mr-2" /> {RESOURCE_TYPES.find(r => r.id === form.resourceType)?.label || 'Material'} erstellen</>)}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {user?.subscription_tier === 'free' && (
                    <Card className="glass-card border-0 max-w-2xl mx-auto mt-8 bg-gradient-to-br from-blue-50 to-purple-50">
                      <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-3"><Crown className="h-6 w-6 text-yellow-500" /> Upgrade auf Premium</CardTitle>
                        <CardDescription>Unbegrenzte Materialien für nur CHF 19.90/Monat</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 mb-6">
                          {['Unbegrenzte Materialerstellung', 'Alle Fächer und Klassenstufen', 'PDF-Export mit Lösungen und Lehrernotizen', 'Prioritäts-Support'].map((b, i) => (
                            <li key={i} className="flex items-center text-sm"><CheckCircle2 className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" /><span className="text-gray-700">{b}</span></li>
                          ))}
                        </ul>
                        <Button onClick={handleUpgrade} className="w-full btn-premium bg-gradient-to-r from-blue-600 to-purple-600"><Crown className="h-4 w-4 mr-2" /> Jetzt upgraden</Button>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ============ LIBRARY VIEW ============ */}
          {activeView === 'library' && (
            <motion.div key="library" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-2">Meine Materialien</h2>
                <p className="text-gray-600">Alle erstellten Arbeitsblätter, Prüfungen, Quizze und Vokabellisten.</p>
              </div>
              <div className="glass-card rounded-xl p-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Materialien durchsuchen..." value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} className="pl-9" /></div>
                  <Select value={libraryFilterSubject} onValueChange={setLibraryFilterSubject}><SelectTrigger className="w-full sm:w-[180px]"><Filter className="h-4 w-4 mr-2 text-gray-400" /><SelectValue placeholder="Fach" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Fächer</SelectItem>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                  <Select value={libraryFilterGrade} onValueChange={setLibraryFilterGrade}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Klasse" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Klassen</SelectItem>{GRADES.map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              {worksheets.length > 0 && (<p className="text-sm text-gray-500 mb-4">{filteredWorksheets.length} von {worksheets.length} Materialien{(librarySearch || libraryFilterSubject !== 'all' || libraryFilterGrade !== 'all') && (<Button variant="link" size="sm" className="ml-2 text-blue-600 p-0 h-auto" onClick={() => { setLibrarySearch(''); setLibraryFilterSubject('all'); setLibraryFilterGrade('all') }}>Filter zurücksetzen</Button>)}</p>)}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {worksheets.length === 0 ? (
                  <div className="col-span-full">
                    <Card className="glass-card border-0"><CardContent className="py-20 text-center">
                      <div className="w-20 h-20 mx-auto mb-6 bg-blue-50 rounded-2xl flex items-center justify-center"><FolderOpen className="h-10 w-10 text-blue-400" /></div>
                      <h3 className="text-xl font-semibold text-gray-800 mb-2">Ihre Bibliothek ist noch leer</h3>
                      <p className="text-gray-500 mb-6 max-w-md mx-auto">Erstellen Sie Ihr erstes Arbeitsblatt, eine Prüfung oder ein Quiz.</p>
                      <div className="flex gap-3 justify-center">
                        <Button onClick={() => setActiveView('create')} className="btn-premium"><PlusCircle className="h-4 w-4 mr-2" /> Erstes Material erstellen</Button>
                        <Button variant="outline" onClick={() => setActiveView('templates')}><LayoutTemplate className="h-4 w-4 mr-2" /> Vorlagen ansehen</Button>
                      </div>
                    </CardContent></Card>
                  </div>
                ) : filteredWorksheets.length === 0 ? (
                  <div className="col-span-full"><Card className="glass-card border-0"><CardContent className="py-16 text-center"><Search className="h-12 w-12 mx-auto text-gray-300 mb-4" /><h3 className="text-lg font-semibold text-gray-700 mb-2">Keine Ergebnisse</h3><p className="text-gray-500 mb-4">Versuchen Sie andere Suchbegriffe oder Filter.</p><Button variant="outline" onClick={() => { setLibrarySearch(''); setLibraryFilterSubject('all'); setLibraryFilterGrade('all') }}>Filter zurücksetzen</Button></CardContent></Card></div>
                ) : (
                  filteredWorksheets.map((worksheet, index) => (
                    <motion.div key={worksheet.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                      <Card className="glass-card border-0 hover-lift cursor-pointer h-full flex flex-col" onClick={() => { setSelectedWorksheet(worksheet); setShowEditorPanel(true); setActiveView('create') }}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base leading-tight line-clamp-2 min-h-[2.5rem] flex-1">{worksheet.title}</CardTitle>
                            {getWorksheetStatus(worksheet.id) === 'draft' && (
                              <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-[10px] flex-shrink-0 ml-2">Entwurf</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="outline" className="text-xs">{worksheet.grade}. Klasse</Badge>
                            <Badge variant="outline" className="text-xs">{worksheet.subject}</Badge>
                            <Badge variant="outline" className="text-xs">{DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <div className="flex items-center gap-3 text-xs text-gray-500"><span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {worksheet.content?.questions?.length || 0} Fragen</span><span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(worksheet.created_at).toLocaleDateString('de-CH')}</span></div>
                        </CardContent>
                        <CardFooter className="pt-0">
                          <div className="flex gap-2 w-full">
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); setSelectedWorksheet(worksheet); setShowEditorPanel(true); setActiveView('create') }} className="flex-1 text-xs"><Eye className="h-3.5 w-3.5 mr-1" /> Ansehen</Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleExportPDF(worksheet, 'student') }} title="PDF Schülerversion"><Download className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDuplicate(worksheet) }} title="Duplizieren"><Copy className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDelete(worksheet.id) }} className="text-red-500 hover:text-red-600" title="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </CardFooter>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {/* ============ UPLOAD VIEW ============ */}
          {activeView === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-2">Material hochladen</h2>
                <p className="text-gray-600">Laden Sie eigene Dokumente hoch und lassen Sie die KI daraus neue Lernmaterialien erstellen.</p>
              </div>
              <Card className="glass-card border-0"><CardContent className="pt-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">1</div><Label className="text-sm font-semibold">Dateien hochladen</Label></div>
                  <div onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true) }} onDragLeave={() => setUploadDragOver(false)} onDrop={handleFileDrop} onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-smooth ${uploadDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'}`}>
                    <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp,.pptx,.ppt,.mp3,.wav,.m4a,.ogg,.mp4,.xlsx,.xls,.csv,.rtf" onChange={handleFileDrop} className="hidden" />
                    <Upload className={`h-12 w-12 mx-auto mb-4 ${uploadDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                    <p className="font-medium text-gray-700 mb-2">{uploadDragOver ? 'Dateien hier ablegen...' : 'Dateien hierher ziehen oder klicken'}</p>
                    <p className="text-xs text-gray-500">PDF, Word, PowerPoint, Bilder, Audio, Excel, Text • Mehrere Dateien möglich</p>
                  </div>
                </div>
                {uploadedFiles.length > 0 && (<div className="space-y-2">{uploadedFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-3"><FileType className="h-5 w-5 text-blue-500" /><div><p className="text-sm font-medium text-gray-800">{file.name}</p><p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p></div></div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveFile(i)} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></Button>
                  </div>
                ))}</div>)}

                <div>
                  <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">2</div><Label className="text-sm font-semibold">Anweisungen an die KI (optional)</Label></div>
                  <Textarea placeholder='z.B. "Fokus auf Kapitel 3", "Für 5. Klasse anpassen", "Nur als Inspiration verwenden"...' value={uploadInstructions} onChange={(e) => setUploadInstructions(e.target.value)} className="min-h-[100px]" />
                  <p className="text-xs text-gray-500 mt-1.5">Teilen Sie der KI mit, wie sie das hochgeladene Material verwenden soll.</p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">3</div><Label className="text-sm font-semibold">Material analysieren & generieren</Label></div>
                  {uploadAnalysisComplete ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-4">
                      <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" /><p className="font-medium text-green-800">Analyse abgeschlossen</p></div>

                      {/* Show analysis results */}
                      {uploadAnalysisResult && (
                        <div className="bg-white rounded-lg p-4 border border-green-100 space-y-3">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Erkanntes Thema</p>
                            <p className="text-sm font-medium text-gray-900">{uploadAnalysisResult.title}</p>
                          </div>
                          {uploadAnalysisResult.content_summary && (
                            <div>
                              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Zusammenfassung</p>
                              <p className="text-sm text-gray-700">{uploadAnalysisResult.content_summary}</p>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {uploadAnalysisResult.subject && <Badge variant="outline" className="text-xs">{uploadAnalysisResult.subject}</Badge>}
                            {uploadAnalysisResult.grade_suggestion && <Badge variant="outline" className="text-xs">{uploadAnalysisResult.grade_suggestion}. Klasse empfohlen</Badge>}
                            {uploadAnalysisResult.difficulty_suggestion && <Badge variant="outline" className="text-xs">{DIFFICULTY_LABELS[uploadAnalysisResult.difficulty_suggestion] || uploadAnalysisResult.difficulty_suggestion}</Badge>}
                          </div>
                          {uploadAnalysisResult.key_topics?.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Erkannte Themen</p>
                              <div className="flex flex-wrap gap-1.5">
                                {uploadAnalysisResult.key_topics.map((topic, i) => (
                                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{topic}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-sm text-green-700 font-medium">Wählen Sie nun, was daraus erstellt werden soll:</p>
                      <div className="flex flex-wrap gap-2">
                        {RESOURCE_TYPES.map(rt => (
                          <Button key={rt.id} variant={rt.id === (uploadAnalysisResult?.material_type_suggestion || 'worksheet') ? 'default' : 'outline'} size="sm" onClick={() => {
                            const analysis = uploadAnalysisResult || {}
                            const topicText = analysis.title || uploadedFiles.map(f => f.name).join(', ')
                            const topicsStr = (analysis.key_topics || []).join(', ')
                            setForm(prev => ({
                              ...prev,
                              resourceType: rt.id,
                              topic: topicText + (topicsStr ? ` – Schwerpunkte: ${topicsStr}` : '') + (uploadInstructions ? ` – ${uploadInstructions}` : ''),
                              subject: analysis.subject && SUBJECTS.includes(analysis.subject) ? analysis.subject : prev.subject,
                              grade: analysis.grade_suggestion || prev.grade,
                              difficulty: analysis.difficulty_suggestion || prev.difficulty,
                            }))
                            setActiveView('create')
                          }}>
                            <rt.icon className="h-4 w-4 mr-1.5" /> {rt.label} erstellen
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Button className="w-full btn-premium" disabled={uploadedFiles.length === 0 || uploadAnalyzing} onClick={handleAnalyzeUpload}>
                      {uploadAnalyzing ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Wird analysiert...</>) : (<><Sparkles className="h-4 w-4 mr-2" /> {uploadedFiles.length === 0 ? 'Zuerst Dateien hochladen' : `${uploadedFiles.length} Datei${uploadedFiles.length > 1 ? 'en' : ''} analysieren`}</>)}
                    </Button>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex gap-3"><Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" /><div>
                    <p className="text-sm font-medium text-blue-800 mb-1">Unterstützte Formate</p>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>• <strong>Dokumente:</strong> PDF, Word (.docx/.doc), PowerPoint (.pptx), Excel, Text</li>
                      <li>• <strong>Bilder:</strong> PNG, JPG, GIF, WebP</li>
                      <li>• <strong>Audio:</strong> MP3, WAV, M4A, OGG</li>
                      <li>• Die KI analysiert den Inhalt und erstellt daraus passende Lernmaterialien.</li>
                    </ul>
                  </div></div>
                </div>
              </CardContent></Card>
            </motion.div>
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
                  {filteredTemplates.map((template, index) => {
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
                  {LEHRPLAN_CYCLES.map(cycle => {
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

          {/* ============ SETTINGS VIEW ============ */}
          {activeView === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-2">Einstellungen</h2>
                <p className="text-gray-600">Passen Sie EduFlow an Ihre Bedürfnisse an.</p>
              </div>
              <div className="space-y-6">
                <Card className="glass-card border-0">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5 text-blue-500" /> Profil</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div><p className="font-medium text-gray-900">{user?.name}</p><p className="text-sm text-gray-500">{user?.email}</p></div>
                      {user?.subscription_tier === 'premium' ? (<Badge className="bg-gradient-to-r from-yellow-400 to-orange-500"><Crown className="h-3 w-3 mr-1" /> Premium</Badge>) : (<div className="text-right"><Badge variant="secondary" className="mb-1">Free</Badge><p className="text-xs text-gray-500">{user?.worksheets_used_this_month || 0}/5 diesen Monat</p></div>)}
                    </div>
                    {user?.subscription_tier !== 'premium' && (<Button onClick={handleUpgrade} className="w-full btn-premium bg-gradient-to-r from-blue-600 to-purple-600"><Crown className="h-4 w-4 mr-2" /> Auf Premium upgraden – CHF 19.90/Monat</Button>)}
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Settings className="h-5 w-5 text-blue-500" /> Standard-Einstellungen</CardTitle><CardDescription>Diese Werte werden beim Erstellen neuer Materialien vorausgefüllt.</CardDescription></CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label className="text-sm">Standard-Klasse</Label><Select value={settings.defaultGrade} onValueChange={(v) => setSettings({...settings, defaultGrade: v})}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{GRADES.map(n => <SelectItem key={n} value={String(n)}>{n}. Klasse</SelectItem>)}</SelectContent></Select></div>
                      <div><Label className="text-sm">Standard-Fach</Label><Select value={settings.defaultSubject} onValueChange={(v) => setSettings({...settings, defaultSubject: v})}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label className="text-sm">Standard-Schwierigkeit</Label><Select value={settings.defaultDifficulty} onValueChange={(v) => setSettings({...settings, defaultDifficulty: v})}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label className="text-sm">Standard-Fragenanzahl</Label><Input type="number" min={3} max={25} value={settings.defaultQuestionCount} onChange={(e) => setSettings({...settings, defaultQuestionCount: parseInt(e.target.value) || 10})} className="mt-1.5" /></div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Printer className="h-5 w-5 text-blue-500" /> Export-Einstellungen</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">Lehrernotizen einschliessen</p><p className="text-xs text-gray-500">Tipps zur Bewertung und häufige Schüler-Fehler</p></div><Switch checked={settings.includeTeacherNotes} onCheckedChange={(v) => setSettings({...settings, includeTeacherNotes: v})} /></div>
                    <Separator />
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">Lösungsschlüssel einschliessen</p><p className="text-xs text-gray-500">Separate Seite mit allen Antworten</p></div><Switch checked={settings.includeAnswerKey} onCheckedChange={(v) => setSettings({...settings, includeAnswerKey: v})} /></div>
                    <Separator />
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">Legasthenie-freundliche Schrift</p><p className="text-xs text-gray-500">Verwendet OpenDyslexic für bessere Lesbarkeit</p></div><Switch checked={settings.dyslexiaFont} onCheckedChange={(v) => setSettings({...settings, dyslexiaFont: v})} /></div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Bell className="h-5 w-5 text-blue-500" /> Benachrichtigungen</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"><div><p className="text-sm font-medium">E-Mail-Benachrichtigungen</p><p className="text-xs text-gray-500">Tipps, neue Funktionen und wöchentliche Zusammenfassungen</p></div><Switch checked={settings.emailNotifications} onCheckedChange={(v) => setSettings({...settings, emailNotifications: v})} /></div>
                  </CardContent>
                </Card>

                <Button className="w-full btn-premium" onClick={handleSaveSettings}><CheckCircle2 className="h-4 w-4 mr-2" /> Einstellungen speichern</Button>
              </div>
            </motion.div>
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

export default Home
