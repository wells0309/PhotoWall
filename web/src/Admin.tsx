import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, getStats, type AccessGrant, type Album, type Me, type Photo, type Stats } from './api'
import LocationPicker from './LocationPicker'
import UploadPreview from './UploadPreview'
import DateTimeFields from './DateTimeFields'
import './adminPhotoEditor.css'

type PhotoForm = {
  title: string; description: string; takenAt: string; takenTime: string; country: string; city: string;
  latitude: string; longitude: string; visibility: 'PUBLIC' | 'PRIVATE'
}
type ParsedPhoto = { takenAt: string | null; capturedAt: string | null; country: string; city: string; latitude: number | null; longitude: number | null; approximatePlace: boolean }
const emptyPhoto: PhotoForm = { title: '', description: '', takenAt: '', takenTime: '', country: '', city: '', latitude: '', longitude: '', visibility: 'PUBLIC' }
function fromPhoto(photo: Photo): PhotoForm {
  return { title: photo.title, description: photo.description, takenAt: photo.takenAt || '', takenTime: photo.capturedAt?.slice(11, 19) || '',
    country: photo.country, city: photo.city, latitude: photo.latitude?.toString() || '',
    longitude: photo.longitude?.toString() || '', visibility: photo.visibility }
}
function photoPayload(form: PhotoForm) {
  const { takenTime, ...fields } = form
  return { ...fields, takenAt: form.takenAt || null, capturedAt: form.takenAt && takenTime ? `${form.takenAt}T${takenTime}` : null,
    latitude: form.latitude === '' ? null : Number(form.latitude),
    longitude: form.longitude === '' ? null : Number(form.longitude) }
}

