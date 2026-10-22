import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = process.cwd()
const destination = path.join(root, '.tmp/h14b-v9-independent')
await fs.mkdir(destination, { recursive: true })
const excluded = new Set(['node_modules', '.next', '.git', '.tmp', '.eduflow-release-temp'])
const files = {}
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue
    const absolute = path.join(dir, entry.name), relative = path.relative(root, absolute).replaceAll('\\', '/')
    if (entry.isDirectory()) await walk(absolute)
    else files[relative] = createHash('sha256').update(await fs.readFile(absolute)).digest('hex')
  }
}
await walk(root)
const baseline = path.join(destination, 'baseline.json')
if (process.argv[2] === 'before') {
  await fs.writeFile(baseline, JSON.stringify(files, null, 2))
  console.log(JSON.stringify({ baseline_files: Object.keys(files).length }))
} else {
  const previous = JSON.parse(await fs.readFile(baseline, 'utf8'))
  const changed = Object.keys(previous).filter(key => files[key] !== previous[key])
  const added = Object.keys(files).filter(key => !(key in previous))
  const historical = Object.keys(previous).filter(key => key.startsWith('docs/evaluation-results/') || /prompt|canonical-safety|v8|v7/.test(key))
  const result = { baseline_files: Object.keys(previous).length, changed, added, historical_files: historical.length,
    historical_changed: historical.filter(key => previous[key] !== files[key]),
    real_v9_artifacts: Object.keys(files).filter(key => key.startsWith('docs/evaluation-results/') && key.includes('tutor-paid-evaluation-v9-r1-r2-run-1-v1')) }
  await fs.writeFile(path.join(destination, 'integrity.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
