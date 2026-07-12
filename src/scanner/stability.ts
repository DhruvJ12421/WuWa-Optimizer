import { fingerprintDistance } from './capture'

export interface StabilityOptions {
  requiredStableFrames?: number
  stableThreshold?: number
  changedThreshold?: number
}

export class StableFrameDetector {
  private stable?: number[]
  private scanned?: number[]
  private stableCount = 0
  private readonly requiredStableFrames: number
  private readonly stableThreshold: number
  private readonly changedThreshold: number

  constructor(options: StabilityOptions = {}) {
    this.requiredStableFrames = options.requiredStableFrames ?? 1
    this.stableThreshold = options.stableThreshold ?? 0.035
    this.changedThreshold = options.changedThreshold ?? 0.035
  }

  observe(fingerprint: number[]) {
    if (!this.stable || fingerprintDistance(fingerprint, this.stable) > this.stableThreshold) {
      this.stable = [...fingerprint]
      this.stableCount = 0
      return false
    }
    this.stableCount += 1
    if (this.stableCount < this.requiredStableFrames) return false
    if (this.scanned && fingerprintDistance(fingerprint, this.scanned) <= this.changedThreshold) return false
    this.markScanned(fingerprint)
    return true
  }

  markScanned(fingerprint: number[]) {
    this.scanned = [...fingerprint]
    this.stableCount = 0
  }

  reset() {
    this.stable = undefined
    this.scanned = undefined
    this.stableCount = 0
  }
}
