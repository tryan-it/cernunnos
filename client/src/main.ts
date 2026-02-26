import type { Transaction, RecurringPayment, CancelledSubscription } from '../../shared/types.js'
import { renderSankey } from './sankey.js'

// Elements
const dropZone = document.getElementById('drop-zone')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const statusEl = document.getElementById('status')!
const txnSection = document.getElementById('transactions')!
const tbody = document.querySelector('#txn-table tbody')!
const controlsEl = document.getElementById('controls')!
const summaryEl = document.getElementById('summary')!
const chartContainer = document.getElementById('chart-container')!
const chartEl = document.getElementById('waterfall-chart')!
const dateRangeSelect = document.getElementById('date-range') as HTMLSelectElement
const customDatesEl = document.getElementById('custom-dates')!
const dateStartInput = document.getElementById('date-start') as HTMLInputElement
const dateEndInput = document.getElementById('date-end') as HTMLInputElement
const accountFilter = document.getElementById('account-filter') as HTMLSelectElement
const expandedEl = document.getElementById('expanded-txns')!
const expandedTitle = document.getElementById('expanded-title')!
const expandedClose = document.getElementById('expanded-close')!
const expandedTbody = document.querySelector('#expanded-table tbody')!

function fmt(n: number): string {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `-$${s}` : `$${s}`
}

function showStatus(msg: string, type: 'success' | 'error') {
  statusEl.textContent = msg
  statusEl.className = type
}

function getDateRange(): { start?: string; end?: string } {
  const val = dateRangeSelect.value
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  const pad = (n: number) => String(n).padStart(2, '0')
  const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  switch (val) {
    case 'this-month':
      return { start: `${y}-${pad(m + 1)}-01`, end: isoDate(now) }
    case 'last-month': {
      const s = new Date(y, m - 1, 1)
      const e = new Date(y, m, 0)
      return { start: isoDate(s), end: isoDate(e) }
    }
    case '3-months': {
      const s = new Date(y, m - 2, 1)
      return { start: isoDate(s), end: isoDate(now) }
    }
    case '6-months': {
      const s = new Date(y, m - 5, 1)
      return { start: isoDate(s), end: isoDate(now) }
    }
    case 'ytd':
      return { start: `${y}-01-01`, end: isoDate(now) }
    case 'custom':
      return {
        start: dateStartInput.value || undefined,
        end: dateEndInput.value || undefined,
      }
    default: // 'all'
      return {}
  }
}

