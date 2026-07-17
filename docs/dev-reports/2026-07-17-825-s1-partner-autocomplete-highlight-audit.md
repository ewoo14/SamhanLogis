# #825 슬1 거래처 자동완성 하이라이트 foundation 및 free-text 감사

- 기준일: 2026-07-17
- 범위: `clients/web/design-system` 하이라이트 foundation + `clients/desktop` 거래처 free-text 입력 정찰
- 재-bound: 본 문서는 분류·근거 기록만 포함하며 desktop 입력 표준화 코드는 슬2로 이관한다.
- 라인 기준: 본 작업에서 desktop 파일은 수정하지 않았으므로 현재 브랜치 파일의 라인이다.

## 판정 기준

| 분류 | 의미 | 슬1 처리 |
|---|---|---|
| (a) 즉시 표준화 | 안전한 단일 거래처 exact-entity 선택/식별 경계. 선택 결과의 partnerId 또는 partnerCode를 저장·전달할 수 있는 입력 | 감사만, 표준화는 슬2 |
| (b) 정당 free-text 유지 | 신규 거래처 생성·거래처 마스터 편집·부분검색 다건 필터·외부/수기 스냅샷·파일/외부 텍스트 | 유지 |
| (c) 필수화 슬라이스 이관 | 전표/분개 등 문서 작성 경계에서 선택을 강제하거나 필수화 정책과 결합되는 입력 | 표준화·필수화 정책을 별도 슬라이스로 이관 |

## 전수 감사표

행 수 기준 집계: **(a) 8행 / (b) 21행 / (c) 9행 = 38행**.

> 초판은 36행이었으나 OPUS 적대검증 R1에서 `JournalStatusReportPage`(a)·`SalesPartnerOrderDetailPage`(c) 누락 2행이 확인되어 보완했다. 아래 표가 실측 전수다.

### (a) 즉시 표준화 후보 — 8행

| 화면·라인 | 현재 입력 | 분류 | 근거 |
|---|---|---|---|
| `BankTransactionPage.tsx:543-560` | `PartnerAutocomplete` 거래처 매칭 | (a) | 입금/출금 행에 귀속할 단일 거래처를 고르는 exact 선택. 선택 해제는 별도 버튼 경계가 있음. |
| `DepositorMappingPage.tsx:333-341` | `PartnerAutocomplete` 예금주-거래처 매핑 | (a) | 예금주 매핑 대상은 한 거래처이며 `partnerCode`가 저장 식별자다. |
| `EstimateFormPage.tsx:1446-1458` | 견적 헤더 `PartnerAutocomplete` | (a) | 견적의 단일 거래처 선택이며 partner snapshot과 payload가 함께 갱신된다. |
| `CollectionPlanPage.tsx:319-340`, `:432-446` | 수금계획 등록/필터 거래처 `AsyncAutocomplete` | (a) | 등록 대상과 필터 모두 `JournalStatusPartnerOption` exact 선택이며 다건 free-text가 아니다. |
| `NotesReceivablePage.tsx:285-300`, `:348-362` | 어음 등록/필터 거래처 `AsyncAutocomplete` | (a) | 어음 귀속 거래처와 조회 거래처를 별도 선택한다. 사업자번호·코드 표시만 있고 UUID는 비공개다. |
| `JournalStatusReportPage.tsx:263-281` | 분개 현황 보고서 거래처 필터 `AsyncAutocomplete` | (a) | `JournalStatusPartnerOption` exact 선택으로 CollectionPlan/NotesReceivable 필터와 동형이다. `partnerCode`를 key로 쓰는 단일 거래처 선택이며 free-text 다건 필터가 아니다. (적대검증 R1 누락 보완) |
| `DailyClosingPage.tsx:531-538` | 마감 실행 대상 `execPartner` 코드 입력 | (a) | 임의 텍스트가 아니라 특정 거래처 코드 실행 대상이다. exact entity picker로 바꿀 때 실행 경계를 함께 검토한다. |
| `admin/BlockedPartnersPage.tsx:422-429` | 차단 등록 거래처 코드 입력 | (a) | 차단 대상 단일 거래처 코드 필수 입력이다. 사유는 별도 정당 free-text다. |

### (b) 정당 free-text 유지 — 21행

