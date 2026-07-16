import { describe, expect, it } from 'vitest'
import { formatDurationMs, timeToDoneLabel } from './image-timing'

describe('image-timing', () => {
  it('formats durations', () => {
    expect(formatDurationMs(5_000)).toBe('5s')
    expect(formatDurationMs(65_000)).toBe('1m 5s')
    expect(formatDurationMs(3_661_000)).toBe('1h 1m')
  })

  it('computes time to done', () => {
    expect(
      timeToDoneLabel('2026-01-01T00:00:00.000Z', '2026-01-01T00:01:30.000Z')
    ).toBe('1m 30s')
    expect(timeToDoneLabel(null, '2026-01-01T00:01:30.000Z')).toBe('—')
  })
})
