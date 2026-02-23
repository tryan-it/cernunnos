import { createHash } from 'crypto'
import type { Transaction } from '../../shared/types.js'
import { categorize } from './categorize.js'

function generateId(date: string, description: string, amount: number, source: string): string {
  const key = `${date}|${description}|${amount}|${source}`
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

function parseCsvLines(raw: string): string[][] {
  const lines = raw.trim().split(/\r?\n/)
  return lines.map(line => {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          fields.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    fields.push(current.trim())
    return fields
  })
}

function parseDate(dateStr: string): string {
  // Handle MM/DD/YYYY format
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [month, day, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  throw new Error(`Invalid date format: ${dateStr}`)
}

type CsvFormat = 'chase_checking' | 'chase_credit'

function detectFormat(headers: string[]): CsvFormat {
  const joined = headers.join(',').toLowerCase()
  if (joined.includes('balance') && joined.includes('posting date')) {
    return 'chase_checking'
  }
  if (joined.includes('category') && joined.includes('transaction date')) {
    return 'chase_credit'
  }
  throw new Error(`Unrecognized CSV format. Headers: ${headers.join(', ')}`)
}

export function parseCsv(raw: string, account: string): Transaction[] {
  const rows = parseCsvLines(raw)
  if (rows.length < 2) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  const headers = rows[0]
  const format = detectFormat(headers)
  const transactions: Transaction[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue

    try {
      if (format === 'chase_checking') {
        // Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
        if (row.length < 6) throw new Error(`Row ${i + 1}: expected at least 6 columns, got ${row.length}`)
        const amount = parseFloat(row[3])
        if (isNaN(amount)) throw new Error(`Row ${i + 1}: invalid amount "${row[3]}"`)
        const balance = parseFloat(row[5])

        const date = parseDate(row[1])
        transactions.push({
          id: generateId(date, row[2], amount, 'chase_checking'),
          date,
          description: row[2],
          amount,
          type: amount < 0 ? 'debit' : 'credit',
          balance: isNaN(balance) ? undefined : balance,
          category: categorize(row[2]),
          account,
          source: 'chase_checking',
        })
      } else {
        // Transaction Date, Post Date, Description, Category, Type, Amount, Memo
        if (row.length < 6) throw new Error(`Row ${i + 1}: expected at least 6 columns, got ${row.length}`)
        const rawAmount = parseFloat(row[5])
        if (isNaN(rawAmount)) throw new Error(`Row ${i + 1}: invalid amount "${row[5]}"`)
        // Chase credit: positive = charge (expense), negative = payment/credit
        // Normalize: expenses negative, income positive
        const amount = -rawAmount

        const date = parseDate(row[0])
        transactions.push({
          id: generateId(date, row[2], amount, 'chase_credit'),
          date,
          description: row[2],
          amount,
          type: amount < 0 ? 'debit' : 'credit',
          category: row[3] || undefined,
          account,
          source: 'chase_credit',
        })
      }
    } catch (err) {
      throw new Error(`Parse error at row ${i + 1}: ${(err as Error).message}`)
    }
  }

  if (transactions.length === 0) {
    throw new Error('No valid transactions found in CSV')
  }

  return transactions
}
