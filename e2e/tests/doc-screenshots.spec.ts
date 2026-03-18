/**
 * Documentation screenshots & animated GIFs generator.
 *
 * Run:   docker compose run --rm e2e npm run docs:screenshots
 * Output: /e2e/docs-assets/  (mounted volume → docs/assets/)
 *
 * Each test captures a specific feature for the user guide.
 * Videos are recorded per-test, then converted to GIF by the post-run script.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const ASSETS = path.join(__dirname, '..', 'docs-assets')

/** Wait until the map is fully loaded: canvas rendered + station data visible in KPI bar */
async function waitForMap(page: Page) {
  // 1. Wait for MapLibre canvas to exist
  await page.waitForSelector('canvas', { timeout: 30_000 })

  // 2. Wait for the GeoJSON API to return and stations to appear in KPI bar
  //    The KPIBar shows numbers > 0 when data is ready (e.g. "4 250" or "1 200 / 5 300")
  await page.waitForFunction(() => {
    const els = document.querySelectorAll('.font-mono')
    for (const el of els) {
      const text = el.textContent?.replace(/\s/g, '') ?? ''
      if (/\d{2,}/.test(text)) return true
    }
    return false
  }, { timeout: 45_000 })

  // 3. Wait for basemap tiles to load — MapLibre uses WebGL so we can't read pixels.
  //    Instead, wait for network idle (all tile fetches done) + generous buffer.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)
}

/** Wait for a page's main content to load (non-map pages) */
async function waitForPageData(page: Page) {
  // Wait for any loading spinner to disappear, or for actual content
  await page.waitForFunction(() => {
    // Check that page has meaningful content (not just a loading state)
    const body = document.body.innerText
    return body.length > 100 && !body.includes('Chargement')
  }, { timeout: 20_000 })
  await page.waitForTimeout(1000)
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(ASSETS, `${name}.png`), fullPage: false })
}

// ─── Configure video recording per test ───
test.use({
  video: { mode: 'on', size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
})

// ─────────────────────────────────────────────
//  1. CARTE — Vue d'ensemble
// ─────────────────────────────────────────────
test('01 - carte vue d\'ensemble', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await screenshot(page, '01-carte-overview')
})

// ─────────────────────────────────────────────
//  2. PANNEAU DE CONTROLE — Ouverture
// ─────────────────────────────────────────────
test('02 - panneau de controle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open right drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(500)

  // Expand Données section if not already open
  const donneesBtn = page.locator('button', { hasText: 'Données' })
  if (await donneesBtn.count() > 0) {
    const expanded = await donneesBtn.getAttribute('aria-expanded')
    if (expanded !== 'true') await donneesBtn.click()
    await page.waitForTimeout(300)
  }

  await screenshot(page, '02-panneau-controle')
})

// ─────────────────────────────────────────────
//  3. FILTRES — Classification toggle
// ─────────────────────────────────────────────
test('03 - filtres classification', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(300)

  // Expand Filtres section
  const filtresBtn = page.locator('button', { hasText: 'Filtres' })
  await filtresBtn.click()
  await page.waitForTimeout(500)

  // Click on TRES_BAS classification button
  const tresBas = page.locator('button[aria-pressed]', { hasText: 'Très bas' })
  if (await tresBas.count() > 0) {
    await tresBas.click()
    await page.waitForTimeout(1500) // Wait for map markers to update
  }

  await screenshot(page, '03-filtre-classification')
})

// ─────────────────────────────────────────────
//  4. CALQUES — Activation d'un calque zone
// ─────────────────────────────────────────────
test('04 - calques departements', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(300)

  // Expand Calques section
  const calquesBtn = page.locator('button', { hasText: 'Calques' })
  await calquesBtn.click()
  await page.waitForTimeout(300)

  // Click "Départements" checkbox
  const deptsLabel = page.locator('label', { hasText: 'Départements' })
  if (await deptsLabel.count() > 0) {
    await deptsLabel.click()
    await page.waitForTimeout(2500) // Wait for GeoJSON layer to render
  }

  await screenshot(page, '04-calque-departements')
})

// ─────────────────────────────────────────────
//  5. CLIC ZONE — Zoom sur une région
// ─────────────────────────────────────────────
test('05 - clic zone region', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Regions layer is active by default, click roughly on Île-de-France area
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    const x = box.x + box.width * 0.52
    const y = box.y + box.height * 0.32
    await page.mouse.click(x, y)
    // Wait for zoom animation + tiles to reload
    await page.waitForTimeout(3000)
  }

  await screenshot(page, '05-zoom-region')
})

// ─────────────────────────────────────────────
//  6. FICHE STATION — Clic sur une station
// ─────────────────────────────────────────────
test('06 - fiche station', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Zoom in to deaggregate clusters (3 double-clicks)
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    for (let i = 0; i < 3; i++) {
      await page.mouse.dblclick(cx, cy)
      await page.waitForTimeout(2000) // Wait for zoom + new tiles
    }
  }

  // Try to click on station markers at various positions
  const tryPoints = [
    [0.50, 0.50], [0.48, 0.45], [0.52, 0.55], [0.45, 0.50], [0.55, 0.48],
    [0.50, 0.42], [0.50, 0.58], [0.47, 0.52], [0.53, 0.47],
    [0.42, 0.42], [0.58, 0.58], [0.40, 0.50], [0.60, 0.50],
  ]
  for (const [rx, ry] of tryPoints) {
    if (box) {
      await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
      await page.waitForTimeout(1000)
    }
    const drawer = page.locator('a', { hasText: 'Voir le détail' })
    if (await drawer.count() > 0) break
  }

  await page.waitForTimeout(500)
  await screenshot(page, '06-fiche-station')
})

