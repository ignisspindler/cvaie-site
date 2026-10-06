import * as THREE from 'three'
import { FIELD } from '../config.js'

// SVG artwork -> dense X/Z sample grid -> one tile per opaque sample.
//
// The raster is a measuring device, not an asset: it exists only so we can ask
// the vector artwork "what colour and opacity are you at this coordinate?".
// Nothing here ever reaches the screen as a texture.

/**
 * Rasterize the SVG offscreen and hand back its raw RGBA field.
 *
 * The artwork carries a viewBox but no width/height, which some browsers refuse
 * to rasterize at an explicit size, so we inject them before decoding.
 */
export async function loadSVGSampleMap(url = FIELD.svgUrl, raster = FIELD.RASTER) {
  const markup = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${url}: ${r.status}`)
    return r.text()
  })

  const sized = /<svg[^>]*\swidth=/.test(markup)
    ? markup
    : markup.replace(/<svg\b/, `<svg width="${raster}" height="${raster}"`)

  const blob = new Blob([sized], { type: 'image/svg+xml' })
  const src = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error(`Could not decode ${url}`))
      img.src = src
    })

    const canvas = document.createElement('canvas')
    canvas.width = raster
    canvas.height = raster
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, raster, raster)
    ctx.drawImage(img, 0, 0, raster, raster)
    return ctx.getImageData(0, 0, raster, raster)
  } finally {
    URL.revokeObjectURL(src)
  }
}

const keyColor = (hex) => {
  const c = new THREE.Color(hex)
  return [c.r * 255, c.g * 255, c.b * 255]
}

/**
 * Walk the sample grid and keep every cell the artwork actually paints.
 *
 * Each cell is box-averaged over its own pixel block rather than point-sampled.
 * The trace is posterized into 29 hard colour bands, and point sampling on hard
 * edges aliases into speckle; averaging also alpha-weights the colour so edge
 * tiles take the shape's colour instead of a blend with empty space.
 *
 * Mapping, so the logo reads upright in the opening top-down frame: the camera
 * looks down -Y with no yaw, which puts world -Z at the top of the screen and
 * +X to the right. So SVG v=0 (artwork top) maps to -Z, u=0 maps to -X.
 */
export function sampleTiles(imageData, cfg = FIELD) {
  const { GRID_RESOLUTION: n, ALPHA_THRESHOLD, worldSize, backgroundKey } = cfg
  const { data, width, height } = imageData

  const spacing = worldSize / n
  const reject = backgroundKey ? keyColor(backgroundKey.color) : null
  const tolerance = (backgroundKey?.tolerance ?? 0) * 255

  const base = []
  const colors = []
  const uvs = []
  let dropped = 0

  for (let gz = 0; gz < n; gz++) {
    const y0 = Math.floor((gz / n) * height)
    const y1 = Math.max(y0 + 1, Math.floor(((gz + 1) / n) * height))

    for (let gx = 0; gx < n; gx++) {
      const x0 = Math.floor((gx / n) * width)
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) / n) * width))

      let r = 0, g = 0, b = 0, a = 0, weight = 0, samples = 0
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * width + px) * 4
          const alpha = data[i + 3]
          r += data[i] * alpha
          g += data[i + 1] * alpha
          b += data[i + 2] * alpha
          weight += alpha
          a += alpha
          samples++
        }
      }

      const coverage = a / (samples * 255)
      if (coverage < ALPHA_THRESHOLD || weight === 0) continue

      const cr = r / weight
      const cg = g / weight
      const cb = b / weight

      if (reject &&
          Math.abs(cr - reject[0]) <= tolerance &&
          Math.abs(cg - reject[1]) <= tolerance &&
          Math.abs(cb - reject[2]) <= tolerance) {
        dropped++
        continue
      }

      const u = (gx + 0.5) / n
      const v = (gz + 0.5) / n
      base.push((u - 0.5) * worldSize, (v - 0.5) * worldSize)
      // sRGB bytes -> linear working space, or the logo renders washed out.
      const c = new THREE.Color().setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace)
      colors.push(c.r, c.g, c.b)
      uvs.push(u, v)
    }
  }

  const logoCount = base.length / 2
  if (!logoCount) throw new Error('Sampled no tiles -- check ALPHA_THRESHOLD and the artwork')

  const tileSize = spacing * (1 - cfg.TILE_GAP)
  const sizes = new Array(logoCount).fill(tileSize)

  // Ground beyond the artwork's north edge, in the logo's own dark navy, so the
  // surface carries on into the valley instead of stopping at the ridge. No
  // alpha mask here: it is land, so every cell is filled.
  const land = cfg.land
  let landCount = 0
  if (land) {
    const clear = land.clear
    const landSpacing = spacing * land.pitchMultiplier
    const landTile = landSpacing * (1 - cfg.TILE_GAP)
    const c = new THREE.Color().setStyle(land.color).convertSRGBToLinear()
    const rows = Math.max(0, Math.round((land.maxZ - land.minZ) / landSpacing))
    const cols = Math.max(0, Math.round((land.halfWidth * 2) / landSpacing))
    for (let r = 0; r < rows; r++) {
      const z = land.minZ + (r + 0.5) * landSpacing
      for (let q = 0; q < cols; q++) {
        const x = -land.halfWidth + (q + 0.5) * landSpacing
        // The town gets the ground to itself: a mosaic laid over the buildings
        // buries them.
        if (clear && x > clear.minX && x < clear.maxX && z > clear.minZ && z < clear.maxZ) continue
        base.push(x, z)
        colors.push(c.r, c.g, c.b)
        uvs.push(0, 0)
        sizes.push(landTile)
        landCount++
      }
    }
  }

  const count = base.length / 2
  return {
    count,
    logoCount,
    landCount,
    spacing,
    tileSize,
    base: new Float32Array(base),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    sizes: new Float32Array(sizes),
    phases: Float32Array.from({ length: count }, () => Math.random() * Math.PI * 2),
    coverage: logoCount / (n * n),
    droppedToBackgroundKey: dropped,
  }
}

/**
 * Tile geometry, isolated so shape experiments stay local.
 *
 * Every shape must lie in XY with +Z normal: the surface shader treats
 * `position.xy` as the tile's in-plane offsets and rebuilds the basis from the
 * height field's gradient, so a tile that carries its own Z or normal breaks.
 */
export function buildTileGeometry(shape = FIELD.TILE_SHAPE) {
  switch (shape) {
    case 'circle':
      return new THREE.CircleGeometry(0.5, 10)
    case 'hex':
      return new THREE.CircleGeometry(0.5, 6)
    case 'square':
    default:
      return new THREE.PlaneGeometry(1, 1)
  }
}

/** Convenience: sample map + tiles in one await. */
export async function buildTileField(cfg = FIELD) {
  return sampleTiles(await loadSVGSampleMap(cfg.svgUrl, cfg.RASTER), cfg)
}
