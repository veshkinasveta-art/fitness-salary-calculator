import { expect, test } from '@playwright/test'

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]

test('opens the dashboard and can switch theme', async ({ page }) => {
  await page.setViewportSize(viewports[0]!)
  await page.goto('#/')
  await expect(page.getByRole('heading', { name: /г\./ })).toBeVisible()
  await page.getByRole('button', { name: /тему/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/)
})

test('supports draft input and history snapshot', async ({ page }) => {
  await page.goto('#/input')
  await expect(page.getByRole('heading', { name: 'Ввод показателей' })).toBeVisible()
  await page.getByRole('button', { name: 'Увеличить: Количество смен' }).click()
  await page.getByRole('button', { name: /Сохранить|Закрыть период/ }).first().click()
  await page.goto('#/history')
  await expect(page.getByRole('heading', { name: 'История расчётов' })).toBeVisible()
})

for (const viewport of viewports) {
  test(`renders at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('#/')
    await expect(
      page.locator('[aria-label="Основная навигация"]:visible'),
    ).toBeVisible()
  })
}
