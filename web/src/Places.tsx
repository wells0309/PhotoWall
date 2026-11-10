import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as GlobeMap, Marker, ScaleControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Photo } from './api'
import { localMapStyle, onlineMapStyle, themedMapStyle } from './mapStyle'
import { useTheme } from './Theme'
import GlobeStars from './GlobeStars'

setWorkerUrl(workerUrl)

type Place = { key: string; city: string; country: string; latitude: number; longitude: number; photos: Photo[] }
const WORLD_VIEW = { center: [105, 25] as [number, number], zoom: 0.8, pitch: 0, bearing: 0 }

function toPlaceList(photos: Photo[]): Place[] {
  const groups = new Map<string, Place>()
  for (const photo of photos) {
    if (!photo.city || photo.latitude == null || photo.longitude == null
      || !Number.isFinite(photo.latitude) || !Number.isFinite(photo.longitude)
      || Math.abs(photo.latitude) > 90 || Math.abs(photo.longitude) > 180) continue
    const key = `${photo.country}|${photo.city}`
    const existing = groups.get(key)
    if (existing) existing.photos.push(photo)
    else groups.set(key, { key, city: photo.city, country: photo.country,
      latitude: photo.latitude, longitude: photo.longitude, photos: [photo] })
  }
  return [...groups.values()].sort((a, b) => b.photos.length - a.photos.length)
}

export default function Places({ photos }: { photos: Photo[] }) {
  const { theme } = useTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme
  const lastMapTheme = useRef(theme)
  const baseStyle = useRef<StyleSpecification>(localMapStyle())
  const places = useMemo(() => toPlaceList(photos), [photos])
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GlobeMap | null>(null)
  const reloadStyle = useRef<() => void>(() => {})
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [zoom, setZoom] = useState(WORLD_VIEW.zoom)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [openPlace, setOpenPlace] = useState<Place | null>(null)
  const selected = places.find(place => place.key === selectedKey)

  useEffect(() => {
    if (!container.current) return
    let map: GlobeMap
    try {
      map = new GlobeMap({ container: container.current, style: themedMapStyle(baseStyle.current, themeRef.current), ...WORLD_VIEW,
        minZoom: 0, maxZoom: 19, attributionControl: { compact: true } })
    } catch {
      setMapError('地图无法启动，请检查浏览器是否支持 WebGL。')
      return
    }
    mapRef.current = map
    let request: AbortController | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    const loadOnline = async () => {
      request?.abort()
      clearTimeout(timeout)
      const controller = new AbortController()
      request = controller
      timeout = setTimeout(() => controller.abort(), 12000)
      setMapError('')
      try {
        const style = await onlineMapStyle(controller.signal)
        if (!disposed && request === controller) {
          baseStyle.current = style
          map.setStyle(themedMapStyle(style, themeRef.current))
        }
      } catch {
        if (!disposed && request === controller) setMapError('在线街道地图暂时无法连接，正在显示本地全球底图。')
      } finally {
        if (request === controller) clearTimeout(timeout)
      }
    }
    reloadStyle.current = () => { void loadOnline() }
    map.once('load', () => { void loadOnline() })
    map.on('style.load', () => {
      map.setProjection({ type: 'globe' })
      setMapReady(true)
    })
    map.on('zoom', () => setZoom(map.getZoom()))
    map.on('error', () => setMapError('部分街道地图未能加载，本地全球底图仍可浏览。'))
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(container.current)
    return () => {
      disposed = true; request?.abort(); clearTimeout(timeout)
      resize.disconnect(); map.remove(); mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (lastMapTheme.current === theme) return
    lastMapTheme.current = theme
    mapRef.current?.setStyle(themedMapStyle(baseStyle.current, theme))
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = places.map(place => {
      const pin = document.createElement('button')
      pin.type = 'button'
      pin.className = `place-map-pin${place.key === selectedKey ? ' selected' : ''}`
      pin.textContent = String(place.photos.length)
      pin.setAttribute('aria-label', `${place.city}，${place.photos.length} 张照片，查看照片`)
      pin.title = `${place.city} · ${place.photos.length} 张照片`
      pin.addEventListener('click', event => {
        event.stopPropagation(); setSelectedKey(place.key); setOpenPlace(place)
      })
      return new Marker({ element: pin }).setLngLat([place.longitude, place.latitude]).addTo(map)
    })
    return () => markers.forEach(marker => marker.remove())
  }, [places, selectedKey])

  useEffect(() => {
    if (!openPlace) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenPlace(null) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [openPlace])

  function focus(place: Place) {
    setSelectedKey(place.key)
    mapRef.current?.flyTo({ center: [place.longitude, place.latitude], zoom: 14, pitch: 0, bearing: 0, duration: 1800 })
  }

  return <section className="places-section">
    <div className="places-map-layout">
      {/* The opaque globe covers this sky; only empty space around it shows stars. */}
      <GlobeStars />
      <div ref={container} className="places-map" aria-label="旅行地球，可拖动旋转并缩放至城市和街道" />
      {!mapReady && !mapError && <div className="map-status" role="status">正在加载旅行地球…</div>}
      {mapError && <div className="map-status map-error" role="status">{mapError}<button type="button" onClick={() => reloadStyle.current()}>重试</button></div>}
      <div className="map-navigation" role="group" aria-label="地图导航">
        <button type="button" onClick={() => mapRef.current?.zoomIn()} disabled={zoom >= 19} aria-label="放大地图">+</button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} disabled={zoom <= 0} aria-label="缩小地图">−</button>
        <button type="button" className="map-world-button" onClick={() => { setSelectedKey(null); mapRef.current?.flyTo({ ...WORLD_VIEW, duration: 1400 }) }} aria-label="返回全球视图">◎</button>
      </div>
      <div className="map-explore-hint">拖动探索 · 滚轮或双指缩放至街道</div>
      {selected && <div className="map-place-detail">
        <strong>{selected.city}</strong><span>{selected.country} · {selected.photos.length} 张照片</span>
        <button type="button" onClick={() => setOpenPlace(selected)}>查看照片 ›</button>
      </div>}
      {places.length > 0 ? <div className="map-place-strip" aria-label="照片地点">
        {places.map(place => <button type="button" key={place.key} className={`map-place-card${place.key === selectedKey ? ' selected' : ''}`} onClick={() => focus(place)} aria-label={`飞往${place.city}，查看街道地图`}>
          <img src={place.photos[0].displayUrl} alt="" loading="lazy" />
          <span><strong>{place.city}</strong><small>{place.photos.length} 张照片 · 前往地点</small></span>
        </button>)}
      </div> : <div className="map-empty-note">上传照片并填写城市与坐标，点亮你的旅行足迹。</div>}
    </div>
    {openPlace && <div className="place-overlay" role="dialog" aria-modal="true" aria-label={`${openPlace.city}的照片`} onClick={() => setOpenPlace(null)}>
      <div className="place-drawer" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setOpenPlace(null)} aria-label="关闭">×</button>
        <p className="eyebrow">MEMORIES OF A PLACE</p><h2>{openPlace.city}</h2><p>{openPlace.country} · {openPlace.photos.length} 张照片</p>
        <div className="place-photo-grid">{openPlace.photos.map(photo => <figure key={photo.id}><img src={photo.displayUrl} alt={photo.title || openPlace.city} loading="lazy" /><figcaption>{photo.title || photo.takenAt || openPlace.city}</figcaption></figure>)}</div>
      </div>
    </div>}
  </section>
}
