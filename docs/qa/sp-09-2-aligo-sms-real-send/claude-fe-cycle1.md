# SP-09-2 FE 리뷰 — claude-fe-cycle1

리뷰어: Claude FE Agent
대상 브랜치: feat/sp-09-2-aligo-sms-real-send (commit 87d1e5f7)
리뷰 유형: read-only cycle 1

---

## 1. 결함 분류

### CRITICAL — 없음

### HIGH

**H-FE-01: `extractCounts()` 가 `requestParams` 에서 sent/failed/blocked 를 읽는 구조 — BE 계약 불일치**

`DispatchSmsSendAuditPage.tsx` 의 `extractCounts()` 함수는 `row.requestParams` 에서 `sent` / `failed` / `blocked` 를 읽는다. 그러나 BE `saveSendAudit()` 구현을 보면 `requestParams` 에는 `{ date, rowCount }` 만 저장되고, `sent` / `failed` / `blocked` 는 `responsePayload` 에 저장된다.

따라서 **FE 목록 화면의 성공/실패/발송금지 건수 뱃지가 항상 0으로 표시된다.** mock 에서는 `requestParams: { date: '2026-05-17', rowCount: 3, sent: 2, failed: 0, blocked: 1 }` 처럼 sent/failed/blocked 를 requestParams 에 포함하여 화면이 정상처럼 보이지만, 실제 BE 응답에는 해당 필드가 없으므로 운영 환경에서 버그가 된다.

**수정 방향:** `DispatchSmsSaveHistoryListRow` 에 `sentCount` / `failedCount` / `blockedCount` 컬럼을 추가하거나, BE `requestParams` 에 sent/failed/blocked 를 포함하도록 `saveSendAudit()` 를 수정해야 한다. 또는 목록 API 가 `responsePayload` 의 집계값을 별도 필드로 반환하도록 BE 쿼리를 조정해야 한다.

**H-FE-02: T5 권한 검증 — DISPATCH 역할이 `DispatchSmsSendAuditPage` 에 접근 가능하도록 라우트/메뉴 등록되어 있음 (BE 계약 불일치)**

`AppLayout.tsx` 의 사이드바 메뉴는 `showDispatchSms` 조건 (`canAccessDispatchSms()`) 으로 노출된다. `DISPATCH` 역할은 `canAccessDispatchSms()` 를 통과하여 `/arologis/dispatch-sms/send-audit` 메뉴가 보인다. 그러나 Playwright T5 주석에는 "SEND_AUDIT 발송 감사 조회는 MANAGER/MASTER 전용"이라고 명시되어 있고 BE `DispatchSmsSaveHistoryController` 는 `DISPATCH/MANAGER/MASTER` 를 허용한다.

BE `@PreAuthorize("hasAnyRole('DISPATCH','MANAGER','MASTER')")` 가 실제로 DISPATCH 를 허용하므로 FE 노출도 일치한다. **T5 주석의 "SEND_AUDIT 감사 = MANAGER/MASTER 전용" 설명이 BE 코드와 다른 불일치** 를 지적한다. 어느 쪽이 의도인지 PM 확인 필요.

### MEDIUM

**M-FE-01: `listQueryKey` 에 `appliedFilter.result` 누락 — 결과 상태 필터 변경 시 캐시 불일치**

`DispatchSmsSendAuditPage.tsx` 360~365 라인의 `listQueryKey` 에 `appliedFilter.result` 가 포함되지 않는다. 결과 상태 필터(SUCCESS/PARTIAL/FAIL)는 클라이언트 로컬 필터링이므로 서버 호출 없이 처리되어 queryKey 포함이 불필요하다고 볼 수 있다. 그러나 향후 서버 사이드 필터링으로 전환할 때 누락 위험이 있다. 주석으로 "클라이언트 로컬 필터 — queryKey 제외 의도적" 임을 명시하는 것을 권장한다.

**M-FE-02: `AuditDetailModal` 의 에러 상태 — `setError` 가 `queryFn` 내부 side effect 로 사용됨**

`queryFn` 내에서 `setError(null)` 과 `setError(extractErrorMessage(...))` 를 직접 호출하는 것은 React Query 의 권장 패턴이 아니다. `onError` 콜백 또는 `isError` / `error` 필드를 사용하는 것이 권장된다. 현재 구조는 strict mode 에서 이중 호출 문제를 일으킬 수 있다.

**M-FE-03: `rowKey` 중복 가능성 — `${row.partnerCode}-${row.recipientPhone}` 조합이 중복될 수 있음**

`detailColumns` 의 `rowKey` 는 `${partnerCode}-${recipientPhone}` 조합을 사용한다. 동일 거래처에서 동일 번호로 여러 번 발송하면 key 중복 React 경고가 발생한다. 인덱스 기반 key 또는 고유한 복합 key 를 사용해야 한다.

**M-FE-04: `SendAuditResponsePayload` 타입에 `date` 필드가 있으나 BE `DispatchBatchSendResponse` 에는 `date` 필드 없음**

