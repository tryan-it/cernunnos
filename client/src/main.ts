import type { Transaction } from '../../shared/types.js'

const dropZone = document.getElementById('drop-zone')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const statusEl = document.getElementById('status')!
const txnSection = document.getElementById('transactions')!
const tbody = document.querySelector('#txn-table tbody')!

function showStatus(msg: string, type: 'success' | 'error') {
  statusEl.textContent = msg
  statusEl.className = type
}

function renderTransactions(txns: Transaction[]) {
  tbody.innerHTML = ''
  txnSection.classList.remove('hidden')

  for (const t of txns) {
    const tr = document.createElement('tr')
    const amtClass = t.amount < 0 ? 'negative' : 'positive'
    const amtStr = t.amount < 0
      ? `-$${Math.abs(t.amount).toFixed(2)}`
      : `$${t.amount.toFixed(2)}`

    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.description}</td>
      <td class="${amtClass}">${amtStr}</td>
      <td>${t.type}</td>
      <td>${t.source}</td>
      <td>${t.category ?? ''}</td>
    `
    tbody.appendChild(tr)
  }
}

async function uploadFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  form.append('account', file.name.replace('.csv', ''))

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()

    if (!res.ok) {
      showStatus(`Error: ${data.error}`, 'error')
      return
    }

    showStatus(`Imported ${data.count} transactions`, 'success')
    renderTransactions(data.transactions)
  } catch (err) {
    showStatus(`Upload failed: ${(err as Error).message}`, 'error')
  }
}

// Drag & drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('dragover')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover')
})

dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('dragover')
  const file = e.dataTransfer?.files[0]
  if (file) uploadFile(file)
})

dropZone.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) uploadFile(file)
})

// Load existing transactions on page load
async function loadTransactions() {
  try {
    const res = await fetch('/api/transactions')
    const txns: Transaction[] = await res.json()
    if (txns.length > 0) renderTransactions(txns)
  } catch {
    // Server might not be running yet
  }
}

loadTransactions()
