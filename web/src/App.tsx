import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, getAlbums, getMe, getPhotos, login, logout, photoUrl, type Album, type Me, type Photo } from './api'
import Timeline from './Timeline'
import Admin from './Admin'
import { ThemeSwitch } from './Theme'
import PhotoBackdrop from './PhotoBackdrop'

const Places = lazy(() => import('./Places'))

const blankMe: Me = { authenticated: false, email: '', role: 'GUEST', csrfToken: '' }

function Brand() {
  return <Link className="brand" to="/" aria-label="时光相册首页">时光相册 <span className="brand-leaf">✿</span></Link>
}

function Header({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return <header className="site-header">
    <Brand />
    <div className="header-actions">
    <nav className="top-nav" aria-label="主导航">
      <NavLink to="/" end>首页</NavLink>
      <NavLink to="/albums">相册</NavLink>
      <a href="/#about">关于</a>
      {me.role === 'ADMIN' && <NavLink to="/admin">管理</NavLink>}
      {me.authenticated ? <button className="nav-text" onClick={onLogout}>退出</button> : <NavLink to="/login">登录</NavLink>}
    </nav>
    <ThemeSwitch />
    </div>
  </header>
}

function Footer() {
  return <footer className="site-footer" id="about"><span>时光相册</span><span>把日子，留在照片里。</span></footer>
}

function PageScrollReset() {
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
  return null
}

function BrowseHeading({ title, description }: { title: string; description: string }) {
  return <section className="hero"><h1>{title}</h1><p>{description}</p><span className="handwritten">生活很普通<br />但照片会让它发光</span></section>
}

function ModeTabs({ active }: { active: string }) {
  return <nav className="mode-tabs" aria-label="浏览方式">
    <Link className={active === 'wall' ? 'active' : ''} to="/?view=wall">照片墙</Link>
    <Link className={active === 'timeline' ? 'active' : ''} to="/?view=timeline">时间线</Link>
    <Link className={active === 'places' ? 'active' : ''} to="/?view=places">按地点</Link>
  </nav>
}

function PhotoCard({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  return <button className="photo-card" onClick={onOpen} aria-label={`查看照片 ${photo.title || photo.albumTitle}`}>
    <img src={photo.displayUrl} alt={photo.title || photo.city || '相册照片'} loading="lazy" />
    <span className="photo-caption"><strong>{photo.title || photo.albumTitle}</strong>
      <small>{[photo.takenAt?.replaceAll('-', '.'), photo.city].filter(Boolean).join(' · ')}</small>
    </span>
  </button>
}

function EmptyGallery({ admin }: { admin: boolean }) {
  return <div className="empty-gallery">
    <div className="empty-illustration"><span>✿</span><span>✦</span><span>◌</span></div>
    <h2>故事，就从第一张照片开始</h2>
    <p>{admin ? '在管理后台创建相册并上传照片，属于你的照片墙就会出现在这里。' : '这里还没有公开的照片。稍后再来看看吧。'}</p>
    {admin && <Link className="button button-primary" to="/admin">去上传照片</Link>}
  </div>
}

function Lightbox({ photos, index, onClose, onChange, admin }: { photos: Photo[]; index: number; onClose: () => void; onChange: (index: number) => void; admin: boolean }) {
  const photo = photos[index]
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onChange((index + 1) % photos.length)
      if (event.key === 'ArrowLeft') onChange((index + photos.length - 1) % photos.length)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onChange])
  if (!photo) return null
  return <div className="lightbox" role="dialog" aria-modal="true" aria-label="照片详情" onClick={onClose}>
    <button className="lightbox-close" onClick={onClose} aria-label="关闭">×</button>
    <button className="lightbox-arrow left" onClick={event => { event.stopPropagation(); onChange((index + photos.length - 1) % photos.length) }} aria-label="上一张">‹</button>
    <div className="lightbox-content" onClick={event => event.stopPropagation()}>
      <img src={photo.displayUrl} alt={photo.title || '照片'} />
      <div className="lightbox-info"><p className="eyebrow">{photo.albumTitle}</p><h2>{photo.title || '未命名的瞬间'}</h2>
        <p>{photo.description}</p><small>{[photo.capturedAt?.replace('T', ' ') || photo.takenAt, photo.city, photo.country].filter(Boolean).join(' · ')}</small>
        {admin && <a href={photoUrl(photo.id, true)} className="original-link">下载原图</a>}
      </div>
    </div>
    <button className="lightbox-arrow right" onClick={event => { event.stopPropagation(); onChange((index + 1) % photos.length) }} aria-label="下一张">›</button>
  </div>
}