| 화면·라인 | 현재 입력 | 분류 | 근거 |
|---|---|---|---|
| `accounting/SalesAccountingSlipPage.tsx:120-124` | `거래처 코드` 목록 필터 | (b) | 전표 목록의 부분검색 다건 필터. 선택한 entity를 저장하지 않는다. |
| `accounting/PurchaseAccountingSlipPage.tsx:120-124` | `거래처 코드` 목록 필터 | (b) | 매입전표 목록의 부분검색 다건 필터다. |
| `accounting/TaxInvoiceBatchIssuePage.tsx:120-124` | `거래처 코드` 일괄 후보 필터 | (b) | 여러 매출전표 후보를 좁히는 다건 필터이며 특정 거래처 선택 필드가 아니다. |
| `accounting/admin/LedgerList.tsx:244-249` | `거래처명` 원장 목록 필터 | (b) | 변환 원장 목록의 부분 텍스트 필터다. |
| `CashReceiptListPage.tsx:246-250` | `거래처명` 현금영수증 목록 필터 | (b) | 목록 결과를 다건 필터링하며 partnerId를 저장하지 않는다. |
| `EstimateListPage.tsx:378-383` | `거래처명` 견적 목록 부분검색 | (b) | 목록 부분검색이다. 견적 작성 화면의 exact 선택과 경계가 다르다. |
| `TaxInvoiceListPage.tsx:256-261` | `거래처명` 세금계산서 목록 부분검색 | (b) | 목록 결과 다건 필터다. |
| `accounting/admin/OrderListPage.tsx:180-185` | `거래처명` 주문 목록 필터 | (b) | 주문 목록의 다건 텍스트 필터다. 담당자명 필터와 함께 동작한다. |
| `GeneralLedgerPage.tsx:341-347` | `거래처 코드(선택)` 분개장 필터 | (b) | 조회 범위를 좁히는 코드 필터이며 선택 entity payload가 없다. |
| `PartnerLedgerPage.tsx:354-361` | `거래처 코드(선택)` 거래처 원장 필터 | (b) | 집계 범위를 좁히는 optional filter다. row 선택은 조회 후 별도 동작이다. |
| `accounting/TaxInvoiceInboundPage.tsx:149-155` | `거래처 코드` 수신 세금계산서 후보 필터 | (b) | 수신 목록 다건 필터다. |
| `sales-query/SalesQueryPage.tsx:853-873` | 거래처명 + 거래처코드(사업자번호) 검색 | (b) | 판매 조회 조건의 부분/조건 검색이며 다건 결과를 반환한다. |
| `purchase-query/PurchaseQueryPage.tsx:632-652` | 거래처명 + 거래처코드(사업자번호) 검색 | (b) | 구매 조회 조건의 부분/조건 검색이며 다건 결과를 반환한다. |
| `SalesPartnerOrderListPage.tsx:488-496` | 거래처 코드 또는 사업자번호 필터 | (b) | 거래처주문 목록 필터다. exact selection을 저장하지 않는다. |
| `SalesPartnerDcConfigPage.tsx:183-199` | 거래처명 또는 사업자번호 검색 | (b) | DC 설정 목록 검색이다. 결과 행을 조회하는 search box다. |
| `admin/PartnersPage.tsx:393-400` | 코드/상호/사업자번호/전화 통합 검색 | (b) | 거래처 마스터 자체의 다필드 검색이다. 서버 4필드 검색 계약을 유지해야 한다. |
| `admin/ChatRoomsPage.tsx:201-205`, `:530-546` | 코드·단톡방 검색 및 수동 매핑의 코드/사업자명 snapshot | (b) | 단톡방 검색은 외부 매핑 조회, 단건 추가의 사업자명은 화면 표시용 snapshot이다. 신규 거래처 exact 선택이 아니다. |
| `admin/PartnerCreatePage.tsx:359-372` | 신규 거래처 상호·사업자등록번호 | (b) | 신규 entity 생성 입력이다. 자동완성으로 기존 entity를 고르면 생성 의미가 깨진다. |
| `admin/PartnerDetailDialog.tsx:378-384` | 기존 거래처 상호 편집·사업자번호 read-only | (b) | 거래처 마스터 편집 폼이다. 선택 위젯으로 대체할 대상이 아니다. |
| `accounting/SupplierProfilePage.tsx:636-665` | 공급자 프로필 사업자번호·상호 | (b) | 공급자 프로필 신규/편집 입력이며 마스터 entity 생성·수정 경계다. |
| `ArologisManualDispatchPage.tsx:718-744` | 수동 배차 정차의 거래처명·전표번호/코드 | (b) | 외부/수기 배차 데이터와 미배차 prefill을 보존하는 텍스트다. partnerId 없는 아로로지스 manual-stop 계약이다. |

### (c) 필수화 슬라이스 이관 — 9행

