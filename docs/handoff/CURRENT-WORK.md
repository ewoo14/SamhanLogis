# 현재 작업 핸드오프 노트

> 갱신일: 2026-05-15 (D-AX-13 **진행 중**, Codex)
> 갱신자: Codex
> 사용법: 새 도구/세션 시작 시 본 파일 read → §0 (즉시 시작) + §1 (방금 끝난 일) + §3 (다음 trigger 후보) 순서

## 2026-05-15 Codex 최신 핸드오프 — D-AX-13 auth contract 정합 진행

- 현재 branch: `codex/d-ax-13-auth-contract`
- 선택된 방향: 사용자 승인 1번 — `/auth/me`와 login/refresh 응답의 공개 식별자 계약을 BE/FE에서 한 번에 정합.
- 구현:
  - BE `AuthTokenResponse`에 role별 공개 식별자(`loginId/fullName`, `driverCode/phoneNumber`) 추가.
  - BE `MeResponse`도 같은 공개 식별자 schema 로 확장.
  - `AuthIdentityService` 추가: JWT `X-User-Id`/`X-User-Role` 기준으로 DB row 재조회, role mismatch/user gone 은 401.
  - desktop `LoginPage`와 refresh interceptor 에서 `loginId/fullName` undefined 저장 방지.
  - mobile auth API와 refresh helper 에서 `driverCode/phoneNumber` 보존.
- 검증:
  - RED: 새 필드 테스트 추가 후 `compileTestJava`가 `loginId/fullName/driverCode/phoneNumber` method 없음으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.service.auth.AdminLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.DriverLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.RefreshTokenServiceTest"` PASS
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.it.ArologisAdminAuthIT" --tests "com.samhanair.logis.arologis.it.ArologisDriverAuthIT"` PASS
  - `cd clients/arologis-desktop && npm run typecheck` PASS
  - `cd clients/arologis-mobile && npm run typecheck` PASS
- QA 캡처:
  - `docs/qa/d-ax-13-auth-contract/screenshots/01-contract-overview.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/02-admin-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/03-auth-me-admin.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/04-driver-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/05-auth-me-driver.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/06-refresh-rotation-identity.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/07-frontend-store-flow.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: 실제 기기 QA 및 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-15 arologis-mobile dashboard/GPS 진행

- 현재 branch: `codex/d-ax-15-arologis-mobile-driver-runtime`
- 사용자 피드백: Claude처럼 진행 방향은 다자선택으로 제시하고, Codex가 멋대로 결정하지 않는다.
- 채택 방향: 추천안 B — `clients/arologis-mobile` 에 dashboard + GPS 두 탭만 먼저 이식.
- 구현:
  - 로그인 성공 후 `RootNavigator` 가 `DriverTabNavigator` 로 진입.
  - `DriverDashboardScreen` / `DriverLocationTrackingScreen` 을 독립 앱 내부로 이식.
  - `api/arologis.ts` 는 `GET /driver-app/arologis/dispatches/today`, `POST /driver-app/arologis/locations` 만 담당.
  - 서명 / 배송사진 / 검수사진 / mobile-staff driver 제거는 후속 PR 선택지로 남김.
- 검증:
  - `cd clients/arologis-mobile && npm install`
  - `cd clients/arologis-mobile && npm run typecheck`
  - `rg -n 'clients/mobile-staff|mobile-staff|../../../mobile-staff' clients/arologis-mobile/src` 결과 없음
  - `.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- QA 캡처:
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/01-authenticated-driver-tabs.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/02-driver-dashboard.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/03-gps-tracking.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/04-dashboard-empty.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/05-dashboard-error.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/06-gps-permission-block.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/07-typecheck-pass.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/08-import-boundary-pass.png`
- 다음 선택지:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: `/auth/me` schema 정합 검증
  - D: 실기기 QA 후 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-12 mobile cross-import 분리 진행

- 현재 branch: `codex/d-ax-12-mobile-cross-import`
- 방향: D-AX-11 완료 후 같은 아로로지스 추출 흐름으로 `clients/mobile-staff` driver tab 의 Samhan Public slip 직접 import 를 먼저 제거.
- 구현:
  - `DriverTabNavigator` 의 `../SlipDetailScreen` import 제거.
  - `DriverSlipDetailEntry` 신규 경계 화면 추가.
  - dashboard → entry → back Jest 추가.
  - 기존 `SignaturePhotoScreenChain` mock 을 driver entry 로 교체.
- 검증:
  - `cd clients/mobile-staff && npm test -- DriverSlipDetailRoute.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm test -- SignaturePhotoScreenChain.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm run typecheck` PASS
  - `rg -n "from '../SlipDetailScreen'|SlipDetailScreen from|\\.\\./SlipDetailScreen" clients/mobile-staff/src/screens/driver` 결과 없음
  - `.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1` PASS
- QA 캡처:
  - PR 본문에 아래 8장을 모두 인라인 첨부한다. 캡처는 여러 테스트를 진행한 뒤 생성한 1000px 폭 PNG mock render 라서 GitHub 에서 문구와 버튼이 잘 보인다.
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/03-driver-route-test-flow.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/04-driver-back-navigation.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/05-typecheck-contract.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/06-jest-driver-route-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/07-jest-signature-chain-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/08-direct-import-search-guard.png`
- 문서:
  - spec: `docs/superpowers/specs/2026-05-15-d-ax-12-mobile-cross-import-design.md`
  - dev report: `docs/dev-reports/d-ax-12-mobile-cross-import.md`
  - QA: `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`
