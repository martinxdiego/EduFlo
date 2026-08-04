import { NextResponse } from 'next/server'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'
import { generateOpenAIJson } from '@/lib/server/openai-service'
import { logComplete, logFailure, requestContext } from '@/lib/server/logger'
import { evaluateStudioArtifact } from '@/lib/server/studio-quality'

export const runtime = 'nodejs'

const TEXT_ARRAY_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'STRING' }
}

const STUDIO_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  propertyOrdering: [
    'title',
    'summary',
    'keyPoints',
    'learningGoals',
    'teachingNotes',
    'slides',
    'flashcards',
    'quiz',
    'audioScript',
    'sourceNotes'
  ],
  required: [
    'title',
    'summary',
    'keyPoints',
    'learningGoals',
    'teachingNotes',
    'slides',
    'flashcards',
    'quiz',
    'audioScript',
    'sourceNotes'
  ],
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    keyPoints: { ...TEXT_ARRAY_SCHEMA, maxItems: '5' },
    learningGoals: { ...TEXT_ARRAY_SCHEMA, maxItems: '4' },
    teachingNotes: { type: 'STRING' },
    slides: {
      type: 'ARRAY',
      maxItems: '4',
      items: {
        type: 'OBJECT',
        required: ['title', 'bullets', 'speakerNotes'],
        properties: {
          title: { type: 'STRING' },
          bullets: { ...TEXT_ARRAY_SCHEMA, maxItems: '4' },
          speakerNotes: { type: 'STRING' },
          visualPrompt: { type: 'STRING' }
        }
      }
    },
    flashcards: {
      type: 'ARRAY',
      maxItems: '5',
      items: {
        type: 'OBJECT',
        required: ['front', 'back'],
        properties: {
          front: { type: 'STRING' },
          back: { type: 'STRING' }
        }
      }
    },
    quiz: {
      type: 'ARRAY',
      maxItems: '3',
      items: {
        type: 'OBJECT',
        required: ['question', 'options', 'answer', 'explanation'],
        properties: {
          question: { type: 'STRING' },
          options: { ...TEXT_ARRAY_SCHEMA, maxItems: '4' },
          answer: { type: 'STRING' },
          explanation: { type: 'STRING' }
        }
      }
    },
    audioScript: { type: 'STRING' },
    sourceNotes: { type: 'STRING' }
  }
}

function jsonResponse(body, init) {
  const response = NextResponse.json(body, init)
  return applyCorsHeaders(response)
}

function verifyToken(request) {
  return verifyAuthToken(request)
}

function stripJsonFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

function parseJsonObject(text) {
  const clean = stripJsonFence(text)
  try {
    return JSON.parse(clean)
  } catch {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1))
    }
    throw new Error('Die KI-Antwort war kein valides JSON.')
  }
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function getErrorText(error) {
  return `${error?.message || ''} ${error?.status || ''} ${error?.code || ''}`.toLowerCase()
}

function isRecoverableStudioError(error) {
  const text = getErrorText(error)
  return error?.name === 'SyntaxError' ||
    text.includes('429') ||
    text.includes('quota') ||
    text.includes('503') ||
    text.includes('high demand') ||
    text.includes('overloaded') ||
    text.includes('unavailable') ||
    text.includes('expected') ||
    text.includes('json') ||
    text.includes('not valid json')
}

function getFallbackReason(error) {
  const text = getErrorText(error)
  if (text.includes('429') || text.includes('quota')) return 'Das KI-Kontingent limitiert diesen Studio-Request.'
  if (text.includes('503') || text.includes('high demand') || text.includes('overloaded') || text.includes('unavailable')) return 'Der KI-Dienst ist gerade überlastet oder nicht verfügbar.'
  if (text.includes('invalid_argument') || text.includes('schema')) return 'Der KI-Dienst hat das angeforderte JSON-Schema nicht akzeptiert.'
  if (error?.name === 'SyntaxError' || text.includes('expected') || text.includes('json') || text.includes('not valid json')) return 'Der KI-Dienst hat keine gültige JSON-Antwort geliefert.'
  return 'Der KI-Dienst hat für diesen Studio-Request nicht erfolgreich geantwortet.'
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSentences(sourceText) {
  const sentences = cleanText(sourceText)
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 20)

  if (sentences.length) return sentences

  return cleanText(sourceText)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length >= 20)
}

