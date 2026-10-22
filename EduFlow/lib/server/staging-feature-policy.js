import { PUBLIC_V2_ROUTES } from '../../scripts/learning-v2-release/routes-v1.mjs'

export const STAGING_FEATURE_POLICY_VERSION = 'staging-feature-policy-v1'
const routes = [
  ['auth', ['POST'], /^\/api\/(auth\/login|auth\/logout|student\/login)$/],
  ['auth', ['GET'], /^\/api\/(auth\/me|student\/me)$/],
  ['classes', ['GET', 'POST'], /^\/api\/classes$/],
  ['classes', ['GET', 'DELETE'], /^\/api\/classes\/[^/]+$/],
  ['classes', ['GET'], /^\/api\/classes\/[^/]+\/(stats|insights)$/],
  ['classes', ['DELETE'], /^\/api\/classes\/[^/]+\/students\/[^/]+$/],
  ['classes', ['PUT'], /^\/api\/classes\/[^/]+\/students\/[^/]+\/niveau$/],
  ['classes', ['GET'], /^\/api\/student\/my-classes$/],
  ['classes', ['POST'], /^\/api\/student\/(join-class|leave-class)$/],
  ['assignments', ['GET'], /^\/api\/assignments$/],
  ['assignments', ['POST'], /^\/api\/assignments\/share$/],
  ['assignments', ['PUT', 'DELETE'], /^\/api\/assignments\/[^/]+$/],
  ['assignments', ['GET'], /^\/api\/assignments\/[^/]+\/(submissions|overview)$/],
  ['assignments', ['PUT'], /^\/api\/submissions\/[^/]+\/(grade|finalize)$/],
  ['assignments', ['GET'], /^\/api\/student\/(assignment\/[^/]+|my-results|class-assignments)$/],
  ['assignments', ['POST'], /^\/api\/student\/submit$/],
  ['manual_worksheets', ['GET'], /^\/api\/worksheets$/],
  ['manual_worksheets', ['GET', 'PUT', 'DELETE'], /^\/api\/worksheets\/[^/]+$/],
  ['manual_worksheets', ['POST'], /^\/api\/worksheets\/[^/]+\/duplicate$/],
]
const v2Routes = PUBLIC_V2_ROUTES.map((route) => ({ ...route,
  pattern: new RegExp(`^${route.template.replace(/\[[^\]]+\]/g, '[^/]+')}$`),
}))

export function stagingRouteFeature(pathname, method) {
  if (method === 'GET' && pathname === '/') return 'teacher_ui'
  if (method === 'GET' && pathname === '/schueler') return 'student_ui'
  const v2 = v2Routes.find((route) => route.pattern.test(pathname) && route.methods.includes(method))
  if (v2) return `learning_v2.${v2.capability}`
  return routes.find(([, methods, pattern]) => methods.includes(method) && pattern.test(pathname))?.[0] || null
}

export function stagingFeatureAllowed(capabilities, feature) {
  return capabilities.environment === 'staging' && typeof feature === 'string' && capabilities.features.includes(feature)
}
