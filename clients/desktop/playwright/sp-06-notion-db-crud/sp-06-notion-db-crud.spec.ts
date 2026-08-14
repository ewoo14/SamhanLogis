import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function ymlRouteBlock(text: string, routeId: string): string {
  const start = text.indexOf(`- id: ${routeId}`)
  if (start < 0) return ''
  const next = text.indexOf('\n        - id:', start + 1)
  return text.slice(start, next < 0 ? text.length : next)
}

test.describe('SP-06 Notion-origin data is Samhan Public DB CRUD', () => {
  const gateway = read('services/api-gateway/src/main/resources/application.yml')
  const chatController = read('services/notification-service/src/main/java/com/samhanair/logis/notification/controller/ChatRoomMappingAdminController.java')
  const chatService = read('services/notification-service/src/main/java/com/samhanair/logis/notification/service/ChatRoomMappingService.java')
  const chatApi = read('clients/desktop/src/renderer/api/chatRoomApi.ts')
  const blockController = read('services/partner-service/src/main/java/com/samhanair/logis/partner/controller/PartnerBlockAdminController.java')
  const blockService = read('services/partner-service/src/main/java/com/samhanair/logis/partner/service/PartnerBlockService.java')
  const blockApi = read('clients/desktop/src/renderer/api/blockedPartnerApi.ts')
  const blockPage = read('clients/desktop/src/renderer/routes/admin/BlockedPartnersPage.tsx')
  const regionController = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/RegionAdminController.java')
  const regionService = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionService.java')
  const regionApi = read('clients/desktop/src/renderer/api/regionApi.ts')
  const regionPage = read('clients/desktop/src/renderer/routes/admin/RegionsPage.tsx')
  const dcController = read('services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/PartnerDcConfigsController.java')
  const dcImportController = read('services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/DcConfigImportController.java')
  const dcPage = read('clients/desktop/src/renderer/routes/SalesPartnerDcConfigPage.tsx')
  const dcImportApi = read('clients/desktop/src/renderer/api/dcConfigImportApi.ts')
  const importScript = read('tools/operational-validation/import-notion-csv.ps1')
  const smokeScript = read('tools/operational-validation/run-smoke-tests.ps1')
  const orderAppHtml = read('clients/web/order-app/index.html')
  const orderAppShim = read('clients/web/order-app/src/samhanApi.ts')
  const partnerAuthSecurityConfig = read('services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/config/SecurityConfig.java')
  const partnerAuthHeaderFilter = read('services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/config/HeaderAuthenticationFilter.java')
  const operationalDoc = read('docs/operational-validation/notion-csv-import-validation.md')
  const sp04Report = read('docs/dev-reports/sp-04-full-menu-legacy-gas-notion-audit.md')

  test('단톡방리스트는 notification DB/API가 소유하고 Notion runtime이 아니다', () => {
    expect(chatController).toContain('@RequestMapping("/api/v1/notification/admin/chat-rooms")')
    expect(chatController).toContain('@GetMapping')
    expect(chatController).toContain('@PostMapping')
    expect(chatController).toContain('@PostMapping("/import")')
    expect(chatController).toContain('@DeleteMapping("/{id}")')
    expect(chatService).toContain('PartnerChatRoomMappingRepository')
    expect(chatApi).toContain('/api/v1/notification/admin/chat-rooms')
  })

  test('발송금지리스트 is owned by partner DB and desktop CRUD, not Notion runtime', () => {
    expect(blockController).toContain('@RequestMapping("/api/v1/partners/admin/blocks")')
    expect(blockController).toContain('@GetMapping')
    expect(blockController).toContain('@PostMapping')
    expect(blockController).toContain('@PostMapping(value = "/import"')
    expect(blockController).toContain('@DeleteMapping("/{id}")')
    expect(blockService).toContain('BlockedPartnerRepository')
    expect(blockApi).toContain('/api/v1/partners/admin/blocks')
    expect(blockPage).toContain('단건 차단')
    expect(blockPage).toContain('CSV 업로드')
    expect(blockPage).not.toMatch(/https:\/\/www\.notion\.so|notion\.site/)
  })

  test('배차지역 분류표 is owned by arologis DB and desktop CRUD, not Notion runtime', () => {
    expect(regionController).toContain('@RequestMapping("/admin/arologis/regions")')
    expect(regionController).toContain('@GetMapping')
    expect(regionController).toContain('@PostMapping')
    expect(regionController).toContain('@PostMapping("/import")')
    expect(regionController).toContain('@PutMapping("/{id}")')
    expect(regionController).toContain('@DeleteMapping("/{id}")')
    expect(regionService).toContain('RegionDispatchClassificationRepository')
    expect(regionApi).toContain('/admin/arologis/regions')
    expect(regionPage).toContain('배차지역 관리')
    expect(regionPage).toContain('단건 추가')
    expect(regionPage).toContain('CSV 업로드')
    expect(regionPage).not.toMatch(/https:\/\/www\.notion\.so|notion\.site/)
  })

  test('거래처 DC정보 is owned by dc-config DB and desktop CRUD with DB seed upload', () => {
    expect(dcController).toContain('@RequestMapping("/api/v1/partner-dc-configs")')
    expect(dcController).toContain('@GetMapping')
    expect(dcController).toContain('@PatchMapping("/{partnerCode}")')
    expect(dcImportController).toContain('@RequestMapping("/api/v1/dc-config/admin")')
    expect(dcImportController).toContain('@PostMapping(value = "/import"')
    expect(dcImportApi).toContain('/api/v1/dc-config/admin/import')
    expect(dcPage).toContain('거래처 DC 설정')
    expect(dcPage).toContain('CSV 일괄 업로드')
    expect(dcPage).not.toMatch(/https:\/\/www\.notion\.so|notion\.site/)
  })

  test('gateway preserves full API paths for DB-backed CRUD endpoints', () => {
    const chatRoute = ymlRouteBlock(gateway, 'notification-chat-rooms-v1')
    expect(chatRoute).toContain('Path=/api/v1/notification/admin/chat-rooms/**')
    expect(chatRoute).not.toContain('StripPrefix')
    expect(chatRoute).toContain('JwtAuthentication')

    const blockRoute = ymlRouteBlock(gateway, 'partner-blocks-v1')
    expect(blockRoute).toContain('Path=/api/v1/partners/admin/blocks/**')
    expect(blockRoute).not.toMatch(/-\s*StripPrefix/)
    expect(blockRoute).toContain('JwtAuthentication')

    const dcRoute = ymlRouteBlock(gateway, 'dc-config-admin-v1')
    expect(dcRoute).toContain('Path=/api/v1/dc-config/admin/**')
    expect(dcRoute).not.toContain('StripPrefix')
    expect(dcRoute).toContain('JwtAuthentication')

    const approvalsRoute = ymlRouteBlock(gateway, 'partner-auth-approvals-v1')
    expect(approvalsRoute).toContain('Path=/api/v1/partner-approvals/**')
    expect(approvalsRoute).not.toContain('StripPrefix')
    expect(approvalsRoute).toContain('JwtAuthentication')
  })

  test('partner approval gateway route is accepted by downstream header authentication', () => {
    // [2026-06-11 사이클2 박제 갱신] partner-auth 는 shared:security InternalTokenFilter 를 명시 배선(13 service 표준)
    //   한 뒤 HeaderAuthenticationFilter 를 그 다음에 배선한다(2단 체인). 구 단일 addFilterBefore(HeaderAuthenticationFilter)
    //   박제를 새 배선으로 갱신 — HeaderAuthenticationFilter 는 여전히 체인에 존재해 X-User-* 다운스트림 처리 보존.
    expect(partnerAuthSecurityConfig).toContain('addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)')
    expect(partnerAuthSecurityConfig).toContain('addFilterAfter(new HeaderAuthenticationFilter(), InternalTokenFilter.class)')
    expect(partnerAuthHeaderFilter).toContain('X-User-Id')
    // C5 후속: role header 는 무시하고 groups header 로 GROUP_ authority 만 생성한다.
    expect(partnerAuthHeaderFilter).toContain('X-User-Groups')
    expect(partnerAuthHeaderFilter).toContain('GROUP_')
    expect(partnerAuthHeaderFilter).not.toContain('ROLE_')
  })

  test('docs state migration into our DB followed by DB CRUD, not Notion runtime dependency', () => {
    expect(operationalDoc).toContain('DB 이관')
    expect(operationalDoc).toContain('이후 조회·수정·삭제는 Samhan Public DB CRUD')
    expect(sp04Report).toContain('노션 원본 데이터를 Samhan Public DB로 이관')
    expect(sp04Report).toContain('이후 화면/API는 우리 DB CRUD만 사용')
  })

  test('DB migration script follows local service port overrides', () => {
    expect(importScript).toContain('DB 이관')
    expect(importScript).toContain("local-stack-port.ps1")
    expect(importScript).toContain("Get-LocalStackPort -Service 'arologis-service'")
    expect(importScript).toContain("Get-LocalStackPort -Service 'dc-config-service'")
    expect(importScript).toContain("Get-LocalStackPort -Service 'notification-service'")
    expect(importScript).toContain("Get-LocalStackPort -Service 'partner-service'")
    expect(importScript).toContain('$arologisPort')
    expect(importScript).toContain('$dcConfigPort')
    expect(importScript).toContain('$notificationPort')
    expect(importScript).toContain('$partnerPort')
    expect(importScript).toContain("Get-LocalStackPort -Service 'api-gateway'")
    expect(importScript).not.toContain('Resolve-ImportServicePort')
    expect(importScript).not.toContain('Test-ImportHealthPort -Port $fallback')
  })

  test('operational smoke script reuses resolved service ports for DB CRUD validation', () => {
    expect(smokeScript).toContain('$servicePortByName')
    expect(smokeScript).toContain('$GatewayUrl = "http://localhost:$($servicePortByName[\'api-gateway\'])"')
    expect(smokeScript).toContain('$servicePortByName[\'partner-service\']')
    expect(smokeScript).toContain('$servicePortByName[\'notification-service\']')
    expect(smokeScript).toContain('$servicePortByName[\'dashboard-service\']')
  })

  test('active web order app does not keep a Notion HTTP endpoint', () => {
    expect(orderAppHtml).not.toContain('https://api.notion.com')
    expect(orderAppHtml).not.toContain('Notion-Version')
    expect(orderAppHtml).toContain('google.script.run.logFrontEvent')
    expect(orderAppHtml).toContain(".logFrontEvent(String(safeBizCode), 'legacy-action', dbLogMessage, isMobileNow())")
    expect(orderAppShim).toContain('args.length >= 4 ? second : first')
    expect(orderAppShim).toContain('args.length >= 4 ? third : second')
  })
})
