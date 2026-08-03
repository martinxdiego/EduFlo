import { NextResponse } from 'next/server'
import pptxgen from 'pptxgenjs'
import { applyCorsHeaders, verifyAuthToken } from '@/lib/server/security'

export const runtime = 'nodejs'

function jsonResponse(body, init) {
  const response = NextResponse.json(body, init)
  return applyCorsHeaders(response)
}

function verifyToken(request) {
  return verifyAuthToken(request)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim()
}

function filename(value) {
  return text(value, 'eduflow-studio')
    .toLowerCase()
    .replace(/[^a-z0-9äöüéèàç]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eduflow-studio'
}

function addFooter(slide, label) {
  slide.addText(label, {
    x: 0.55, y: 7.05, w: 12.2, h: 0.22,
    fontFace: 'Aptos', fontSize: 7, color: '6B7280',
    margin: 0
  })
}

function addTitleSlide(pptx, artifact) {
  const slide = pptx.addSlide()
  slide.background = { color: 'F8FAFC' }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: '2563EB' }, line: { color: '2563EB' } })
  slide.addText(text(artifact.title, 'Studio-Material'), {
    x: 0.75, y: 1.6, w: 11.9, h: 0.8,
    fontFace: 'Aptos Display', fontSize: 32, bold: true, color: '111827',
    margin: 0
  })
  slide.addText([artifact.subject, artifact.grade].filter(Boolean).join(' · ') || 'EduFlow Studio', {
    x: 0.78, y: 2.55, w: 10.5, h: 0.32,
    fontFace: 'Aptos', fontSize: 13, color: '2563EB',
    margin: 0
  })
  slide.addText(text(artifact.summary, 'Aus Quellen generiertes Unterrichtspaket.').slice(0, 520), {
    x: 0.78, y: 3.25, w: 10.9, h: 1.3,
    fontFace: 'Aptos', fontSize: 16, color: '374151',
    breakLine: false,
    fit: 'shrink',
    margin: 0.04
  })
  addFooter(slide, 'EduFlow Studio · Gemini')
}

function addBulletSlide(pptx, title, bullets, notes) {
  const slide = pptx.addSlide()
  slide.background = { color: 'FFFFFF' }
  slide.addText(text(title, 'Folie'), {
    x: 0.6, y: 0.5, w: 12.05, h: 0.5,
    fontFace: 'Aptos Display', fontSize: 22, bold: true, color: '111827',
    margin: 0
  })

  const lines = asArray(bullets).slice(0, 6).map(item => ({
    text: text(item),
    options: { bullet: { type: 'bullet' }, breakLine: true }
  }))

  slide.addText(lines.length ? lines : [{ text: 'Keine Stichpunkte vorhanden.', options: { breakLine: true } }], {
    x: 0.88, y: 1.35, w: 11.4, h: 4.65,
    fontFace: 'Aptos', fontSize: 17, color: '1F2937',
    breakLine: false,
    fit: 'shrink',
    paraSpaceAfterPt: 10,
    margin: 0.04
  })

  const speakerNotes = text(notes)
  if (speakerNotes) {
    slide.addNotes(speakerNotes)
  }

  addFooter(slide, 'EduFlow Studio')
}

function addSummarySlides(pptx, artifact) {
  if (asArray(artifact.learningGoals).length) {
    addBulletSlide(pptx, 'Lernziele', artifact.learningGoals, artifact.teachingNotes)
  }

  if (asArray(artifact.keyPoints).length) {
    addBulletSlide(pptx, 'Kernaussagen', artifact.keyPoints, artifact.summary)
  }
}

async function buildDeck(artifact) {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'EduFlow'
  pptx.company = 'EduFlow'
  pptx.subject = text(artifact.subject)
  pptx.title = text(artifact.title, 'EduFlow Studio')
  pptx.lang = 'de-CH'
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'de-CH'
  }

  addTitleSlide(pptx, artifact)
  addSummarySlides(pptx, artifact)
  asArray(artifact.slides).slice(0, 12).forEach(slide => {
    addBulletSlide(pptx, slide.title, slide.bullets, slide.speakerNotes)
  })

  return pptx.write({ outputType: 'nodebuffer' })
}

export async function OPTIONS() {
  return jsonResponse({}, { status: 200 })
}

export async function POST(request) {
  const user = verifyToken(request)
  if (!user?.userId || user.role === 'student') {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const artifact = body?.artifact

    if (!artifact || typeof artifact !== 'object') {
      return jsonResponse({ error: 'Studio-Artefakt fehlt.' }, { status: 400 })
    }

    const buffer = await buildDeck(artifact)
    const fileName = `${filename(artifact.title)}.pptx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Studio pptx error:', {
      message: error?.message,
      name: error?.name
    })

    return jsonResponse({
      error: 'PowerPoint-Export fehlgeschlagen.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 500 })
  }
}
