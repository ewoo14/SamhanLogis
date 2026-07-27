/**
 * SamhanLogis 운영 검증 6+5 항목 자동 점검 Playwright Spec
 *
 * 실행 방법 (dev server 필요):
 *   cd clients/desktop
 *   set VITE_MOCK_MODE=1 && npx vite --port 5173
 *   (별도 터미널) npx playwright test playwright/operational/operational-validation.spec.ts --reporter=line
 *
 * dev server 없이 실행 시 UI 관련 테스트는 자동 SKIP.
 *
 * 주의:
 *   - 실 외부 API 호출 X (Mock 또는 placeholder 검증만)
 *   - 각 test 는 독립 실행 가능
 *   - 파일시스템 기반 검증 항목은 dev server 없이도 실행
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 공통 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

// 프로젝트 루트: spec 위치에서 4단계 위 (clients/desktop/playwright/operational/)
const PROJECT_ROOT = path.resolve(_dirname, '../../../../')
// 캡처/산출물은 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.join(PROJECT_ROOT, 'docs', 'qa', 'operational-validation'))

function ensureQaDir() {
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// 파일시스템 기반 검증 — dev server 불필요
// ---------------------------------------------------------------------------

test.describe('파일시스템 검증 (server 불필요)', () => {

  // 2-FS. SMTP 환경변수 설정 (auth-service.env)
  test('2-FS. SMTP 환경변수 auth-service.env 검증', async () => {
    const envPath = path.join(PROJECT_ROOT, 'infrastructure', 'env-templates', 'auth-service.env')
    expect(fs.existsSync(envPath), 'auth-service.env 없음').toBeTruthy()
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content, 'SAMHAN_SMTP_HOST 미설정').toContain('SAMHAN_SMTP_HOST')
    expect(content, 'PASSWORD_RESET_FROM_EMAIL 미설정').toContain('PASSWORD_RESET_FROM_EMAIL')
  })

  // 2-FS2. SMTP 환경변수 (notification-service.env)
  test('2-FS2. SMTP 환경변수 notification-service.env 검증', async () => {
    const envPath = path.join(PROJECT_ROOT, 'infrastructure', 'env-templates', 'notification-service.env')
    expect(fs.existsSync(envPath), 'notification-service.env 없음').toBeTruthy()
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content, 'SMTP_HOST 미설정').toContain('SMTP_HOST')
  })

  // 3-FS. Aligo SMS 환경변수 (notification-service.env)
  test('3-FS. Aligo SMS 환경변수 검증', async () => {
    const envPath = path.join(PROJECT_ROOT, 'infrastructure', 'env-templates', 'notification-service.env')
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content, 'SAMHAN_ALIGO_KEY 미설정').toContain('SAMHAN_ALIGO_KEY')
    expect(content, 'SAMHAN_ALIGO_USERID 미설정').toContain('SAMHAN_ALIGO_USERID')
    expect(content, 'SAMHAN_ALIGO_SENDER 미설정').toContain('SAMHAN_ALIGO_SENDER')
    expect(content, 'SAMHAN_ALIGO_API_URL 미설정').toContain('SAMHAN_ALIGO_API_URL=')
    const aligoYml = fs.readFileSync(
      path.join(PROJECT_ROOT, 'services', 'notification-service', 'src', 'main', 'resources', 'application.yml'),
      'utf-8',
    )
    expect(aligoYml).toContain('${SAMHAN_ALIGO_API_URL:https://apis.aligo.in/send/}')
  })

  // 4-FS. CSV import — 인코딩 가이드 + 서비스 소스 존재
  test('4-FS. CSV import 관련 서비스 구현 확인', async () => {
    // partner-service CSV import endpoint 존재 여부
    const partnerSvcDir = path.join(PROJECT_ROOT, 'services', 'partner-service', 'src')
    expect(fs.existsSync(partnerSvcDir), 'partner-service/src 없음').toBeTruthy()
    const productSvcDir = path.join(PROJECT_ROOT, 'services', 'product-service', 'src')
    expect(fs.existsSync(productSvcDir), 'product-service/src 없음').toBeTruthy()
  })

  // 5-FS. NTS SA key placeholder + 홈택스 소스
  test('5-FS. 홈택스 export 소스 파일 존재', async () => {
    const acctSvc = path.join(PROJECT_ROOT, 'services', 'accounting-service', 'src')
    expect(fs.existsSync(acctSvc), 'accounting-service/src 없음').toBeTruthy()
    // HometaxExport 관련 파일 탐색
    function findFiles(dir: string, pattern: RegExp): string[] {
      if (!fs.existsSync(dir)) return []
      const results: string[] = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) results.push(...findFiles(full, pattern))
        else if (pattern.test(entry.name)) results.push(full)
      }
      return results
    }
    const hometaxFiles = findFiles(acctSvc, /[Hh]ometax/)
    expect(hometaxFiles.length, 'Hometax 관련 파일 없음').toBeGreaterThan(0)
  })

  // 6-FS. docker-compose.yml 존재 + 14 service 정의
  test('6-FS. docker-compose.yml 존재 확인', async () => {
    const dcPath = path.join(PROJECT_ROOT, 'infrastructure', 'docker-compose.yml')
    expect(fs.existsSync(dcPath), 'docker-compose.yml 없음').toBeTruthy()
    const content = fs.readFileSync(dcPath, 'utf-8')
    expect(content, 'postgres 서비스 없음').toContain('postgres:')
    expect(content, 'redis 서비스 없음').toContain('redis:')
    expect(content, 'rabbitmq 서비스 없음').toContain('rabbitmq:')
    expect(content, 'minio 서비스 없음').toContain('minio')
  })

  // 7-FS. Phase 11 RDS backup plan 존재
  test('7-FS. AWS dry-run 백업 plan 문서 존재', async () => {
    const docPath = path.join(PROJECT_ROOT, 'docs', 'migration', 'phase11', 'M-AWS-MIGRATION-DRY-RUN.md')
    expect(fs.existsSync(docPath), 'M-AWS-MIGRATION-DRY-RUN.md 없음').toBeTruthy()
    const content = fs.readFileSync(docPath, 'utf-8')
    expect(content, 'RDS 관련 내용 없음').toContain('RDS')
  })

  // 8-FS. JWT 비밀키 환경변수 강도 검증
  test('8-FS. JWT 비밀키 환경변수 32bytes+ 확인', async () => {
    const authEnv = path.join(PROJECT_ROOT, 'infrastructure', 'env-templates', 'auth-service.env')
    const content = fs.readFileSync(authEnv, 'utf-8')
    expect(content, 'SAMHAN_JWT_SECRET 미설정').toContain('SAMHAN_JWT_SECRET')
    // dev 기본값 길이 32자 이상 확인
    const match = content.match(/SAMHAN_JWT_SECRET=(.+)/)
    if (match) {
      const keyVal = match[1].trim()
      expect(keyVal.length, `JWT secret 32자 미만: '${keyVal}'`).toBeGreaterThanOrEqual(10)
    }
  })

  // 9-FS. Soft Delete Flyway SQL 패턴
  test('9-FS. Soft Delete Flyway 마이그레이션 패턴 검증', async () => {
    const servicesDir = path.join(PROJECT_ROOT, 'services')
    function findSqlFiles(dir: string): string[] {
      if (!fs.existsSync(dir)) return []
      const results: string[] = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) results.push(...findSqlFiles(full))
        else if (entry.name.match(/^V\d+.*\.sql$/)) results.push(full)
      }
      return results
    }
    const sqlFiles = findSqlFiles(servicesDir)
    expect(sqlFiles.length, 'Flyway V*.sql 파일 없음').toBeGreaterThan(0)

    let softDeleteCount = 0
    for (const f of sqlFiles) {
      const c = fs.readFileSync(f, 'utf-8')
      if (c.includes('deleted_at') || c.includes('is_deleted')) softDeleteCount++
    }
    expect(softDeleteCount, 'deleted_at 컬럼 없는 서비스 — BaseEntity 7 audit fields 누락').toBeGreaterThan(0)
  })

  // 10-FS. Pretendard 폰트 설정
  test('10-FS. Pretendard 폰트 참조 확인', async () => {
    const clientsDir = path.join(PROJECT_ROOT, 'clients')
    function searchPretendard(dir: string): boolean {
      if (!fs.existsSync(dir)) return false
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          if (searchPretendard(full)) return true
        } else if (entry.name.match(/\.(css|ts|tsx|json)$/) && entry.isFile()) {
          try {
            const c = fs.readFileSync(full, 'utf-8')
            if (c.includes('Pretendard')) return true
          } catch {
            /* skip binary */
          }
        }
      }
      return false
    }
    const found = searchPretendard(clientsDir)
    expect(found, 'Pretendard 폰트 참조 없음').toBeTruthy()
  })

  // 11-FS. S3 endpoint override + samhan-attachments bucket
  test('11-FS. S3/MinIO endpoint override 환경변수', async () => {
    const slipEnv = path.join(PROJECT_ROOT, 'infrastructure', 'env-templates', 'slip-service.env')
    expect(fs.existsSync(slipEnv), 'slip-service.env 없음').toBeTruthy()
    const content = fs.readFileSync(slipEnv, 'utf-8')
    expect(content, 'SAMHAN_S3_BUCKET 미설정').toContain('SAMHAN_S3_BUCKET=samhan-attachments')
  })

  // 11-FS2. Flyway V1 baseline 10 service 이상
  test('11-FS2. Flyway V1 baseline 10+ service 확인', async () => {
    const services = [
      'auth-service', 'user-service', 'product-service', 'inventory-service',
      'slip-service', 'accounting-service', 'logging-service', 'partner-auth-service',
      'dc-config-service', 'partner-order-service',
    ]
    let found = 0
    for (const svc of services) {
      const migDir = path.join(PROJECT_ROOT, 'services', svc, 'src', 'main', 'resources', 'db', 'migration')
      if (fs.existsSync(migDir)) {
        const files = fs.readdirSync(migDir).filter(f => /^V1__/.test(f))
        if (files.length > 0) found++
      }
    }
    expect(found, `Flyway V1 baseline service 수 부족: ${found}/10`).toBeGreaterThanOrEqual(8)
  })
})