- 다음 후보:
  - `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
  - 실제 slip 연결값이 배차 응답에 포함되면 `DriverSlipDetailEntry` 를 아로로지스 전용 상세 bridge 로 확장.

## 2026-05-15 Codex 최신 핸드오프 — D-AX-11 PR #192 머지 완료

이 섹션이 아래의 과거 `D-AX-11 in progress` 기록보다 우선한다.

- 현재 브랜치: `main`
- 최신 main commit: `5599580 feat(arologis): D-AX-11 배차 페이지 데스크톱 이전`
- PR: https://github.com/ewoo14/SamhanLogis/pull/192
- 머지 커밋: `55995805d2922084c516f942d02f3cf1382a6407`
- 상태: D-AX-11 완료, PR #192 squash merge 완료, remote main 최신.
- 최종 CI: PR head `bfc5f7d` 기준 GitHub checks 전체 통과.
- QA: `qa/playwright`의 Chromium mock render로 한국어 화면 4장 캡처 완료.
- QA 산출물:
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png`
- PR 포함 항목: 5-team review 표, TM 통합, PM/CI 승인, QA 스크린샷, 리뷰 반영 내역.
- 별도 세션 기록: `docs/handoff/2026-05-15-codex-d-ax-11-session.md`
- dev report: `docs/dev-reports/arologis-dispatch-pages-extract.md`

다음 세션 첫 명령:

```powershell
git checkout main
git pull
git log --oneline -5
Get-Content AGENTS.md, docs/handoff/CURRENT-WORK.md, .codex/AGENTS.md -Encoding UTF8
```

다음 후보 작업은 새 결정을 만들기 전에 `migration/decisions/DECISIONS.md`와 해당 slice spec/plan을 먼저 확인한다. 사용자가 “그대로 진행”을 요청하면 Claude handoff 패턴대로 5-team review, PR 본문 QA 스크린샷, PM/CI 승인 코멘트를 포함한다.

## 2026-05-15 Codex Update — D-AX-11 in progress

- Current branch: `feat/arologis-dispatch-pages-extract`
- Current scope: Arologis desktop dispatch pages under `clients/arologis-desktop/src/renderer/routes/dispatches`
- Handoff pattern: 5-team review dispatched and received (BE / FE / Designer / QA / DevOps). Review fixes are being applied in this same branch.
- Implemented routes: `/dispatches/manual`, `/dispatches/pre-classify`, `/dispatches/unassigned`, `/dispatches/reconcile`
- Key fixes from review: `kakaoSeq` DTO alignment, Arologis role constants, design-system CSS import, raw hex cleanup, desktop CI typecheck hard-fail, D-AX-11 route IA note.
- Phone check: remote/PR viewing requires push/PR network access. Per owner instruction, no approval prompt will be requested for non-merge work; keep local handoff current until a permitted push path is available.

---

