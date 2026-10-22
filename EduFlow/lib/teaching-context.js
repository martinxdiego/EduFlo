import { VERIFIED_CURRICULUM } from '../data/verified-curriculum.js'
import { canonicalSubject } from './subjects.js'

export function cycleForGrade(grade) {
  const value = Number(grade)
  if (!Number.isInteger(value) || value < 1 || value > 9) return null
  return value >= 7 ? 'z3' : value >= 3 ? 'z2' : 'z1'
}

export function suggestSubject(topic, grade) {
  const text = String(topic || '').toLocaleLowerCase('de-CH')
  const suggestions = new Set()
  if (/wasserkreislauf|verdunstung|kondensation|photosynthese|wetter|ökosystem/.test(text)) suggestions.add(Number(grade) >= 7 ? 'Natur und Technik' : 'NMG')
  if (/bruchrechnen|brüche|bruchzahlen|multiplikation|division|geometrie|gleichungen/.test(text)) suggestions.add('Mathematik')
  if (/rechtschreibung|satzglieder|leseverständnis|wortarten|diktat/.test(text)) suggestions.add('Deutsch')
  return suggestions.size === 1 ? [...suggestions][0] : null
}

export function verifiedCompetencies(grade, subject) {
  return VERIFIED_CURRICULUM.filter(item => item.cycle === cycleForGrade(grade) && item.subject === subject)
}

export function verifiedCompetency(code, grade, subject) {
  return verifiedCompetencies(grade, subject).find(item => item.code === code) || null
}

export function changeTeachingContext(form, updates) {
  // A select can emit an empty value when its former option is removed during
  // a cycle change. Preserve the valid context chosen by that same transition.
  const selected = { ...updates }
  if (selected.subject === '') delete selected.subject
  if (selected.grade === '') delete selected.grade
  const next = { ...form, ...selected }
  next.subject = canonicalSubject(next.subject)
  if (Number(next.grade) >= 7 && next.subject === 'NMG') next.subject = 'Natur und Technik'
  if (Number(next.grade) < 7 && ['Natur und Technik', 'RZG', 'Ethik, Religionen, Gemeinschaft', 'Wirtschaft, Arbeit, Haushalt'].includes(next.subject)) next.subject = 'NMG'
  if (next.subject !== form.subject || cycleForGrade(next.grade) !== cycleForGrade(form.grade)) next.competencyCode = ''
  return next
}

export function formForCompetency(form, competency) {
  const defaultGrade = { z1: '1', z2: '3', z3: '7' }[competency.cycle]
  const grade = cycleForGrade(form.grade) === competency.cycle ? form.grade : defaultGrade || form.grade
  const next = changeTeachingContext(form, { grade, subject: competency.subject })
  const checked = competency.sourceVerified === true && verifiedCompetency(competency.code, next.grade, next.subject)
  return {
    ...next,
    topic: `${competency.name}: ${competency.description}`,
    competencyCode: checked ? checked.code : '',
  }
}
