// README screenshots: start the server (cargo run), then `npm run screenshots`.
// OTAKU_URL picks another address. Pictures go to ../docs/.
import { chromium } from 'playwright'

const base = process.env.OTAKU_URL ?? 'http://localhost:8080'
const shots = [
  { file: 'discover.jpg', path: '/', size: [1440, 900] },
  { file: 'show.jpg', path: '/anime/154587', size: [1440, 900] }, // Frieren
  { file: 'search.jpg', path: '/?genre=Fantasy&year=2024&sort=SCORE_DESC', size: [1440, 900] },
  { file: 'light.jpg', path: '/anime/21', size: [1440, 900], scheme: 'light' }, // One Piece, by day
  { file: 'phone.jpg', path: '/', size: [390, 844], mobile: true },
]

const browser = await chromium.launch({ channel: 'chrome' }) // your installed Chrome: no browser download
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.size[0], height: s.size[1] }, deviceScaleFactor: 2, colorScheme: s.scheme ?? 'dark', isMobile: !!s.mobile })
  await page.goto(base + s.path, { waitUntil: 'networkidle' })
  // Pictures fade in; wait until the ones in view have arrived.
  await page.waitForFunction(() => [...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).every(i => i.complete), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
  await page.screenshot({ path: new URL(`../../docs/${s.file}`, import.meta.url).pathname, type: 'jpeg', quality: 82 })
  console.log('saved docs/' + s.file)
  await page.close()
}
await browser.close()
