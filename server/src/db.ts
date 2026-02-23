import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'cernunnos.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('debit', 'credit')),
    balance REAL,
    category TEXT,
    account TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('chase_checking', 'chase_credit')),
    created_at TEXT DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS cancelled_subscriptions (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    average_amount REAL NOT NULL,
    frequency TEXT NOT NULL,
    cancelled_at TEXT DEFAULT (datetime('now')),
    annual_savings REAL NOT NULL
  )
`)

export default db
