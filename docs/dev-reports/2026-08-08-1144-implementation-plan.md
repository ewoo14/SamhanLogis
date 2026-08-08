# #1144 회계·입출금 명세 실행 계획

> **실행 담당자 필수 절차:** 구현 시 `superpowers:test-driven-development`로 각 묶음의 RED 테스트를 먼저 만들고, 완료 주장 전 `superpowers:verification-before-completion`으로 묶음별 검증표를 다시 실행한다. 여러 묶음을 병행하지 말고 아래 의존 순서를 지킨다.

**목표:** 이슈 #1144의 규칙 1~16을, 현재 사용자가 보고 있는 금액 오표시와 권한 403부터 바로잡은 뒤 원장·분개 무결성을 보존하면서 회계전표 생성·연결, 일마감, 출금보고서, 계좌·카드·대출 3메뉴까지 완성한다.

**구조:** 새 이슈는 만들지 않는다. #1144 하나를 유지하고, 아래 6개 통합 슬라이스를 순차 수행한다. 각 슬라이스는 BE·FE·권한·문서·회귀 테스트·QA를 한 묶음으로 끝내며, 다음 슬라이스가 앞 슬라이스의 확정 계약만 소비하게 한다.

**기술 스택:** Spring Boot/JPA/Flyway/PostgreSQL, React/TypeScript 데스크톱 클라이언트, 기존 PageCode 권한 체계, 기존 회계전표·분개·입금보고서 도메인.

## 0. 계획의 입력과 전역 제약

이 계획은 다음 세 조사 보고서의 사실만 사용했다.

- `docs/dev-reports/2026-08-08-1144-accounting-spec-gap-survey.md`
- `docs/dev-reports/2026-08-08-1144-deposit-withdrawal-survey.md`
- `docs/dev-reports/2026-08-08-1144-cash-ledger-menu-survey.md`

전역 제약은 다음과 같다.

- 자기 회사 구분 플래그를 추가하지 않는다. `(주)삼한공조시스템`, `partner_code=2148720659`는 기존 기초거래처를 사용한다.
- 규칙 15·16은 바로빌 자격과 분리한다. 활성 체크와 10분 자동수집은 #922 범위이므로 #1144에 넣지 않는다.
- CODEF 실연동 활성화·자격 검증은 하지 않는다. 기존 데이터의 DRY_RUN 여부를 행별로 역추정하지 않는다.
- 사용자 화면에 UUID를 표시하지 않는다. 전표번호, 거래처코드, 사업자번호, 거래처명, 금융 표시 label만 사용한다.
- 회계 엔티티는 BaseEntity 감사 필드와 soft-delete 원칙을 유지한다. 다만 규칙 11의 업무 동작을 soft-delete와 `VOIDED` 중 무엇으로 표현할지는 착수 전 질문 Q6으로 확정한다.
- 기존 `VatCalculator`, 회계전표 생성 검증·번호채번, allocation 구조, 세금계산서 발행묶음 게이트, 일마감 할인 판정엔진, 입금보고서 확정·역분개 패턴을 재사용한다.
- 보고서에 없는 사실이 필요하면 구현자가 추정하지 않고 해당 묶음의 “착수 전 더 잴 것”을 먼저 측정한다.
- 이 계획은 구현 순서를 정한 문서다. 현재 라운드에서는 제품 코드, DB, git, Docker를 변경하지 않는다.

## 1. 우선순위 원칙

### P0 — 사용자가 지금 틀린 결과를 보거나 정상 기능에 접근하지 못함

1. **P0-A VAT 표시 정정(규칙 7)**: 330,000원을 363,000원으로 보여 주는 것은 없는 기능보다 위험하다. 회계담당자가 화면의 틀린 합계를 믿고 전표를 확정할 수 있으므로 가장 먼저 고친다.
2. **P0-B PageCode/액션 정합(규칙 1)**: 13개 계정의 GET 403과 3개 계정의 저장 403은 이미 있는 기능을 사용할 수 없게 하며 이후 라이브 QA도 막는다.
3. **P0-C 채무 원장 누락(규칙 6·8)**: INBOUND 20건/12거래처가 원장에서 조용히 빠진다. 이는 “없는 신규 화면”이 아니라 기존 거래처 원장의 누락 금액이다.
4. **P0-D 분개 인과 정렬(규칙 6·8)**: POSTED 매출전표가 채권 잔액을 바꾸지 않고 세금계산서 발행이 110 분개를 만드는 현행은 명세와 인과가 반대다. 다만 이 단계는 가장 위험하므로 Q4·Q10 및 기준선 측정 뒤에만 실행한다.

### P1 — 잘못된 금액의 정정·게이트와 기존 경로의 완결성

5. 회계전표 3금액 상세 표시와 정정/무효/재연결(규칙 7·11).
6. 세금계산서 연결 게이트·역방향 표시(규칙 9·10). 정정 수단보다 먼저 게이트를 강화하면 기존 자료가 잠기므로 반드시 정정 수단 뒤에 둔다.
7. 외부 일괄 선택기의 상태·기간·잔여·품목 보존 결함과 상세 단건 생성(규칙 1~3).

### P2 — 현재 없는 확장 기능

8. 일마감 생성·연결 및 할인 판단 사용처(규칙 4·5).
9. 출금보고서와 출금 반영(규칙 12~14).
10. 입출금내역 계좌·카드·대출 3메뉴(규칙 15·16).

메뉴 3분할은 비교적 독립적이지만 현재 금액·403보다 앞세울 이유가 없다. 출금보고서는 메뉴 분리 후에도 구현할 수 있으나, 출금 처리 계약을 한 화면에서 먼저 안정화한 뒤 세 메뉴가 같은 계약을 재사용하게 하는 편이 회귀 범위가 작다.

## 2. 분리 제안 — #1144 안의 6개 통합 슬라이스

새 이슈를 만들지 않고 다음 슬라이스를 모두 #1144에 흡수한다. 작은 FE-only 또는 BE-only PR로 쪼개지 않고 각 슬라이스마다 화면·API·권한·테스트·문서를 함께 끝낸다.

| 슬라이스 | 성격 | 포함 규칙 | 종료 조건 |
|---|---|---|---|
| **S0 현행 오표시·403 제거** | 현재 결함 | 1·7 | 330,000 계약 일치, 권한 행렬의 VIEW/CREATE가 FE/BE에서 동일 |
| **S1 원장·분개 무결성** | 회계 핵심 | 6·8 | INBOUND 채무 누락 해소, POST 전후 분개 계약 확정, 이중계상 0 |
| **S2 회계전표 수명주기·세금계산서 게이트** | 생성·연결 기반 | 1~3·7·9~11 | 상세/일괄/정정/재연결과 모든 확정된 발행 경로 게이트 완주 |
| **S3 일마감** | 마감 | 4·5 | 판정 대상·조치 계약 확정 후 일마감에서 생성·연결 완주 |
| **S4 출금보고서** | 현금·채무 | 12~14 | 출금 선택→보고서→확정/취소→분개/원장/통장 상태까지 대칭 완주 |
| **S5 메뉴 3분할** | 정보구조 | 15·16 | 계좌·카드·대출 각 메뉴에서 정의된 “등록된 것 전부” 조회 |

