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
  // [C2b] permission-matrix 는 PermissionGuard(system.permission-admin) 단일 게이트(C2a 에서 외부 RoleGuard 제거).
  const routeBlock = source.match(/path: '\/admin\/permission-matrix'[\s\S]*?<PermissionMatrixPage \/>[\s\S]*?<\/PermissionGuard>/)

  expect(routeBlock?.[0]).toContain('pageCode="system.permission-admin"')
  expect(routeBlock?.[0]).not.toContain('pageCode="admin.users"')
})

// TODO: 클라이언트 readonly-cell(isSystemOnly/disabled 셀) 미구현.
// MASTER 전용 강제는 서버 시드(V37__seed_sp_d6_7_accounting_page_codes.sql 등)에서 이뤄짐.
// 후속 슬라이스에서 FE readonly-cell 구현 시 이 TODO 제거하고 단언 추가.
test('registers system.* pages under 시스템 관리 group (MASTER-only enforced server-side)', () => {
  const source = readSource('src/renderer/routes/PermissionMatrixPage.tsx')
  const routes = readSource('src/renderer/routes/index.tsx')

  // 시스템 관리 그룹 아래 3개 pageCode 실재 확인 (PermissionMatrixPage.tsx 244~248)
  expect(source).toContain("label: '시스템 관리'")
  expect(source).toContain("'system.permission-admin'")
  expect(source).toContain("'system.password-admin'")
  expect(source).toContain("'system.account-admin'")
  // 라우트 pageCode 계약 고정
  expect(routes).toContain('pageCode="system.permission-admin"')
})
