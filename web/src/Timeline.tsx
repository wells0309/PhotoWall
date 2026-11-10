import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { api, type Photo } from './api'
import SeasonalScenery, { WinterBookSnow } from './SeasonalScenery'
import { seasonForMonth } from './season'
import JournalFlipBook, { type JournalFlipController } from './JournalFlipBook'
import './timelineFlip.css'
import './journalBook.css'

type MonthNote = { month: string; title: string; body: string }
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const monthTitles = ['新的一年，慢慢记录', '把相聚，留在相册里', '春日的故事，悄悄开始', '把日常，拍成喜欢的样子', '寻常日子，也有微光', '和夏天，打个照面', '把热爱，留在镜头里', '日子很长，回忆很亮', '风景在路上，故事在心里', '把秋天，藏进照片里', '日子慢慢，回忆满满', '岁末，留一份温暖']
const monthBodies: Record<number, string> = {
  9: '山间的风，街角的光，\n都成了这个十月温柔的注脚。',
  10: '走过熟悉的街道，也遇见新的风景。\n平凡的小事，拼成值得珍藏的时光。',
  11: '把日子里的片刻温柔，\n好好收进这一年的相册。',
}
const seasonNames = { spring: 'SPRING', summer: 'SUMMER', autumn: 'AUTUMN', winter: 'WINTER' }
function monthOf(date: string) {
  const [year, month] = date.split('-').map(Number)
  return year * 12 + month - 1
}
function monthLabel(index: number) {
  const year = Math.floor(index / 12), month = index % 12
  return { year, month, key: `${year}-${String(month + 1).padStart(2, '0')}`, text: `${year} · ${month + 1} 月` }
}

