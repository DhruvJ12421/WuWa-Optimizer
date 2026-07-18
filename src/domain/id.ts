let fallbackSequence = 0

export function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  fallbackSequence = (fallbackSequence + 1) >>> 0
  const bytes = new Uint8Array(16)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)

  const timestamp = Date.now()
  const sequence = fallbackSequence
  for (let index = 0; index < 6; index += 1) bytes[15 - index] ^= Math.floor(timestamp / (2 ** (index * 8))) & 0xff
  for (let index = 0; index < 4; index += 1) bytes[9 - index] ^= Math.floor(sequence / (2 ** (index * 8))) & 0xff

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
