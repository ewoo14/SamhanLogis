# SP-10-2 인성데이타 퀵프로그램 vendor 통합 — Master Plan

> 작성일: 2026-05-19
> 작성자: PM (Claude)
> 베이스: `main` (`b76d3cc6` — SP-D4 #244 머지 직후)

## §1 슬라이스 목표

W10-1 머지 산출 (`InsungQuickDriverMatcher` placeholder, `MatcherConfig`, `ArologisMatcherProperties`, `ArologisInternalController#syncDispatch` ack-only, `SAMHAN_INSUNG_QUICK_*` env 빈 값) 위에 **실 vendor 통합 layer** 를 얹는다. 실 API 정보 미확정 상태에서도 **SP-09 vendor 시리즈 (NTS/Aligo/Clova/KFTC)** 의 sandbox/skeleton/placeholder-guard 패턴 일관 적용:

1. `InsungQuickDriverMatcher` 실 구현 + `InsungQuickClient` REST 어댑터 + 양방향 webhook 3종 (매칭/상태/완료)
2. 알림톡 분리 (인성 channel) + GPS 하이브리드 (insung-lbs 우선) 결정 활성
3. Mock fallback 보존 → vendor sandbox 키 발급 시점 무중단 cutover 가능 토글 구조

1 통합 PR 머지. `arologis-desktop` 만 영향, `arologis-mobile` 영향 0.

## §2 BE 작업 분할

| # | 산출물 | 위치 | 핵심 |
|---|---|---|---|
| BE-1 | `InsungQuickDriverMatcher` 실 구현 | `services/arologis-service/.../matcher/InsungQuickDriverMatcher.java` | `UnsupportedOperationException` 제거 → `InsungQuickClient.requestMatch()` 호출 + 응답 파싱 + `Driver` upsert (driverCode = `INSUNG-<vendorDriverId>`) + `MatchSource.EXTERNAL_INSUNG_QUICK` + fail-soft (RPC 예외 시 `DriverMatchResult.empty()`) |
| BE-2 | `InsungQuickClient` REST 어댑터 | `.../client/InsungQuickClient.java` + `InsungQuickClientImpl.java` | `WebClient` (기존 `WebClientConfig` 재사용) + 4 method: `requestOrder(Vehicle,List<Stop>)` / `requestMatch(orderId)` / `cancelOrder(orderId)` / `queryStatus(orderId)`. **SP-09 placeholder guard 일관** — `isPlaceholderApiKey()` (PLACEHOLDER_DEV_ONLY / CHANGE_ME_LOCAL_ONLY / changeme / dummy / 빈 값 6 키워드 차단) → blank/placeholder 시 `BusinessException(INSUNG_QUICK_NOT_CONFIGURED)` throw. timeout 5s + retry 1회 |
| BE-3 | Webhook endpoint 확장 | `.../controller/ArologisInternalController.java` | 기존 `/dispatches/sync` 위에 3 sub-endpoint 추가: `POST /internal/arologis/insung/match-result` (매칭 완료/실패), `POST /internal/arologis/insung/status-update` (DEPARTED/ARRIVED), `POST /internal/arologis/insung/delivered` (전자서명 + GPS). X-Internal-Token + `X-Insung-Signature` HMAC 검증 (sandbox 우회) |
| BE-4 | `ArologisMatcherProperties` 확장 | `.../config/ArologisMatcherProperties.java` | `insungQuick.{apiUrl,apiKey,partnerId}` 위에 `sandboxMode:boolean=true`, `webhookSecret:string`, `requestTimeoutMs:int=5000`, `notify.dispatchChannel=insung-talk\|aligo` 추가 |
| BE-5 | Flyway V13 | `.../db/migration/V13__add_insung_order_ref.sql` | `vehicle` 테이블 `vendor_order_id VARCHAR(64)` + `vendor_status VARCHAR(20)` + partial unique index `(vendor_order_id) WHERE is_deleted=false AND vendor_order_id IS NOT NULL`. BaseEntity 7 audit + Soft Delete 유지 |
| BE-6 | IT 신규 | `.../src/test/.../it/InsungQuickIntegrationIT.java` | `@MockBean InsungQuickClient` lenient stub (SP-09-5 일관) — Postgres testcontainer + `provider=insung-quick` + sandbox-mode + webhook 3종 200 응답 + match-result 수신 시 Vehicle.status ASSIGNED 전이 |
| BE-7 | Phase10VendorPlaceholderGuardConsistencyTest | `.../src/test/.../vendor/` | `Phase9VendorPlaceholderGuardConsistencyTest` 패턴 — `InsungQuickClientImpl` placeholder 6 키워드 차단 + false-positive 가드 (`sandbox-key-xxx` 정상 통과) |

UUID 비공개: `Driver.driverCode` (`INSUNG-<vendorId>`) 만 응답 노출. 한국어 Javadoc 의무.

## §3 FE 작업 (`clients/arologis-desktop` only)

| # | 산출물 | 위치 |
|---|---|---|
| FE-1 | vendor 매칭 상태 표시 컴포넌트 | `clients/arologis-desktop/src/renderer/components/VehicleMatchStatusBadge.tsx` (PENDING/MATCHING/ASSIGNED/DELIVERED 4단계 + Designer token 색상) |
| FE-2 | 인성 LBS 위치 표시 패널 | `.../components/InsungLbsPanel.tsx` (`DriverLocation.source=EXTERNAL_INSUNG_LBS` + app-gps 보강 표시) |
| FE-3 | 알림톡 발송 결과 표시 | `.../routes/dispatches/DispatchDetailPage.tsx` 갱신 (`notify.channel=insung-talk` 결과 row) |
| FE-4 | `vendorOrderId` audit 표시 | DispatchDetail vehicle row hover tooltip |

`arologis-mobile` 영향 0. 사이드바 메뉴 변동 0.

## §4 Designer 작업

| 산출물 | 위치 |
|---|---|
| wireframe 4단계 vendor 매칭 시각화 | `docs/design/sp-10-2-insung-quick-vendor/wireframe.md` — PENDING(회색)/MATCHING(파랑+spinner)/ASSIGNED(초록+driverCode+INSUNG 뱃지)/DELIVERED(회색+체크) |
| design-system token 활용 spec | `.../tokens.md` (기존 arologis-desktop color/spacing 인용) |
| 알림톡 결과 row UX | `.../notification-row.md` (insung-talk 성공/실패/지연) |
| GPS 하이브리드 우선순위 표시 | `.../gps-priority-indicator.md` (활성 source bold + others muted) |
| 인쇄 양식 영향 0 명시 | `.../print-impact.md` skeleton |

Designer↔QA 짝 가드 — 4단계 mock 각각에 대응하는 QA Playwright case 1:1 매핑.

## §5 QA 작업

| # | Playwright case | 검증 |
|---|---|---|
| QA-1 | `qa/playwright/tests/arologis/insung-mock-match.spec.ts` | provider=mock 시 매칭 흐름 회귀 0 |
| QA-2 | `.../insung-sandbox-fallback.spec.ts` | provider=insung-quick + sandbox + RPC 예외 → empty + Vehicle.status PENDING 유지 + admin 수동 매칭 fallback |
| QA-3 | `.../insung-notify-channel-separation.spec.ts` | 배차 단계=insung-talk / 어플 invite=Aligo 분리 |
| QA-4 | `.../insung-gps-priority.spec.ts` | insung-lbs+app-gps 동시 수신 시 insung-lbs 우선 |
| QA-5 | `.../insung-webhook-status-update.spec.ts` | match-result/status-update/delivered 3 webhook 수신 → UI 실시간 전이 |
| QA-6 | `.../insung-sidebar-no-impact.spec.ts` | `arologis-desktop` 좌측 메뉴 unchanged |

BE-6 외 추가 신규 IT 0.

## §6 DevOps 작업

| # | 산출물 |
|---|---|
| DO-1 | `infrastructure/env-templates/arologis-service.env` 갱신 — `SAMHAN_INSUNG_QUICK_SANDBOX_MODE=true` / `SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET=` / `SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL=insung-talk` 빈 값 유지 |
| DO-2 | `docs/operational-validation/sp-10-2-insung-key-rotation.md` 신규. prod 키는 운영 PC `.env` 만 보존 (SP-08-8 일관) |
| DO-3 | **CI grep 가드 확장** — `scripts/check-credential-plaintext.sh` 에 `PATTERN_INSUNG='INSUNG_(QUICK_)?(API_KEY\|API_URL\|PARTNER_ID\|WEBHOOK_SECRET)\s*=\s*[^$\s{"\x27][^\s]*'` 추가. placeholder 자체 금지 (빈 값 의무) |
| DO-4 | `docker-compose.arologis.yml` — 환경변수 6건 전달 + dev seed `SAMHAN_AROLOGIS_MATCHER_PROVIDER=mock` 활성 |
| DO-5 | `.github/workflows/arologis-ci.yml` — credential-plaintext-guard step 호출 (기존 `ci.yml` 동일) |

## §7 도메인 매트릭스

| Property | Default | W10-2 활성 |
|---|---|---|
| `samhan.arologis.matcher.provider` | `mock` | `insung-quick` (vendor 키 발급 후) |
| `samhan.arologis.matcher.insung-quick.sandbox-mode` | `true` | `false` (prod cutover) |
| `samhan.arologis.gps.priority` | `insung-lbs,app-gps,manual` | 동일 |
| `samhan.arologis.notify.dispatch-channel` | `insung-talk` | 동일 |
| `samhan.arologis.notify.invite-channel` | `aligo` | 동일 |
| `samhan.arologis.matcher.insung-quick.{api-url,api-key,partner-id,webhook-secret}` | 빈 값 (placeholder 금지) | 운영 PC `.env` 만 주입 |

## §8 SP-09 vendor 패턴 일관 검증

| 패턴 | SP-09 출처 | SP-10-2 적용 |
|---|---|---|
| skeleton-mode 토글 | `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE` (W10-1) | `samhan.arologis.matcher.provider=mock` 동치 |
| sandbox-mode 분리 | NTS/Clova/KFTC `sandbox-base-url` | `insung-quick.sandbox-mode:boolean` + `api-url` 단일 |
| @MockBean lenient stub IT | `Phase9VendorIntegrationIT` | `InsungQuickIntegrationIT` 동일 |
| placeholder 6 키워드 가드 | `Phase9VendorPlaceholderGuardConsistencyTest` | `Phase10VendorPlaceholderGuardConsistencyTest` 신규 |
| CI grep 가드 (placeholder 자체 금지) | CLOVA_OCR / KFTC | INSUNG_QUICK 동일 |
| `BusinessException(*_NOT_CONFIGURED)` | NTS/Aligo `502 ETAX_SUBMIT_FAILED` | `INSUNG_QUICK_NOT_CONFIGURED` |

## §9 비범위 + W10-3 이연

| 항목 | 이유 |
|---|---|
| 모바일 어플 GPS 보강 정밀화 | W10-3 별도 슬라이스 |
| 어플 설치 invite 흐름 (Aligo deeplink) | W10-3 별도 슬라이스 |
| 인성 vendor 알림톡 템플릿 등록 절차 (vendor portal) | 비즈니스 협약 후 운영 task |
| Phase 11 AWS Secrets Manager 통합 | Phase 11 cutover |
| slip-service signatureSource | W10-4 머지 완료 (재작업 X) |
| `arologis-mobile` UI 변동 | 영향 0 |

## §10 위험 + 완화

| # | 위험 | 완화 |
|---|---|---|
| R1 | 인성 vendor 실 API 스펙 미확정 → 구현 후 재작업 | interface + impl 분리 + sandbox-mode 토글 + `@MockBean` IT — 실 API 변경 시 impl 1 클래스만 교체 |
| R2 | API key 평문 노출 | SP-08-8 CI grep 가드 (DO-3) + env-template 빈 값 + Phase 10 vendor consistency test (BE-7) 3중 가드 |
| R3 | webhook race (match-result < status-update) | `vehicle.vendor_status` 컬럼 + idempotent upsert + `vendorOrderId` partial unique index |
| R4 | GPS 하이브리드 우선순위 충돌 | `samhan.arologis.gps.priority` comma-list 순서 강제 + insung-lbs stale threshold (60s) 후 app-gps fallback |
| R5 | 통합 PR 거대화 | 5-team 사전 분할 + Designer 선행 wireframe + BE/FE/QA/DevOps 병렬 (통합 PR 1개 유지) |
| R6 | Mock fallback 회귀 | `MockDriverMatcher` Bean 유지 + QA-1 mock 회귀 spec + `MatcherConfig` default fallback 보존 |
| R7 | 알림톡 분리 misroute | QA-3 channel separation spec + `notify.dispatch-channel` / `invite-channel` 2 property 분리 |

## §11 5-team 디스패치 순서

```
1. Designer (선행 단독) — wireframe + token spec 산출
2. BE / FE / QA / DevOps 4-team 병렬 — Designer spec 인용
3. TM cross-check (UUID / API contract / 디자인 일관성 / 도메인 정합 / Flyway 의존성)
4. PM 통합 commit + push
5. PR 발행 — title `[FEAT] SP-10-2 인성데이타 퀵프로그램 vendor 통합 (W10-2)`
6. cycle 1: Claude 5-agent 병렬 리뷰 + Codex 5-section 재검
7. cycle 2 fix (필요 시) — Codex workspace-write
8. cycle 3 안 양쪽 0 결함 + CI green → PM 자동 머지
```

통합 PR 본문: 5-team dev-report 섹션 + screenshot (Designer 4단계 mock + Playwright QA-1~6 캡처) 첨부.
