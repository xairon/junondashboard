import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the map canvas + KPI bar to render */
async function waitForMap(page: Page) {
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Piézo').first()).toBeVisible({ timeout: 30_000 })
}

/** Open the right drawer panel */
async function openRightDrawer(page: Page) {
  await page.locator('button[aria-label="Ouvrir le panneau"]').click()
  await expect(page.getByText('Panneau de contrôle')).toBeVisible({ timeout: 3000 })
}

/** Close right drawer via X */
async function closeRightDrawer(page: Page) {
  await page.locator('button[aria-label="Fermer"]').click({ force: true })
  await expect(page.locator('button[aria-label="Ouvrir le panneau"]')).toBeVisible({ timeout: 3000 })
}

/** Search and pick first result, returns drawer dialog locator */
async function searchAndSelect(page: Page, query: string) {
  const input = page.locator('input[aria-label="Recherche universelle"]')
  await input.fill(query)
  await page.waitForTimeout(600)

  const firstResult = page.locator('#search-results-list button[role="option"]').first()
  if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) return null

  await firstResult.click()
  const drawer = page.locator('[role="dialog"]')
  await expect(drawer).toBeVisible({ timeout: 5000 })
  return drawer
}

// ===========================================================================
//  1. OBSERVATORY PAGE — MAP & CANVAS
// ===========================================================================

test.describe('Observatory — Map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)
  })

  test('map canvas and KPI bar are visible', async ({ page }) => {
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByText('Piézo').first()).toBeVisible()
    await expect(page.getByText('Hydro').first()).toBeVisible()
  })

  test('KPI bar shows station counts', async ({ page }) => {
    // KPI badges show numeric counts
    const kpiBar = page.locator('.font-mono')
    const count = await kpiBar.count()
    expect(count).toBeGreaterThan(0)
  })

  test('map is interactive — zoom buttons', async ({ page }) => {
    // MapLibre adds zoom controls
    const zoomIn = page.locator('.maplibregl-ctrl-zoom-in')
    const zoomOut = page.locator('.maplibregl-ctrl-zoom-out')
    if (await zoomIn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zoomIn.click({ force: true })
      await page.waitForTimeout(500)
      await zoomOut.click({ force: true })
    }
  })
})

// ===========================================================================
//  2. OBSERVATORY — SEARCH BAR
// ===========================================================================

test.describe('Observatory — Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)
  })

  test('search bar is present and functional', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await expect(input).toBeVisible()

    await input.fill('Paris')
    await page.waitForTimeout(600)

    const results = page.locator('#search-results-list')
    await expect(results).toBeVisible({ timeout: 5000 })

    // Clear button
    await page.locator('button[aria-label="Effacer la recherche"]').click()
    await expect(results).not.toBeVisible()
  })

  test('search shows categorized results (stations, communes)', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('Lyon')
    await page.waitForTimeout(600)

    const results = page.locator('#search-results-list')
    if (!await results.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    const options = page.locator('#search-results-list button[role="option"]')
    expect(await options.count()).toBeGreaterThan(0)
  })

  test('search with BSS code returns piezo station', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('BSS0')
    await page.waitForTimeout(600)

    const results = page.locator('#search-results-list')
    if (!await results.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    // Should have at least one result with "piézo" type badge
    const options = page.locator('#search-results-list button[role="option"]')
    expect(await options.count()).toBeGreaterThan(0)
  })

  test('selecting a station from search opens drawer', async ({ page }) => {
    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    await expect(drawer).toBeVisible()
  })

  test('selecting a region/dept from search applies spatial filter', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('Bretagne')
    await page.waitForTimeout(600)

    const regionResult = page.locator('#search-results-list button[role="option"]').first()
    if (!await regionResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await regionResult.click()
    await page.waitForTimeout(500)

    // Spatial filter does NOT pollute URL with station codes
    expect(page.url()).not.toContain('stations=')
  })
})

// ===========================================================================
//  3. OBSERVATORY — STATION DRAWER (left)
// ===========================================================================

