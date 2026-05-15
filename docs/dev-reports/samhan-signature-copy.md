# Samhan Public 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (Phase F) — dev-report

> 본 dev-report 는 [`feedback_function_documentation.md`](../../.claude/memory/feedback_function_documentation.md) 의 3-layer 누적 의무 (Javadoc + springdoc-openapi + dev-report) 의 dev-report layer.
>
> 작성일: 2026-05-15 (TM 통합 commit 시점, QA 후속 sequential 진행 전).
> spec: [`docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md`](../superpowers/specs/2026-05-14-samhan-signature-copy-design.md) (v3.1)
> plan: [`docs/superpowers/plans/2026-05-15-samhan-signature-copy.md`](../superpowers/plans/2026-05-15-samhan-signature-copy.md)

---

## 1. 슬라이스 요약

| 항목 | 값 |
|---|---|
| 슬라이스 | Phase F — Samhan Public 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~13) |
| 영향 service | **arologis-service + slip-service + clients/mobile-staff + clients/desktop (print-renderer 빌드)** |
| Flyway 신규 | V11 (arologis-service `signatures` 4 column 추가) |
| 신규 service (arologis) | `SignAndSendCopyService` (Tx1 atomic + Tx2 best effort) + `PlaywrightCopyRenderer` + `CopyImageDiskStorage` + `CopyFailureReason` enum |
| 신규 endpoint (arologis) | `POST /driver-app/dispatches/{dispatchId}/stops/{stopId}/sign-and-send-copy` (1-tap) — 기존 `/sign` `@Deprecated` |
| 신규 endpoint (slip-service) | `GET /internal/slips/{slipId}/recipient-phone` + `GET /internal/slips/{slipId}/full` |
| SlipClient 변경 | 2 신규 메서드 + SlipResolver 확장 (recipient-phone/full lookup) |
| 신규 화면 (mobile-staff) | `DriverSignatureScreen` 1-tap 갱신 (자체+인수자 서명 → POST → image/png 응답 → expo-sharing Share Sheet) + `SignaturePhotoScreen → DriverSignatureScreen` deep link 활성 (D-DF-13) |
| 신규 의존성 (mobile-staff) | `expo-sharing`, `expo-file-system`, `base-64`, `jest` 7 시나리오 |
| 신규 빌드 (desktop) | `vite.print-renderer.config.ts` multi-entry + `clients/desktop/print-renderer/` (PrintRendererApp PoC OutboundView 양식) |
| Dockerfile | arologis-service 신규 (Playwright + Chromium + fonts-noto-cjk 패키지) |
| env 신규 | `AROLOGIS_SIGNATURE_COPY_DIR`, `AROLOGIS_PLAYWRIGHT_BROWSER_PATH`, `AROLOGIS_PRINT_RENDERER_PATH`, `AROLOGIS_COPY_RENDERER_TIMEOUT_MS`, `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false` |
| docs 동기화 | DECISIONS D-DF-00 entry 13건 + dev-report (본 파일) + README 4건 + ROADMAP + 메모리 1 신규 + MEMORY hook + handoff |

---

## 2. 12 핵심 결정 요약 (D-DF-01~13)

| # | 결정 | 비고 |
|---|---|---|
| D-DF-01 | 서명 정보 양쪽 저장 = arologis 자체 `signatures` + slip-service `signature_source=APP` | PR #99 skeleton-mode 활성 |
| D-DF-02 | 사본 형식 = PNG (출고전표 양식 + 서명 2개 합성) | OutboundView 그대로 |
| D-DF-03 | **사본 발송 = mobile expo-sharing Share Sheet** (기사 본인 발신, Aligo 0) | v3 Aligo 폐기 |
| D-DF-04 | 사본 1회 제한 = `Signature.copy_sent_at` (download 시각, NULL→OK / NOT NULL→409) | Admin 재발송 후속 |
| D-DF-05 | 인수자 번호 = slip-service `recipientPhoneNumber`, null/잘못된 형식 → skip + reason | 차단 X |
| D-DF-06 | **PNG 합성 = arologis-service in-process Playwright Java SDK + Chromium → OutboundView URL 렌더 → PNG 캡처** | 서버 단일 출처 |
| D-DF-07 | endpoint = `POST .../sign-and-send-copy` (1-tap, image/png 또는 application/json 분기) | 1-tap UX |
| D-DF-08 | 권한 = `ROLE_AROLOGIS_DRIVER` + `JWT.driverId == dispatch.driverId` | Phase A/C 패턴 |
| D-DF-09 | PII = `recipientPhoneNumber` 마스킹 응답/UI/로그, DB 풀 번호 | Aligo audit 의미 약화 |
| D-DF-10 | PNG 보관 = disk path (`AROLOGIS_SIGNATURE_COPY_DIR`), Phase 11 → S3 | Admin 재발송 |
| D-DF-11 | PNG 양식 = A4 portrait, ~600×850 px, 1MB 이내 | OutboundView a4-portrait |
| D-DF-12 | mobile Share API = `expo-sharing` (RN 표준), 인수자 번호 화면 표시 | KakaoLink SDK 의존 X |
| D-DF-13 | DELIVERY 사진 첨부 = 기존 `SignaturePhotoScreen` (1MB 압축, 최대 3장), W10-4 deep link 활성 → DriverSignatureScreen chain | 사진 = slip attachment 별도 |

