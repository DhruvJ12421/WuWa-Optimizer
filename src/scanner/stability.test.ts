import { describe, expect, it } from 'vitest'
import { StableFrameDetector } from './stability'

const frame = (value: number) => Array.from({ length: 256 }, () => value)

describe('stable frame detector', () => {
  it('captures a settled panel on the second lightweight probe by default', () => {
    const detector = new StableFrameDetector()
    expect(detector.observe(frame(4))).toBe(false)
    expect(detector.observe(frame(4))).toBe(true)
  })
  it('emits once after the required number of stable observations', () => {
    const detector = new StableFrameDetector({ requiredStableFrames: 2 })
    expect(detector.observe(frame(2))).toBe(false)
    expect(detector.observe(frame(2))).toBe(false)
    expect(detector.observe(frame(2))).toBe(true)
    expect(detector.observe(frame(2))).toBe(false)
    expect(detector.observe(frame(2))).toBe(false)
  })

  it('emits again only after a materially changed panel stabilizes', () => {
    const detector = new StableFrameDetector({ requiredStableFrames: 1 })
    detector.observe(frame(2))
    expect(detector.observe(frame(2))).toBe(true)
    expect(detector.observe(frame(2))).toBe(false)
    expect(detector.observe(frame(12))).toBe(false)
    expect(detector.observe(frame(12))).toBe(true)
  })

  it('can mark a manually scanned frame to suppress its automatic duplicate', () => {
    const detector = new StableFrameDetector({ requiredStableFrames: 1 })
    detector.markScanned(frame(5))
    detector.observe(frame(5))
    expect(detector.observe(frame(5))).toBe(false)
  })
})
