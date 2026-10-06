// Parse context/content/past-meetups.md into src/data/meetups.json.
//
//   node scripts/build-meetups.mjs
//
// Generated rather than hand-copied so the archive stays honest to the source
// file: if a meeting is added there, re-run this instead of editing the data.
// Sorted newest first, which is the order the archive shows them in.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'context', 'content', 'past-meetups.md')
const OUT = join(ROOT, 'src', 'data', 'meetups.json')

const md = await readFile(SRC, 'utf8')
const blocks = md.split(/\n### /).slice(1)

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

const field = (block, name) =>
  block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`))?.[1]?.trim() ?? null

const meetups = blocks.map((block) => {
  const lines = block.split('\n')
  const heading = lines[0].trim()
  const rawDate = field(block, 'Date')
  const speakers = field(block, 'Speakers') ?? field(block, 'Speaker')
  const title = field(block, 'Title')
  const link = block.match(/\[Event page\]\((.+?)\)/)?.[1] ?? null

  // "Tue, Sep 16, 2025 (online, 12:00 PM)" -> ISO, keeping the note separately.
  const note = rawDate?.match(/\(([^)]+)\)/)?.[1] ?? null
  const plain = rawDate?.replace(/\s*\([^)]*\)/, '').trim() ?? ''
  const m = plain.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/)
  const date = m
    ? new Date(Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2]))).toISOString().slice(0, 10)
    : null

  // Everything between the Title line and the event link is the summary.
  const body = block
    .split(/\*\*Title:\*\*.*\n/)[1]
    ?.split('[Event page]')[0]
    ?.trim()
    .replace(/\*(.+?)\*/g, '$1') ?? ''

  return { heading, date, dateLabel: plain, note, speakers, title, summary: body, link }
})

const missingDate = meetups.filter((m) => !m.date)
if (missingDate.length) {
  throw new Error(`could not parse a date for: ${missingDate.map((m) => m.heading).join(', ')}`)
}

meetups.sort((a, b) => b.date.localeCompare(a.date))
await writeFile(OUT, `${JSON.stringify(meetups, null, 2)}\n`)
console.log(`${meetups.length} meetups, ${meetups[0].date} back to ${meetups.at(-1).date}`)
console.log(`with event links: ${meetups.filter((m) => m.link).length}/${meetups.length}`)
