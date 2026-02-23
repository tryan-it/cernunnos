import type { Transaction } from '../../shared/types.js'
import { buildBars, renderChart, type WaterfallBar } from './waterfall.js'

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

function showExpanded(bar: WaterfallBar) {
  expandedEl.classList.remove('hidden')
  expandedTitle.textContent = `${bar.label} — ${fmt(bar.value)} (${bar.count} transactions)`
  expandedTbody.innerHTML = ''
  const sorted = [...bar.transactions].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    const tr = document.createElement('tr')
    const cls = t.amount < 0 ? 'negative' : 'positive'
    tr.innerHTML = `<td>${t.date}</td><td>${t.description}</td><td class="${cls}">${fmt(t.amount)}</td>`
    expandedTbody.appendChild(tr)
  }
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
    const bars = buildBars(txns)
    renderChart(chartEl, bars, showExpanded)
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
    showStatus(`Imported ${data.count} transactions`, 'success')
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

// Initial load
fetchAndRender()
