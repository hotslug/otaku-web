import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from './myList.ts'

const frieren = { id: 1, title: 'Frieren', genres: [], synopsis: 'long text' }

test('adding, starring and removing', () => {
  let l = apply({}, frieren, { status: 'Watching' })
  assert.equal(l[1].status, 'Watching')
  assert.equal(l[1].anime.synopsis, undefined, 'page-only text is not stored')
  l = apply(l, frieren, { favourite: true })
  l = apply(l, frieren, { status: null })
  assert.deepEqual([l[1].status, l[1].favourite], [undefined, true], 'still a favourite')
  l = apply(l, frieren, { favourite: false })
  assert.equal(l[1], undefined, 'no status, no star: gone')
})