---

## 3. 4-team + QA sequential 산출 (TM 통합 17 commit)

### 3.1 Designer (1 commit, `bacb6de`)

- `docs/uiux/samhan-signature-copy/01-signature-screen-1tap.md` — SignatureScreen 1-tap UI mock (서명 영역 2 + 완료/발송 버튼 + 토스트 6종 + 재시도 + audit overlay)
- `docs/uiux/samhan-signature-copy/02-share-sheet-android.md` — Android expo-sharing Share Sheet 캡처 명세 (카톡/SMS/메시지)
- `docs/uiux/samhan-signature-copy/03-share-sheet-ios.md` — iOS expo-sharing Share Sheet 캡처 명세 (메시지/카톡 인앱)
- 합계 812 lines

### 3.2 DevOps (3 commit, `7647323` → `4551ef2` → `3e0c359`)

- `services/arologis-service/Dockerfile` — Playwright Java SDK + Chromium + fonts-noto-cjk apt 추가, env 4건 명시 (AROLOGIS_SIGNATURE_COPY_DIR, AROLOGIS_PLAYWRIGHT_BROWSER_PATH, AROLOGIS_PRINT_RENDERER_PATH, AROLOGIS_COPY_RENDERER_TIMEOUT_MS)
- `clients/desktop/vite.print-renderer.config.ts` (NEW) + `clients/desktop/print-renderer/{PrintRendererApp.tsx,index.html,main.tsx}` — multi-entry 별도 빌드, OutboundView a4-portrait variant 적용 PoC
- `clients/desktop/package.json` — `build:print-renderer` script 추가
- `docs/migration/phase11/M-PHASE-11-signature-copy-memory.md` (NEW, 164 lines) — Phase 11 AWS 이전 시 메모리/CPU 검증 노트 + cutover storage migration runbook (disk → S3)

### 3.3 FE (5 commit, `dc5336c` → `d1dd8a2`)

- F1: `expo-sharing` `expo-file-system` `base-64` `jest` 의존성 추가 (`package.json`, `package-lock.json`)
- F2: `clients/mobile-staff/src/api/arologis.ts` — `signAndSendCopy` 함수 + 응답 타입 분기 (`success | fail | duplicate | bridge | disabled`)
- F3: `DriverSignatureScreen.tsx` — 1-tap 완료+발송 버튼 + Share Sheet 자동 호출 + 5 토스트 + 재시도 (D-DF-07/12)
- F4: `__tests__/screens/driver/DriverSignatureScreen.test.tsx` — Jest 6 시나리오 (success/skip/timeout/duplicate/bridge/disabled)
- F5: `SignaturePhotoScreen.tsx` → `DriverSignatureScreen` W10-4 deep link 활성 (D-DF-13) + chain Jest 1건 = 총 7건

### 3.4 BE (8 commit, `895a713` → `2d169f5`)

- B1: `signatures` 4 column (`copy_sent_at`, `copy_send_failure_count`, `copy_image_path`, `copy_recipient_phone`) + Flyway V11 + `Signature.markCopySent`/`markCopyFailure` + 단위 3건
- B2: `CopyFailureReason` enum (`RECIPIENT_PHONE_MISSING`, `RENDERER_TIMEOUT`, `RENDERER_ERROR`, `STORAGE_FULL`) + `CopyImageDiskStorage` + 단위 3건
- B3: Playwright Java SDK 의존성 + `PlaywrightConfig` (Browser bean lifecycle) + `PlaywrightCopyRenderer` + 단위 6건
- B4: `SignAndSendCopyRequest` / `SignAndSendCopyResponse` DTO + Javadoc
- B5: `SlipResolver` 확장 + `SlipClient` 2 신규 메서드 (`getRecipientPhone`, `getFullSlip`) + slip-service 2 endpoint (`/recipient-phone`, `/full`)
- B6: `SignAndSendCopyService` Tx1 atomic (savepoint, slip-service 5xx → 422 + rollback) + Tx2 best effort (renderer/storage fail 시 200 + JSON reason) + 단위 7건
- B7: `ArologisDriverAppController` `POST /sign-and-send-copy` endpoint + 기존 `/sign` `@Deprecated`
- B8: IT 5건 (`SignAndSendCopyIT` 성공 / `SignatureCopyDuplicateIT` 409 / `SignatureCopyMissingPhoneIT` skip+reason / `SignatureCopyRendererTimeoutIT` Tx2 fail / `SignatureCopyAtomicFailIT` Tx1 422 + arologis rollback) + `AbstractSignAndSendCopyIT` base

**자체 정정 (4 team 18건)**:
- BE 9건: SignatureRepository 신규 메서드 대신 stream filter (기존 메서드 재사용), Playwright timeout default 1024ms, slip-service /full DTO snapshot 등
- DevOps 4건: 별도 `vite.print-renderer.config.ts` (electron-vite와 분리), Phase 11 메모리 노트 disk → S3 migration runbook 분리 등
- FE 5건: react-native-signature-canvas 미설치 시 mock dataURL guard + production 도입 시 testID 보존 명시 등

