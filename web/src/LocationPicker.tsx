import { useEffect, useId, useRef, useState } from 'react'
import { api } from './api'
import './locationPicker.css'

export type LocationResult = { id: string; country: string; label: string; name: string; level: 'province' | 'city' | 'district'; latitude: number; longitude: number }

export default function LocationPicker({ value, onChange, onSelect }: {
  value: string; onChange: (value: string) => void; onSelect: (place: LocationResult) => void
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<LocationResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(-1)
  useEffect(() => {
    if (!open) return
    setActive(-1); setResults([]); setError('')
    if (!value.trim()) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      api<LocationResult[]>(`/api/admin/locations?query=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        .then(items => { if (!controller.signal.aborted) setResults(items) })
        .catch(ex => { if (!controller.signal.aborted) setError((ex as Error).message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 220)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [value, open])

  function choose(place: LocationResult) { setOpen(false); setActive(-1); onSelect(place) }

  return <div className="location-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }}>
    <label htmlFor={id}>地点（城市／区县）</label>
    <div className="location-search-row">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`}
        aria-activedescendant={open && active >= 0 && results[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off" maxLength={80} value={value} placeholder="例如：杭州 西湖区、北京 朝阳区"
        onFocus={() => setOpen(true)} onChange={event => { onChange(event.target.value); setOpen(true) }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setOpen(false); return }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true)
            if (results.length) setActive(index => event.key === 'ArrowDown' ? (index + 1) % results.length : index < 0 ? results.length - 1 : (index - 1 + results.length) % results.length)
          }
          if (event.key === 'Enter') { event.preventDefault(); if (open && results[active]) choose(results[active]); else setOpen(true) }
        }} />
      <button type="button" className="button" onClick={() => setOpen(true)}>搜索地点</button>
    </div>
    <small className="field-hint">支持区县名或“省 市 区县”组合搜索，选择结果后填入参考坐标。</small>
    {open && <div className="location-results">
      <div id={`${id}-results`} role="listbox" aria-label="城市和区县搜索结果" aria-busy={loading}>
        {results.map((place, index) => <button type="button" role="option" id={`${id}-option-${index}`} key={place.id}
          aria-selected={active === index} className={active === index ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => choose(place)}>
          <span><strong>{place.label}</strong><small>{place.country} · {place.level === 'district' ? '区县' : place.level === 'province' ? '省级地区' : '城市'}参考点</small></span>
          <span className="location-result-coordinate">{place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</span>
        </button>)}
      </div>
      {!results.length && <p role="status">{!value.trim() ? '输入城市或区县名称，重名地区可加上省市。' : loading ? '正在搜索…' : error || '未找到匹配地点，可补充省市名称，或手动填写经纬度。'}</p>}
    </div>}
  </div>
}
