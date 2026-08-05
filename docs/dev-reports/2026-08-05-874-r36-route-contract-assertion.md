# #874 R36 라우트 계약 단언 정정

- 작업일: 2026-08-05
- 브랜치: `feat/874-set-riusage-global-dc`
- 기준 HEAD: `2edf75405f911b3f4f34003bb7d4a6e5f0594a9d`
- 범위: `clients/desktop/playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts`와 문서 계약 판정
- 커밋/스테이징/푸시: 하지 않음

## 1. 계약 변경 여부 판정

### 라우트

R35의 `clients/desktop/src/renderer/routes/index.tsx` 변경을 `origin/main`과 대조했다.

```text
origin/main
{ path: '/sales/:id', element: <SlipDetailPage mode="OUTBOUND" /> }
{ path: '/purchases/:id', element: <SlipDetailPage mode="INBOUND" /> }
```

R35 이후에도 계약 내용은 다음과 같다.

```text
/sales/:id
  PermissionGuard(pageCode="sales.slip.list", action="view")
    SlipReadGuard(mode="OUTBOUND")
      SlipDetailPage(mode="OUTBOUND")

/purchases/:id
  PermissionGuard(pageCode="purchases.slip.list", action="view")
    SlipReadGuard(mode="INBOUND")
      SlipDetailPage(mode="INBOUND")
```

즉, R35는 권한 가드를 추가했지만 어느 경로가 어떤 화면·전표 유형으로 가는지는 바꾸지 않았다. 진입 목록도 `SalesQueryPage.tsx`의 `navigate(`/sales/${row.id}`)`, `PurchaseQueryPage.tsx`의 `navigate(`/purchases/${row.id}`)`로 유지된다.

결론: **계약 변경 없음. R35 라우트 설계 결함이 아니라 소스 서식에 종속된 단언 결함이다.**

### 문서

`docs/manual/inventory/frontend-feature-inventory.md`는 다음 동선을 기술한다.

```text
판매관리와 구매관리는 목록에서 명시 상세 버튼으로 `/sales/:id`, `/purchases/:id`에 진입한다.
```

실제 목록 페이지의 두 `navigate` 경로와 일치하므로 문서가 기술하는 동선도 바뀌지 않았다. 문서 단언은 내용은 유지하되 공백·줄바꿈만 정규화하도록 조정했다.

## 2. 조치

`sp-05-crud-surface.spec.ts`만 수정했다.

- `typescript` AST로 `routes` 배열의 `path`와 같은 라우트 객체의 `element`를 찾는다.
- `/sales/:id`와 `/purchases/:id`가 각각 정확히 하나 존재하는지 단정한다.
- 해당 `element` 하위에 `SlipDetailPage`와 기대하는 `mode`가 있는지 단정한다.
- 따라서 `PermissionGuard`·`SlipReadGuard` 래핑, 줄바꿈, 객체 리터럴 배치가 바뀌어도 통과한다.
- 경로가 다른 화면으로 연결되거나 `mode`가 바뀌면 AST 계약 단언이 실패한다.
- 문서 동선 단언은 공백·줄바꿈을 정규화한 뒤 `/sales/:id`, `/purchases/:id`, 목록의 명시 상세 버튼, 진입 의미를 확인한다.

### 라우트 리터럴 단언 전수 확인

기존 `routes.toContain("{ path: ..., element: <SlipDetailPage ... /> }")` 형태의 라우트 리터럴 단언은 다음 2건이었다.

```text
판매: /sales/:id → OUTBOUND
구매: /purchases/:id → INBOUND
```

두 건 모두 AST 계약 단언으로 바꿨으며, 동일 파일에 남은 라우트 리터럴 단언은 없다. 페이지의 공개 업무번호 test id, `navigate`, 접근성 라벨, UUID 노출 금지 단언과 문서의 부재 정정 단언은 유지했다.

## 3. 양방향 RED 보존

- A1: R35의 편집 진입점 배타화 코드는 수정하지 않았다.
- A2: R35의 유형별 메뉴→목록→상세 권한 가드는 수정하지 않았다.
- A3: R32/R33의 `409` 분류(`inventory`·`concurrent`·`unknown`) 코드는 수정하지 않았다.
- A4: R33의 `전표 삭제`·`전표 취소` 라벨 분리 코드는 수정하지 않았다.
- B1/B2: 두 로컬 Playwright 게이트가 통과했다.
- B3: 라우트의 실제 `path`→`SlipDetailPage mode` 관계를 AST로 검사하므로 계약 변경은 실패하고 래핑·서식 변경은 통과한다.

