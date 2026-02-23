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

export interface CancelledSubscription {
  id: string
  description: string
  averageAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  cancelledAt: string
  annualSavings: number
}
