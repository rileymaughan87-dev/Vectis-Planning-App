import { describe, expect, it } from 'vitest'
import { evaluate, evaluateLines, formatValue } from '@suite/record/math'

const show = (text: string) => {
  const v = evaluate(text)
  return v ? formatValue(v) : null
}
const answers = (lines: string[]) => evaluateLines(lines).map(r => r?.text ?? null)

describe('expressions', () => {
  it('does arithmetic in the usual order', () => {
    expect(show('2 + 3 * 4')).toBe('14')
    expect(show('(2 + 3) × 4')).toBe('20')
    expect(show('2 ^ 3 ^ 2')).toBe('512')
    expect(show('10 ÷ 4')).toBe('2.5')
    expect(show('-3 + 5')).toBe('2')
    expect(show('0.1 + 0.2')).toBe('0.3')
    expect(show('1,200 * 2')).toBe('2,400')
    expect(show('sqrt(16) + round(2.6)')).toBe('7')
  })

  it('handles percentages', () => {
    expect(show('80 + 10%')).toBe('88')
    expect(show('50 - 20%')).toBe('40')
    expect(show('20% of 50')).toBe('10')
    expect(show('15%')).toBe('15%')
  })

  it('converts units', () => {
    expect(show('5 miles in km')).toBe('8.04672 km')
    expect(show('100 °C to °F')).toBe('212 °F')
    expect(show('6 ft in cm')).toBe('182.88 cm')
    expect(show('2 hours + 30 min in min')).toBe('150 min')
    expect(show('60 mph in km/h')).toBe('96.56064 km/h')
    expect(show('12 in in cm')).toBe('30.48 cm')
    expect(show('5 kg in miles')).toBeNull()
  })

  it('keeps money symbols but never converts between them', () => {
    expect(show('£650 * 12')).toBe('£7,800')
    expect(show('$10 / 3')).toBe('$3.33')
    expect(show('£5 + €5')).toBeNull()
  })

  it('gives up quietly on anything that is not maths', () => {
    for (const bad of ['', '2 +', '(1 + 2', '1 / 0', 'hello world', '9 ^ 9 ^ 9', '2 3', '5k', '1'.repeat(400), '('.repeat(50) + '1' + ')'.repeat(50)]) {
      expect(evaluate(bad)).toBeNull()
    }
  })
})

describe('whole notes', () => {
  it('answers lines ending in = and keeps variables for later lines', () => {
    expect(answers(['rent = 650', 'bills = 120', 'rent * 12 =', 'Total: rent + bills ='])).toEqual([null, null, '7,800', '770'])
  })

  it('updates every answer when a variable changes', () => {
    expect(answers(['rent = 700', 'rent * 12 ='])).toEqual([null, '8,400'])
  })

  it('shows an assignment that also ends in =', () => {
    expect(answers(['x = 4 * 5 =', 'x / 2 ='])).toEqual(['20', '10'])
  })

  it('leaves prose and bare numbers alone', () => {
    expect(answers(['Day 3 =', 'mood = good', 'I think so =', 'a == b'])).toEqual([null, null, null, null])
  })

  it('reads variables case-insensitively and with units', () => {
    expect(answers(['Run = 5 km', 'run * 4 in miles ='])).toEqual([null, '12.427424 mi'])
  })
})