export default function Admin({ me, albums, photos, onChange }: { me: Me; albums: Album[]; photos: Photo[]; onChange: () => Promise<void> }) {
  const [tab, setTab] = useState<'photos' | 'albums' | 'access'>('photos')
  const [albumId, setAlbumId] = useState<number | null>(null)
  const [creatingAlbum, setCreatingAlbum] = useState(false)
  const [albumTitle, setAlbumTitle] = useState('')
  const [albumDescription, setAlbumDescription] = useState('')
  const [albumPublic, setAlbumPublic] = useState(true)
  const [files, setFiles] = useState<File[]>([])
  const [parsed, setParsed] = useState<Record<number, ParsedPhoto | string>>({})
  const metadataCache = useRef(new WeakMap<File, ParsedPhoto>())
  const [uploadForm, setUploadForm] = useState<PhotoForm>(emptyPhoto)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<PhotoForm>(emptyPhoto)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  const album = albums.find(item => item.id === albumId)
  const albumPhotos = useMemo(() => photos.filter(photo => photo.albumId === albumId).sort((a, b) => a.sortOrder - b.sortOrder), [photos, albumId])

  useEffect(() => { if (!creatingAlbum && !albumId && albums[0]) setAlbumId(albums[0].id) }, [albums, albumId, creatingAlbum])
  useEffect(() => { setEditId(null) }, [albumId])
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setParsed({})
    void (async () => {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        let result: ParsedPhoto | string
        const cached = metadataCache.current.get(file)
        if (cached) result = cached
        else if (file.size > 25 * 1024 * 1024) result = '文件超过 25MB，请重新选择'
        else {
          const form = new FormData(); form.set('file', file)
          try {
            result = await api<ParsedPhoto>('/api/admin/photos/metadata', { method: 'POST', body: form, signal: controller.signal })
            metadataCache.current.set(file, result)
          }
          catch { result = '预览解析失败，上传时将再次尝试读取' }
        }
        if (cancelled) return
        setParsed(current => ({ ...current, [index]: result }))
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [files])
  useEffect(() => {
    if (!album) return
    setAlbumTitle(album.title); setAlbumDescription(album.description); setAlbumPublic(album.isPublic)
  }, [album?.id, album?.title, album?.description, album?.isPublic])
  useEffect(() => { if (me.role === 'ADMIN') getStats().then(setStats).catch(() => {}) }, [me.role, photos.length])
  useEffect(() => {
    if (albumId && me.role === 'ADMIN') api<AccessGrant[]>(`/api/admin/albums/${albumId}/access`).then(setGrants).catch(() => setGrants([]))
  }, [albumId, me.role, tab])

  if (me.role !== 'ADMIN') return <main className="inner-page"><div className="empty-gallery"><h2>只有管理员可以进入</h2><p>请使用管理员账号登录。</p><Link to="/login" className="button button-primary">去登录</Link></div></main>

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try { await action(); await onChange(); setStats(await getStats()); setNotice(success) }
    catch (ex) { setError((ex as Error).message) }
    finally { setBusy(false) }
  }

  async function createAlbum(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const result = await api<{ id: number }>('/api/admin/albums', { method: 'POST', body: JSON.stringify({ title: albumTitle, description: albumDescription, isPublic: albumPublic }) })
      setAlbumId(result.id)
      setCreatingAlbum(false)
    }, '相册已创建')
  }

  async function saveAlbum(event: FormEvent) {
    event.preventDefault(); if (!albumId) return
    await run(async () => { await api(`/api/admin/albums/${albumId}`, { method: 'PUT', body: JSON.stringify({ title: albumTitle, description: albumDescription, isPublic: albumPublic }) }) }, '相册已保存')
  }

  async function deleteAlbum() {
    if (!albumId || !window.confirm('确定删除这个空相册吗？')) return
    await run(async () => { await api(`/api/admin/albums/${albumId}`, { method: 'DELETE' }); setAlbumId(null) }, '相册已删除')
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!albumId || !files.length) { setError('请先选择相册和照片'); return }
    if (uploadForm.takenTime && !uploadForm.takenAt) { setError('填写拍摄时间时，请先选择拍摄日期'); return }
    if (files.some(file => file.size > 25 * 1024 * 1024)) { setError('部分照片超过 25MB，请先移除后再上传'); return }
    await run(async () => {
      for (const file of files) {
        const form = new FormData()
        form.set('albumId', String(albumId)); form.set('file', file)
        for (const [key, value] of Object.entries(uploadForm)) if (key !== 'takenTime') form.set(key, value)
        if (uploadForm.takenAt && uploadForm.takenTime) form.set('capturedAt', `${uploadForm.takenAt}T${uploadForm.takenTime}`)
        await api('/api/admin/photos', { method: 'POST', body: form })
      }
      setFiles([])
    }, `已上传 ${files.length} 张照片`)
  }

  function selectFiles(incoming: File[]) {
    if (busy) return
    const supported = incoming.filter(file => ['image/jpeg', 'image/png', 'image/gif'].includes(file.type) || /\.(jpe?g|png|gif)$/i.test(file.name))
    if (supported.length !== incoming.length) setError('仅支持 JPG、PNG 和 GIF，其他文件未加入上传列表')
    setFiles(current => {
      const next = [...current]
      for (const file of supported) {
        if (!next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified && item.type === file.type)) next.push(file)
      }
      return next
    })
  }

  async function savePhoto(event: FormEvent) {
    event.preventDefault(); if (!editId) return
    if (editForm.takenTime && !editForm.takenAt) { setError('填写拍摄时间时，请先选择拍摄日期'); return }
    await run(async () => { await api(`/api/admin/photos/${editId}`, { method: 'PUT', body: JSON.stringify(photoPayload(editForm)) }); setEditId(null) }, '照片资料已保存')
  }

  async function deletePhoto(id: number) {
    if (!window.confirm('确定永久删除这张照片及服务器上的原图吗？')) return
    await run(async () => { await api(`/api/admin/photos/${id}`, { method: 'DELETE' }); if (editId === id) setEditId(null) }, '照片已删除')
  }

  async function reorder(ids: number[]) {
    if (!albumId) return
    await run(async () => { await api('/api/admin/photos/reorder', { method: 'PUT', body: JSON.stringify({ albumId, photoIds: ids }) }) }, '顺序已更新')
  }

  async function move(id: number, direction: -1 | 1) {
    const ids = albumPhotos.map(photo => photo.id)
    const index = ids.indexOf(id), next = index + direction
    if (next < 0 || next >= ids.length) return
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    await reorder(ids)
  }

  function drop(event: DragEvent, targetId: number) {
    event.preventDefault()
    if (dragId === null || dragId === targetId) return
    const ids = albumPhotos.map(photo => photo.id).filter(id => id !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    setDragId(null); void reorder(ids)
  }

  async function invite(event: FormEvent) {
    event.preventDefault(); if (!albumId) return
    let alreadyGranted = false
    await run(async () => {
      const result = await api<{ granted: boolean; token?: string }>(`/api/admin/albums/${albumId}/invitations`, { method: 'POST', body: JSON.stringify({ email: inviteEmail }) })
      alreadyGranted = result.granted
      setInviteLink(result.token ? `${window.location.origin}/invite/${result.token}` : '')
      setInviteEmail('')
      setGrants(await api<AccessGrant[]>(`/api/admin/albums/${albumId}/access`))
    }, '邀请已生成')
    if (alreadyGranted) setNotice('已有账号，已直接授予访问权限')
  }

  async function revoke(userId: number) {
    if (!albumId || !window.confirm('确定撤销这位访客的访问权限吗？')) return
    await run(async () => { await api(`/api/admin/albums/${albumId}/access/${userId}`, { method: 'DELETE' }); setGrants(await api<AccessGrant[]>(`/api/admin/albums/${albumId}/access`)) }, '权限已撤销')
  }

  return <main className="admin-page"><div className="admin-heading"><div><p className="eyebrow">YOUR SPACE</p><h1>管理时光相册</h1><p>在电脑或手机上，整理值得留下的瞬间。</p></div>
    {stats && <div className="storage-stat"><span>照片空间</span><strong>{(stats.usedBytes / 1024 ** 3).toFixed(2)} / {(stats.quotaBytes / 1024 ** 3).toFixed(0)} GB</strong><div><i style={{ width: `${Math.min(100, stats.usedBytes / stats.quotaBytes * 100)}%` }} /></div></div>}
  </div>
  {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="form-notice" role="status">{notice}</div>}
  <div className="admin-tabs" aria-label="管理功能"><button aria-pressed={tab === 'photos'} className={tab === 'photos' ? 'active' : ''} onClick={() => setTab('photos')}>照片</button><button aria-pressed={tab === 'albums'} className={tab === 'albums' ? 'active' : ''} onClick={() => setTab('albums')}>相册</button><button aria-pressed={tab === 'access'} className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>邀请与权限</button></div>
  <div className="admin-layout"><aside className="admin-sidebar"><h2>选择相册</h2>{albums.map(item => <button key={item.id} className={item.id === albumId ? 'selected' : ''} onClick={() => { setCreatingAlbum(false); setAlbumId(item.id) }}>{item.title}<small>{item.photoCount} 张</small></button>)}
    <button className="sidebar-add" onClick={() => { setTab('albums'); setCreatingAlbum(true); setAlbumId(null); setAlbumTitle(''); setAlbumDescription(''); setAlbumPublic(true) }}>＋ 新建相册</button></aside>
    <div className="admin-main">
    <div className="admin-tab-content" key={tab}>
      {tab === 'albums' && <section className="admin-panel"><h2>{album ? '编辑相册' : '新建相册'}</h2><form onSubmit={album ? saveAlbum : createAlbum} className="form-grid">
        <label className="full">相册名称<input value={albumTitle} onChange={e => setAlbumTitle(e.target.value)} required maxLength={80} placeholder="例如：春天的旅行" /></label>
        <label className="full">相册说明<textarea value={albumDescription} onChange={e => setAlbumDescription(e.target.value)} maxLength={2000} rows={3} /></label>
        <label className="switch-label full"><input type="checkbox" checked={albumPublic} onChange={e => setAlbumPublic(e.target.checked)} />公开相册<span>关闭后仅受邀访客可见</span></label>
        <div className="form-actions full"><button disabled={busy} className="button button-primary">{album ? '保存相册' : '创建相册'}</button>{album && <button type="button" className="button button-danger" onClick={deleteAlbum}>删除空相册</button>}</div>
      </form></section>}
      {tab === 'photos' && <><section className="admin-panel"><h2>上传照片</h2>{album ? <form onSubmit={upload} className="form-grid">
        <label className="upload-zone full" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFiles(Array.from(e.dataTransfer.files)) }}>
          <span className="upload-icon">＋</span><strong>{files.length ? '继续添加照片或动图' : '拖入照片或动图，或点击选择'}</strong><small>支持 JPG、PNG、GIF 动图；可批量上传，单张不超过 25MB</small><input type="file" disabled={busy} aria-label="选择待上传照片" accept="image/jpeg,image/png,image/gif,.jpg,.jpeg,.png,.gif" multiple onChange={e => { selectFiles(Array.from(e.target.files || [])); e.target.value = '' }} /></label>
        {files.length > 0 && <UploadPreview files={files} disabled={busy} onRemove={file => setFiles(current => current.filter(item => item !== file))} onClear={() => setFiles([])} />}
        {files.length > 0 && <div className="metadata-preview full" aria-live="polite"><strong>自动解析结果</strong><p>每张照片分别读取拍摄时间与 GPS。地点名称优先读取照片信息，否则离线估算附近城市；没有附带的信息可在下方补充。</p>{files.map((file, index) => {
          const info = parsed[index]
          return <div className="metadata-preview-row" key={`${index}-${file.name}`}><strong>{file.name}</strong>{!info ? <span>正在解析…</span> : typeof info === 'string' ? <span>{info}</span> : <><span>{info.capturedAt?.replace('T', ' ') || info.takenAt || '未附带拍摄时间'}</span><span>{[info.country, info.city].filter(Boolean).join(' · ') || '未附带地点名称'}{info.approximatePlace ? '（附近城市）' : ''}</span><span>{info.latitude !== null && info.longitude !== null ? `纬度 ${info.latitude.toFixed(6)} · 经度 ${info.longitude.toFixed(6)}` : '未附带 GPS 坐标'}</span></>}</div>
        })}</div>}
        <p className="field-hint full">以下日期、时间与地点可选填；批量上传时，填写的内容将统一覆盖所选照片的对应信息。留空则保留逐张自动解析的结果。</p>
        <PhotoFields form={uploadForm} setForm={setUploadForm} publicAlbum={album.isPublic} />
        <div className="form-actions full"><button disabled={busy || !files.length || files.some(file => file.size > 25 * 1024 * 1024)} className="button button-primary">{busy ? '正在上传…' : `上传 ${files.length || ''} 张照片`}</button></div>
      </form> : <p>请先创建一个相册。</p>}</section>
      {album && <section className="admin-panel"><div className="panel-heading"><h2>整理照片</h2><small>电脑可拖动排序，手机可用上下按钮</small></div>
        {albumPhotos.length ? <div className="admin-photo-list">{albumPhotos.map((photo, index) => <div className="admin-photo-item" key={photo.id}>
          <div className={`admin-photo-row${editId === photo.id ? ' is-editing' : ''}`} draggable={!busy && editId !== photo.id} onDragStart={() => setDragId(photo.id)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, photo.id)}>
          <img src={photo.displayUrl} alt="" /><div><strong>{photo.title || `照片 ${index + 1}`}</strong><small>{photo.takenAt || '未填写日期'} · {photo.city || '未填写地点'} · {photo.visibility === 'PRIVATE' ? '受邀可见' : '公开'}</small></div>
          <div className="row-actions"><button onClick={() => move(photo.id, -1)} disabled={index === 0 || busy} aria-label="上移">↑</button><button onClick={() => move(photo.id, 1)} disabled={index === albumPhotos.length - 1 || busy} aria-label="下移">↓</button><button disabled={busy} aria-expanded={editId === photo.id} aria-controls={`photo-editor-${photo.id}`} onClick={() => { if (editId === photo.id) setEditId(null); else { setEditId(photo.id); setEditForm(fromPhoto(photo)) } }}>{editId === photo.id ? '收起' : '编辑'}</button><button className="danger-text" onClick={() => deletePhoto(photo.id)}>删除</button></div>
          </div>
          {editId === photo.id && <section id={`photo-editor-${photo.id}`} className="edit-panel photo-inline-editor" aria-labelledby={`photo-editor-heading-${photo.id}`}>
            <h3 id={`photo-editor-heading-${photo.id}`}>编辑照片 · {photo.title || `照片 ${index + 1}`}</h3>
            <form onSubmit={savePhoto} className="form-grid"><PhotoFields form={editForm} setForm={setEditForm} publicAlbum={album.isPublic} /><div className="form-actions full"><button disabled={busy} className="button button-primary">{busy ? '正在保存…' : '保存照片'}</button><button type="button" disabled={busy} className="button" onClick={() => setEditId(null)}>取消</button></div></form>
          </section>}
        </div>)}</div> : <p>这个相册还没有照片。</p>}
      </section>}</>}
      {tab === 'access' && <><section className="admin-panel"><h2>邀请访客</h2>{album ? <><p>邀请指定邮箱查看「{album.title}」。公开相册中的私密照片也只对获得邀请的人显示。</p>
        <form onSubmit={invite} className="form-grid"><label className="full">访客邮箱<input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="friend@example.com" /></label><div className="form-actions full"><button className="button button-primary" disabled={busy}>生成邀请</button></div></form>
        {inviteLink && <div className="invite-link"><span>将此链接发给受邀者（7 天内有效）</span><input readOnly value={inviteLink} onFocus={e => e.target.select()} /><button className="button" onClick={() => navigator.clipboard.writeText(inviteLink).then(() => setNotice('邀请链接已复制'))}>复制链接</button></div>}
      </> : <p>请先选择相册。</p>}</section>
      {album && <section className="admin-panel"><h2>已有访问权限</h2>{grants.length ? <div className="grant-list">{grants.map(grant => <div key={grant.id}><span>{grant.email}</span><button onClick={() => revoke(grant.id)}>撤销权限</button></div>)}</div> : <p>暂时没有受邀访客。</p>}</section>}</>}
    </div></div></div>
  </main>
}