## 0. 즉시 시작 — 코덱스에서 첫 명령

```powershell
git checkout main
git pull
git log --oneline -5
# → 1ad4296 feat(samhan-signature-copy): Phase F (#191) 가 가장 최근 머지
```

**코덱스가 모르는 본 repo 의 핵심 컨벤션** (Claude Code `.claude/memory/` 가 있지만 코덱스는 못 읽음 — 아래만 알면 충분):

| 규칙 | 요점 |
|---|---|
| 한국어 commit/PR/Issue | prefix (`feat:`/`fix:`/...) + trailer 만 영어, 본문은 한국어 |
| 5-team 패턴 | BE/FE/Designer/DevOps **4 parallel** + QA **sequential** (실 산출 검증 + 실 캡처) |
| 통합 PR | 단편 PR 금지. 디자인/UI 차이까지 묶어 통합 PR + QA + TM 승인 |
| QA 스크린샷 | 모든 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 (`docs/qa/<slug>/screenshots/*.png`) |
| QA mock fallback | 실 emulator 어려운 경우 PowerShell System.Drawing mock PNG OK (`scripts/generate-*-screenshots.ps1` 패턴) |
| UUID 비공개 | 모든 클라이언트 화면 UUID 노출 금지. 비즈니스 식별자 (슬립번호/창고 코드/거래처명) 만 |
| BaseEntity 7 audit | 모든 entity 가 `BaseEntity` 상속 + Soft Delete 만 |
| Korean Path JDK 트랩 | 한글 path 에서 `gradle test` fail. `assemble` 사용 또는 영문 path |
| gradlew chmod | Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수 (Linux CI Permission denied 방지) |
| PowerShell UTF-8 | `Set-Content` 기본 UTF-16 LE BOM 트랩. Write/Edit/heredoc 사용 |
| 머지 권한 | 사용자 (개발책임자) 결정. 5-team 0 결함 + CI green 시도 사용자 trigger 만 머지 |

---

## 1. 방금 끝난 일 — Phase F (PR #191) 머지 완료 (2026-05-15)

**PR**: https://github.com/ewoo14/SamhanLogis/pull/191 — **MERGED** (squash commit `1ad4296`)
**제목**: `feat(samhan-signature-copy): Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~13)`

### 핵심 산출 (한 줄 요약)

기사 어플 정차 도착 → DELIVERY 사진 첨부 (기존 SignaturePhotoScreen) → DriverSignatureScreen 자체+인수자 서명 → arologis 가 양쪽 저장 (자체 signatures + slip-service signature_source=APP) + 서버 Playwright Chromium 으로 OutboundView 양식 사본 PNG 합성 + mobile expo-sharing Share Sheet 으로 인수자에게 발송 (**기사 본인 카톡, Aligo 0**).

### 13 결정 (D-DF-01~13)

