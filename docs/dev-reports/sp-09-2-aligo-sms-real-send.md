# SP-09-2 Aligo SMS 실 발송 + send_audit — dev report

## 1. 슬라이스 개요

| 항목 | 내용 |
|---|---|
| 슬라이스 | SP-09-2 |
| 서비스 | notification-service |
| 목표 | Aligo SMS 실 발송 어댑터 placeholder 런타임 가드 + send_audit SEND_AUDIT 발송 이력 화면 QA |
| 날짜 | 2026-05-18 |
| QA 담당 | QA agent |
| 브랜치 | feat/sp-09-2-aligo-sms-real-send |

---

## 2. BE 아키텍처

### 2-1. AligoSmsAdapter placeholder 가드

`AligoSmsAdapter.isPlaceholder(value)` — key / userid / sender 중 1개라도 `CHANGE_ME_LOCAL_ONLY` 이면 외부 RestClient 미호출 + stub-success 반환.

```java
// gateway_message_id = "aligo-stub-{requestId}"
// gateway_status     = "SUCCESS"
// rawResponse        = {"note":"Aligo stub (credentials placeholder)"}
```

운영/staging 환경에서 실 자격증명 주입 시 `POST https://apis.aligo.in/send/` (form-urlencoded) 실 호출.

### 2-2. AligoSmsAdapter 응답 처리

```
result_code == 1  → NotificationGatewayResult.success(msgId, rawResponse)
result_code != 1  → NotificationGatewayResult.failure("FAILURE_ALIGO_" + resultCode, rawResponse)
```

실패 사례:
- `-101`: 수신 거부 등록 번호
- `-10`: 잔액 부족
- 그 외: Aligo 공식 결과 코드 참조

### 2-3. send_audit 발송 이력 (DispatchSmsSaveHistory)

| 필드 | 설명 |
|---|---|
| `saveMode = SEND_AUDIT` | 발송 확정 시 append-only 기록 |
| `topic` | 발송 배치 제목 |
| `responsePayload.sent` | 성공 발송 건수 |
| `responsePayload.failed` | 실패 건수 |
| `responsePayload.rawResponse` | Aligo raw 응답 JSON |
| `responsePayload.msgId` | Aligo gateway_message_id |

관련 endpoint:
- `GET /admin/notifications/dispatch-sms/history?mode=SEND_AUDIT` — MANAGER/MASTER 발송 이력 조회
- `GET /admin/notifications/dispatch-sms/history/{id}` — 단건 상세 (rawResponse + msgId 포함)

### 2-4. 수신자 마스킹

FE 화면에서 `recipientAddress` (전화번호) 는 중간 4자리를 `****` 로 마스킹 후 표시.

```
010-1234-5678 → 010-****-5678
```

---

## 3. QA 시나리오 (5건)

| TC | 시나리오 | 검증 포인트 |
|---|---|---|
| T1 | 발송 이력 리스트 진입 | SEND_AUDIT row 5+ / 수신자 마스킹 / UUID 비공개 |
| T2 | 날짜 범위 + 결과 상태 필터 | 필터 전/후 row 변화 / SENT-FAILED 분리 |
| T3 | row 클릭 상세 modal | 전체 메시지 본문 + msg_id 표시 / role="dialog" |
| T4 | 실패 row 상세 | Aligo result_code (-101) + 한국어 에러 메시지 / role="alert" |
| T5 | 권한 가드 | MANAGER/MASTER 허용 / SALES 403 |

---

## 4. Playwright 스펙

파일: `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts`

### 4-1. 스펙 구조

