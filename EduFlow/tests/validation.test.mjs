import assert from 'node:assert/strict'
import test from 'node:test'
import { loginSchema, registerSchema, teacherTypeSchema } from '../lib/server/schemas/auth.js'
import { commentSchema, shareWorksheetSchema } from '../lib/server/schemas/collaboration.js'
import { studentLoginSchema, studentRegisterSchema } from '../lib/server/schemas/student-auth.js'
import { classSchema, niveauSchema } from '../lib/server/schemas/classes.js'
import { gradeSubmissionSchema, shareAssignmentSchema, studentSubmissionSchema, updateAssignmentSchema } from '../lib/server/schemas/assignments.js'
import { parseJsonBody } from '../lib/server/validation.js'

test('auth schemas normalize identities and reject unexpected fields', () => {
  const registration = registerSchema.parse({
    email: '  Teacher@School.CH ',
    password: 'secure-password',
    name: '  Anna Beispiel  ',
  })
  assert.equal(registration.email, 'teacher@school.ch')
  assert.equal(registration.name, 'Anna Beispiel')

  assert.equal(loginSchema.safeParse({
    email: 'teacher@school.ch',
    password: 'secure-password',
    role: 'admin',
  }).success, false)
  assert.equal(teacherTypeSchema.safeParse({ teacher_type: 'admin' }).success, false)
})

test('JSON parser rejects invalid, oversized and schema-invalid requests', async () => {
  const invalidJson = await parseJsonBody(
    new Request('https://app.example/api/auth/login', {
      method: 'POST',
      body: '{invalid',
    }),
    loginSchema,
  )
  assert.equal(invalidJson.success, false)
  assert.equal(invalidJson.status, 400)

  const oversized = await parseJsonBody(
    new Request('https://app.example/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Length': '50000' },
      body: '{}',
    }),
    loginSchema,
  )
  assert.equal(oversized.success, false)
  assert.equal(oversized.status, 413)

  const invalidCredentials = await parseJsonBody(
    new Request('https://app.example/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
    }),
    loginSchema,
  )
  assert.equal(invalidCredentials.success, false)
  assert.equal(invalidCredentials.status, 400)
  assert.ok(invalidCredentials.fields.some((field) => field.path === 'email'))
})

test('collaboration schemas constrain roles, identifiers and comment sizes', () => {
  const share = shareWorksheetSchema.parse({
    worksheetId: 'worksheet-1',
    email: ' COLLEAGUE@SCHOOL.CH ',
  })
  assert.equal(share.email, 'colleague@school.ch')
  assert.equal(share.role, 'view')

  assert.equal(shareWorksheetSchema.safeParse({
    worksheetId: 'worksheet-1',
    email: 'colleague@school.ch',
    role: 'owner',
  }).success, false)
  assert.equal(commentSchema.safeParse({
    worksheetId: 'worksheet-1',
    text: 'x'.repeat(2_001),
  }).success, false)
  assert.equal(commentSchema.safeParse({
    worksheetId: 'worksheet-1',
    text: 'Sinnvoller Kommentar',
    questionIndex: -1,
  }).success, false)
})

test('student auth schemas normalize usernames and reject weak credentials', () => {
  const registration = studentRegisterSchema.parse({
    username: '  Max.Muster ',
    password: 'secure-student-password',
    displayName: ' Max Muster ',
  })
  assert.equal(registration.username, 'max.muster')
  assert.equal(registration.displayName, 'Max Muster')

  assert.equal(studentLoginSchema.safeParse({ username: 'ab', password: '12345678' }).success, false)
  assert.equal(studentLoginSchema.safeParse({ username: 'valid-user', password: 'short' }).success, false)
  assert.equal(studentRegisterSchema.safeParse({
    username: 'valid-user',
    password: '12345678',
    displayName: 'Valid',
    role: 'teacher',
  }).success, false)
})

test('class schemas constrain names, rosters and differentiation levels', () => {
  assert.equal(classSchema.parse({ name: '  Klasse 5A ' }).name, 'Klasse 5A')
  assert.equal(classSchema.safeParse({ name: '' }).success, false)
  assert.equal(classSchema.safeParse({ name: '5A', students: Array(201).fill('Name') }).success, false)
  assert.equal(niveauSchema.safeParse({ niveau: 'D' }).success, false)
  assert.equal(niveauSchema.safeParse({ niveau: 'A', admin: true }).success, false)
})

test('assignment schemas constrain lifecycle and grading changes', () => {
  const share = shareAssignmentSchema.parse({
    worksheetId: 'worksheet-1',
    deadline: '2026-08-10T12:30',
    targetNiveau: 'B',
  })
  assert.equal(share.status, 'active')
  assert.equal(share.studentNames.length, 0)
  assert.equal(updateAssignmentSchema.safeParse({}).success, false)
  assert.equal(updateAssignmentSchema.safeParse({ status: 'deleted' }).success, false)
  assert.equal(gradeSubmissionSchema.safeParse({ questionIndex: -1, pointsAwarded: 2 }).success, false)
  assert.equal(gradeSubmissionSchema.safeParse({ questionIndex: 0, pointsAwarded: 2, role: 'admin' }).success, false)

  const studentSubmission = studentSubmissionSchema.parse({
    assignmentCode: ' abcd1234 ', studentName: ' Lernende Person ', answers: [1, 'Text'], duration: 120,
  })
  assert.equal(studentSubmission.assignmentCode, 'ABCD1234')
  assert.equal(studentSubmission.studentName, 'Lernende Person')
  assert.equal(studentSubmissionSchema.safeParse({
    assignmentCode: 'ABCD1234', studentName: 'Name', answers: Array(201).fill(null), duration: 10,
  }).success, false)
})
