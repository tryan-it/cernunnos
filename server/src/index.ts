import express from 'express'
import cors from 'cors'
import multer from 'multer'
import db from './db.js'
import { parseCsv } from './csv-parser.js'
import { detectRecurring } from './recurring.js'
import type { Transaction, CancelledSubscription } from '../../shared/types.js'
import crypto from 'crypto'

const app = express()
const PORT = 3001
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

app.use(cors())
app.use(express.json())

// Insert transactions
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO transactions (id, date, description, amount, type, balance, category, account, source)
  VALUES (@id, @date, @description, @amount, @type, @balance, @category, @account, @source)
`)

const insertMany = db.transaction((txns: Transaction[]): { imported: number; skipped: number } => {
  let imported = 0
  let skipped = 0
  for (const t of txns) {
    const result = insertStmt.run({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      balance: t.balance ?? null,
      category: t.category ?? null,
      account: t.account,
      source: t.source,
    })
    if (result.changes > 0) imported++
    else skipped++
  }
  return { imported, skipped }
})

// POST /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const account = (req.body.account as string) || 'default'
    const raw = req.file.buffer.toString('utf-8')
    const transactions = parseCsv(raw, account)

    const { imported, skipped } = insertMany(transactions)

    res.json({ total: transactions.length, imported, skipped })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// GET /api/transactions
app.get('/api/transactions', (_req, res) => {
  try {
    const { start, end, source } = _req.query
    let query = 'SELECT * FROM transactions'
    const params: string[] = []
    const conditions: string[] = []

    if (typeof start === 'string') {
      conditions.push('date >= ?')
      params.push(start)
    }
    if (typeof end === 'string') {
      conditions.push('date <= ?')
      params.push(end)
    }
    if (typeof source === 'string' && source !== 'all') {
      conditions.push('source = ?')
      params.push(source)
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY date DESC'
    const rows = db.prepare(query).all(...params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/stats
app.get('/api/stats', (_req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count, MIN(date) as minDate, MAX(date) as maxDate FROM transactions').get() as any
    res.json({ count: row.count, minDate: row.minDate, maxDate: row.maxDate })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/recurring
app.get('/api/recurring', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM transactions ORDER BY date ASC').all() as Transaction[]
    let results = detectRecurring(rows)
    const { frequency } = req.query
    if (typeof frequency === 'string' && frequency !== 'all') {
      results = results.filter(r => r.frequency === frequency)
    }
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// --- Cancellation Tracking ---
const frequencyMultiplier: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, annual: 1 }

app.post('/api/recurring/cancel', (req, res) => {
  try {
    const { description, averageAmount, frequency } = req.body
    if (!description || averageAmount == null || !frequency) {
      res.status(400).json({ error: 'Missing required fields' }); return
    }
    const mult = frequencyMultiplier[frequency]
    if (!mult) { res.status(400).json({ error: 'Invalid frequency' }); return }
    const annualSavings = Math.round(Math.abs(averageAmount) * mult * 100) / 100
    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO cancelled_subscriptions (id, description, average_amount, frequency, annual_savings) VALUES (?, ?, ?, ?, ?)'
    ).run(id, description, averageAmount, frequency, annualSavings)
    res.json({ id, description, averageAmount, frequency, annualSavings, cancelledAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

app.delete('/api/recurring/cancel/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM cancelled_subscriptions WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

app.get('/api/recurring/cancelled', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM cancelled_subscriptions ORDER BY cancelled_at DESC').all() as any[]
    const items: CancelledSubscription[] = rows.map(r => ({
      id: r.id, description: r.description, averageAmount: r.average_amount,
      frequency: r.frequency, cancelledAt: r.cancelled_at, annualSavings: r.annual_savings
    }))
    const totalAnnual = items.reduce((s, i) => s + i.annualSavings, 0)
    res.json({ items, totalAnnualSavings: Math.round(totalAnnual * 100) / 100 })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

app.get('/api/recurring/savings', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM cancelled_subscriptions ORDER BY cancelled_at DESC').all() as any[]
    const items: CancelledSubscription[] = rows.map(r => ({
      id: r.id, description: r.description, averageAmount: r.average_amount,
      frequency: r.frequency, cancelledAt: r.cancelled_at, annualSavings: r.annual_savings
    }))
    const totalAnnual = items.reduce((s, i) => s + i.annualSavings, 0)
    res.json({
      totalAnnualSavings: Math.round(totalAnnual * 100) / 100,
      totalMonthlySavings: Math.round(totalAnnual / 12 * 100) / 100,
      count: items.length,
      items
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
