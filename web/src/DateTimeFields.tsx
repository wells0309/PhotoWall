import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './dateTimeFields.css'

type Kind = 'date' | 'time'
const weekDays = ['一', '二', '三', '四', '五', '六', '日']
const pad = (value: number) => String(value).padStart(2, '0')
const formattedDate = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

export default function DateTimeFields({ date, time, onDateChange, onTimeChange }: {
  date: string; time: string; onDateChange: (value: string) => void; onTimeChange: (value: string) => void
}) {
  const dateId = useId(), timeId = useId()
  const fields = useRef<HTMLDivElement>(null)
  const dateTrigger = useRef<HTMLInputElement>(null), timeTrigger = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Kind | null>(null)
  const [view, setView] = useState(() => new Date())
  const [draftTime, setDraftTime] = useState<[number, number, number]>([12, 0, 0])

  function show(kind: Kind) {
    if (kind === 'date') {
      const match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(date)
      setView(match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date())
    } else {
      const parts = time.split(':').map(Number)
      setDraftTime(parts.length >= 2 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2] || 0] : [12, 0, 0])
    }
    setOpen(kind)
  }

  return <div className="photo-time-fields full" ref={fields}>
    <div className="dtp-field"><label htmlFor={dateId}>拍摄日期</label>
      <div className="dtp-input-wrap"><input id={dateId} ref={dateTrigger} type="text" readOnly
        aria-haspopup="dialog" aria-expanded={open === 'date'} value={date} placeholder="请选择拍摄日期"
        onClick={() => show('date')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show('date') } }} />
        <span aria-hidden="true">▦</span></div><small className="field-hint">留空时尝试读取照片拍摄日期</small></div>
    <div className="dtp-field"><label htmlFor={timeId}>拍摄时间</label>
      <div className="dtp-input-wrap"><input id={timeId} ref={timeTrigger} type="text" readOnly
        aria-haspopup="dialog" aria-expanded={open === 'time'} value={time} placeholder="请选择拍摄时间"
        onClick={() => show('time')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show('time') } }} />
        <span aria-hidden="true">◷</span></div><small className="field-hint">填写时间时请同时填写日期；按原始当地时间读取</small></div>
    {open && createPortal(<Picker kind={open} view={view} setView={setView} selectedDate={date}
      draftTime={draftTime} setDraftTime={setDraftTime} anchor={fields.current!} trigger={(open === 'date' ? dateTrigger : timeTrigger).current!}
      onClose={() => setOpen(null)} onClear={() => { (open === 'date' ? onDateChange : onTimeChange)(''); setOpen(null) }}
      onSelectDate={value => { onDateChange(value); setOpen(null) }}
      onConfirmTime={() => { onTimeChange(draftTime.map(pad).join(':')); setOpen(null) }} />, document.body)}
  </div>
}

