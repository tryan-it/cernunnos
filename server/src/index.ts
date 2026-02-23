import express from 'express'
import cors from 'cors'
import multer from 'multer'
import db from './db.js'
import { parseCsv } from './csv-parser.js'
import { detectRecurring } from './recurring.js'
import type { Transaction } from '../../shared/types.js'

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