function Wall({ photos, admin }: { photos: Photo[]; admin: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  return <>
    {photos.length ? <div className="photo-wall">{photos.map((photo, index) => <PhotoCard key={photo.id} photo={photo} onOpen={() => setOpen(index)} />)}</div> : <EmptyGallery admin={admin} />}
    {open !== null && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} onChange={setOpen} admin={admin} />}
  </>
}

function Explore({ photos, me }: { photos: Photo[]; me: Me }) {
  const [params] = useSearchParams()
  const view = params.get('view') || 'wall'
  const headings: Record<string, [string, string]> = {
    wall: ['把日子，留在照片里', '一些旅行，一些日常，一些值得被记住的瞬间。'],
    timeline: ['沿着时间，慢慢翻看', '每一段时光，都有自己的故事。'],
    places: ['走过的地方', '让照片带我回到那些地方。']
  }
  const selected = headings[view] ? view : 'wall'
  return <main className={`${selected === 'timeline' ? 'timeline-view' : selected === 'places' ? 'places-view' : 'wall-view'} page-enter`}>
    <BrowseHeading title={headings[selected][0]} description={headings[selected][1]} />
    <ModeTabs active={selected} />
    {selected === 'timeline' ? <Timeline photos={photos} canEdit={me.role === 'ADMIN'} /> : selected === 'places' ? <Suspense fallback={<div className="loading-view">正在打开旅行足迹…</div>}><Places photos={photos} /></Suspense> : <Wall photos={photos} admin={me.role === 'ADMIN'} />}
  </main>
}

function AlbumsPage({ albums, photos, me }: { albums: Album[]; photos: Photo[]; me: Me }) {
  return <main className="albums-view page-enter"><BrowseHeading title="每一本，都有故事" description="从一段旅程，到一个平凡的下午。" />
    <div className="album-browse-bar"><span>全部相册</span><small>{albums.length} 本相册</small></div>
    {albums.length ? <div className="album-grid">{albums.map(album => {
      const cover = photos.find(photo => photo.albumId === album.id)
      return <Link className="album-card" to={`/albums/${album.id}`} key={album.id}>
        <div className="album-cover">{cover ? <img src={cover.displayUrl} alt="" /> : <span>✿</span>}</div>
        <div className="album-meta"><h2>{album.title} {!album.isPublic && <span className="lock-label">◈ 受邀可见</span>}</h2><p>{album.description || '打开相册，看看收藏的时光。'}</p><small>{album.photoCount} 张照片</small></div>
      </Link>
    })}</div> : <EmptyGallery admin={me.role === 'ADMIN'} />}
  </main>
}

function AlbumDetail({ albums, photos, me }: { albums: Album[]; photos: Photo[]; me: Me }) {
  const { id } = useParams()
  const album = albums.find(item => item.id === Number(id))
  if (!album) return <main className="inner-page"><div className="empty-gallery"><h2>没有找到这个相册</h2><Link to="/albums">返回相册</Link></div></main>
  const items = photos.filter(photo => photo.albumId === album.id)
  return <main className="inner-page"><div className="page-heading"><Link className="back-link" to="/albums">← 返回相册</Link><h1>{album.title}</h1><p>{album.description}</p><small>{album.photoCount} 张照片 {!album.isPublic && '· 受邀可见'}</small></div><Wall photos={items} admin={me.role === 'ADMIN'} /></main>
}