export default function Timeline({ photos, canEdit = false }: { photos: Photo[]; canEdit?: boolean }) {
  const dated = useMemo(() => photos.filter(photo => photo.takenAt && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(photo.takenAt))
    .sort((a, b) => a.takenAt!.localeCompare(b.takenAt!) || a.sortOrder - b.sortOrder || a.id - b.id), [photos])
  const bounds = useMemo(() => dated.length ? [Math.min(...dated.map(photo => monthOf(photo.takenAt!))), Math.max(...dated.map(photo => monthOf(photo.takenAt!)))] : null, [dated])
  const [singlePage, setSinglePage] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [current, setCurrent] = useState<number | null>(null)
  const [turning, setTurning] = useState(false)
  const flipBook = useRef<JournalFlipController>(null)
  const months = useMemo(() => {
    if (!bounds) return []
    const start = singlePage ? bounds[0] : bounds[0] - ((bounds[1] - bounds[0]) % 2 === 0 ? 1 : 0)
    return Array.from({ length: bounds[1] - start + 1 }, (_, index) => start + index)
  }, [bounds, singlePage])
  const [openPhoto, setOpenPhoto] = useState<Photo | null>(null)
  const [notes, setNotes] = useState<MonthNote[]>([])
  const [editing, setEditing] = useState<MonthNote | null>(null)
  const [saveError, setSaveError] = useState('')
  const [notesError, setNotesError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => {
      setSinglePage(media.matches)
      setTurning(false)
      if (!media.matches && bounds) setCurrent(value => value === null ? value : bounds[1] - 2 * Math.floor((bounds[1] - value) / 2))
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [bounds])
  useEffect(() => {
    const controller = new AbortController()
    api<MonthNote[]>('/api/timeline-notes', { signal: controller.signal }).then(value => {
      setNotes(value); setNotesError('')
    }).catch(error => { if (!controller.signal.aborted) setNotesError((error as Error).message) })
    return () => controller.abort()
  }, [canEdit])
  useEffect(() => {
    if (!openPhoto && !editing) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpenPhoto(null); if (!saving) setEditing(null) }
      if (!openPhoto || editing || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault()
      const index = dated.findIndex(photo => photo.id === openPhoto.id)
      setOpenPhoto(dated[(index + (event.key === 'ArrowLeft' ? -1 : 1) + dated.length) % dated.length])
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [openPhoto, editing, saving, dated])
  useEffect(() => { if (bounds) setCurrent(bounds[1]) }, [bounds?.[0], bounds?.[1]])

  async function saveNote(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    setSaving(true); setSaveError('')
    try {
      const saved = await api<MonthNote>(`/api/admin/timeline-notes/${editing.month}`, { method: 'PUT', body: JSON.stringify(editing) })
      setNotes(value => [...value.filter(note => note.month !== saved.month), saved])
      setEditing(null); setNotesError('')
    } catch (error) { setSaveError((error as Error).message) }
    finally { setSaving(false) }
  }
  if (!bounds || current === null) return <section className="timeline-empty"><div className="empty-gallery"><h2>时间会从这里开始</h2><p>给照片填写拍摄日期，它们就会出现在时间线上。</p></div></section>
  const page = monthLabel(current)
  const oldestVisible = singlePage ? current : current - 1
  const canOlder = oldestVisible > bounds[0]
  const canNewer = current < bounds[1]
  function change(direction: 'older' | 'newer') {
    if (turning || current === null || !bounds) return
    if (direction === 'older' ? !canOlder : !canNewer) return
    flipBook.current?.turn(direction)
  }
  function nextPhoto(direction: number) {
    if (!openPhoto) return
    const index = dated.findIndex(photo => photo.id === openPhoto.id)
    setOpenPhoto(dated[(index + direction + dated.length) % dated.length])
  }
  function renderMonth(index: number, side: 'left' | 'right' | 'single') {
    const { year, month, key } = monthLabel(index)
    const items = dated.filter(photo => photo.takenAt!.startsWith(key))
    const note = notes.find(item => item.month === key) || { month: key,
      title: items.length ? monthTitles[month] : '故事，慢慢发生',
      body: items.length ? monthBodies[month] || '一些旅行，一些日常，\n一些值得被记住的瞬间。' : '这个月的故事，等一张照片来开启。' }
    const columns = items.length <= 1 ? 1 : items.length <= 4 ? 2 : items.length <= 9 ? 3 : items.length <= 16 ? 4 : 5
    const rows = Math.max(1, Math.ceil(items.length / columns))
    return <article className="journal-page" key={key} data-side={side} data-season={seasonForMonth(month + 1)} data-density={items.length <= 2 ? 'sparse' : items.length <= 8 ? 'medium' : 'dense'} aria-label={`${year}年${monthNames[month]}，${items.length}张照片`}>
      {seasonForMonth(month + 1) === 'winter' && <WinterBookSnow />}
      <header className="journal-heading"><span className="journal-year">{year} / {seasonNames[seasonForMonth(month + 1)]}</span><div className="journal-heading-month"><time dateTime={key}>{monthNames[month]}</time><small>{items.length ? `${items.length} 张照片` : '暂无照片'}</small></div><span className="journal-heading-line" /></header>
      <div className="journal-photo-area">
        <div className="journal-tape journal-tape-left" aria-hidden="true" /><div className="journal-tape journal-tape-right" aria-hidden="true" />
        {items.length ? <div className="journal-mosaic" style={{ '--mosaic-columns': columns, '--mosaic-rows': rows } as CSSProperties} aria-label={`${monthNames[month]}全部${items.length}张照片`}>
          {items.map(photo => <button type="button" className="mosaic-photo" key={photo.id} aria-label={`放大照片 ${photo.title || photo.albumTitle}`} title={[photo.takenAt, photo.title].filter(Boolean).join(' · ')} onClick={() => setOpenPhoto(photo)}>
            <img src={photo.displayUrl} alt={photo.title || '时光照片'} loading={Math.abs(index - (current ?? index)) <= 3 ? 'eager' : 'lazy'} draggable={false} /><span className="mosaic-zoom" aria-hidden="true">⌕</span>
          </button>)}
        </div> : <div className="journal-empty"><span aria-hidden="true">✧</span><small>等待新的故事</small></div>}
      </div>
      <div className="journal-note">
        {canEdit && <button type="button" className="edit-month-note" onClick={() => { setSaveError(''); setEditing({ ...note }) }} aria-label={`编辑${monthNames[month]}文案`}>编辑文案</button>}
        {note.title && <h3>{note.title}</h3>}{note.body && <p>{note.body}</p>}
      </div>
      <span className="journal-page-number" aria-hidden="true">{String(month + 1).padStart(2, '0')} / {year}</span>
    </article>
  }
  const season = seasonForMonth(page.month + 1)
  const firstPage = monthLabel(current - 1)
  const range = singlePage ? page.text : firstPage.year === page.year
    ? `${page.year} · ${firstPage.month + 1}—${page.month + 1} 月`
    : `${firstPage.year} · ${firstPage.month + 1} 月—${page.year} · ${page.month + 1} 月`
  return <section className="timeline-section" data-season={season}>
    <SeasonalScenery season={season} />
    <div className="book-toolbar"><button disabled={!canOlder || !!turning} onClick={() => change('older')}>← 更早的时光</button><span>{range}</span><button disabled={!canNewer || !!turning} onClick={() => change('newer')}>更新的时光 →</button></div>
    <div className="journal-book-stage">
      <div className="timeline-page timeline-collage-book journal-book journal-interactive-book" data-single={singlePage} aria-label={`${range}书页`} aria-busy={turning}>
        <JournalFlipBook ref={flipBook} months={months} current={current} single={singlePage} renderMonth={renderMonth} onChange={setCurrent} onBusy={setTurning} />
      </div>
    </div>
    <div className="book-bottom collage-book-bottom"><button aria-label="上一页，更早的时光" disabled={!canOlder || !!turning} onClick={() => change('older')}>‹</button><div><span>{range}</span><small>拖动书页边角翻页 · 点击照片放大</small>{canEdit && notesError && <small className="note-load-error">月度文案加载失败：{notesError}</small>}</div><button aria-label="下一页，更新的时光" disabled={!canNewer || !!turning} onClick={() => change('newer')}>›</button></div>
    {openPhoto && <div className="timeline-photo-overlay" role="dialog" aria-modal="true" aria-label={openPhoto.title || '时光照片'} onClick={() => setOpenPhoto(null)}>
      <button className="lightbox-close" aria-label="关闭照片" onClick={() => setOpenPhoto(null)} autoFocus>×</button>
      <button className="lightbox-arrow left" aria-label="上一张照片" onClick={event => { event.stopPropagation(); nextPhoto(-1) }}>‹</button>
      <figure onClick={event => event.stopPropagation()}><img src={openPhoto.displayUrl} alt={openPhoto.title || '时光照片'} /><figcaption><strong>{openPhoto.title || openPhoto.albumTitle}</strong><small>{[openPhoto.capturedAt?.replace('T', ' ') || openPhoto.takenAt, openPhoto.city].filter(Boolean).join(' · ')}</small><p>{openPhoto.description}</p></figcaption></figure>
      <button className="lightbox-arrow right" aria-label="下一张照片" onClick={event => { event.stopPropagation(); nextPhoto(1) }}>›</button>
    </div>}
    {editing && <div className="month-note-overlay" role="dialog" aria-modal="true" aria-label="编辑月度文案">
      <form className="month-note-form" onSubmit={saveNote}><h2>{editing.month.replace('-', ' 年 ')} 月的文案</h2><p>文案会展示在该月照片墙的对侧，访客可随时间线查看。</p>
        <label>标题<input autoFocus maxLength={80} value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label>
        <label>正文<textarea rows={4} maxLength={1000} value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} /></label>
        {saveError && <div className="form-error" role="alert">{saveError}</div>}
        <div className="form-actions"><button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>取消</button><button className="button button-primary" disabled={saving}>{saving ? '正在保存…' : '保存文案'}</button></div>
      </form>
    </div>}
  </section>
}