// ─────────────────────────────────────────────
//  7. PAGE DETAIL — Station piézo
// ─────────────────────────────────────────────
test('07 - page detail station', async ({ page }) => {
  // Get a station code from the API
  let code: string | null = null
  for (const endpoint of ['/api/v1/stations/geojson?type=piezo', '/api/v1/stations/piezo?limit=1']) {
    try {
      const response = await page.request.get(endpoint)
      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) {
        code = data[0].code_bss
      } else if (data?.features?.length > 0) {
        code = data.features[0].properties?.code
      }
      if (code) break
    } catch { /* try next */ }
  }

  if (code) {
    await page.goto(`/station/piezo/${code}`)
    // Wait for the page to load AND charts to render
    await page.waitForSelector('h1, h2', { timeout: 10_000 })
    // Wait for at least one Recharts SVG to appear (chart rendered)
    try {
      await page.waitForSelector('.recharts-wrapper', { timeout: 15_000 })
      await page.waitForTimeout(2000) // Extra time for chart animations
    } catch {
      await page.waitForTimeout(5000) // Fallback: just wait
    }
    await screenshot(page, '07-detail-station')

    // Scroll down to see more charts
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(2000)
    await screenshot(page, '07-detail-charts')
  } else {
    await page.goto('/station/piezo/BSS000AAAA')
    await page.waitForTimeout(3000)
    await screenshot(page, '07-detail-station')
  }
})

// ─────────────────────────────────────────────
//  8. ALERTES
// ─────────────────────────────────────────────
test('08 - page alertes', async ({ page }) => {
  await page.goto('/alerts')
  await waitForPageData(page)
  await screenshot(page, '08-alertes')
})

// ─────────────────────────────────────────────
//  9. COMPARAISON
// ─────────────────────────────────────────────
test('09 - page comparer', async ({ page }) => {
  await page.goto('/compare')
  await waitForPageData(page)
  await screenshot(page, '09-comparer')
})

// ─────────────────────────────────────────────
//  10. RECHERCHE — Ouvrir et taper
// ─────────────────────────────────────────────
test('10 - recherche universelle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Find search input by placeholder
  const searchInput = page.locator('input[placeholder*="Station"]').first()
  await searchInput.click()
  await page.waitForTimeout(300)
  await searchInput.fill('Loire')
  // Wait for results dropdown to appear
  await page.waitForTimeout(2500)
  await screenshot(page, '10-recherche')
})

// ─────────────────────────────────────────────
//  11. TIMELINE — Lecture
// ─────────────────────────────────────────────
test('11 - timeline historique', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Look for play button in timeline
  const playBtn = page.locator('button[aria-label*="lay"]')
    .or(page.locator('button svg.lucide-play').locator('..'))
    .first()
  if (await playBtn.count() > 0) {
    await playBtn.click()
    // Let it play several frames so the GIF shows the animation
    await page.waitForTimeout(6000)
    // Pause
    await playBtn.click()
    await page.waitForTimeout(1000)
  }

  await screenshot(page, '11-timeline')
})

// ─────────────────────────────────────────────
//  12. CALQUES WFS — Cours d'eau
// ─────────────────────────────────────────────
test('12 - calque cours d\'eau', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(300)

  // Expand Calques
  const calquesBtn = page.locator('button', { hasText: 'Calques' })
  await calquesBtn.click()
  await page.waitForTimeout(300)

  // Enable cours d'eau principaux
  const coursEau = page.locator('label', { hasText: 'Cours d\'eau principaux' })
  if (await coursEau.count() > 0) {
    await coursEau.click()
    await page.waitForTimeout(3000) // WFS layers can be slow to render
  }

  await screenshot(page, '12-calque-cours-eau')
})

// ─────────────────────────────────────────────
//  13. STATIONS GRISES — Toggle
// ─────────────────────────────────────────────
test('13 - toggle stations grises', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(500)

  // Grey stations are OFF by default — screenshot without them
  await screenshot(page, '13-stations-grises-off')

  // Toggle ON
  const greyToggle = page.locator('label', { hasText: 'Stations filtrées' })
  if (await greyToggle.count() > 0) {
    await greyToggle.click()
    await page.waitForTimeout(1500) // Wait for grey markers to appear
  }

  await screenshot(page, '13-stations-grises-on')
})

// ─────────────────────────────────────────────
//  14. TOGGLE RELIEF
// ─────────────────────────────────────────────
test('14 - toggle relief', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(500)

  // Relief is OFF by default — toggle ON
  const reliefToggle = page.locator('label', { hasText: 'Relief' })
  if (await reliefToggle.count() > 0) {
    await reliefToggle.click()
    await page.waitForTimeout(3000) // Wait for terrain tiles to load
  }

  await screenshot(page, '14-relief')
})

// ─────────────────────────────────────────────
//  15. ABOUT PAGE
// ─────────────────────────────────────────────
test('15 - page a propos', async ({ page }) => {
  await page.goto('/about')
  await waitForPageData(page)
  await screenshot(page, '15-about')
})
