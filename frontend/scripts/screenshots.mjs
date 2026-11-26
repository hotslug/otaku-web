// README screenshots: start the server (cargo run --release), then `npm run screenshots`.
// OTAKU_URL picks another address. Pictures go to ../docs/. Drives your installed Chrome (no browser download).
import { chromium } from 'playwright'

const base = process.env.OTAKU_URL ?? 'http://localhost:8080'
const shots = [
  { file: 'discover.jpg', path: '/' },
  { file: 'show.jpg', path: '/anime/154587' }, // Frieren
  { file: 'schedule.jpg', path: '/schedule' },
  { file: 'list.jpg', path: '/list' },
  { file: 'search.jpg', path: '/?season=FALL&year=2025&sort=SCORE_DESC' },
  { file: 'light.jpg', path: '/anime/21', scheme: 'light' }, // One Piece, by day
  { file: 'phone.jpg', path: '/', size: [390, 844], mobile: true },
]

// A filled-in My list, so its page and "Because you liked…" have something to show.
const seed = [[154587, 'Watching', true], [21, 'Watching', false], [16498, 'Finished', true], [113415, 'Plan to watch', false], [101922, 'Finished', true]]
const list = {}
for (const [id, status, favourite] of seed) {
  const a = await fetch(`${base}/api/anime/${id}`).then(r => r.json())
  const { cast, related, recommended, links, synopsis, ...card } = a
  list[id] = { anime: card, status, favourite }
}

const browser = await chromium.launch({ channel: 'chrome' })
for (const s of shots) {
  const [width, height] = s.size ?? [1440, 900]
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: s.scheme ?? 'dark', isMobile: !!s.mobile })
  await page.addInitScript(l => localStorage.setItem('otaku.list', l), JSON.stringify(list))
  await page.goto(base + s.path, { waitUntil: 'networkidle' })
  // Pictures fade in; wait until the ones in view have arrived.
  await page.waitForFunction(() => [...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).every(i => i.complete), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: new URL(`../../docs/${s.file}`, import.meta.url).pathname, type: 'jpeg', quality: 82 })
  console.log('saved docs/' + s.file)
  await page.close()
}
await browser.close()
