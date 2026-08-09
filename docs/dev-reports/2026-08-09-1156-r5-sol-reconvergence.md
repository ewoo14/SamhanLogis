# PR #1156 R5 — SOL 5.6 진단 + 적대검증

## 최우선 판정: 편집 버튼 미노출은 **(나) 환경 문제**

R4 fix가 만든 회귀가 아니다. 동일한 실 R4 DRAFT(`2026/08/09-2`, memo=`R4 GUI direct PUT partnerCode code-fix`)와 동일한 `MASTER` 세션으로 세 renderer를 비교했다.

| renderer | 제공 소스 | 최종 화면/API | `purchase-slip-edit-open` |
|---|---|---|---:|
| `5316` | fix 전 매핑(`setCode(nextBizNo)`) | `/purchases/<redacted-uuid>`, `GET /slips/<redacted-uuid> -> 200` | 1 |
| `5328` | R4 매핑(`nextPartnerCode`) | 주소 hash는 상세이나 실제 렌더는 대시보드, `GET /slips -> 200` | 0 |
| `5330` | R4 매핑(`nextPartnerCode`) | `/purchases/<redacted-uuid>`, `GET /slips/<redacted-uuid> -> 200` | 1 |

R4 실패 원문은 단순히 “버튼이 없다”가 아니었다.

```text
requested  http://127.0.0.1:5328/#/purchases/<redacted-uuid>
final      http://127.0.0.1:5328/#/purchases/<redacted-uuid>
network    GET /slips -> HEAD-28186, HTTP 200
rendered   대시보드(환영합니다), editButtonCount=0
```

원인은 R4가 현재 소스를 `vite.web.config.ts`로 띄운 것이다. 이 설정은 `VitePWA`와 실제 web runtime을 올린다(`clients/desktop/vite.web.config.ts:20-62`). QA 전용 설정은 PWA 모듈을 stub하고 Electron renderer와 같은 root를 쓰는 `vite.renderer.dev.config.ts:26-42`다. 올바른 설정으로 띄운 `5330`에서는 현재 HEAD도 버튼을 렌더했다.

버튼 가드는 `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1341-1348`의 `DRAFT/SAVED && canAccess('purchases.slip.edit','update')`, `:1224-1233`의 편집 표면 배타 가드, `:2421-2429`의 조합, `:3726-3744`의 JSX다. 실측 표본은 `DRAFT`, 세션은 `MASTER`, 협업 편집은 닫힘이어서 모두 true였다. R4 구현 diff인 `sales.ts`와 `SlipDetailPage.tsx`의 거래처 매핑 변경은 이 네 지점을 건드리지 않았다.

실 데이터 영향은 0건이다. 잘못된 QA renderer가 상세 대신 목록을 읽고 대시보드를 보여 준 실행환경 결함이며 DB mutation은 없었다.

증거: `docs/qa/2026-08-09-1156-r5/edit-gate-evidence.json`, `fix-before-5316.png`, `r4-web-5328.png`, `r5-renderer-5330.png`.

## 0. 환경 확인

```text
worktree  C:\dev\Samhan-Public\.claude\worktrees\t1155
branch    fix/1155-inbound-partner-code
HEAD      f307ba83118622b971a5005d93100680ede0df4b
renderer  5330, vite.renderer.dev.config.ts, VITE_APP_VERSION=2026/08/09-1156
fix 전     5316, 제공 소스에 old mapping 확인
R4 실패    5328, vite.web.config.ts
API       127.0.0.1:28186, container=sol1151r4-liveqa-slip
DB SELECT samhan-postgres/slip_db, SELECT only
```

`5330` process는 이 worktree에서 시작했고 제공 source map 경로도 `.../t1155/...`이며 현재 매핑을 포함한다. 따라서 FE 검증본은 HEAD `f307ba831`이다.

단, `28186` backend를 “f307 배포본”이라고 부를 수는 없다. 컨테이너 이름은 `sol1151r4-liveqa-slip`, `/app/app.jar` SHA-256은 `d3d056b48eeacb8e3889a7ff61de38c6f0330117066d6bcfde14589dd4aef058`이다. R3 HEAD backend JAR은 `6A73A4D5...C821F429`이며 지금 실행 중이지 않다. 다만 `964aa8ed..f307ba831` 사이 backend diff는 0파일이고, R5의 실 GUI network는 mock이 아닌 이 격리 실 API에 도달했다.

```text
GET  /slips/<redacted-uuid> HTTP 200 destination=HEAD-28186
POST /slips/price-memory/bulk HTTP 200 destination=HEAD-28186
```

