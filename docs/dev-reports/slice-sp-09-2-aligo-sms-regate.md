# Slice: sp-09-2 알리고 SMS 발송 이력(SEND_AUDIT) 재게이트 (⑥ B/C #6)

> branch `feat/sp-09-2-aligo-sms-regate` / 2026-06-04 / clients/desktop. **프로덕션 src 무변경**(테스트 전용).
> Aligo SMS 발송 감사(SEND_AUDIT) 화면 5 TC 재게이트.

## 1. 근본원인

기존 스펙은 `page.route('**/admin/notifications/dispatch-sms/history**')` 로 10건 mock 을 주입하고
목록에서 수신자 마스킹을 검증하는 구조였다. 그러나:

- **VITE_MOCK_MODE 의 mock 은 axios 어댑터(in-process)** 라 실제 HTTP 가 발생하지 않아 `page.route` 가 **무효**다.
  → in-process mock(`src/renderer/api/mock.ts`)의 SEND_AUDIT 데모 3건이 렌더된다.
- **수신자 마스킹·msg_id·result_code 는 목록이 아니라 "상세 모달"** 에 표시된다(`DispatchSmsSendAuditPage` 구조).
- design-system **`DataTable`·`Modal` 은 `data-testid` 를 DOM 으로 forward 하지 않는다**
  (`sms-audit-table`/`dispatch-sms-send-audit-detail-modal` 은 no-op prop) → 해당 testid 의존 단언은 항상 실패/공허.

## 2. 수정 (테스트 정합, in-process mock 기준)

- `page.route`/`mockSendAuditRows`/`buildSendAuditListResponse` **전부 제거** → in-process mock 3건 정합.
- 목록 렌더 검증: `data-testid^="sms-audit-date-"` 배차일 셀(plain DOM, forward 됨)로 판정. `sms-audit-table` testid 의존 제거.
- 상세 모달: `getByRole('dialog')` + 제목 `발송 감사 상세` 로 판정(Modal testid 미forward 대응). 동일 배차일 복수(데모행 혼입) → 상세 버튼 `.first()`.
- **T1 마스킹**: 상세 모달 텍스트에 `010-****-NNNN` 형식 존재 **AND** 평문 11자리(`01XXXXXXXXX`) 미노출 — 마스킹 회귀 가드(공허 PASS 방지).
- **T2 날짜 필터**: `Input` 은 `...rest` 로 `data-testid` 를 `<input>` 에 직접 forward → 직접 fill. 조회 후 배차일 row 재렌더 + 범위 내 대상 row 표시 검증.
- **T3 msg_id**: 상세 모달의 `dispatch-sms-send-audit-msg-id`(plain span, forward 됨) `ALG-` 포함 strict.
- **T4 result_code**: 실패 row(2026-05-16) 상세 모달에 `result_code` 문자열 + 실패 배지 표시.
- **T5 RBAC**: MANAGER/MASTER/DISPATCH 허용(제목 진입), SALES/ACCOUNTANT 차단(거부 화면 OR 제목+데이터 row 미진입). 역할 cross-check 마다 `page.reload()` 세션 재설정. 차단 판정은 forward 되는 실제 신호(제목+배차일 row)로 — `sms-audit-table` testid 공허 단언 제거(false-green 가드).

## 3. mock 한계 (정직 문서화 / Phase 11 후속)

- in-process mock 의 GET history 는 서버측 `from/to` 날짜 필터링 **미구현**(항상 SEND_AUDIT 3건 반환).
  → T2 는 필터 입력 UI 동작 + 조회 후 테이블 재렌더 + 범위 내 대상 row 표시를 검증한다(서버측 날짜 필터 strict 검증은 Phase 11 mock 보강 후속).
- 데모 `MANUAL_NAMED` 행(배차일 2026-05-17)이 SEND_AUDIT 목록에 혼입(mock 이 `mode` 쿼리로 서버측 필터링하지 않음) → 동일 배차일 2행. 테스트는 `.first()`(데이터 보유 auditRow1)로 정합.

## 4. 검증

- sp-09-2 **5/5 green** → testIgnore 해제 재게이트. desktop `tsc --noEmit` 0. 프로덕션 컴포넌트 무변경.
- QA 캡처: `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/sp-09-2-t{1..5}-*.png`.

## 5. Dual review 반영 (Claude QA + Codex gpt-5.5)

- **QA F-1 (P0)**: T1 마스킹 — 상세 모달 "로딩 중" 상태에서 `innerText` 캡처 시 평문 미노출 단언이 공허 PASS → openDetail 에 `not.toContainText('로딩 중')` ready 대기 추가 + 마스킹 단언을 blocking `toContainText(/010-\*{4}-\d{4}/)` 로 전환(데이터 ready 보장).
- **QA F-2 / Codex ①③ (P0/P1)**: T5 차단 `deniedVisible || !entered` 가 "제목 진입+데이터 0건"을 차단으로 오판(PermissionGuard 미동작 회귀 미감지) → `deniedVisible || !titleVisible` 로 교정(빈목록을 차단으로 오판 안 함).
- **QA F-3 / Codex ③ (P1)**: T5 허용이 제목만 검증 → 실제 배차일 데이터 row 가시성 단언 추가.
- **Codex ④ (P0 지적)**: `test.skip(SKIP_UI)` 는 sp-09-1·sp-09-5·sp-d4 와 **동일한 env opt-out 컨벤션**(CI 는 `PLAYWRIGHT_SKIP_UI` 미설정 → skipped=0). CI `silent-skip 가드(qa-e2e.yml)` 가 skipped>0 을 2차 차단하므로 false-green 불가 — 기확립 패턴 유지.
- **참고**: Codex 는 QA fix **이전** 스냅샷을 리뷰(REJECT 의 ①③ 는 이미 교정 완료분). 강화된 단언(blocking 마스킹·`!titleVisible` 차단·데이터 row 허용)에도 5/5 green = SALES/ACCOUNTANT 실차단·마스킹 실렌더 확증.
