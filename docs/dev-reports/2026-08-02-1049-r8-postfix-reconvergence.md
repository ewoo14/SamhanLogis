# PR #1050 / 이슈 #1049 R8 — 머지 전 postfix 재수렴

## 0. 결론

**BLOCK — 1건.** 4종 × 4상황의 실제 입력·선택은 모두 성립했고 R6가 조정한 계약 과잉 8건도 현재 테스트에서 모두 성립했다. 그러나 `productApi.searchProducts`의 `size=10000`이 모달 호출로 한정되지 않았다. PR 밖 안전재고 화면의 기존 단일 `ProductAutocomplete`에서도 모달 없이 `size=10000` 요청과 45개 dropdown 렌더가 재현됐다.

- 검증 HEAD: `724c8bcc853afc0693f6e0c29e553983dd45b6b8`
- frontend: 현재 HEAD를 `vite.web.config.ts`(BrowserRouter), `VITE_APP_VERSION=2026/08/02-1049`로 실행
- API/DB: 공유 게이트웨이 `http://127.0.0.1:8080`, 기존 `dev_master`, GET 전용
- 금지사항 준수: 코드 수정·commit·push·checkout·Docker 재빌드·DB write·합성 응답 없음

## 1. 4종 × 4상황 실제 입력·선택

표의 “선택 결과”는 후보 표시만 센 값이 아니라 option/checkbox/radio 클릭과 `선택 확정`, 이후 controlled input 또는 칩 반영까지 확인한 값이다. 0건은 선택할 후보가 없으므로 검색어 유지와 선택값 0을 확인했다.

| 대상 | 상황 | 실제 입력 | 실제 후보 표면 | 실제 선택 결과 | 판정 |
|---|---|---|---|---|---|
| 품목 | 1건 | `030RXH` | 1건, 모달 없음 | `실외기_3HP 다배관`, `1개 선택됨`, 입력 비움 | PASS |
| 품목 | 2건 이상 | `AJ` | 모달 checkbox 45건 | 앞 2건 선택·확정, `2개 선택됨` | PASS |
| 품목 | 0건 | `1049-no-result` | `검색 결과 없음` | chip text `""`, 입력 유지 | PASS |
| 품목 | 정확 코드 | `AJ040RXH4BC1` | 1건, 모달 없음 | `실외기_4HP 다배관`, `1개 선택됨`, 입력 비움 | PASS |
| 수신자 | 1건 | `김은지` | dropdown 1건 | 선택 전 칩 0 → 선택 후 칩 1, `김은지 · 회계팀` | PASS |
| 수신자 | 2건 이상 | `김` | 모달 checkbox 3건 | 앞 2건 선택·확정, 칩 2개 | PASS |
| 수신자 | 0건 | `1049-no-result` | `검색 결과 없음` | chip text `""` | PASS |
| 수신자 | 정확 코드 | `dev_accountant` | dropdown 1건 | `[DEV-SEED] 개발회계 · 회계팀` 칩 1개 | PASS |
| 거래처 | 1건 | `한울냉열시스템` | dropdown 1건 | option 클릭 후 controlled input `한울냉열시스템` | PASS |
| 거래처 | 2건 이상 | `010` | 단일선택 모달 radio 5,606건 | 첫 후보 확정 후 input `청담 동양파라곤 / 개인고객` | PASS |
| 거래처 | 0건 | `1049-no-result` | `검색 결과 없음` | input 검색어 유지, 선택 없음 | PASS |
| 거래처 | 정확 코드 | `010-2564-8488` | dropdown 1건 | option 클릭 후 input `향남부평-(박동수)` | PASS |
| 담당자 | 1건 | `김은지` | dropdown 1건 | 선택 전 칩 0 → 선택 후 칩 1, `김은지 (회계팀)` | PASS |
| 담당자 | 2건 이상 | `김` | 모달 checkbox 3건 | 앞 2건 선택·확정, 칩 2개 | PASS |
| 담당자 | 0건 | `1049-no-result` | `검색 결과 없음` | chip text `""` | PASS |
| 담당자 | 정확 코드 | `dev_accountant` | dropdown 1건 | `[DEV-SEED] 개발회계 (회계팀)` 칩 1개 | PASS |

정확 직원 코드는 현재 검색 계약의 `loginId`를 사용했다. 공유 DB 검색 결과의 `employeeCode`는 `null`이었고, `dev_accountant` exact 검색은 수신자·담당자 각각 1건이었다.

### 재현 원문 — 입력·선택

