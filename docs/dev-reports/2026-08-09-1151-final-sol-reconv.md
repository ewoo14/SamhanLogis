# PR #1151 최종 SOL 5.6 적대검증

## 환경 확인

- 검증 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1142`
- 브랜치/HEAD: `feat/1142-source-journal` / `0c0324c4d480830f1f715302bd3986b5a1b69371`
- 비교 기준: `origin/main` = `476e29ecb95e7fdbd93874c23bf1c41fb270ac04`, main 대비 4커밋 뒤/8커밋 앞
- Desktop Vite: `http://127.0.0.1:5273`, `VITE_MOCK_MODE=0`, `VITE_API_BASE_URL=http://127.0.0.1:28082`
- 실제 사용자 API 경로: Browser → `sol1151final-liveqa-gateway:28082` → 격리 auth/slip/inventory
- 서비스 직접 확인 포트: auth `28181`, inventory `28185`, slip `28186`
- DB: `sol1151r4-liveqa-db` 내부 `slip_db`·`inventory_db`
- Playwright: `clients/desktop`, Chromium, `headless: true`, 관련 실QA 스펙 1개만 실행
- 최종 health: auth/inventory/slip/gateway 모두 `healthy`

배포 JAR은 로컬 build 산출물과 컨테이너 `/app/app.jar` SHA-256이 일치해 재빌드하지 않았다.

```text
inventory local/deployed = 9d5013090be86ff8bb9231918e3b100b512a39f14ec87059f6fcd766637eecef
slip     local/deployed = d3d056b48eeacb8e3889a7ff61de38c6f0330117066d6bcfde14589dd4aef058
```

초기 격리 slip 컨테이너는 `WAREHOUSE_MAPPING_MODE` 누락으로 readiness가 `OUT_OF_SERVICE`였다. 기존 컨테이너는 삭제하지 않고 `sol1151r4-liveqa-slip-unhealthy-backup`으로 보존했으며, 동일 JAR·DB·네트워크에 로컬 표준값 `DEV_SUBSTITUTE`를 추가한 교체 컨테이너가 최종 `healthy`임을 확인했다. 직접 서비스 proxy는 gateway의 JWT→사용자 헤더 변환을 우회하므로 최종 QA에서는 사용하지 않았다.

실제로 호출된 API는 Playwright 네트워크 응답으로 확인했다.

```text
GET  http://127.0.0.1:28082/auth/admin/permissions/my -> 200
GET  http://127.0.0.1:28082/slips/e2a32ca9-5363-4649-b437-0c0098180955 -> 200
POST http://127.0.0.1:28082/slips/e2a32ca9-5363-4649-b437-0c0098180955/complete -> 200
GET  http://127.0.0.1:28082/slips/e2a32ca9-5363-4649-b437-0c0098180955 -> 200
```

Flyway 원문:

```text
23|23|stock balances warehouse active index|t
24|24|create source operation journals|t
```

`source_operation_journals` 테이블도 실제 카탈로그에 1개 존재했다.

## 판정

```text
도달 가능한 결함: 0건
머지 가능
```

실 Desktop 입고 완료가 gateway·slip-service·inventory-service를 거쳐 source journal을 실제로 남겼다. 첫 표본은 `APPLIED`이며 생성 lot ID가 실제 lot과 일치했고, 두 번째 표본은 기존 lot 재호출이라 `NO_OP_EXISTING`을 남겼다. 두 journal 모두 전표와 revision 연결값이 NULL이 아니다.

## 근거 원문

### 1. 발화 조건 카운트

DB 직접 INSERT 없이 격리 복제 DB의 기존 실 경로 표본을 사용했다. 실행 전 입고 상태 집계:

```text
INBOUND|PROCESSING|7
INBOUND|INSPECTING|2
```

입고 완료 버튼 발화 대상 `PROCESSING`은 7건이므로 표본 0이 아니다. 그중 최신 2건을 GUI로 완료했다.

### 2. 실 GUI + 네트워크

최종 관련 스펙 실행 원문:

```text
Running 1 test using 1 worker
[NETWORK] GET  http://127.0.0.1:28082/auth/admin/permissions/my -> 200
[NETWORK] GET  http://127.0.0.1:28082/slips/e2a32ca9-5363-4649-b437-0c0098180955 -> 200
[NETWORK] POST http://127.0.0.1:28082/slips/e2a32ca9-5363-4649-b437-0c0098180955/complete -> 200
[NETWORK] GET  http://127.0.0.1:28082/slips/e2a32ca9-5363-4649-b437-0c0098180955 -> 200
[LIVE SCREEN] slipId=e2a32ca9-5363-4649-b437-0c0098180955
1 passed (2.9s)
```

스크린샷:

- 완료 전: `docs/qa/1151-final-sol-reconv/_local/01-before-inbound-complete.png`
- 완료 후: `docs/qa/1151-final-sol-reconv/_local/02-after-inbound-complete.png`

