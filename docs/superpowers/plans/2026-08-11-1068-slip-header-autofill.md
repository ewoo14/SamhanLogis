# 판매전표 헤더 거래처 자동채움 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 각 단계의 체크박스를 실행 중 갱신한다.

**Goal:** 판매전표 작성 화면에서 거래처 master 헤더 정보와 accounting 원장 전잔을 안전하게 자동 표시하고, 저장 대상 전표를 중복 없이 포함한 후잔을 상세 화면에 표시한다.

**Architecture:** `partners.outstanding_balance`는 사용하지 않는다. partner-service는 주소·전화·대표자·특이사항·담당자 master read 계약만 제공하고, accounting-service의 `PartnerLedgerContract`가 전잔·후잔 원천이 된다. 기존 sales-slip-ledger read 계약에 선택적 `slipNo`를 추가해 DRAFT/SAVED 신규 전표를 원장 집계에 한 번만 포함한다.

**Tech Stack:** Spring Boot/Java, JPA/Flyway, React/TypeScript, TanStack Query, Vitest, Playwright Chromium.

## Global Constraints

- 전잔·후잔은 화면 표시 전용이며 이 화면에서 수정하지 않는다.
- `partners.outstanding_balance`를 읽거나 쓰지 않는다.
- accounting 조회 실패는 0원으로 대체하지 않고 `조회 실패` 상태로 표시한다.
- 거래처 변경 시 사용자가 직접 편집한 자동채움 필드는 보존하고, 미편집 필드만 새 거래처 값으로 갱신한다.
- accounting 장애는 판매전표 작성·저장을 막지 않는다.
- 저장 실패 시 후잔을 산출하지 않고 작성 화면에 저장 오류를 남긴다.
- 거래처 없는 전표와 기존 배송·채번·빈행·instanceKey 동작을 보존한다.
- 화면에 UUID를 표시하지 않는다.
- 이 워크트리에서는 commit/push/PR을 수행하지 않는다.

---

### Task 1: RED — partner 자동채움 계약과 작성 화면 필드

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
- Modify: `clients/desktop/src/renderer/api/slip.ts` (계약 구현은 RED 확인 뒤)
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.tsx` (구현은 RED 확인 뒤)
- Modify: `clients/desktop/src/renderer/api/mock.ts` (mock 계약 구현은 RED 확인 뒤)

**Interfaces:**
- `PartnerAutoFillResult`가 `address1`, `address2`, `note`, `managerName`을 선택적으로 제공한다.
- 작성 화면은 `customerTel`, `customerAddress`, `customerRepresentative`, `partnerNote`, `partnerManagerName`을 각각 표시한다.

- [ ] **Step 1: failing test 작성**

  `SlipFormPage.test.tsx`에 다음 RED를 추가한다.

  ```tsx
  it('거래처 선택 시 전화·주소·대표자·특이사항·담당자를 헤더에 표시한다', async () => {
    harness.lookupPartnerForAutoFill.mockResolvedValue({
      partnerCode: 'P-A', name: '거래처 A', phone: '02-1111-2222',
      address: '서울시 중구', address1: '1층', address2: '101호',
      representative: '홍길동', note: '현금 선입금 거래처', managerName: '김담당',
    })
    renderSlipForm()
    await selectPartnerA()
    expect(screen.getByTestId('slip-customer-tel')).toHaveValue('02-1111-2222')
    expect(screen.getByTestId('slip-customer-address')).toHaveValue('서울시 중구 1층 101호')
    expect(screen.getByTestId('slip-customer-representative')).toHaveValue('홍길동')
    expect(screen.getByTestId('slip-partner-note')).toHaveTextContent('현금 선입금 거래처')
    expect(screen.getByTestId('slip-partner-manager')).toHaveTextContent('김담당')
  })

  it('거래처 변경 시 사용자가 편집한 필드는 유지하고 나머지만 새 값으로 채운다', async () => {
    // A 선택 → 전화번호를 직접 수정 → B 선택
    // 전화번호는 A의 직접 입력값, 주소/대표자는 B의 값이어야 한다.
  })

  it('accounting 전잔 조회 실패가 거래처 헤더와 저장 동작을 막지 않는다', async () => {
    // accounting query를 reject하고 partner autofill은 성공시킨다.
    // 조회 실패 문구가 보이고 createSlip은 정상 호출되어야 한다.
  })
  ```

- [ ] **Step 2: focused RED 실행**

  Run: `npm test -- --run clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`

  Expected: 새 테스트가 실패한다. 현재 자동채움 응답/화면에 note·manager 필드가 없고, accounting query와 dirty 보존이 구현되어 있지 않다는 assertion이 보여야 한다.

- [ ] **Step 3: minimal 구현**

  partner 상세 응답을 확장하고, 폼에 전화번호·주소·대표자 입력 필드와 특이사항·담당자 표시 영역을 추가한다. 주소는 `address`, `address1`, `address2`의 비어 있지 않은 값을 중복 없이 공백으로 합친다. 특이사항과 담당자는 Slip의 기존 transaction `memo`/owner 필드와 섞지 않는 master metadata 표시 전용으로 둔다.

  자동채움 필드는 field-level dirty ref를 사용한다. `onChange`로 직접 수정된 필드는 partner 변경 및 비동기 응답에서 덮어쓰지 않는다. 미수정 자동값은 새 거래처 값으로 갱신하고, 거래처 해제 시에도 dirty 값은 보존한다. request sequence와 선택 거래처 검사를 함께 사용해 늦게 도착한 이전 응답을 무시한다.

- [ ] **Step 4: focused GREEN 실행**

  Run: `npm test -- --run clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`

  Expected: Task 1의 새 테스트와 기존 SlipFormPage 테스트가 PASS.

---

### Task 2: RED — accounting 대상 전표 포함 read 계약

**Files:**
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/web/SlipInternalControllerTest.java` 또는 기존 internal controller 테스트 파일
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelServiceTest.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/AccountingReportControllerTest.java` 또는 기존 controller 테스트 파일
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java` (RED 이후)
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java` (RED 이후)
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java` (RED 이후)
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java` (RED 이후)
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java` (RED 이후)