```text
REQUEST http://localhost:8080/api/products?q=030RXH&size=10000
RESULT product one query=030RXH selected=1개 선택됨 chipTitles=["실외기_3HP 다배관"] input=
REQUEST http://localhost:8080/api/products?q=AJ040RXH4BC1&size=10000
RESULT product exact-code query=AJ040RXH4BC1 selected=1개 선택됨 chipTitles=["실외기_4HP 다배관"] input=
REQUEST http://localhost:8080/api/products?q=1049-no-result&size=10000
RESULT product zero query=1049-no-result noneVisible=true chipText="" input=1049-no-result
RESULT product multi query=AJ modalCandidates=45 selected=2개 선택됨
```

```text
RESULT recipient one before=0 clicked="김은지회계팀" after=1 text="1\n:\n김은지 · 회계팀"
REQUEST http://localhost:8080/admin/groupware/messages/recipient-search?q=%EA%B9%80&limit=10000
RESULT recipient multi query="김" modalCandidates=3 selectedChips=2 texts=["1:김은지 · 회계팀","2:김기철 · 영업2팀"]
REQUEST http://localhost:8080/admin/groupware/messages/recipient-search?q=1049-no-result&limit=10000
RESULT recipient zero query=1049-no-result noneVisible=true chipText=""
REQUEST http://localhost:8080/admin/groupware/messages/recipient-search?q=dev_accountant&limit=10000
RESULT recipient exact-code query=dev_accountant clicked="[DEV-SEED] 개발회계회계팀" selectedChips=1 text="1\n:\n[DEV-SEED] 개발회계 · 회계팀"
```

```text
REQUEST http://localhost:8080/admin/partners/search?q=%ED%95%9C%EC%9A%B8%EB%83%89%EC%97%B4%EC%8B%9C%EC%8A%A4%ED%85%9C&size=10000&status=ACTIVE
RESULT partner one clicked="한울냉열시스템\n상호\n·\n000011111111\n·\n000011111111" inputAfter="한울냉열시스템" parentButtons=[]
RESULT partner multi modalCandidates=5606 chosen="청담 동양파라곤 / 개인고객" inputAfter="청담 동양파라곤 / 개인고객" elapsedMs=2594
REQUEST http://localhost:8080/admin/partners/search?q=1049-no-result&size=10000&status=ACTIVE
RESULT partner zero query=1049-no-result noneVisible=true input="1049-no-result"
REQUEST http://localhost:8080/admin/partners/search?q=010-2564-8488&size=10000&status=ACTIVE
RESULT partner exact-code query="010-2564-8488" clicked="향남부평-(박동수)\n·\n010-2564-8488\n코드\n·\n010-2564-8488\n사업자번호" inputAfter="향남부평-(박동수)"
```

```text
REQUEST http://localhost:8080/admin/groupware/approvals/approver-search?q=%EA%B9%80%EC%9D%80%EC%A7%80&limit=10000
RESULT approver one query=김은지 before=0 clicked="김은지회계팀" after=1 text="1\n:\n김은지 (회계팀)"
REQUEST http://localhost:8080/admin/groupware/approvals/approver-search?q=%EA%B9%80&limit=10000
RESULT approver multi query="김" modalCandidates=3 selectedChips=2 texts=["1:김은지 (회계팀)","2:김기철 (영업2팀)"]
REQUEST http://localhost:8080/admin/groupware/approvals/approver-search?q=1049-no-result&limit=10000
RESULT approver zero query=1049-no-result noneVisible=true chipText=""
REQUEST http://localhost:8080/admin/groupware/approvals/approver-search?q=dev_accountant&limit=10000
RESULT approver exact-code query=dev_accountant before=0 clicked="[DEV-SEED] 개발회계회계팀" after=1 text="1\n:\n[DEV-SEED] 개발회계 (회계팀)"
```

## 2. R6 “계약 과잉” 조정 8건

`MessengerPage.test.tsx` 전체를 현재 HEAD에서 재실행했다. 조정 8건의 사용자 결과는 모두 PASS이며, 같은 파일의 구 UI 조정 2건(R3-5, L-2)도 함께 PASS했다.

| # | R6 조정 사용자 결과 | 현재 결과 | 추가 관찰 |
|---:|---|---|---|
| 1 | R14 발송 중 재클릭해도 POST 1회 | PASS | unit에서 실제 호출 횟수 고정 |
| 2 | R3-4 발송 실패 시 칩·본문 보존 | PASS | unit에서 선택값·본문 보존 |
| 3 | R15 칩에는 UUID가 아닌 이름·부서 | PASS | unit + 본 라운드 real UI 칩 반영 |
| 4 | R16 이미 선택한 후보 중복 제거 | PASS | unit PASS; 본 라운드는 1건 선택 자체도 real UI 확인 |
| 5 | H-2 BE 한글 오류를 화면에 표시 | PASS | unit에서 rejection 메시지 단정 |
| 6 | H-3 검색 후보에서 본인 제외 | PASS | unit에서 후보 필터 단정 |
| 7 | R3-3 늦은 읽음 실패가 발송 오류를 덮지 않음 | PASS | unit Promise 경합 단정 |
| 8 | M-7 동명이인만 담당자코드 병기 | PASS | 동명이인/비동명이인 unit 2건 모두 PASS |

