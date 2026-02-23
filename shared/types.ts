export interface Transaction {
  id: string
  date: string // ISO date
  description: string
  amount: number // negative = expense, positive = income
  type: 'debit' | 'credit'
  balance?: number
  category?: string
  account: string
  source: 'chase_checking' | 'chase_credit'
}