완료 전 화면에는 `완료 (재고 반영 후 검수 대기 (입고 완료))` 버튼이 활성화되어 있고, 완료 후 화면은 진행 단계와 검수 상태가 `검수 중`/`검수 대기`로 바뀐다.

상단의 업데이트 확인 실패 배너는 격리 gateway에 이 PR과 무관한 config-service를 연결하지 않아 나온 503이며, 전표 상세·권한·완료·재조회 요청은 위 원문처럼 모두 200이다. 이 PR 결함으로 세지 않았다.

### 3. journal과 실제 재고의 일치

첫 번째 GUI 완료 — 신규 lot 적용:

```text
slip:
7c7069a8-ed5d-4472-8fcc-5f7dfc6c1710|2026/08/08-18|INSPECTING|revision_count=0|version=5

journal:
dbc88d2e-c5ea-4804-a1ba-e94e6c29705c|7c7069a8-ed5d-4472-8fcc-5f7dfc6c1710|0|APPLIED|["3e3f4c6e-127f-47e7-a7b2-284a13c1c178"]|[]

created lot 대조:
7c7069a8-ed5d-4472-8fcc-5f7dfc6c1710|3e3f4c6e-127f-47e7-a7b2-284a13c1c178|lot_exists=t|2026/08/08-18|quantity=1
```

두 번째 GUI 완료 — 기존 lot이 이미 있어 정상 no-op:

```text
slip:
e2a32ca9-5363-4649-b437-0c0098180955|2026/08/08-19|INSPECTING|revision_count=0|version=5

journal:
7d379363-3304-4906-b739-117fc09aaa4e|e2a32ca9-5363-4649-b437-0c0098180955|0|NO_OP_EXISTING|[]|[]
```

최종 무결성 카운트:

```text
total=2
null_slip_id=0
null_slip_revision=0
APPLIED=1
```

두 번째 표본의 기존 lot은 격리 DB 복제 시점에 이미 있던 QA 표본이므로 `NO_OP_EXISTING`을 이 PR 결함으로 세지 않았다. 첫 번째 표본은 실제 신규 lot 생성까지 완주했다.

### 4. 화면·공개 API 노출 여부

source journal은 화면에 표시되지 않고 inventory OpenAPI의 경로명 중 `source|journal|operation` 일치 공개 endpoint도 0개다.

```text
source_paths=0
```

이는 이 PR의 S1 계약과 일치한다. `docs/dev-reports/2026-08-09-1142-s1-source-journal.md`는 “역연산 API는 추가하지 않았다. 기존 응답을 유지하고 journal 행만 추가한다”고 명시한다. 따라서 판단 근거는 현재 사용자 화면/공개 API가 아니라 inventory 내부 DB에 저장되며, 후속 내부 역연산 단계가 읽는 구조다. 공개 노출 부재를 이번 PR의 도달 결함으로 세지 않았다.

### 5. main 선행분과 migration 충돌

실측 `origin/main` inventory migration 최대는 V23이다.

```text
max=23 count=23
V20__standardize_inventory_audit_no_slash.sql
V21__create_inventory_audit_number_sequences.sql
V22__add_inbound_slip_lot_idempotency_index.sql
V23__stock_balances_warehouse_active_index.sql
```

앞선 4커밋은 #1064 입고 lifecycle UI/권한 문서·테스트, 핸드오프/메모리, #896 문서다. 이 PR이 바꾼 inventory-service·slip-service 운영 파일 및 inventory migration과 겹치는 파일은 0개였다. V24 채번 충돌도 없다.

### 6. 증거 무결성

- 기존 R2의 한 건 실행 수치 `total=1, null_slip=0, null_revision=0`을 첫 GUI 완료 직후 동일하게 재현했다.
- V23→V24가 실제 DB에서 성공 상태로 조회됐다.
- 보고서에 원문/실측으로 제시된 핵심 수치와 이번 재현 간 자릿수 또는 값 불일치는 발견하지 못했다.

## 신규 생성 파일

- `docs/dev-reports/2026-08-09-1151-final-sol-reconv.md`
- `clients/desktop/playwright/1151-final-sol-real-qa/1151-final-sol-real-qa.spec.ts`
- `docs/qa/1151-final-sol-reconv/_local/01-before-inbound-complete.png`
- `docs/qa/1151-final-sol-reconv/_local/02-after-inbound-complete.png`
- `scratchpad/sol1151-final-liveqa-nginx.conf`
- `clients/web/design-system/dist/tokens.css` — 화면 기동을 위해 표준 design-system build가 생성한 ignored 산출물
- `clients/desktop/test-results/.last-run.json` — Playwright 실행 산출물

commit/push는 수행하지 않았다. 기존 미추적 `clients/web/design-system/vite.config.ts.timestamp-1786257219189-390b01a4d6d3c.mjs`, `scratchpad/sol1151r4-liveqa-nginx.conf`는 변경하지 않았다.
