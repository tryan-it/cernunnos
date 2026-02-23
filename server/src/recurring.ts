import type { Transaction } from '../../shared/types.js'

export interface RecurringPayment {
  description: string
  category: string
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  averageAmount: number
  lastDate: string
  nextExpectedDate: string
  occurrences: number
  transactions: Transaction[]
}

function normalizeDescription(desc: string): string {
  return desc
    // Remove dates in various formats
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    // Remove reference/confirmation numbers (long digit sequences)
    .replace(/\b\d{4,}\b/g, '')
    // Remove trailing hash/pound numbers
    .replace(/#\d+/g, '')
    // Remove dollar amounts
    .replace(/\$[\d,.]+/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function classifyFrequency(avgDays: number): 'weekly' | 'monthly' | 'quarterly' | 'annual' | null {
  if (avgDays >= 5 && avgDays <= 10) return 'weekly'
  if (avgDays >= 25 && avgDays <= 38) return 'monthly'
  if (avgDays >= 80 && avgDays <= 105) return 'quarterly'
  if (avgDays >= 340 && avgDays <= 400) return 'annual'
  return null
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + Math.round(days))
  return d.toISOString().split('T')[0]
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z')
  const db = new Date(b + 'T00:00:00Z')
  return Math.abs((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

export function detectRecurring(transactions: Transaction[]): RecurringPayment[] {
  // Group by normalized description
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const key = normalizeDescription(t.description)
    if (!key) continue
    const arr = groups.get(key) || []
    arr.push(t)
    groups.set(key, arr)
  }

  const results: RecurringPayment[] = []

  for (const [normDesc, txns] of groups) {
    if (txns.length < 2) continue

    // Sort by date
    txns.sort((a, b) => a.date.localeCompare(b.date))

    // Calculate intervals
    const intervals: number[] = []
    for (let i = 1; i < txns.length; i++) {
      intervals.push(daysBetween(txns[i - 1].date, txns[i].date))
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length
    const frequency = classifyFrequency(avgInterval)
    if (!frequency) continue

    // Check consistency: standard deviation should be within tolerance
    const variance = intervals.reduce((s, v) => s + (v - avgInterval) ** 2, 0) / intervals.length
    const stdDev = Math.sqrt(variance)
    if (stdDev > 10) continue // too inconsistent

    const avgAmount = txns.reduce((s, t) => s + t.amount, 0) / txns.length
    const lastDate = txns[txns.length - 1].date
    const category = txns[txns.length - 1].category || 'Uncategorized'

    results.push({
      description: normDesc,
      category,
      frequency,
      averageAmount: Math.round(avgAmount * 100) / 100,
      lastDate,
      nextExpectedDate: addDays(lastDate, avgInterval),
      occurrences: txns.length,
      transactions: txns,
    })
  }

  // Sort by occurrences descending
  results.sort((a, b) => b.occurrences - a.occurrences)
  return results
}