function PhotoFields({ form, setForm, publicAlbum }: { form: PhotoForm; setForm: (form: PhotoForm) => void; publicAlbum: boolean }) {
  const set = (field: keyof PhotoForm, value: string) => setForm({ ...form, [field]: value })
  return <>
    <label className="full">标题<input value={form.title} onChange={e => set('title', e.target.value)} maxLength={120} placeholder="给这个瞬间起个名字" /></label>
    <DateTimeFields date={form.takenAt} time={form.takenTime} onDateChange={value => set('takenAt', value)} onTimeChange={value => set('takenTime', value)} />
    <label className="full">照片说明<textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} maxLength={4000} placeholder="写一点当时的故事…" /></label>
    <label>国家或地区<input value={form.country} onChange={e => set('country', e.target.value)} maxLength={80} placeholder="例如：中国" /></label>
    <LocationPicker value={form.city} onChange={value => set('city', value)} onSelect={place => setForm({ ...form, country: place.country, city: place.label, latitude: String(place.latitude), longitude: String(place.longitude) })} />
    <div className="coordinate-row full"><label>纬度<input type="number" step="any" min={-90} max={90} value={form.latitude} onChange={e => set('latitude', e.target.value)} /></label><label>经度<input type="number" step="any" min={-180} max={180} value={form.longitude} onChange={e => set('longitude', e.target.value)} /></label><small>选取地点填入的是城市或区县参考点，不等于真实拍摄位置；有准确 GPS 时可在此手动填写。</small></div>
    <label>可见范围<select value={publicAlbum ? form.visibility : 'PRIVATE'} disabled={!publicAlbum} onChange={e => set('visibility', e.target.value)}><option value="PUBLIC">所有访客公开</option><option value="PRIVATE">仅受邀访客</option></select></label>
  </>
}
