import * as d3 from 'd3'
import { sankey as d3Sankey, sankeyLinkHorizontal, type SankeyGraph, type SankeyLink, type SankeyNode } from 'd3-sankey'
import type { Transaction } from '../../shared/types.js'

interface NodeExtra { name: string; color: string }
interface LinkExtra { color: string }

type SNode = SankeyNode<NodeExtra, LinkExtra>
type SLink = SankeyLink<NodeExtra, LinkExtra>

function fmt(n: number): string {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `-$${s}` : `$${s}`
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%'
  return (value / total * 100).toFixed(1) + '%'
}

const INCOME_COLORS = ['#27ae60', '#2ecc71', '#1abc9c', '#16a085', '#00b894', '#55efc4']
const EXPENSE_COLORS = ['#e74c3c', '#e17055', '#d63031', '#ff7675', '#fab1a0', '#fdcb6e', '#e67e22', '#f39c12']
const SAVINGS_COLOR = '#6c5ce7'
const TOTAL_INCOME_COLOR = '#2ecc71'

export function buildSankeyData(transactions: Transaction[]) {
  const incomeMap = new Map<string, number>()
  const expenseMap = new Map<string, number>()

  for (const t of transactions) {
    const cat = t.category || 'Uncategorized'
    if (t.amount >= 0) {
      incomeMap.set(cat, (incomeMap.get(cat) || 0) + t.amount)
    } else {
      expenseMap.set(cat, (expenseMap.get(cat) || 0) + Math.abs(t.amount))
    }
  }

  const incomeCats = [...incomeMap.entries()].sort((a, b) => b[1] - a[1])
  const expenseCats = [...expenseMap.entries()].sort((a, b) => b[1] - a[1])
  const totalIncome = incomeCats.reduce((s, [, v]) => s + v, 0)
  const totalExpenses = expenseCats.reduce((s, [, v]) => s + v, 0)
  const netSavings = Math.max(0, totalIncome - totalExpenses)

  if (totalIncome === 0) return null

  // Build nodes: income cats, Total Income, [Net Savings], expense cats
  const nodes: NodeExtra[] = []
  const links: { source: number; target: number; value: number; color: string }[] = []

  // Income category nodes
  for (let i = 0; i < incomeCats.length; i++) {
    nodes.push({ name: incomeCats[i][0], color: INCOME_COLORS[i % INCOME_COLORS.length] })
  }

  // Total Income node
  const totalIncomeIdx = nodes.length
  nodes.push({ name: 'Total Income', color: TOTAL_INCOME_COLOR })

  // Links: income cats → Total Income
  for (let i = 0; i < incomeCats.length; i++) {
    links.push({ source: i, target: totalIncomeIdx, value: incomeCats[i][1], color: INCOME_COLORS[i % INCOME_COLORS.length] })
  }

  // Expense category nodes
  const expenseStartIdx = nodes.length
  for (let i = 0; i < expenseCats.length; i++) {
    nodes.push({ name: expenseCats[i][0], color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] })
  }

  // Links: Total Income → expense cats
  for (let i = 0; i < expenseCats.length; i++) {
    links.push({ source: totalIncomeIdx, target: expenseStartIdx + i, value: expenseCats[i][1], color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] })
  }

  // Net Savings node + link
  if (netSavings > 0) {
    const savingsIdx = nodes.length
    nodes.push({ name: 'Net Savings', color: SAVINGS_COLOR })
    links.push({ source: totalIncomeIdx, target: savingsIdx, value: netSavings, color: SAVINGS_COLOR })
  }

  return { nodes, links, totalIncome, totalExpenses, netSavings }
}

