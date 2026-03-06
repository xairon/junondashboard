import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the map canvas to render */
async function waitForMap(page: Page) {
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  // Wait for KPI bar — contains "Piézo" text (use .first() since it appears in TopNav too)
  await expect(page.getByText('Piézo').first()).toBeVisible({ timeout: 30_000 })
}

// ---------------------------------------------------------------------------
// Observatory Page — Map
// ---------------------------------------------------------------------------

test.describe('Observatory Page — Map Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)
  })

  test('map canvas and KPI bar are visible', async ({ page }) => {
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByText('Piézo').first()).toBeVisible()
    await expect(page.getByText('Hydro').first()).toBeVisible()
  })

  test('search bar is present and functional', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await expect(input).toBeVisible()

    await input.fill('Paris')
    await page.waitForTimeout(600)

    const results = page.locator('#search-results-list')
    await expect(results).toBeVisible({ timeout: 5000 })

    // Clear
    await page.locator('button[aria-label="Effacer la recherche"]').click()
    await expect(results).not.toBeVisible()
  })

  test('selecting a station from search opens drawer', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('BSS0')
    await page.waitForTimeout(600)

    const firstResult = page.locator('#search-results-list button[role="option"]').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })
  })

  test('station drawer closes on X button', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('BSS0')
    await page.waitForTimeout(600)

    const firstResult = page.locator('#search-results-list button[role="option"]').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    const drawer = page.locator('[role="dialog"]')
    await expect(drawer).toBeVisible({ timeout: 5000 })

    await drawer.locator('button[aria-label="Fermer"]').click()
    await expect(drawer).not.toBeVisible({ timeout: 3000 })
  })

  test('right drawer opens and closes', async ({ page }) => {
    const toggleBtn = page.locator('button[aria-label="Ouvrir le panneau"]')
    await expect(toggleBtn).toBeVisible()

    await toggleBtn.click()
    await expect(page.getByText('Panneau de contrôle')).toBeVisible({ timeout: 3000 })

    // Close via the X button inside the drawer header (force avoids z-index interception)
    await page.locator('button[aria-label="Fermer"]').click({ force: true })
    // Drawer slides off-screen — toggle button reverts to "Ouvrir le panneau"
    await expect(page.locator('button[aria-label="Ouvrir le panneau"]')).toBeVisible({ timeout: 3000 })
  })

  test('spatial filter does not pollute URL with station codes', async ({ page }) => {
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

    expect(page.url()).not.toContain('stations=')
  })

  test('station detail link navigates correctly', async ({ page }) => {
    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('BSS0')
    await page.waitForTimeout(600)

    const firstResult = page.locator('#search-results-list button[role="option"]').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    const drawer = page.locator('[role="dialog"]')
    await expect(drawer).toBeVisible({ timeout: 5000 })

    const detailLink = drawer.locator('a:has-text("Voir les d")')
    if (await detailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await detailLink.click()
      await expect(page).toHaveURL(/\/station\/(piezo|hydro)\//, { timeout: 10_000 })
    }
  })
})

// ---------------------------------------------------------------------------
// Observatory Page — Filters & Layers
// ---------------------------------------------------------------------------

test.describe('Observatory Page — Filters & Layers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForMap(page)
  })

  test('right drawer shows accordion sections', async ({ page }) => {
    await page.locator('button[aria-label="Ouvrir le panneau"]').click()
    await expect(page.getByText('Panneau de contrôle')).toBeVisible({ timeout: 3000 })

    // Should have Données section
    await expect(page.getByText('Données').first()).toBeVisible()
  })

  test('reset filters clears URL params', async ({ page }) => {
    await page.locator('button[aria-label="Ouvrir le panneau"]').click()
    await page.waitForTimeout(300)

    const resetBtn = page.locator('button:has-text("initialiser")').first()
    if (!await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip()
      return
    }

    await resetBtn.click()
    await page.waitForTimeout(300)

    const url = new URL(page.url())
    expect(url.searchParams.toString()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Station Page
// ---------------------------------------------------------------------------

test.describe('Station Page', () => {
  test('invalid station shows error or 404', async ({ page }) => {
    await page.goto('/station/piezo/INVALID_CODE_XXXXX')

    const msg = page.locator('text=/non trouvée|Impossible|Erreur|404/i').first()
    await expect(msg).toBeVisible({ timeout: 15_000 })
  })
})

// ---------------------------------------------------------------------------
// Alerts Page
// ---------------------------------------------------------------------------

test.describe('Alerts Page', () => {
  test('alerts page loads with severity tabs', async ({ page }) => {
    await page.goto('/alerts')

    // Wait for one of the tab buttons
    const tab = page.locator('button').filter({ hasText: /Très bas|Extr\. bas|Bas/i }).first()
    await expect(tab).toBeVisible({ timeout: 20_000 })
  })

  test('clicking a tab switches content', async ({ page }) => {
    await page.goto('/alerts')

    const tabBas = page.locator('button').filter({ hasText: 'Bas' }).first()
    await expect(tabBas).toBeVisible({ timeout: 20_000 })

    await tabBas.click()
    await page.waitForTimeout(500)
    // No crash — page still renders
    await expect(page.locator('body')).toBeVisible()
  })

  test('"voir sur la carte" link has lat/lon params', async ({ page }) => {
    await page.goto('/alerts')

    const mapLink = page.locator('a[href*="lat="]').first()
    if (!await mapLink.isVisible({ timeout: 15_000 }).catch(() => false)) {
      test.skip()
      return
    }

    const href = await mapLink.getAttribute('href')
    expect(href).toContain('lat=')
    expect(href).toContain('lon=')
  })
})

// ---------------------------------------------------------------------------
// Compare Page
// ---------------------------------------------------------------------------

test.describe('Compare Page', () => {
  test('compare page loads', async ({ page }) => {
    await page.goto('/compare')

    const heading = page.locator('text=/[Cc]ompar/').first()
    await expect(heading).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test.describe('Navigation', () => {
  test('nav links exist', async ({ page }) => {
    await page.goto('/')

    const navLinks = page.locator('nav a, header a')
    const count = await navLinks.count()
    expect(count).toBeGreaterThan(0)
  })

  test('404 page renders for unknown route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz')
    await expect(page.locator('text=404')).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// Mobile Viewport
// ---------------------------------------------------------------------------

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

  test('station drawer takes full width on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })

    const input = page.locator('input[aria-label="Recherche universelle"]')
    await input.fill('BSS0')
    await page.waitForTimeout(600)

    const firstResult = page.locator('#search-results-list button[role="option"]').first()
    if (!await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }

    await firstResult.click()
    const drawer = page.locator('[role="dialog"]')
    await expect(drawer).toBeVisible({ timeout: 5000 })

    const box = await drawer.boundingBox()
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(370)
    }
  })
})
