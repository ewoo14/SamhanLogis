# 🔵 Claude TM 통합 리뷰 — SP-10-2 Cycle 2

**HEAD**: `36379838`
**PR**: #245
**리뷰어**: Claude 5-agent 병렬 (BE / FE / Designer / QA / DevOps)
**CI**: ❌ 25/27 PASS (2 credential plaintext guard fail — SP-10-2 화이트리스트 누락)

## 종합 판정: **FIX 요청** — cycle 3 (마지막) 통합 fix 필요

Cycle 1 결함 24건 전체 ✅ PASS. 그러나 cycle 2 fix 과정에서 신규 결함 8건 추가 발견 (Critical 1 + P1 1 + P2 6) + CI 실패 2건. 사이클 N=3 안 완료 의무 (`feedback_dual_5agent_review.md`) 에 따라 cycle 3 에서 일괄 해소 후 머지 가능.

---

## CRITICAL — 1건 (CI fail, 머지 차단)

### DevOps D3 — `check-credential-plaintext.sh` SP-10-2 화이트리스트 누락 (CI FAIL)

- **CI**: `Credential Plaintext Guard (SP-08-8)` 12s FAIL + `자격 평문 비공개 가드 (SP-08-8 + SP-10-2)` 10s FAIL
- **사유**: `docs/qa/sp-10-2-insung-quick-vendor/claude-devops-cycle1.md` 80-81 라인의 가드 실증 예시 문장 (`SAMHAN_INSUNG_QUICK_API_KEY=<실값>`, `SAMHAN_INSUNG_QUICK_API_URL=https://api.insungdata.co.kr/quick/v1`) 이 `PATTERN_INSUNG` 정규식에 매칭되어 평문 자격으로 오인
- **fix**: `scripts/check-credential-plaintext.sh` `WHITELIST_PATTERNS` 배열에 `'docs/qa/sp-10-2-insung-quick-vendor/'` 추가 (116번 줄 sp-09-2 바로 아래 삽입). SP-09-2/SP-09-3 와 동일 패턴

---

## P1 — 1건 (양쪽 reviewer 동시 발견, 머지 차단)

### FE C2-1 — `DispatchDetailRouteWrapper` fetch 실패 시 에러 UX 누락 (Claude FE + Codex TM 동시 발견)

- **위치**: `clients/arologis-desktop/src/renderer/routes/index.tsx:72-75`, `routes/dispatches/DispatchDetailPage.tsx:488-499`
- **문제**: fetch catch → `setDispatch(null)` → DispatchDetailPage 가 `dispatch === null` 시 "배차 정보를 불러오는 중..." 로딩 문구만 영구 표시. 404/500/네트워크 오류 모두 동일 → 사용자 무한 로딩 갇힘
- **fix**: `DispatchDetailRouteWrapper` 에 `loadError: boolean` 또는 union state (`{ status: 'loading' | 'success' | 'error', data?: DispatchDetail }`) 추가, `DispatchDetailPage` 에 `error?: boolean` prop 추가하여 에러 UI (재시도 버튼 + "배차 정보를 불러오지 못했습니다") 렌더

---

## P2 — 6건

### Designer N1/N2 — tokens.css + index.ts 주석 stale 10.2:1

- **위치**: `clients/web/design-system/src/tokens/tokens.css:103`, `clients/web/design-system/src/tokens/index.ts:118`
- **문제**: tokens.md 는 14.7:1 로 정정했으나 tokens.css/index.ts 주석 stale
- **fix**: 양쪽 주석 모두 `≈ 14.7:1` 로 정정 (실제 계산값 ≈ 14.74:1)

### BE P2-1 — `parseCapturedAt` OffsetDateTime 지원 부족

- **위치**: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/insung/InsungWebhookService.java:257-260`
- **문제**: `iso.replace("Z","")` 만으로는 `+09:00` offset 포함 ISO-8601 처리 실패 → fallback `now()` 로 대체 → 실 운영 capturedAt 정확도 저하
- **fix**: `OffsetDateTime.parse(iso).toLocalDateTime()` try → `LocalDateTime.parse(iso)` fallback 2-stage 파싱

### BE P2-2 — `InsungQuickIntegrationIT` 미사용 `TestPropertySource` import

- **위치**: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/InsungQuickIntegrationIT.java:55`
- **fix**: import 제거

### QA N4 — `it-cross-check.md` C1 기대값 stale (PENDING → ASSIGNED)