**Interfaces:**
- Internal read: `GET /internal/slips/partner-ledger-sales/{slipNo}` — 활성 OUTBOUND 전표를 상태와 무관하게 UUID 없는 원장 projection으로 반환한다.
- Accounting client: `PartnerLedgerSalesClient.findBySlipNo(String slipNo)`.
- Public read: `GET /accounting/journals/sales-slip-ledger?partnerCode&from&to&slipNo`.
- Service overload: `read(partnerCode, from, to, targetSlipNo)`; 기존 3-argument `read`는 null target으로 위임한다.

- [ ] **Step 1: failing service/controller tests 작성**

  다음 동작을 테스트한다.

  ```java
  @Test
  void targetDraftSlipIsIncludedExactlyOnceInClosingBalance() {
      // 기존 canonical sales에는 target이 없고 target read는 DRAFT 1,100원이다.
      // opening 10,000 + target 1,100 = closing 11,100.
      // target이 이미 canonical 결과에 있으면 다시 더하지 않는다.
  }

  @Test
  void missingTargetSlipDoesNotSilentlyReturnAZeroBalance() { /* 조회 오류 전파 */ }

  @Test
  void internalTargetProjectionIncludesDraftAndDoesNotExposeUuid() { /* slipNo/amount만 검증 */ }
  ```

- [ ] **Step 2: backend RED 실행**

  Run: `./gradlew :services:accounting-service:test --tests '*PartnerLedgerReadModelServiceTest*'` 및 대상 slip-service 테스트.

  Expected: `findBySlipNo` 계약과 4-argument read가 없어 컴파일 또는 assertion 실패.

- [ ] **Step 3: minimal 구현**

  slip-service internal endpoint는 `findBySlipTypeAndSlipNoAndIsDeletedFalse(OUTBOUND, slipNo)`를 사용해 DRAFT/SAVED도 반환한다. accounting은 target을 기간과 partnerCode에 검증하고 기존 canonical sales 목록에 같은 `slipNo`가 없을 때만 한 번 추가한다. target read 실패·partner/date 불일치는 예외로 전파하여 후잔을 만들지 않는다.

- [ ] **Step 4: backend GREEN 실행**

  위 focused Gradle 테스트를 다시 실행하고 target DRAFT, target canonical, target missing 세 경우가 PASS인지 확인한다.

---

### Task 3: RED/GREEN — partner 상세 read 확장과 원장 금액의 0 fallback 제거

**Files:**
- Modify: `services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerAdminResponse.java`
- Modify: `clients/desktop/src/renderer/api/slip.ts`
- Modify: `clients/desktop/src/renderer/api/mock.ts`
- Modify: `clients/desktop/src/renderer/api/partnerLedgerApi.ts`
- Modify: `clients/desktop/src/renderer/routes/salesSlipLedger.ts`
- Modify: `clients/desktop/src/renderer/api/partnerLedgerApi.test.ts`
- Modify: `clients/desktop/src/renderer/routes/salesSlipLedger.test.ts`

- [ ] **Step 1: RED 작성 및 실행**

  partner 상세 확장 필드가 mapper에 보존되는지, ledger response의 opening/closing 누락이 `'0'`으로 바뀌지 않는지, `slipNo`가 public query에 전달되는지 테스트한다. Run: `npm test -- --run clients/desktop/src/renderer/api/partnerLedgerApi.test.ts clients/desktop/src/renderer/routes/salesSlipLedger.test.ts`. Expected: 신규 assertion FAIL.

