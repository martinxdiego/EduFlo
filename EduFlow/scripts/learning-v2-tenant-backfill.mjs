import { MongoClient } from 'mongodb'
import { ensureLearningV2Indexes } from '../lib/server/learning-v2/database/bootstrap.js'
import { ensurePersonalTenant, MEMBERSHIP_COLLECTION } from '../lib/server/learning-v2/auth/tenant-context.js'

function option(name) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

const apply = process.argv.includes('--apply')
const includeIdentifiers = process.argv.includes('--include-identifiers')
const databaseName = process.env.DB_NAME
const mongoUrl = process.env.MONGO_URL
const confirmedDatabase = option('confirm-db')

if (!mongoUrl || !databaseName) throw new Error('MONGO_URL and DB_NAME are required')
if (apply && confirmedDatabase !== databaseName) {
  throw new Error('Apply mode requires --confirm-db=<exact DB_NAME>')
}
if (apply && process.env.LEARNING_V2_ALLOW_TENANT_BACKFILL !== '1') {
  throw new Error('Apply mode requires LEARNING_V2_ALLOW_TENANT_BACKFILL=1')
}

const client = new MongoClient(mongoUrl)
await client.connect()
const db = client.db(databaseName)

try {
  const [teachers, students, classes] = await Promise.all([
    db.collection('users').find({}, { projection: { _id: 0, id: 1 } }).toArray(),
    db.collection('students').find({}, { projection: { _id: 0, id: 1 } }).toArray(),
    db.collection('classes').find({}, { projection: { _id: 0, teacher_id: 1, enrolled_students: 1 } }).toArray(),
  ])

  const teachersByStudent = new Map(students.map((student) => [student.id, new Set()]))
  for (const cls of classes) {
    if (!cls.teacher_id) continue
    for (const enrollment of cls.enrolled_students || []) {
      if (teachersByStudent.has(enrollment.student_id)) {
        teachersByStudent.get(enrollment.student_id).add(cls.teacher_id)
      }
    }
  }

  const unambiguous = []
  const unassigned = []
  const ambiguous = []
  for (const student of students) {
    const teacherIds = [...(teachersByStudent.get(student.id) || [])]
    if (teacherIds.length === 1) unambiguous.push({ studentId: student.id, teacherId: teacherIds[0] })
    else if (teacherIds.length === 0) unassigned.push(student.id)
    else ambiguous.push({ studentId: student.id, teacherCount: teacherIds.length })
  }

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    database: databaseName,
    teachers: teachers.length,
    students: students.length,
    classes: classes.length,
    personalTenantsPlanned: teachers.length,
    studentMembershipsUnambiguous: unambiguous.length,
    studentsUnassigned: unassigned.length,
    studentsAmbiguous: ambiguous.length,
    ambiguousSample: ambiguous.slice(0, 20).map((item) => ({
      student: includeIdentifiers ? item.studentId : '[OMITTED]',
      teacherCount: item.teacherCount,
    })),
  }

  if (apply) {
    await ensureLearningV2Indexes(db)
    const tenantByTeacher = new Map()
    for (const teacher of teachers) {
      tenantByTeacher.set(teacher.id, await ensurePersonalTenant(db, teacher.id))
    }
    const now = new Date()
    for (const mapping of unambiguous) {
      const tenant = tenantByTeacher.get(mapping.teacherId)
      if (!tenant) continue
      await db.collection(MEMBERSHIP_COLLECTION).updateOne(
        { actor_type: 'student', actor_id: mapping.studentId, tenant_id: tenant.tenant_id },
        { $setOnInsert: {
          actor_type: 'student',
          actor_id: mapping.studentId,
          tenant_id: tenant.tenant_id,
          role: 'student',
          status: 'active',
          source: 'phase-0-unambiguous-class-membership',
          created_at: now,
        }, $set: { updated_at: now } },
        { upsert: true },
      )
    }
    report.studentMembershipsApplied = unambiguous.length
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  await client.close()
}
