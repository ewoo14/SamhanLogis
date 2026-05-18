# 🟢 Codex TM 5-Section Cross-Check Review — SP-10-2 Cycle 2

**HEAD**: `36379838`
**PR**: #245
**비교**: f82a5ad5 → 36379838

## 종합 판정: FIX 요청

### A. Cycle 1 결함 24건 fix 검증

| # | 영역 | 결함 | fix 결과 | 증거 (file:line) |
|---|---|---|---|---|
| P0-1 | BE | vendor_order_id 저장 | ✅ PASS | `services/arologis-service/src/main/java/com/samhanair/logis/arologis/matcher/InsungQuickDriverMatcher.java:71-72` |
| P0-2 | BE/CI | IT unique constraint | ✅ PASS | `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/InsungQuickIntegrationIT.java:89-90`, `:201`, `:236`, `:268` |
| P0-3 | FE/QA | sandbox-banner testid mismatch | ✅ PASS | `qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts:14`, `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchDetailPage.tsx:377` |
| P0-4 | QA/FE | detail route dispatch=null 상시 전달 | ✅ PASS | `clients/arologis-desktop/src/renderer/routes/index.tsx:57-82` |
| P1-1 | BE | MATCHING/PENDING 및 DEPARTED 상태 가드 | ✅ PASS | `InsungWebhookService.java:99-109`, `:139-147` |
| P1-2 | BE | 운영 HMAC secret blank 차단 | ✅ PASS | `ArologisInternalController.java:263-279` |
| P1-3 | BE | HMAC raw body bytes | ✅ PASS | `ArologisInternalController.java:175-178`, `:207-210`, `:241-244`, `:279` |
| C-P1-1 | BE | signature 중복 skip | ✅ PASS | `SignatureRepository.java:19`, `InsungWebhookService.java:221-226` |
| C-P1-2 | BE | nullable vendorOrderId/stopSequence 방어 | ✅ PASS | `ArologisInternalController.java:182`, `:216-218`, `:250-251`, `:294-295` |
| D1 | Designer | wireframe badge testid | ✅ PASS | `docs/design/sp-10-2-insung-quick-vendor/wireframe.md:165` |
| D2 | Designer/FE | aria-live 4상태 컨테이너 | ✅ PASS | `VehicleMatchStatusBadge.tsx:195-199` |
| D1 | DevOps | CI paths credential guard | ✅ PASS | `.github/workflows/arologis-ci.yml:19-25`, `:29-35`, `:57-58` |
| P2-1 | BE | MatcherConfig stale 문서/로그 | ✅ PASS | `MatcherConfig.java:15-20`, `:47` |
| P2-2 | BE | delivered stops empty vacuous true | ✅ PASS | `InsungWebhookService.java:195-199`, `:244-248` |
| P2-3 | BE | parseCapturedAt noop replace | ✅ PASS | `InsungWebhookService.java:257-260` |
| P2-4 | BE | runtime 실패 ErrorCode 분리 | ✅ PASS | `ErrorCode.java:129`, `InsungQuickClientImpl.java:170`, `:227`, `:265`, `:313` |
| P2-5 | BE | matcher test vendorOrderId/save 검증 | ✅ PASS | `InsungQuickDriverMatcherTest.java:86-87`, `:112-113` |
| D3 | Designer | tokens.md WCAG 수치 | ✅ PASS | `docs/design/sp-10-2-insung-quick-vendor/tokens.md:67`, `:74`, `:87` |
| D4 | Designer | QA-4 gps testid 소문자 정합 | ✅ PASS | `docs/qa/sp-10-2-insung-quick-vendor/scenarios/sp-10-2-scenarios.md:130`, `:248`; `InsungLbsPanel.tsx:63-67` |
| D5 | Designer | sandbox-banner 문서 정합 | ✅ PASS | `scenarios/sp-10-2-scenarios.md:49`, `:73`, `:243` |
| QA-P1 | QA | scenarios match-status/sandbox 정합 | ✅ PASS | `scenarios/sp-10-2-scenarios.md:46`, `:49`, `:242-243` |
| FE-D2 | FE | dark mode `--surface-subtle` | ✅ PASS | `tokens.css:468`, `InsungLbsPanel.tsx:316` |
| FE-D3/D4 | FE/QA | spec 직접 testid 검증 | ✅ PASS | `DispatchDetailPage.tsx:266`, `:307`, `:339`; `InsungLbsPanel.tsx:314`, `:374` |
| DevOps-D2 | DevOps | timeout env 누락 | ✅ PASS | `application.yml:76`, `arologis-service.env:77`, `docker-compose.arologis.yml:74` |

### B. Codex 자체 신규 발견 (cycle 2)

#### BE

- 신규 결함 없음.
- `handleDelivered` lambda 내부 `return`은 lambda 종료만 수행하지만, 중복 signature skip 후에도 `vehicle.updateVendorStatus("DELIVERED")` 및 allDelivered 계산은 계속된다. 현재 의도상 치명 회귀는 아님. 증거: `InsungWebhookService.java:221-248`.
- `vehicle.markDelivered()`는 상태 후퇴 가드와 idempotent 상태 전이 관점에서 허용 가능. 다만 signature 중복 방어는 repository 선조회 기반이라 완전한 동시성 보장은 DB unique 없이 약함. 이번 Cycle 1 요구였던 "find + skip" 범위는 충족.

