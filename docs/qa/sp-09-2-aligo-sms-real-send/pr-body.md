## 요약

**Phase 9 vendor 연동 시리즈 2번째 슬라이스** — Aligo SMS 실 발송 + send_audit 강화 + 발송 이력 화면.

- `AligoSmsAdapter` placeholder runtime guard 강화 (SP-09-1 패턴 일관, 4 키워드 case-insensitive)
- `DispatchBatchSendService.send(req, requestedBy)` + `saveSendAudit()` 자동 — `dispatch_sms_save_history` SEND_AUDIT row 보장 (fail-soft)
- FE `DispatchSmsSendAuditPage` 신규 — 리스트 + 필터 + 페이지네이션 + 상세 modal + 수신자 마스킹 (`010-****-NNNN`)
- IT 신규 — placeholder guard + send_audit 정합 (Testcontainers PostgreSQL)
- 외부 client @MockBean 격리 보강 (notification-service IT 3개)

## 변경 파일

### BE (notification-service)
- `adapter/sms/AligoSmsAdapter.java` — `isPlaceholder()` 4 키워드 case-insensitive 강화
- `service/DispatchBatchSendService.java` — `send(req, requestedBy)` + `saveSendAudit()` 추가
- `controller/DispatchBatchAdminController.java` — `X-User-Id` 헤더 수신
- IT 3개 (`ApplicationContextLoadIT`, `NotificationAdminControllerIT`, `NotificationInternalControllerIT`) — 외부 client 4종 @MockBean 추가

### IT 신규
- `AligoSmsAdapterPlaceholderRuntimeGuardIT` (unit + Spring) — 4 키워드 stub-success
- `AligoSmsAdapterSendAuditIT` — 4 case Testcontainers send_audit 정합
- `DispatchBatchSendServiceTest` SEND_AUDIT 보강

### FE (desktop)
- `routes/DispatchSmsSendAuditPage.tsx` 신규 — 리스트 + 필터 + 페이지네이션 + 상세 modal
- `api/dispatchSmsSaveHistoryApi.ts` — `SendAuditDetailEntry` + `SendAuditResponsePayload` 타입 + 마스킹
- `api/mock.ts` — SEND_AUDIT 3건 fixture
- `routes/index.tsx` — `/arologis/dispatch-sms/send-audit` 라우트 + `DISPATCH_SMS_ROLES` 가드
- `components/AppLayout.tsx` — 사이드바 "SMS 발송 이력" 메뉴

### Designer
- HTML mock 4장 + 4 PNG (120~242KB)
- design-system 신규 토큰 등록 없음 (Aligo 성공 teal, 기존 토큰 재활용)

### QA
- `playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts` — T1~T5

### DevOps
- `infrastructure/env-templates/notification-service.env` — `SAMHAN_ALIGO_KEY/USERID/SENDER` 빈 값
- `docs/dev-environment-setup-multi-pc.md` Aligo 4개 키 추가

### Docs
- `docs/dev-reports/sp-09-2-aligo-sms-real-send.md` 10 section

## QA 스크린샷

> SP-09-1 패턴 적용: HTML mock → Playwright headless 캡처 → raw URL 절대 경로.

### 01. 발송 이력 리스트 + 수신자 마스킹
![01 list](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-2-aligo-sms-real-send/docs/qa/sp-09-2-aligo-sms-real-send/screenshots/01-send-audit-list.png)

### 02. 날짜 + 결과 상태 필터 적용
![02 filter](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-2-aligo-sms-real-send/docs/qa/sp-09-2-aligo-sms-real-send/screenshots/02-send-audit-filter.png)

### 03. 상세 modal — 전체 메시지 + Aligo msg_id + 원응답 JSON
![03 detail](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-2-aligo-sms-real-send/docs/qa/sp-09-2-aligo-sms-real-send/screenshots/03-send-audit-detail.png)

### 04. 실패 사례 — Aligo result_code + 한국어 에러
![04 failure](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-2-aligo-sms-real-send/docs/qa/sp-09-2-aligo-sms-real-send/screenshots/04-send-audit-failure.png)

## 검증

- [x] `./gradlew :services:notification-service:compileJava :services:notification-service:compileTestJava` BUILD SUCCESSFUL
- [x] `npm run typecheck` (clients/desktop) PASS
- [x] BaseEntity 7 audit + Soft Delete 준수
- [x] UUID 사용자 비공개 (msg_id 비즈니스 식별자만 노출)
- [x] @MockBean 외부 client 격리 (IT 3개 보강)
- [x] credential-plaintext guard PASS (PATTERN_ALIGO 미탐지)
- [x] Notion runtime zero 유지
- [x] false green 가드 (`|| true` 등) 0건

## 권한 (SP-03 §4.2)

| Role | 발송 이력 조회 |
|---|---|
| MASTER | ✅ |
| MANAGER | ✅ |
| DISPATCH | ✅ |
| ACCOUNTANT | ❌ (403) |
| SALES | ❌ (403) |
| WAREHOUSE | ❌ (403) |

## Phase 9 시리즈 진행

- ✅ SP-09-1 NTS e-tax 발행 shell (#236 머지)
- ✅ SP-09-2 Aligo SMS 실 발송 (현재 PR)
- ⏭️ SP-09-3 OCR 영수증 (Naver Clova)
- ⏭️ SP-09-4 오픈뱅킹 KFTC (Phase 10)
- ⏭️ SP-09-5 통합 검증

## Phase 11 이관

- Aligo 실 sandbox 키 발급 후 `.env` 주입 (placeholder 사용 금지)
- 실 API 호출 시 `result_code != 1` 처리 흐름 sandbox 검증

연관 Issue: Phase 9 vendor 연동 시리즈 2번째 슬라이스

🤖 Generated with [Claude Code](https://claude.com/claude-code)
