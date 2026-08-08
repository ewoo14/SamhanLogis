# 이슈 #1144 추가분 — 입출금내역 계좌·카드·대출 메뉴 현행 전수 조사

> 조사 시각: 2026-08-08 23:15 KST  
> 조사 범위: 저장소 현행 코드·Flyway 스키마·실행 중 로컬 `accounting_db`  
> 조사 방식: 코드 읽기 및 PostgreSQL `BEGIN TRANSACTION READ ONLY` 안의 `SELECT`만 사용  
> 금지사항 준수: `git` 명령, DB 쓰기, Docker 재기동·재배포, 제품 코드 변경 없음

## 0. 결론 요약

1. 현행 데스크톱에는 회계 사이드바의 **`입출금 내역` 단일 메뉴**가 있다. 라우트는 `/accounting/bank-transactions`, 화면은 `BankTransactionPage.tsx`, 권한 코드는 `accounting.bank-matching`이다.
2. 단일 화면 내부에는 이미 **`전체 · 계좌 · 카드 · 대출` 원천 탭**이 있다. 다만 라우트와 메뉴, 권한은 하나이며 탭 필터는 서버 쿼리 파라미터가 아니라 조회된 행에 대한 프런트 필터다.
3. “몇 개를 체크”할 수 있는 기제는 둘이다.
   - 조회 결과를 좁히는 **계좌/카드 필터 모달**: 사용자별 `user_bank_txn_filter`에 저장된다. 대출은 필터 UI가 없고 필터에서 면제된다.
   - CODEF에서 거래를 가져올 대상을 정하는 **계좌/카드/대출 가져오기 선택**: 사용자별 `user_codef_import_scope`에 저장되고, 실제 외부 조회 ref를 제한한다.
4. 두 체크 방식 모두 성능 또는 “담당 계좌만” 업무 규칙 때문에 도입했다는 근거는 찾지 못했다. 확인된 도입 근거는 각각 “사용자별 조회 기본값”과 개발책임자의 “전체 또는 특정 항목 다중 선택을 사용자별 저장” 요구다. 다만 가져오기는 ref마다 외부 조회를 반복하며 총 선택 상한 50개가 존재한다. 이것이 선택 UI의 **도입 이유**라는 근거는 없다.
5. 실 DB의 활성 거래 316건은 계좌 206건, 카드 65건, 대출 45건으로 구분 가능하다. 문제의 출금 151건도 **계좌 41건·카드 65건·대출 45건**으로 판정 가능하며 전부 `UNREFLECTED`, 거래처 지정 0건이다.
6. 등록 마스터 후보의 실측은 `bank_accounts=0`, `card_master=0`, `codef_registered_institution=0`이다. 대출 전용 마스터 테이블은 없다. 따라서 표본 0 원칙에 따라 “등록 마스터가 실운영된다”는 판정은 불가하다.

---

## 1. 현행 입출금내역 메뉴

### 1.1 위치

