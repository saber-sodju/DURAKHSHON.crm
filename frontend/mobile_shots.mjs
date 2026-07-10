import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'https://frontend-production-be90.up.railway.app'
const OUT = 'C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/8b4eeb4b-fa9f-4c57-bfe8-8de0c1df797e/scratchpad'
const USER = 'director'
const PASS = 'Dr-BzA3r4sWZYXd'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=390,844'],
})
const page = await browser.newPage()
// iPhone 14-ish
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')

async function shot(name) {
  await page.screenshot({ path: `${OUT}/m_${name}.png` })
  console.log('shot', name)
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1200)
await shot('01_login')

await page.type('input[autocomplete="username"]', USER)
await page.type('input[type="password"]', PASS)
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
])
await sleep(2500)
await shot('02_dashboard')

// open the drawer via the hamburger (first header button)
try {
  await page.click('header button')
  await sleep(800)
  await shot('03_drawer')
  // close it (overlay)
  await page.mouse.click(360, 400)
  await sleep(500)
} catch (e) { console.log('drawer err', e.message) }

// navigate to students
await page.goto(`${BASE}/students`, { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2000)
await shot('04_students')

// open add-student modal if present
try {
  const btns = await page.$$('button')
  for (const b of btns) {
    const txt = await page.evaluate((el) => el.textContent, b)
    if (txt && /Add|Добав|Илова/.test(txt)) { await b.click(); break }
  }
  await sleep(1200)
  await shot('05_student_modal')
} catch (e) { console.log('modal err', e.message) }

await page.goto(`${BASE}/payments`, { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2000)
await shot('06_payments')

await browser.close()
console.log('done')
