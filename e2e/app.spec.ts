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

test('keeps edited premium fund values after reload without backend', async ({
  page,
}) => {
  await page.goto('#/more')
  await expect(
    page.getByRole('heading', { name: 'Премиальный фонд' }),
  ).toBeVisible()
  const thresholds = page.getByLabel('Выполнение, %')
  const amounts = page.getByLabel('Премия, ₽')
  await expect(thresholds.nth(0)).toHaveValue('80')
  await expect(thresholds.nth(1)).toHaveValue('100')
  await expect(amounts.nth(0)).toHaveValue('40000')
  await expect(amounts.nth(1)).toHaveValue('60000')

  await thresholds.nth(0).fill('85')
  await amounts.nth(0).fill('45000')
  await page.getByRole('button', { name: 'Сохранить фонд' }).click()
  await expect(page.getByText('Сохранено на устройстве')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Выполнение, %').nth(0)).toHaveValue('85')
  await expect(page.getByLabel('Премия, ₽').nth(0)).toHaveValue('45000')
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