`migration/decisions/DECISIONS.md` 의 D-DF-00 entry 참조. 핵심:
- **Aligo 폐기** → mobile RN expo-sharing Share Sheet (기사 본인 발신)
- **PNG 합성 방식** = 서버 측 Playwright Java SDK 1.47 + Chromium headless → `OutboundView.tsx` URL (file://) 렌더링 → fullPage screenshot
- **양쪽 저장** = arologis 자체 `signatures` + slip-service `signature_source=APP` + `slip_signature_audit`. 출고전표 본체 (Slip) 는 slip-service 단일 SOT
- **사진 첨부 통합 (D-DF-13)** = 기존 SignaturePhotoScreen (P1-8 Stage 4) W10-4 deep link 활성. 사진은 slip-service attachment 별도, 사본 PNG 와 분리

### 4 신규 컬럼 (Flyway V11) — `arologis.signatures`

| 컬럼 | 의미 |
|---|---|
| `copy_sent_at` | PNG download 시각 (성공 1회 가드, NULL → OK, NOT NULL → 409) |
| `copy_send_failure_count` | Tx2 c/d fail 카운트 (모니터링 alert 임계치) |
| `copy_image_path` | disk path (`/var/lib/arologis/signature-copies/{signatureId}.png`) — Phase 11 cutover 시 S3 키로 갈아탐 |
| `copy_recipient_phone` | 발송 시점 slip recipientPhone 스냅샷 (풀 번호) |

### 핵심 파일 (Phase F 신규/수정)

```
services/arologis-service/
├── src/main/java/com/samhanair/logis/arologis/
│   ├── domain/Signature.java                                    (4 column + markCopySent + markCopyFailure)
│   ├── service/copy/
│   │   ├── SignAndSendCopyService.java                          (Tx1 atomic + Tx2 best effort orchestration)
│   │   ├── PlaywrightCopyRenderer.java                          (Playwright wrapper, RendererTimeoutException/RendererErrorException)
│   │   ├── CopyImageDiskStorage.java                            (disk save)
│   │   └── CopyFailureReason.java                               (enum)
│   ├── controller/ArologisDriverAppController.java              (POST /sign-and-send-copy 추가, /sign @Deprecated)
│   ├── client/SlipClient.java                                   (findRecipientPhone + findFullDetail 추가)
│   ├── service/SlipResolver.java                                (findRecipientPhone + buildSlipDataMap)
│   ├── config/PlaywrightConfig.java                             (Browser bean, @ConditionalOnProperty)
│   └── web/dto/copy/SignAndSendCopy{Request,Response}.java
├── src/main/resources/db/migration/V11__add_signature_copy_columns.sql
└── Dockerfile                                                    (Playwright + Chromium + fonts-noto-cjk)

clients/desktop/
├── print-renderer/                                               (NEW — multi-entry)
│   ├── index.html / main.tsx / PrintRendererApp.tsx
└── vite.print-renderer.config.ts

clients/mobile-staff/
├── src/api/arologis.ts                                           (signAndSendCopy + 응답 분기 타입)
├── src/screens/driver/
│   ├── DriverSignatureScreen.tsx                                 (1-tap 완료+발송 + Share Sheet + 5 토스트)
│   ├── SignaturePhotoScreen.tsx                                  (onUploaded → DriverSignature chain)
│   └── DriverTabNavigator.tsx                                    (signature-photo 탭 추가)
└── package.json                                                  (expo-sharing + expo-file-system + base-64 추가)

services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java   (/recipient-phone + /full 추가)

docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md   (v3.1, 13 결정)
docs/superpowers/plans/2026-05-15-samhan-signature-copy.md          (5-team plan)
docs/dev-reports/samhan-signature-copy.md                            (3-layer 누적)
docs/qa/samhan-signature-copy/scenarios.md                            (7 시나리오 + 회귀 + 4단계 롤백)
docs/qa/samhan-signature-copy/screenshots/01~07.png                  (PowerShell mock fallback)
scripts/generate-samhan-signature-copy-screenshots.ps1                (재실행 스크립트)
docs/uiux/samhan-signature-copy/01~03.md                              (Designer mock 3장)
docs/migration/phase11/M-PHASE-11-signature-copy-memory.md           (Chromium 메모리 검증)
infrastructure/env-templates/arologis-service.env                     (4 env 추가)
```

### spec/plan vs 실 코드 정정 9건 (BE worker 자체 정정 — plan 문서와 실 코드 차이)

1. `VehicleStop` 직접 dispatchId 미보유 → 권한 = `vehicle.assignedDriverId == driverId`
2. Slip 의 `sourceWarehouseName` 미존재 → `sourceWarehouseId.toString()` placeholder
3. Slip 의 `recipientAddress` X → `deliveryAddress` 사용
4. Slip 의 `recipientPhoneNumber` X → `recipientPhone` (V20 column)
5. Slip 의 `totalSupply`/`vat`/`total` getter 미존재 → lines 합산 계산
6. `VehicleStop.recipientName` 미존재 → "어플인수자" placeholder
7. `DriverPrincipal` 미도입 → `X-User-Id` → `DriverRepository.findByAppUserId` 패턴
8. `PlaywrightConfig` — `@ConditionalOnProperty(arologis.playwright.enabled=true)` 추가
9. `SignatureRepository.findFirstByStopIdAndSourceOrderByCreatedAtDesc` 미존재 → `findAllByStopIdOrderByCapturedAtDesc` stream filter

### 통계

- BE 8 commit + FE 5 + Designer 1 + DevOps 3 + QA 2 + TM 통합/PR/QA fix 다수 = 23 commit
- arologis-service: **221 tests / 0 fail / 75 skipped (Docker npipe — IT 5건 코드만, CI Linux 실행)**
- slip-service: **454 tests / 0 fail / 171 skipped** (PR #99 SignatureIntegrationIT 보존)
- mobile-staff: **TS 0 errors + Jest 7 PASS** (DriverSignatureScreen 6 + SignaturePhotoScreenChain 1)
- desktop print-renderer build: **SUCCESS (148.67 kB)**
- CI 21 check all PASS + GitGuardian PASS
- 회귀 0 결함

---

## 2. PR #191 후속 — 즉시 진행 가능한 fix (선택)

| # | 후속 작업 | 우선순위 | 추정 |
|---|---|---|---|
| F1 | QA 캡처 텍스트 잘림 fix (01/05/07 우측/좌측 1~2 글자) | LOW | 30분 (PowerShell width margin 또는 텍스트 단축) |
| F2 | `.claude/memory/project_samhan_signature_copy.md` 신규 메모리 작성 | LOW | 10분 (TM agent 권한 차단으로 미작성, 결정은 DECISIONS + dev-report 보존) |
| F3 | Admin 재발송 endpoint PR (`/admin/.../signatures/{id}/resend-copy`) | MEDIUM | 1~2일 spec + plan + 5-team |
| F4 | KakaoLink SDK deep link PR (인수자 번호 prefill) | MEDIUM (사용자 피드백 후) | 2~3일 |
| F5 | `/sign` endpoint 완전 제거 PR (1~2 분기 후) | LOW | 30분 |
| F6 | OutboundView refactor (옵션 a — useQuery 분리, drift 0 우선시) | LOW | 1일 |
| F7 | Phase 11 disk → S3 cutover PR | Phase 11 시점 | 별도 |
| F8 | `copy_send_failure_count` Slack alert (>5 / 10분) | LOW | 반나절 |

---

## 3. 다음 trigger 후보 (개발책임자 결정)

### 즉시 가능 (인성 자료 무관)

- **Phase E** — 인수자 카톡/문자 발송 (배차 기사 정보) — notification-service Aligo 활용. spec 신규 필요 (브레인스토밍 권장).
- **D-AX-11** — FE 산재 페이지 이전 (`ArologisManualDispatchPage` 등 4 page + Api 3 + RealtimeClient) — HIGH 우선순위. spec 신규.
- **D-AX-12** — mobile cross-import 분리 (`DriverTabNavigator` → `SlipDetailScreen`) — Phase F 머지 후 환경 안정화 후 진행 권장. spec 신규.
- **D-AX-13** — BE/FE auth schema 정합 검증 (`/auth/me` 응답) — 작은 PR.
- **ACM SAN 갱신** — Terraform `*.arologis.samhan-air.com` 추가 (Phase 11 cutover 전).
- **EC2 Health Lambda** — CloudWatch alarm + SNS 별도 PR.
- **Phase F 후속 fix** — F1~F8 위 표 (단순 fix 부터 큰 PR 까지).

### 인성데이타 API 링크 도착 대기 (사용자 요청 "추후")

- **Phase B** — arologis `InsungQuickDriverMatcher` 실 활성 (W10-2 trigger).
- **Phase D** — GPS 실시간 공유 (SSE) — 인성 LBS callback endpoint.

---

## 4. 본 conversation 누적 머지 (8 PR, PR #184~#191)

| PR | merge commit | 내용 |
|---|---|---|
| #184 | `f3cb306` | 아로로지스 독립 분리 (D-AX-01~10) — monorepo 유지 + 자체 auth + 휴대번호 passwordless |
| #185 | `26f2bc3` | post-merge follow-up — mock PNG 6장 + handoff + autopilot 메모리 v2 |
| #186 | `2bd653f` | D-AX-14 자동 폰번호 인식 + 1-tap 로그인 (PR #184 보완) |
| #187 | `cc106d1` | D-AX-14 mock 스크린샷 3장 follow-up |
| #188 | `01d41f6` | **Phase A — 배차 메뉴 + 아로로지스 발송** (D-DB-01~09) |
| #189 | `9bebe12` | **Phase C — 배차 수정/취소 요청 흐름** (D-DC-01~09) + 5-team 패턴 정정 메모리 |
| #190 | `3b3d04d` | handoff 갱신 — PR #184~#189 머지 + Phase F spec 리뷰 대기 + 후속 Phase 안내 |
| #191 | `1ad4296` | **Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송** (D-DF-01~13). 새 5-team (QA sequential) 첫 적용 + Aligo 폐기 + Playwright Chromium 도입 |

---

## 5. 코덱스 진입 시 권장 흐름

1. **`git pull`** + `git log --oneline -5` 로 main 의 최신 (`1ad4296`) 확인.
2. **본 파일 (`docs/handoff/CURRENT-WORK.md`) 다시 read** — 진행 상태 즉시 파악.
3. **사용자 (개발책임자) 의 다음 trigger 메시지 대기** — §3 의 후보 중 하나, 또는 새 작업.
4. 작업 시작 시 **§0 의 컨벤션 표** 준수 (한국어 commit + 통합 PR + QA 캡처 + UUID 비공개 등).
5. 큰 작업 (신규 Phase, 새 endpoint 다수) = brainstorm → spec → plan → 5-team 디스패치 → TM 통합 → PR 발행 → 사용자 머지 패턴 따름.
6. 작은 작업 (단순 fix, env 변경, 문서) = 즉시 commit + PR (단 통합 PR 패턴 유의).

### 5-team 디스패치 시 (Claude Code 환경에서 검증된 패턴, 코덱스 환경에서는 적응 필요)

본 repo 의 `.claude/worktrees/` 가 Claude Code 의 git worktree isolation 디렉토리. 코덱스도 git worktree 사용 가능 (`git worktree add ...`). 4 team 동시 worktree 분리 → 머지 패턴.

또는 코덱스 환경에서 단순화: TM 한 사람이 모든 team scope 를 순차 진행 (slow 하지만 단순).

### 메모리 시스템 (Claude Code 전용 — 코덱스 무관)

`.claude/memory/MEMORY.md` 는 Claude Code 의 자동 로드 메모리. 코덱스는 이 시스템 모름. 그러나 git tracked 라 코덱스도 read 가능. 본 파일 (CURRENT-WORK.md) + `migration/decisions/DECISIONS.md` + `docs/superpowers/specs/` + `docs/superpowers/plans/` + `docs/dev-reports/` 만 알면 충분.

**Claude Code 로 다시 돌아올 때**: `.\scripts\sync-claude-memory.ps1` 실행 (repo .claude/memory → 사용자 홈 ~/.claude/projects/c--dev-SamhanLogis/memory/ 단방향 복사).

---

## 6. 통계 (본 conversation, 2026-05-14 ~ 05-15)

- 누적 PR 머지: **8** (#184~#191)
- 누적 commit: ~170+ (5-team x 7 cycle + TM + PM + fix)
- 누적 메모리 (Claude Code): 8 신규 (Phase F 의 `project_samhan_signature_copy` 만 미작성, DECISIONS + dev-report 보존)
- 누적 DECISIONS entry: D-AX-01~14 + D-DB-01~09 + D-DC-01~09 + D-DF-01~13 (50+ entry)
- 회귀 가드: 모든 PR 0 결함 (slip-service 단위 ~98 + IT 50+ 보존)
- AWS 비용 변경: ₩0 (Phase 11 계획 ₩405K/월 유지, Chromium ~500MB pool 은 m5.xlarge 16GB 여유 안 — `docs/migration/phase11/M-PHASE-11-signature-copy-memory.md`)

---

## 7. 양 PC 작업 인계 절차 (Claude Code)

### 떠나는 PC (현재 PC)

```powershell
# CURRENT-WORK.md 갱신은 본 commit 으로 진행
git checkout main
git pull
```

### 도착하는 PC (회사/집)

```powershell
git pull
.\scripts\sync-claude-memory.ps1   # 8 신규 메모리 동기화 (Claude Code 사용 시)
# Claude Code 새 세션 → CLAUDE.md 자동 로드 + 본 파일 read 으로 컨텍스트 회복
# 코덱스 사용 시 → 본 파일 read + git pull 만으로 충분
# trigger: §3 의 후보 중 하나, 또는 새 작업
```
