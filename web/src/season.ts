export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** Northern hemisphere seasons; month is 1–12, from the viewed page's dates. */
export function seasonForMonth(month: number): Season {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Month must be 1–12')
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}