## 4. 로컬 실행 원문

### SP-05 단독 스펙

```text
cd clients/desktop
npx playwright test playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts

Running 3 tests using 1 worker

[1/3] [chromium] › playwright\sp-05-crud-surface\sp-05-crud-surface.spec.ts:113:3 › SP-05 Samhan Public CRUD surface › 판매관리 목록은 공개 판매번호 기반 상세 버튼으로 전표 상세에 진입한다
[2/3] [chromium] › playwright\sp-05-crud-surface\sp-05-crud-surface.spec.ts:127:3 › SP-05 Samhan Public CRUD surface › 구매관리 목록은 공개 구매번호 기반 상세 버튼으로 전표 상세에 진입한다
[3/3] [chromium] › playwright\sp-05-crud-surface\sp-05-crud-surface.spec.ts:141:3 › SP-05 Samhan Public CRUD surface › SP-05 문서는 거래처 UI와 입고 검수 CTA의 현재 구현 상태를 우선 반영한다
  3 passed (5.6s)
```

### 문서 본문 단언 스펙 잡과 동일한 명령

`.github/workflows/docs-guard.yml`의 `docs-contract-specs` 잡은 `clients/desktop`에서 다음 6개 스펙을 실행한다.

```text
cd clients/desktop
$env:PLAYWRIGHT_SKIP_WEB_SERVER='1'; npx playwright test --reporter=line playwright/purchase-inspection-cta/purchase-inspection-cta.spec.ts playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts playwright/sp-08-5-1-purchase-slip-list-detail/sp-08-5-1-purchase-slip-list-detail.spec.ts

Running 35 tests using 1 worker

[1/35] [chromium] › playwright\purchase-inspection-cta\purchase-inspection-cta.spec.ts:34:3 › Samhan Public 구매관리 입고 검수 CTA › 구매관리는 SAVED/CONFIRMED 행에서 InboundInspectionDialog를 연다
[2/35] [chromium] › playwright\purchase-inspection-cta\purchase-inspection-cta.spec.ts:47:3 › Samhan Public 구매관리 입고 검수 CTA › 검수 버튼은 UUID가 아닌 구매번호 기반 public test id를 사용한다
[3/35] [chromium] › playwright\purchase-inspection-cta\purchase-inspection-cta.spec.ts:57:3 › Samhan Public 구매관리 입고 검수 CTA › 입고 검수 권한은 메뉴와 버튼이 같은 canAccess 패턴을 쓴다
[4/35] [chromium] › playwright\purchase-inspection-cta\purchase-inspection-cta.spec.ts:76:3 › Samhan Public 구매관리 입고 검수 CTA › 문서는 구매관리 검수 CTA와 업무번호 독립 순번 원칙을 명시한다
[5/35] [chromium] › playwright\purchase-inspection-cta\purchase-inspection-cta.spec.ts:94:3 › Samhan Public 구매관리 입고 검수 CTA › 관리형 업무 메뉴는 조회 전용처럼 보이지 않는 라벨을 쓴다
[6/35] [chromium] › playwright\purchase-inspection-cta\purchase-inspection-cta.spec.ts:117:3 › Samhan Public 구매관리 입고 검수 CTA › 재고이동 이동번호도 T/TR prefix 없이 YYYY/MM/DD-N 형식을 쓴다
[7/35] [chromium] › playwright\sp-05-crud-surface\sp-05-crud-surface.spec.ts:113:3 › SP-05 Samhan Public CRUD surface › 판매관리 목록은 공개 판매번호 기반 상세 버튼으로 전표 상세에 진입한다
[8/35] [chromium] › playwright\sp-05-crud-surface\sp-05-crud-surface.spec.ts:127:3 › SP-05 Samhan Public CRUD surface › 구매관리 목록은 공개 구매번호 기반 상세 버튼으로 전표 상세에 진입한다
[9/35] [chromium] › playwright\sp-05-crud-surface\sp-05-crud-surface.spec.ts:141:3 › SP-05 Samhan Public CRUD surface › SP-05 문서는 거래처 UI와 입고 검수 CTA의 현재 구현 상태를 우선 반영한다
[10/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:47:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › 단톡방리스트 is owned by notification DB and desktop CRUD, not Notion runtime
[11/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:60:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › 발송금지리스트 is owned by partner DB and desktop CRUD, not Notion runtime
[12/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:73:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › 배차지역 분류표 is owned by arologis DB and desktop CRUD
[13/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:88:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › 거래처 DC정보 is owned by dc-config DB and desktop CRUD with DB seed upload
[14/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:100:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › gateway preserves full API paths for DB-backed CRUD endpoints
[15/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:122:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › partner approval gateway route is accepted by downstream header authentication
[16/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:135:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › docs state migration into our DB followed by DB CRUD, not Notion runtime dependency
[17/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:142:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › DB migration script follows local service port overrides
[18/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:159:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › operational smoke script reuses resolved service ports for DB CRUD validation
[19/35] [chromium] › playwright\sp-06-notion-db-crud\sp-06-notion-db-crud.spec.ts:167:3 › SP-06 Notion-origin data is Samhan Public DB CRUD › active web order app does not keep a Notion HTTP endpoint
[20/35] [chromium] › playwright\sp-07-google-sheets-source\sp-07-google-sheets-source.spec.ts:24:3 › SP-07 Google Sheets quote/order source contract › bootstrap range-map keeps GAS order payload and increase helper tabs, not credential/output forms
[21/35] [chromium] › playwright\sp-07-google-sheets-source\sp-07-google-sheets-source.spec.ts:41:3 › SP-07 Google Sheets quote/order source contract › bootstrap test guards config seed fallback and secret-bearing form exclusion
[22/35] [chromium] › playwright\sp-07-google-sheets-source\sp-07-google-sheets-source.spec.ts:49:3 › SP-07 Google Sheets quote/order source contract › partner-order catalog lookup uses current increase tabs only
[23/35] [chromium] › playwright\sp-07-google-sheets-source\sp-07-google-sheets-source.spec.ts:63:3 › SP-07 Google Sheets quote/order source contract › product-service DB sync preserves current default and before-increase history mapping
[24/35] [chromium] › playwright\sp-07-google-sheets-source\sp-07-google-sheets-source.spec.ts:77:3 › SP-07 Google Sheets quote/order source contract › live snapshot documents exact spreadsheet tabs without publishing secrets
[25/35] [chromium] › playwright\sp-07-google-sheets-source\sp-07-google-sheets-source.spec.ts:90:3 › SP-07 Google Sheets quote/order source contract › operational validation routes runtime reads through product/order DB sync contract
[26/35] [chromium] › playwright\sp-08-3-dispatch-parity\sp-08-3-dispatch-parity.spec.ts:124:3 › SP-08-3-1 배차 legacy GAS DB/API parity 기반 잠금 › 기획서가 6개 배차 화면 endpoint/history/programType 매트릭스를 고정한다
[27/35] [chromium] › playwright\sp-08-3-dispatch-parity\sp-08-3-dispatch-parity.spec.ts:152:3 › SP-08-3-1 배차 legacy GAS DB/API parity 기반 잠금 › 현재 API/route 소스가 6개 기존 endpoint를 유지하고 SP-08-3-2 arologis history endpoint를 허용한다
[28/35] [chromium] › playwright\sp-08-3-dispatch-parity\sp-08-3-dispatch-parity.spec.ts:199:3 › SP-08-3-1 배차 legacy GAS DB/API parity 기반 잠금 › SP-08-3-1 산출물과 계획 문서에는 UUID literal을 포함하지 않는다
[29/35] [chromium] › playwright\sp-08-3-dispatch-parity\sp-08-3-dispatch-parity.spec.ts:209:3 › SP-08-3-1 배차 legacy GAS DB/API parity 기반 잠금 › desktop renderer와 3개 서비스 main 소스에 Notion runtime call 재유입이 없다
[30/35] [chromium] › playwright\sp-08-3-dispatch-parity\sp-08-3-dispatch-parity.spec.ts:223:3 › SP-08-3-1 배차 legacy GAS DB/API parity 기반 잠금 › SP-08-3-1 문서/QA 산출물이 secret-like marker를 포함하지 않는다
[31/35] [chromium] › playwright\sp-08-5-1-purchase-slip-list-detail\sp-08-5-1-purchase-slip-list-detail.spec.ts:17:3 › SP-08-5-1 매입 목록/상세 계약 › T1 slip-service R1/R2 매입 endpoint contract
[32/35] [chromium] › playwright\sp-08-5-1-purchase-slip-list-detail\sp-08-5-1-purchase-slip-list-detail.spec.ts:35:3 › SP-08-5-1 매입 목록/상세 계약 › T2 desktop PurchaseQueryPage keeps SP-03 inspection CTA contract
[33/35] [chromium] › playwright\sp-08-5-1-purchase-slip-list-detail\sp-08-5-1-purchase-slip-list-detail.spec.ts:49:3 › SP-08-5-1 매입 목록/상세 계약 › T3 권한 가드는 WAREHOUSE/MANAGER/MASTER만 허용하고 INVENTORY를 제외한다
[34/35] [chromium] › playwright\sp-08-5-1-purchase-slip-list-detail\sp-08-5-1-purchase-slip-list-detail.spec.ts:69:3 › SP-08-5-1 매입 목록/상세 계약 › T4 사용자 표시와 QA 산출물은 UUID 대신 구매번호를 쓴다
[35/35] [chromium] › playwright\sp-08-5-1-purchase-slip-list-detail\sp-08-5-1-purchase-slip-list-detail.spec.ts:80:3 › SP-08-5-1 매입 목록/상세 계약 › T5 SP-03 회귀: SAVED/CONFIRMED 검수 CTA가 유지된다
  35 passed (3.0s)
```

