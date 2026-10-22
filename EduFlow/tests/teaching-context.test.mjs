import assert from 'node:assert/strict'
import test from 'node:test'
import { changeTeachingContext, cycleForGrade, formForCompetency, suggestSubject, verifiedCompetencies, verifiedCompetency } from '../lib/teaching-context.js'
import { curriculumCycles } from '../lib/curriculum-browser.js'
import { getSubjectsForGrade } from '../lib/subjects.js'

test('suggests subjects conservatively and respects the school level', () => {
  assert.equal(suggestSubject('Wasserkreislauf', 5), 'NMG')
  assert.equal(suggestSubject('Wasserkreislauf', 7), 'Natur und Technik')
  assert.equal(suggestSubject('Bruchrechnen', 5), 'Mathematik')
  assert.equal(suggestSubject('Bruchrechnen und Wasserkreislauf', 5), null)
  assert.equal(suggestSubject('Mein neues Thema', 5), null)
})

test('subject and cycle changes clear stale competencies without clearing topic', () => {
  const form = { topic: 'Wasser', subject: 'Deutsch', grade: '5', competencyCode: 'D.1.A.1' }
  assert.deepEqual(changeTeachingContext(form, { subject: 'NMG' }), { ...form, subject: 'NMG', competencyCode: '' })
  assert.equal(changeTeachingContext({ ...form, subject: 'NMG' }, { grade: '7' }).subject, 'Natur und Technik')
  assert.equal(changeTeachingContext(form, { grade: '6' }).competencyCode, form.competencyCode)
  assert.equal(changeTeachingContext(form, { subject: '' }).subject, form.subject)
  assert.equal(changeTeachingContext(form, { grade: '' }).grade, form.grade)
  const primary = changeTeachingContext({ ...form, grade: '7', subject: 'Natur und Technik' }, { grade: '5' })
  assert.equal(changeTeachingContext(primary, { subject: '' }).subject, 'NMG')
  assert.equal(cycleForGrade('invalid'), null)
  const checked = verifiedCompetency('NT.2.1.2a', 7, 'Natur und Technik')
  const selected = formForCompetency(form, checked)
  assert.equal(selected.grade, '7')
  assert.equal(selected.subject, 'Natur und Technik')
  assert.equal(selected.competencyCode, 'NT.2.1.2a')
  assert.equal(formForCompetency({ ...form, grade: '9' }, checked).grade, '9')
  assert.equal(formForCompetency(form, { ...checked, sourceVerified: false }).competencyCode, '')
  assert.equal(formForCompetency(form, { ...checked, code: 'NT.2.1.fake' }).competencyCode, '')
  const drafts = curriculumCycles({ drafts: true }).flatMap(cycle => cycle.areas.flatMap(area => area.competencies))
  for (const draft of drafts) {
    const selectedDraft = formForCompetency(form, draft)
    assert.ok(getSubjectsForGrade(selectedDraft.grade).includes(selectedDraft.subject), `${draft.code}: subject must be selectable`)
    assert.equal(selectedDraft.competencyCode, '')
  }
  const geography = formForCompetency(form, drafts.find(item => item.code === 'RZG.1.1'))
  assert.equal(geography.subject, 'RZG')
  assert.equal(changeTeachingContext(geography, { grade: '8' }).subject, 'RZG')
  assert.equal(changeTeachingContext(geography, { grade: '5' }).subject, 'NMG')
  assert.equal(formForCompetency(form, drafts.find(item => item.code === 'TTG.1.A.3')).subject, 'TTG')
})

test('source-checked competency stages are filtered by subject and cycle', () => {
  assert.ok(verifiedCompetency('NMG.2.2.f', 5, 'NMG'))
  assert.equal(verifiedCompetency('NMG.2.2.f', 1, 'NMG'), null)
  assert.equal(verifiedCompetency('NMG.2.2.f', 5, 'Deutsch'), null)
  assert.equal(verifiedCompetency('NMG.4.2.a', 5, 'NMG'), null)
  assert.equal(verifiedCompetencies(7, 'NMG').length, 0)
  assert.ok(verifiedCompetencies(5, 'NMG').every(item => item.sourceUrl.startsWith('https://v-fe.lehrplan.ch/')))
  for (const grade of [1, 5, 9]) {
    for (const subject of ['Mathematik', 'Deutsch']) assert.ok(verifiedCompetencies(grade, subject).length > 0)
  }
  const checked = curriculumCycles().flatMap(cycle => cycle.areas.flatMap(area => area.competencies))
  assert.equal(checked.length, 24)
  assert.equal(new Set(checked.map(item => item.code)).size, checked.length)
  assert.ok(checked.every(item => item.sourceVerified && verifiedCompetency(item.code, { z1: 1, z2: 5, z3: 9 }[item.cycle], item.subject)))
  const drafts = curriculumCycles({ drafts: true }).flatMap(cycle => cycle.areas.flatMap(area => area.competencies))
  assert.ok(drafts.length > checked.length)
  assert.ok(drafts.every(item => item.sourceVerified === false && item.level === 'Ungeprüfter Entwurf'))
})
