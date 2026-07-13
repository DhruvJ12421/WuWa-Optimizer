import { describe, expect, it } from 'vitest'
import { classifyEchoState } from './visual'

const pixels = (color: [number, number, number], count = 100) => new Uint8ClampedArray(Array.from({ length: count }, () => [...color, 255]).flat())

describe('Echo HUD state recognition', () => {
  it('treats a red Z indicator as discarded and never locked', () => {
    const result = classifyEchoState(pixels([220, 35, 45]), pixels([245, 245, 245]))
    expect(result.excluded?.value).toBe(true)
    expect(result.locked?.value).toBe(false)
  })

  it('recognizes a bright C lock indicator when discard is inactive', () => {
    const result = classifyEchoState(pixels([55, 60, 65]), pixels([245, 245, 245]))
    expect(result.excluded?.value).toBe(false)
    expect(result.locked?.value).toBe(true)
  })

  it('allows neither state to be active', () => {
    const result = classifyEchoState(pixels([55, 60, 65]), pixels([60, 65, 70]))
    expect(result.excluded?.value).toBe(false)
    expect(result.locked?.value).toBe(false)
  })
})