### 전체 Vitest

```text
RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

❯ src/main/build-output-cjs-interop.test.ts (1 test | 1 failed)
  × main 산출물 ESM/CJS named-import 상호운용 회귀 가드 (#909, mock 없음) > out/main/index.js 의 외부(node_modules) 패키지 import 가 실제 Node ESM 로더에서 해석된다
    → 외부 패키지 import 가 실제 Node ESM 로더에서 실패했다:
- electron-store (import Store from 'electron-store'):
D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\node_modules\electron\index.js:17
    throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
          ^

Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
    at getElectronPath (D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\node_modules\electron\index.js:17:11)
    at Object.<anonymous> (D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\node_modules\electron\index.js:21:18)
    at Module._compile (node:internal/modules/cjs/loader:1812:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1414:10)
    at Module.load (node:internal/modules/cjs/loader:1197:32)
    at Module._load (node:internal/modules/cjs/loader:1013:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:224:24)
    at ModuleWrap.<anonymous> (node:internal/modules/esm/translators:328:3)
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)

Node.js v24.14.1
```

### 타입 검사

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외)
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다
✔ 결함6 참고: 구 assert.equal 방식은 추적 스펙이 늘기만 해도 실패했다(합성 173 vs 172, 고정 실측)
✔ 결함1: REAL_QA_ALLOW_UNTRACKED 세션 잔존은 명시 경로 없는 전체 실행을 오염시키지 않는다
✔ F-1 RED: Playwright/ 전체 위치 인자는 남은 ALLOW_UNTRACKED 로 우회되지 않는다
✔ 결함1 핵심: 집합이 깨끗해도 명시 경로 없는 real-QA 전체 실행은 차단한다
✔ 결함1 U-1: 예외 모드 경고가 stdout 에도 남는다(1> 리다이렉트로도 보여야 함)
✔ 결함2: allowUntracked 는 집합이 줄어드는 방향(missingFiles)을 절대 덮지 않는다(#864 계열)
✔ 결함3: 미추적 로컬 스펙이 있어도 추적 스펙만의 격리 실행은 막지 않는다(플래그 불필요)
✔ 결함3 보강: narrow 실행에 미추적 스펙 자신이 포함되면 여전히(플래그 없이는) 막는다
✔ 결함1·3 실측 보강: 워커 프로세스처럼 argv 가 비어도 narrow 실행이 유지된다(부모→자식 전파)
✔ 결함8: core.quotepath 8진 이스케이프가 걸려도 비ASCII 추적 real-QA 스펙을 잃지 않는다
✔ 재수렴 결함1: .gitignore 로 커버된 untracked 스펙은 unexpectedUntrackedFiles 에서 빠진다
✔ 재수렴 결함1 단위: listGitignoredUntrackedRealQaFiles 는 .gitignore 로 무시된 untracked 파일만 반환한다
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## 5. 실행하지 않은 것

- 전체 Desktop Playwright 게이트: 지시대로 실행하지 않았다.
- 컨테이너 재배포, DB 쓰기, 외부 시스템 호출: 실행하지 않았다.
- 커밋, `git add`, push, PR 조작: 실행하지 않았다.
- 시나리오 2~5와 다른 트랙 파일, `docs/handoff/`: 수정하지 않았다.

## 6. 신규 파일

```text
docs/dev-reports/2026-08-05-874-r36-route-contract-assertion.md
```