function createFallbackArtifact({ sourceText, title, grade, subject }) {
  const sentences = splitSentences(sourceText)
  const keyPoints = sentences.slice(0, 6).map(sentence => sentence.slice(0, 220))
  const inferredTitle = title || keyPoints[0]?.split(' ').slice(0, 8).join(' ') || 'Studio-Material'
  const summary = keyPoints.length
    ? keyPoints.slice(0, 3).join(' ')
    : cleanText(sourceText).slice(0, 900)
  const learningGoals = [
    `Die Lernenden koennen die wichtigsten Inhalte zu "${inferredTitle}" in eigenen Worten zusammenfassen.`,
    `Die Lernenden koennen zentrale Begriffe und Zusammenhaenge aus dem Quellenmaterial erklaeren.`,
    `Die Lernenden koennen mindestens zwei Aussagen aus der Quelle mit Beispielen belegen.`
  ]

  const slideChunks = keyPoints.length ? keyPoints : [summary]
  const slides = [
    {
      title: inferredTitle,
      bullets: [
        subject ? `Fach: ${subject}` : 'Aus Quellenmaterial erstellt',
        grade ? `Stufe: ${grade}` : 'Stufe flexibel anpassbar',
        'Zentrale Inhalte gemeinsam klaeren'
      ],
      speakerNotes: summary
    },
    {
      title: 'Kernaussagen',
      bullets: slideChunks.slice(0, 5),
      speakerNotes: 'Diese Punkte bilden die Grundlage fuer Einstieg, Erarbeitung und Sicherung.'
    },
    {
      title: 'Unterrichtseinsatz',
      bullets: [
        'Vorwissen aktivieren',
        'Quelle abschnittweise lesen oder hoeren',
        'Kernaussagen markieren',
        'Transferfrage im Plenum klaeren'
      ],
      speakerNotes: 'Die Lehrperson kann die Quelle als Einstieg, Sicherung oder Lernkontrolle nutzen.'
    }
  ]

  const flashcards = [
    { front: 'Worum geht es in der Quelle?', back: summary || 'Die Quelle muss im Unterricht gemeinsam erschlossen werden.' },
    ...keyPoints.slice(0, 5).map((point, index) => ({
      front: `Kernaussage ${index + 1}`,
      back: point
    }))
  ]

  const quiz = keyPoints.slice(0, 4).map((point, index) => ({
    question: `Welche Aussage passt zur Quelle? (${index + 1})`,
    options: [
      point,
      'Eine Aussage, die nicht direkt aus der Quelle hervorgeht.',
      'Eine rein persoenliche Meinung ohne Quellenbezug.',
      'Eine Aussage ohne Bezug zum Thema.'
    ],
    answer: point,
    explanation: 'Diese Antwort stammt direkt aus dem eingefuegten Quellenmaterial.'
  }))

  return {
    title: inferredTitle.slice(0, 120),
    subject: String(subject || '').slice(0, 80),
    grade: String(grade || '').slice(0, 40),
    summary,
    keyPoints,
    learningGoals,
    teachingNotes: 'Dieses Paket wurde als lokaler Ersatz erstellt, weil der KI-Dienst im Moment keine verwertbare Antwort geliefert hat. Inhalte bitte kurz prüfen und bei Bedarf erneut generieren.',
    slides,
    flashcards,
    quiz,
    audioScript: [
      `Dieses Audio-Overview fasst das Studio-Material "${inferredTitle}" zusammen.`,
      summary,
      keyPoints.length ? `Die wichtigsten Punkte sind: ${keyPoints.join(' ')}` : '',
      'Im Unterricht koennen diese Inhalte als Einstieg, Sicherung oder kurze Wiederholung genutzt werden.'
    ].filter(Boolean).join('\n\n'),
    sourceNotes: 'Lokaler Ersatzmodus auf Basis des eingefügten Quellentextes.'
  }
}

