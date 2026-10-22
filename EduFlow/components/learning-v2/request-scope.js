'use client'

import { useEffect, useMemo } from 'react'

export function createRequestScope(identity) {
  let active = true
  const requests = new Map()
  return {
    identity,
    open() { active = true },
    close() { active = false; for (const controller of requests.values()) controller.abort(); requests.clear() },
    begin(channel) {
      requests.get(channel)?.abort()
      const controller = new AbortController(); requests.set(channel, controller)
      return { signal: controller.signal, current: () => active && !controller.signal.aborted && requests.get(channel) === controller }
    },
  }
}

export function useRequestScope(identity) {
  const scope = useMemo(() => createRequestScope(identity), [identity])
  useEffect(() => { scope.open(); return () => scope.close() }, [scope])
  return scope
}
