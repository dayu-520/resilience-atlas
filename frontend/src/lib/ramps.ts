import chroma from 'chroma-js'

export const RAMPS = [
  { name: 'Viridis', colors: ['#440154', '#31688e', '#35b779', '#fde725'] },
  { name: 'Blues', colors: ['#eff6ff', '#93c5fd', '#2563eb', '#172554'] },
  { name: 'Spectral', colors: ['#9e0142', '#f46d43', '#ffffbf', '#66c2a5', '#5e4fa2'] },
  { name: 'RdYlBu', colors: ['#a50026', '#fdae61', '#ffffbf', '#74add1', '#313695'] },
  { name: 'Reds', colors: ['#fff5f0', '#fcae91', '#fb6a4a', '#a50f15'] },
  { name: 'Greens', colors: ['#f7fcf5', '#a1d99b', '#41ab5d', '#00441b'] },
] as const

export function ramp(name: string) {
  const selected = RAMPS.find((item) => item.name === name) || RAMPS[0]
  return chroma.scale([...selected.colors])
}

export function rampCss(name: string) {
  const selected = RAMPS.find((item) => item.name === name) || RAMPS[0]
  return `linear-gradient(90deg, ${selected.colors.join(',')})`
}

export function equalBreaks(min: number, max: number, classes: number) {
  return Array.from({ length: classes }, (_, index) => min + ((index + 1) / classes) * (max - min))
}

export function quantileBreaks(values: number[], classes: number, min?: number, max?: number) {
  const sorted = values.filter(Number.isFinite).filter((value) => (min == null || value >= min) && (max == null || value <= max)).sort((a, b) => a - b)
  if (!sorted.length) return equalBreaks(min || 0, max || 1, classes)
  return Array.from({ length: classes }, (_, index) => sorted[Math.min(sorted.length - 1, Math.floor(((index + 1) / classes) * (sorted.length - 1)))])
}

export function manualBreaks(value: string, classes: number) {
  const values = value.split(/[\s,;]+/).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  return values.length === classes + 1 ? values.slice(1) : values.length === classes ? values : []
}

