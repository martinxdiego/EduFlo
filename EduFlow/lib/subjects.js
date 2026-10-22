// Shared selection values for planning, generation and material filters.
export const SUBJECTS_PRIMAR = [
  'Deutsch', 'Mathematik', 'NMG', 'Englisch', 'Französisch',
  'Bildnerisches Gestalten', 'TTG', 'Musik', 'Bewegung und Sport',
  'Medien und Informatik',
]

export const SUBJECTS_SEK = [
  'Deutsch', 'Mathematik', 'Französisch', 'Englisch',
  'RZG', 'Natur und Technik', 'Bildnerisches Gestalten',
  'Musik', 'TTG', 'Bewegung und Sport', 'Medien und Informatik',
  'Ethik, Religionen, Gemeinschaft', 'Wirtschaft, Arbeit, Haushalt',
  'Berufliche Orientierung', 'Projektunterricht',
]

export const SUBJECTS = [...new Set([...SUBJECTS_PRIMAR, ...SUBJECTS_SEK])]

export function getSubjectsForGrade(grade) {
  return Number(grade) >= 7 ? SUBJECTS_SEK : SUBJECTS_PRIMAR
}

export function canonicalSubject(subject) {
  if (subject === 'Räume, Zeiten, Gesellschaften') return 'RZG'
  if (subject === 'Textiles und Technisches Gestalten') return 'TTG'
  return subject
}