이 분리가 필요한 이유는 회계전표 생성·연결, 원장·분개, 일마감, 출금보고서, 메뉴 분리가 서로 다른 실패 모드와 되돌리기 단위를 갖기 때문이다. 특히 S1은 금액 무결성 변경이고 S5는 라우팅/조회 변경이므로 같은 배포 단위에서 동시에 원인을 섞지 않는다.

### 2.1 규칙 1~16 추적표

| 규칙 | 주 구현 묶음 | 보조/회귀 묶음 |
|---:|---|---|
| 규칙 1 | S0-B, S2-D | S2-E |
| 규칙 2 | S2-D | S2-A |
| 규칙 3 | S2-C, S2-E | S0-A |
| 규칙 4 | S3-B | S2-D·E |
| 규칙 5 | S3-A | S3-B |
| 규칙 6 | S1-A·B | S4-C |
| 규칙 7 | S0-A, S2-A | S2-C |
| 규칙 8 | S1-A·B | S4-C |
| 규칙 9 | S2-A·F | S2-B |
| 규칙 10 | S2-F | S2-B |
| 규칙 11 | S2-B | S1-B |
| 규칙 12 | S4-A | S4-B |
| 규칙 13 | S4-B·C | S1-B |
| 규칙 14 | S4-B·C | S1-A |
| 규칙 15 | S5-B | S5-A |
| 규칙 16 | S5-A·B | S4-B |

## 3. 작업 묶음과 의존 그래프

### 3.1 전체 그래프

```text
[Q1~Q10 업무계약 확정 / M1~M7 추가 측정]
                 │
                 ├── S0-A VAT 표시 ───────────────┐
                 └── S0-B 권한 403 ───────────────┤
                                                  ▼
                         S1-A 채무 문서원장 ──→ S1-B 분개 인과·이중계상 제거
                                                  │
                                                  ▼
                         S2-A 3금액 상세 ──→ S2-B 정정·무효·연결해제
                                                  │
               S2-C 원천선택기 ──→ S2-D 상세 단건 ─┼─→ S2-E 외부 일괄
                                                  │
                                                  └─→ S2-F 세금계산서 게이트·역방향
                                                               │
                                                               ▼
                         S3-A 일마감 판정계약 ──→ S3-B 일마감 생성·연결

                         S1-B ────────────────────→ S4-A 출금보고서 도메인
                         S4-A ──→ S4-B 통장 출금 반영 ──→ S4-C 채무/분개 반영
                                                               │
                                                               ▼
                         S5-A 서버 source 조회계약 ──→ S5-B 계좌·카드·대출 3메뉴
```

병행 허용 범위는 S0-A와 S0-B뿐이다. S1 이후는 기준금액과 스키마/분개 계약을 공유하므로 순차 수행한다.

### 3.2 S0-A — 회계전표 작성 폼 VAT 의미 정정

**채우는 규칙:** 7.

**변경 대상:**

- 수정: `clients/desktop/src/renderer/routes/SalesAccountingSlipFormPage.tsx`
- 수정: `clients/desktop/src/renderer/routes/PurchaseAccountingSlipFormPage.tsx`
- 수정: 조사에 적시된 mock `buildMockDraft` 구현 파일
- 재사용: `services/accounting-service/.../VatCalculator.java`, `VatAmountCalculator.splitVatInclusive`
- 테스트 신규 제안: 작성 폼 금액 계약 테스트 2개(매출/매입)
- 테이블 변경: 없음. `sales_accounting_slips`, `purchase_accounting_slips`의 기존 3금액 컬럼을 그대로 사용

**착수 전 더 잴 것:** 프런트에 서버의 원 단위 절사와 동일한 decimal 유틸이 이미 있는지 확인한다. 없다면 부동소수점 산식을 새로 만들지 말고 서버 미리보기 API가 필요한지 결정한다.

**선행 조건:** 없음.

**실행 순서:**

1. 330,000 입력이 현재 330,000/33,000/363,000으로 보이는 RED 컴포넌트 테스트를 만든다.
2. 서버 계약 fixture를 330,000→300,000/30,000/330,000으로 고정한다.
3. 1원, 10원, 11원, 100원, 소수 수량×단가 등 절사 경계 fixture를 서버 테스트와 FE 테스트에 같은 값으로 둔다.
4. 매출·매입 폼과 mock의 의미를 “VAT 포함 총액 → 공급가액/부가세액 분리”로 통일한다.
5. 화면 라벨이 실제 의미와 맞는지 확인하고, 단순 오표기면 함께 정정한다.

**검증:**

- 단위: 서버 `VatCalculator` fixture와 FE fixture가 모든 경계값에서 동일하다.
- 컴포넌트: 330,000 배분 시 공급가액 300,000, 부가세 30,000, 총금액 330,000이 보인다.
- API 계약: 제출 body의 배분합과 저장 응답 3금액이 일치한다.
- 실화면: 조사 표본 `2026/07/26-1027`과 같은 330,000 배분을 저장 전/후 캡처해 세 숫자가 변하지 않는지 확인한다. DB 직접 INSERT는 하지 않는다.

**금액 접촉:** 예. 사용자 표시 금액을 바꾸지만 저장 산식과 스키마는 바꾸지 않는다.

**되돌리기:** FE 산식/라벨과 mock만 이전 버전으로 되돌릴 수 있다. DB 데이터 변환이 없어 데이터 롤백은 필요 없다. 단, 되돌리면 알려진 33,000원 오표시가 재발하므로 배포 롤백 사유와 함께 명시한다.

### 3.3 S0-B — PageCode와 권한 액션 정합

**채우는 규칙:** 1.

**변경 대상:**

- 수정: `clients/desktop/src/renderer/routes/index.tsx`
- 수정: `clients/desktop/src/renderer/api/permissionsApi.ts`
- 수정: 매출·매입 회계전표 목록/작성 화면의 액션 검사
- 확인 후 필요 시 수정: `SalesAccountingSlipController.java`, `PurchaseAccountingSlipController.java`
- 확인 후 필요 시 수정: auth-service의 해당 PageCode 시드/물질화 migration
- 테이블: `role_page_permissions`, 권한 template/group/account materialize 계층(실제 이름은 기존 migration 계약을 따른다)

**선행 조건:** FE는 `.list`, BE는 `.accounting`, FE edit는 UPDATE, BE 생성은 CREATE라는 조사 결과를 정본으로 사용한다.

**실행 순서:**

