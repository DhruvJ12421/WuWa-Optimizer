/// <reference lib="webworker" />
import { optimizeBuilds } from '../domain/optimizer'
import type { OptimizerRequest } from '../domain/types'

self.onmessage = (event: MessageEvent<OptimizerRequest>) => {
  try {
    const results = optimizeBuilds(event.data)
    self.postMessage({ requestId: event.data.requestId, results })
  } catch (error) {
    self.postMessage({ requestId: event.data.requestId, error: error instanceof Error ? error.message : 'Optimizer failed.' })
  }
}