### 3.5 QA (sequential — 후속 단계)

**TM 통합 commit 후 별도 진입 예정**:
- 6 시나리오 + 회귀 ~98 절차
- 실 BE/FE 산출 검증 (compile + test 결과 확인)
- 실 PNG 캡처 (출고전표 양식 + 한글 fonts-noto-cjk 적용 확인)
- 실 Share Sheet 캡처 (Android emulator + iOS simulator)
- 4단계 롤백 runbook (Tx1 fail / Tx2 fail / 사본 미발송 / Phase 11 cutover)

---

## 4. 테스트 통계

| service / project | tests | failure | skipped | 비고 |
|---|---|---|---|---|
| `services:arologis-service:test` | 221 | **0** | 75 | 단위 19 신규 + 기존 회귀, IT 75 Docker npipe skip ([feedback_testcontainers_windows_docker]) |
| `services:slip-service:test` | 454 | **0** | 171 | PR #99 SignatureIntegrationIT 보존, IT 171 Docker npipe skip |
| mobile-staff `npx tsc --noEmit` | — | **0 error** | — | TypeScript 타입 검증 PASS |
| mobile-staff `npx jest --testPathPattern='driver/(DriverSignatureScreen|SignaturePhotoScreenChain)'` | 7 | **0** | 0 | 6 + 1 chain |
| desktop `npm run build:print-renderer` | — | SUCCESS | — | 148.67 kB / 787 ms |

---

## 5. 새 5-team 패턴 첫 적용 회고 (BE/FE/Designer/DevOps 4 parallel + QA sequential)

본 Phase F 가 [`feedback_qa_sequential_after_be_fe.md`](../../.claude/memory/feedback_qa_sequential_after_be_fe.md) 패턴 첫 적용. 결과:

- BE/FE/Designer/DevOps 가 spec 만 보고 mock/contract 기반 4 parallel 진행
- 자체 정정 18건 (각 worktree 내 commit) → spec/plan 정정 PR 별도 X
- TM 통합 시 충돌 0 (각 team scope 명확 분리)
- QA 는 통합 commit 후 sequential 진입 → 실 산출 검증 + 실 PNG/Share Sheet 캡처 가능 (mock 단계 회피)

**개선점**:
- DriverSignatureScreen Jest 1번째 시나리오 (4 expect chain) Windows 환경에서 5s timeout 부족 → TM 통합 시 15s 로 명시. (FE worktree 환경 차이로 PASS 했던 케이스 — 향후 Jest timeout 기본값 가이드 필요)
- vite.print-renderer.config.ts 가 별도 파일 (electron-vite 와 충돌 회피) — 빌드 명령 안내 필수 (README 갱신 의무)

---

## 6. Aligo 미사용 결정 근거 (D-DF-03)

v1/v2 spec 까지는 Aligo (notification-service) 채널 발송이었으나, v3 에서 **mobile expo-sharing 으로 전환**:

1. **발신자 신원 정확** — 기사 본인 발신 (회사 대표번호 X). 인수자 입장 "누가 보낸 사본인가" 명확
2. **비용 0** — Aligo 알림톡/SMS 비용 (~₩50/건) 발생 X
3. **인수자 번호 의존성 약화** — 잘못된 번호여도 기사가 화면 표시된 인수자 번호 보고 카톡 friend / SMS 수신자 직접 선택 가능
4. **D-DF-05 차단 X** — recipientPhoneNumber null 이어도 서명/사본 자체는 진행 (skip + reason 응답, mobile 화면 안내)

**trade-off**: notification-service 가 발송 audit (sent_at, recipient_id) 기록하지 못함. 대신 arologis `Signature.copy_sent_at` 가 download 시각 기준 1회 가드 (D-DF-04). 발송 자체 audit 은 mobile OS Share Sheet 의존 (사용자 행동 추적 불가, trade-off 인정).

---

## 7. 후속 PR 안내

| 후속 작업 | 시점 | 비고 |
|---|---|---|
| QA sequential | 즉시 (TM 통합 commit 후) | 실 PNG / Share Sheet 캡처 + 회귀 ~98 + 4단계 롤백 runbook |
| TM2 PR 발행 | QA 완료 후 | GitGuardian + CI green + 5-team 검토 → PM 자동 머지 |
| Admin 사본 재발송 endpoint | 별도 후속 PR | `POST /admin/.../signatures/{id}/resend-copy` (`copy_sent_at` reset, 권한 ROLE_MANAGER+) |
| Phase 11 cutover storage migration | Phase 11 진입 시점 | disk → S3 (`AROLOGIS_SIGNATURE_COPY_DIR` → S3 키 prefix), Phase 11 메모리 노트 참조 |
| Phase D (GPS SSE) / Phase E (인수자 정보 카톡) | 인성데이타 API 링크 도착 후 | 별도 spec/plan |