function normalizeArtifact(raw, fallback) {
  const slides = asArray(raw.slides).map((slide, index) => ({
    title: String(slide?.title || `Folie ${index + 1}`).slice(0, 120),
    bullets: asArray(slide?.bullets).map(item => String(item).slice(0, 180)).slice(0, 6),
    speakerNotes: String(slide?.speakerNotes || '').slice(0, 1400),
    visualPrompt: String(slide?.visualPrompt || '').slice(0, 500),
  })).slice(0, 12)

  const flashcards = asArray(raw.flashcards).map(card => ({
    front: String(card?.front || '').slice(0, 200),
    back: String(card?.back || '').slice(0, 500)
  })).filter(card => card.front && card.back).slice(0, 24)

  const quiz = asArray(raw.quiz).map(item => ({
    question: String(item?.question || '').slice(0, 300),
    options: asArray(item?.options).map(option => String(option).slice(0, 160)).slice(0, 5),
    answer: String(item?.answer || '').slice(0, 220),
    explanation: String(item?.explanation || '').slice(0, 500)
  })).filter(item => item.question && item.answer).slice(0, 12)

  return {
    title: String(raw.title || fallback.title || 'Studio-Material').slice(0, 120),
    subject: String(fallback.subject || raw.subject || '').slice(0, 80),
    grade: String(fallback.grade || raw.grade || '').slice(0, 40),
    summary: String(raw.summary || '').slice(0, 3000),
    keyPoints: asArray(raw.keyPoints).map(item => String(item).slice(0, 220)).slice(0, 12),
    learningGoals: asArray(raw.learningGoals).map(item => String(item).slice(0, 220)).slice(0, 10),
    teachingNotes: String(raw.teachingNotes || '').slice(0, 2500),
    slides,
    flashcards,
    quiz,
    audioScript: String(raw.audioScript || raw.summary || '').slice(0, 5000),
    sourceNotes: String(raw.sourceNotes || '').slice(0, 1600)
  }
}

function buildStudioPrompt({ sourceText, title, grade, subject, mode }) {
  return `Erstelle aus dem Quellenmaterial ein hochwertiges, sofort einsetzbares Studio-Paket fuer EduFlow.

Zielgruppe: Schweizer Lehrperson.
Titel: ${title || 'aus Quellen ableiten'}
Fach: ${subject || 'nicht angegeben'}
Klasse/Stufe: ${grade || 'nicht angegeben'}
Modus: ${mode || 'vollstaendig'}

Antworte ausschliesslich als valides JSON-Objekt ohne Markdown.

JSON-Schema:
{
  "title": "kurzer Titel",
  "summary": "kompakte Zusammenfassung in maximal 2 Absaetzen",
  "keyPoints": ["maximal 5 wichtige Punkte"],
  "learningGoals": ["maximal 4 konkrete Lernziele"],
  "teachingNotes": "konkreter Unterrichtsablauf mit Einstieg, Erarbeitung, Sicherung, Differenzierung und Stolperstellen",
  "slides": [
    {
      "title": "Folientitel",
      "bullets": ["maximal 4 kurze Stichpunkte"],
      "speakerNotes": "natuerlicher Sprechtext fuer diese Folie",
      "visualPrompt": "kurze konkrete Idee fuer eine passende Illustration ohne Text"
    }
  ],
  "flashcards": [{ "front": "maximal 5 Frage/Begriff-Karten", "back": "Antwort/Erklaerung" }],
  "quiz": [
    {
      "question": "Frage",
      "options": ["A", "B", "C", "D"],
      "answer": "richtige Antwort",
      "explanation": "kurze Begruendung"
    }
  ],
  "audioScript": "kurzer Audio-Overview als fliessender Sprechtext mit maximal 220 Woertern",
  "sourceNotes": "kurze Notiz, welche Quelleninhalte besonders relevant sind"
}

Qualitaetsregeln:
- Arbeite ausschliesslich mit belegbaren Aussagen aus der Quelle und markiere Unsicherheiten in sourceNotes.
- Formuliere altersgerecht, fachlich praezise und in Schweizer Rechtschreibung.
- Baue die Folien als Lernprogression: Aktivierung, Verstehen, Anwenden, Sichern.
- Jede Folie hat genau eine klare Kernaussage und maximal vier kurze Stichpunkte.
- Quiz-Distraktoren muessen plausibel, aber eindeutig falsch sein; answer muss exakt einer Option entsprechen.
- Lernziele sind beobachtbar und ueberpruefbar.

Erzeuge 5 bis 8 slides, 6 bis 10 flashcards und 4 bis 6 quiz-Fragen.

Quellenmaterial:
${sourceText}`
}