function Picker({ kind, view, setView, selectedDate, draftTime, setDraftTime, anchor, trigger, onClose, onClear, onSelectDate, onConfirmTime }: {
  kind: Kind; view: Date; setView: (value: Date) => void; selectedDate: string
  draftTime: [number, number, number]; setDraftTime: (value: [number, number, number]) => void
  anchor: HTMLDivElement; trigger: HTMLInputElement; onClose: () => void; onClear: () => void
  onSelectDate: (value: string) => void; onConfirmTime: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const yearPicker = useRef<HTMLDivElement>(null)
  const yearList = useRef<HTMLSelectElement>(null)
  const [, refreshPosition] = useState(0)
  const [yearListOpen, setYearListOpen] = useState(false)
  const year = view.getFullYear(), month = view.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const anchorBox = anchor.getBoundingClientRect()
  const triggerBox = trigger.getBoundingClientRect()
  const width = kind === 'date' ? 326 : 304
  const top = window.scrollY + anchorBox.bottom + 8
  const left = window.scrollX + Math.max(8, Math.min(triggerBox.left, window.innerWidth - width - 8))

  useEffect(() => {
    panel.current?.focus()
    const frame = requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'nearest' }))
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }
    function onOutside(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node) && event.target !== trigger) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside)
    const onResize = () => refreshPosition(value => value + 1)
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onOutside); window.removeEventListener('resize', onResize); trigger.focus({ preventScroll: true }) }
  }, [])

  useEffect(() => {
    if (!yearListOpen) return
    yearList.current?.focus({ preventScroll: true })
    function closeOnOutside(event: PointerEvent) {
      if (!yearPicker.current?.contains(event.target as Node)) setYearListOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [yearListOpen])

  return <div className="dtp-popover-layer">
    <div className="dtp-panel" ref={panel} tabIndex={-1} role="dialog" aria-label={kind === 'date' ? '选择拍摄日期' : '选择拍摄时间'}
      style={{ top, left, width }}>
      <div className="dtp-heading"><div><small>时光相册</small><strong>{kind === 'date' ? '选择拍摄日期' : '选择拍摄时间'}</strong></div><button type="button" onClick={onClose} aria-label="关闭选择器">×</button></div>
      {kind === 'date' ? <>
        <div className="dtp-calendar-nav">
          <button type="button" aria-label="上个月" onClick={() => setView(new Date(year, month - 1, 1))}>‹</button>
          <div><div className="dtp-year-picker" ref={yearPicker}>
            <button type="button" className="dtp-year-trigger" aria-label="年份" aria-haspopup="listbox" aria-expanded={yearListOpen} onClick={() => setYearListOpen(open => !open)}>{year} 年 <span aria-hidden="true" /></button>
            {yearListOpen && <select ref={yearList} className="dtp-year-list" aria-label="选择年份" size={10} value={year}
              onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setYearListOpen(false) } }}
              onChange={event => { setView(new Date(Number(event.target.value), month, 1)); setYearListOpen(false) }}>
              {Array.from({ length: Math.max(2100, year) - Math.min(1900, year) + 1 }, (_, i) => Math.min(1900, year) + i).map(value => <option value={value} key={value}>{value} 年</option>)}
            </select>}
          </div><select aria-label="月份" value={month} onChange={event => setView(new Date(year, Number(event.target.value), 1))}>{Array.from({ length: 12 }, (_, i) => <option value={i} key={i}>{i + 1} 月</option>)}</select></div>
          <button type="button" aria-label="下个月" onClick={() => setView(new Date(year, month + 1, 1))}>›</button>
        </div>
        <div className="dtp-calendar-grid">{weekDays.map(day => <span className="dtp-weekday" key={day}>{day}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: days }, (_, i) => { const value = formattedDate(year, month, i + 1); return <button type="button" className={selectedDate === value ? 'selected' : ''} aria-label={value} aria-pressed={selectedDate === value} key={value} onClick={() => onSelectDate(value)}>{i + 1}</button> })}
        </div>
      </> : <>
        <div className="dtp-time-preview">{draftTime.map(pad).join(':')}</div>
        <div className="dtp-time-columns">{([24, 60, 60] as const).map((count, part) => <div key={part}><label htmlFor={`dtp-${part}`}>{['时', '分', '秒'][part]}</label><select id={`dtp-${part}`} aria-label={['小时', '分钟', '秒钟'][part]} size={7} value={draftTime[part]} onChange={event => { const next = [...draftTime] as [number, number, number]; next[part] = Number(event.target.value); setDraftTime(next) }}>{Array.from({ length: count }, (_, i) => <option key={i} value={i}>{pad(i)}</option>)}</select></div>)}</div>
      </>}
      <div className="dtp-footer"><button type="button" onClick={onClear}>清除</button>{kind === 'date' ? <button type="button" onClick={() => onSelectDate(formattedDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))}>今天</button> : <button type="button" className="dtp-confirm" onClick={onConfirmTime}>确定</button>}</div>
    </div>
  </div>
}