| 층 | 현행 | 근거 |
|---|---|---|
| 사이드바 | 회계 그룹의 `입출금 내역` | `clients/desktop/src/renderer/components/AppLayout.tsx:1223-1229` |
| 데스크톱 라우트 | `/accounting/bank-transactions` | `clients/desktop/src/renderer/routes/index.tsx:858-864` |
| 화면 | `clients/desktop/src/renderer/routes/BankTransactionPage.tsx`의 `BankTransactionPage` | `BankTransactionPage.tsx:527-545` |
| 목록 API | `GET /accounting/bank-transactions` | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/BankTransactionController.java:39-46,81-95` |
| 필터 설정 API | `GET/PUT /accounting/bank-transactions/filter-preferences` | 같은 파일 `:97-113` |
| 필터 선택지 API | `GET /accounting/bank-transactions/filter-labels` | 같은 파일 `:116-121` |
| CSV 적재 API | `POST /accounting/bank-transactions/import` | 같은 파일 `:51-78` |
| CODEF 목록/적재/선택 API | `GET /accounting/codef/bank-accounts|cards|loans`, `POST /accounting/codef/import-scoped`, `GET/PUT /accounting/codef/scopes` | `CodefImportController.java:39-47,54-103,122-164` |
| 거래 테이블 | `public.bank_transaction` | `V43__add_bank_transaction.sql:11-40` |
| 조회 필터 설정 테이블 | `public.user_bank_txn_filter` | `V54__add_user_bank_txn_filter.sql:11-30` |
| CODEF 가져오기 선택 테이블 | `public.user_codef_import_scope` | `V46__add_user_codef_import_scope.sql:11-37` |

게이트웨이는 `/accounting/**`를 accounting-service로 전달하는 포괄 라우트다(`services/api-gateway/src/main/resources/application.yml:629-633`). 현행 메뉴가 셋으로 분리돼 있지는 않다.

### 1.2 무엇을 보여주는가

#### 목록의 주 열

현행 열 정의의 단일 출처는 `BANK_TRANSACTION_LIST_COLUMN_DEFINITIONS`다(`BankTransactionPage.tsx:335-342`). 실제 열은 다음 순서다.

| 열 | 표시 조건·내용 | 근거 |
|---|---|---|
| 선택 | 입금보고서 생성 가능 거래만 체크 가능 | `BankTransactionPage.tsx:343-365` |
| 거래일 | 거래 일시 | `:367-373` |
| 적요 | 적요, 상대방명, 계좌·카드·대출 표시 label을 3줄로 표시 | `:374-395` |
| 거래처 | 미반영 거래는 거래처 검색/지정·해제. 대출은 “거래처 매칭 대상 아님” | `:396-459` |
| 입금 | 입금 거래 금액 | `:461-468` |
| 출금 | 출금 거래 금액 | `:469-476` |
| 잔액 | 거래 후 잔액 | `:477-487` |
| 소스 | `전체` 원천 탭에서만 표시 | `:489-496` |
| 매칭상태 | `전체` 상태 탭에서만 표시 | `:497-508` |
| 상세 | 상세 패널 열기 | `:509-520` |

상세 패널에는 거래 유형, 계좌·카드·대출 label, 상대 계좌, 소스, 법인카드명, 승인번호, 대출명, 입금보고서 전표번호, 매칭 근거, 입금자명 원문이 나온다(`BankTransactionPage.tsx:281-292`). API 응답은 UUID를 반환하지 않고 거래일·유형·금액·잔액·적요·상대방·표시 label·source·카드/대출 필드·매칭상태·거래처 표시 식별자·전표번호 등을 반환한다(`BankTransactionResponse.java:11-34`).

#### 탭·필터·기간

- 상태 탭: `전체`, `미반영`, `반영`, `강제` (`BankTransactionPage.tsx:78-83`). 서버의 `matchStatus` 조건으로 전달된다(`:663-679`; `BankTransactionController.java:86-94`).
- 원천 탭: `전체`, `계좌`, `카드`, `대출` (`BankTransactionPage.tsx:85-90`). 서버에 source 파라미터를 보내지 않고, 받은 행을 프런트에서 `row.source`로 거른다(`:727-731`). 즉 현행에도 종류 구분 탭은 있지만 메뉴·라우트는 하나다.
- 기간: 시작일·종료일. 초기값은 **현재 월 1일~오늘**이다(`BankTransactionPage.tsx:540-545,984-990`). 서버는 시작일 00:00 이상, 종료일 다음 날 00:00 미만으로 적용한다(`BankTransactionService.java:439-451`).
- 계좌 필터 버튼과 카드 필터 버튼이 별도로 있고, 조회·초기화가 있다(`BankTransactionPage.tsx:992-1027`). 대출 필터 버튼은 없다.
- 상단에는 별도의 CODEF “거래내역 가져오기” 폼이 있으며 시작일·종료일·범위(전체/계좌/카드/대출), 저장, 가져오기를 제공한다(`CodefImportScopeForm.tsx:716-779`).

### 1.3 권한 코드

- 페이지 코드: **`accounting.bank-matching`** (`BankTransactionController.java:46`; `CodefImportController.java:47`; 라우트 guard `routes/index.tsx:861`).
- `VIEW`: 화면 진입, 거래 목록, 필터 설정/label, CODEF 계좌·카드·대출 목록과 저장 선택 조회.
- `CREATE`: CSV/CODEF 거래 가져오기.
- `UPDATE`: 조회 필터 설정 저장, CODEF 가져오기 선택 저장, 거래처 지정·해제.
- `DELETE`: 이 페이지 코드 자체에는 기본 부여되지 않는다. 입금자명 매핑까지 삭제하는 화면 동작은 별도 `accounting.deposit-mapping:DELETE`도 요구한다(`BankTransactionPage.tsx:531-537`).
- 초기 권한 시드는 `MASTER`, `MANAGER`, `ACCOUNTANT`에 `VIEW/CREATE/UPDATE=TRUE`, `DELETE/RESTORE/DOWNLOAD/PRINT=FALSE`다(`V67__seed_accounting_bank_matching_page_permission.sql:1-6,34-68`). 실제 사용자 유효 권한은 이후 그룹·계정 설정에 따라 달라질 수 있다.

---

## 2. “계좌 몇 개를 체크” 하는 기제

## 2.1 기제 A — 입출금 목록 조회 필터

### 정확히 무엇인가

조회 결과를 좁히는 **필터 UI + 사용자별 설정 + 서버 쿼리 조건**의 결합이다. 권한 자체가 아니며, 계좌 접근 통제도 아니다.

1. 화면의 `계좌`/`카드` 버튼이 체크박스 모달을 연다(`BankTransactionPage.tsx:779-795,992-1009`).
2. 모든 label을 체크하면 빈 배열로 정규화하며, 빈 배열은 “전체/무필터”다(`BankTransactionPage.tsx:806-825`; `BankTransactionFilterModalModel.ts:39-49`).
3. 저장값은 `user_bank_txn_filter.account_labels`, `card_labels` JSON 배열이다. 활성 행은 `user_id`별 하나다(`V54__add_user_bank_txn_filter.sql:11-15,33-42`). 따라서 **사용자별**이다.
4. 현재 실 DB에는 활성 설정 1행이 있고, 저장 계좌 label 2개·카드 label 0개다. UUID와 실제 금융 label은 보고서에 노출하지 않았다.
5. 서버 조건은 계좌 label을 `CSV_IMPORT/CODEF_BANK`에만, 카드 label을 `CODEF_CARD`에만 적용한다. 대출과 KFTC는 필터에서 면제돼 항상 포함된다(`BankTransactionService.java:76-83,197-207,452-465`).
6. 필터 선택지 자체는 등록 마스터가 아니라 **이미 존재하는 거래행의 distinct `bank_account_label`**이다(`BankTransactionRepository.java:54-76`).

### 왜 만들었는가

- 확인된 직접 근거: 이슈 #722 기반으로 “계좌/카드 필터 모달(사용자별 기본값)”을 만들었다는 구현 보고(`docs/dev-reports/2026-07-04-bank-card-admin-filter.md:1-8`). 사양은 가져오기 범위와 독립된 사용자별 필터를 명시한다(`docs/superpowers/specs/2026-07-04-bank-card-admin-filter.md:9-10,18-20`).
- 저장된 부분선택을 그대로 복원해야 “계좌 N개만 보기”가 된다는 코드 주석이 있다(`BankTransactionFilterModalModel.ts:16-26`).
- **성능 때문에 만들었다는 근거 없음.**
- **담당 계좌만 보게 하는 업무 규칙 또는 권한 경계라는 근거 없음.**
- 필터를 없애면 과거의 어떤 성능/담당계좌 문제가 돌아온다는 코드·주석·마이그레이션 근거는 찾지 못했다.

## 2.2 기제 B — CODEF 거래내역 가져오기 선택

### 정확히 무엇인가

CODEF에서 거래를 가져올 **실행 대상 선택 UI + 사용자별 저장 + 외부 조회 ref 목록**이다. 단순 화면 필터나 권한이 아니다.

1. 범위를 전체/계좌/카드/대출로 고르고, 각 범주에서 “전체 선택” 또는 개별 계좌·카드·대출을 체크한다(`CodefImportScopeForm.tsx:741-756,890-935`). 별도 `전체` 칩도 있다(`:940-953`).
2. `SELECTED`면 선택 ref를 전송하고, `ALL`이면 서버가 CODEF 계좌·카드·대출 목록을 열거한다(`CodefImportScopeForm.tsx:437-512`; `CodefImportScopedService.java:93-116,119-136`).
3. 저장 위치는 `user_codef_import_scope`다. `user_id + connected_id` 활성 unique이며 계좌·카드·대출 ref JSON, 기본 가져오기 종류, `scope_mode`, 낙관적 잠금 `version`을 가진다(`V46__add_user_codef_import_scope.sql:11-19,50-52`; `UserCodefImportScope.java:42-79`). 따라서 **사용자별·연결별**이다.
4. 현재 실 DB에는 활성 선택 19행이 모두 `SELECTED`다. 합계 저장 ref는 계좌 22개, 카드 9개, 대출 1개다. 이는 사용자별 배열 길이의 합이며 실제 등록 마스터 건수는 아니다.
5. 선택된 각 ref마다 거래 조회를 한 번씩 호출한다. 계좌·카드·대출 모두 순차 `for` 루프다(`CodefImportService.java:91-126`).
6. 총 ref 선택은 **최대 50개**로 강제된다(`CodefImportService.java:48,376-380`). `ALL`도 목록을 실제 ref 배열로 펼친 뒤 같은 상한 검증을 통과해야 한다(`CodefImportScopedService.java:119-136`; `CodefImportService.java:100-103`).

### 왜 만들었는가

- 확인된 직접 근거: 2026-06-27 개발책임자 요구를 “연결된 계좌/카드/대출 전체 목록, 기본 전체/종류별 전체/특정 항목 다중 선택, 사용자별 영속 저장”으로 기록한 사양이 있다(`docs/superpowers/specs/2026-06-27-bc3-codef-account-selection-design.md:1-3,17-32`).
- **성능 때문에 선택식으로 만들었다는 명시 근거 없음.**
- **담당 계좌만 가져오게 하는 업무 규칙이라는 명시 근거 없음.**
- 외부 조회가 ref 수만큼 증가하고 50개 상한이 있다는 사실은 확정이지만, 이것을 선택 UI의 도입 이유라고 연결하는 주석·사양 근거는 없다.
- 커밋 메시지는 개발책임자의 `git` 명령 금지 때문에 조사하지 않았다. 저장소 내 사양·보고서·코드·마이그레이션에서는 위 요구 외의 이유를 찾지 못했다.

## 2.3 두 기제의 관계

두 설정은 독립이다. 사양도 조회 필터를 가져오기 scope와 별도로 신설한다고 명시한다(`2026-07-04-bank-card-admin-filter.md:9-10`). CODEF 선택은 **무엇을 가져와 DB에 적재할지**, 조회 필터는 **이미 적재된 행 중 무엇을 화면에 보일지** 결정한다. 둘을 하나로 간주하면 현행을 잘못 판정하게 된다.

---

## 3. 계좌·카드·대출 마스터

실측은 `public`과 `staging`의 테이블 목록을 조회하고, 활성 건수는 `is_deleted=FALSE`로 셌다.

| 종류 | 등록 테이블·스키마 | 구분 방식 | 실측 활성 건수 | 현행 판정 |
|---|---|---|---:|---|
| 계좌 | `public.bank_accounts` | 계좌 전용 테이블. `account_code`, `account_name`, `chart_account_code`, `foreign_currency`, `active` 등 | **0** | 스키마·엔티티는 있음. 표본 0이므로 실운영 등록 마스터로 구현 완료 판정 불가 |
| 카드 | `public.card_master` | 카드 전용 테이블. `card_type IN (CREDIT, DEBIT, BANK_ACCOUNT)` | **0** | 스키마·엔티티는 있음. 표본 0이므로 실운영 등록 마스터로 구현 완료 판정 불가 |
| 대출 | 전용 마스터 테이블 없음 | `public.codef_registered_institution.business_type='LOAN'`으로 기관 메타 구분 가능 | **0** | 전용 대출 마스터는 없음. CODEF 등록기관 표본도 0이라 운영 판정 불가 |

근거:

- 계좌 테이블: `V26__add_ecount_mig6_master_staging.sql:7-28`, 엔티티 `BankAccount.java:16-49`.
- 카드 테이블: `V22__add_ecount_account_card_staging.sql:46-67`, 엔티티 `CardMaster.java:18-49`.
- CODEF 등록기관 메타: `V47__codef_connection.sql:31-56`; `business_type IN ('BANK','CARD','LOAN')`는 한 테이블의 type 컬럼이다.
- `codef_registered_institution`은 계좌/카드/대출 개별 마스터가 아니라 **등록 기관 메타**다. 주석도 그렇게 정의한다(`V47:58-65`). 현재 BANK/CARD/LOAN 모두 0건이다.
- CODEF의 실제 계좌·카드·대출 목록은 DB 마스터를 읽지 않고 외부 client에서 조회한다(`CodefImportController.java:54-103`; 관리 검증 API `CodefConnectionController.java:73-94`). 따라서 그 목록은 `SELECT count(*)` 대상 테이블이 아니다.
- `bank_accounts`와 `card_master`는 이카운트 import 도메인이다. 현행 입출금 조회 필터는 이 테이블들이 아니라 `bank_transaction`의 실존 label을 읽는다(`BankTransactionRepository.java:54-76`).

### 3.1 추가 실측 — 등록과 혼동하면 안 되는 값

| 값 | 계좌 | 카드 | 대출 |
|---|---:|---:|---:|
| 거래행의 distinct label | 23 (`CODEF_BANK` 21 + `CSV_IMPORT` 2) | 7 | 5 |
| 거래행의 distinct `card_name`/`loan_name` | 해당 없음 | `card_name` 1 | `loan_name` 1 |
| 사용자 CODEF 선택 ref 합계 | 22 | 9 | 1 |

이 값들은 각각 거래 데이터와 사용자 선택 데이터이며 **등록 마스터 건수로 판정할 수 없다**.

---

## 4. 거래 데이터

### 4.1 테이블과 구분 가능성

거래행은 모두 `public.bank_transaction`에 있다. 별도 계좌·카드·대출 거래 테이블은 없다.

- `source` CHECK 값: `CSV_IMPORT`, `KFTC`, `CODEF_BANK`, `CODEF_CARD`, `CODEF_LOAN` (`V45__add_codef_loan_source.sql:11-16`).
- 카드는 `card_name`, `approval_id`가 추가돼 있다(`V44__add_codef_source_and_card_fields.sql:9-23`).
- 대출은 `loan_name`이 추가돼 있다(`V45__add_codef_loan_source.sql:8-19`).
- 계좌 분류는 현행 서비스의 정의대로 `CSV_IMPORT`와 `CODEF_BANK`를 포함했다(`BankTransactionService.java:76-83`). 현재 KFTC 행은 0건이다.

따라서 현행 데이터는 `source`로 계좌·카드·대출을 구분 가능하다. 다만 각 행이 실 CODEF인지 DRY_RUN인지 나타내는 `submit_method` 컬럼은 없어 그 축은 판정 불가하다.

### 4.2 종류별 실측 건수

| 종류 | 전체 | 입금 | 출금 | 미반영 | 반영 | 강제 | 거래처 지정 | 거래일 범위 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 계좌 (`CSV_IMPORT`,`KFTC`,`CODEF_BANK`) | **206** | 165 | **41** | 204 | 2 | 0 | 4 | 2020-01-01~2026-07-04 |
| 카드 (`CODEF_CARD`) | **65** | 0 | **65** | 65 | 0 | 0 | 0 | 2026-01-01~2026-07-03 |
| 대출 (`CODEF_LOAN`) | **45** | 0 | **45** | 45 | 0 | 0 | 0 | 2026-01-01~2026-07-03 |
| 합계 | **316** | 165 | **151** | 314 | 2 | 0 | 4 | 2020-01-01~2026-07-04 |

여기서 “거래처 지정”은 `matched_partner_id IS NOT NULL`을 셌다. UUID 값 자체는 조회 결과나 보고서에 노출하지 않았다.

### 4.3 출금 151건 판정

판정 가능하다.

| source | 종류 판정 | 출금 | 미반영 | 거래처 지정 |
|---|---|---:|---:|---:|
| `CODEF_BANK` | 계좌 | 40 | 40 | 0 |
| `CSV_IMPORT` | 계좌 | 1 | 1 | 0 |
| `CODEF_CARD` | 카드 | 65 | 65 | 0 |
| `CODEF_LOAN` | 대출 | 45 | 45 | 0 |
| 합계 | 계좌 41·카드 65·대출 45 | **151** | **151** | **0** |

따라서 앞선 실측 “출금 151건 전부 미반영·거래처 지정 0건”은 현재 DB에서도 재확인됐고, 종류별 분해도 가능하다.

---

## 5. 메뉴 분리의 영향 범위 — 현행 구조와 후보만

이 절은 구현 방식 결정을 하지 않는다.

### 5.1 권한 현행과 후보

현행은 세 종류 모두 `accounting.bank-matching` 하나다. 프런트 라우트 guard, 사이드바 가시성, 거래 API, CODEF 목록/가져오기/선택 API가 같은 PageCode를 사용한다.

현행 구조에서 가능한 후보는 다음뿐이며, 어느 후보를 채택할지는 미정이다.

1. **현행 PageCode 재사용 후보**: 메뉴/라우트는 셋이지만 세 화면 모두 `accounting.bank-matching`을 사용한다. 권한은 분리되지 않는다.
2. **종류별 PageCode 신설 후보**: 현재 점 구분 문자열 관례를 따라 계좌·카드·대출용 PageCode 셋을 추가한다. 정확한 코드명과 기존 `accounting.bank-matching`의 존치·승계 방식은 현행 코드에서 확정할 수 없다.
3. **기존 코드 + 신규 둘 후보**: 기존 `accounting.bank-matching`을 한 종류에 남기고 나머지 둘만 신규 코드로 둔다. 어떤 종류가 기존 코드를 승계할지는 근거가 없다.

종류별 권한을 신설한다면 현행 구조상 최소 영향 지점은 다음이다.

- auth-service 권한 시드: `V67__seed_accounting_bank_matching_page_permission.sql`과 같은 4계층(`role_page_permissions`, template, group, account materialize).
- 프런트 PageCode 타입: `clients/desktop/src/renderer/api/permissionsApi.ts:166-176`.
- 권한설정 표시명/그룹: `PermissionMatrixPage.tsx:475-485` 및 회계 PageCode 배열(`:134` 부근).
- 각 라우트의 `PermissionGuard`: `routes/index.tsx:858-864`.
- 사이드바의 `dynamicCanAccess`와 회계 그룹 가시성 합산: `AppLayout.tsx:528-548`.
- 백엔드 controller의 `PAGE_CODE`: `BankTransactionController.java:46`, `CodefImportController.java:47`. 현재 하나의 API가 세 source를 함께 반환하므로 API 권한을 종류별로 나눌 수 있는지는 현행만으로 확정할 수 없다.

### 5.2 라우팅·사이드바 구조

- 라우트 등록 위치: `clients/desktop/src/renderer/routes/index.tsx`의 회계 라우트 묶음, 현행 행은 `:858-864`.
- 사이드바 링크 위치: `clients/desktop/src/renderer/components/AppLayout.tsx:1216-1229`. 현재 `계좌/카드 관리` 바로 아래에 `입출금 내역`이 있다.
- 메뉴 가시성 변수 위치: `AppLayout.tsx:528-533`, 회계 그룹 표시 합산은 `:541-550`.
- 권한설정 화면 표시명: `PermissionMatrixPage.tsx:483-485`.
- API gateway는 `/accounting/**` 포괄 라우트라서 데스크톱 하위 경로를 세 개 추가하는 것만으로 gateway route가 반드시 늘어난다고 확정할 수는 없다.
- 현행 화면 컴포넌트 내부에는 이미 source 탭과 source별 행 필터가 있다(`BankTransactionPage.tsx:85-95,727-731,1033-1056`). 메뉴 분리 시 이 코드를 재사용할지 별도 화면으로 나눌지는 결정하지 않았다.

---

## 6. 개발책임자 확인이 필요한 것

1. 이슈 #1144의 “기존에 계좌 몇 개를 체크”는 어느 현행 기제를 뜻합니까?
   - (a) 목록 조회용 `계좌/카드` 필터 (`user_bank_txn_filter`)
   - (b) CODEF 가져오기 대상 선택 (`user_codef_import_scope`)
   - (c) 둘 다
2. “등록된 계좌·카드·대출”의 정본을 무엇으로 봐야 합니까?
   - (a) CODEF 외부 목록 API가 반환하는 항목
   - (b) 이카운트 마스터 `bank_accounts`/`card_master`
   - (c) `codef_registered_institution`의 등록 기관
   - (d) 이미 거래가 존재하는 `bank_transaction` distinct label

현재 DB에서는 (a)는 테이블 `SELECT count(*)` 대상이 아니고, (b)와 (c)는 모두 0건이며, (d)는 거래 이력이지 등록 마스터가 아니다. 따라서 추측으로 하나를 정본으로 정하지 않았다.

---

## 7. 확정하지 못한 것

- “몇 개 체크”가 조회 필터와 가져오기 선택 중 어느 것을 가리키는지 확정하지 못했다. 두 기제가 동시에 존재한다.
- 선택 방식이 성능 또는 담당계좌 업무 규칙 때문에 도입됐다는 근거는 찾지 못했다. 외부 조회가 ref별 반복이고 50개 상한이라는 사실만 확정했다.
- `bank_accounts`와 `card_master`는 스키마·import 코드가 있지만 실 데이터 0건이라 운영 마스터로 구현 완료됐다고 판정할 수 없다.
- 대출 전용 마스터 테이블은 찾지 못했다. `codef_registered_institution`은 종류 구분이 가능한 등록기관 메타일 뿐이고 실 데이터 0건이다.
- CODEF 외부 목록의 실 등록 건수는 DB `SELECT count(*)`로 셀 수 없다. 현재 등록기관/연결 메타가 0건이며, 외부 목록 API를 실 CODEF 자격으로 호출하지 않았다.
- `bank_transaction`에는 DRY_RUN/실 CODEF 실행 방식을 보존하는 컬럼이 없다. 런타임 컨테이너의 `CODEF_SUBMIT_METHOD` 환경변수는 미설정이고 코드 기본값은 DRY_RUN(`application.yml:79-83`)이나, 기존 316행 각각의 생성 방식을 역판정할 수는 없다.
- 실제 사용자별 유효 권한은 동적 그룹·계정 override를 포함하므로 V67 기본 시드만으로 개인별 최종 권한을 확정하지 않았다.
- 커밋 메시지는 명시된 `git` 명령 금지에 따라 조사하지 않았다.
- 다른 트랙이 같은 스택을 사용 중이므로 실측 건수는 2026-08-08 23:15 KST 시점 스냅샷이다.

---

## 8. 신규 파일

- `docs/dev-reports/2026-08-08-1144-cash-ledger-menu-survey.md` — 본 읽기 전용 조사 보고서 1개

제품 코드·스키마·설정 파일은 변경하지 않았다.
