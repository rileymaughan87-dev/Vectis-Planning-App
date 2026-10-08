// Maths in notes, in the spirit of Apple's Math Notes. A line ending in
// "=" shows its answer; "rent = 650" sets a variable that later lines can
// use; "5 miles in km =" converts units.
//
// A small parser of our own rather than anything that runs user text as
// code: it only understands numbers, + − × ÷ ^ %, brackets, a few
// functions, variables and units, never throws, and gives up quietly on
// anything else (very long lines, deep nesting, huge numbers).

// MARK: - Units

type Dim = 'length' | 'mass' | 'volume' | 'time' | 'speed' | 'temperature' | 'data' | 'area' | `money:${string}`

export interface Unit {
  /** How it's written in an answer. */
  symbol: string
  dim: Dim
  /** Base units per one of these (base: m, kg, L, s, m/s, K, B, m²). */
  factor: number
  /** Temperature only: base = (value + offset) × factor. */
  offset?: number
}

const U = (symbol: string, dim: Dim, factor: number, aliases: string[], offset?: number) => ({ unit: { symbol, dim, factor, offset } as Unit, aliases })

const UNIT_LIST = [
  U('mm', 'length', 0.001, ['mm', 'millimetre', 'millimetres', 'millimeter', 'millimeters']),
  U('cm', 'length', 0.01, ['cm', 'centimetre', 'centimetres', 'centimeter', 'centimeters']),
  U('m', 'length', 1, ['m', 'metre', 'metres', 'meter', 'meters']),
  U('km', 'length', 1000, ['km', 'kilometre', 'kilometres', 'kilometer', 'kilometers', 'kms']),
  U('in', 'length', 0.0254, ['in', 'inch', 'inches']),
  U('ft', 'length', 0.3048, ['ft', 'foot', 'feet']),
  U('yd', 'length', 0.9144, ['yd', 'yard', 'yards']),
  U('mi', 'length', 1609.344, ['mi', 'mile', 'miles']),
  U('mg', 'mass', 1e-6, ['mg', 'milligram', 'milligrams']),
  U('g', 'mass', 0.001, ['g', 'gram', 'grams']),
  U('kg', 'mass', 1, ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kgs']),
  U('oz', 'mass', 0.028349523125, ['oz', 'ounce', 'ounces']),
  U('lb', 'mass', 0.45359237, ['lb', 'lbs', 'pound', 'pounds']),
  U('st', 'mass', 6.35029318, ['st', 'stone', 'stones']),
  U('ml', 'volume', 0.001, ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters']),
  U('L', 'volume', 1, ['l', 'litre', 'litres', 'liter', 'liters']),
  U('tsp', 'volume', 0.00492892, ['tsp', 'teaspoon', 'teaspoons']),
  U('tbsp', 'volume', 0.0147868, ['tbsp', 'tablespoon', 'tablespoons']),
  U('cup', 'volume', 0.24, ['cup', 'cups']),
  // US measures; the UK pint and gallon are named separately.
  U('fl oz', 'volume', 0.0295735, ['floz']),
  U('pt', 'volume', 0.473176, ['pt', 'pint', 'pints']),
  U('gal', 'volume', 3.78541, ['gal', 'gallon', 'gallons']),
  U('UK pt', 'volume', 0.568261, ['ukpint', 'ukpints']),
  U('UK gal', 'volume', 4.54609, ['ukgal', 'ukgallon', 'ukgallons']),
  U('s', 'time', 1, ['s', 'sec', 'secs', 'second', 'seconds']),
  U('min', 'time', 60, ['min', 'mins', 'minute', 'minutes']),
  U('h', 'time', 3600, ['h', 'hr', 'hrs', 'hour', 'hours']),
  U('days', 'time', 86400, ['day', 'days']),
  U('weeks', 'time', 604800, ['wk', 'wks', 'week', 'weeks']),
  U('years', 'time', 31557600, ['yr', 'yrs', 'year', 'years']),
  U('km/h', 'speed', 1000 / 3600, ['km/h', 'kmh', 'kph']),
  U('mph', 'speed', 1609.344 / 3600, ['mph', 'mi/h']),
  U('m/s', 'speed', 1, ['m/s']),
  U('°C', 'temperature', 1, ['°c', 'c', 'celsius', 'degc'], 273.15),
  U('°F', 'temperature', 5 / 9, ['°f', 'f', 'fahrenheit', 'degf'], 459.67),
  // No bare "k" or "b": "5k" and "2b" more often mean thousand and billion.
  U('K', 'temperature', 1, ['kelvin'], 0),
  U('B', 'data', 1, ['byte', 'bytes']),
  U('KB', 'data', 1e3, ['kb', 'kilobyte', 'kilobytes']),
  U('MB', 'data', 1e6, ['mb', 'megabyte', 'megabytes']),
  U('GB', 'data', 1e9, ['gb', 'gigabyte', 'gigabytes']),
  U('TB', 'data', 1e12, ['tb', 'terabyte', 'terabytes']),
  U('m²', 'area', 1, ['m²', 'm2', 'sqm']),
  U('ft²', 'area', 0.09290304, ['ft²', 'ft2', 'sqft']),
  U('acres', 'area', 4046.8564224, ['acre', 'acres']),
  U('ha', 'area', 10000, ['ha', 'hectare', 'hectares']),
]

const UNITS = new Map<string, Unit>()
for (const { unit, aliases } of UNIT_LIST) for (const a of aliases) UNITS.set(a, unit)

/** Symbols written before an amount. Converting between them needs live rates, so it isn't offered. */
const CURRENCIES: Record<string, Unit> = {
  '£': { symbol: '£', dim: 'money:£', factor: 1 },
  $: { symbol: '$', dim: 'money:$', factor: 1 },
  '€': { symbol: '€', dim: 'money:€', factor: 1 },
}

// MARK: - Values

interface Value {
  n: number
  unit?: Unit
  /** Written as "20%": adds or takes away a share when used with + or −. */
  percent?: boolean
}

class MathError extends Error {}
const fail = (why = 'not maths'): never => { throw new MathError(why) }

const toBase = (v: number, u: Unit) => (v + (u.offset ?? 0)) * u.factor
const fromBase = (b: number, u: Unit) => b / u.factor - (u.offset ?? 0)

function convert(v: Value, to: Unit): Value {
  if (!v.unit) return { n: v.n, unit: to }
  if (v.unit.dim !== to.dim) fail('different kinds of unit')
  return { n: fromBase(toBase(v.n, v.unit), to), unit: to }
}

function add(a: Value, b: Value, sign: 1 | -1): Value {
  // "80 + 10%" adds ten percent of 80.
  if (b.percent && !a.percent) return { n: a.n * (1 + sign * b.n), unit: a.unit }
  if (a.unit && b.unit) {
    if (a.unit.dim !== b.unit.dim) fail('different kinds of unit')
    // Two temperatures: add the difference, not the absolute values.
    const bn = a.unit.dim === 'temperature' ? (b.n * b.unit.factor) / a.unit.factor : convert(b, a.unit).n
    return { n: a.n + sign * bn, unit: a.unit }
  }
  return { n: a.n + sign * b.n, unit: a.unit ?? b.unit, percent: a.percent && b.percent }
}

function multiply(a: Value, b: Value): Value {
  if (a.unit && b.unit) fail('unit times unit')
  return { n: a.n * b.n, unit: a.unit ?? b.unit }
}

function divide(a: Value, b: Value): Value {
  if (b.n === 0) fail('divide by zero')
  if (a.unit && b.unit) {
    if (a.unit.dim !== b.unit.dim) fail('different kinds of unit')
    return { n: toBase(a.n, a.unit) / toBase(b.n, b.unit) }
  }
  if (b.unit) fail('number over unit')
  return { n: a.n / b.n, unit: a.unit }
}

// MARK: - Tokens

type Token =
  | { t: 'num'; v: number }
  | { t: 'word'; v: string }
  | { t: 'op'; v: string }
  | { t: 'cur'; v: string }
  /** Anything else ("Total:"): maths can only start after it. */
  | { t: 'other'; v: string }

const MAX_LENGTH = 300
const MAX_TOKENS = 120
const MAX_DEPTH = 30

export function tokenize(text: string): Token[] | null {
  // Too long to be a sum worth working out; also keeps the work bounded.
  if (text.length > MAX_LENGTH) return null
  const out: Token[] = []
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    const space = /^\s+/.exec(rest)
    if (space) { i += space[0].length; continue }
    // 1,200.50 (thousands commas) or 3.5 or .5 or 2e3
    const num = /^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.?\d+(?:e[+-]?\d+)?)/i.exec(rest)
    if (num) { out.push({ t: 'num', v: Number(num[1].replace(/,/g, '')) }); i += num[1].length; continue }
    const word = /^(°?[\p{L}_][\p{L}\p{N}_²]*)/u.exec(rest)
    if (word) { out.push({ t: 'word', v: word[1] }); i += word[1].length; continue }
    const ch = rest[0]
    if (ch in CURRENCIES) out.push({ t: 'cur', v: ch })
    else if ('+-−*×·/÷^%()'.includes(ch)) out.push({ t: 'op', v: ch === '−' ? '-' : ch === '×' || ch === '·' ? '*' : ch === '÷' ? '/' : ch })
    else out.push({ t: 'other', v: ch })
    i++
    if (out.length > MAX_TOKENS) return null
  }
  return out
}