1. `VIEW만 허용`, `CREATE만 허용`, `UPDATE만 허용`, 모두 거부 역할에 대한 라우트/API 권한 계약 테스트를 만든다.
2. 매출과 매입 각각 목록은 VIEW, 작성은 CREATE, 전기는 확정된 기존 액션으로 매핑한다.
3. FE PageCode를 이미 BE가 사용하는 `.accounting` 계열로 통일한다. 새 PageCode를 만들지 않는다.
4. 권한설정 화면 표시명과 4계층 물질화가 같은 코드를 가리키는지 확인하고 불일치만 보정한다.

**검증:**

- API: `.accounting:VIEW` 계정의 GET 성공, 무권한 계정 403.
- API: `.accounting:CREATE` 계정의 생성 성공, UPDATE만 있는 계정은 생성 403.
- UI: 조사에서 막힌 13계정 조건을 재현한 권한 fixture로 목록 진입 성공.
- UI: 3계정 조건을 재현한 fixture로 잘못된 UPDATE 의존이 제거됐는지 확인.
- 회귀: MASTER/MANAGER/ACCOUNTANT 기본 권한과 권한설정 화면 표시가 유지된다.

**금액 접촉:** 아니오. 다만 회계 생성 기능의 접근 경계를 바꾸므로 보안 회귀 대상이다.

**되돌리기:** FE/BE PageCode 변경과 권한 seed 보정을 한 묶음으로 되돌린다. migration이 추가됐다면 down migration 대신 후속 보정 migration으로 기존 권한 값을 복원한다.

### 3.4 S1-A — 거래처별 채무 문서원장 추가

**채우는 규칙:** 6·8.

**변경 대상:**

- 수정: `services/slip-service/.../SlipRepository.java`
- 수정: `services/slip-service/.../SlipInternalController.java`
- 수정: `services/accounting-service/.../PartnerLedgerSalesClient.java` 또는 역할에 맞게 일반화한 신규 client
- 수정: `services/accounting-service/.../PartnerLedgerReadModelService.java`
- 수정: `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx`
- 테스트 신규 제안: slip-service INBOUND projection 테스트, accounting-service 채무 fold 테스트, 기존 채권 회귀 테스트
- 테이블 변경: 없음. `slips`/`slip_lines`를 읽기만 한다.

**착수 전 질문:** Q4에서 채무를 기존 거래처별 원장의 탭/열로 둘지 확정한다. Q4-b에서 표시 합계와 잔액 산식 범위를 확정한다.

**선행 조건:** S0-B. 권한이 정상이어야 실화면 원장 검증이 가능하다.

**실행 순서:**

1. OUTBOUND 채권 359,003,920원 기준선이 변하지 않는 회귀 테스트를 먼저 고정한다.
2. INBOUND 20건/12거래처가 현행 응답에서 빠지는 RED 테스트를 만든다.
3. `findPartnerLedgerSales`의 OUTBOUND 하드코딩을 타입 안전한 공통 projection으로 일반화하거나 INBOUND 전용 쿼리를 추가한다.
4. 내부 API에 INBOUND 거래 문서를 노출하고 accounting read model에 purchase/payable fold를 추가한다.
5. Q4에서 정한 화면 구조로 거래처코드·거래처명·전표번호·매입액·지급액·채무잔액을 표시한다.

**검증:**

- 기존 채권: 34거래처·359,003,920원 기준값 불변.
- 신규 채무: 조사 시점 INBOUND 20건·12거래처가 projection에 포함됨.
- 경계: OUTBOUND가 채무에, INBOUND가 채권에 섞이지 않음.
- 상태: 어떤 slip status를 포함하는지는 기존 채권 계약과 Q4 결정대로 대칭 적용.
- 표시: UUID 없이 거래처코드/명·전표번호로 조회.

**금액 접촉:** 예. 저장 금액은 바꾸지 않지만 기존 원장 합계와 잔액 표면을 바꾼다.

**되돌리기:** 신규 INBOUND projection과 UI 탭/열을 feature 단위로 제거한다. DB migration이 없으므로 기존 채권 원장으로 즉시 복귀할 수 있다. 기존 OUTBOUND 쿼리는 수정 전 계약 테스트로 보호한다.

### 3.5 S1-B — 회계전표 POST, 분개, 채권·채무 표면의 인과 정렬

**채우는 규칙:** 6·8.

**변경 대상:**

- 수정 후보: `SalesAccountingSlipService.java`, `PurchaseAccountingSlipService.java`
- 수정 후보: `TaxInvoiceService.java`
- 수정: `ReceivablesPayablesService.java`, `LedgerService.java`, `PartnerAgingService.java`, `PartnerLedgerReadModelService.java`
- 수정/신규: 회계전표 분개 게시 서비스와 idempotency 연결 필드
- 테이블 후보: `sales_accounting_slips`, `purchase_accounting_slips`, `journals`, `journal_lines`; 필요 시 회계전표↔분개 연결 컬럼 migration
- 테스트 신규 제안: POST 원자성, 재시도 멱등성, 역분개, 세금계산서 발행 중복분개 방지, 거래처 원장 이중계상 방지 IT

**착수 전 더 잴 것:**

- M1: 현행 `journal`/`journal_lines`의 source/source_ref/idempotency 계약과 회계전표 연결 가능한 자연키.
- M2: 매출·매입 회계전표 라인의 계정코드와 VAT 계정 매핑. 매출은 110 차변의 상대 계정, 매입은 201/210 대변의 상대 계정을 어떤 필드가 제공하는지 측정한다.
- M3: `TaxInvoiceService.issue()`가 만든 110 분개와 기존 회계전표/세금계산서 연결 가능 범위, 중복 후보 건수.
- M4: POSTED/REVERSED 기준 현재 110·201·210 잔액을 테스트 fixture와 실 QA 기준선으로 기록한다.

**착수 전 질문:** Q4, Q10. 분개 계정 계약이 확정되지 않으면 구현하지 않는다.

**선행 조건:** S1-A, S2-B의 정정 수단 설계 승인. 실제 구현 순서는 S1 계약 테스트를 먼저 만들되, 되돌리기 가능한 정정 endpoint와 함께 배포한다.

**실행 순서:**

1. 매출전표 POST 전후 110 잔액 델타 0인 현행을 RED 테스트로 고정한다.
2. 매입전표 POST 전후 201/210 잔액 계약을 RED 테스트로 만든다.
3. POST 상태 전이와 분개 게시를 한 트랜잭션으로 묶고 자연키 기반 멱등성을 둔다.
4. 거래처별 문서원장에서는 해당 회계전표 journal source를 제외해 원 전표와 분개가 이중으로 합산되지 않게 한다.
5. `TaxInvoiceService.issue()`의 110 생성 책임을 Q10 결정대로 제거·축소하거나 기존자료 호환 경로로 제한한다.
6. VOID/CANCEL 시 원분개를 수정하지 않고 역분개를 생성한다.

**검증:**