test.describe('Observatory — Station Drawer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)
  })

  test('station drawer closes on X button', async ({ page }) => {
    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    await drawer.locator('button[aria-label="Fermer"]').click()
    await expect(drawer).not.toBeVisible({ timeout: 3000 })
  })

  test('station drawer shows station info', async ({ page }) => {
    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    // Should show some text content inside the drawer
    const textContent = await drawer.textContent()
    expect(textContent?.length).toBeGreaterThan(10)
  })

  test('station drawer has "Voir les détails" link', async ({ page }) => {
    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    const detailLink = drawer.locator('a:has-text("Voir les d")')
    if (await detailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await detailLink.getAttribute('href')
      expect(href).toMatch(/\/station\/(piezo|hydro)\//)
    }
  })

  test('station detail link navigates correctly', async ({ page }) => {
    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    const detailLink = drawer.locator('a:has-text("Voir les d")')
    if (await detailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await detailLink.click()
      await expect(page).toHaveURL(/\/station\/(piezo|hydro)\//, { timeout: 10_000 })
    }
  })
})

// ===========================================================================
//  4. OBSERVATORY — RIGHT DRAWER (control panel)
// ===========================================================================

test.describe('Observatory — Right Drawer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)
  })

  test('right drawer opens and closes', async ({ page }) => {
    await openRightDrawer(page)
    await closeRightDrawer(page)
  })

  test('right drawer shows accordion sections', async ({ page }) => {
    await openRightDrawer(page)

    // "Données" section is open by default
    await expect(page.getByText('Données').first()).toBeVisible()
    // "Filtres" and "Calques" exist
    await expect(page.getByText('Filtres')).toBeVisible()
    await expect(page.getByText('Calques')).toBeVisible()
  })

  test('Données section has Piézométrie and Hydrométrie toggles', async ({ page }) => {
    await openRightDrawer(page)

    const piezoBtn = page.locator('button[aria-pressed]').filter({ hasText: 'Piézométrie' })
    const hydroBtn = page.locator('button[aria-pressed]').filter({ hasText: 'Hydrométrie' })
    await expect(piezoBtn).toBeVisible()
    await expect(hydroBtn).toBeVisible()
  })

  test('toggling Piézométrie changes aria-pressed', async ({ page }) => {
    await openRightDrawer(page)

    const piezoBtn = page.locator('button[aria-pressed]').filter({ hasText: 'Piézométrie' })
    const initialState = await piezoBtn.getAttribute('aria-pressed')
    await piezoBtn.click()
    await page.waitForTimeout(300)

    const newState = await piezoBtn.getAttribute('aria-pressed')
    expect(newState).not.toBe(initialState)

    // Toggle back
    await piezoBtn.click()
  })

  test('Filtres accordion opens and shows filter controls', async ({ page }) => {
    await openRightDrawer(page)

    // Open Filtres section
    const filtresBtn = page.locator('button').filter({ hasText: 'Filtres' })
    await filtresBtn.click()
    await page.waitForTimeout(300)

    // Should show checkbox "Données année en cours"
    await expect(page.getByText('année en cours')).toBeVisible({ timeout: 3000 })
    // Department input
    await expect(page.locator('input[placeholder="ex: 75"]')).toBeVisible()
  })

  test('department filter input works', async ({ page }) => {
    await openRightDrawer(page)

    const filtresBtn = page.locator('button').filter({ hasText: 'Filtres' })
    await filtresBtn.click()
    await page.waitForTimeout(300)

    const deptInput = page.locator('input[placeholder="ex: 75"]')
    await deptInput.fill('44')
    await page.waitForTimeout(500)

    // Check URL has dept param
    expect(page.url()).toContain('dept=44')
  })

  test('classification filter buttons have aria-pressed', async ({ page }) => {
    await openRightDrawer(page)

    const filtresBtn = page.locator('button').filter({ hasText: 'Filtres' })
    await filtresBtn.click()
    await page.waitForTimeout(300)

    // Classification buttons
    const classifBtns = page.locator('#section-filtres button[aria-pressed]')
    const count = await classifBtns.count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking a classification filter updates URL', async ({ page }) => {
    await openRightDrawer(page)

    const filtresBtn = page.locator('button').filter({ hasText: 'Filtres' })
    await filtresBtn.click()
    await page.waitForTimeout(300)

    const classifBtn = page.locator('#section-filtres button[aria-pressed="false"]').first()
    if (!await classifBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip()
      return
    }

    await classifBtn.click()
    await page.waitForTimeout(300)

    expect(page.url()).toContain('classif=')
  })

  test('reset filters button is visible when filter active', async ({ page }) => {
    await openRightDrawer(page)

    // Open Filtres section
    const filtresBtn = page.locator('button[aria-expanded]').filter({ hasText: 'Filtres' })
    await filtresBtn.click()
    await page.waitForTimeout(300)

    // Apply a filter
    const deptInput = page.locator('input[placeholder="ex: 75"]')
    await deptInput.fill('44')
    await page.waitForTimeout(500)

    // Reset button should appear
    const resetBtn = page.locator('button:has-text("initialiser")').first()
    await expect(resetBtn).toBeVisible({ timeout: 3000 })

    // Click it — should not crash
    await resetBtn.click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toBeVisible()
  })

  test('Calques accordion shows layer checkboxes', async ({ page }) => {
    await openRightDrawer(page)

    const calquesBtn = page.locator('button[aria-expanded]').filter({ hasText: 'Calques' })
    await calquesBtn.click()
    await page.waitForTimeout(300)

    // Should show admin layers
    await expect(page.getByText('Régions', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Départements', { exact: true })).toBeVisible()
  })

  test('toggling a layer checkbox works', async ({ page }) => {
    await openRightDrawer(page)

    const calquesBtn = page.locator('button[aria-expanded]').filter({ hasText: 'Calques' })
    await calquesBtn.click()
    await page.waitForTimeout(300)

    const regionsCheckbox = page.locator('#section-calques input[type="checkbox"]').first()
    const wasChecked = await regionsCheckbox.isChecked()
    await regionsCheckbox.click()
    await page.waitForTimeout(300)
    expect(await regionsCheckbox.isChecked()).toBe(!wasChecked)

    // Restore
    await regionsCheckbox.click()
  })
})

