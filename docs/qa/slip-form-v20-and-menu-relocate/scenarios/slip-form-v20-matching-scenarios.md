# 전표 Form V20 입력 → 판매조회 매칭 시나리오

**슬라이스**: `feature/slip-form-v20-and-menu-relocate`
**작성일**: 2026-05-11
**작성자**: QA agent
**연관 IT**: `SlipFormV20MatchingIT.java` (M-IT-1 ~ M-IT-3)
**연관 Playwright spec**: `clients/desktop/playwright/slip-form-v20/slip-form-v20-matching.spec.ts`

---

## 배경

V20 (feature/sales-purchase-query-redesign) 슬라이스에서 판매/구매조회 화면에 5개 신규 컬럼이 추가되었다.

- **배송주소** (`deliveryAddress`) — 실제 인수 현장
- **감리주소** (`supervisionAddress`) — 실제 설치/감리 현장
- **프로젝트명** (`projectName`)
- **인수자 번호** (`recipientPhone`)
- **입금예정일** (`paymentDueDate`)

추가로 **사업자등록번호** (`businessNumber`)는 거래처 선택 시 자동으로 snapshot 채움된다.

이 시나리오는 "Form 입력 값이 판매조회 결과와 100% 일치하는가"를 검증한다.

---

## 사전 조건

| 항목 | 값 |
|------|-----|
| 사용 역할 | SALES (작성), MASTER (조회) |
| 테스트 거래처 | 사업자등록번호 보유 거래처 1건 이상 |
| Mock 모드 | VITE_MOCK_MODE=1 (FE), @MockBean (BE IT) |
| DB | Testcontainers PostgreSQL 16-alpine |

---

## TC-V1: 전표 작성 폼 V20 5필드 입력란 표시 검증

**목적**: `/sales/new` 진입 시 V20 신규 5개 입력란이 모두 표시되는지 확인한다.

**절차**:
1. SALES 역할로 `/sales/new?mockRole=SALES` 접속
2. 전표 작성 폼 로딩 완료 대기
3. 다음 5개 입력란 visible 확인
   - 배송주소 (`deliveryAddress`)
   - 감리주소 (`supervisionAddress`)
   - 프로젝트명 (`projectName`)
   - 인수자 번호 (`recipientPhone`)
   - 입금예정일 (`paymentDueDate`)

**기대 결과**:
- 5개 입력란 모두 visible
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-v1-sales-new-v20-fields.png`

---

## TC-V2: 거래처 선택 시 businessNumber readonly 자동 채움

**목적**: 거래처를 선택하면 사업자등록번호가 자동으로 채워지고 직접 수정 불가함을 확인한다.

**절차**:
1. SALES 역할로 `/sales/new?mockRole=SALES` 접속
2. 거래처 검색/선택 UI 클릭
3. 거래처 목록에서 첫 번째 항목 선택
4. `businessNumber` 필드 값 및 readonly/disabled 속성 확인

**기대 결과**:
- `businessNumber` 필드에 선택한 거래처의 사업자등록번호 자동 채움
- `readonly` 또는 `disabled` 속성 존재 (직접 수정 불가)
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-v2-partner-businessnumber-autofill.png`

---

## TC-V3: 전표 작성 저장 후 판매조회에서 V20 컬럼 매칭 100%

**목적**: 전표 작성 시 입력한 V20 값이 판매조회 화면의 컬럼 값과 정확히 일치하는지 확인한다.

**테스트 데이터**:
| 필드 | 입력값 |
|------|--------|
| 배송주소 | 서울시 강남구 테헤란로 123 |
| 감리주소 | 서울시 서초구 서초대로 456 |
| 프로젝트명 | QA-V20-프로젝트 |
| 인수자번호 | 010-9876-5432 |
| 입금예정일 | 2026-06-30 |

**절차**:
1. SALES 역할로 `/sales/new?mockRole=SALES` 접속
2. V20 5필드 위 테스트 데이터 입력
3. 저장 버튼 클릭 → 전표번호 확인
4. `/sales/query?mockRole=SALES` 접속
5. 전표번호로 검색
6. 해당 row 의 V20 컬럼 값 확인

**기대 결과**:
- 조회 결과 row 의 배송주소/감리주소/프로젝트명/인수자번호/입금예정일 값이 입력값과 정확히 일치
- 매칭율 100%
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-v3-step1-slip-saved.png`, `tc-v3-step2-query-matching.png`

---

## TC-V4: 전표 상세 페이지 V20 5필드 + businessNumber readonly 표시

**목적**: 전표 상세(`/sales/{id}`) 에서 V20 5필드와 businessNumber 가 모두 표시되고, businessNumber 는 readonly 임을 확인한다.

**절차**:
1. SALES 역할로 `/sales/query?mockRole=SALES` 접속
2. 조회 목록 첫 번째 row 클릭 → 상세 페이지 진입
3. V20 5필드 + businessNumber 6개 항목 visible 확인
4. businessNumber 필드의 readonly/disabled 속성 확인

**기대 결과**:
- V20 5필드 + businessNumber 모두 표시
- businessNumber: readonly 또는 disabled (직접 수정 불가)
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-v4-sales-detail-v20.png`

---

## TC-V5: V20 부분 갱신 후 판매조회 응답에 갱신 반영

**목적**: 전표 수정 시 V20 필드를 변경하면 판매조회 결과에 갱신된 값이 반영되는지 확인한다.

**절차**:
1. SALES 역할로 `/sales/query?mockRole=SALES` 접속
2. 조회 목록 중 수정 가능한 row 의 수정 버튼 클릭
3. `projectName` 필드를 "QA-V20-갱신-프로젝트"로 변경
4. 저장 완료
5. `/sales/query?mockRole=SALES` 재접속
6. `searchProjectName=QA-V20-갱신-프로젝트` 검색

**기대 결과**:
- 검색 결과에 갱신된 프로젝트명 포함
- 갱신 전 프로젝트명은 검색 결과에서 제거됨
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-v5-step1-v20-update.png`, `tc-v5-step2-query-updated.png`

---

## 연관 IT 시나리오 (BE 단위)

| ID | 설명 | 파일 |
|----|------|------|
| M-IT-1 | POST /slips V20 → /slips/query echo 100% | `SlipFormV20MatchingIT#mIt1_postWithV20_echoedInQueryResponse` |
| M-IT-2 | PATCH V20 부분 갱신 → query 갱신 반영 | `SlipFormV20MatchingIT#mIt2_patchV20_reflectedInQueryResponse` |
| M-IT-3 | PartnerInternalClient mock — 거래처 변경 시 businessNumber snapshot 갱신 | `SlipFormV20MatchingIT#mIt3_businessNumberSnapshot_partnerChange` |