- 매출 POST 1회: 110 채권이 총금액만큼 정확히 증가하고 대차 합계가 0.
- 매입 POST 1회: 결정된 201/210 채무가 총금액만큼 정확히 증가하고 대차 합계가 0.
- 같은 POST 재시도: journal 1건만 존재.
- 세금계산서 발행: 이미 POST 분개가 있으면 110/201/210 추가 델타 0.
- 거래처 문서원장: 회계전표 POST 전후 같은 판매/구매 거래가 한 번만 보임.
- 채권채무 현황·총계정원장·에이징: 같은 기준일에 합계가 서로 설명 가능하고 역분개 후 원상 복귀.
- 실패 주입: 분개 게시 실패 시 회계전표만 POSTED로 남지 않음.

**금액 접촉:** 예, 최고 위험. 실제 잔액과 분개를 변경한다.

**되돌리기:** 코드 롤백만으로 이미 게시된 분개를 삭제하지 않는다. 기능 플래그 또는 게시 경로 비활성화로 신규 생성을 멈추고, 영향받은 분개는 원장 규칙에 맞는 역분개로만 복구한다. migration 컬럼은 유지 가능한 additive 방식으로 만들며 rollback 시 읽지 않게 한다.

### 3.6 S2-A — 회계전표 3금액 상세·역방향 표시

**채우는 규칙:** 7·9.

**변경 대상:**

- 수정: `SalesAccountingSlipResponse.java`, `PurchaseAccountingSlipResponse.java`
- 수정/신규: `SalesAccountingSlipController.java`, `PurchaseAccountingSlipController.java` 단건 조회
- 수정: `salesAccountingSlipApi.ts`, `purchaseAccountingSlipApi.ts`
- 신규 제안: 매출·매입 회계전표 상세 페이지 컴포넌트
- 수정: `routes/index.tsx`, 회계전표 목록 페이지
- 수정: `TaxInvoiceDetailResponse.java`, `MonthEndCloseService.java`
- 재사용: `findByTaxInvoiceId`
- 테이블 변경: 없음. 기존 3금액과 `tax_invoice_id` 사용

**선행 조건:** S0-A, S0-B.

**검증:**

- 목록/상세에 총금액·공급가액·부가세액이 모두 저장값 그대로 표시.
- 상세에 과세구분, 원천 전표번호, 연결 세금계산서의 사용자 식별자가 표시.
- 세금계산서 상세와 일/월마감 detail에 출처 회계전표번호가 null 하드코딩 없이 표시.
- 내부 UUID는 응답 경로용이어도 화면 텍스트에는 노출하지 않음.

**금액 접촉:** 예. 읽기 표면만 변경하고 저장값은 변경하지 않는다.

**되돌리기:** 신규 단건 endpoint/라우트/열을 제거한다. DB 변경 없음.

### 3.7 S2-B — 회계전표 정정·무효·연결해제·재연결

**채우는 규칙:** 11.

**변경 대상:**

- 수정: `SalesAccountingSlip.java`, `PurchaseAccountingSlip.java`의 기존 `voidSlip()` 호출 경로
- 수정: 매출·매입 Controller/Service/API/목록 액션
- 수정: ErrorCode에 조사에서 누락된 `SAS_SALES_SLIP_VOID` 계열 계약
- 수정: 세금계산서 연결/취소 서비스, 후보 쿼리
- 테이블: 기존 `is_deleted`, `status=VOIDED`, `tax_invoice_id`; Q6 결정에 따라 additive audit/reason 컬럼만 검토
- 테스트 신규 제안: DRAFT/POSTED/LINKED별 상태 전이 표, 취소→재생성→재연결 E2E

**착수 전 질문:** Q6과 Q9.

**선행 조건:** S2-A. 연결 상태와 3금액을 눈으로 확인할 수 있어야 정정 QA가 가능하다.

**검증:**

- DRAFT, POSTED, LINKED 각각에서 허용/거부되는 정정 동작을 상태표대로 검증.
- 연결 전표의 원문 금액은 직접 수정하지 않음.
- 결정된 순서로 세금계산서 취소/연결해제→회계전표 무효→재생성→재연결 완주.
- 무효 시 원 journal을 삭제하지 않고 S1-B 계약의 역분개가 생성됨.
- 취소된 세금계산서의 `tax_invoice_id` 처리와 후보 복귀가 Q6 결정과 일치.
- 모든 감사 필드와 정정 사유가 남고 hard delete가 없음.

**금액 접촉:** 예, 최고 위험. 잘못된 금액을 되돌리는 공식 경로다.

**되돌리기:** 신규 정정 endpoint를 비활성화하되 이미 무효/역분개된 자료를 원상태로 UPDATE하지 않는다. 필요하면 역분개의 역분개라는 회계 절차로만 복원한다.

### 3.8 S2-C — 외부 선택기의 네 결함 정정

**채우는 규칙:** 3.

**변경 대상:**

- 수정: `SlipRepository.java` 원천 후보 쿼리
- 수정: `SlipAllocationSourceController.java`
- 수정: `slipAllocationSourceApi.ts`
- 수정: `SlipLineAllocationEditor.tsx`
- 수정: `SalesAccountingSlipFormPage.tsx`, `PurchaseAccountingSlipFormPage.tsx`
- 테이블 변경: 없음. 기존 allocation 사용

**선행 조건:** S0-A.

**검증:**

- 후보는 CONFIRMED 상태만 노출.
- 회계전표일과 독립된 원천 검색 시작/종료일 적용.
- 기배분 금액/수량을 차감한 잔여만 선택 가능.
- 서로 다른 품목 2개 선택 시 품목코드가 2개 라인으로 유지.
- 초과배분은 UI와 BE 양쪽에서 차단되며 기존 `SAS_OVER_ALLOCATION` 계약 유지.

**금액 접촉:** 예. 저장 전 배분 금액·수량을 바꾼다.

**되돌리기:** 후보 필터와 에디터 변경을 함께 되돌린다. 이미 생성된 전표 데이터는 수정하지 않는다.

### 3.9 S2-D — 판매/구매전표 상세에서 단건 생성·연결

**채우는 규칙:** 1·2.

**변경 대상:**

- 수정: `SlipDetailPage.tsx`
- 수정/신규: slip-service의 회계 연결 상태 조회 계약
- 수정: accounting-service 매출·매입 생성 endpoint 또는 기존 생성 서비스 adapter
- 재사용: `SalesAccountingSlipCreateAttemptService`, `PurchaseAccountingSlipCreateAttemptService`
- 테이블 후보: 신규 cross-DB FK를 만들지 않는다. 기존 allocation의 원천 자연키로 역방향 조회

**선행 조건:** S2-C, Q1·Q7.

**검증:**

- CONFIRMED OUTBOUND 상세에서 그 전표 한 건만 매출전표로 생성.
- CONFIRMED INBOUND 상세에서 그 전표 한 건만 매입전표로 생성.
- partner_code 누락, 헤더 불일치, 비확정 상태는 기존 4중 검증으로 거부.
- 생성 후 판매/구매전표 상세에 연결 회계전표번호·상태 표시.
- 중복 생성 시 기존 allocation/잔여 계약으로 차단 또는 잔여만 허용.

**금액 접촉:** 예.