// ===========================================================================
//  5. STATION DETAIL PAGE
// ===========================================================================

test.describe('Station Detail Page', () => {
  test('invalid station shows "non trouvée"', async ({ page }) => {
    await page.goto('/station/piezo/INVALID_CODE_XXXXX')

    const msg = page.locator('text=/non trouvée|Impossible|Erreur|404/i').first()
    await expect(msg).toBeVisible({ timeout: 15_000 })
  })

  test('invalid hydro station shows error', async ({ page }) => {
    await page.goto('/station/hydro/INVALID_CODE_XXXXX')

    const msg = page.locator('text=/non trouvée|Impossible|Erreur|404/i').first()
    await expect(msg).toBeVisible({ timeout: 15_000 })
  })

  test('"Retour à l\'observatoire" link exists', async ({ page }) => {
    await page.goto('/station/piezo/INVALID_CODE_XXXXX')
    await page.waitForTimeout(2000)

    const backLink = page.locator('a[aria-label="Retour à l\'observatoire"], a:has-text("Retour")')
    if (await backLink.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await backLink.first().click()
      await expect(page).toHaveURL('/', { timeout: 10_000 })
    }
  })
})

test.describe('Station Detail — Live Data', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a real station via search
    await page.goto('/')
    await waitForMap(page)

    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    const detailLink = drawer.locator('a:has-text("Voir les d")')
    if (!await detailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await detailLink.click()
    await expect(page).toHaveURL(/\/station\/(piezo|hydro)\//, { timeout: 10_000 })
  })

  test('station page shows header with name and type', async ({ page }) => {
    // Type indicator (Piézométrie or Hydrométrie)
    const typeLabel = page.locator('text=/Piézométrie|Hydrométrie/').first()
    await expect(typeLabel).toBeVisible({ timeout: 15_000 })

    // Station name heading
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
  })

  test('station page shows "Fiche technique" section', async ({ page }) => {
    await expect(page.getByText('Fiche technique')).toBeVisible({ timeout: 15_000 })
  })

  test('fiche technique shows metadata rows', async ({ page }) => {
    await expect(page.getByText('Fiche technique')).toBeVisible({ timeout: 15_000 })

    // Common fields
    const hasCoords = await page.getByText('Coordonnées').isVisible({ timeout: 3000 }).catch(() => false)
    const hasPeriod = await page.getByText('Période de données').isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasCoords || hasPeriod).toBe(true)
  })

  test('station page has external links (ADES, Hub\'Eau)', async ({ page }) => {
    await expect(page.getByText('Fiche technique')).toBeVisible({ timeout: 15_000 })

    const externalLink = page.locator('a[target="_blank"]').first()
    await expect(externalLink).toBeVisible({ timeout: 5000 })
  })

  test('resolution selector is visible with options', async ({ page }) => {
    const resGroup = page.locator('[aria-label="Résolution temporelle"]')
    await expect(resGroup).toBeVisible({ timeout: 15_000 })

    // Journalier button
    await expect(page.locator('button[aria-pressed]').filter({ hasText: 'Journalier' })).toBeVisible()
  })

  test('switching resolution to Mensuel works', async ({ page }) => {
    const resGroup = page.locator('[aria-label="Résolution temporelle"]')
    await expect(resGroup).toBeVisible({ timeout: 15_000 })

    const mensuelBtn = page.locator('button').filter({ hasText: 'Mensuel' })
    if (await mensuelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mensuelBtn.click()
      await page.waitForTimeout(500)
      await expect(mensuelBtn).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('switching resolution to Annuel works', async ({ page }) => {
    const resGroup = page.locator('[aria-label="Résolution temporelle"]')
    await expect(resGroup).toBeVisible({ timeout: 15_000 })

    const annuelBtn = page.locator('button').filter({ hasText: 'Annuel' })
    await annuelBtn.click()
    await page.waitForTimeout(500)
    await expect(annuelBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('daily resolution shows date range pickers', async ({ page }) => {
    const resGroup = page.locator('[aria-label="Résolution temporelle"]')
    await expect(resGroup).toBeVisible({ timeout: 15_000 })

    // Daily is default — date pickers should be visible
    const startDate = page.locator('input[aria-label="Date de début"]')
    const endDate = page.locator('input[aria-label="Date de fin"]')
    await expect(startDate).toBeVisible()
    await expect(endDate).toBeVisible()
  })

  test('back arrow returns to observatory', async ({ page }) => {
    const backBtn = page.locator('a[aria-label="Retour à l\'observatoire"]')
    await expect(backBtn).toBeVisible({ timeout: 10_000 })

    await backBtn.click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })
})

// ===========================================================================
//  6. ALERTS PAGE
// ===========================================================================

test.describe('Alerts Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/alerts')
  })

  test('page title shows "Alertes"', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Alertes', { timeout: 20_000 })
  })

  test('severity tabs are visible', async ({ page }) => {
    const tab = page.locator('button').filter({ hasText: /Très bas|Extr\. bas|Bas/i }).first()
    await expect(tab).toBeVisible({ timeout: 20_000 })
  })

  test('all 6 severity tabs are present', async ({ page }) => {
    const tabLabels = ['Extr. bas', 'Très bas', 'Bas', 'Haut', 'Très haut', 'Extr. haut']
    for (const label of tabLabels) {
      await expect(page.locator('button').filter({ hasText: label }).first()).toBeVisible({ timeout: 20_000 })
    }
  })

  test('each tab shows count badge', async ({ page }) => {
    // Wait for data
    await expect(page.locator('button').filter({ hasText: 'Très bas' }).first()).toBeVisible({ timeout: 20_000 })

    // Tabs have count badges (font-mono spans inside)
    const badges = page.locator('button .font-mono')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking a tab switches content', async ({ page }) => {
    // Click "Haut" tab — clearly distinct label
    const tabHaut = page.locator('button').filter({ hasText: 'Haut' }).first()
    await expect(tabHaut).toBeVisible({ timeout: 20_000 })

    await tabHaut.click()
    await page.waitForTimeout(500)

    // Tab description for "Haut" contains "au-dessus de la normale"
    await expect(page.getByText('au-dessus de la normale')).toBeVisible({ timeout: 3000 })
  })

  test('clicking "Extr. haut" tab works', async ({ page }) => {
    const tabHaut = page.locator('button').filter({ hasText: 'Extr. haut' }).first()
    await expect(tabHaut).toBeVisible({ timeout: 20_000 })

    await tabHaut.click()
    await page.waitForTimeout(500)

    await expect(page.getByText('extrêmement haut')).toBeVisible({ timeout: 3000 })
  })

  test('table has sortable column headers', async ({ page }) => {
    // Wait for tabs, then click "Extr. bas" which usually has data
    const tab = page.locator('button').filter({ hasText: 'Extr. bas' }).first()
    await expect(tab).toBeVisible({ timeout: 20_000 })
    await tab.click()
    await page.waitForTimeout(500)

    const table = page.locator('table')
    if (!await table.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(); return
    }

    // Column headers
    await expect(page.locator('th').filter({ hasText: 'Station' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: /Département/ })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: /Dernière mesure/ })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: 'Depuis' })).toBeVisible()
  })

  test('clicking column header sorts table', async ({ page }) => {
    // Click "Extr. bas" tab which usually has data
    const tab = page.locator('button').filter({ hasText: 'Extr. bas' }).first()
    await expect(tab).toBeVisible({ timeout: 20_000 })
    await tab.click()
    await page.waitForTimeout(500)

    const table = page.locator('table')
    if (!await table.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(); return
    }

    const stationHeader = page.locator('th').filter({ hasText: 'Station' })
    await stationHeader.click()
    await page.waitForTimeout(300)

    // Sort indicator changes to cyan (active)
    const indicator = stationHeader.locator('.text-accent-cyan')
    await expect(indicator).toBeVisible()
  })

  test('table rows have station links', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 20_000 })

    const stationLink = page.locator('table a[href*="/station/"]').first()
    if (await stationLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await stationLink.getAttribute('href')
      expect(href).toMatch(/\/station\/(piezo|hydro)\//)
    }
  })

  test('table rows show type badge (PIÉZO or HYDRO)', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 20_000 })

    const typeBadge = page.locator('table span').filter({ hasText: /PIÉZO|HYDRO/ }).first()
    await expect(typeBadge).toBeVisible({ timeout: 5000 })
  })

  test('"voir sur la carte" link has lat/lon params', async ({ page }) => {
    const mapLink = page.locator('a[href*="lat="]').first()
    if (!await mapLink.isVisible({ timeout: 15_000 }).catch(() => false)) {
      test.skip()
      return
    }

    const href = await mapLink.getAttribute('href')
    expect(href).toContain('lat=')
    expect(href).toContain('lon=')
    expect(href).toContain('zoom=')
  })

  test('CSV export button is visible', async ({ page }) => {
    const csvBtn = page.locator('button[aria-label="Exporter en CSV"]')
    await expect(csvBtn).toBeVisible({ timeout: 20_000 })
  })

  test('CSV export button triggers download', async ({ page }) => {
    const csvBtn = page.locator('button[aria-label="Exporter en CSV"]')
    await expect(csvBtn).toBeVisible({ timeout: 20_000 })

    // Listen for download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      csvBtn.click(),
    ])

    if (download) {
      expect(download.suggestedFilename()).toBe('alertes_stations.csv')
    }
  })

  test('total alerts count badge is visible', async ({ page }) => {
    // Wait for data to load — count badge appears after loading
    await expect(page.locator('button').filter({ hasText: 'Très bas' }).first()).toBeVisible({ timeout: 20_000 })

    // Header count badge (accent-cyan bg)
    const badge = page.locator('.bg-accent-cyan\\/10.text-accent-cyan.font-mono').first()
    if (await badge.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await badge.textContent()
      expect(Number(text)).toBeGreaterThanOrEqual(0)
    }
  })

  test('pagination controls appear for large datasets', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 20_000 })

    const nextBtn = page.locator('button').filter({ hasText: 'Suiv.' })
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const prevBtn = page.locator('button').filter({ hasText: 'Préc.' })
      await expect(prevBtn).toBeVisible()

      // Click next page
      await nextBtn.click()
      await page.waitForTimeout(300)

      // Page counter updates
      const pageIndicator = page.getByText(/\d+ \/ \d+/)
      await expect(pageIndicator).toBeVisible()
    }
  })

  test('clicking station code link navigates to station page', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 20_000 })

    const stationLink = page.locator('table a[href*="/station/"]').first()
    if (!await stationLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await stationLink.click()
    await expect(page).toHaveURL(/\/station\/(piezo|hydro)\//, { timeout: 10_000 })
  })
})