// MARK: - Parsing and evaluating together

const KEYWORDS = new Set(['in', 'to', 'as', 'of'])
const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
}
const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI }

export type Scope = Map<string, Value>

interface Parsed {
  value: Value
  /** Whether it did anything beyond restating a number — only then is an answer worth showing. */
  worked: boolean
}

function parse(tokens: Token[], scope: Scope): Parsed {
  let pos = 0
  let depth = 0
  let worked = false
  const peek = (o = 0) => tokens[pos + o]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  const isWord = (v: string) => peek()?.t === 'word' && (peek()!.v as string).toLowerCase() === v

  /** A unit name at the cursor (including "km/h" and "m/s"), consumed if found. */
  const readUnit = (): Unit | undefined => {
    const a = peek()
    if (a?.t !== 'word') return undefined
    const name = a.v.toLowerCase()
    // "km/h": a word, "/", a word that together name a unit.
    const b = peek(1)
    const c = peek(2)
    if (b?.t === 'op' && b.v === '/' && c?.t === 'word') {
      const compound = UNITS.get(`${name}/${c.v.toLowerCase()}`)
      if (compound) { pos += 3; return compound }
    }
    // Two words that make one unit: "fl oz", "uk gallon", "sq ft".
    if (b?.t === 'word') {
      const joined = UNITS.get(name + b.v.toLowerCase())
      if (joined) { pos += 2; return joined }
    }
    const unit = UNITS.get(name)
    if (!unit) return undefined
    // "in" is inches unless a unit follows it ("5 in" vs "5 miles in km");
    // in "12 in in cm" the first one is inches.
    const next = b?.t === 'word' ? b.v.toLowerCase() : ''
    if (name === 'in' && next !== 'in' && UNITS.has(next)) return undefined
    pos += 1
    return unit
  }

  const expression = (): Value => {
    if (++depth > MAX_DEPTH) fail('too deep')
    let v = additive()
    // "… in km", "… to °F", "… as hours"
    while (peek()?.t === 'word' && ['in', 'to', 'as'].includes((peek()!.v as string).toLowerCase())) {
      pos++
      const unit = readUnit() ?? fail('no unit')
      v = convert(v, unit)
      worked = true
    }
    depth--
    return v
  }

  const additive = (): Value => {
    let v = term()
    while (isOp('+') || isOp('-')) {
      const sign = peek()!.v === '+' ? 1 : -1
      pos++
      v = add(v, term(), sign)
      worked = true
    }
    return v
  }

  const term = (): Value => {
    let v = power()
    for (;;) {
      if (isOp('*')) { pos++; v = multiply(v, power()) }
      else if (isOp('/')) { pos++; v = divide(v, power()) }
      else if (isWord('of') && v.percent) { pos++; v = multiply({ n: v.n }, power()) } // "20% of 50"
      else break
      worked = true
    }
    return v
  }

  const power = (): Value => {
    const base = unary()
    if (!isOp('^')) return base
    pos++
    const exp = power()
    if (base.unit || exp.unit) fail('power of a unit')
    worked = true
    return { n: base.n ** exp.n }
  }

  const unary = (): Value => {
    if (isOp('-')) { pos++; const v = unary(); return { ...v, n: -v.n } }
    if (isOp('+')) { pos++; return unary() }
    return postfix()
  }

  const postfix = (): Value => {
    let v = primary()
    if (isOp('%')) { pos++; v = { n: v.n / 100, percent: true } }
    else if (!v.unit) {
      const unit = readUnit()
      if (unit) v = { n: v.n, unit }
    }
    return v
  }

  const primary = (): Value => {
    const tok = peek() ?? fail('ran out')
    if (tok.t === 'num') { pos++; return { n: tok.v } }
    if (tok.t === 'cur') {
      pos++
      const v = unary()
      if (v.unit) fail('money and a unit')
      return { n: v.n, unit: CURRENCIES[tok.v] }
    }
    if (tok.t === 'op' && tok.v === '(') {
      pos++
      const v = expression()
      if (!isOp(')')) fail('no closing bracket')
      pos++
      return v
    }
    if (tok.t === 'word') {
      const name = tok.v.toLowerCase()
      if (KEYWORDS.has(name)) fail('keyword')
      if (FUNCTIONS[name] && peek(1)?.t === 'op' && peek(1)!.v === '(') {
        pos += 2
        const v = expression()
        if (!isOp(')')) fail('no closing bracket')
        pos++
        worked = true
        return { n: FUNCTIONS[name](v.n), unit: v.unit }
      }
      const variable = scope.get(name)
      if (variable) { pos++; worked = true; return variable }
      if (name in CONSTANTS) { pos++; worked = true; return { n: CONSTANTS[name] } }
    }
    return fail('unknown')
  }

  const value = expression()
  if (pos !== tokens.length) fail('left over')
  if (!Number.isFinite(value.n)) fail('too big')
  return { value, worked }
}