**되돌리기:** 상세 액션과 adapter endpoint를 제거한다. 기존 공통 생성 서비스와 데이터는 유지한다.

### 3.10 S2-E — 외부에서 선택 후 복수 생성

**채우는 규칙:** 3.

**변경 대상:**

- 수정: `SalesAccountingSlipFormPage.tsx`, `PurchaseAccountingSlipFormPage.tsx`
- 신규 제안: 매출·매입 bulk create request/response와 endpoint
- 수정: 기존 CreateAttemptService를 건별 호출하는 orchestration service
- 테이블 변경: 없음. 각 회계전표와 allocation을 기존 테이블에 별도 저장

**착수 전 질문:** Q2. 이 계획의 추천은 “원천 전표 N건 선택 → 회계전표 N건 생성”이다. 한 건에 여러 원천 라인을 합치는 것은 기존 allocation 기능으로 별도 유지한다.

**선행 조건:** S2-C, S2-D.

**검증:**

- 원천 전표 3건 선택 시 Q2 결정대로 정확히 3건 또는 1건 생성.
- 각 결과에 성공/실패와 사용자 식별 전표번호 반환.
- 원자성은 Q2 결정에 따라 전부 성공 또는 건별 성공을 명시하고 테스트.
- 품목, 거래처, 원천 전표번호, 배분 잔여가 서로 섞이지 않음.
- 같은 요청 재시도 시 중복 생성 방지.

**금액 접촉:** 예.

**되돌리기:** bulk endpoint/UI만 비활성화한다. 이미 생성된 전표는 S2-B 정정 경로로만 무효화한다.

### 3.11 S2-F — 세금계산서 게이트 일원화와 역방향 확인

**채우는 규칙:** 9·10.

**변경 대상:**

- 수정: `TaxInvoiceController.java`, `TaxInvoiceService.java`, `TaxInvoiceEmitService.java`
- 수정: `HometaxExportService.java`
- 수정: 판매전표 상세 계산서 출력 경로
- 수정: `TaxInvoiceRepository.java`
- 재사용: `findPostedUnlinkedForBatchCandidates`, `findByTaxInvoiceId`
- 수정: 세금계산서 메뉴/상세 화면
- 테이블 변경: 원칙적으로 없음. 기존 연결 필드 사용

**착수 전 질문:** Q3, Q3-b, Q9.

**선행 조건:** S2-B. 기존 위반 자료를 정리하고 재연결할 수단이 먼저 있어야 한다.

**검증:**

- 결정된 발행 범위의 모든 경로에 양방향 테스트: 연결 POSTED 회계전표는 통과, 미연결은 동일 오류코드로 차단.
- 신규작성, issue-request, issue, emit-nts, 홈택스 양식, 계산서 출력 중 Q3에서 발행으로 정의된 경로 전수.
- 미연결 자료가 메뉴 후보 목록에 나타나지 않음.
- 연결된 자료의 세금계산서 상세에서 회계전표번호 확인.
- 기존 미연결 18건/ISSUED 12건은 Q9에서 정한 소급 정책대로 처리하며 조용히 숨기거나 삭제하지 않음.

**금액 접촉:** 직접 금액 산식은 아니지만 세금계산서 발행 가능성을 바꾸는 고위험 변경이다.

**되돌리기:** 중앙 게이트를 feature flag로 비활성화해 기존 경로를 복구할 수 있게 한다. 기존 연결 데이터는 유지한다. 소급 정리 데이터는 삭제하지 않고 상태/감사 기록으로 남긴다.

### 3.12 S3-A — 일마감 할인 판단의 대상·조치 계약

**채우는 규칙:** 5.

**변경 대상:**

- 수정: `DailyClosingService.java`, `MonthEndCloseService.java`
- 재사용: `DiscountRevalidator`, `LegacyVerificationChain`, `LegacySetMatcher`, `RiUsageDecision`
- 수정: `DailyClosingPage.tsx`
- 테이블 후보: `bundle_component` 또는 별도 가격 이력. Q8 확정 전 migration 금지

**착수 전 더 잴 것:** M5로 싱글 구성품 시트의 두 납품가 물리 컬럼과 현행 적재 컬럼을 대조한다. M6로 `model_name`이 채워진 실제 판정 가능 표본을 실 화면 경로로 만든다.

**착수 전 질문:** Q5, Q8.

**선행 조건:** 없음으로 설계할 수 있으나 실제 배포는 S2 금액/정정 계약 뒤에 둔다.

**검증:**

- INDOOR/OUTDOOR 542행의 0원 원인이 측정 결과대로 해소되는지 검증.
- 레거시와 동일한 입력 fixture에서 `LegacySetMatcher` 결과 일치.
- 판매/구매전표가 회계전표 생성 전 판정 대상에 포함.
- `verified=false`에서 Q5가 정한 차단/경고/정정 동작이 발생.
- 기존 세금계산서/회계전표 판정 결과 회귀 없음.

**금액 접촉:** 예, 할인율·할인액 판단에 직접 닿는다.

**되돌리기:** 판정 대상 확장과 게이트를 feature 단위로 끈다. 새 가격 컬럼이 additive라면 유지하되 기존 엔진이 읽지 않게 한다. 이미 마감된 자료를 자동 재계산하지 않는다.

### 3.13 S3-B — 일마감에서 회계전표 생성·연결

**채우는 규칙:** 4·5.

**변경 대상:**

- 수정: `DailyClosingController.java`, `DailyClosingService.java`
- 수정: `DailyClosingPage.tsx`
- 재사용: S2-D 단건 생성, S2-E 일괄 orchestration, S3-A 판정 결과
- 테이블 후보: `daily_closings`에 직접 FK를 추가하기보다 기존 allocation 역조회 우선. 실행 이력 필요 여부는 M7에서 측정

**선행 조건:** S2-D, S2-E, S3-A.

**검증:**

- 일마감 화면에서 대상 판매/구매전표와 판단 결과 확인.
- 적격 대상 선택→회계전표 생성→연결→목록/상세/마감 집계 반영을 한 흐름으로 완주.
- `verified=false`는 Q5 정책대로 처리.
- 같은 날짜·같은 원천 재실행 시 중복 생성 없음.
- 잠긴 마감일의 생성 허용 여부를 M7 측정 및 결정대로 검증.

**금액 접촉:** 예.

**되돌리기:** 일마감 액션과 orchestration을 비활성화한다. 생성된 회계전표는 S2-B 경로로만 정정한다.

### 3.14 S4-A — 출금보고서 라이브 도메인

**채우는 규칙:** 12.

**변경 대상:**

- 재사용/확장 후보: `cash_disbursements`, `CashDisbursement.java`
- 신규 제안: 현행 사용자용 CashDisbursement Controller/Service/DTO/Repository
- 신규 제안: 출금보고서 목록·상세·편집 페이지와 API client
- 수정: `routes/index.tsx`, `AppLayout.tsx`, `PermissionMatrixPage.tsx`, `permissionsApi.ts`
- 신규 migration 제안: 기존 `cash_disbursements`를 입금보고서와 대칭인 상태·계정·version·reverse journal·lines JSON 계약으로 확장
- auth migration: `accounting.cash-disbursements` PageCode를 MASTER/MANAGER/ACCOUNTANT에 VIEW/CREATE/UPDATE/DELETE로 시드