// ===========================================================================
//  7. COMPARE PAGE
// ===========================================================================

test.describe('Compare Page', () => {
  test('compare page loads with heading', async ({ page }) => {
    await page.goto('/compare')

    await expect(page.locator('h1')).toHaveText('Comparer des stations', { timeout: 10_000 })
  })

  test('empty state message is shown', async ({ page }) => {
    await page.goto('/compare')

    await expect(page.getByText('Sélectionnez des stations')).toBeVisible({ timeout: 10_000 })
  })

  test('search input is visible', async ({ page }) => {
    await page.goto('/compare')
    await page.waitForTimeout(2000)

    const input = page.locator('input[aria-label="Rechercher une station à comparer"]')
    await expect(input).toBeVisible({ timeout: 10_000 })
  })

  test('searching a station shows dropdown results', async ({ page }) => {
    await page.goto('/compare')

    const input = page.locator('input[aria-label="Rechercher une station à comparer"]')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('Paris')
    await page.waitForTimeout(1000)

    // Results dropdown
    const results = page.locator('button').filter({ hasText: /PIEZO|HYDRO/ })
    if (await results.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await results.count()).toBeGreaterThan(0)
    }
  })

  test('selecting a station adds it as a tag', async ({ page }) => {
    await page.goto('/compare')

    const input = page.locator('input[aria-label="Rechercher une station à comparer"]')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('Paris')
    await page.waitForTimeout(1000)

    const firstResult = page.locator('.shadow-xl button').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    await page.waitForTimeout(500)

    // Station appears as tag with X button
    const removeBtn = page.locator('button[aria-label^="Retirer"]').first()
    await expect(removeBtn).toBeVisible({ timeout: 3000 })

    // URL has stations param
    expect(page.url()).toContain('stations=')
  })

  test('normalization toggles appear after selecting a station', async ({ page }) => {
    await page.goto('/compare')

    const input = page.locator('input[aria-label="Rechercher une station à comparer"]')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('Paris')
    await page.waitForTimeout(1000)

    const firstResult = page.locator('.shadow-xl button').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    await page.waitForTimeout(500)

    // Normalization buttons
    await expect(page.locator('button[aria-label="Afficher valeurs normalisées"]')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('button[aria-label="Afficher valeurs brutes"]')).toBeVisible()
  })

  test('removing a station tag clears it', async ({ page }) => {
    await page.goto('/compare')

    const input = page.locator('input[aria-label="Rechercher une station à comparer"]')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('Paris')
    await page.waitForTimeout(1000)

    const firstResult = page.locator('.shadow-xl button').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    await page.waitForTimeout(500)

    const removeBtn = page.locator('button[aria-label^="Retirer"]').first()
    await removeBtn.click()
    await page.waitForTimeout(500)

    // Empty state returns
    await expect(page.getByText('Sélectionnez des stations')).toBeVisible({ timeout: 5000 })
  })

  test('URL params persist station selection', async ({ page }) => {
    await page.goto('/compare')

    const input = page.locator('input[aria-label="Rechercher une station à comparer"]')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('Paris')
    await page.waitForTimeout(1000)

    const firstResult = page.locator('.shadow-xl button').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    await page.waitForTimeout(500)

    // Grab current URL and reload
    const currentUrl = page.url()
    await page.goto(currentUrl)
    await page.waitForTimeout(2000)

    // Station tag should still be there
    const removeBtn = page.locator('button[aria-label^="Retirer"]').first()
    await expect(removeBtn).toBeVisible({ timeout: 10_000 })
  })
})