/** One expression's value, or null if it isn't maths. */
export function evaluate(text: string, scope: Scope = new Map()): Value | null {
  const tokens = tokenize(text)
  if (!tokens || tokens.length === 0 || tokens.some(t => t.t === 'other')) return null
  try {
    return parse(tokens, scope).value
  } catch {
    return null
  }
}

/**
 * The answer for a line ending in "=": the longest stretch at the end of
 * the line that is maths, so "Total: rent * 12 =" works. A bare number
 * ("Day 3 =") isn't worth an answer.
 */
function answer(text: string, scope: Scope): Value | null {
  const tokens = tokenize(text)
  if (!tokens) return null
  // Nothing before punctuation like "Total:" can be part of the sum.
  const after = tokens.findLastIndex(t => t.t === 'other') + 1
  for (let start = after; start < tokens.length; start++) {
    try {
      const { value, worked } = parse(tokens.slice(start), scope)
      return worked ? value : null
    } catch {
      // Not maths from here; try starting one word later.
    }
  }
  return null
}

// MARK: - Whole notes

export interface LineResult {
  /** The answer as shown after the "=". */
  text: string
}

const ASSIGN = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.*\S)\s*$/u

/**
 * Works through a note's lines in order: assignments set variables for
 * the lines below, and lines ending in "=" get an answer. Changing a
 * variable changes every answer that uses it, because everything is
 * worked out again from the top on each edit.
 */