**착수 전 더 잴 것:** 구형 `cash_disbursements` 컬럼과 BaseEntity 상속 상태를 현행 입금보고서 live schema와 열 단위로 대조한다. 구형 MIG API가 새 상태 컬럼을 어떻게 채울지 호환 규칙을 정한다.

**착수 전 질문:** Q11~Q13.

**선행 조건:** S1-B의 분개/역분개/idempotency 패턴.

**검증:**

- DRAFT 생성, 목록, 상세, 수정, 확정, 취소, DRAFT soft-delete 전이표.
- 총액과 거래처 분할행 합계 일치, 0/음수 거부.
- 전표번호와 거래처명 표시, UUID 비노출.
- 권한 VIEW/CREATE/UPDATE/DELETE 행렬.
- 기존 구형 MIG 관리자 경로 회귀 또는 명시적 격리.

**금액 접촉:** 예.

**되돌리기:** 사용자용 route/API를 비활성화한다. additive migration 컬럼은 유지한다. 확정 자료는 삭제하지 않고 취소/역분개한다.

### 3.15 S4-B — 통장 출금 선택→출금보고서 반영

**채우는 규칙:** 13·14.

**변경 대상:**

- 수정: `BankTransactionPage.tsx`
- 수정: `BankTransactionController.java`, `BankTransactionService.java`
- 신규 제안: `BankWithdrawalDisbursementService`
- 테이블: `bank_transaction`에 출금보고서 연결 식별자와 FK/unique 제약 후보
- 재사용: 기존 `matched_partner_id`, 자연키 기반 match-partner API

**선행 조건:** S4-A.

**검증:**

- WITHDRAWAL 미반영 행만 선택 가능, DEPOSIT은 출금보고서 액션에서 제외.
- 선택 출금 N건→출금보고서 생성→즉시 확정 여부는 Q12 결정대로 동작.
- 보고서 거래처는 각 출금행에 설정한 거래처를 보존. `(주)삼한공조시스템`도 일반 거래처 선택으로 처리하며 self flag를 추가하지 않음.
- 성공 시 `UNREFLECTED→REFLECTED`와 보고서 연결이 같은 트랜잭션에서 일어남.
- 취소 시 통장행이 다시 `UNREFLECTED`로 복귀.
- 같은 거래를 두 번 반영할 수 없음.

**금액 접촉:** 예.

**되돌리기:** 신규 생성 액션을 막고, 이미 반영된 행은 출금보고서 취소→역분개→UNREFLECTED 복귀 절차로만 되돌린다.

### 3.16 S4-C — 출금 분개와 채무 원장 반영

**채우는 규칙:** 13·14 및 규칙 6·8과의 정합.

**변경 대상:**

- 신규/수정: 출금보고서 분개 게시·역분개 서비스
- 수정: `PartnerLedgerReadModelService.java`, `PartnerAgingService.java`, `ReceivablesPayablesService.java`
- 테이블: `cash_disbursements.journal_id/reverse_journal_id`, `journals`, `journal_lines`
- 구형 `Mig9CashJournalService.java`는 live 경로에서 재사용하지 않고 호환성만 검토

**착수 전 질문:** Q11에서 출금이 채무 소멸인지 비용/자산/대출 상환인지 확정한다. Q13에서 거래처 의미를 확정한다.

**선행 조건:** S4-A, S4-B, S1-B.

**검증:**

- 결정된 계정 조합으로 차변=대변.
- 채무 지급인 경우 201/210 잔액이 지급액만큼 감소.
- 비용/자산/대출 거래이면 채무를 임의로 감소시키지 않고 선택된 상대 계정에 반영.
- 거래처별 문서원장에는 출금보고서가 한 번만 나타나며 journal 중복 집계 없음.
- 취소 역분개 후 원장·에이징·통장 상태가 원복.
- 구형 지급수수료/보통예금 고정 분개를 live 기본값으로 복사하지 않음.

**금액 접촉:** 예, 최고 위험.

**되돌리기:** 신규 게시 중단 후 역분개만 허용한다. 이미 게시된 journal/line을 hard delete하거나 UPDATE하지 않는다.

### 3.17 S5-A — 계좌·카드·대출별 서버 조회 계약

**채우는 규칙:** 15·16.

**변경 대상:**

- 수정: `BankTransactionController.java`, `BankTransactionService.java`, `BankTransactionRepository.java`
- 수정: `BankTransactionResponse.java`는 필요 시 표시 필드만 추가
- 테이블: `bank_transaction` 읽기. `user_bank_txn_filter`와 `user_codef_import_scope`는 서로 독립 유지

**착수 전 질문:** Q14·Q15.

**선행 조건:** S4-B. 세 메뉴 모두 같은 입금/출금 반영 액션을 재사용한다.

**실행 원칙:** 현재 FE 탭 필터만으로 끝내지 않고 source 분류를 서버 파라미터로 올린다. 계좌=`CSV_IMPORT`,`KFTC`,`CODEF_BANK`, 카드=`CODEF_CARD`, 대출=`CODEF_LOAN` 계약을 테스트로 고정한다. 조회 필터와 CODEF 가져오기 선택은 의미가 다르므로 합치지 않는다.

**검증:**

- 조사 fixture 기준 계좌 206, 카드 65, 대출 45가 서로 중복 없이 분류되고 합계 316.
- 출금은 계좌 41, 카드 65, 대출 45로 분류되고 합계 151.
- 기간/상태/거래처 조건과 source 조건이 서버에서 함께 적용.
- 종류별 모든 페이지를 합친 결과가 기존 전체 조회와 동일.
- 사용자별 조회 필터를 적용할지 무시할지는 Q14 결정대로 테스트.

**금액 접촉:** 저장 금액은 바꾸지 않지만 조회 누락/중복에 닿는다.

**되돌리기:** source 파라미터를 optional로 유지해 기존 전체 endpoint로 즉시 복귀한다.

### 3.18 S5-B — 입출금내역 3메뉴

**채우는 규칙:** 15·16.

**변경 대상:**

- 수정: `BankTransactionPage.tsx`를 source를 입력받는 공용 화면으로 정리
- 수정: `routes/index.tsx`
- 수정: `AppLayout.tsx`
- 수정: `PermissionMatrixPage.tsx`, `permissionsApi.ts`는 Q15에서 권한 분리를 선택한 경우만
- 테이블 변경: 원칙적으로 없음. 권한 분리 시 auth migration만 추가