## 1. R4 direct edit 수정 검증

현재 HEAD의 올바른 renderer에서 매입과 매출 모두 거래처를 `(주)서울에어컨`으로 바꾸고 저장 버튼을 눌러 outgoing PUT body를 캡처했다.

| 경로 | endpoint | `partnerCode` | `businessNumber` | 판정 |
|---|---|---|---|---|
| 매입 direct edit | `PUT /slips/{id}` | `P-2026-0001` | `113-07-10031` | 두 체계 분리 통과 |
| 매출 direct edit | `PUT /slips/{id}/sales` | `P-2026-0001` | `113-07-10031` | 매입 미러 통과 |

코드 흐름은 `sales.ts:981-989` → `SlipDetailPage.tsx:86-94` → `:2707-2733` → 매입 `:2909-2929`/매출 `:2932-2952`다.

공유 DB write 금지 때문에 PUT은 브라우저 경계에서 synthetic 200으로 종료했고 `28186`에는 전달하지 않았다. 따라서 **FE outgoing body는 실 GUI로 통과**, **backend 응답/DB persistence는 이번 R5에서 미측정**이다. DB 저장 성공이라고 과장하지 않는다. 실 데이터 영향은 0건이다.

증거: `direct-inbound-before-put.png`, `direct-outbound-before-put.png`, `direct-put-payload-evidence.json`.

## 2. R2·R3 회귀

### 타깃 자동 회귀

```text
:services:slip-service:test
  SlipServiceTest
  EstimateToSlipConverterAuthoritativeAmountsTest
  SlipFormV20PersistIT
BUILD SUCCESSFUL in 1m 2s

SlipDetailPage.partner-code.test.ts                 1 passed
SlipDetailPage.lifecycle-contract.test.ts          23 passed
```

이 범위가 같은 partnerId 재전송 보존, A→B code 재해소, resolve 실패 stale clear, send/confirm fail-open, DRAFT→SENT 보강, 견적 변환 snapshot을 고정한다.

### 공유 실 DB SELECT 전후가 아닌 현재 상태 재확인

`samhan-postgres/slip_db`에 SELECT만 실행했다.

```text
2026/08/09-6  CONFIRMED <EMPTY>       R3 TIMEOUT SEND fail-open
2026/08/09-7  DRAFT     000-00-00000 R3 HEADER original defect A to B
2026/08/09-8  SENT      00            R3 DRAFT TO SENT backfill
2026/08/09-19 DRAFT     00            [견적변환: 2026/08/09-6] R3 GUI 견적 전표 변환
R3 GUI 신규 INBOUND DRAFT/code=00 표본 5건(슬립번호 9,10,11,17,18)
```

R3가 만든 표본은 그대로다. 그러나 금지된 write를 피했으므로 timeout send/confirm, 동일/생략/A→B, 신규 생성, 견적 변환을 이번 라운드에서 다시 mutation하지 않았다. 새 동작의 라이브 재실행 성공이라고 주장하지 않는다.

## 3. FE `partnerCode` 기입 축 전수

production TS/TSX에서 `partnerCode:` 대입, setter, CRDT header 대입을 grep하고, 사업자번호·이름 fallback 또는 변환 경계만 역추적했다. 단순 DTO 타입 선언·테스트 fixture·이미 `row.partnerCode`를 그대로 전달하는 passthrough는 표에서 묶었다.