`dispatchSmsSaveHistoryApi.ts` 79 라인 `SendAuditResponsePayload.date` 는 `string` 타입으로 선언되어 있다. 그러나 BE `DispatchBatchSendResponse` 에 `date()` 필드가 존재하므로 실제로는 있다. responsePayload JSON 직렬화 시 `date` 가 포함되는지 BE `saveSendAudit()` 에서 확인했을 때, `responsePayload.put()` 코드에 `date` 가 없다. 따라서 상세 modal 에서 `payload.date` 가 null 이 될 수 있고, 이때 `extractDate(detail)` 폴백으로 전환되는 코드가 있으나 `DispatchSmsSaveHistoryListRow` 캐스팅 과정이 불안전하다.

### LOW

**L-FE-01: `formatDateTime` import — `DispatchSmsHistoryTab` 에서 가져오는 구조**

`formatDateTime` 을 `../components/DispatchSmsHistoryTab` 에서 import 한다. 이 유틸 함수는 별도 utils 모듈로 분리하는 것이 바람직하다. 현재는 컴포넌트에서 유틸을 import 하는 역방향 의존성이다.

**L-FE-02: `<select>` 가 design-system 컴포넌트 없이 native HTML 사용**

필터 결과 상태 `<select>` 가 `@samhan/design-system` 의 `Select` 컴포넌트가 아닌 native HTML `<select>` 로 구현되어 있다. design-system 우선 원칙에 따라 `Select` 컴포넌트가 있다면 교체 권장.

**L-FE-03: `maskPhone()` 에서 `room:` prefix 처리 — 주석과 실제 코드 불일치 가능성**

배차 SMS 의 단톡방 경로(`room:단톡방이름`) 는 마스킹을 적용하지 않는다. 이는 합리적이나, SEND_AUDIT 화면이 recipientPhone 으로 실제 전화번호만 다루는지 단톡방명도 포함하는지 BE 에서 명확히 확인 필요.

---

## 2. 검증 항목 PASS/FAIL/WARN

| 항목 | 결과 | 비고 |
|---|---|---|
| ApiResponse wrapper 사용 | PASS | `ApiEnvelope<T>` 래퍼 통해 data 접근 |
| UUID 사용자 비공개 | PASS | `id` 필드 목록 노출 없음 (rowKey 내부용만 사용) |
| 전화번호 마스킹 010-****-NNNN | PASS | `maskPhone()` 정규식 정상 |
| design-system 컴포넌트 우선 | WARN | 결과 상태 `<select>` 가 native HTML |
| 422/502 한국어 메시지 | PASS | `extractErrorMessage()` 에서 `data.message` 우선, fallback 한국어 |
| TypeScript strict | PASS | compileTestJava/typecheck PASS 확인 |
| RBAC 라우트 | PASS | `canAccessDispatchSms()` 조건부 메뉴 노출 |
| extractCounts BE 계약 정합 | FAIL | requestParams 에 sent/failed/blocked 없음 (H-FE-01) |
| listQueryKey 완전성 | WARN | result 필터 제외 (로컬 필터이므로 의도적 가능 — 주석 필요) |
| queryFn 내 side effect | WARN | setError in queryFn — React Query anti-pattern |
| rowKey 고유성 | WARN | partnerCode+recipientPhone 중복 위험 |
| mock SEND_AUDIT 3건 | PASS | auditRow/auditRow2/auditRow3 정상 등록 |
| 라우트 등록 | PASS | /arologis/dispatch-sms/send-audit 정상 |
| 사이드바 메뉴 등록 | PASS | sidebar-arologis-sms-send-audit 추가 |

---

## 3. 권장 fix

**P1 (HIGH H-FE-01 — 필수):** BE `DispatchBatchSendService.saveSendAudit()` 에서 `requestParams` 에 `sent` / `failed` / `blocked` 를 추가하거나, FE `extractCounts()` 가 `responsePayload` 에서 읽도록 수정. mock 데이터도 BE 실제 응답 구조에 맞게 정렬 필요.

구체적으로는 BE `requestParams.put("sent", response.sent())` 등 3필드 추가가 최소 변경이다.

**P2 (HIGH H-FE-02):** T5 주석에서 "SEND_AUDIT 감사 = MANAGER/MASTER 전용" 내용 수정 또는 BE `@PreAuthorize` 를 DISPATCH 제외로 변경. PM 의사결정 필요.

**P3 (MEDIUM M-FE-02):** `AuditDetailModal` `queryFn` 에서 `setError` side effect 제거. `queryFn` 은 data 반환만, 에러는 `isError` / `error` 필드 사용.

**P4 (MEDIUM M-FE-03):** `rowKey={(row) => \`${row.partnerCode}-${row.recipientPhone}-${index}\`}` 등 index suffix 추가.

**P5 (LOW L-FE-01):** `formatDateTime` 을 `utils/dateUtils.ts` 등 공통 유틸로 분리.

---

## 4. Claude TM 결정안

**cycle 2 권고 — H-FE-01 이 운영 버그이므로 merge 전 fix 필수**

H-FE-01 은 목록 화면의 성공/실패 건수가 항상 0으로 표시되는 **시각적 운영 버그**다. mock 에서 requestParams 에 sent/failed/blocked 를 포함하므로 QA 에서 발견되지 않았다. BE 1~2 라인 수정으로 해결 가능하므로 fix commit 후 cycle 2 없이 APPROVE 가능하다.

H-FE-02 는 PM 결정 사항. M-FE-02~04 는 다음 슬라이스 backlog.