**추천 구조:** `/accounting/bank-transactions/bank`, `/card`, `/loan` 세 라우트와 세 사이드바 메뉴가 하나의 공용 화면/테이블/액션을 재사용한다. 규칙에 별도 권한 요구가 없으므로 기본 추천은 기존 `accounting.bank-matching` PageCode 재사용이다. 이렇게 하면 권한 migration 없이 메뉴만 분리되고 기존 계정의 접근권한이 보존된다.

**선행 조건:** S5-A.

**검증:**

- 세 메뉴가 각 source만 서버에서 조회하며 FE 후처리만으로 숨기지 않음.
- 각 메뉴의 등록 대상 전체가 Q14 정본과 일치.
- 계좌 메뉴의 계좌 필터, 카드 메뉴의 카드 필터, 대출 메뉴의 필요한 필터 동작을 각각 확인.
- CODEF 가져오기 폼을 어디에 둘지는 Q14 결정대로 중복 없이 제공.
- 기존 `/accounting/bank-transactions`는 호환 리다이렉트 또는 전체 보기로 유지해 북마크를 깨지 않음.
- 입금보고서/출금보고서 생성 액션이 세 메뉴에서 동일 계약으로 동작.

**금액 접촉:** 직접 저장 금액은 바꾸지 않는다. 조회 누락 방지가 핵심이다.

**되돌리기:** 세 라우트/메뉴를 숨기고 기존 단일 라우트로 되돌린다. 공용 화면과 서버 source 파라미터는 호환 기능으로 남길 수 있다.

## 4. 착수 전 확인이 필요한 것

이미 확정된 자기 회사 플래그 불요, 바로빌과 규칙 15·16의 무관성, #922 범위, CODEF DRY_RUN은 다시 묻지 않는다.

### 4.1 업무 질문

| 번호 | 질문 | 막는 묶음 |
|---|---|---|
| **Q1** | 명세의 판매전표=코드의 OUTBOUND(출고전표), 구매전표=INBOUND(입고전표)로 확정해도 됩니까? | S2-D 이후 용어/대상 |
| **Q2** | “선택 후 복수 생성”은 (a) 원천 전표 N건→회계전표 N건, (b) 원천 N건→회계전표 1건 중 어느 것입니까? 추천은 (a)입니다. | S2-E |
| **Q3** | 규칙 10의 “발행”은 ISSUED, NTS 전송, 홈택스 xlsx, 계산서 출력 중 어디까지입니까? | S2-F |
| **Q3-b** | “세금계산서 메뉴”는 세금계산서·발행 묶음·수신·홈택스 일괄 양식 중 어느 메뉴를 포함합니까? | S2-F |
| **Q4** | 규칙 8의 정본은 (a) 거래처별 문서원장만, (b) 채권채무 현황·총계정원장까지 모두입니까? 채무는 기존 거래처 원장의 탭/열로 둘까요? 추천은 모든 회계 표면의 인과를 설명 가능하게 하되, 문서원장은 전표 즉시·총계정원장은 POST 분개 기준으로 역할을 분리하는 것입니다. | S1-A·B |
| **Q4-b** | “원장 반영”은 매출/매입·입금/출금 금액 표시만입니까, 채권/채무 잔액 산식까지입니까? | S1-A |
| **Q5** | 일마감의 `확인=false`에서 회계담당자가 해야 할 조치는 (a) 생성/마감 차단, (b) 경고 후 강제 진행, (c) 할인값 수동 정정 중 무엇입니까? | S3-A·B |
| **Q6** | 규칙 11의 삭제는 soft-delete, `VOIDED`, 또는 둘 다 중 무엇입니까? 연결된 세금계산서는 먼저 취소해야 합니까? 취소 후 연결을 풀어 재발행 후보로 복귀시킵니까? | S2-B |
| **Q7** | 회계전표 금액은 원 전표 금액에서만 파생해야 합니까, 회계담당자가 배분 수량·단가를 조정할 수 있습니까? | S2-C·D |
| **Q8** | 싱글 구성품의 첫/둘째 납품가 중 어느 것이 `products.delivery_price`이며, (세트, 구성품) 문맥의 둘째 값을 어디에 보존해야 합니까? | S3-A |
| **Q9** | 기존 미연결 세금계산서 18건(ISSUED 12건)은 (a) 소급 연결, (b) 기존자료 예외, (c) 취소 후 재생성 중 어떻게 처리합니까? | S2-B·F |
| **Q10** | 매출전표 POST 분개와 매입전표 POST 분개의 정확한 상대 계정 및 VAT 계정은 무엇입니까? 세금계산서 발행 시 현행 110 분개는 제거하는 것이 맞습니까? | S1-B |
| **Q11** | 출금보고서 확정은 모든 출금을 채무 지급으로 봅니까, 아니면 지급수수료·비용·자산·대출상환 등 상대 계정을 회계담당자가 선택합니까? 추천은 상대 계정 선택이며 201/210일 때만 채무를 줄이는 방식입니다. | S4-A·C |
| **Q12** | 통장 출금 선택 시 입금처럼 보고서를 즉시 확정합니까, DRAFT를 만든 뒤 회계담당자가 확인 후 확정합니까? 추천은 DRAFT 생성 후 확인입니다. | S4-B |
| **Q13** | 출금행에 설정한 거래처는 (a) 지급 상대방, (b) 비용/자산의 귀속 거래처, (c) 통장 소유 법인 중 어느 의미입니까? 우리 회사법인이 대부분이라는 사실만으로 분개 상대방 의미를 추정하지 않습니다. | S4-A~C |
| **Q14** | 규칙 16의 “등록된 것 전부” 정본은 (a) CODEF 외부 목록, (b) 이카운트 `bank_accounts/card_master`, (c) 등록기관, (d) 거래가 존재하는 distinct label 중 무엇입니까? | S5-A·B |
| **Q15** | 세 메뉴의 권한은 기존 `accounting.bank-matching`을 공용으로 쓸까요, 종류별로 분리할까요? 추천은 별도 요구가 없으므로 공용 재사용입니다. | S5-B |

### 4.2 구현 전 더 재야 할 것

이 항목들은 새 조사를 지금 수행하라는 뜻이 아니라, 해당 묶음 착수 직전의 측정 게이트다.

- **M1:** journal source/source_ref/idempotency 및 회계전표↔분개 연결 방식.
- **M2:** 회계전표 라인 계정코드와 매출/매입/VAT 상대계정 매핑.
- **M3:** 기존 세금계산서 110 분개의 회계전표 연결 가능성·중복 건수.
- **M4:** 변경 직전 110/120/201/210 잔액, 거래처별 합계, POSTED/REVERSED 건수 기준선.
- **M5:** 싱글 구성품 시트의 두 납품가 물리 컬럼과 현행 적재 결과.
- **M6:** `model_name`이 있는 일마감 할인 판정 실표본.
- **M7:** 회계기간/일마감 lock 상태에서 회계전표 생성 허용 여부와 실행 이력 저장 필요성.
- **M8:** 기존 `cash_disbursements`와 live `cash_receipts` 스키마/상태/감사 필드 차이.
- **M9:** 프런트 decimal 유틸의 원 단위 절사 일치 여부.
- **M10:** Q14에서 선택한 등록 정본의 실제 조회 가능성과 0건 처리 화면.