| 파일:줄 | 들어가는 값 | 체계 | 저장 영향/판정 |
|---|---|---|---|
| `api/sales.ts:984` | partner API `row.partnerCode` | 거래처코드 | 정상, R4 원천 fix |
| `routes/SlipDetailPage.tsx:89` | `row.partnerCode` | 거래처코드 | 정상, direct edit 검색 옵션 |
| `routes/SlipDetailPage.tsx:2707-2733` | 선택 option의 `partnerCode` | 거래처코드 | 정상, 매입·매출/CRDT 공통 |
| `routes/SlipDetailPage.tsx:2900` | `bizNo` | **사업자번호** | 잔여 계약 결함. 현재 선택값의 controlled option만 오염; 별도 state 저장값은 R5 payload에서 정상. 실 DB 영향 0건 확인 |
| `routes/EstimateFormPage.tsx:1100` | `row.businessRegistrationNumber` | **사업자번호** | 잔여 계약 결함. 검색 option의 `partnerCode`가 틀림 |
| `routes/EstimateFormPage.tsx:1927` | `partner.businessRegistrationNumber` | **사업자번호** | 잔여 계약 결함. controlled option도 동일 |
| `routes/EstimateFormPage.tsx:1160` | `option.bizNo ?? option.partnerCode`를 `businessRegistrationNumber`로 복원 | 사업자번호 | 견적 저장은 `partnerId` + `partnerBusinessNo`라 현재 Slip partnerCode DB 오염은 BE resolve가 막음; R3 변환 표본 code=00 |
| `api/sales.ts:327` | `e.partnerBusinessNo` | **사업자번호** | `EstimateDetail.partnerCode` 계약 위반. 현재 소비자는 `QuoteView`; 이 필드는 현 렌더에서 미사용이라 확인 영향 0건 |
| `routes/BankTransactionPage.tsx:136` | `matchedPartnerCode ?? matchedBizNo` | 거래처코드, 없으면 사업자번호 | legacy fallback. code 부재 row에서 PartnerOption 계약 위반 가능; 실 영향 건수 미측정 |
| `routes/CashReceiptFormPage.model.ts:105` | `partnerCode || bizNo || partnerName` | 혼합 | legacy controlled value fallback. payload builder는 별도 `state.partnerCode`; 실 영향 건수 미측정 |
| 나머지 production 대입 | API/도메인의 `partnerCode`, 사용자 거래처코드 입력, 기존 snapshot | 거래처코드 | 사업자번호 명시 유입 grep 없음 |

따라서 R4는 direct edit 저장 결함을 닫았지만 FE 축 전체가 닫혔다는 전제는 틀렸다. 최소 4개 파일의 6개 지점에 `PartnerOption.partnerCode`/`EstimateDetail.partnerCode` 계약 위반이 남아 있다. 이번 요청은 진단이므로 수정하지 않았다.

## 4. 결함 목록

### R5-1 — 잘못된 QA renderer가 상세 route를 대시보드로 렌더

- 재현: `5328/#/purchases/<id>` 진입 → 상세 GET이 아니라 `GET /slips` → 대시보드 → 버튼 0.
- 대조: 동일 데이터/세션으로 fix 전 `5316`과 current renderer `5330`은 상세 GET 200, 버튼 1.
- 좌표: `vite.web.config.ts:20-62` 대 `vite.renderer.dev.config.ts:26-42`.
- 실 데이터 영향: 0건.

### R5-2 — FE partnerCode 슬롯에 사업자번호/혼합 fallback 잔존

- 재현: 위 semantic grep 및 파일별 data-flow 역추적.
- 핵심 좌표: `EstimateFormPage.tsx:1100,1927`, `SlipDetailPage.tsx:2900`, `sales.ts:327`.
- direct PUT DB 오염 영향: R5 관측 0건. 견적 변환 R3 표본도 code=00 유지.
- 다른 화면의 표시/선택 영향: 모집단 미측정.

## 5. 신규 파일

- `clients/desktop/playwright/1156-r5-edit-gate-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1156-r5-edit-gate-real-qa/1156-r5-edit-gate-real-qa.spec.ts`
- `docs/qa/2026-08-09-1156-r5/edit-gate-evidence.json`
- `docs/qa/2026-08-09-1156-r5/direct-put-payload-evidence.json`
- `docs/qa/2026-08-09-1156-r5/fix-before-5316.png`
- `docs/qa/2026-08-09-1156-r5/r4-web-5328.png`
- `docs/qa/2026-08-09-1156-r5/r5-renderer-5330.png`
- `docs/qa/2026-08-09-1156-r5/direct-inbound-before-put.png`
- `docs/qa/2026-08-09-1156-r5/direct-outbound-before-put.png`
- `docs/dev-reports/2026-08-09-1156-r5-sol-reconvergence.md`

`_local`은 최종 산출물에서 제거했다. git commit/push, backfill endpoint, 보호 거래처 `1068689215`, DB INSERT/UPDATE/DELETE는 수행하지 않았다.

## 6. 못 한 것

- 공유 DB write 금지와 “실 PUT 후 DB 확인”은 동시에 충족할 수 없다. 그래서 매입·매출 outgoing PUT까지만 실 GUI로 재현했고 서버 전달은 차단했다.
- R2·R3 mutation 경로를 라이브로 다시 실행하지 않았다. 타깃 테스트와 기존 실표본 SELECT만 수행했다.
- `28186` backend는 f307 provenance가 아니다. FE는 f307로 고정했지만 전체 스택을 f307 배포본이라고 주장하지 않는다.
- 잔여 FE 혼합 매핑의 전체 실 데이터 영향 건수는 별도 인구조사 없이는 판정하지 않았다.
