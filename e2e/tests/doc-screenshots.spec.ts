/**
 * Documentation screenshots & animated GIFs generator.
 *
 * Run:   docker compose run --rm e2e npx playwright test doc-screenshots
 * Output: /e2e/docs-assets/  (mounted volume → docs/assets/)
 *
 * Each test captures a specific feature for the user guide.
 * Videos are recorded per-test, then converted to GIF by the post-run script.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const ASSETS = path.join(__dirname, '..', 'docs-assets')

// Shared helpers
async function waitForMap(page: Page) {
  // Wait for map canvas + at least one station marker rendered
  await page.waitForSelector('canvas', { timeout: 30_000 })
  // Give MapLibre time to render tiles + clusters
  await page.waitForTimeout(3000)
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
test('02 - panneau de contrôle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Open right drawer
  await page.click('button[aria-label="Ouvrir le panneau"]')
  await page.waitForTimeout(500)
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
  await page.waitForTimeout(300)

  // Click on TRES_BAS classification button
  const tresBas = page.locator('button[aria-pressed]', { hasText: 'Très bas' })
  if (await tresBas.count() > 0) {
    await tresBas.click()
    await page.waitForTimeout(1000)
  }

  await screenshot(page, '03-filtre-classification')
})

// ─────────────────────────────────────────────
//  4. CALQUES — Activation d'un calque zone
// ─────────────────────────────────────────────
test('04 - calques départements', async ({ page }) => {
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
    await page.waitForTimeout(1500) // Wait for layer to render
  }

  await screenshot(page, '04-calque-departements')
})

// ─────────────────────────────────────────────
//  5. CLIC ZONE — Zoom sur une région
// ─────────────────────────────────────────────
test('05 - clic zone région', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Regions layer is active by default, click roughly on Île-de-France
  // Map center is France, IDF is at roughly center-top
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    // IDF is roughly 48.8°N 2.3°E — in a France-centered map that's ~center, slightly above center
    const x = box.x + box.width * 0.52
    const y = box.y + box.height * 0.32
    await page.mouse.click(x, y)
    await page.waitForTimeout(2000) // Wait for zoom animation
  }

  await screenshot(page, '05-zoom-region')
})

// ─────────────────────────────────────────────
//  6. FICHE STATION — Clic sur une station
// ─────────────────────────────────────────────
test('06 - fiche station', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Zoom in first to deaggregate clusters
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    // Double-click center to zoom
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.dblclick(cx, cy)
    await page.waitForTimeout(1500)
    await page.mouse.dblclick(cx, cy)
    await page.waitForTimeout(1500)
    await page.mouse.dblclick(cx, cy)
    await page.waitForTimeout(1500)
  }

  // Try to click on a station marker — look for unclustered points
  // Click on various points near center until we get a drawer
  const tryPoints = [
    [0.50, 0.50], [0.48, 0.45], [0.52, 0.55], [0.45, 0.50], [0.55, 0.48],
    [0.50, 0.42], [0.50, 0.58], [0.47, 0.52], [0.53, 0.47],
  ]
  for (const [rx, ry] of tryPoints) {
    if (box) {
      await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
      await page.waitForTimeout(800)
    }
    // Check if drawer opened (station drawer has a link to detail page)
    const drawer = page.locator('a', { hasText: 'Voir le détail' })
    if (await drawer.count() > 0) break
  }

  await page.waitForTimeout(500)
  await screenshot(page, '06-fiche-station')
})

// ─────────────────────────────────────────────
//  7. PAGE DETAIL — Station piézo
// ─────────────────────────────────────────────
test('07 - page détail station', async ({ page }) => {
  // Get a station code from the piezo list API (more reliable than GeoJSON)
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
    await page.waitForTimeout(5000) // Wait for charts to render
    await screenshot(page, '07-detail-station')

    // Scroll down to see charts
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(1500)
    await screenshot(page, '07-detail-charts')
  } else {
    // Fallback: just screenshot the page with no data message
    await page.goto('/station/piezo/BSS000AAAA')
    await page.waitForTimeout(2000)
    await screenshot(page, '07-detail-station')
  }
})

// ─────────────────────────────────────────────
//  8. ALERTES
// ─────────────────────────────────────────────
test('08 - page alertes', async ({ page }) => {
  await page.goto('/alerts')
  await page.waitForTimeout(2000)
  await screenshot(page, '08-alertes')
})

// ─────────────────────────────────────────────
//  9. COMPARAISON
// ─────────────────────────────────────────────
test('09 - page comparer', async ({ page }) => {
  await page.goto('/compare')
  await page.waitForTimeout(2000)
  await screenshot(page, '09-comparer')
})

// ─────────────────────────────────────────────
//  10. RECHERCHE — Ouvrir et taper
// ─────────────────────────────────────────────
test('10 - recherche universelle', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Find search input by placeholder text
  const searchInput = page.locator('input[placeholder*="Station"]').first()
  await searchInput.click()
  await searchInput.fill('Loire')
  await page.waitForTimeout(2000) // Wait for results dropdown
  await screenshot(page, '10-recherche')
})

// ─────────────────────────────────────────────
//  11. TIMELINE — Lecture
// ─────────────────────────────────────────────
test('11 - timeline historique', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // Look for play button in timeline
  const playBtn = page.locator('button[aria-label*="lay"]').or(page.locator('button svg.lucide-play').locator('..')).first()
  if (await playBtn.count() > 0) {
    await playBtn.click()
    // Let it play a few frames
    await page.waitForTimeout(4000)
    // Pause
    await playBtn.click()
    await page.waitForTimeout(500)
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
    await page.waitForTimeout(2000) // Wait for WFS layer to render
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
  await page.waitForTimeout(300)

  // Screenshot with grey stations visible
  await screenshot(page, '13-stations-grises-on')

  // Toggle off
  const greyToggle = page.locator('label', { hasText: 'Stations filtrées' })
  if (await greyToggle.count() > 0) {
    await greyToggle.click()
    await page.waitForTimeout(1000)
  }

  await screenshot(page, '13-stations-grises-off')
})

// ─────────────────────────────────────────────
//  14. ABOUT PAGE
// ─────────────────────────────────────────────
test('14 - page à propos', async ({ page }) => {
  await page.goto('/about')
  await page.waitForTimeout(1500)
  await screenshot(page, '14-about')
})