### 재현 원문 — R6 8건과 구 UI 2건

```text
✓ MessengerPage > R14 발송 중 재클릭해도 POST는 한 번만 수행한다 389ms
✓ MessengerPage > R3-4 발송 실패 시 선택한 칩과 본문을 보존한다
✓ MessengerPage > R3-5 칩 제거 후 발송 payload에는 남은 수신자만 포함한다 626ms
✓ MessengerPage > R15 칩에는 UUID가 아니라 이름과 부서만 표시한다
✓ MessengerPage > R16 이미 선택된 수신자는 검색 후보에 중복 표시되지 않는다 315ms
✓ MessengerPage > H-2 BE 오류 메시지가 axios 영문 메시지 대신 화면에 그대로 뜬다 301ms
✓ MessengerPage > H-3 검색 후보에는 본인이 나타나지 않는다 313ms
✓ MessengerPage > R3-3 늦게 끝난 읽음 실패가 발송 오류 사유를 덮어쓰지 않는다
✓ MessengerPage > L-2 수신자 상한에 도달하면 검색결과 없음과 구분되는 전용 안내가 뜬다 13792ms
✓ MessengerPage > M-7 검색 결과에 동명이인이 2건 이상이면 담당자코드를 병기하고, 아니면 병기하지 않는다
✓ MessengerPage > M-7 동명이인이 없으면 평소처럼 이름·부서만 표시한다

Test Files  1 passed (1)
Tests       23 passed (23)
Duration    22.18s
```

API/4종 계약 회귀도 별도 재실행했다.

```text
Test Files  6 passed (6)
Tests       24 passed (24)
Duration    4.69s
```

## 3. 공용 컴포넌트의 PR 밖 소비 화면

repo 전체 `*.tsx`의 실제 JSX 태그를 세고, 이번 4종 화면(`EstimateItemsCatalogPage`, `MessengerPage`, `DepositorMappingPage`, `GroupwareApprovalCreatePage`)을 제외했다.

| 공용 컴포넌트 | PR 밖 화면 파일 | JSX 인스턴스 | 화면 |
|---|---:|---:|---|
| `AsyncAutocomplete` 직접 | 1 | 1 | `JournalFormPage` |
| `MultiSelectAutocomplete` 직접 | 2 | 2 | `ApprovalLineConfigPage`, `MergeConvertDialog` |
| `ProductAutocomplete` 계열 | 2 | 3 | `SafetyStockAlertsPage` 1, `SlipFormPage` 2 |
| `PartnerAutocomplete` | 12 | 16 | `BlockedPartnersPage`, `CashReceiptFormPage`(2), `DailyClosingPage`, `BankTransactionPage`, `CollectionPlanPage`(2), `EstimateFormPage`, `MergeConvertDialog`, `JournalStatusReportPage`, `NotesReceivablePage`(2), `SlipDetailPage`(2), `SlipFormPage`, `TaxInvoiceFormPage` |
| 합계(중복 파일 제거) | **15** | **22** | `MergeConvertDialog`, `SlipFormPage`는 둘 이상의 공용 컴포넌트를 사용 |

영향 판정:

- `AsyncAutocomplete`의 draft/blur/모달 상태 코드는 모든 wrapper가 공유하므로 위 15개 화면이 회귀 표면이다.
- `resultSelectionMode`는 opt-in이라 기존 `MultiSelectAutocomplete`·`PartnerAutocomplete` 소비 화면에 모달이 자동 활성화되지는 않는다.
- 기존 단일 `ProductAutocomplete`에는 모달이 활성화되지 않았지만 전역 `searchProducts`의 `size=10000`은 그대로 전달된다. 안전재고 화면에서 실제 재현했으므로 단순 정적 가능성이 아니다.

## 4. 상한 10000 요청 경계

### BLOCK-1 — 품목 상한이 비모달·PR 밖 경로로 누출

PR 밖 안전재고 화면은 기존 단일 `ProductAutocomplete`이며 검색 결과 선택 모달을 열지 않는다. 그럼에도 실제 요청은 `size=10000`이었다.

```text
REQUEST_OUTSIDE_PR http://localhost:8080/api/products?q=AJ&size=10000
RESULT_OUTSIDE_PR screen=safety-stock listboxOptions=45 searchDialogs=0 input=AJ
```

직접 원인은 `clients/desktop/src/renderer/api/productApi.ts`의 `searchProducts`가 모든 호출에 `size: 10000`을 고정하는 것이다. `SafetyStockAlertsPage`와 `SlipFormPage`의 기존 단일 dropdown 소비도 이 함수를 그대로 쓴다. 따라서 “10000은 모달 호출로만 한정” 조건을 만족하지 않는다.

