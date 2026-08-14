import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type CatalogEntry = {
  route: string
  pageCode: string
  order: number
}

const desktopRoot = process.cwd()
const catalogSource = fs.readFileSync(
  path.resolve(desktopRoot, '../../services/auth-service/src/main/java/com/samhanair/logis/auth/menu/MenuCatalog.java'),
  'utf8',
)
const mockSource = fs.readFileSync(path.resolve(desktopRoot, 'src/renderer/api/mock.ts'), 'utf8')

function readServerCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = []
  const entryPattern = /entry\("samhan-public",\s*"[^"]*",\s*"[^"]*",\s*"([^"]+)",\s*"([^"]+)",\s*(\d+)\)/g
  for (const match of catalogSource.matchAll(entryPattern)) {
    entries.push({ route: match[1], pageCode: match[2], order: Number(match[3]) })
  }
  return entries
}

function readMockCatalog(): CatalogEntry[] {
  const publicCatalog = mockSource.match(/const publicCatalog = \[(.*?)\n    \]/s)?.[1] ?? ''
  const entries: CatalogEntry[] = []
  const entryPattern = /route: '([^']+)', pageCode: '([^']+)', order: (\d+)/g
  for (const match of publicCatalog.matchAll(entryPattern)) {
    entries.push({ route: match[1], pageCode: match[2], order: Number(match[3]) })
  }
  return entries
}

describe('mock menu catalog parity', () => {
  it('matches every samhan-public server catalog entry, including accounting bank-card admin', () => {
    const serverEntries = readServerCatalog()
    const mockEntries = readMockCatalog()

    expect(serverEntries).toHaveLength(92)
    expect(mockEntries).toEqual(serverEntries)
    expect(mockEntries.some((entry) => entry.pageCode === 'accounting.bank-card-admin')).toBe(true)
  })

  it('does not resurrect the removed chat entry', () => {
    expect(readMockCatalog().some((entry) => entry.pageCode === 'messenger.admin')).toBe(false)
    expect(readMockCatalog().some((entry) => entry.route === '/admin/chat-rooms')).toBe(false)
  })
})