- **위치**: `docs/qa/sp-10-2-insung-quick-vendor/it-cross-check.md` §3 C1
- **문제**: TC-1 실제 동작은 `vehicle.status = ASSIGNED` 인데 문서는 `PENDING (sandbox)` 로 표기
- **fix**: 문서 `ASSIGNED` 로 정정

### DevOps DevOps-C2-1 — Phase 11 KMS migration 메모 누락

- **위치**: `infrastructure/env-templates/arologis-service.env` + `docs/dev-reports/sp-10-2-insung-quick-vendor.md`
- **문제**: 인성 vendor secret (API_KEY/WEBHOOK_SECRET) 평문 env → Phase 11 cutover 시 KMS-backed Secrets Manager 이관 의무 메모 부족
- **fix**: env-template 헤더 주석 + dev-report 마지막에 Phase 11 KMS migration backlog 1줄 추가

### QA N3 — screenshots 0건 (PR 본문 첨부 의무)

- **위치**: `docs/qa/sp-10-2-insung-quick-vendor/screenshots/`
- **문제**: `feedback_pr_qa_screenshots.md` 의무, spec.ts 에 11건 정의 있으나 dev server 미실행으로 자동 생성 X
- **fix**: cycle 3 commit 동시에 mock PNG 1장 이상 생성 (PowerShell mock 패턴 일관)

---

## 모니터링 사항 (cycle 3 fix 불필요, 추후 추적)

### QA N1 — axios networkidle 타이밍 위험 (잠재 flakiness)

- spec 의 `page.waitForLoadState('networkidle')` 가 axios XHR 완료를 보장하지 못할 가능성. dev server 미실행 환경에서는 `isServerAvailable()` FAIL 처리로 false green 차단됨. 실 실행 시 flakiness 발생 시 추후 `waitForResponse('**/api/arologis/dispatches/**')` 패턴 도입 검토.

### QA N2 — scenarios.md 괄호 래핑 표기 미명시

- `notification-fail-reason` 텍스트 `(E_INVALID_PHONE)` 괄호 래핑 표기 scenarios.md 미명시. 실 동작 영향 X, `toContainText` 부분 매칭 PASS.

---

## Cycle 1 결함 24건 검증 결과 — 모두 PASS

5-team 상세는 다음 파일 참조:
- `docs/qa/sp-10-2-insung-quick-vendor/claude-be-cycle2.md` — 13건 PASS, P2 신규 2건
- `docs/qa/sp-10-2-insung-quick-vendor/claude-fe-cycle2.md` — 4건 PASS, P1 신규 1건 + P2 신규 1건
- `docs/qa/sp-10-2-insung-quick-vendor/claude-designer-cycle2.md` — 5건 PASS, P2 신규 2건
- `docs/qa/sp-10-2-insung-quick-vendor/claude-qa-cycle2.md` — 3건 PASS + testid 19종 PASS + false green 0건, P1 모니터링 1건 + P2 3건
- `docs/qa/sp-10-2-insung-quick-vendor/claude-devops-cycle2.md` — 2건 PASS, Critical 신규 1건

## 일관성 점수

| Team | 점수 | 비고 |
|---|---|---|
| BE | 4/5 | 13건 PASS + P2 신규 2건 (parseCapturedAt offset / unused import) |
| FE | 3/5 | 4건 PASS + P1 신규 1건 (Codex 동시 발견, 머지 차단) |
| Designer | 5/5 | 5건 PASS, 주석 stale 2건만 (P2) |
| QA | 4/5 | testid 19종 PASS, false green 0건. 모니터링 1건 + P2 3건 |
| DevOps | 2/5 | D1/D2 해결했으나 D3 (cycle 2 신규) 가 CI 차단 |

---

## Cycle 3 fix scope (8건 일괄 + screenshots)

| # | 영역 | 결함 | 우선순위 |
|---|---|---|---|
| 1 | DevOps | D3 화이트리스트 추가 | CRITICAL (CI 차단) |
| 2 | FE | DispatchDetailRouteWrapper error state | P1 (머지 차단) |
| 3 | Designer | tokens.css:103 주석 14.7:1 | P2 |
| 4 | Designer | index.ts:118 주석 14.7:1 | P2 |
| 5 | BE | parseCapturedAt OffsetDateTime | P2 |
| 6 | BE | unused import 제거 | P2 |
| 7 | QA | it-cross-check.md C1 ASSIGNED | P2 |
| 8 | DevOps | Phase 11 KMS 메모 추가 | P2 |
| 9 | QA | screenshots mock 생성 | P2 |

**TM 결정: Cycle 3 (마지막) 통합 fix → 양쪽 재검 → 양쪽 0결함 시 머지**

Claude TM — 2026-05-19