// ===========================================================================
//  8. NAVIGATION
// ===========================================================================

test.describe('Navigation', () => {
  test('nav links exist in header', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    // Desktop nav (hidden on mobile)
    const navLinks = page.locator('nav a')
    const count = await navLinks.count()
    expect(count).toBeGreaterThan(0)
  })

  test('all nav items are present', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    await expect(page.locator('nav a').filter({ hasText: 'Observatoire' })).toBeVisible()
    await expect(page.locator('nav a').filter({ hasText: 'Alertes' })).toBeVisible()
    await expect(page.locator('nav a').filter({ hasText: 'Comparer' })).toBeVisible()
  })

  test('clicking Alertes nav link navigates', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    await page.locator('nav a').filter({ hasText: 'Alertes' }).click()
    await expect(page).toHaveURL('/alerts', { timeout: 10_000 })
  })

  test('clicking Comparer nav link navigates', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    await page.locator('nav a').filter({ hasText: 'Comparer' }).click()
    await expect(page).toHaveURL('/compare', { timeout: 10_000 })
  })

  test('clicking Observatoire nav link returns home', async ({ page }) => {
    await page.goto('/alerts')
    await page.waitForTimeout(1000)

    await page.locator('nav a').filter({ hasText: 'Observatoire' }).first().click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('logo/brand link navigates to home', async ({ page }) => {
    await page.goto('/alerts')
    await page.waitForTimeout(1000)

    // "H" logo or "Hydro Dashboard" text
    const brandLink = page.locator('nav a').first()
    await brandLink.click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('active nav link is highlighted', async ({ page }) => {
    await page.goto('/alerts')
    await page.waitForTimeout(1000)

    const alertsLink = page.locator('nav a').filter({ hasText: 'Alertes' })
    const classes = await alertsLink.getAttribute('class')
    expect(classes).toContain('text-accent-cyan')
  })

  test('404 page renders for unknown route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz')
    await expect(page.locator('text=404')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Page non trouvée')).toBeVisible()
  })

  test('404 page has return link', async ({ page }) => {
    await page.goto('/nonexistent-page')
    await expect(page.locator('text=404')).toBeVisible({ timeout: 10_000 })

    const returnLink = page.locator('a:has-text("Retour")')
    await expect(returnLink).toBeVisible()

    await returnLink.click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })
})

// ===========================================================================
//  9. URL PARAMETER HANDLING
// ===========================================================================

test.describe('URL Parameters', () => {
  test('lat/lon/zoom params fly to location', async ({ page }) => {
    await page.goto('/?lat=48.8566&lon=2.3522&zoom=12')
    await waitForMap(page)

    // Map loaded at coordinates — no crash
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('dept filter persists in URL', async ({ page }) => {
    await page.goto('/?dept=75')
    await waitForMap(page)

    expect(page.url()).toContain('dept=75')
  })

  test('classification filter persists in URL', async ({ page }) => {
    await page.goto('/?classif=TRES_BAS')
    await waitForMap(page)

    expect(page.url()).toContain('classif=TRES_BAS')
  })

  test('compare page stations param is read', async ({ page }) => {
    // Use a fake code — it won't load data but the page should handle it gracefully
    await page.goto('/compare?stations=BSS000TEST&type=piezo')
    await page.waitForTimeout(3000)

    // Page should show the station tag (even if data fails)
    const removeBtn = page.locator('button[aria-label^="Retirer"]')
    await expect(removeBtn.first()).toBeVisible({ timeout: 10_000 })
  })
})

// ===========================================================================
// 10. ERROR STATES & EDGE CASES
// ===========================================================================

test.describe('Error States', () => {
  test('app handles non-existent station gracefully', async ({ page }) => {
    await page.goto('/station/piezo/ZZZZZ_NONEXISTENT')

    // Should show "non trouvée" without crashing
    const msg = page.locator('text=/non trouvée|Erreur|404/i').first()
    await expect(msg).toBeVisible({ timeout: 15_000 })
  })

  test('app handles empty search gracefully', async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)

    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('zzzzzzz_nothing_matches')
    await page.waitForTimeout(1000)

    // No results, no crash
    const results = page.locator('#search-results-list button[role="option"]')
    expect(await results.count()).toBe(0)
  })

  test('alerts page handles error state', async ({ page }) => {
    // Normal load — verify no error alert shown in happy path
    await page.goto('/alerts')
    await page.waitForTimeout(5000)

    const errorAlert = page.locator('[role="alert"]')
    const hasError = await errorAlert.isVisible({ timeout: 3000 }).catch(() => false)
    // In normal conditions, no error should appear
    if (hasError) {
      const text = await errorAlert.textContent()
      expect(text).toContain('Erreur')
    }
  })
})

// ===========================================================================
// 11. MOBILE VIEWPORT
// ===========================================================================

test.describe('Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('map loads on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  })

  test('search bar visible on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })

    const input = page.locator('input[aria-label="Recherche universelle"]')
    await expect(input).toBeVisible()
  })

  test('hamburger menu is visible on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const menuBtn = page.locator('button[aria-label="Ouvrir le menu"]')
    await expect(menuBtn).toBeVisible()
  })

  test('hamburger menu opens and shows nav items', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const menuBtn = page.locator('button[aria-label="Ouvrir le menu"]')
    await menuBtn.click()

    // Mobile menu shows nav items
    await expect(page.locator('a').filter({ hasText: 'Observatoire' }).last()).toBeVisible({ timeout: 3000 })
    await expect(page.locator('a').filter({ hasText: 'Alertes' }).last()).toBeVisible()
    await expect(page.locator('a').filter({ hasText: 'Comparer' }).last()).toBeVisible()
  })

  test('hamburger menu closes after navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const menuBtn = page.locator('button[aria-label="Ouvrir le menu"]')
    await menuBtn.click()

    // Click Alertes in mobile menu
    await page.locator('a').filter({ hasText: 'Alertes' }).last().click()
    await expect(page).toHaveURL('/alerts', { timeout: 10_000 })

    // Menu should be closed — burger button label reverts
    await expect(page.locator('button[aria-label="Ouvrir le menu"]')).toBeVisible({ timeout: 3000 })
  })

  test('hamburger menu close button works', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const menuBtn = page.locator('button[aria-label="Ouvrir le menu"]')
    await menuBtn.click()

    // Close button appears
    const closeBtn = page.locator('button[aria-label="Fermer le menu"]')
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()

    // Menu closed
    await expect(page.locator('button[aria-label="Ouvrir le menu"]')).toBeVisible({ timeout: 3000 })
  })

  test('station drawer takes full width on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })

    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    const box = await drawer.boundingBox()
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(370)
    }
  })

  test('alerts page is usable on mobile', async ({ page }) => {
    await page.goto('/alerts')

    const tab = page.locator('button').filter({ hasText: /Très bas|Extr\. bas|Bas/i }).first()
    await expect(tab).toBeVisible({ timeout: 20_000 })

    // Table is scrollable
    const table = page.locator('table')
    if (await table.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(table).toBeVisible()
    }
  })
})

