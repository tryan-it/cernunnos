import * as d3 from 'd3'
import type { Transaction } from '../../shared/types.js'

export interface WaterfallBar {
  label: string
  value: number
  start: number
  end: number
  type: 'income' | 'expense' | 'balance'
  count: number
  transactions: Transaction[]
}

function fmt(n: number): string {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `-$${s}` : `$${s}`
}

export function buildBars(transactions: Transaction[]): WaterfallBar[] {
  // Separate income vs expense
  const incomeMap = new Map<string, { total: number; count: number; txns: Transaction[] }>()
  const expenseMap = new Map<string, { total: number; count: number; txns: Transaction[] }>()

  for (const t of transactions) {
    const cat = t.category || 'Uncategorized'
    const map = t.amount >= 0 ? incomeMap : expenseMap
    const existing = map.get(cat)
    if (existing) {
      existing.total += t.amount
      existing.count++
      existing.txns.push(t)
    } else {
      map.set(cat, { total: t.amount, count: 1, txns: [t] })
    }
  }

  // Sort by absolute value descending
  const incomeCats = [...incomeMap.entries()].sort((a, b) => b[1].total - a[1].total)
  const expenseCats = [...expenseMap.entries()].sort((a, b) => a[1].total - b[1].total) // most negative first

  const bars: WaterfallBar[] = []
  let running = 0

  // Opening Balance
  bars.push({ label: 'Opening', value: 0, start: 0, end: 0, type: 'balance', count: 0, transactions: [] })

  // Income bars
  for (const [cat, data] of incomeCats) {
    const start = running
    running += data.total
    bars.push({ label: cat, value: data.total, start, end: running, type: 'income', count: data.count, transactions: data.txns })
  }

  // Expense bars
  for (const [cat, data] of expenseCats) {
    const start = running
    running += data.total
    bars.push({ label: cat, value: data.total, start, end: running, type: 'expense', count: data.count, transactions: data.txns })
  }

  // Closing Balance
  bars.push({ label: 'Closing', value: running, start: 0, end: running, type: 'balance', count: transactions.length, transactions })

  return bars
}

export function renderChart(
  container: HTMLElement,
  bars: WaterfallBar[],
  onBarClick: (bar: WaterfallBar) => void
) {
  // Clear
  container.innerHTML = ''
  if (bars.length <= 2) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem;">No transaction data to display</p>'
    return
  }

  const margin = { top: 20, right: 30, bottom: 100, left: 80 }
  const width = Math.max(container.clientWidth - margin.left - margin.right, bars.length * 60)
  const height = 420 - margin.top - margin.bottom

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Scales
  const x = d3.scaleBand()
    .domain(bars.map(b => b.label))
    .range([0, width])
    .padding(0.3)

  const allValues = bars.flatMap(b => [b.start, b.end])
  const yMin = Math.min(0, d3.min(allValues)! * 1.1)
  const yMax = Math.max(0, d3.max(allValues)! * 1.1)

  const y = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([height, 0])
    .nice()

  // Axes
  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-35)')
    .style('text-anchor', 'end')
    .style('font-size', '11px')

  svg.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => {
      const n = d as number
      if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`
      return `$${n.toFixed(0)}`
    }))

  // Zero line
  svg.append('line')
    .attr('x1', 0).attr('x2', width)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', '#444').attr('stroke-width', 1)

  // Tooltip
  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0)
    .style('display', 'none')

  // Bars with animation
  svg.selectAll('.bar')
    .data(bars)
    .enter()
    .append('rect')
    .attr('class', d => d.type === 'income' ? 'bar-income' : d.type === 'expense' ? 'bar-expense' : 'bar-balance')
    .attr('x', d => x(d.label)!)
    .attr('width', x.bandwidth())
    .attr('y', y(0))
    .attr('height', 0)
    .attr('rx', 3)
    .on('mouseover', (event, d) => {
      tooltip
        .style('display', 'block')
        .style('opacity', 1)
        .html(`
          <div class="tt-category">${d.label}</div>
          <div class="tt-amount" style="color:${d.type === 'income' ? '#2ecc71' : d.type === 'expense' ? '#e74c3c' : '#6c63ff'}">${fmt(d.value)}</div>
          <div class="tt-count">${d.count} transaction${d.count !== 1 ? 's' : ''}</div>
        `)
    })
    .on('mousemove', (event) => {
      const rect = container.getBoundingClientRect()
      tooltip
        .style('left', (event.clientX - rect.left + 12) + 'px')
        .style('top', (event.clientY - rect.top - 10) + 'px')
    })
    .on('mouseout', () => {
      tooltip.style('opacity', 0).style('display', 'none')
    })
    .on('click', (_event, d) => {
      if (d.type !== 'balance' || d.label === 'Closing') onBarClick(d)
    })
    .transition()
    .duration(600)
    .delay((_d, i) => i * 50)
    .attr('y', d => y(Math.max(d.start, d.end)))
    .attr('height', d => Math.abs(y(d.start) - y(d.end)))

  // Connector lines between bars
  for (let i = 0; i < bars.length - 1; i++) {
    const curr = bars[i]
    const next = bars[i + 1]
    const currEnd = curr.end
    const xCurr = x(curr.label)! + x.bandwidth()
    const xNext = x(next.label)!

    svg.append('line')
      .attr('class', 'connector')
      .attr('x1', xCurr)
      .attr('x2', xNext)
      .attr('y1', y(currEnd))
      .attr('y2', y(currEnd))
      .style('opacity', 0)
      .transition()
      .duration(400)
      .delay((i + 1) * 50 + 300)
      .style('opacity', 1)
  }

  // Value labels on bars
  svg.selectAll('.bar-label')
    .data(bars)
    .enter()
    .append('text')
    .attr('x', d => x(d.label)! + x.bandwidth() / 2)
    .attr('y', d => {
      const top = y(Math.max(d.start, d.end))
      return d.value >= 0 ? top - 5 : y(Math.min(d.start, d.end)) + 14
    })
    .attr('text-anchor', 'middle')
    .attr('fill', '#ccc')
    .attr('font-size', '10px')
    .style('opacity', 0)
    .text(d => fmt(d.value))
    .transition()
    .duration(400)
    .delay((_d, i) => i * 50 + 400)
    .style('opacity', 1)
}
