import { describe, expect, it } from 'vitest'
import { equalBreaks, manualBreaks, quantileBreaks, rampCss } from './ramps'

describe('classification helpers', () => {
  it('creates equal interval upper bounds', () => {
    expect(equalBreaks(0, 100, 5)).toEqual([20, 40, 60, 80, 100])
  })

  it('ignores non-finite values in quantiles', () => {
    expect(quantileBreaks([1, 2, Number.NaN, 3, 4, 5], 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('accepts class boundaries and full boundary lists', () => {
    expect(manualBreaks('20,40,60,80,100', 5)).toEqual([20, 40, 60, 80, 100])
    expect(manualBreaks('0 20 40 60 80 100', 5)).toEqual([20, 40, 60, 80, 100])
  })

  it('falls back to the default palette', () => {
    expect(rampCss('missing')).toContain('#440154')
  })
})
