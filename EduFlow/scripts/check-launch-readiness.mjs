import { readFile } from 'node:fs/promises'
import { evaluateLaunchReadiness } from '../lib/launch-readiness.js'

const enforce = process.argv.includes('--enforce-public-launch')
if (!enforce || process.env.EDUFLOW_PUBLIC_LAUNCH === 'true') {
  const manifest = JSON.parse(await readFile(new URL('../docs/launch-readiness.json', import.meta.url), 'utf8'))
  const result = evaluateLaunchReadiness(manifest.checks)
  if (result.ready) console.log('Launch checklist: all required reviews have recorded evidence.')
  else {
    console.error(`Public launch blocked: ${result.blockers.join(', ')}`)
    process.exitCode = 1
  }
}
