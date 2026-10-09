import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Execute the real review migration in an isolated Postgres engine.
async function reviewDatabase() {
  const db = new PGlite()
  await db.exec(`
    create schema private; create role anon; create role authenticated; create role service_role;
    create function private.is_admin(text[]) returns boolean language sql as $$select current_setting('test.admin',true) = 'true'$$;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/20261003103000_add_product_reviews.sql', import.meta.url), 'utf8'))
  return db
}

const headers = (ip, agent = 'test-browser') => JSON.stringify({ 'cf-connecting-ip': ip, 'user-agent': agent })

async function submit(db, values = {}) {
  const review = { rating: 5, title: 'Fijne zolen', body: 'Mijn dochter kan weer zonder klachten hockeyen.', name: 'Sanne', email: null, company: '', ...values }
  const { rows } = await db.query('select public.submit_product_review($1,$2,$3,$4,$5,$6) as result', [review.rating, review.title, review.body, review.name, review.email, review.company])
  return rows[0].result
}

const publicReviews = async (db) => (await db.query("select public.get_product_reviews('zol-inlegzolen', 50) as result")).rows[0].result

test('new reviews stay hidden until approved and public data never contains e-mail addresses', async () => {
  const db = await reviewDatabase()
  try {
    await db.query("select set_config('request.headers', $1, false)", [headers('203.0.113.1')])
    assert.deepEqual(await submit(db, { email: ' Sanne@Example.NL ', title: '  Fijne   zolen ' }), { success: true })

    let reviews = await publicReviews(db)
    assert.equal(reviews.count, 0)
    assert.equal(reviews.average, null)
    assert.deepEqual(reviews.reviews, [])

    const stored = (await db.query('select * from public.product_reviews')).rows[0]
    assert.equal(stored.status, 'pending')
    assert.equal(stored.email, 'sanne@example.nl')
    assert.equal(stored.title, 'Fijne zolen')
    assert.equal(stored.fingerprint.length, 64)

    await db.exec("update public.product_reviews set status = 'approved'")
    await db.query("select set_config('request.headers', $1, false)", [headers('203.0.113.2')])
    await submit(db, { rating: 3, body: 'Past goed, maar het wennen duurde een week.' })
    await db.exec("update public.product_reviews set status = 'approved' where rating = 3")
    await submit(db, { rating: 1, body: 'Deze review is afgewezen en blijft verborgen.' })
    await db.exec("update public.product_reviews set status = 'rejected' where rating = 1")

    reviews = await publicReviews(db)
    assert.equal(reviews.count, 2)
    assert.equal(Number(reviews.average), 4)
    assert.deepEqual(reviews.distribution, { 5: 1, 4: 0, 3: 1, 2: 0, 1: 0 })
    assert.equal(reviews.reviews.length, 2)
    assert.deepEqual(Object.keys(reviews.reviews[0]).sort(), ['author_name', 'body', 'created_at', 'id', 'rating', 'title'])
    assert.doesNotMatch(JSON.stringify(reviews), /example\.nl|fingerprint/)
  } finally { await db.close() }
})

test('review submissions validate input, ignore bots and limit repeated posting', async () => {
  const db = await reviewDatabase()
  try {
    await db.query("select set_config('request.headers', $1, false)", [headers('198.51.100.7')])
    await assert.rejects(() => submit(db, { rating: 6 }), /score van 1 tot 5/)
    await assert.rejects(() => submit(db, { body: 'Kort' }), /minimaal 10 tekens/)
    await assert.rejects(() => submit(db, { name: ' ' }), /voornaam/)
    await assert.rejects(() => submit(db, { email: 'geen-email' }), /e-mailadres/)

    assert.deepEqual(await submit(db, { company: 'Spam BV' }), { success: true })
    assert.equal((await db.query('select count(*)::int as count from public.product_reviews')).rows[0].count, 0)

    await submit(db, { body: 'Eerste ervaring met de ZOL-zolen.' })
    assert.deepEqual(await submit(db, { body: 'Eerste ervaring met de ZOL-zolen.' }), { success: true, duplicate: true })
    await submit(db, { body: 'Tweede ervaring met de ZOL-zolen.' })
    await submit(db, { body: 'Derde ervaring met de ZOL-zolen.' })
    await assert.rejects(() => submit(db, { body: 'Vierde ervaring met de ZOL-zolen.' }), /vandaag al reviews/)

    await db.query("select set_config('request.headers', $1, false)", [headers('198.51.100.8')])
    await submit(db, { body: 'Een andere ouder deelt een ervaring.' })
    assert.equal((await db.query('select count(*)::int as count from public.product_reviews')).rows[0].count, 4)
  } finally { await db.close() }
})

test('product page renders approved reviews, the score breakdown and review structured data', async () => {
  const { JSDOM } = await import('jsdom')
  const { renderReviews, reviewStructuredData } = await import('../src/product-reviews-core.js')
  const html = await readFile(new URL('../product/index.html', import.meta.url), 'utf8')
  const { window } = new JSDOM(html)
  const root = window.document.querySelector('[data-product-reviews]')
  assert.ok(root, 'expected the review section on the product page')

  renderReviews(root, null)
  assert.equal(root.querySelector('[data-review-count]').textContent, 'Nog geen reviews')
  assert.equal(root.querySelector('[data-review-empty]').hidden, false)
  assert.equal(reviewStructuredData(null, 'https://zolsolutions.nl/product/'), null)

  const data = {
    count: 2, average: 4.5, distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
    reviews: [
      { id: 'a', rating: 5, title: '<b>Top</b>', body: 'Zit fijn in de voetbalschoen.', author_name: 'Bart', created_at: '2026-10-02T09:00:00Z' },
      { id: 'b', rating: 4, title: 'Goed', body: 'Even wennen, daarna prima.', author_name: 'Eva', created_at: '2026-10-01T09:00:00Z' },
    ],
  }
  renderReviews(root, data)
  assert.equal(root.querySelector('[data-review-average]').textContent, '4,5')
  assert.equal(root.querySelector('[data-review-count]').textContent, 'Gebaseerd op 2 reviews')
  assert.equal(root.querySelector('[data-stars="5"] b').style.width, '50%')
  assert.equal(root.querySelector('[data-stars="3"] strong').textContent, '0')
  assert.equal(root.querySelectorAll('[data-review-list] .product-review-item').length, 2)
  assert.equal(root.querySelector('[data-review-list] .product-review-item h4').textContent, '<b>Top</b>', 'review text must never be parsed as HTML')
  assert.equal(root.querySelector('[data-review-list] .product-review-item h4').getAttribute('translate'), 'no')
  assert.equal(root.querySelector('[data-review-empty]').hidden, true)

  const structured = reviewStructuredData(data, 'https://zolsolutions.nl/product/')
  assert.equal(structured['@id'], 'https://zolsolutions.nl/product/#product')
  assert.deepEqual(structured.aggregateRating, { '@type': 'AggregateRating', ratingValue: '4.5', bestRating: '5', worstRating: '1', ratingCount: 2, reviewCount: 2 })
  assert.equal(structured.review[0].author.name, 'Bart')
  window.close()
})

test('admin lists pending reviews and puts an approved review online', async () => {
  const { adminHarness } = await import('./helpers/admin-harness.js')
  const admin = await adminHarness()
  try {
    admin.db.product_reviews = [{ id: 'review-1', rating: 4, title: 'Prima zolen', body: 'Past goed in de hockeyschoen.', author_name: 'Eva', email: 'eva@example.invalid', status: 'pending', created_at: new Date().toISOString() }]
    await admin.run('fetchAllData()')
    assert.equal(admin.q('#pending-review-count').textContent, '1')
    admin.run("renderRoute('reviews')")
    assert.match(admin.q('.admin-review-card h3').textContent, /Prima zolen/)
    await admin.click('[data-action="approve-review"]')
    assert.equal(admin.db.product_reviews[0].status, 'approved')
    assert.ok(admin.db.product_reviews[0].reviewed_at)
    assert.equal(admin.q('#pending-review-count').textContent, '')
    assert.ok(admin.db.activity_log.some((entry) => entry.action === 'Review online gezet'))
  } finally { admin.close() }
})