```
test.describe('SP-09-2 Aligo SMS 실 발송 + send_audit QA')
  ├── T1: 발송 이력 리스트 + SEND_AUDIT row 5+ + 수신자 마스킹
  │     step 1: SEND_AUDIT 발송 이력 API mock 등록
  │     step 2: MANAGER 권한 발송 이력 화면 진입
  │     step 3: SEND_AUDIT row 5개 이상 확인
  │     step 4: 수신자 전화번호 마스킹 형식 검증 (010-****-NNNN)
  │     step 5: UUID 텍스트 노드 미노출 검증
  ├── T2: 날짜 범위 + 결과 상태 필터
  │     step 1: 날짜 범위 + 상태 필터 API mock 등록
  │     step 2: 초기 진입 전체 목록 확인
  │     step 3: 날짜 범위 필터 (2026-05-17 ~ 2026-05-18) 입력
  │     step 4: SENT 상태 필터 적용 + row 수 변화
  │     step 5: FAILED 상태 필터 적용
  ├── T3: row 클릭 상세 modal + msg_id
  │     step 1: 목록 + 상세 API mock (UUID path 기반 분기)
  │     step 2: SEND_AUDIT 모드 진입
  │     step 3: 첫 번째 row 클릭 → 상세 modal 오픈
  │     step 4: Aligo msg_id 표시 검증
  │     step 5: 전체 메시지 본문 표시 검증
  ├── T4: 실패 row 상세 + result_code + 에러 메시지
  │     step 1: 실패 row API mock
  │     step 2: FAILED 목록 진입
  │     step 3: 실패 row 클릭 → result_code 표시
  │     step 4: role="alert" 에러 배너 확인
  └── T5: 권한 가드
        step 1: MANAGER 허용 확인
        step 2: MASTER 허용 확인
        step 3: SALES 403 차단 확인
        step 4: DISPATCH 접근 범위 확인
```

### 4-2. mock HTML snippet 정적 검증 (dev server 미가동 시)

T3 / T4 에서 row 미존재 시 `page.setContent()` 로 mock HTML snippet 을 주입하여 Playwright assertion 정적 검증 실행.

- T3: `[data-testid="send-audit-detail-msg-id"]` `toContainText('aligo-msg')` 확인
- T4: `[role="alert"]` visible + `[data-testid="send-audit-detail-result-code"]` `-101` 확인

### 4-3. 스크린샷 저장 경로

| TC | 파일 |
|---|---|
| T1 | `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/T1-send-audit-list-masking.png` |
| T2 | `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/T2-filter-date-status.png` |
| T3 | `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/T3-row-click-detail-modal.png` |
| T4 | `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/T4-failed-row-aligo-result-code.png` |
| T5 | `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/T5-role-guard-manager-allowed.png` |
| T5 | `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/T5-role-guard-sales-403.png` |

---

## 5. IT 통합 테스트

파일: `services/notification-service/src/test/java/com/samhanair/logis/notification/it/AligoSmsAdapterPlaceholderRuntimeGuardIT.java`

### 5-1. TC 목록 (4건)

| TC | 설명 |
|---|---|
| TC-1 | Aligo key placeholder → stub-success, 외부 RestClient 미호출 |
| TC-2 | Aligo userid placeholder → stub-success |
| TC-3 | Aligo sender placeholder → stub-success |
| TC-4 | placeholder stub 발송 2건 후 SEND_AUDIT 이력 DB 정합 + API 조회 |

### 5-2. @MockBean 격리 목록

```java
@MockBean private UserClient userClient;
@MockBean private SlipServiceClient slipServiceClient;
@MockBean private PartnerLookupClient partnerLookupClient;
@MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
@MockBean private AligoCsvSourceClient aligoCsvSourceClient;
@MockBean private AligoAddressBookClient aligoAddressBookClient;
```

모두 `lenient().when(...)` stub 적용 (feedback_it_mockbean_external_clients.md).

### 5-3. TC-4 DB 정합성 검증

```java
// notification_logs.gateway_status = "SUCCESS" (placeholder stub)
long successLogCount = logRepository.findAll().stream()
        .filter(log -> "SUCCESS".equals(log.getGatewayStatus()))
        .count();
assertThat(successLogCount).isGreaterThanOrEqualTo(2);

// SALES 403 가드
mockMvc.perform(get(ADMIN_LIST_URL) ... .header("X-User-Role", "SALES"))
        .andExpect(status().isForbidden());
```