export function evaluateLines(lines: string[]): (LineResult | null)[] {
  const scope: Scope = new Map()
  return lines.map(line => {
    const trimmed = line.trimEnd()
    const wantsAnswer = trimmed.endsWith('=') && !trimmed.endsWith('==')
    const body = wantsAnswer ? trimmed.slice(0, -1) : trimmed

    const assign = ASSIGN.exec(body)
    if (assign) {
      const name = assign[1].toLowerCase()
      if (!UNITS.has(name) && !KEYWORDS.has(name) && !FUNCTIONS[name] && !(name in CONSTANTS)) {
        const value = evaluate(assign[2], scope)
        if (value) {
          scope.set(name, value)
          return wantsAnswer ? { text: formatValue(value) } : null
        }
      }
    }
    if (!wantsAnswer) return null
    const value = answer(body, scope)
    return value ? { text: formatValue(value) } : null
  })
}

// MARK: - Showing answers

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 })
const moneyFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatNumber(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(4).replace(/\.?0+e/, 'e')
  // Twelve significant figures hides floating-point dust (0.1 + 0.2).
  return numberFormat.format(Number(n.toPrecision(12)))
}

export function formatValue(v: Value): string {
  if (v.percent) return `${formatNumber(v.n * 100)}%`
  if (!v.unit) return formatNumber(v.n)
  if (v.unit.dim.startsWith('money:')) {
    const whole = Number.isInteger(Number(v.n.toPrecision(12)))
    return `${v.n < 0 ? '−' : ''}${v.unit.symbol}${whole ? formatNumber(Math.abs(v.n)) : moneyFormat.format(Math.abs(v.n))}`
  }
  return `${formatNumber(v.n)} ${v.unit.symbol}`
}
