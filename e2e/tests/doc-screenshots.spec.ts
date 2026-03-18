/**
 * Documentation screenshots & animated GIFs generator.
 *
 * Run:   docker compose run --rm e2e npm run docs:screenshots
 * Output: /e2e/docs-assets/  (mounted volume → docs/assets/)
 */

import { test, type Page } from '@playwright/test'
import path from 'path'

const ASSETS = path.join(__dirname, '..', 'docs-assets')

/** Wait until the map is fully loaded: canvas + station data in KPI bar + network idle */
async function waitForMap(page: Page) {
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(() => {
    const els = document.querySelectorAll('.font-mono')
    for (const el of els) {
      const text = el.textContent?.replace(/\s/g, '') ?? ''
      if (/\d{2,}/.test(text)) return true
    }
    return false
  }, { timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)
}

async function waitForPageData(page: Page) {
  await page.waitForFunction(() => {
    const body = document.body.innerText
    return body.length > 100 && !body.includes('Chargement')
  }, { timeout: 20_000 })
  await page.waitForTimeout(1000)
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(ASSETS, `${name}.png`), fullPage: false })
}

/** Open the right drawer and optionally expand a section */
async function openDrawer(page: Page, section?: string) {
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(400)
  if (section) {
    const btn = page.locator('button', { hasText: section })
    if (await btn.count() > 0) {
      const expanded = await btn.getAttribute('aria-expanded')
      if (expanded !== 'true') await btn.click()
      await page.waitForTimeout(300)
    }
  }
}

test.use({
  video: { mode: 'on', size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
})

// ─────────────────────────────────────────────
//  01. CARTE — Vue d'ensemble (PNG only)
// ─────────────────────────────────────────────
test('01 - carte overview', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await screenshot(page, '01-carte-overview')
})

// ─────────────────────────────────────────────
//  02. PANNEAU DE CONTROLE (PNG only)
// ─────────────────────────────────────────────
test('02 - panneau de controle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await openDrawer(page, 'Données')
  await screenshot(page, '02-panneau-controle')
})

// ─────────────────────────────────────────────
//  03. FILTRES — Sélection classification (GIF)
// ─────────────────────────────────────────────
test('03 - filtres classification', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await openDrawer(page, 'Filtres')
  await page.waitForTimeout(500)

  // Click "Très bas" then "Bas" to show filtering in action
  for (const label of ['Très bas', 'Bas']) {
    const btn = page.getByRole('button', { name: label, exact: true })
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(1500)
    }
  }
  await screenshot(page, '03-filtre-classification')
  // Unclick to reset
  for (const label of ['Très bas', 'Bas']) {
    const btn = page.getByRole('button', { name: label, exact: true })
    if (await btn.getAttribute('aria-pressed') === 'true') await btn.click()
  }
  await page.waitForTimeout(500)
})

// ─────────────────────────────────────────────
//  04. CALQUES — Cycle all zone layers (GIF)
// ─────────────────────────────────────────────
test('04 - calques cycle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await openDrawer(page, 'Calques')
  await page.waitForTimeout(500)

  // Regions is active by default — show it, then cycle through others
  await page.waitForTimeout(1500)

  const layers = ['Départements', 'Bassins', 'Hydroécorégions', 'Régions hydrographiques']
  for (const label of layers) {
    const layerLabel = page.locator('label', { hasText: label }).first()
    if (await layerLabel.count() > 0) {
      await layerLabel.click()
      await page.waitForTimeout(2000) // Wait for layer to render
    }
  }

  // Back to regions
  const regionsLabel = page.locator('label', { hasText: 'Régions' }).first()
  if (await regionsLabel.count() > 0) {
    await regionsLabel.click()
    await page.waitForTimeout(1500)
  }

  await screenshot(page, '04-calques')
})

// ─────────────────────────────────────────────
//  05. INTERACTION — Clic zone → zoom (GIF)
// ─────────────────────────────────────────────
test('05 - clic zone zoom', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Click on a region (roughly Nouvelle-Aquitaine, large area south-west)
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    // Click south-west area of France
    await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.58)
    await page.waitForTimeout(2500) // zoom animation
    await screenshot(page, '05-clic-zone')
    // Wait for zoom to settle
    await page.waitForTimeout(1000)
  }
})

// ─────────────────────────────────────────────
//  06. FICHE STATION — Navigate to station via search (GIF)
// ─────────────────────────────────────────────
test('06 - fiche station', async ({ page }) => {
  // Get a station with coordinates from the GeoJSON API to navigate directly
  let lon = 2.35, lat = 48.85 // fallback: Paris
  let stationCode = ''
  try {
    const response = await page.request.get('/api/v1/common/stations/geojson')
    const data = await response.json()
    if (data?.features?.length > 0) {
      // Pick a station near center of France for a good screenshot
      const feat = data.features.find((f: any) =>
        f.geometry.coordinates[0] > 1 && f.geometry.coordinates[0] < 4 &&
        f.geometry.coordinates[1] > 45 && f.geometry.coordinates[1] < 48 &&
        f.properties.classification && f.properties.classification !== 'UNKNOWN'
      ) || data.features[0]
      lon = feat.geometry.coordinates[0]
      lat = feat.geometry.coordinates[1]
      stationCode = feat.properties.code
    }
  } catch { /* use fallback */ }

  // Navigate to map centered on that station (zoomed in so markers are unclustered)
  await page.goto(`/?lat=${lat}&lon=${lon}&zoom=12`)
  await waitForMap(page)

  // Click on the canvas center where our station should be
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    // Try clicking at center and nearby points
    const detailLink = page.locator('a', { hasText: 'Voir le détail' })
    const points = [
      [0, 0], [-20, -15], [20, 15], [-30, 10], [30, -10],
      [0, -25], [0, 25], [-15, -25], [15, 25], [-40, 0], [40, 0],
    ]
    for (const [dx, dy] of points) {
      await page.mouse.click(cx + dx, cy + dy)
      await page.waitForTimeout(800)
      if (await detailLink.count() > 0) break
    }
  }

  await page.waitForTimeout(500)
  await screenshot(page, '06-fiche-station')
})