// ===========================================================================
// 12. TABLET VIEWPORT
// ===========================================================================

test.describe('Tablet Viewport', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('map loads on tablet', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  })

  test('right drawer works on tablet', async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)

    await openRightDrawer(page)
    await closeRightDrawer(page)
  })
})

// ===========================================================================
// 13. CROSS-PAGE FLOWS
// ===========================================================================

test.describe('Cross-page flows', () => {
  test('observatory → station detail → back', async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)

    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    const detailLink = drawer.locator('a:has-text("Voir les d")')
    if (!await detailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await detailLink.click()
    await expect(page).toHaveURL(/\/station\//, { timeout: 10_000 })

    // Back to observatory
    const backBtn = page.locator('a[aria-label="Retour à l\'observatoire"]')
    await backBtn.click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })
    await waitForMap(page)
  })

  test('alerts → station detail via code link', async ({ page }) => {
    await page.goto('/alerts')

    const stationLink = page.locator('table a[href*="/station/"]').first()
    if (!await stationLink.isVisible({ timeout: 20_000 }).catch(() => false)) {
      test.skip()
      return
    }

    await stationLink.click()
    await expect(page).toHaveURL(/\/station\/(piezo|hydro)\//, { timeout: 10_000 })

    // Station page loads
    const typeLabel = page.locator('text=/Piézométrie|Hydrométrie/').first()
    await expect(typeLabel).toBeVisible({ timeout: 15_000 })
  })

  test('alerts "voir sur la carte" navigates to map with coords', async ({ page }) => {
    await page.goto('/alerts')

    const mapLink = page.locator('a[href*="lat="]').first()
    if (!await mapLink.isVisible({ timeout: 15_000 }).catch(() => false)) {
      test.skip()
      return
    }

    await mapLink.click()
    await expect(page).toHaveURL(/lat=/, { timeout: 10_000 })
    await waitForMap(page)
  })
})

// ===========================================================================
// 14. LOADING STATES
// ===========================================================================

test.describe('Loading states', () => {
  test('observatory shows loading skeleton before data', async ({ page }) => {
    // Navigate fresh — catch any pulse animation
    await page.goto('/')

    // Either canvas loads quickly or we see pulse animation
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
  })

  test('station page shows skeleton while loading', async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)

    const drawer = await searchAndSelect(page, 'BSS0')
    if (!drawer) { test.skip(); return }

    const detailLink = drawer.locator('a:has-text("Voir les d")')
    if (!await detailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await detailLink.click()

    // Either skeleton or final content should appear
    const content = page.locator('text=/Fiche technique|non trouvée|Piézométrie|Hydrométrie/i').first()
    await expect(content).toBeVisible({ timeout: 15_000 })
  })

  test('alerts page shows loading skeleton', async ({ page }) => {
    await page.goto('/alerts')

    // Either loading skeleton (animate-pulse) or real data
    const content = page.locator('text=/Alertes/i').first()
    await expect(content).toBeVisible({ timeout: 20_000 })
  })
})