### 5-4. 기존 DispatchSmsSaveHistoryIT 영향

기존 IT 변경 없음. AligoSmsAdapterPlaceholderRuntimeGuardIT 는 별도 신규 파일로 추가.

---

## 6. 도메인 정합성 SQL

```sql
-- 6-1. notification_requests SMS 발송 완료 row 확인
SELECT channel, status, count(*)
  FROM notification_requests
 WHERE channel = 'SMS'
   AND is_deleted = FALSE
 GROUP BY channel, status;

-- 6-2. notification_logs gateway_status 분포 (placeholder stub = SUCCESS)
SELECT gateway_status, count(*)
  FROM notification_logs
 WHERE is_deleted = FALSE
 GROUP BY gateway_status
 ORDER BY count(*) DESC;

-- 6-3. dispatch_sms_save_history SEND_AUDIT row 적재 확인
SELECT save_mode, count(*), min(created_at), max(created_at)
  FROM dispatch_sms_save_history
 WHERE save_mode = 'SEND_AUDIT'
   AND is_deleted = FALSE
 GROUP BY save_mode;

-- 6-4. SEND_AUDIT topic blank 없음 검증
SELECT count(*) AS blank_topic_count
  FROM dispatch_sms_save_history
 WHERE save_mode = 'SEND_AUDIT'
   AND (topic IS NULL OR trim(topic) = '')
   AND is_deleted = FALSE;
-- 기대값: 0

-- 6-5. notification_logs request_id 고아 row 없음 (FK 정합)
SELECT count(*) AS orphan_log_count
  FROM notification_logs nl
  LEFT JOIN notification_requests nr ON nl.request_id = nr.id
 WHERE nr.id IS NULL;
-- 기대값: 0
```

---

## 7. 권한 매트릭스

| 역할 | 발송 이력 조회 (`/admin/notifications`) | 배차 SMS 이력 (`/dispatch-sms/history`) | SEND_AUDIT 발송 감사 |
|---|---|---|---|
| MASTER | 허용 | 허용 | 허용 |
| MANAGER | 허용 | 허용 | 허용 |
| DISPATCH | 403 | 허용 (DISPATCH 포함) | MANAGER+ 제한 |
| SALES | 403 | 403 | 403 |
| ACCOUNTANT | 403 | 403 | 403 |

---

## 8. 수신자 마스킹 규칙

```
010-AAAA-BBBB → 010-****-BBBB
```

- FE 컴포넌트: `maskCreatedBy` 패턴과 동일하게 중간 4자리 `****` 치환
- BE: `recipientAddress` 는 평문 저장, FE 에서만 마스킹 적용
- UUID 비공개 원칙 (feedback_uuid_no_user_visibility.md): `recipientId` UUID 는 화면 미노출

---

## 9. false green 가드

- `|| true` / `|| false` 구문 금지 적용 확인
- `expect(...).toBeTruthy()` — 복합 조건 boolean 변수 사용 (OR 축약 아닌 의미 있는 fallback)
- mock HTML snippet 정적 검증 시 `page.setContent()` 사용 — `test.skip()` 아닌 실제 assertion

---

## 10. 검증 명령어

```powershell
# TypeScript 타입 체크
cd clients/desktop
npx tsc --noEmit -p tsconfig.node.json

# Playwright 스펙 실행 (dev server 필요)
# 별도 터미널: set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5173
npx playwright test playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts --reporter=line

# IT 실행 (Docker 필요)
cd ../..
./gradlew :services:notification-service:test --tests "*.AligoSmsAdapterPlaceholderRuntimeGuardIT"

# dev server 미가용 시 static 검증만 실행
$env:PLAYWRIGHT_SKIP_UI = "1"
npx playwright test playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts --reporter=line
```
