# SP-09-2 QA 리뷰 — claude-qa-cycle1

리뷰어: Claude QA Agent
대상 브랜치: feat/sp-09-2-aligo-sms-real-send (commit 87d1e5f7)
리뷰 유형: read-only cycle 1

---

## 1. 결함 분류

### CRITICAL — 없음

### HIGH

**H-QA-01: Playwright 스펙 위치 불일치 — `clients/desktop/playwright/` vs `playwright/` 루트 없음**

커밋 메시지와 검토 요청서는 `playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts` 경로를 언급하지만, 실제 파일은 `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts` 에 존재한다. 루트 `playwright/` 경로는 실제로 없다.

이는 문서/주석 불일치이지만, CI playwright.config.ts 에 등록된 testDir 경로가 `clients/desktop/playwright` 인 경우 정상 실행된다. **CI 설정과 실제 파일 경로가 일치하는지 확인 필요.** 만약 CI 가 루트 경로를 참조한다면 테스트가 발견되지 않는다.

**H-QA-02: T1 step 3 (SEND_AUDIT row 5+ 확인) — `hasSendAuditContent` 조건이 지나치게 관대**

`bodyText.includes('감사')` 조건만 있으면 "발송 감사" 텍스트가 아닌 다른 "감사" 텍스트(예: "감사합니다" 등)가 있어도 PASS 된다. `bodyText.includes('발송 감사')` 로 좁히거나 rowCount 기반 assertion 을 우선하는 것이 권장된다. 현재는 false green 잠재 위험이 있다.

**H-QA-03: T1 step 4 마스킹 검증 — 평문 전화번호 `!plainPhoneInBody` 가 `bodyText.includes('접근')` 과 OR 연결됨**

```
const maskingVerified =
  hasMasking || !plainPhoneInBody || bodyText.includes('접근') || ...
```

`!plainPhoneInBody` 조건이 true 이면 (평문 전화번호가 없으면) 마스킹 여부와 무관하게 PASS 된다. 즉, mock API 가 전화번호를 아예 반환하지 않아도 PASS 된다. 이는 "마스킹이 적용되었음"을 증명하는 것이 아니라 "평문이 없음"만 증명한다. 마스킹 검증의 핵심은 `hasMasking = maskingPattern.test(bodyText)` 가 true 여야 한다. 따라서 `hasMasking` 또는 `(dev server 미가동 || 접근 불가)` 두 케이스로 분리해야 한다.

### MEDIUM

**M-QA-01: T2 필터 검증 — 날짜 필터 input `data-testid` 를 `dispatch-sms-history-from` 으로 조회하나 실제 TSX 는 `sms-audit-filter-from`**

T2의 `fromInput` locator: `'[data-testid="dispatch-sms-history-from"], input[name="from"], ...'`
실제 TSX `DispatchSmsSendAuditPage.tsx` 에 선언된 `data-testid` 는 `"sms-audit-filter-from"`.

`data-testid="dispatch-sms-history-from"` 는 존재하지 않으므로 locator 의 첫 번째 selector 는 항상 count() = 0 이다. `input[name="from"]` 폴백도 TSX 에 `name` 어트리뷰트가 없으면 역시 0이다. **결과적으로 T2 날짜 필터 입력 step 이 실행되지 않는 조용한 no-op 이 된다.** 스크린샷만 저장하고 assertion 은 bodyText 기반 관대 조건으로 통과한다.

**M-QA-02: T3 상세 modal data-testid — `dispatch-sms-send-audit-detail-modal` vs `send-audit-detail-modal` 불일치**

T3의 modal locator: `'[data-testid="send-audit-detail-modal"]'`
실제 TSX Modal 의 `data-testid`: `"dispatch-sms-send-audit-detail-modal"`

두 값이 다르므로 T3 step 3 에서 `modal.count() = 0` 이 되고 bodyText 폴백 assertion 으로만 검증된다.

**M-QA-03: T5 DISPATCH 권한 검증 — "SEND_AUDIT 발송 감사 = MANAGER/MASTER 전용" assertion 없음**

T5 step 4 는 `dispatchPageVisible` 이 true 이면 PASS 처리된다. `bodyText.includes('발송')` 만 있어도 통과하므로 DISPATCH 권한이 SEND_AUDIT 화면에 접근할 수 있는지/없는지가 검증되지 않는다. FE 리뷰 H-FE-02 와 연계 — BE 의도를 명확히 한 후 DISPATCH 허용/차단 assertion 을 추가해야 한다.

**M-QA-04: T4 `role="alert"` assertion — step 4 가 실제로 fail-banner 가 없어도 PASS**

```
const hasErrorIndicator =
  (await alertLocator.count()) > 0 ||
  bodyText.includes('실패') || ...
```

`bodyText.includes('실패')` 만 있어도 통과하므로 `role="alert"` 요소가 실제로 없어도 PASS 된다.

### LOW

**L-QA-01: T3 `msg_id` 상세 검증 — `bodyText.includes('msg_id')` 사용 (문자열 포함 검사)**

`msg_id` 가 컬럼 헤더로 존재하면 PASS 된다. 실제 값 `aligo-msg-N-EPOCHMILLI` 가 표시되는지 확인하는 것이 더 강한 검증이다. `data-testid="dispatch-sms-send-audit-msg-id"` selector 가 우선이므로 이 부분은 data-testid 불일치 수정(M-QA-02) 후 자동 강화된다.

