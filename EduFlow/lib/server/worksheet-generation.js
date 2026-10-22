import { v4 as uuidv4 } from 'uuid'
import { prepareWorksheetContent } from './worksheet-quality.js'
import { reconcileWorksheetQuestionIds, WORKSHEET_QUESTION_IDENTITY_VERSION } from './worksheet-question-identity.js'
import { persistCountedWorksheet } from './worksheet-usage.js'
import { verifiedCompetency } from '../teaching-context.js'

export function worksheetCompetencyContext(code, grade, subject) {
  const reference = verifiedCompetency(code, grade, subject)
  return {
    code: reference?.code || null,
    reference,
    instruction: reference
      ? `\n\nQuellengeprüfte LP21-Stufe ${reference.code}: ${reference.description} Quelle: ${reference.sourceUrl}. Erstelle dazu passende Aufgaben. Behaupte keine offizielle Zertifizierung.`
      : '',
  }
}

export function buildGeneratedWorksheet({
  user,
  content,
  topic,
  grade,
  subject,
  difficulty,
  questionCount,
  resourceType,
  aiProvider,
  competencyCode,
  regeneratedFrom,
}) {
  const competency = worksheetCompetencyContext(competencyCode, grade, subject)
  const prepared = prepareWorksheetContent(content, questionCount || 10, { subject })
  if (!prepared.quality.passed) {
    console.error('Refusing to save low-quality worksheet:', prepared.quality)
    throw new Error('Der KI-Entwurf hat die Qualitätskontrolle nicht bestanden. Bitte erneut versuchen.')
  }
  const checkedContent = reconcileWorksheetQuestionIds(prepared.content)
  const worksheet = {
    id: uuidv4(),
    user_id: user.id,
    title: checkedContent.title,
    topic,
    grade,
    subject,
    difficulty,
    resourceType: resourceType || 'worksheet',
    question_count: questionCount || 10,
    competency_reference: competency.reference,
    competency_code: competency.code,
    ai_provider: aiProvider,
    content: {
      ...checkedContent,
      resourceType: resourceType || 'worksheet',
      quality: {
        score: prepared.quality.score,
        warnings: prepared.quality.warnings,
        checked_at: new Date().toISOString(),
      },
    },
    status: 'review',
    revision: 1,
    question_identity_version: WORKSHEET_QUESTION_IDENTITY_VERSION,
    archived: false,
    favorite: false,
    tags: [],
    folder: '',
    created_at: new Date(),
    updated_at: new Date(),
    ...(regeneratedFrom ? { regenerated_from: regeneratedFrom } : {}),
  }

  return worksheet
}

export async function saveGeneratedWorksheet(params) {
  const worksheet = buildGeneratedWorksheet(params)
  return persistCountedWorksheet(params.db, worksheet, { requestKey: params.requestKey, fingerprint: params.requestFingerprint })
}