function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await login(email, password); await onLogin(); navigate('/') }
    catch (ex) { setError((ex as Error).message) }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><div className="auth-card"><p className="eyebrow">WELCOME BACK</p><h1>回来看看这些时光</h1><p>管理员与受邀访客可以在这里登录。登录后七天内免登录，主动退出后失效。</p>
    <form onSubmit={submit}><label>邮箱<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>密码<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
    </form>
  </div></main>
}

function InvitePage({ me, onAccepted }: { me: Me; onAccepted: () => Promise<void> }) {
  const { token } = useParams()
  const [preview, setPreview] = useState<{ albumTitle: string; email: string; existingAccount: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  useEffect(() => { if (token) api<typeof preview>(`/api/invitations/preview?token=${encodeURIComponent(token)}`).then(setPreview).catch(ex => setError(ex.message)) }, [token])
  async function accept(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try {
      const result = await api<{ albumId: number }>('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token, password }) })
      if (preview && !preview.existingAccount) await login(preview.email, password)
      setDone(true); await onAccepted(); navigate(`/albums/${result.albumId}`)
    } catch (ex) { setError((ex as Error).message) }
  }
  return <main className="auth-page"><div className="auth-card"><p className="eyebrow">PRIVATE INVITATION</p><h1>一份只给你的邀请</h1>
    {preview && <><p>你受邀查看「{preview.albumTitle}」。邀请邮箱：{preview.email}</p>
      {preview.existingAccount && (!me.authenticated || me.email.toLowerCase() !== preview.email.toLowerCase())
        ? <p>请先使用受邀邮箱<Link to="/login">登录</Link>，再打开邀请链接。</p>
        : <form onSubmit={accept}>{!preview.existingAccount && <label>设置密码（至少 12 位）<input type="password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
          <button className="button button-primary">接受邀请</button></form>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}{done && <p>邀请已接受。</p>}
  </div></main>
}

export default function App() {
  const location = useLocation()
  const currentView = new URLSearchParams(location.search).get('view') || 'wall'
  const showPhotoBackdrop = location.pathname === '/' && !['timeline', 'places'].includes(currentView)
  const [me, setMe] = useState<Me>(blankMe)
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const current = await getMe()
    setMe(current)
    const [nextAlbums, nextPhotos] = await Promise.all([getAlbums(), getPhotos()])
    setAlbums(nextAlbums); setPhotos(nextPhotos)
  }, [])
  useEffect(() => { refresh().catch(ex => setError(ex.message)).finally(() => setLoading(false)) }, [refresh])
  async function signOut() { try { setMe(await logout()); await refresh() } catch (ex) { setError((ex as Error).message) } }
  return <div className="app-shell">{showPhotoBackdrop && <PhotoBackdrop photos={photos} />}<PageScrollReset /><Header me={me} onLogout={signOut} />
    {error && <div className="global-error" role="alert">{error} <button onClick={() => setError('')}>关闭</button></div>}
    {loading ? <main className="loading-view">正在打开相册…</main> : <Routes>
      <Route path="/" element={<Explore photos={photos} me={me} />} />
      <Route path="/albums" element={<AlbumsPage albums={albums} photos={photos} me={me} />} />
      <Route path="/albums/:id" element={<AlbumDetail albums={albums} photos={photos} me={me} />} />
      <Route path="/login" element={<LoginPage onLogin={refresh} />} />
      <Route path="/invite/:token" element={<InvitePage me={me} onAccepted={refresh} />} />
      <Route path="/admin" element={<Admin me={me} albums={albums} photos={photos} onChange={refresh} />} />
      <Route path="*" element={<main className="empty-gallery"><h2>页面不存在</h2><Link to="/">返回首页</Link></main>} />
    </Routes>}
    <Footer />
  </div>
}