## 5. 위험과 되돌리기 원칙

### 5.1 공통 위험

1. **이중계상:** 판매/구매전표를 문서원장에서 직접 읽으면서 회계전표 분개도 더하면 같은 거래가 두 번 잡힐 수 있다.
2. **조용한 누락:** source/status/기간/거래처 필터를 FE와 BE가 다르게 적용하면 일부 행이 에러 없이 사라진다.
3. **부분 성공:** 상태 POSTED/CONFIRMED는 바뀌었는데 journal이 없거나, 통장행은 REFLECTED인데 보고서가 없을 수 있다.
4. **역분개 훼손:** 확정 자료를 UPDATE/DELETE하면 감사 추적과 대차가 깨진다.
5. **기존 위반자료 잠금:** 세금계산서 게이트를 즉시 강화하면 미연결 18건의 조회·정정 경로가 막힐 수 있다.
6. **권한 회귀:** PageCode를 늘리거나 바꾸면 기존 role/group/account materialize 중 일부만 갱신될 수 있다.
7. **필터 의미 혼합:** `user_bank_txn_filter`는 조회, `user_codef_import_scope`는 가져오기 대상이다. 합치면 데이터 수집과 표시가 서로 오염된다.

### 5.2 무결성 가드

- 원장·분개 변경 전과 후에 같은 기준시각의 계정별 차변·대변·잔액과 거래처별 합계를 비교한다.
- 모든 확정/POST/취소는 상태와 journal 연결을 하나의 트랜잭션으로 처리한다.
- 재시도 자연키를 두어 journal 중복을 구조적으로 막는다.
- 확정 후 수정은 원 journal 변경이 아니라 역분개+새 분개만 허용한다.
- 실제 데이터 보정은 별도 감사 가능한 migration/관리 명령으로 수행하고 제품 로직 배포와 섞지 않는다.
- 새 원장 경로는 “신규 값이 맞다”뿐 아니라 “기존 채권 359,003,920원이 변하지 않는다” 같은 음성 회귀를 함께 통과해야 한다.

### 5.3 묶음별 되돌리기 요약

| 묶음 | 되돌리기 |
|---|---|
| S0-A VAT | FE/Mock만 원복. DB 변경 없음 |
| S0-B 권한 | FE/BE 코드를 같이 원복, 권한 migration은 후속 보정 migration |
| S1-A 채무 원장 | INBOUND read projection/UI 제거. DB 변경 없음 |
| S1-B 분개 | 신규 게시 차단; 이미 게시된 자료는 역분개, hard delete 금지 |
| S2-A 상세 | endpoint/route 제거. DB 변경 없음 |
| S2-B 정정 | endpoint 차단; 이미 생긴 VOID/역분개는 다시 UPDATE하지 않음 |
| S2-C~E 생성 | 신규 액션 비활성화; 생성 자료는 S2-B 공식 경로로 무효 |
| S2-F 게이트 | 중앙 게이트 flag 해제; 연결 데이터 유지 |
| S3 일마감 | 신규 액션/게이트 비활성화; 생성 자료는 회계전표 정정 경로 사용 |
| S4 출금 | 신규 생성 중단; 확정 건은 취소·역분개·통장 UNREFLECTED 복귀 |
| S5 메뉴 | 세 메뉴 숨김/리다이렉트 후 기존 단일 화면 복귀 |

## 6. 슬라이스별 최종 검증 게이트

각 슬라이스는 다음 증거가 모두 있어야 다음으로 넘어간다.

1. 관련 서비스의 단위·통합 테스트 통과.
2. FE 타입체크와 해당 화면 컴포넌트 테스트 통과.
3. PageCode VIEW/CREATE/UPDATE/DELETE 행렬 테스트.
4. 금액 묶음은 사전/사후 SQL 기준선 대조와 대차 합계 0.
5. 실 화면에서 사용자 식별자만 사용한 정상/거부 경로 캡처.
6. 회귀: 기존 입금보고서 3건/277,000원 계약, 기존 채권 원장 기준값, 기존 전체 입출금 합계가 의도 없이 변하지 않음.
7. README·ROADMAP·DECISIONS·해당 dev-report를 같은 슬라이스에서 동기화.

## 7. 확정하지 못한 것

- 회계전표 POST가 만들 정확한 계정 조합과 VAT 계정.
- 거래처별 원장, 채권채무 현황, 총계정원장 중 규칙 8이 요구하는 정본 범위.
- 외부 일괄의 “복수”가 N건 생성인지 1건 합산인지.
- 세금계산서 “발행”과 “세금계산서 메뉴”의 정확한 범위.
- 회계전표 삭제의 업무 의미와 연결된 세금계산서 취소/연결해제 순서.
- 기존 미연결 세금계산서 18건의 소급 정책.
- 일마감 `verified=false`의 후속 조치와 두 번째 납품가 저장 정본.
- 출금보고서의 상대 계정, 거래처 의미, 즉시 확정 여부.
- 규칙 16의 “등록된 것” 정본과 세 메뉴 권한 분리 필요 여부.
- 프런트 원 단위 절사 유틸, journal 멱등키, 구형 `cash_disbursements`의 live 확장 가능성은 보고서에 없어 착수 전 측정해야 한다.

이 항목들은 구현자가 임의로 정하지 않는다. Q1~Q15 답변과 M1~M10 측정 결과를 해당 슬라이스의 계약 테스트에 먼저 고정한다.

## 8. 신규 파일 목록

### 이번 계획 라운드에서 실제 생성

- `docs/dev-reports/2026-08-08-1144-implementation-plan.md`

### 구현 시 신규 생성 제안

정확한 Java package와 테스트 디렉터리는 해당 서비스의 기존 동형 파일 위치를 착수 시 확인해 따른다. 아래는 책임 단위 기준 이름이며, 기존 동형 파일이 있으면 새 파일을 만들지 않고 확장한다.

- 매출·매입 회계전표 상세 페이지 2개와 해당 컴포넌트 테스트
- 회계전표 bulk create request/response/orchestration service와 테스트
- 회계전표↔분개 게시/idempotency 서비스와 통합 테스트
- INBOUND 거래처 원장 projection/client 계약 테스트
- 출금보고서 Controller/Service/DTO/Repository와 단위·통합 테스트
- 출금보고서 목록·상세·편집 페이지/API client와 컴포넌트 테스트
- `BankWithdrawalDisbursementService`와 통합 테스트
- 출금보고서 live-domain Flyway migration 1개 이상
- `accounting.cash-disbursements` 권한 seed Flyway migration 1개
- 계좌·카드·대출 route별 테스트와 서버 source 필터 통합 테스트

Flyway 번호는 이 계획에서 추정하지 않는다. 구현 착수 시 해당 DB의 최신 migration 번호를 측정한 뒤 충돌 없는 다음 번호로 확정한다.