export function renderSankey(
  container: HTMLElement,
  transactions: Transaction[],
) {
  container.innerHTML = ''

  const data = buildSankeyData(transactions)
  if (!data) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem;">No income data to display</p>'
    return
  }

  const { nodes, links, totalIncome } = data

  const margin = { top: 20, right: 180, bottom: 20, left: 180 }
  const width = Math.max(container.clientWidth, 600) - margin.left - margin.right
  const height = Math.max(400, Math.max(nodes.length * 32, 420)) - margin.top - margin.bottom

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const sankeyLayout = d3Sankey<NodeExtra, LinkExtra>()
    .nodeId(((_d: any, i: number) => i) as any)
    .nodeWidth(20)
    .nodePadding(14)
    .nodeAlign((node) => {
      // Income cats = 0, Total Income = 1, Expenses/Savings = 2
      const n = node as SNode
      if (n.name === 'Total Income') return 1
      if (n.sourceLinks && n.sourceLinks.length > 0 && n.targetLinks && n.targetLinks.length === 0) return 0
      return 2
    })
    .extent([[0, 0], [width, height]])

  const graph = sankeyLayout({
    nodes: nodes.map(d => ({ ...d })),
    links: links.map(d => ({ ...d })),
  } as any) as unknown as SankeyGraph<NodeExtra, LinkExtra>

  // Tooltip
  const tooltip = d3.select(container)
    .append('div')
    .style('position', 'absolute')
    .style('background', 'rgba(20,20,40,0.95)')
    .style('border', '1px solid #444')
    .style('border-radius', '6px')
    .style('padding', '8px 12px')
    .style('color', '#fff')
    .style('font-size', '13px')
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('z-index', '10')

  // Links
  svg.append('g')
    .selectAll('path')
    .data(graph.links)
    .enter()
    .append('path')
    .attr('d', sankeyLinkHorizontal())
    .attr('fill', 'none')
    .attr('stroke', d => (d as any).color || '#555')
    .attr('stroke-opacity', 0.45)
    .attr('stroke-width', d => Math.max(1, d.width || 0))
    .on('mouseover', function (event, d) {
      d3.select(this).attr('stroke-opacity', 0.75)
      const src = (d.source as SNode).name
      const tgt = (d.target as SNode).name
      const val = d.value || 0
      tooltip
        .style('opacity', 1)
        .html(`<strong>${src} → ${tgt}</strong><br>${fmt(val)} · ${pct(val, totalIncome)}`)
    })
    .on('mousemove', (event) => {
      const rect = container.getBoundingClientRect()
      tooltip
        .style('left', (event.clientX - rect.left + 14) + 'px')
        .style('top', (event.clientY - rect.top - 14) + 'px')
    })
    .on('mouseout', function () {
      d3.select(this).attr('stroke-opacity', 0.45)
      tooltip.style('opacity', 0)
    })

  // Nodes
  svg.append('g')
    .selectAll('rect')
    .data(graph.nodes)
    .enter()
    .append('rect')
    .attr('x', d => d.x0!)
    .attr('y', d => d.y0!)
    .attr('width', d => d.x1! - d.x0!)
    .attr('height', d => Math.max(1, d.y1! - d.y0!))
    .attr('fill', d => d.color)
    .attr('rx', 3)
    .attr('opacity', 0.9)

  // Node labels
  svg.append('g')
    .selectAll('text')
    .data(graph.nodes)
    .enter()
    .append('text')
    .attr('x', d => {
      // Left side labels on the left, right side labels on the right
      if (d.x0! < width / 3) return d.x0! - 8
      if (d.x0! > width * 2 / 3) return d.x1! + 8
      return (d.x0! + d.x1!) / 2
    })
    .attr('y', d => (d.y0! + d.y1!) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', d => {
      if (d.x0! < width / 3) return 'end'
      if (d.x0! > width * 2 / 3) return 'start'
      return 'middle'
    })
    .attr('fill', '#fff')
    .attr('font-size', '12px')
    .attr('font-weight', d => d.name === 'Total Income' ? 'bold' : 'normal')
    .text(d => {
      const val = d.value || 0
      return `${d.name}  ${fmt(val)}  ${pct(val, totalIncome)}`
    })
}