#### FE

- ❌ **FE-C2-1 P1 — 상세 API 에러 시 사용자 에러 메시지 없이 로딩 화면이 영구 표시됨.**
  `DispatchDetailRouteWrapper`가 fetch 실패를 catch하면 `setDispatch(null)`만 수행하고 별도 `error` state를 두지 않는다. `DispatchDetailPage`는 `dispatch === null`일 때 로딩 문구만 렌더링하므로, 404/500/network error에서 사용자는 "배차 정보를 불러오는 중..." 상태에 갇힌다.
  증거: `clients/arologis-desktop/src/renderer/routes/index.tsx:73-74`, `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchDetailPage.tsx:488`.

- `cancelled` cleanup race는 PASS. unmount 후 setState 방지는 `cancelled` 플래그로 처리됨. 증거: `routes/index.tsx:57-80`.
- `ApiEnvelope<DispatchDetail>` 분기는 PASS. wrapper/data 양쪽 응답을 처리한다. 증거: `routes/index.tsx:61-70`.
- design-system Spinner import 의무 PASS. 증거: `VehicleMatchStatusBadge.tsx:26`, `:137`.

#### Designer

- ⚠ **Designer-C2-1 P2 — `tokens.css` 주석의 WCAG 수치가 여전히 10.2:1로 남아 있음.**
  실제 계산값은 `#431407` on `#FFF7ED` ≈ **14.74:1**이고 `tokens.md`는 14.7:1로 정정됐지만, 실 token 파일 주석은 10.2:1이다. 런타임 색상은 문제 없고 문서/주석 불일치다.
  증거: `clients/web/design-system/src/tokens/tokens.css:103`, `docs/design/sp-10-2-insung-quick-vendor/tokens.md:67`, `:74`.

- 5 vendor 색 충돌 없음. INSUNG `#B45309`는 NTS/Aligo/Clova/KFTC와 hue가 분리됨. 증거: `tokens.md:93-97`.
- VehicleMatchStatusBadge token 사용 일관 PASS. 증거: `VehicleMatchStatusBadge.tsx:108-110`, `tokens.md:184-186`.
- 사이드바 무영향 PASS. 신규 route는 detail child route로만 추가됨. 증거: `routes/index.tsx:98-106`, `DispatchesLayout.tsx:4-7`.

#### QA

- testid 실 컴포넌트 부여 PASS. 증거: `InsungLbsPanel.tsx:314`, `:374`; `DispatchDetailPage.tsx:266`, `:156`, `:182`, `:214`.
- false green 가드 PASS. 코드상 `|| true`, `test.skip(!ok)`, `page.setContent()` 실행 패턴 없음. 주석 언급만 존재. 증거: `sp-10-2-insung-quick-vendor.spec.ts:34-36`.
- 5 QA case 실행 가능성 PASS 수준. 실제 spec은 14 test로 확장되어 있고 route mock도 `/api/arologis/dispatches/**`에 정합됨. 증거: `spec.ts:196-207`, `:230-768`.
- 단, 이번 리뷰는 read-only 조건 때문에 Playwright/Gradle 실행은 수행하지 않음.

#### DevOps

- arologis-ci.yml paths trigger PASS. 증거: `.github/workflows/arologis-ci.yml:19-25`, `:29-35`.
- 6 `SAMHAN_INSUNG_QUICK_*` env application.yml 매핑 PASS. 증거: `application.yml:68-76`, `arologis-service.env:72-77`, `docker-compose.arologis.yml:69-74`.
- credential plaintext guard false-positive 구조 PASS. 빈 env-template 값과 docker-compose `${...:-}` 기본값은 허용 구조. 증거: `scripts/check-credential-plaintext.sh:79`, `:210`, `:297`.
- ⚠ **DevOps-C2-1 P2 — SP-10-2 범위의 Phase 11 KMS 의무 메모가 명시적으로 보이지 않음.**
  Secrets/SSM/운영 PC `.env` 언급은 있으나, 인성데이타 vendor secret을 Phase 11에서 KMS-backed Secrets Manager/Parameter Store로 옮기는 명시 메모가 SP-10-2 문서에는 부족하다.
  증거: `infrastructure/env-templates/arologis-service.env:66-77`, `docs/dev-reports/sp-10-2-insung-quick-vendor.md:127`.

### C. 종합 판정

- **FIX 요청**
- 머지 차단 사유: **FE-C2-1 P1**. 상세 fetch 실패 시 사용자에게 에러가 노출되지 않고 로딩 상태가 영구 표시된다.
- 추가 보완 권장: `tokens.css` WCAG 주석 14.7:1 정정, Phase 11 KMS-backed secret migration 메모 추가.
- **cycle 3 진입 의무: 예**. Cycle 3에서는 위 1건 P1 + 2건 P2 확인 후 종료 가능.

### D. 한국어 boundary 결과

- commit: `f82a5ad5`, `36379838` 모두 한국어 commit 제목/본문 유지. ✅ PASS
- UUID 비공개: UI 컴포넌트는 `driverCode`와 `vendorOrderId`만 표시/tooltip 사용, 내부 `id`는 테스트 fixture 및 데이터 키 수준. ✅ PASS
- 명칭: `아로로지스`, `Samhan Public`, `인성데이타 퀵프로그램` boundary 위반 신규 발견 없음. ✅ PASS

Codex TM — 2026-05-19
