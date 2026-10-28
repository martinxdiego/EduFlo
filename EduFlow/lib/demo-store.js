import { z } from 'zod'

export const DEMO_STORAGE_KEY = 'eduflow_public_demo_v1'
export const DEMO_MAX_BYTES = 500_000
export const DEMO_QUESTION_TYPES = ['multiple_choice', 'true_false', 'open', 'math', 'image', 'matching', 'fill_blank', 'ordering', 'either_or', 'table', 'image_block']
const text = z.string().max(6000)
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const answer = z.union([text, z.number().finite(), z.boolean(), z.array(text).max(50), z.array(z.object({ left: text, right: text }).strict()).max(50)])
const questionSchema = z.object({
  id: identifier, number: z.number().int().min(1).max(100).optional(),
  type: z.enum(DEMO_QUESTION_TYPES), question: text, answer,
  options: z.array(z.string().max(1000)).max(20).optional(), points: z.number().min(0).max(100).optional(),
  explanation: text.optional(), tableHeaders: z.array(z.string().max(1000)).max(10).optional(),
  tableRows: z.array(z.array(z.string().max(1000)).max(10)).max(30).optional(),
  imageSize: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAlignment: z.enum(['left', 'center', 'right']).optional(),
  imageCaption: text.optional(), caption: text.optional(), alt: text.optional(),
}).strict()
const materialSchema = z.object({
  id: identifier, title: z.string().min(1).max(200), subject: z.string().max(100), grade: z.string().max(20),
  difficulty: z.enum(['easy', 'medium', 'hard']), theme: z.enum(['classic', 'natur', 'ozean', 'weltraum']), status: z.enum(['draft', 'review', 'ready']),
  resourceType: z.literal('worksheet').optional(), question_count: z.number().int().min(0).max(100).optional(),
  created_at: z.string().datetime(), updated_at: z.string().datetime(),
  content: z.object({ title: z.string().max(200), teacher_notes: text, total_points: z.number().min(0).max(10000).optional(), questions: z.array(questionSchema).max(100) }).strict(),
}).strict()
export const demoLibrarySchema = z.object({ version: z.literal(1), materials: z.array(materialSchema).min(1).max(20), selectedId: identifier }).strict().superRefine((state, context) => {
  const ids = state.materials.map(item => item.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Doppelte Material-ID.' })
  if (!ids.includes(state.selectedId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Ausgewähltes Material fehlt.' })
  for (const material of state.materials) {
    const questions = material.content.questions.map(item => item.id).filter(Boolean)
    if (new Set(questions).size !== questions.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Doppelte Aufgaben-ID.' })
  }
})

function id() {
  return `demo_${globalThis.crypto.randomUUID()}`
}

export function createDemoQuestion(type = 'open') {
  if (!DEMO_QUESTION_TYPES.includes(type)) throw new Error('Unbekannter Aufgabentyp.')
  const item = { id: id(), type, question: '', answer: '', points: 1 }
  if (type === 'multiple_choice') Object.assign(item, { options: ['Antwort A', 'Antwort B', 'Antwort C'], answer: 'Antwort A' })
  if (type === 'true_false') Object.assign(item, { options: ['Wahr', 'Falsch'], answer: false })
  if (type === 'either_or') Object.assign(item, { options: ['Ja', 'Nein'], answer: 'Ja' })
  if (type === 'ordering') item.answer = ['Erster Schritt', 'Zweiter Schritt', 'Dritter Schritt']
  if (type === 'matching') item.answer = [{ left: 'Begriff', right: 'Erklärung' }]
  if (type === 'fill_blank') Object.assign(item, { question: 'Ein ___ wird zu ___.', answer: ['Wort', 'Wörtern'] })
  if (type === 'math') item.answer = 0
  if (type === 'table') Object.assign(item, { tableHeaders: ['Begriff', 'Erklärung'], tableRows: [['', '']] })
  if (type === 'image_block') Object.assign(item, { imageSize: 'medium', imageAlignment: 'center', imageCaption: 'Platz für eine eigene Zeichnung' })
  return item
}

const waterQuestions = [
  { type: 'ordering', question: 'Ordne die Schritte des Wasserkreislaufs. Beginne beim Wasser im See.', answer: ['Verdunstung', 'Kondensation', 'Niederschlag'] },
  { type: 'true_false', question: 'Wasser verdunstet nur bei hundert Grad.', answer: false, options: ['Wahr', 'Falsch'] },
  { type: 'multiple_choice', question: 'Was entsteht durch Kondensation?', answer: 'Wolken', options: ['Wolken', 'Sand', 'Steine'] },
  { type: 'open', question: 'Beschreibe den Weg eines Regentropfens in deinen Worten.', answer: 'Wasser verdunstet, kondensiert zu Tröpfchen und fällt als Niederschlag zurück.' },
  { type: 'math', question: 'Ein Gefäss enthält 10 Liter Wasser. 10 Liter werden entnommen. Wie viel bleibt übrig?', answer: 0 },
  { type: 'matching', question: 'Ordne die Begriffe richtig zu.', answer: [{ left: 'Sonne', right: 'Energie' }, { left: 'Regen', right: 'Niederschlag' }] },
  { type: 'fill_blank', question: 'Aus ___ werden ___.', answer: ['Wassertröpfchen', 'Wolken'] },
  { type: 'either_or', question: 'Ist Wasserdampf gasförmig?', answer: 'Ja', options: ['Ja', 'Nein'] },
  { type: 'image', question: 'Zeichne eine Wolke und beschreibe, woraus sie besteht.', answer: 'Eine Wolke besteht aus kleinen Wassertröpfchen oder Eiskristallen.' },
  { type: 'table', question: 'Ergänze Beispiele für die Zustände des Wassers.', answer: 'Fest: Eis. Flüssig: Wasser. Gasförmig: Wasserdampf.', tableHeaders: ['Zustand', 'Beispiel'], tableRows: [['fest', ''], ['flüssig', ''], ['gasförmig', '']] },
  { type: 'image_block', question: 'Zeichne hier deinen Wasserkreislauf.', answer: '', imageSize: 'large', imageAlignment: 'center', imageCaption: 'Deine Zeichnung' },
]
const examples = {
  water: { title: 'Der Wasserkreislauf', subject: 'NMG', grade: '5', questions: waterQuestions },
  math: { title: 'Zahlen entdecken', subject: 'Mathematik', grade: '3', questions: [
    { type: 'math', question: 'Berechne 36 + 27. Erkläre deinen Rechenweg.', answer: 63 },
    { type: 'multiple_choice', question: 'Welche Zahl ist durch 5 teilbar?', options: ['42', '65', '73'], answer: '65' },
    { type: 'ordering', question: 'Ordne die Zahlen von klein nach gross.', answer: ['24', '42', '64', '86'] },
    { type: 'true_false', question: '7 mal 8 ergibt 54.', options: ['Wahr', 'Falsch'], answer: false },
    { type: 'open', question: 'Erfinde eine Rechengeschichte zu 4 mal 6.', answer: 'Zum Beispiel: Vier Schachteln enthalten je sechs Stifte. Zusammen sind es 24 Stifte.' },
  ] },
  german: { title: 'Eine Geschichte wächst', subject: 'Deutsch', grade: '4', questions: [
    { type: 'open', question: 'Eine geheimnisvolle Tür steht mitten im Wald. Schreibe einen spannenden Anfang.', answer: 'Individuelle Lösung. Ein guter Anfang macht neugierig und beschreibt die Situation.' },
    { type: 'matching', question: 'Verbinde das Nomen mit dem passenden Verb.', answer: [{ left: 'der Bach', right: 'plätschert' }, { left: 'der Wind', right: 'rauscht' }, { left: 'die Sonne', right: 'scheint' }] },
    { type: 'fill_blank', question: 'Die ___ Tür öffnet sich ___.', answer: ['alte', 'langsam'] },
    { type: 'multiple_choice', question: 'Welches Wort ist ein Adjektiv?', options: ['rennen', 'Wald', 'geheimnisvoll'], answer: 'geheimnisvoll' },
    { type: 'open', question: 'Lies deinen Anfang noch einmal. Verbessere eine Formulierung und begründe deine Wahl.', answer: 'Individuelle Lösung mit einer nachvollziehbaren Begründung.' },
  ] },
}

export function createDemoWorksheet(kind = 'water') {
  const example = examples[kind]
  if (!example) throw new Error('Unbekanntes Beispiel.')
  const now = new Date().toISOString()
  return { id: id(), title: example.title, subject: example.subject, grade: example.grade, difficulty: 'medium', theme: 'classic', status: 'draft', resourceType: 'worksheet',
    created_at: now, updated_at: now, content: { title: example.title, teacher_notes: 'Synthetisches Beispiel. Bitte prüfe das Material vor dem Unterrichtseinsatz selbst.', questions: example.questions.map((item, index) => ({ ...JSON.parse(JSON.stringify(item)), id: id(), number: index + 1, points: 1 })) } }
}

export function createDemoLibrary() {
  const material = createDemoWorksheet('water')
  return { version: 1, materials: [material], selectedId: material.id }
}

export function serializeDemoBackup(state) {
  const validated = demoLibrarySchema.parse(state)
  const text = JSON.stringify(validated, null, 2)
  if (new TextEncoder().encode(text).byteLength > DEMO_MAX_BYTES) throw new Error('Die Demo-Sicherung ist zu gross. Maximal 500 KB sind erlaubt.')
  return text
}

export function parseDemoBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > DEMO_MAX_BYTES) throw new Error('Die Demo-Sicherung ist zu gross oder ungültig.')
  return demoLibrarySchema.parse(JSON.parse(text))
}

export function readDemoLibrary(storage) {
  try {
    const text = storage.getItem(DEMO_STORAGE_KEY)
    return { state: text == null ? createDemoLibrary() : parseDemoBackup(text), warning: '' }
  } catch {
    return { state: createDemoLibrary(), warning: 'Deine lokale Demo konnte nicht geladen werden. Deine bisherigen Daten wurden nicht überschrieben. Sichere neue Änderungen als Datei, bevor du den Browser schliesst.' }
  }
}

export function saveDemoLibrary(storage, state) {
  try {
    const text = serializeDemoBackup(state)
    storage.setItem(DEMO_STORAGE_KEY, text)
    return { ok: true, error: '' }
  } catch {
    return { ok: false, error: 'Speichern auf diesem Gerät ist fehlgeschlagen. Deine Änderungen bleiben geöffnet. Lade eine Sicherung herunter und versuche es erneut.' }
  }
}