| 화면·라인 | 현재 입력 | 분류 | 근거 |
|---|---|---|---|
| `JournalFormPage.tsx:106-129` | 분개 라인 거래처 `AsyncAutocomplete` + legacy name fallback | (c) | 분개 저장 payload의 `partnerId/partnerName` 경계다. 선택을 필수화할지와 legacy 복원을 함께 결정해야 한다. |
| `CashReceiptFormPage.tsx:283-289` | 현금영수증 헤더 `PartnerAutocomplete` | (c) | 현금영수증 작성·확정과 거래처 필수 여부가 결합된 문서 경계다. |
| `accounting/SalesAccountingSlipFormPage.tsx:103-107` | 매출전표 거래처 코드·거래처명 plain input | (c) | 전표 작성 화면의 선택 강제/필수화 정책을 침범하므로 슬2 표준화와 별도 필수화 슬라이스로 이관한다. |
| `accounting/PurchaseAccountingSlipFormPage.tsx:103-107` | 매입전표 거래처 코드·거래처명 plain input | (c) | 매출전표와 같은 전표 작성 경계다. |
| `SlipFormPage.tsx:989-1010` | 전표 헤더 `PartnerAutocomplete` 및 snapshot 입력 | (c) | 전표 거래처 단일 경로는 이미 있으나 저장 필수화/legacy snapshot 규칙은 별도 정책이다. |
| `SlipDetailPage.tsx:1886-1902` | 매출전표 수정 거래처 선택·코드/사업자번호 snapshot | (c) | 공동편집 전표 수정의 필수화·권위 필드·snapshot 동기화 경계다. |
| `SlipDetailPage.tsx:2153-2169` | 매입전표 수정 거래처 선택·코드/사업자번호 snapshot | (c) | 매출전표 수정과 같은 별도 전표 필수화/공동편집 정책 대상이다. |
| `TaxInvoiceFormPage.tsx:501-530` | 거래처 검색 + 거래처명 snapshot plain input | (c) | 세금계산서 작성의 필수 헤더다. 자동완성 선택과 snapshot을 하나의 payload 계약으로 재-bound해야 한다. |
| `SalesPartnerOrderDetailPage.tsx:1396-1404` | 주문 수정 모달 `header.partnerCode` `CollaborativeSlipInput` 편집 가능 free-text | (c) | 편집한 `partnerCode`가 `updatePartnerOrder` payload(:1343)로 저장되고 `convertPartnerOrderToSlip` 출고전표 전환 경계까지 흐르는 문서 작성 경계다. 공동편집 fieldPath 계약·선택 강제/필수화 정책을 함께 재-bound해야 한다. (적대검증 R1 누락 보완) |

## 확인된 기존 결함·권한 단절

### TaxInvoiceFormPage의 bizNo → partnerId payload 오염

- `TaxInvoiceFormPage.tsx:279-286`: `PartnerSummary.businessRegistrationNumber`를 `PartnerOption.partnerCode`와 `bizNo` 양쪽에 넣고 `PartnerOption.id`는 채우지 않는다.
- `TaxInvoiceFormPage.tsx:295-298`: 선택 시 `businessRegistrationNumber`를 다시 거래처 식별자로 조립한다.
- `TaxInvoiceFormPage.tsx:397-400`: `partnerId: partnerIdSnapshot || partner?.businessRegistrationNumber || ''`로 전송한다. 즉 snapshot UUID가 없으면 사업자번호가 `partnerId` 자리에 들어간다.
- 본 슬1에서는 backend/API/TaxInvoiceForm을 수정하지 않았다. 슬2에서 `partnerId` 공급원과 사업자번호를 분리한 계약 테스트가 필요하다.

### ACCOUNTANT의 `partners.search` 단절

- 호출부: `clients/desktop/src/renderer/api/partnerApi.ts:522-555`, `GET /admin/partners/search`.
- ACCOUNTANT 실 권한에서 해당 search가 **403**이 되어 `searchPartners`의 catch가 빈 배열을 반환한다. 화면은 오류가 아닌 “검색 결과 없음”처럼 보이는 graceful degradation으로 끝난다.
- 본 슬1은 권한 seed/endpoint 계약을 변경하지 않는다. 슬2에서 ACCOUNTANT의 `partners.search` VIEW 권한과 실제 HTTP 403/성공 mock parity를 함께 복구해야 한다.

## 제외 확인

- `ArologisUnassignedPage`, `ArologisPreClassifyPage`, print/detail 화면의 `partnerName/partnerCode`는 read-only 표시 또는 URL prefill이며 free-text 거래처 입력으로 세지 않았다.
  - **정정(적대검증 R1)**: "detail 화면 partnerCode=read-only" 제외절을 `SalesPartnerOrderDetailPage`에 일괄 적용한 것은 사실과 달랐다. 상세 조회부(:985)는 read-only `Input`이 맞으나 주문 수정 모달(:1396-1404)의 `header.partnerCode`는 **편집 가능** free-text이므로 위 (c) 표로 편입했다 — 주문 상세는 제외절의 예외다.
- `GroupwareApprovalCreatePage`·`ApprovalLineConfigPage`의 autocomplete는 결재자/사용자 선택으로 거래처 입력이 아니다.
- `PartnerAutocomplete`의 하이라이트는 기존 소비 화면 전체에 자동 전개되지만, 위 감사 분류를 이유로 desktop 파일럿 표준화 코드는 추가하지 않았다.