function renderTransactions(txns: Transaction[]) {
  tbody.innerHTML = ''
  txnSection.classList.remove('hidden')
  for (const t of txns) {
    const tr = document.createElement('tr')
    const amtClass = t.amount < 0 ? 'negative' : 'positive'
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.description}</td>
      <td class="${amtClass}">${fmt(t.amount)}</td>
      <td>${t.type}</td>
      <td>${t.source}</td>
      <td>${t.category ?? ''}</td>
    `
    tbody.appendChild(tr)
  }
}

function updateSummary(txns: Transaction[]) {
  const income = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = txns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  document.getElementById('stat-income')!.textContent = fmt(income)
  document.getElementById('stat-expenses')!.textContent = fmt(expenses)
  const netEl = document.getElementById('stat-net')!
  netEl.textContent = fmt(income + expenses)
  netEl.style.color = (income + expenses) >= 0 ? '#2ecc71' : '#e74c3c'
}

expandedClose.addEventListener('click', () => expandedEl.classList.add('hidden'))

async function fetchAndRender() {
  const { start, end } = getDateRange()
  const source = accountFilter.value
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  if (source !== 'all') params.set('source', source)

  try {
    const res = await fetch(`/api/transactions?${params}`)
    const txns: Transaction[] = await res.json()

    if (txns.length === 0) {
      chartEl.innerHTML = '<p style="color:#888;text-align:center;padding:2rem;">No transactions found for this period</p>'
      summaryEl.classList.add('hidden')
      txnSection.classList.add('hidden')
      return
    }

    controlsEl.classList.remove('hidden')
    summaryEl.classList.remove('hidden')
    chartContainer.classList.remove('hidden')

    updateSummary(txns)
    renderSankey(chartEl, txns)
    renderTransactions(txns)
    expandedEl.classList.add('hidden')
  } catch {
    // Server not running
  }
}

// Controls event listeners
dateRangeSelect.addEventListener('change', () => {
  customDatesEl.classList.toggle('hidden', dateRangeSelect.value !== 'custom')
  fetchAndRender()
})
dateStartInput.addEventListener('change', fetchAndRender)
dateEndInput.addEventListener('change', fetchAndRender)
accountFilter.addEventListener('change', fetchAndRender)

// Responsive resize
let resizeTimer: ReturnType<typeof setTimeout>
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(fetchAndRender, 200)
})

// Upload
async function uploadFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  form.append('account', file.name.replace('.csv', ''))

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) { showStatus(`Error: ${data.error}`, 'error'); return }
    const msg = `Imported ${data.imported} transactions` + (data.skipped > 0 ? ` (${data.skipped} duplicates skipped)` : '')
    showStatus(msg, 'success')
    fetchStats()
    fetchAndRender()
  } catch (err) {
    showStatus(`Upload failed: ${(err as Error).message}`, 'error')
  }
}

// Drag & drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover') })
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'))
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('dragover')
  const file = e.dataTransfer?.files[0]
  if (file) uploadFile(file)
})
dropZone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) uploadFile(file) })

// --- Navigation ---
const navBtns = document.querySelectorAll('.nav-btn')
const viewDashboard = document.getElementById('view-dashboard')!
const viewRecurring = document.getElementById('view-recurring')!

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const view = (btn as HTMLElement).dataset.view
    viewDashboard.classList.toggle('hidden', view !== 'dashboard')
    viewRecurring.classList.toggle('hidden', view !== 'recurring')
    if (view === 'recurring') fetchRecurring()
  })
})

// --- Data Stats ---
async function fetchStats() {
  try {
    const res = await fetch('/api/stats')
    const data = await res.json()
    if (data.count > 0) {
      document.getElementById('data-stats')!.classList.remove('hidden')
      document.getElementById('total-count')!.textContent = `${data.count} transactions`
      document.getElementById('date-range-info')!.textContent = `${data.minDate} to ${data.maxDate}`
    }
  } catch {}
}

// --- Recurring Payments ---
let recurringData: RecurringPayment[] = []
let cancelledData: CancelledSubscription[] = []
let cancelledDescriptions = new Set<string>()
let currentFreqFilter = 'all'
let sortKey = 'occurrences'
let sortAsc = false

async function fetchRecurring() {
  try {
    const [recRes, canRes] = await Promise.all([
      fetch('/api/recurring'),
      fetch('/api/recurring/savings')
    ])
    recurringData = await recRes.json()
    const savings = await canRes.json()
    cancelledData = savings.items || []
    cancelledDescriptions = new Set(cancelledData.map((c: CancelledSubscription) => c.description))
    renderSavingsBanner(savings)
    renderRecurringSummary()
    renderRecurringTable()
    renderCancelledTable()
  } catch {}
}

function renderSavingsBanner(savings: { totalAnnualSavings: number; totalMonthlySavings: number; count: number; items: CancelledSubscription[] }) {
  const el = document.getElementById('savings-banner')!
  if (savings.count === 0) { el.classList.add('hidden'); return }
  el.classList.remove('hidden')
  el.innerHTML = `
    <div class="savings-icon">💰</div>
    <div class="savings-text">
      <div class="savings-headline">You're saving <span class="savings-amount">${fmt(-savings.totalAnnualSavings)}</span>/year
        <span class="savings-monthly">(${fmt(-savings.totalMonthlySavings)}/month)</span>
        by cancelling <strong>${savings.count}</strong> subscription${savings.count !== 1 ? 's' : ''}
      </div>
      <div class="savings-items">${savings.items.map((i: CancelledSubscription) => `<span class="savings-chip">${i.description} · ${fmt(-i.annualSavings)}/yr</span>`).join('')}</div>
    </div>
  `
}

function renderRecurringSummary() {
  const el = document.getElementById('recurring-summary')!
  const monthly = recurringData.filter(r => r.frequency === 'monthly')
  const annual = recurringData.filter(r => r.frequency === 'annual')
  const quarterly = recurringData.filter(r => r.frequency === 'quarterly')
  const weekly = recurringData.filter(r => r.frequency === 'weekly')

  const monthlyTotal = monthly.reduce((s, r) => s + r.averageAmount, 0)
  const annualFromMonthly = monthlyTotal * 12
  const annualDirect = annual.reduce((s, r) => s + r.averageAmount, 0)
  const annualFromQuarterly = quarterly.reduce((s, r) => s + r.averageAmount * 4, 0)
  const annualFromWeekly = weekly.reduce((s, r) => s + r.averageAmount * 52, 0)
  const totalAnnual = annualFromMonthly + annualDirect + annualFromQuarterly + annualFromWeekly

  el.innerHTML = `
    <div class="stat expenses"><span class="stat-label">Monthly Recurring</span><span class="stat-value">${fmt(monthlyTotal)}</span></div>
    <div class="stat net"><span class="stat-label">Annual Recurring (est.)</span><span class="stat-value">${fmt(totalAnnual)}</span></div>
    <div class="stat income"><span class="stat-label">Recurring Patterns</span><span class="stat-value">${recurringData.length}</span></div>
  `
}

function renderRecurringTable() {
  const tbody = document.querySelector('#recurring-table tbody')!
  tbody.innerHTML = ''

  let filtered = currentFreqFilter === 'all' ? recurringData : recurringData.filter(r => r.frequency === currentFreqFilter)

  // Sort
  filtered.sort((a, b) => {
    const av = (a as any)[sortKey]
    const bv = (b as any)[sortKey]
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
    return sortAsc ? cmp : -cmp
  })

  for (const r of filtered) {
    if (cancelledDescriptions.has(r.description)) continue
    const tr = document.createElement('tr')
    tr.style.cursor = 'pointer'
    const amtClass = r.averageAmount < 0 ? 'negative' : 'positive'
    tr.innerHTML = `
      <td>${r.description}</td>
      <td>${r.category}</td>
      <td><span class="freq-badge freq-${r.frequency}">${r.frequency}</span></td>
      <td class="${amtClass}">${fmt(r.averageAmount)}</td>
      <td>${r.lastDate}</td>
      <td>${r.nextExpectedDate}</td>
      <td>${r.occurrences}</td>
      <td><button class="cancel-btn" data-desc="${r.description.replace(/"/g, '&quot;')}">Cancel</button></td>
    `
    tr.querySelector('.cancel-btn')!.addEventListener('click', (e) => {
      e.stopPropagation()
      handleCancel(r)
    })
    tr.addEventListener('click', () => showRecurringDetail(r))
    tbody.appendChild(tr)
  }
}

function showRecurringDetail(r: RecurringPayment) {
  const el = document.getElementById('recurring-detail')!
  el.classList.remove('hidden')
  document.getElementById('recurring-detail-title')!.textContent = `${r.description} — ${r.frequency} (${r.occurrences} occurrences)`
  const tbody = document.querySelector('#recurring-detail-table tbody')!
  tbody.innerHTML = ''
  for (const t of r.transactions) {
    const tr = document.createElement('tr')
    const cls = t.amount < 0 ? 'negative' : 'positive'
    tr.innerHTML = `<td>${t.date}</td><td>${t.description}</td><td class="${cls}">${fmt(t.amount)}</td>`
    tbody.appendChild(tr)
  }
}

async function handleCancel(r: RecurringPayment) {
  const btn = document.querySelector(`.cancel-btn[data-desc="${r.description.replace(/"/g, '&quot;')}"]`) as HTMLButtonElement
  if (!btn) return
  if (btn.dataset.confirm !== 'true') {
    btn.textContent = 'Confirm?'
    btn.classList.add('confirm')
    btn.dataset.confirm = 'true'
    setTimeout(() => { btn.textContent = 'Cancel'; btn.classList.remove('confirm'); btn.dataset.confirm = '' }, 3000)
    return
  }
  try {
    const res = await fetch('/api/recurring/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: r.description, averageAmount: r.averageAmount, frequency: r.frequency })
    })
    if (res.ok) fetchRecurring()
  } catch {}
}

