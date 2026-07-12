import { describe, expect, it } from 'vitest'
import { fingerprintDistance } from './capture'

describe('capture fingerprints', () => {
  it('returns zero for the same sampled panel', () => {
    expect(fingerprintDistance([1, 2, 3], [1, 2, 3])).toBe(0)
  })

  it('normalizes changed pixels and rejects mismatched samples', () => {
    expect(fingerprintDistance([0, 0], [16, 16])).toBe(1)
    expect(fingerprintDistance([0], [0, 0])).toBe(1)
  })
})
