import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PageFlip } from './vendor/page-flip'
import './journalFlip.css'

export type JournalFlipController = { turn: (direction: 'older' | 'newer') => void }
type Props = {
  months: number[]
  current: number
  single: boolean
  renderMonth: (month: number, side: 'left' | 'right' | 'single') => ReactNode
  onChange: (month: number) => void
  onBusy: (busy: boolean) => void
}

// React owns page content through portals; the engine exclusively owns page placement.
export default forwardRef<JournalFlipController, Props>(function JournalFlipBook(props, ref) {
  const holder = useRef<HTMLDivElement>(null)
  const engine = useRef<PageFlip | null>(null)
  const latest = useRef(props)
  latest.current = props
  const pages = useMemo(() => props.months.map(() => {
    const page = document.createElement('div')
    page.className = 'journal-flip-page'
    page.dataset.density = 'soft'
    return page
  }), [props.months])

  useImperativeHandle(ref, () => ({ turn(direction) {
    const book = engine.current
    if (!book) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const step = latest.current.single ? 1 : 2
      book.turnToPage(book.getCurrentPageIndex() + (direction === 'older' ? -step : step))
    } else if (direction === 'older') book.flipPrev('bottom')
    else book.flipNext('bottom')
  } }), [])

  useLayoutEffect(() => {
    const host = holder.current!
    let frame = 0, width = 0, height = 0
    const build = () => {
      const rect = host.getBoundingClientRect()
      const w = Math.floor(rect.width), h = Math.floor(rect.height)
      if (!w || !h || (w === width && h === height)) return
      width = w; height = h
      engine.current?.destroy()
      const root = document.createElement('div')
      root.className = 'journal-flip-engine'
      host.appendChild(root)
      const { current, single, months } = latest.current
      const book = new PageFlip(root, {
        width: single ? w : w / 2, height: h, size: 'fixed', autoSize: false,
        usePortrait: single, startPage: Math.max(0, months.indexOf(current)),
        flippingTime: 900, maxShadowOpacity: .32, drawShadow: true,
        mobileScrollSupport: true, clickEventForward: true,
        useMouseEvents: true,
        // Keep corners still until a mouse press or touch begins a turn.
        showPageCorners: false,
        disableFlipByClick: true, swipeDistance: 35,
      })
      engine.current = book
      book.on('flip', event => {
        const index = Number(event.data) + (book.getOrientation() === 'landscape' ? 1 : 0)
        const month = latest.current.months[index]
        if (month !== undefined) latest.current.onChange(month)
      })
      // A dragged corner is already lifting off the spine, so its decoration
      // must sit behind the turning leaf throughout the fold as well.
      book.on('changeState', event => latest.current.onBusy(event.data !== 'read'))
      book.loadFromHTML(pages)
      latest.current.onBusy(false)
    }
    build()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(build)
    })
    observer.observe(host)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); engine.current?.destroy(); engine.current = null }
  }, [pages, props.single])

  return <div ref={holder} className="journal-flip-holder"
    onMouseDownCapture={event => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) event.stopPropagation() }}
    onTouchStartCapture={event => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) event.stopPropagation() }}>
    {pages.map((element, index) => createPortal(props.renderMonth(props.months[index], props.single ? 'single' : index % 2 ? 'right' : 'left'), element, String(props.months[index])))}
  </div>
})