// ─────────────────────────────────────────────
//  07. PAGE DETAIL — Navigate to real station (GIF)
// ─────────────────────────────────────────────
test('07 - page detail station', async ({ page }) => {
  // Find a real station with classification data from the GeoJSON
  let code: string | null = null
  let stationType = 'piezo'

  try {
    const response = await page.request.get('/api/v1/common/stations/geojson')
    const data = await response.json()
    if (data?.features?.length > 0) {
      // Pick a station with a classification (not UNKNOWN) for a rich detail page
      const feat = data.features.find((f: any) =>
        f.properties.type === 'piezo' &&
        f.properties.classification &&
        f.properties.classification !== 'UNKNOWN'
      ) || data.features[0]
      code = feat.properties.code
      stationType = feat.properties.type
    }
  } catch { /* skip */ }

  if (!code) {
    // Fallback: try list endpoint
    try {
      const response = await page.request.get('/api/v1/piezo/stations?limit=1')
      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) {
        code = data[0].code_bss
      }
    } catch { /* skip */ }
  }

  await page.goto(`/station/${stationType}/${code || 'BSS000AARC'}`)

  // Wait for charts to render
  try {
    await page.waitForSelector('.recharts-wrapper', { timeout: 15_000 })
    await page.waitForTimeout(2000)
  } catch {
    await page.waitForTimeout(5000)
  }

  await screenshot(page, '07-detail-station')

  // Scroll to see more charts
  await page.evaluate(() => window.scrollBy(0, 600))
  await page.waitForTimeout(1500)
  await screenshot(page, '07-detail-charts')
})

// ─────────────────────────────────────────────
//  08. ALERTES (PNG + GIF)
// ─────────────────────────────────────────────
test('08 - page alertes', async ({ page }) => {
  await page.goto('/alerts')
  await waitForPageData(page)
  await screenshot(page, '08-alertes')
})

// ─────────────────────────────────────────────
//  09. COMPARAISON (PNG)
// ─────────────────────────────────────────────
test('09 - page comparer', async ({ page }) => {
  await page.goto('/compare')
  await waitForPageData(page)
  await screenshot(page, '09-comparer')
})

// ─────────────────────────────────────────────
//  10. RECHERCHE — Search + click result → zoom (GIF)
// ─────────────────────────────────────────────
test('10 - recherche universelle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const searchInput = page.locator('input[placeholder*="Station"]').first()
  await searchInput.click()
  await page.waitForTimeout(300)
  await searchInput.fill('Loire')
  await page.waitForTimeout(2500) // Wait for dropdown

  await screenshot(page, '10-recherche')

  // Click the first result to show it zooming/selecting on the map
  const firstResult = page.locator('[role="option"]').first()
    .or(page.locator('li').first())
  if (await firstResult.count() > 0) {
    await firstResult.click()
    await page.waitForTimeout(3000) // Wait for zoom animation
  }

  await screenshot(page, '10-recherche-result')
})

// ─────────────────────────────────────────────
//  11. TIMELINE — Play (GIF)
// ─────────────────────────────────────────────
test('11 - timeline historique', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const playBtn = page.locator('button[aria-label*="lay"]')
    .or(page.locator('button svg.lucide-play').locator('..'))
    .first()
  if (await playBtn.count() > 0) {
    await playBtn.click()
    await page.waitForTimeout(6000)
    await playBtn.click()
    await page.waitForTimeout(1000)
  }

  await screenshot(page, '11-timeline')
})

// ─────────────────────────────────────────────
//  12. CALQUE COURS D'EAU (GIF)
// ─────────────────────────────────────────────
test('12 - calque cours d\'eau', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await openDrawer(page, 'Calques')

  const coursEau = page.locator('label', { hasText: 'Cours d\'eau principaux' })
  if (await coursEau.count() > 0) {
    await coursEau.click()
    await page.waitForTimeout(3000)
  }

  await screenshot(page, '12-calque-cours-eau')
})

// ─────────────────────────────────────────────
//  13. STATIONS GRISES — Toggle on (GIF)
// ─────────────────────────────────────────────
test('13 - toggle stations grises', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await openDrawer(page, 'Données')

  // OFF by default — screenshot without
  await screenshot(page, '13-stations-grises-off')

  // Toggle ON
  const greyToggle = page.locator('label', { hasText: 'Stations filtrées' })
  if (await greyToggle.count() > 0) {
    await greyToggle.click()
    await page.waitForTimeout(1500)
  }

  await screenshot(page, '13-stations-grises-on')
})

// ─────────────────────────────────────────────
//  14. RELIEF — Toggle on (GIF)
// ─────────────────────────────────────────────
test('14 - toggle relief', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await openDrawer(page, 'Données')

  // Toggle ON
  const reliefToggle = page.locator('label', { hasText: 'Relief' })
  if (await reliefToggle.count() > 0) {
    await reliefToggle.click()
    await page.waitForTimeout(4000) // Terrain tiles need time
  }

  await screenshot(page, '14-relief')
})

// ─────────────────────────────────────────────
//  15. ABOUT PAGE (PNG)
// ─────────────────────────────────────────────
test('15 - page a propos', async ({ page }) => {
  await page.goto('/about')
  await waitForPageData(page)
  await screenshot(page, '15-about')
})