export async function OPTIONS() {
  return jsonResponse({}, { status: 200 })
}

export async function POST(request) {
  const context = requestContext(request, '/api/studio/generate')
  const user = verifyToken(request)
  if (!user?.userId || user.role === 'student') {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  let requestData = {}

  try {
    const body = await request.json()
    const { sourceText, title, grade, subject, mode, model } = body || {}
    requestData = { sourceText, title, grade, subject }

    if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length < 20) {
      return jsonResponse({ error: 'Bitte Quellenmaterial mit mindestens 20 Zeichen einfügen.' }, { status: 400 })
    }

    const prompt = buildStudioPrompt({
      sourceText: sourceText.trim().slice(0, 12000),
      title,
      grade,
      subject,
      mode
    })

    const result = await generateOpenAIJson({
      userId: user.userId,
      feature: 'studio',
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'Du bist ein erfahrener Schweizer Instructional Designer. Antworte nur als valides JSON.' },
        { role: 'user', content: prompt },
      ],
      metadata: { title, grade, subject, mode: mode || 'full' },
    })

    let artifact = normalizeArtifact(result.object, { title, grade, subject })
    let quality = evaluateStudioArtifact(artifact)
    if (!quality.passed) {
      const repaired = await generateOpenAIJson({
        userId: user.userId,
        feature: 'studio-repair',
        model: result.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Du bist ein strenger Schweizer Instructional Designer. Antworte nur als valides JSON.' },
          { role: 'user', content: prompt },
          { role: 'assistant', content: JSON.stringify(artifact) },
          { role: 'user', content: `Überarbeite das gesamte Paket und behebe diese Qualitätsprobleme: ${[...quality.errors, ...quality.warnings].join(' ')} Gib nur das vollständige JSON zurück.` },
        ],
        metadata: { parentGenerationId: result.generationId, qualityRepair: true },
      })
      artifact = normalizeArtifact(repaired.object, { title, grade, subject })
      quality = evaluateStudioArtifact(artifact)
    }
    if (!quality.passed) throw new Error(`Studio-Qualitätskontrolle fehlgeschlagen: ${quality.errors.join(' ')}`)
    logComplete(context, { feature: 'studio', model: result.model, generationId: result.generationId })

    return jsonResponse({
      provider: result.provider,
      model: result.model,
      generationId: result.generationId,
      quality,
      artifact
    })
  } catch (error) {
    logFailure(context, error, { feature: 'studio' })

    if (requestData.sourceText && isRecoverableStudioError(error)) {
      const fallbackReason = getFallbackReason(error)
      return jsonResponse({
        provider: 'local-fallback',
        model: 'studio-source-fallback',
        warning: `Die KI konnte gerade kein Studio-Paket liefern. EduFlow hat deshalb ein lokales Ersatzpaket aus deinem Quellentext erstellt.`,
        fallbackReason,
        fallbackDetails: process.env.NODE_ENV === 'development' ? String(error?.message || '').slice(0, 500) : undefined,
        artifact: createFallbackArtifact(requestData)
      })
    }

    return jsonResponse({
      error: 'Studio-Generierung fehlgeschlagen. Bitte versuche es erneut.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 500 })
  }
}
