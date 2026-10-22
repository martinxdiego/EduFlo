import { localHostingEnvironment } from './local-hosting-environment.mjs'
import { canonicalizeTestTempDirectory } from '../../scripts/learning-v2-release/test-temp-directory.mjs'
await canonicalizeTestTempDirectory()
Object.assign(process.env, localHostingEnvironment)