async function handleUndo(id: string) {
  try {
    const res = await fetch(`/api/recurring/cancel/${id}`, { method: 'DELETE' })
    if (res.ok) fetchRecurring()
  } catch {}
}

function renderCancelledTable() {
  const section = document.getElementById('cancelled-section')!
  const tbody = document.querySelector('#cancelled-table tbody')!
  tbody.innerHTML = ''
  if (cancelledData.length === 0) { section.classList.add('hidden'); return }
  section.classList.remove('hidden')
  for (const c of cancelledData) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${c.description}</td>
      <td class="negative">${fmt(c.averageAmount)}/${c.frequency}</td>
      <td class="positive">${fmt(c.annualSavings)}/yr</td>
      <td>${new Date(c.cancelledAt).toLocaleDateString()}</td>
      <td><button class="undo-btn">Undo</button></td>
    `
    tr.querySelector('.undo-btn')!.addEventListener('click', () => handleUndo(c.id))
    tbody.appendChild(tr)
  }
}

document.getElementById('recurring-detail-close')!.addEventListener('click', () => {
  document.getElementById('recurring-detail')!.classList.add('hidden')
})

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    currentFreqFilter = (btn as HTMLElement).dataset.freq || 'all'
    renderRecurringTable()
  })
})

// Sortable columns
document.querySelectorAll('#recurring-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const key = (th as HTMLElement).dataset.sort!
    if (sortKey === key) sortAsc = !sortAsc
    else { sortKey = key; sortAsc = true }
    document.querySelectorAll('#recurring-table th.sortable').forEach(h => h.classList.remove('sort-asc', 'sort-desc'))
    th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc')
    renderRecurringTable()
  })
})

// Initial load
fetchStats()
fetchAndRender()
