# #863 QA 출력 경로 분리 구현 계획

> **For agentic workers:** 이 계획은 현재 세션에서 인라인으로 실행한다. Git add/commit/push는 개발책임자의 지시에 따라 수행하지 않으며 PM이 대행한다.

**목표:** Desktop mock Playwright 전수 실행이 커밋된 `docs/qa/**` 증거를 변경하지 않게 하고, 커밋 경로 덮어쓰기를 명시적 환경변수 없이는 차단한다.

**아키텍처:** 실제 `*-real-qa` 스펙이 사용하는 TypeScript `resolveQaShotsDir`는 커밋 증거 디렉터리를 기본 대상으로 유지한다. mock 전용 `resolveMockQaShotsDir`는 기본적으로 같은 디렉터리의 `_local/`을 사용하고, `QA_SHOTS_DIR`가 커밋 디렉터리(또는 그 하위)를 가리킬 때 `QA_ALLOW_OVERWRITE=1` 없이는 즉시 실패한다. ESM/CommonJS 공유 helper는 범위 밖 legacy 호출의 기존 `_local` 계약을 보존하면서 mock 전용 가드 API를 추가한다.

**기술 스택:** TypeScript, Node.js built-in test runner, Playwright, PowerShell 5.1, GitHub Actions.

## 전역 제약

- mock 기본 출력은 `docs/qa/<slug>/_local/`이며 저장소 전역 `**/_local/` ignore 규칙을 사용한다.
- Playwright real-QA 기본 출력은 `docs/qa/<slug>/`이며 mock `_local` 규칙을 적용하지 않는다.
- 커밋 디렉터리 overwrite는 `QA_ALLOW_OVERWRITE=1`이라는 명시적 의사표시가 있을 때만 허용한다.
- 41개 raw `docs/qa` 참조 파일을 정적 인벤토리로 고정하고, 실제 mock writer 미보호 수는 0이어야 한다.
- `docs/qa/**` 기존 파일은 검증용으로도 삭제·복원하지 않는다. 확인용 임시 산출물은 이 워크트리 안에서 만들고 즉시 제거한다.
- Git 상태를 변경하는 명령(add/commit/push/checkout/branch/stash)은 실행하지 않는다.

---

### 작업 1: 실패하는 QA 출력 경로·덮어쓰기 가드 테스트 작성

**파일:**
- 생성: `clients/desktop/scripts/qa-output-path-guard.test.cjs`

**인터페이스:**
- 소비: `scripts/lib/qa-shots-dir.cjs`의 `resolveMockQaShotsDir(committedDir)`와 `resolveQaShotsDir(committedDir)`.
- 생산: mock raw 인벤토리 41개, 미보호 writer 0개, 커밋 경로 overwrite 차단 및 명시 허용 계약.

- [ ] **단계 1: 실패 테스트 작성**

  테스트는 다음을 실제로 단언한다.

  ```js
  test('mock raw docs/qa 인벤토리는 41개이고 직접 writer는 0개다', () => {
    assert.equal(mockQaFiles.length, 41)
    assert.deepEqual(unprotectedMockWriters, [])
  })

  test('mock resolver 기본 출력은 _local이다', () => {
    const dir = resolveMockQaShotsDir(committedDir)
    assert.equal(dir, path.join(committedDir, '_local'))
  })

  test('mock resolver가 커밋 경로 overwrite 시도를 차단한다', () => {
    process.env.QA_SHOTS_DIR = committedDir
    assert.throws(
      () => resolveMockQaShotsDir(committedDir),
      error => error.message.includes('QA_ALLOW_OVERWRITE=1'),
    )
  })

  test('QA_ALLOW_OVERWRITE=1이면 명시한 커밋 경로를 사용한다', () => {
    process.env.QA_SHOTS_DIR = committedDir
    process.env.QA_ALLOW_OVERWRITE = '1'
    assert.equal(resolveMockQaShotsDir(committedDir), committedDir)
  })

  test('real resolver는 커밋 경로를 유지한다', () => {
    delete process.env.QA_SHOTS_DIR
    assert.equal(resolveQaShotsDir(committedDir), committedDir)
  })
  ```

  인벤토리 writer 판정은 `page.screenshot`, `.screenshot`, `writeFileSync`, `copyFileSync`를 쓰는 파일 중 `resolveMockQaShotsDir` 또는 MIG 공통 helper를 소비하지 않는 파일을 반환한다. 읽기 전용 계약 파일은 직접 캡처·파일 생성을 하지 않으므로 writer 판정에서 제외한다.

