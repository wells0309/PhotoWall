import { useEffect, useState, type CSSProperties } from 'react'
import type { Photo } from './api'
import './photoBackdrop.css'

const DEFAULT_COLORS = ['hsl(36 30% 58%)', 'hsl(102 19% 52%)']

// Read tiny samples from existing gallery images, never request a second copy.
function photoHues(image: HTMLImageElement): { hue: number; weight: number }[] {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 24
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  context.drawImage(image, 0, 0, 24, 24)
  const { data } = context.getImageData(0, 0, 24, 24)
  const buckets = Array.from({ length: 12 }, (_, index) => ({ hue: index * 30 + 15, weight: 0 }))
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
    const lightness = (max + min) / 2
    if (delta < 0.08 || lightness < 0.16 || lightness > 0.88) continue
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
    hue = (hue * 60 + 360) % 360
    buckets[Math.floor(hue / 30)].weight += delta
  }
  return buckets.filter(bucket => bucket.weight > 0)
}

export default function PhotoBackdrop({ photos }: { photos: Photo[] }) {
  const [colors, setColors] = useState(DEFAULT_COLORS)
  const sources = JSON.stringify(photos.slice(0, 4).map(photo => photo.displayUrl))
  useEffect(() => {
    setColors(DEFAULT_COLORS)
    const urls = new Set<string>((JSON.parse(sources) as string[]).map(source => new URL(source, window.location.href).href))
    const samples = new Map<string, ReturnType<typeof photoHues>>()
    const sample = (image: HTMLImageElement) => {
      if (!image.closest('.photo-wall') || !urls.has(image.src) || samples.has(image.src) || !image.complete || !image.naturalWidth) return
      try {
        samples.set(image.src, photoHues(image))
        const totals = new Map<number, number>()
        for (const buckets of samples.values()) for (const bucket of buckets) totals.set(bucket.hue, (totals.get(bucket.hue) || 0) + bucket.weight)
        const ranked = [...totals].sort((a, b) => b[1] - a[1])
        if (!ranked.length) return
        const primary = ranked[0][0]
        const secondary = ranked.find(([hue]) => Math.min(Math.abs(hue - primary), 360 - Math.abs(hue - primary)) >= 60)?.[0]
        setColors([`hsl(${primary} 26% 56%)`, secondary === undefined ? DEFAULT_COLORS[1] : `hsl(${secondary} 22% 54%)`])
      } catch { /* Cross-origin or unreadable images keep the quiet default palette. */ }
    }
    const onLoad = (event: Event) => { if (event.target instanceof HTMLImageElement) sample(event.target) }
    document.addEventListener('load', onLoad, true)
    document.querySelectorAll<HTMLImageElement>('.photo-wall img').forEach(sample)
    return () => document.removeEventListener('load', onLoad, true)
  }, [sources])

  return <div className="photo-backdrop" aria-hidden="true">
    <span className="photo-ambient photo-ambient-warm" style={{ backgroundColor: colors[0] } as CSSProperties} />
    <span className="photo-ambient photo-ambient-cool" style={{ backgroundColor: colors[1] } as CSSProperties} />
    <span className="photo-paper-grain" />
  </div>
}
