import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'
import { hashPasswordResetToken } from '../lib/server/password-reset.js'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'

if (!enabled) {
  test('API authorization integration tests require RUN_INTEGRATION_TESTS=1', { skip: true }, () => {})
} else {
  test('API enforces cookie sessions, CSRF protection, roles and ownership', async () => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
    const mongoUrl = process.env.MONGO_URL
    const dbName = process.env.DB_NAME
    const jwtSecret = process.env.JWT_SECRET
    assert.ok(mongoUrl && dbName && jwtSecret, 'MongoDB and JWT test configuration are required')

    const runId = `ci-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const ownerId = `${runId}-owner`
    const attackerId = `${runId}-attacker`
    const studentId = `${runId}-student`
    const worksheetId = `${runId}-worksheet`
    const classId = `${runId}-class`
    const assignmentId = `${runId}-assignment`
    const submissionId = `${runId}-submission`
    const ownerEmail = `${runId}@example.test`
    const password = 'Secure-test-password-42'
    const newPassword = 'New-secure-test-password-84'
    const resetToken = `${runId}-password-reset-token-with-enough-entropy`
    const deleteUserId = `${runId}-delete-user`
    const deleteUserEmail = `${runId}-delete@example.test`
    const deleteWorksheetId = `${runId}-delete-worksheet`
    const client = new MongoClient(mongoUrl)

    await client.connect()
    const db = client.db(dbName)

    try {
      await db.collection('users').insertMany([
        {
          id: ownerId,
          email: ownerEmail,
          name: 'CI Owner',
          password_hash: await bcrypt.hash(password, 4),
          subscription_tier: 'free',
          worksheets_used_this_month: 0,
          month_reset_date: new Date(),
          created_at: new Date(),
        },
        {
          id: attackerId,
          email: `${runId}-attacker@example.test`,
          name: 'CI Attacker',
          subscription_tier: 'free',
          worksheets_used_this_month: 0,
          month_reset_date: new Date(),
          created_at: new Date(),
        },
        {
          id: deleteUserId,
          email: deleteUserEmail,
          name: 'CI Delete User',
          password_hash: await bcrypt.hash(password, 4),
          subscription_tier: 'free',
          worksheets_used_this_month: 0,
          month_reset_date: new Date(),
          created_at: new Date(),
        },
      ])
      await db.collection('students').insertOne({
        id: studentId,
        username: `${runId}-student`,
        display_name: 'CI Student',
        password_hash: await bcrypt.hash(password, 4),
        created_at: new Date(),
      })
      await db.collection('worksheets').insertOne({
        id: worksheetId,
        user_id: ownerId,
        title: 'Private CI worksheet',
        content: { questions: [{ number: 1, type: 'matching', question: 'Ordne zu', answer: 'A→1,B→2', points: 2 }] },
        created_at: new Date(),
      })
      await db.collection('worksheets').insertOne({
        id: deleteWorksheetId,
        user_id: deleteUserId,
        title: 'Delete me',
        content: { questions: [] },
        created_at: new Date(),
      })
      await db.collection('classes').insertOne({
        id: classId,
        name: 'Private CI class',
        teacher_id: ownerId,
        join_code: 'CITEST01',
        enrolled_students: [],
        created_at: new Date(),
      })
      await db.collection('assignments').insertOne({
        id: assignmentId,
        code: 'CIASGN01',
        worksheet_id: worksheetId,
        worksheet_title: 'Private CI worksheet',
        teacher_id: ownerId,
        class_id: classId,
        status: 'active',
        created_at: new Date(),
      })
      await db.collection('submissions').insertOne({
        id: submissionId,
        assignment_id: assignmentId,
        student_id: studentId,
        student_name: 'CI Student',
        question_results: [{ questionNumber: 1, maxPoints: 2, pointsAwarded: 1, isCorrect: 'partial' }],
        total_points: 2,
        earned_points: 1,
        submitted_at: new Date(),
      })

      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: ownerEmail, password }),
      })
      assert.equal(login.status, 200)
      const loginBody = await login.json()
      assert.equal(loginBody.token, undefined, 'JWT must not be exposed in JSON')
      assert.equal(loginBody.user.id, ownerId)
      const setCookie = login.headers.get('set-cookie') || ''
      assert.match(setCookie, /eduflow_session=/)
      assert.match(setCookie, /HttpOnly/i)
      assert.match(setCookie, /SameSite=Lax/i)
      const ownerCookie = setCookie.split(';', 1)[0]

      const studentLogin = await fetch(`${baseUrl}/api/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: `${runId}-student`, password }),
      })
      assert.equal(studentLogin.status, 200)
      const studentLoginBody = await studentLogin.json()
      assert.equal(studentLoginBody.token, undefined)
      assert.equal(studentLoginBody.student.id, studentId)
      assert.match(studentLogin.headers.get('set-cookie') || '', /HttpOnly/i)

      const publicAssignment = await fetch(`${baseUrl}/api/student/assignment/CIASGN01`)
      assert.equal(publicAssignment.status, 200)
      const publicQuestion = (await publicAssignment.json()).content.questions[0]
      assert.equal(publicQuestion.answer, undefined, 'student payload must not expose the solution')
      assert.deepEqual(publicQuestion.matching_left, ['A', 'B'])
      assert.equal(publicQuestion.matching_right.length, 2)

      const unauthenticated = await fetch(`${baseUrl}/api/collaborate/comments/${worksheetId}`)
      assert.equal(unauthenticated.status, 401)

      const attackerToken = jwt.sign({ userId: attackerId }, jwtSecret, { expiresIn: '5m' })
      const attackerCookie = `eduflow_session=${encodeURIComponent(attackerToken)}`
      const foreignComments = await fetch(`${baseUrl}/api/collaborate/comments/${worksheetId}`, {
        headers: { Cookie: attackerCookie },
      })
      assert.equal(foreignComments.status, 403)

      const foreignShare = await fetch(`${baseUrl}/api/collaborate/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: attackerCookie,
          Origin: baseUrl,
        },
        body: JSON.stringify({ worksheetId, email: ownerEmail, role: 'edit' }),
      })
      assert.equal(foreignShare.status, 404)

      const foreignClass = await fetch(`${baseUrl}/api/classes/${classId}`, {
        headers: { Cookie: attackerCookie },
      })
      assert.equal(foreignClass.status, 404)

      const ownerClass = await fetch(`${baseUrl}/api/classes/${classId}`, {
        headers: { Cookie: ownerCookie },
      })
      assert.equal(ownerClass.status, 200)
      assert.equal((await ownerClass.json()).id, classId)

      const invalidClass = await fetch(`${baseUrl}/api/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
        body: JSON.stringify({ name: '', teacher_id: attackerId }),
      })
      assert.equal(invalidClass.status, 400)

      const foreignAssignment = await fetch(`${baseUrl}/api/assignments/${assignmentId}/submissions`, {
        headers: { Cookie: attackerCookie },
      })
      assert.equal(foreignAssignment.status, 404)

      const foreignGrade = await fetch(`${baseUrl}/api/submissions/${submissionId}/grade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: attackerCookie, Origin: baseUrl },
        body: JSON.stringify({ questionIndex: 0, pointsAwarded: 2 }),
      })
      assert.equal(foreignGrade.status, 403)

      const ownerGrade = await fetch(`${baseUrl}/api/submissions/${submissionId}/grade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
        body: JSON.stringify({ questionIndex: 0, pointsAwarded: 2, teacherComment: 'CI reviewed' }),
      })
      assert.equal(ownerGrade.status, 200)
      assert.equal((await ownerGrade.json()).swissGrade, 6)

      const crossSiteWrite = await fetch(`${baseUrl}/api/collaborate/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
          Origin: 'https://attacker.example',
        },
        body: JSON.stringify({ worksheetId, text: 'must be rejected' }),
      })
      assert.equal(crossSiteWrite.status, 401)

      const ownerComments = await fetch(`${baseUrl}/api/collaborate/comments/${worksheetId}`, {
        headers: { Cookie: ownerCookie },
      })
      assert.equal(ownerComments.status, 200)
      assert.deepEqual(await ownerComments.json(), [])

      const studentToken = jwt.sign({ studentId, role: 'student' }, jwtSecret, { expiresIn: '5m' })
      const studentGemini = await fetch(`${baseUrl}/api/ai/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `eduflow_session=${encodeURIComponent(studentToken)}`,
          Origin: baseUrl,
        },
        body: JSON.stringify({ prompt: 'Do not execute this prompt' }),
      })
      assert.equal(studentGemini.status, 401)

      await db.collection('password_reset_tokens').insertOne({
        id: `${runId}-reset-record`,
        user_id: ownerId,
        token_hash: hashPasswordResetToken(resetToken),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 60_000),
        used_at: null,
      })
      const resetPassword = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      })
      assert.equal(resetPassword.status, 200)

      const reusedReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ token: resetToken, password }),
      })
      assert.equal(reusedReset.status, 400)

      const oldPasswordLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: ownerEmail, password }),
      })
      assert.equal(oldPasswordLogin.status, 401)

      const newPasswordLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: ownerEmail, password: newPassword }),
      })
      assert.equal(newPasswordLogin.status, 200)

      const deleteLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: deleteUserEmail, password }),
      })
      assert.equal(deleteLogin.status, 200)
      const deleteCookie = (deleteLogin.headers.get('set-cookie') || '').split(';', 1)[0]
      const deleteAccount = await fetch(`${baseUrl}/api/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: deleteCookie, Origin: baseUrl },
        body: JSON.stringify({ email: deleteUserEmail, password }),
      })
      assert.equal(deleteAccount.status, 200)
      assert.equal(await db.collection('users').countDocuments({ id: deleteUserId }), 0)
      assert.equal(await db.collection('worksheets').countDocuments({ id: deleteWorksheetId }), 0)

      const logout = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: ownerCookie, Origin: baseUrl },
      })
      assert.equal(logout.status, 200)
      assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/i)
    } finally {
      await Promise.all([
        db.collection('users').deleteMany({ id: { $in: [ownerId, attackerId, deleteUserId] } }),
        db.collection('students').deleteMany({ id: studentId }),
        db.collection('worksheets').deleteMany({ id: { $in: [worksheetId, deleteWorksheetId] } }),
        db.collection('classes').deleteMany({ id: classId }),
        db.collection('assignments').deleteMany({ id: assignmentId }),
        db.collection('submissions').deleteMany({ id: submissionId }),
        db.collection('shares').deleteMany({ $or: [{ owner_id: ownerId }, { shared_with_id: attackerId }] }),
        db.collection('comments').deleteMany({ worksheet_id: worksheetId }),
        db.collection('password_reset_tokens').deleteMany({ user_id: { $in: [ownerId, deleteUserId] } }),
      ])
      await client.close()
    }
  })
}