- [ ] **Step 2: minimal 구현 및 GREEN**

  `PartnerAdminResponse`에 `address1/address2/note/managerName`을 추가하되 `outstandingBalance`는 desktop 자동채움 계약으로 전달하지 않는다. `mapPartnerLedgerResponse`와 `toSalesSlipLedgerDisplay`는 opening/closing 누락을 error 상태로 보존하고, 실제 API가 반환한 문자열 `"0"`만 0원으로 표시한다. `buildSalesSlipLedgerRequest`와 API client에 `slipNo`를 추가한다.

---

### Task 4: RED/GREEN — 작성 화면 전잔 조회, 저장 성공/실패 경계, 상세 후잔

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/salesSlipLedger.ts`
- Modify: `clients/desktop/src/renderer/api/partnerLedgerApi.ts`

- [ ] **Step 1: RED 작성**

  전잔 12,000원과 저장 대상 target slip 합계 3,300원이 반환될 때 상세에서 12,000원/15,300원이 표시되는 왕복 계약을 추가한다. accounting query reject 시 폼이 계속 저장 가능하고 `조회 실패`만 표시되는 테스트를 추가한다. `createSlip` reject 시 상세 이동이나 후잔 표시가 없고 기존 저장 오류가 유지되는 테스트를 추가한다.

- [ ] **Step 2: RED 실행**

  Run: `npm test -- --run clients/desktop/src/renderer/routes/SlipFormPage.test.tsx clients/desktop/src/renderer/routes/salesSlipLedger.test.ts`. Expected: 전잔 query 연동, target slipNo 전달, 저장 후 상세 이동 assertion이 FAIL.

- [ ] **Step 3: minimal 구현**

  OUTBOUND 작성 화면은 partnerCode와 slipDate가 있을 때 기존 accounting sales-slip-ledger를 읽고 `openingBalance`만 전잔으로 표시한다. query는 `enabled`/`retry:false`로 두고 오류는 폼의 submit 가능 상태와 분리한다. 거래처가 없으면 `거래처 없음`으로 표시하며 query를 호출하지 않는다. 저장 성공 시 반환된 상세의 내부 route id로 `/sales/:id`로 이동하여 상세 query가 `slipNo`를 함께 요청한다. 저장 실패 시 작성 화면을 유지하고 후잔을 계산하지 않는다. INBOUND는 기존 list 이동을 유지한다.

  상세 화면은 `slipNo`를 accounting 요청에 전달하고, accounting response가 반환한 원장 `openingBalance`/`closingBalance`만 표시한다. 후잔은 프론트가 재계산하지 않아 target 중복 계상 위험을 backend 계약 한 곳으로 제한한다.

- [ ] **Step 4: GREEN 실행**

  focused desktop tests를 실행하고 기존 상세의 거래처 없음/원장 오류/기존 헤더 필드 테스트도 PASS인지 확인한다.

---

### Task 5: 회귀 검증 및 보고 산출물

**Files:**
- Create: `docs/dev-reports/2026-08-11-1068-slip-header-autofill.md`
- Create: `docs/qa/2026-08-11-1068-real-qa/` 아래 실제 Playwright 스펙과 PNG

- [ ] **Step 1: 기존 테스트 전량 실행**

  Run: `npm test`, `npm run typecheck`, 관련 slip-service/accounting-service/partner-service Gradle test. 실패하면 원인을 수정하고 같은 명령을 다시 실행한다.

- [ ] **Step 2: 실제 QA 스펙 작성/실행**

  `clients/desktop`에서 Playwright Chromium headless를 직접 실행한다. 스펙 디렉토리와 파일명 모두 `*-real-qa` 접미사를 사용한다. `${BASE_URL}/#/sales/new` hash route로 이동하고 고유 testid를 확인한 뒤 다음을 캡처한다: partner 5개 필드 채움, 전잔 원장값, accounting 실패 후 조회 실패+저장 가능, 저장 후 target 포함 후잔, 거래처 없음 폼.

- [ ] **Step 3: 개발보고서 작성**

  보고서에 RED-A, 원장 정본 선택 근거를 실제 파일:줄로 기록한다. `PartnerLedgerContract`, `PartnerLedgerReadModelService`, `AccountingReportController`, `SlipInternalController`, VAT 포함 `lineAmount` 근거, target `slipNo` 중복 방지, accounting 장애 시 작성 허용, 저장 실패 시 후잔 미산출, dirty 보존 정책, 테스트 명령과 실제 QA 스크린샷 경로를 포함한다.

- [ ] **Step 4: 최종 검증**

  새 변경 파일 diff를 읽고 UUID 노출, `outstanding_balance` 참조, 0 fallback, 기존 헤더/채번/빈행/instanceKey 변경 여부를 검색한다. 실제 QA PNG를 확인한 뒤에만 완료 보고한다.

