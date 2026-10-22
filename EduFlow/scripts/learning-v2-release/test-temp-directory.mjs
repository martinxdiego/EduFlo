import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// macOS exposes temporary folders through /var aliases. Use their physical
// location in test fixtures so the existing strict path-identity checks hold.
// Production path validation is unchanged.
export async function canonicalizeTestTempDirectory() {
  const directory = await realpath(tmpdir())
  if (process.platform !== 'win32') process.env.TMPDIR = directory
  return directory
}