- [ ] **단계 2: 실패 확인**

  실행: `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`

  예상: `resolveMockQaShotsDir is not a function` 또는 real resolver의 기본 출력이 `_local`이라는 계약 실패.

---

### 작업 2: resolver를 mock/real 경로로 분리하고 가드 구현

**파일:**
- 수정: `clients/desktop/playwright/support/qa-screenshot-dir.ts`
- 수정: `clients/desktop/playwright/support/qa-screenshot-dir.mjs`
- 수정: `scripts/lib/qa-shots-dir.cjs` (기존 legacy `resolveQaShotsDir` 출력은 유지하고 mock API만 추가)

**인터페이스:**
- 소비: Playwright TypeScript의 기존 `resolveQaShotsDir(committedDir)` 호출은 real-QA용으로 유지한다.
- 생산: mock 전용 `resolveMockQaShotsDir(committedDir)`와 `QA_ALLOW_OVERWRITE` guard. ESM/CommonJS legacy resolver의 기존 `_local` 동작은 바꾸지 않는다.

- [ ] **단계 1: 최소 구현**

  TypeScript Playwright helper는 아래 계약을 구현하고, ESM/CommonJS helper는 mock 함수에 같은 guard 계약을 추가한다.

  ```text
  resolveQaShotsDir(committedDir)
    QA_SHOTS_DIR가 있으면 그 절대경로, 없으면 committedDir

  resolveMockQaShotsDir(committedDir)
    QA_SHOTS_DIR가 없으면 committedDir/_local
    QA_SHOTS_DIR가 committedDir 또는 그 하위면 QA_ALLOW_OVERWRITE=1 없이는 throw
    그 밖의 명시 경로는 사용
  ```

  경로 비교는 `path.resolve`와 `path.relative`로 수행해 Windows 대소문자·separator 차이에서 보호 경계를 우회하지 않는다. 디렉터리 생성은 최종 경로를 검증한 뒤에만 수행한다. 에러 메시지는 한국어로 `[QA 출력 경로 가드] ... QA_ALLOW_OVERWRITE=1`을 포함한다.

- [ ] **단계 2: GREEN 확인**

  실행: `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`

  예상: 인벤토리·기본 `_local`·실제 overwrite 차단·명시 허용·real 커밋 경로 테스트가 모두 PASS.

---

### 작업 3: 41개 mock 인벤토리의 실제 출력 호출을 mock resolver로 연결

**파일:**
- 수정: `clients/desktop/playwright/mig-14-admin-ui/mig-14-helpers.ts`
- 수정: 다음 mock 캡처 스펙의 import/call: `897-column-hierarchy`, `ac-5-chip-multiselect`, `ac-825-s6-messenger-chip`, `ac-845-ds1-form-renderer`, `ac-845-ds3a-reprint-pin`, `admin-hr`, `audit`, `bank-txn-filter`, `cash-receipt-list`, `codef-connection`, `datagrid`, `dps-by-product`, `full-qa`, `groupware-approval-line-config-s4b`, `groupware-approval-line-config-s4c/create-prefill`, `groupware-approval-line-config-s4c/detail-stepview`, `journal-form-dropdown`, `menu-relocate`, `operational`, `partner-restore-qa`, `sales-purchase-query/purchase-query-page`, `sales-purchase-query/sales-query-page`, `sidebar-disabled`, `slip-collab`, `slip-form-v20`, `slip-version-history`, `sp-08-6-6-tax-invoice-emit`, `sp-09-1-nts-etax-emit-shell`, `sp-09-2-aligo-sms-real-send`, `sp-d1-dynamic-rbac`, `sp-d2-accounting-permission-migration`, `sp-d4-remaining-pages-permission-migration`, `supplier-profile`, `tax-invoice-batch`.
- 유지: `clients/desktop/playwright/*-real-qa/**`는 `resolveQaShotsDir`를 계속 사용한다.
- 유지: `863-status-badge-wrap`, `photo-audit`, `sp-08-3-dispatch-parity`, `sp-08-5-2-purchase-slip-edit-put`, `sp-08-8-credential-plaintext-guard`는 캡처 writer가 아닌 계약·읽기 스펙이므로 커밋 증거를 생성하지 않는다.

**인터페이스:**
- 소비: 작업 2의 `resolveMockQaShotsDir`.
- 생산: mock writer의 출력 디렉터리 0개가 커밋 증거 루트를 직접 가리키는 상태.

