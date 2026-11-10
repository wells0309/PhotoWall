import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './uploadPreview.css'

type Preview = { file: File; url: string }
const MAX_BYTES = 25 * 1024 * 1024

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function UploadPreview({ files, disabled, onRemove, onClear }: {
  files: File[]; disabled: boolean; onRemove: (file: File) => void; onClear: () => void
}) {
  const urls = useRef(new Map<File, string>())
  const [previews, setPreviews] = useState<Preview[]>([])
  const [openFile, setOpenFile] = useState<File | null>(null)

  useEffect(() => {
    const retained = new Set(files)
    for (const [file, url] of urls.current) {
      if (!retained.has(file)) { URL.revokeObjectURL(url); urls.current.delete(file) }
    }
    setPreviews(files.map(file => {
      let url = urls.current.get(file)
      if (!url) { url = URL.createObjectURL(file); urls.current.set(file, url) }
      return { file, url }
    }))
  }, [files])

  useEffect(() => {
    const ownedUrls = urls.current
    return () => {
      for (const url of ownedUrls.values()) URL.revokeObjectURL(url)
      ownedUrls.clear()
    }
  }, [])

  const visible = previews.filter(preview => files.includes(preview.file))
  const openIndex = visible.findIndex(preview => preview.file === openFile)
  return <section className="upload-preview full" aria-label="待上传照片预览">
    <div className="upload-preview-heading">
      <div><strong>待上传 · {files.length} 张</strong><p>点击照片放大查看，确认后再上传。</p></div>
      <button type="button" className="button" disabled={disabled} onClick={onClear}>清空选择</button>
    </div>
    <ul className="upload-preview-grid">
      {visible.map(preview => <PreviewCard key={preview.url} preview={preview} disabled={disabled}
        onOpen={() => setOpenFile(preview.file)} onRemove={() => onRemove(preview.file)} />)}
    </ul>
    {openIndex >= 0 && <PreviewDialog previews={visible} index={openIndex}
      onNavigate={index => setOpenFile(visible[index].file)} onClose={() => setOpenFile(null)} />}
  </section>
}

function PreviewCard({ preview: { file, url }, disabled, onOpen, onRemove }: {
  preview: Preview; disabled: boolean; onOpen: () => void; onRemove: () => void
}) {
  const [failed, setFailed] = useState(false)
  const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name)
  return <li className="upload-preview-card">
    <div className="upload-preview-image">
      <button type="button" className="upload-preview-open" onClick={onOpen} disabled={failed} aria-label={`放大预览 ${file.name}`}>
        {failed ? <span className="upload-preview-failed">无法预览此文件<br />请检查图片是否完整</span>
          : <><img src={url} alt={file.name} onError={() => setFailed(true)} /><span className="upload-preview-zoom">放大查看 ↗</span></>}
      </button>
      {isGif && <span className="upload-preview-gif">GIF 动图</span>}
      <button type="button" className="upload-preview-remove" disabled={disabled} onClick={onRemove} aria-label={`移除 ${file.name}`}>×</button>
    </div>
    <div className="upload-preview-caption"><strong title={file.name}>{file.name}</strong>
      <small>{fileSize(file.size)}{isGif ? ' · 动图预览' : ''}</small>
      {file.size > MAX_BYTES && <span className="upload-preview-warning">超过 25MB，请移除后重新选择</span>}
    </div>
  </li>
}

function PreviewDialog({ previews, index, onNavigate, onClose }: {
  previews: Preview[]; index: number; onNavigate: (index: number) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { file, url } = previews[index]
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const move = (direction: number) => onNavigate((index + direction + previews.length) % previews.length)

  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(<dialog ref={dialog} className="upload-preview-dialog" aria-label="上传前照片预览"
    onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    }}>
    <div className="upload-preview-dialog-bar"><span>上传前预览 · {index + 1} / {previews.length}</span>
      <button type="button" autoFocus onClick={onClose} aria-label="关闭上传预览">×</button></div>
    <div className="upload-preview-stage">
      {previews.length > 1 && <button type="button" className="upload-preview-prev" aria-label="上一张待上传照片" onClick={() => move(-1)}>‹</button>}
      {failedUrl === url ? <p>无法预览此文件，请检查图片是否完整。</p> : <img src={url} alt={file.name} onError={() => setFailedUrl(url)} />}
      {previews.length > 1 && <button type="button" className="upload-preview-next" aria-label="下一张待上传照片" onClick={() => move(1)}>›</button>}
    </div>
    <div className="upload-preview-dialog-caption" aria-live="polite"><strong>{file.name}</strong><small>{fileSize(file.size)} · 仅预览，尚未上传</small></div>
  </dialog>, document.body)
}
