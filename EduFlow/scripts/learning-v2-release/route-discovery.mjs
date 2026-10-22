import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const METHOD_EXPORT = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(target))
    else if (entry.isFile() && entry.name === 'route.js') files.push(target)
  }
  return files
}

export async function discoverPublicV2Routes(projectRoot) {
  const apiRoot = path.join(projectRoot, 'app', 'api', 'v2')
  const files = await walk(apiRoot)
  const discovered = []
  for (const absolute of files) {
    const source = await readFile(absolute, 'utf8')
    const methods = [...source.matchAll(METHOD_EXPORT)].map((match) => match[1]).sort()
    discovered.push({
      file: path.relative(projectRoot, absolute).split(path.sep).join('/'),
      methods,
    })
  }
  return discovered.sort((left, right) => left.file.localeCompare(right.file))
}

export async function diffPublicV2Routes(projectRoot, manifestRoutes) {
  const discovered = await discoverPublicV2Routes(projectRoot)
  const expected = manifestRoutes.map(({ file, methods }) => ({ file, methods: [...methods].sort() }))
    .sort((left, right) => left.file.localeCompare(right.file))
  const actualMap = new Map(discovered.map((item) => [item.file, item.methods]))
  const expectedMap = new Map(expected.map((item) => [item.file, item.methods]))
  const unknown = discovered.filter((item) => !expectedMap.has(item.file))
  const missing = expected.filter((item) => !actualMap.has(item.file))
  const methodMismatches = expected.filter((item) => actualMap.has(item.file)
    && JSON.stringify(actualMap.get(item.file)) !== JSON.stringify(item.methods))
    .map((item) => ({ file: item.file, expected: item.methods, actual: actualMap.get(item.file) }))
  return { discovered, expected, unknown, missing, methodMismatches }
}

export async function assertPublicV2RouteManifest(projectRoot, manifestRoutes) {
  const diff = await diffPublicV2Routes(projectRoot, manifestRoutes)
  if (diff.unknown.length || diff.missing.length || diff.methodMismatches.length) {
    const error = new Error(`Public V2 route manifest mismatch: ${JSON.stringify({
      unknown: diff.unknown,
      missing: diff.missing,
      methodMismatches: diff.methodMismatches,
    })}`)
    error.code = 'H10_ROUTE_MANIFEST_MISMATCH'
    error.diff = diff
    throw error
  }
  return diff
}
