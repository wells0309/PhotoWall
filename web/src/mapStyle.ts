import type { StyleSpecification } from 'maplibre-gl'
import { feature } from 'topojson-client'
import countries from 'world-atlas/countries-110m.json'
import type { Theme } from './Theme'

const topology = countries as any
const world = feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection
const LOCAL_SOURCE = 'photowall-local-world'

export function themedMapStyle(style: StyleSpecification, theme: Theme): StyleSpecification {
  if (theme === 'light') return style
  return { ...style, layers: style.layers.map(layer => {
    const name = `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`.toLowerCase()
    const paint: Record<string, unknown> = { ...layer.paint }
    switch (layer.type) {
      case 'background': paint['background-color'] = '#18251e'; break
      case 'fill': paint['fill-color'] = /water|ocean/.test(name) ? '#17343c'
        : /building/.test(name) ? '#3d4b3e' : /park|forest|wood|landcover/.test(name) ? '#263e2c' : '#28372c'; break
      case 'line': paint['line-color'] = /water/.test(name) ? '#365a5c'
        : /boundary|admin/.test(name) ? '#7b866d' : /casing/.test(name) ? '#1d2b22'
          : /motorway|trunk|primary/.test(name) ? '#9a9b6b' : '#65775f'; break
      case 'symbol':
        paint['text-color'] = '#cbd7bd'
        paint['text-halo-color'] = '#17231c'
        paint['text-halo-width'] = 1.2
        break
      case 'fill-extrusion': paint['fill-extrusion-color'] = '#3d4b3e'; break
      case 'raster':
        paint['raster-brightness-max'] = 0.48
        paint['raster-brightness-min'] = 0.04
        paint['raster-saturation'] = -0.6
        paint['raster-contrast'] = 0.15
        break
    }
    return { ...layer, paint } as typeof layer
  }) }
}

export function localMapStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      [LOCAL_SOURCE]: { type: 'geojson', data: world, attribution: 'Natural Earth' },
    },
    layers: [
      { id: 'local-ocean', type: 'background', paint: { 'background-color': '#9ebdca' } },
      { id: 'local-land', type: 'fill', source: LOCAL_SOURCE, paint: { 'fill-color': '#dce3c9' } },
      { id: 'local-borders', type: 'line', source: LOCAL_SOURCE, paint: { 'line-color': '#9bac95', 'line-width': 0.7 } },
    ],
  }
}

export async function onlineMapStyle(signal: AbortSignal): Promise<StyleSpecification> {
  const local = localMapStyle()
  const key = import.meta.env.VITE_TIANDITU_KEY?.trim()
  if (key) {
    // TianDiTu uses WGS84 coordinates, matching the coordinates stored in photos.
    const tileUrl = (layer: string) => `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(key)}`
    return {
      ...local,
      sources: {
        ...local.sources,
        streets: { type: 'raster', tiles: [tileUrl('vec')], tileSize: 256, minzoom: 1, maxzoom: 18, attribution: '© 天地图' },
        labels: { type: 'raster', tiles: [tileUrl('cva')], tileSize: 256, minzoom: 1, maxzoom: 18 },
      },
      layers: [...local.layers,
        { id: 'streets', type: 'raster', source: 'streets' },
        { id: 'labels', type: 'raster', source: 'labels' },
      ],
    }
  }
  const response = await fetch('https://tiles.openfreemap.org/styles/liberty', { signal })
  if (!response.ok) throw new Error(`Map style HTTP ${response.status}`)
  const style = await response.json() as StyleSpecification
  if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)) throw new Error('Invalid map style')
  // Keep bundled geography beneath online tiles so failures never erase the globe.
  return {
    ...style,
    projection: { type: 'globe' },
    sources: { ...local.sources, ...style.sources },
    layers: [
      ...style.layers.filter(layer => layer.type === 'background'),
      ...local.layers.filter(layer => layer.type !== 'background'),
      ...style.layers.filter(layer => layer.type !== 'background'),
    ],
  }
}
