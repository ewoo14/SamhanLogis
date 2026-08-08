import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PAGE_GROUPS, PAGES_ORDER } from './permissionPageCatalog'

const PAGE_CODE_ENUM_PATH = resolve(
  process.cwd(),
  '../../services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java',
)
const PERMISSIONS_API_PATH = resolve(process.cwd(), 'src/renderer/api/permissionsApi.ts')
const FRONTEND_REMOVED_BACKEND_PAGE_CODES = new Set([
  // V91/V92에서 5개 권한 정본의 활성 grant를 모두 soft-delete한 dead page-code.
  'notification.dispatch-sms.send-audit',
  // public endpoint가 internal endpoint로 이관되어 FE @RequirePermission 소비처가 사라진 dead page-code.
  'slip.period-lock',
])

function readPageCodeEnumSource(): string {
  if (!existsSync(PAGE_CODE_ENUM_PATH)) {
    throw new Error(
      `BE PageCode enum 파일을 읽을 수 없습니다: ${PAGE_CODE_ENUM_PATH}. ` +
        'desktop vitest는 clients/desktop cwd에서 실행되어야 합니다.',
    )
  }

  return readFileSync(PAGE_CODE_ENUM_PATH, 'utf8')
}

function extractBackendPageCodes(source: string): Set<string> {
  const enumConstantCodePattern = /^\s*[A-Z0-9_]+\s*\(\s*"([a-z0-9.-]+)"\s*,/gm
  return new Set(Array.from(source.matchAll(enumConstantCodePattern), (match) => match[1]))
}

function readPermissionsApiSource(): string {
  if (!existsSync(PERMISSIONS_API_PATH)) {
    throw new Error(
      `permissionsApi.ts 파일을 읽을 수 없습니다: ${PERMISSIONS_API_PATH}. ` +
        'desktop vitest는 clients/desktop cwd에서 실행되어야 합니다.',
    )
  }

  return readFileSync(PERMISSIONS_API_PATH, 'utf8')
}

function extractFrontendPageCodeUnion(source: string): Set<string> {
  const unionBlockPattern = /export\s+type\s+PageCode\s*=([\s\S]*?)(?=\n\/\*\*|\nexport\s+(?:interface|type|const|function|async)|\n\/\/ -{10,}|$)/
  const unionBlock = source.match(unionBlockPattern)?.[1] ?? ''
  const pageCodeUnionMemberPattern = /\|\s*'([a-z0-9.-]+)'/g
  return new Set(Array.from(unionBlock.matchAll(pageCodeUnionMemberPattern), (match) => match[1]))
}

function extractFrontendPageCodes(): Set<string> {
  const groupedPages = PAGE_GROUPS.flatMap((group) => group.pages)
  // PAGES_ORDER는 groupedPages를 중복 선언하므로 두 목록 모두 BE enum과의 고아값 검사를 통과해야 한다.
  return new Set([...groupedPages, ...PAGES_ORDER])
}

describe('permission page catalog parity', () => {
  it('keeps every desktop permission page-code registered in BE PageCode enum', () => {
    const backendPageCodes = extractBackendPageCodes(readPageCodeEnumSource())
    const frontendPageCodes = extractFrontendPageCodes()

    expect(
      backendPageCodes.size,
      `PageCode.java에서 page-code를 0건 추출했습니다. enum 상수 생성자 포맷 변경 여부를 확인하세요: ${PAGE_CODE_ENUM_PATH}`,
    ).toBeGreaterThan(0)
    expect(frontendPageCodes.size, 'FE PAGE_GROUPS/PAGES_ORDER page-code가 비어 있습니다.').toBeGreaterThan(0)

    const frontendOnlyOrphans = Array.from(frontendPageCodes)
      .filter((pageCode) => !backendPageCodes.has(pageCode))
      .sort()

    expect(
      frontendOnlyOrphans,
      `FE 권한 카탈로그가 BE PageCode enum에 없는 page-code를 참조합니다: ${frontendOnlyOrphans.join(', ')}`,
    ).toEqual([])
  })

  it('keeps the desktop row catalog complete and duplicate-free against BE PageCode', () => {
    const backendPageCodes = extractBackendPageCodes(readPageCodeEnumSource())
    const groupedPages = PAGE_GROUPS.flatMap((group) => group.pages)
    const expectedBackendOnlyPageCodes = new Set(FRONTEND_REMOVED_BACKEND_PAGE_CODES)
    const backendOnlyMissingRows = Array.from(backendPageCodes)
      .filter((pageCode) => !groupedPages.includes(pageCode))
      .filter((pageCode) => !expectedBackendOnlyPageCodes.has(pageCode))
      .sort()

    expect(
      new Set(groupedPages).size,
      'desktop 권한 행 목록에 중복 page-code가 있습니다.',
    ).toBe(groupedPages.length)
    expect(
      backendOnlyMissingRows,
      `BE 런타임 PageCode가 desktop 권한 행에서 누락되었습니다: ${backendOnlyMissingRows.join(', ')}`,
    ).toEqual([])
  })

  it('keeps permissionsApi PageCode union aligned with BE PageCode enum', () => {
    const backendPageCodes = extractBackendPageCodes(readPageCodeEnumSource())
    const frontendUnionPageCodes = extractFrontendPageCodeUnion(readPermissionsApiSource())

    expect(
      backendPageCodes.size,
      `PageCode.java에서 page-code를 0건 추출했습니다. enum 상수 생성자 포맷 변경 여부를 확인하세요: ${PAGE_CODE_ENUM_PATH}`,
    ).toBeGreaterThan(0)
    expect(
      frontendUnionPageCodes.size,
      `permissionsApi.ts PageCode union에서 page-code를 0건 추출했습니다. union literal 포맷 변경 여부를 확인하세요: ${PERMISSIONS_API_PATH}`,
    ).toBeGreaterThan(0)

    const frontendUnionOnlyOrphans = Array.from(frontendUnionPageCodes)
      .filter((pageCode) => !backendPageCodes.has(pageCode))
      .sort()
    const backendOnlyMissingUnionMembers = Array.from(backendPageCodes)
      .filter((pageCode) => !frontendUnionPageCodes.has(pageCode))
      .filter((pageCode) => !FRONTEND_REMOVED_BACKEND_PAGE_CODES.has(pageCode))
      .sort()

    expect(
      frontendUnionOnlyOrphans,
      `permissionsApi.ts PageCode union이 BE PageCode enum에 없는 page-code를 포함합니다: ${frontendUnionOnlyOrphans.join(', ')}`,
    ).toEqual([])
    expect(
      backendOnlyMissingUnionMembers,
      `permissionsApi.ts PageCode union이 BE PageCode enum page-code를 누락했습니다: ${backendOnlyMissingUnionMembers.join(', ')}`,
    ).toEqual([])
  })

  it('keeps backend-only removed page-codes out of the desktop catalog and union', () => {
    const frontendPageCodes = extractFrontendPageCodes()
    const frontendUnionPageCodes = extractFrontendPageCodeUnion(readPermissionsApiSource())

    for (const pageCode of FRONTEND_REMOVED_BACKEND_PAGE_CODES) {
      expect(frontendPageCodes.has(pageCode), `${pageCode}는 FE 권한 카탈로그에 노출되면 안 됩니다.`).toBe(false)
      expect(frontendUnionPageCodes.has(pageCode), `${pageCode}는 permissionsApi PageCode union에 남으면 안 됩니다.`).toBe(false)
    }
  })

  it('keeps the S25 closed-date permission rows visible while deprecated rows stay hidden', () => {
    const frontendPageCodes = extractFrontendPageCodes()

    expect(frontendPageCodes.has('slip.closed-date-exception')).toBe(true)
    expect(frontendPageCodes.has('slip.closed-date-admin')).toBe(true)
    expect(frontendPageCodes.has('notification.dispatch-sms.send-audit')).toBe(false)
    expect(frontendPageCodes.has('slip.period-lock')).toBe(false)
  })
})
