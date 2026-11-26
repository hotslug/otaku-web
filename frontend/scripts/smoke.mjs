// Clicks through the site like a visitor and fails on any page error. Start the server first, then `npm run smoke`.
import { chromium } from 'playwright'

const base = process.env.OTAKU_URL ?? 'http://localhost:8080'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text().split('\n')[0]) }) // 404: no TMDB key

const step = async (what, act, expect) => {
  await act()
  await page.waitForTimeout(1500)
  const h = await page.locator(expect).first().textContent({ timeout: 8000 }).catch(() => null)
  console.log(h ? `ok    ${what}: ${h.trim().slice(0, 50)}` : `FAIL  ${what}: no ${expect}`)
  if (!h) errors.push(`${what}: nothing at ${expect}`)
}

await step('Discover', () => page.goto(base, { waitUntil: 'networkidle' }), '.row .section-title')
await step('card → show page', () => page.locator('.row .card-link').first().click(), '.hero h1')
await step('add to My list', () => page.getByRole('button', { name: 'Plan to watch' }).first().click(), '.chip.active')
await step('back', () => page.goBack(), '.row .section-title')
await step('Schedule', () => page.getByRole('link', { name: 'Schedule' }).click(), '.day h3')
await step('My list', () => page.getByRole('link', { name: 'My list' }).click(), '.row .card-title')
await step('search', () => page.getByLabel('Search anime').fill('frieren'), '.hero h1')
await step('result → show page', () => page.getByRole('link', { name: 'More info' }).first().click(), '.hero h1')

await browser.close()
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1) }
console.log('\nNo errors.')
