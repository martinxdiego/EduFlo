import {
  FileText, ClipboardList, Lightbulb, Languages, BookOpen,
  ListChecks, ToggleLeft, MessageSquare, Calculator, Image, ImagePlus,
  ArrowLeftRight, Type, ListOrdered, GitBranch, Table2,
  ChevronUp, ChevronDown, PlusCircle, Shuffle, Target, Sparkles
} from 'lucide-react'

// ============================================================
// RESOURCE TYPES
// ============================================================
export const RESOURCE_TYPES = [
  { id: 'worksheet', label: 'Arbeitsblatt', icon: FileText, description: 'Klassische Aufgabenblätter mit verschiedenen Fragetypen', color: 'blue' },
  { id: 'exam', label: 'Prüfung', icon: ClipboardList, description: 'Benotete Prüfung mit Punkteverteilung und Lösungsschlüssel', color: 'red' },
  { id: 'quiz', label: 'Quiz', icon: Lightbulb, description: 'Kurze Lernkontrollen mit sofortigem Feedback', color: 'green' },
  { id: 'vocabulary', label: 'Wortschatz', icon: Languages, description: 'Vokabellisten mit Übungen und Abfragen', color: 'purple' },
  { id: 'dossier', label: 'Arbeitsdossier', icon: BookOpen, description: 'Komplettes Lerndossier mit 15-20 Seiten: Theorie, Aufgaben, Lernziele und Lösungen', color: 'indigo' },
]

// ============================================================
// SUBJECTS
// ============================================================
export const SUBJECTS_PRIMAR = [
  'Deutsch', 'Mathematik', 'NMG', 'Englisch', 'Französisch',
  'Bildnerisches Gestalten', 'Musik', 'Bewegung und Sport'
]

export const SUBJECTS_SEK = [
  'Deutsch', 'Mathematik', 'Französisch', 'Englisch',
  'RZG', 'Natur und Technik', 'Bildnerisches Gestalten',
  'Musik', 'TTG', 'Bewegung und Sport', 'Medien und Informatik',
  'Berufliche Orientierung', 'Projektunterricht'
]

export const SUBJECTS = [...new Set([...SUBJECTS_PRIMAR, ...SUBJECTS_SEK])]

export const getSubjectsForGrade = (grade) => {
  const g = parseInt(grade, 10)
  if (g >= 7) return SUBJECTS_SEK
  return SUBJECTS_PRIMAR
}

// ============================================================
// GRADES & DIFFICULTY
// ============================================================
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const DIFFICULTY_LABELS = {
  easy: 'Einfach',
  medium: 'Mittel',
  hard: 'Schwierig'
}

// ============================================================
// QUESTION TYPES
// ============================================================
export const QUESTION_TYPES = [
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
  { id: 'image_block', label: 'Bildfeld', icon: ImagePlus, description: 'Bild einfügen mit Grösse und Ausrichtung', color: 'teal' },
]

// ============================================================
// KI ACTIONS
// ============================================================
export const KI_ACTIONS = [
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

// ============================================================
// TEMPLATE CATEGORIES
// ============================================================
export const TEMPLATE_CATEGORIES = [
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
