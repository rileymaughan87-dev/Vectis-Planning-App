// Showing and reading amounts. The currency follows your region (as the
// iPhone app did) unless you pick one in Settings.

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const BY_REGION: Record<string, string> = {
  GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', ZA: 'ZAR', JP: 'JPY',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', MX: 'MXN', BR: 'BRL', SG: 'SGD', HK: 'HKD',
  ...Object.fromEntries(EURO.map(r => [r, 'EUR'])),
}

/** Choices offered in Settings. */
export const CURRENCIES = ['GBP', 'USD', 'CAD', 'EUR', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'ZAR', 'JPY', 'MXN', 'BRL', 'SGD', 'HKD']

export function regionCurrency(locale: string = typeof navigator === 'undefined' ? 'en-GB' : navigator.language): string {
  try {
    const region = new Intl.Locale(locale).maximize().region
    if (region && BY_REGION[region]) return BY_REGION[region]
  } catch {
    // Unknown locale; fall through.
  }
  return 'GBP'
}

const formatters = new Map<string, Intl.NumberFormat>()
function formatter(currency: string, whole: boolean) {
  const key = `${currency}:${whole}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(undefined, { style: 'currency', currency, ...(whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}) })
    formatters.set(key, f)
  }
  return f
}

/** "£1,234.50". */
export function formatMoney(amount: number, currency: string): string {
  return formatter(currency, false).format(amount)
}

/** "£1,235" — for cramped places like a calendar cell. */
export function formatMoneyWhole(amount: number, currency: string): string {
  return formatter(currency, true).format(amount)
}

/** "+£600.00" / "−£1,200.00", with a real minus sign. */
export function formatSigned(amount: number, currency: string, sign: '+' | '-'): string {
  return (sign === '+' ? '+' : '−') + formatMoney(Math.abs(amount), currency)
}

/**
 * Reads what was typed into an amount box: "1,234.50", "£12", "12,5"
 * (decimal comma) all work. Null when there's no number in it.
 */
export function parseAmount(text: string): number | null {
  let t = text.replace(/[^\d.,-]/g, '')
  if (!t) return null
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  // A comma followed by one or two digits at the end, with no dot after it, is a decimal comma.
  if (lastComma > lastDot && /,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** What goes in an amount box when editing: "1200" or "12.50", never "1,200.00". */
export function amountText(amount: number): string {
  if (amount === 0) return ''
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}