### 대조 — 거래처 일반 경로와 서버 기본값

PR 밖 세금계산서 거래처 검색은 모달 없이 기존 기본 20을 유지했다.

```text
REQUEST_OUTSIDE_PR http://localhost:8080/admin/partners/search?q=010&size=20&status=ACTIVE
RESULT_OUTSIDE_PR screen=tax-invoice searchDialogs=0 input=010
```

명시 상한을 빼고 게이트웨이에 GET한 대조군도 기본 20을 유지했다. 직원 결과는 현재 DB에 8건뿐이라 반환 건수로 20 clamp까지 도달하지는 않았다.

```text
DEFAULT_REQUEST /admin/partners/search ?q=010&status=ACTIVE count=20 reportedSize=20
DEFAULT_REQUEST /admin/groupware/messages/recipient-search ?q=dev_ count=8 reportedSize=n/a
DEFAULT_REQUEST /admin/groupware/approvals/approver-search ?q=dev_ count=8 reportedSize=n/a
DEFAULT_REQUEST /api/products ?q=AJ count=20 reportedSize=20
```

판정은 다음과 같다.

- 거래처: 대상 모달 호출만 10000, PR 밖 TaxInvoice는 20 — PASS.
- 수신자: production 소비처는 Messenger 1곳이며 해당 모달 호출 10000 — PASS.
- 담당자: production 소비처는 결재 작성 1곳이며 해당 모달 호출 10000 — PASS.
- 품목: 공용 API 함수가 비모달 소비처에도 10000 전달 — **BLOCK**.

## 5. 렌더 비용 재현

R6와 같은 committed 비용 테스트를 독립 프로세스로 3회 실행했다. byte와 row 수는 정확히 재현됐고 시간은 환경 변동 범위에서 더 짧았다. 따라서 `3,142ms`라는 단일 수치 자체는 재현되지 않았지만, 5,587개 radio를 한 번에 DOM에 만드는 초 단위 비용은 재현됐다.

| 실행 | bytes | rows | `renderMs` |
|---:|---:|---:|---:|
| 1 | 786,730 | 5,587 | 2,053.86ms |
| 2 | 786,730 | 5,587 | 1,863.97ms |
| 3 | 786,730 | 5,587 | 1,767.24ms |
| 중앙값 | 786,730 | 5,587 | **1,863.97ms** |

실 DB의 거래처 `010` 5,606건은 검색 입력부터 첫 radio 선택·확정·controlled input 반영까지 2,594ms였다. 이 값은 네트워크·렌더·선택을 함께 포함하므로 위 jsdom `renderMs`와 동일 지표는 아니다.

```text
[R6 COST] partner response bytes=786730 renderMs=2053.86 rows=5587
[R6 COST] partner response bytes=786730 renderMs=1863.97 rows=5587
[R6 COST] partner response bytes=786730 renderMs=1767.24 rows=5587
```

## 6. 최종 판정

**머지 차단.** 선택 불능/controlled value 고정 회귀는 16칸에서 발견되지 않았다. R6 계약 과잉 조정 8건도 모두 성립한다. 그러나 요청 조건 4의 “상한 10000은 모달 호출로만 한정”을 PR 밖 안전재고 단일 dropdown이 실제로 위반한다. `productApi.searchProducts`의 상한을 모달 전용 호출자가 명시하도록 분리한 뒤, 안전재고/전표의 실제 요청이 기본 20으로 돌아오는 재수렴이 필요하다.

## 7. 이 라운드가 보지 않은 것

- Docker 이미지를 재빌드하지 않았다. 공유 backend가 HEAD Java 소스로 새로 빌드됐다는 것은 확인하지 않았다.
- DB write가 필요한 메신저 실발송, 입금자명 매핑 저장, 결재 문서 제출, 품목 추가는 실행하지 않았다. R14/R3-4/H-2/R3-3 등 mutation 결과는 committed Vitest mock 계약으로 검증했다.
- 전체 Playwright 657개는 R7 결과를 재인용하지 않고 이번 라운드에는 재실행하지 않았다.
- 인앱 브라우저 backend는 discovery 결과 `[]`라 사용할 수 없었다. 대신 사용자가 지정한 repo 로컬 Playwright의 Chromium과 BrowserRouter Vite를 사용했다.
- 5,606건 거래처 모달의 스크롤 끝·마지막 후보 선택, 모바일/Capacitor/Electron HashRouter, 접근성 전체 감사, 시각 캡처 비교는 조사하지 않았다.
- 공유 DB의 모든 직원 `employeeCode`가 채워진 환경은 보지 못했다. 정확 직원 코드는 검색 계약의 `loginId=dev_accountant`로 검증했다.

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1049-r8-postfix-reconvergence.md`