- [ ] **단계 1: mock 호출로 변경**

  기존 mock 파일의 import와 호출을 다음처럼 바꾼다.

  ```ts
  import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'
  const QA_DIR = resolveMockQaShotsDir(path.resolve(__dirname, '../../../../docs/qa/<slug>'))
  ```

  MIG 공통 helper도 동일하게 `resolveMockQaShotsDir`를 사용해 두 MIG 스펙의 `capture()`가 보호 경로를 받도록 한다. `-real-qa` 경로는 기계적으로 치환하지 않는다.

- [ ] **단계 2: 정적 guard 재실행**

  실행: `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`

  예상: `raw docs/qa files: 41`, `unprotected mock writers: 0` 및 overwrite 차단 PASS.

---

### 작업 4: CI의 실제 desktop mock hard gate에 guard 등재

**파일:**
- 수정: `.github/workflows/qa-e2e.yml`

**인터페이스:**
- 소비: 작업 1의 Node guard와 작업 3의 mock 스위트.
- 생산: `desktop-playwright` 잡에서 정적/동적 guard와 `npx playwright test`가 모두 실행되는 CI 근거.

- [ ] **단계 1: 잡에 전용 guard step 추가**

  `desktop-playwright` 잡의 `clients/desktop` 의존성 설치 직후에 다음 step을 둔다.

  ```yaml
  - name: QA 출력 경로·덮어쓰기 가드
    working-directory: clients/desktop
    run: node --test scripts/qa-output-path-guard.test.cjs
  ```

- [ ] **단계 2: 기존 mock Playwright step 보존 확인**

  같은 잡의 `Playwright 실행 (mock 회귀 hard gate — 실패 시 CI fail)` step은 그대로 두고, 새 guard step 다음에 실행되도록 한다. `paths`에는 이미 `.github/workflows/qa-e2e.yml`과 `clients/**`가 있어 이 변경과 Desktop mock 변경 모두 해당 잡을 발동시킨다.

---

### 작업 5: 실행 증거·개발 보고서 작성

**파일:**
- 생성: `docs/dev-reports/2026-07-27-863-qa-output-path.md`

- [ ] **단계 1: 41개 전수 수치 기록**

  raw 참조 파일 수 41, mock resolver writer 보호 수, 읽기 전용 계약 수, 최종 미보호 writer 수 0을 명령 출력 원문과 함께 기록한다.

- [ ] **단계 2: 실제 mock 스위트와 git status 실행**

  `clients/desktop`에서 로컬 `node_modules\\.bin\\playwright test`를 사용해 mock 스위트를 실행한다. 실행 전후 `git status --short -- docs/qa`와 `git diff -- docs/qa`를 저장하여 `docs/qa/**` 변경 0을 보고서에 붙인다. 필요하면 의존성을 해당 워크트리에만 설치한다.

- [ ] **단계 3: 실제 overwrite 차단 원문 수집**

  기존 커밋 경로를 `QA_SHOTS_DIR`로 지정하고 `QA_ALLOW_OVERWRITE` 없이 guard를 실행해 실패 원문을 보존한다. 이어 `QA_ALLOW_OVERWRITE=1` 경로는 파일을 변경하지 않는 별도 임시 디렉터리에서만 확인하고 임시 디렉터리를 제거한다.

- [ ] **단계 4: real-QA 경로 근거 기록**

  `*-real-qa` 스펙이 `resolveQaShotsDir`를 사용하고, helper의 기본 반환이 committedDir임을 소스·테스트 출력으로 제시한다. real-QA를 실행해 커밋 증거를 덮어쓰지는 않는다.

- [ ] **단계 5: CI 근거 기록**

  `.github/workflows/qa-e2e.yml`의 `desktop-playwright` 잡과 두 step 이름, workflow paths를 보고서에 기록한다.

---

## 계획 자체 점검

- 기획서 불변식 1~5는 작업 1~5에 각각 매핑했다.
- raw `docs/qa` 41개와 실제 writer 보호 0개를 분리해 측정하므로 주석·읽기 전용 계약 파일을 잘못 writer로 판정하지 않는다.
- Playwright real-QA는 기존 함수명과 커밋 경로를 유지하고, mock만 새 함수로 전환한다. 범위 밖 ESM/CommonJS legacy 호출의 `_local` 동작은 보존한다.
- `QA_ALLOW_OVERWRITE` 없이 커밋 경로를 지정하는 경우 resolver 단계에서 실패하므로 실제 쓰기 전에 조용히 덮어쓸 수 없다.
- 커밋 단계는 사용자의 Git 금지 지시에 따라 계획에서 제외했다.
