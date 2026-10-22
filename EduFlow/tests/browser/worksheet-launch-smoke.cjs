// Uses only a disposable local replica set, synthetic accounts and fixture content.
// PLAYWRIGHT_MODULE may point to an existing installation of Playwright.
// PDF_REVIEW_PYTHON selects a Python runtime with pypdf for real export checks.
const assert = require('node:assert/strict')
const { execFileSync, spawn } = require('node:child_process')
const { mkdir, rm } = require('node:fs/promises')
const path = require('node:path')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const { MongoClient } = require('mongodb')
const bcrypt = require('bcryptjs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fixture = require('../fixtures/worksheet-launch.cjs')

async function run() {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  const client = await MongoClient.connect(repl.getUri())
  const dbName = `eduflow_learning_v2_test_launch_${Date.now()}`
  const db = client.db(dbName)
  const port = Number(process.env.EDUFLOW_BROWSER_TEST_PORT || 3102)
  const baseUrl = `http://127.0.0.1:${port}`
  const artifacts = path.resolve('.tmp/launch-smoke')
  let server, browser
  let output = ''
  try {
    await mkdir(artifacts, { recursive: true })
    await rm(path.join(artifacts, 'failure.png'), { force: true })
    await db.collection('users').insertOne({
      id: 'qa-teacher', email: 'qa@example.invalid', name: 'QA Lehrperson',
      password_hash: await bcrypt.hash('Synthetic-password-42', 4),
      teacher_type: 'primar', subscription_tier: 'free', worksheets_used_this_month: 1,
      month_reset_date: new Date(), created_at: new Date(),
    })
    await db.collection('worksheets').insertOne({ ...fixture, user_id: 'qa-teacher', content: { ...fixture.content, answer_key: 'SECRET_TEACHER_KEY' } })
    await db.collection('students').insertOne({ id: 'qa-student', username: 'qa-student', display_name: 'Synthetic Student',
      password_hash: await bcrypt.hash('Synthetic-password-42', 4), created_at: new Date(), total_quizzes: 0 })

    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: process.cwd(), env: {
        ...process.env, NODE_ENV: 'development', MONGO_URL: repl.getUri(), DB_NAME: dbName,
        JWT_SECRET: 'synthetic-launch-test-secret-with-at-least-32-characters',
        EDUFLOW_HOSTING_PROFILE: 'local-synthetic', EDUFLOW_SYNTHETIC_DATA: 'true',
        EDUFLOW_APP_ENV: 'development', EDUFLOW_HOSTING_BINDING: '', EDUFLOW_STAGING_EPOCH: '',
        VERCEL: '', VERCEL_ENV: '', VERCEL_TARGET_ENV: '', VERCEL_PROJECT_ID: '',
        CORS_ORIGINS: baseUrl, NEXT_PUBLIC_BASE_URL: baseUrl,
        OPENAI_API_KEY: '', GOOGLE_API_KEY: '', GEMINI_API_KEY: '',
        EDUFLOW_ANALYTICS_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1',
        EDUFLOW_RELEASE_NEXT_DIST_DIR: '.eduflow-release-next/next-111111111111111111111111',
      }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-30_000) })
    const deadline = Date.now() + 90_000
    while (true) {
      try { if ((await fetch(baseUrl)).ok) break } catch {}
      if (Date.now() > deadline || server.exitCode != null) throw new Error(`Test server did not start. ${output}`)
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true })
    assert.equal((await context.request.get(`${baseUrl}/api/worksheets`)).status(), 401)
    for (const pathname of ['/impressum', '/datenschutz', '/agb', '/datenschutz-schulen']) {
      const response = await context.request.get(`${baseUrl}${pathname}`)
      assert.equal(response.status(), 200)
      assert.match(await response.text(), /Entwurf/)
    }
    const robots = await context.request.get(`${baseUrl}/robots.txt`)
    assert.match(await robots.text(), /Disallow: \/$/m)
    assert.equal((await context.request.get(`${baseUrl}/sitemap.xml`)).status(), 200)
    console.log('PASS public legal drafts and prelaunch indexing protection')

    await db.collection('users').insertOne({
      id: 'qa-onboarding', email: 'onboarding@example.invalid', name: 'QA Einstieg',
      password_hash: await bcrypt.hash('Synthetic-password-42', 4), teacher_type: 'primar',
      subscription_tier: 'free', worksheets_used_this_month: 0, month_reset_date: new Date(), created_at: new Date(),
    })
    const onboardingContext = await browser.newContext()
    const onboardingLogin = await onboardingContext.request.post(`${baseUrl}/api/auth/login`, {
      data: { email: 'onboarding@example.invalid', password: 'Synthetic-password-42' }, headers: { Origin: baseUrl },
    })
    assert.equal(onboardingLogin.status(), 200, await onboardingLogin.text())
    const onboardingPage = await onboardingContext.newPage()
    await onboardingPage.route('https://**', route => route.abort())
    await onboardingPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await onboardingPage.getByRole('button', { name: 'Weiter', exact: true }).click()
    await onboardingPage.getByRole('button', { name: 'Weiter', exact: true }).click()
    await onboardingPage.getByLabel('Thema oder Lernziel', { exact: true }).fill('Wasserkreislauf')
    await onboardingPage.getByLabel('Fach', { exact: true }).click()
    await onboardingPage.getByRole('option', { name: 'NMG', exact: true }).click()
    await onboardingPage.getByRole('combobox').filter({ hasText: '3. Klasse' }).click()
    await onboardingPage.getByRole('option', { name: '7. Klasse', exact: true }).click()
    await onboardingPage.getByLabel('Fach', { exact: true }).filter({ hasText: 'Natur und Technik' }).waitFor()
    await onboardingPage.getByRole('button', { name: 'Workspace öffnen', exact: true }).click()
    await onboardingPage.getByPlaceholder('z.B. Photosynthese, Bruchrechnen, Schweizer Geschichte...').waitFor()
    assert.ok((await onboardingPage.getByRole('combobox').allTextContents()).some(value => value === 'Natur und Technik'))
    await onboardingContext.close()
    console.log('PASS first-success onboarding uses valid grade-dependent subjects and preserves context in the generator')

    const login = await context.request.post(`${baseUrl}/api/auth/login`, { data: { email: 'qa@example.invalid', password: 'Synthetic-password-42' }, headers: { Origin: baseUrl } })
    assert.equal(login.status(), 200, await login.text())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://**', route => route.abort())
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Letztes Material öffnen/ }).click()
    await page.getByText('1. Ordne die Schritte des Wasserkreislaufs.', { exact: false }).waitFor()
    for (const [label, name] of [
      ['PDF Schülerversion', 'student.pdf'], ['PDF Lehrerversion (mit Lösungen)', 'teacher.pdf'],
      ['Word Schülerversion', 'student.docx'], ['Word Lehrerversion (mit Lösungen)', 'teacher.docx'],
    ]) {
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: label, exact: true }).click()
      await (await downloading).saveAs(path.join(artifacts, name))
      console.log(`PASS export ${name}`)
    }
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).first().click()
    await page.getByPlaceholder('Fragetext eingeben...').first().fill('Ordne die Schritte des Wasserkreislaufs korrekt.')
    await page.getByRole('button', { name: 'Speichern & Vorschau', exact: true }).first().click()
    await page.getByText('1. Ordne die Schritte des Wasserkreislaufs korrekt.', { exact: false }).waitFor()
    const saved = await db.collection('worksheets').findOne({ id: fixture.id })
    assert.equal(saved.content.questions[0].question, 'Ordne die Schritte des Wasserkreislaufs korrekt.')
    assert.equal(saved.content.questions[0].answer, 'Verdunstung, Kondensation, Niederschlag')
    assert.equal(saved.content.questions[1].answer, 'Falsch')
    assert.equal(saved.content.questions[4].answer, '0')
    console.log('PASS real API and MongoDB save round trip for all eleven types')
    await db.collection('assignments').insertOne({ id: 'qa-assignment', teacher_id: 'qa-teacher', worksheet_id: fixture.id,
      code: 'QA1234', status: 'active', activity_type: 'diagnostic', show_solutions: false })
    const guest = await browser.newContext()
    const studentLogin = await guest.request.post(`${baseUrl}/api/student/login`, { data: { username: 'qa-student', password: 'Synthetic-password-42' }, headers: { Origin: baseUrl } })
    assert.equal(studentLogin.status(), 200, await studentLogin.text())
    assert.notEqual((await guest.request.get(`${baseUrl}/api/worksheets/${fixture.id}`)).status(), 200)

    const delivery = await guest.request.get(`${baseUrl}/api/student/assignment/QA1234`)
    assert.equal(delivery.status(), 200, await delivery.text())
    const delivered = await delivery.json()
    assert.equal('teacher_notes' in delivered.content, false)
    assert.equal(JSON.stringify(delivered).includes('SECRET_TEACHER_KEY'), false)
    assert.ok(delivered.content.questions.every(question => !('answer' in question) && !('explanation' in question)))
    assert.deepEqual(delivered.content.questions[1].options, ['Wahr', 'Falsch'])
    const right = delivered.content.questions[5].matching_right
    const submittedAnswers = [['Verdunstung', 'Kondensation', 'Niederschlag'], 'Falsch', 'Wolken', 'Eigene Erklärung', 0,
      { matches: { 0: right.indexOf('Energie'), 1: right.indexOf('Niederschlag') } }, ['Wasser', 'Wolken'], 'Ja', 'Eine Wolke.', 'Wasser ist flüssig.', null]
    const submission = await guest.request.post(`${baseUrl}/api/student/submit`, { data: {
      assignmentCode: 'QA1234', studentName: 'Synthetic Guest', duration: 30,
      answers: submittedAnswers,
    }, headers: { Origin: baseUrl } })
    assert.equal(submission.status(), 201, await submission.text())
    const feedback = await submission.json()
    assert.ok(feedback.questionResults.every(result => !('correctAnswer' in result)))
    for (const index of [0, 1, 2, 4, 5, 6, 7]) assert.equal(feedback.questionResults[index].isCorrect, true, `Question ${index + 1}`)
    assert.equal(feedback.needsReview, true)
    console.log('PASS student login, ownership boundary, solution-free delivery, structured grading and manual review')
    assert.equal((await db.collection('students').findOne({ id: 'qa-student' })).total_quizzes, 1)
    const history = await guest.request.get(`${baseUrl}/api/student/my-results`)
    assert.equal(history.status(), 200, await history.text())
    const hiddenHistory = (await history.json()).submissions.find(item => item.id === feedback.submissionId)
    assert.deepEqual(hiddenHistory.question_results, feedback.questionResults)
    assert.ok(hiddenHistory.question_results.every(result => !('correctAnswer' in result) && !('contentHash' in result)))
    const teacherResults = await context.request.get(`${baseUrl}/api/assignments/qa-assignment/submissions`)
    assert.equal(teacherResults.status(), 200, await teacherResults.text())
    assert.equal((await teacherResults.json()).submissions[0].question_results[0].correctAnswer, saved.content.questions[0].answer)
    assert.equal((await guest.request.get(`${baseUrl}/api/assignments/qa-assignment/submissions`)).status(), 401)

    const shared = await context.request.post(`${baseUrl}/api/assignments/share`, { data: {
      worksheetId: fixture.id, activityType: 'assessment', feedbackMode: 'teacher_release', showSolutions: true,
    }, headers: { Origin: baseUrl } })
    assert.equal(shared.status(), 201, await shared.text())
    const releasedAssignment = await shared.json()
    const heldSubmission = await guest.request.post(`${baseUrl}/api/student/submit`, { data: {
      assignmentCode: releasedAssignment.code, studentName: 'Synthetic Guest', duration: 30, answers: submittedAnswers,
    }, headers: { Origin: baseUrl } })
    assert.equal(heldSubmission.status(), 201, await heldSubmission.text())
    const heldFeedback = await heldSubmission.json()
    assert.equal(heldFeedback.feedbackPending, true)
    assert.deepEqual(heldFeedback.questionResults, [])
    const pendingHistory = (await (await guest.request.get(`${baseUrl}/api/student/my-results`)).json()).submissions.find(item => item.id === heldFeedback.submissionId)
    assert.equal(pendingHistory.feedback_pending, true)
    assert.equal(pendingHistory.correct_count, null)
    assert.deepEqual(pendingHistory.question_results, [])
    const released = await context.request.put(`${baseUrl}/api/assignments/${releasedAssignment.assignmentId}`, {
      data: { feedbackReleased: true }, headers: { Origin: baseUrl },
    })
    assert.equal(released.status(), 200, await released.text())
    const visibleHistory = (await (await guest.request.get(`${baseUrl}/api/student/my-results`)).json()).submissions.find(item => item.id === heldFeedback.submissionId)
    assert.equal(visibleHistory.feedback_pending, false)
    assert.equal(visibleHistory.question_results[0].correctAnswer, saved.content.questions[0].answer)
    console.log('PASS history obeys hidden solutions and teacher release; authorized teacher retains solutions')
    await guest.close()

    assert.equal(feedback.totalQuestions, 10)
    assert.equal(feedback.questionResults[10].maxPoints, 0)
    const denied = await context.request.post(`${baseUrl}/api/generate-worksheet`, { data: {}, headers: { Origin: baseUrl } })
    assert.equal(denied.status(), 403)
    assert.equal((await db.collection('users').findOne({ id: 'qa-teacher' })).worksheets_used_this_month, 1)
    console.log('PASS existing provider denial remains intact and consumes no quota')
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(`PASS mobile layout; artifacts: ${artifacts}`)
    await db.collection('ai_generations').insertOne({ id: 'unknown-cost', user_id: 'qa-teacher', feature: 'worksheet',
      model: 'synthetic-unpriced', status: 'complete', cost_estimate_status: 'unknown', estimated_cost_usd: null, created_at: new Date() })
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    await page.getByText('Unbekannt', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS cost dashboard distinguishes unknown costs from zero')

    const twoItemWorksheet = {
      ...fixture, id: 'qa-export-two', user_id: 'qa-teacher', title: 'Zweier-Aufgaben Export Regression',
      created_at: new Date(), updated_at: new Date(),
      content: { title: 'Zweier-Aufgaben Export Regression', questions: [
        { number: 1, type: 'ordering', question: 'Bringe diese zwei Schritte in die richtige Reihenfolge.', answer: ['StartAlpha', 'EndOmega'], points: 1 },
        { number: 2, type: 'matching', question: 'Ordne diese zwei Begriffe den passenden Bedeutungen zu.', answer: [['LinkAlpha', 'TargetAlpha'], ['LinkOmega', 'TargetOmega']], points: 1 },
      ] },
    }
    await db.collection('worksheets').insertOne(twoItemWorksheet)
    const exportContext = await browser.newContext({ acceptDownloads: true })
    const exportLogin = await exportContext.request.post(`${baseUrl}/api/auth/login`, {
      data: { email: 'qa@example.invalid', password: 'Synthetic-password-42' }, headers: { Origin: baseUrl },
    })
    assert.equal(exportLogin.status(), 200, await exportLogin.text())
    const exportPage = await exportContext.newPage()
    await exportPage.route('https://**', route => route.abort())
    await exportPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await exportPage.getByRole('button', { name: /Letztes Material öffnen/ }).click()
    await exportPage.getByText('1. Bringe diese zwei Schritte in die richtige Reihenfolge.', { exact: false }).waitFor()
    for (const [label, name] of [
      ['PDF Schülerversion', 'two-student.pdf'], ['PDF Lehrerversion (mit Lösungen)', 'two-teacher.pdf'],
      ['Word Schülerversion', 'two-student.docx'], ['Word Lehrerversion (mit Lösungen)', 'two-teacher.docx'],
    ]) {
      const downloading = exportPage.waitForEvent('download')
      await exportPage.getByRole('button', { name: label, exact: true }).click()
      const file = path.join(artifacts, name)
      await (await downloading).saveAs(file)
    }
    execFileSync(process.env.PDF_REVIEW_PYTHON || 'python3', ['-c', `
import sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
from pypdf import PdfReader
artifacts = Path(sys.argv[1])
for name in ['two-student.pdf', 'two-teacher.pdf', 'two-student.docx', 'two-teacher.docx']:
    file = artifacts / name
    if name.endswith('.pdf'):
        text = '\\n'.join(page.extract_text() for page in PdfReader(file).pages)
    else:
        with zipfile.ZipFile(file) as archive:
            document = ET.fromstring(archive.read('word/document.xml'))
        text = '\\n'.join(node.text or '' for node in document.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
    for original in [['StartAlpha', 'EndOmega'], ['TargetAlpha', 'TargetOmega']]:
        assert all(token in text for token in original), f'{name}: exported task content is missing'
        exported = sorted(original, key=text.index)
        if 'student' in name:
            assert exported != original, f'{name}: task already exposes the solution order'
        else:
            assert exported == original, f'{name}: teacher solution order changed'
`, artifacts], { encoding: 'utf8' })
    await exportContext.close()
    console.log('PASS two-item PDF text and DOCX XML keep student tasks shuffled and teacher solutions ordered')

    const curriculumPage = await context.newPage()
    await curriculumPage.route('https://**', route => route.abort())
    const curriculumErrors = []
    curriculumPage.on('pageerror', error => curriculumErrors.push(error.message))
    await curriculumPage.goto(baseUrl, { waitUntil: 'networkidle' })
    const curriculumNavigation = async () => {
      await curriculumPage.getByRole('button', { name: 'Planung', exact: true }).hover()
      await curriculumPage.getByRole('menuitem', { name: 'Lehrplan 21', exact: true }).click()
    }
    const curriculumSearch = () => curriculumPage.getByPlaceholder(/Kompetenzen durchsuchen/)
    await curriculumNavigation()
    await curriculumPage.getByText('Quellengeprüfte Kompetenzstufen', { exact: true }).waitFor()
    await curriculumSearch().fill('NT.2.1.2a')
    assert.equal(await curriculumPage.getByText('Zustandsänderungen modellieren', { exact: true }).count(), 1)
    assert.equal(await curriculumPage.getByRole('link', { name: 'Offizielle Quelle', exact: true }).getAttribute('href'),
      'https://v-fe.lehrplan.ch/index.php?code=a%7C6%7C2%7C2%7C0%7C1')
    await curriculumPage.getByRole('button', { name: 'Material erstellen', exact: true }).click()
    await curriculumPage.getByPlaceholder('z.B. Photosynthese, Bruchrechnen, Schweizer Geschichte...').waitFor()
    let selections = await curriculumPage.getByRole('combobox').allTextContents()
    assert.ok(selections.some(text => text.includes('7. Klasse')))
    assert.ok(selections.some(text => text.includes('Natur und Technik')))
    assert.ok(selections.some(text => text.includes('NT.2.1.2a')))
    await curriculumPage.getByRole('combobox').filter({ hasText: '7. Klasse' }).click()
    await curriculumPage.getByRole('option', { name: '5. Klasse', exact: true }).click()
    await curriculumPage.getByRole('combobox').filter({ hasText: 'Keine spezifische Kompetenz' }).waitFor()
    selections = await curriculumPage.getByRole('combobox').allTextContents()
    assert.ok(selections.some(text => text === 'NMG'))
    assert.ok(selections.every(text => !text.includes('NT.2.1.2a')))

    await curriculumNavigation()
    await curriculumPage.getByRole('button', { name: 'Ungeprüfte Entwürfe anzeigen', exact: true }).click()
    await curriculumPage.getByText('Ungeprüfte Planungsentwürfe', { exact: true }).waitFor()
    await curriculumSearch().fill('NMG.4.2')
    await curriculumPage.getByRole('button', { name: 'Material erstellen', exact: true }).first().click()
    await curriculumPage.getByRole('combobox').filter({ hasText: 'Keine spezifische Kompetenz' }).waitFor()
    assert.ok((await curriculumPage.getByRole('combobox').allTextContents()).every(text => !text.includes('NMG.4.2')))
    await curriculumPage.setViewportSize({ width: 390, height: 844 })
    const notice = await curriculumPage.getByRole('alert').filter({ hasText: /Planungsentwurf/ }).boundingBox()
    assert.ok(notice && notice.x >= 0 && notice.x + notice.width <= 390, 'mobile success message must remain readable inside the viewport')
    await curriculumPage.setViewportSize({ width: 1440, height: 1050 })
    await curriculumNavigation()
    await curriculumSearch().fill('RZG.1.1')
    await curriculumPage.getByRole('button', { name: 'Material erstellen', exact: true }).first().click()
    await curriculumPage.getByRole('combobox').filter({ hasText: /^RZG$/ }).waitFor()
    await curriculumPage.getByRole('combobox').filter({ hasText: '7. Klasse' }).click()
    await curriculumPage.getByRole('option', { name: '8. Klasse', exact: true }).click()
    await curriculumPage.getByRole('combobox').filter({ hasText: /^RZG$/ }).waitFor()
    await curriculumPage.getByText(/Für dieses Fach und diesen Zyklus ist noch keine quellengeprüfte Kompetenzstufe hinterlegt/).waitFor()
    await curriculumNavigation()
    await curriculumSearch().fill('TTG.1.A.3')
    await curriculumPage.getByRole('button', { name: 'Material erstellen', exact: true }).first().click()
    await curriculumPage.getByRole('combobox').filter({ hasText: /^TTG$/ }).waitFor()
    await curriculumPage.getByText(/Für dieses Fach und diesen Zyklus ist noch keine quellengeprüfte Kompetenzstufe hinterlegt/).waitFor()
    await curriculumNavigation()
    await curriculumPage.getByRole('button', { name: 'Quellengeprüfte Auswahl anzeigen', exact: true }).click()
    await curriculumPage.getByRole('combobox').filter({ hasText: 'Alle Zyklen' }).click()
    await curriculumPage.getByRole('option', { name: 'Zyklus 3', exact: true }).click()
    await curriculumPage.getByRole('combobox').filter({ hasText: 'Alle Fächer' }).click()
    await curriculumPage.getByRole('option', { name: 'Mathematik', exact: true }).click()
    assert.equal(await curriculumPage.getByRole('button', { name: /^Zyklus [12]/ }).count(), 0)
    await curriculumPage.getByRole('button', { name: /^Zyklus 3/ }).click()
    await curriculumPage.getByRole('button', { name: /Mathematik/ }).click()
    await curriculumPage.getByRole('link', { name: 'Offizielle Quelle', exact: true }).first().waitFor()
    assert.equal(await curriculumPage.getByRole('link', { name: 'Offizielle Quelle', exact: true }).count(), 2)
    await curriculumPage.setViewportSize({ width: 390, height: 844 })
    await curriculumPage.waitForFunction(() => {
      const links = [...document.querySelectorAll('a')].filter(link => link.textContent === 'Offizielle Quelle')
      return links.length === 2 && links.every(link => {
        const box = link.getBoundingClientRect()
        for (let parent = link.parentElement; parent; parent = parent.parentElement) {
          if (['hidden', 'clip'].includes(getComputedStyle(parent).overflowY) && box.bottom > parent.getBoundingClientRect().bottom + 1) return false
        }
        return true
      })
    })
    assert.equal(await curriculumPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    await curriculumPage.screenshot({ path: path.join(artifacts, 'curriculum-mobile.png'), fullPage: true })
    assert.deepEqual(curriculumErrors, [])
    await curriculumPage.close()
    console.log('PASS source-checked curriculum, cycle/subject filters, matching creation context and unbound historical drafts')

    if (process.env.RUN_API_AUTHZ_SMOKE === '1') {
      const authorization = spawn(process.execPath, ['--test', 'tests/api-authz.integration.test.mjs'], {
        cwd: process.cwd(), env: { ...process.env, RUN_INTEGRATION_TESTS: '1', TEST_BASE_URL: baseUrl,
          MONGO_URL: repl.getUri(), DB_NAME: dbName, JWT_SECRET: 'synthetic-launch-test-secret-with-at-least-32-characters' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let authorizationOutput = ''
      for (const stream of [authorization.stdout, authorization.stderr]) stream.on('data', chunk => { authorizationOutput += chunk })
      const code = await new Promise(resolve => authorization.once('exit', resolve))
      assert.equal(code, 0, authorizationOutput)
      console.log('PASS full existing API authorization integration suite')
    }

  } catch (error) {
    const lastPage = browser?.contexts().flatMap(context => context.pages()).at(-1)
    if (lastPage) await lastPage.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally {
    if (browser) await browser.close()
    if (server) {
      if (server.exitCode == null) {
        const exited = new Promise(resolve => server.once('exit', resolve))
        server.kill('SIGTERM')
        await exited
      }
    }
    await client.close()
    await repl.stop()
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
