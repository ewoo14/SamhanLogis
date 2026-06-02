import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('permission matrix route guard uses system.permission-admin PageCode', () => {
  const source = readSource('src/renderer/routes/index.tsx')
  const routeBlock = source.match(/path: '\/admin\/permission-matrix'[\s\S]*?<PermissionMatrixPage \/>[\s\S]*?<\/RoleGuard>/)

  expect(routeBlock?.[0]).toContain('pageCode="system.permission-admin"')
  expect(routeBlock?.[0]).not.toContain('pageCode="admin.users"')
})

test('permission matrix renders system.* pages as MASTER-only readonly cells', () => {
  const source = readSource('src/renderer/routes/PermissionMatrixPage.tsx')
  const routes = readSource('src/renderer/routes/index.tsx')

  expect(source).toContain("label: '시스템 관리'")
  expect(source).toContain("'system.permission-admin'")
  expect(routes).toContain('pageCode="system.permission-admin"')
})