**L-QA-02: `AligoSmsAdapterSendAuditIT.cleanUp()` — `DELETE FROM dispatch_sms_save_history` 직접 SQL 사용**

`@AfterEach` 에서 `jdbcTemplate.update("DELETE FROM dispatch_sms_save_history")` 직접 SQL 을 실행한다. Soft Delete 원칙에 따르면 `markDeleted()` 를 사용해야 한다. 단, IT 데이터 격리 목적의 직접 DELETE 는 `feedback_pm_integration_build_check` 에 의해 예외 허용되는지 확인 필요. AbstractPostgresIT 가 Testcontainers 컨테이너 격리를 사용한다면 OK.

**L-QA-03: URL 상수 `/admin/notifications/sms-audit` — 실제 라우트 `/arologis/dispatch-sms/send-audit` 와 다름**

T1~T5 URL: `http://localhost:5173/admin/notifications/sms-audit?mockRole=MANAGER`
실제 FE 라우트: `/arologis/dispatch-sms/send-audit`

URL 이 다르므로 올바른 화면에 진입하지 못한다. HashRouter 라면 `/#/arologis/dispatch-sms/send-audit` 형태여야 한다. 이 때문에 T1~T5 가 항상 "접근"/"로그인" 텍스트 폴백으로 통과하고 있을 가능성이 높다.

---

## 2. 검증 항목 PASS/FAIL/WARN

| 항목 | 결과 | 비고 |
|---|---|---|
| false green `\|\| true` 0건 | PASS | `\|\| true` 패턴 없음 |
| test.step 분리 | PASS | T1~T5 모두 test.step 사용 |
| role="alert" assertion | WARN | T4 step 4 — bodyText 폴백으로 약화됨 |
| data-testid 사용 | WARN | 실제 TSX data-testid 와 불일치 (M-QA-01, M-QA-02) |
| 권한 매트릭스 검증 | WARN | T5 DISPATCH 케이스 — 허용/차단 명확 assertion 없음 |
| send_audit DB 정합 IT | PASS | AligoSmsAdapterSendAuditIT 4 case |
| @MockBean 격리 | PASS | 6개 external client MockBean |
| pageerror 훅 | PASS | T1~T5 모두 attachPageErrorHook 등록 |
| dev server 미가동 skip | PASS | isServerAvailable() 체크 + test.skip |
| PLAYWRIGHT_SKIP_UI 환경변수 | PASS | SKIP_UI flag 처리 |
| URL 라우트 정확성 | FAIL | /admin/notifications/sms-audit — 실제 라우트와 다름 |
| 날짜 필터 data-testid 일치 | FAIL | dispatch-sms-history-from vs sms-audit-filter-from |
| 상세 modal data-testid 일치 | FAIL | send-audit-detail-modal vs dispatch-sms-send-audit-detail-modal |
| 마스킹 검증 강도 | WARN | !plainPhoneInBody 조건이 마스킹 미적용도 통과 |

---

## 3. 권장 fix

**P1 (HIGH H-QA-03 — 필수):** 마스킹 검증을 다음과 같이 분리:
```typescript
const maskingVerified =
  hasMasking ||
  bodyText.includes('접근') ||
  bodyText.includes('로그인') ||
  bodyText.includes('권한')
// !plainPhoneInBody 제거 — 데이터가 아예 없을 때도 통과하는 false positive 제거
```

**P2 (HIGH H-QA-02 — 권장):** step 3 에서 `bodyText.includes('감사')` → `bodyText.includes('발송 감사')` 로 좁히기.

**P3 (MEDIUM M-QA-01 — 필수):** 날짜 필터 locator를 `[data-testid="sms-audit-filter-from"]` 으로 변경.

**P4 (MEDIUM M-QA-02 — 필수):** modal locator를 `[data-testid="dispatch-sms-send-audit-detail-modal"]` 으로 변경.

**P5 (LOW L-QA-03 — 필수):** URL 상수를 HashRouter 라우트에 맞게 수정:
```typescript
const SMS_AUDIT_URL_MANAGER = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=MANAGER`
```

---

## 4. Claude TM 결정안

**cycle 2 권고 — 다수 data-testid / URL 불일치로 T1~T5 가 실제 화면을 검증하지 못함**

- L-QA-03 (URL 불일치) 와 M-QA-01~02 (data-testid 불일치) 로 인해 Playwright T1~T5 가 실제 화면을 검증하지 못하고 bodyText 폴백으로만 PASS 된다. 이는 test 의 false green 위험이다.
- `|| true` 패턴은 없으나 `bodyText.includes('접근')` / `bodyText.includes('로그인')` 폴백 조건이 사실상 동등한 false-green 역할을 한다.
- H-QA-03 (마스킹 검증 약화) 는 보안 관련 검증이므로 fix 필수.
- fix commit 3~5 라인 수준이므로 개발자가 즉시 수정 후 cycle 2 review 가능.

**최소 fix 목록 (merge blocking):** H-QA-03, M-QA-01, M-QA-02, L-QA-03 — 총 4항목, 약 10라인 변경.
