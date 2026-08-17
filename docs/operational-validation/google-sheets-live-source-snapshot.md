# 종합견적서 / 주문서 Google Sheets live source snapshot

> 검증일: 2026-05-16  
> Spreadsheet: `종합 견적서` (`<SHEET_ID>`)
> Timezone/locale: `Asia/Seoul`, `ko_KR`  
> 목적: legacy GAS가 보던 Google Sheets 데이터를 그대로 재검증하되, 운영 조회/수정은 Samhan Public DB/API 계약으로 고정한다.

## 1. Tab inventory

Connector metadata 기준 27개 tab을 확인했다.

| # | tab | size | note |
|---|---|---|---|
| 1 | `전표생성폼` | 19 x 4 | credential-bearing 제어 폼. 값은 문서/캡처에 게시하지 않는다. |
| 2 | `종합견적서` | 100 x 8 | output/form. 모델/단가 원본 tab이 아니다. |
| 3 | `전표업로드목록` | 100 x 10 | output/form. 전표 업로드용 조립 결과 영역이다. |
| 4 | `홈멀티` | 122 x 33 | 인상 전 단가/base payload source tab |
| 5 | `홈멀티_단가인상` | 122 x 33 | 종합견적서 기본 단가/current source tab |
| 6 | `싱글 세트` | 291 x 27 | 인상 전 단가/base payload source tab |
| 7 | `싱글 세트_단가인상` | 291 x 27 | 종합견적서 기본 단가/current source tab |
| 8 | `싱글 구성품` | 1737 x 14 | 인상 전 단가/base payload source tab |
| 9 | `싱글 구성품_단가인상` | 1737 x 14 | 종합견적서 기본 단가/current source tab |
| 10 | `상업멀티` | 417 x 30 | 인상 전 단가/base payload source tab |
| 11 | `상업멀티_단가인상` | 417 x 30 | 종합견적서 기본 단가/current source tab |
| 12 | `싱글 자재가격` | 29 x 4 | hidden |
| 13 | `상업멀티 구성` | 517 x 10 | 인상 전 단가/base payload source tab |
| 14 | `상업멀티 구성_단가인상` | 517 x 10 | 종합견적서 기본 단가/current source tab |
| 15 | `분기계산` | 100 x 105 | 계산 보조 tab |
| 16 | `구형` | 44 x 9 | legacy product source tab |
| 17 | `장비스펙` | 28 x 26 | spec source tab |
| 18 | `부속품스펙` | 8 x 26 | spec source tab |
| 19 | `홈멀티_템플릿` | 122 x 30 | template |
| 20 | `거래처` | 6992 x 10 | partner lookup source. 본 문서에는 header만 게시한다. |
| 21 | `전표생성폼_템플릿` | 19 x 4 | hidden template |
| 22 | `싱글 세트_템플릿` | 219 x 21 | hidden template |
| 23 | `상업멀티_템플릿` | 416 x 27 | template |
| 24 | `분기계산_템플릿` | 100 x 105 | hidden template |
| 25 | `구형_템플릿` | 44 x 9 | hidden template |
| 26 | `담당자` | 20 x 2 | hidden |
| 27 | `추천실외기` | 26 x 5 | hidden |

## 2. Safe sampled ranges

민감값이 없는 제품 카탈로그 row만 샘플로 남긴다.

| range | 확인 내용 |
|---|---|
| `홈멀티_단가인상!A3:H4` | header `품명/모델명/단위/출고가/수량/납품가/소계/비고`, sample `AJ060MXHNBC1`, 납품가 `1,611,115` |
| `홈멀티!A3:H4` | header `품명/모델명/단위/출고가/수량/납품가/소계/비고`, sample `AJ060MXHNBC1`, 인상 전 납품가 `1,519,760` |
| `싱글 세트_단가인상!A3:I4` | header `품명/평형/모델명/단위/출고가/수량/납품가/납품가/소계`, sample `AC060CS6PBH1SY`, 납품가 `1,490,000` |
| `싱글 세트!A3:I4` | header `품명/평형/모델명/단위/출고가/수량/납품가/납품가/소계`, sample `AC060CS6PBH1SY`, 인상 전 납품가 `1,490,000` |
| `상업멀티 구성_단가인상!A1:J2` | header `품명/모델명/단위/출고가/수량/납품가/소계/비고/세트/고정DC`, sample `AM080AXVHHH1`, 납품가 `4,715,370` |
| `상업멀티 구성!A1:J2` | header `품명/모델명/단위/출고가/수량/납품가/소계/비고/세트/고정DC`, sample `AM080AXVHHH1`, 인상 전 납품가 `4,406,820` |
| `종합견적서!A1:H12` | 제목 `견 적 서`, header `품명/모델/단위/수량/출고가/납품가/소계`. output/form 확인 |
| `전표업로드목록!A1:J3` | header `품명/모델/단위/수량/출고가/납품가/소계/규격/구분/고정DC`. output/form 확인 |
| `거래처!A1:J1` | header `거래처코드/담당자명/거래처명/대표자명/주소/전화번호/특이사항/그룹/여신한도/싱글 할인`. 개인/연락처 row는 게시하지 않음 |

## 3. Runtime source policy

- `전표생성폼`은 credential-bearing 제어 폼이다. `app.bootstrap.range-map` 또는 PR 캡처에 포함하지 않는다.
- `종합견적서`와 `전표업로드목록`은 output/form이며, 모델/단가 원본으로 읽지 않는다.
- `product-service`의 `ProductSheetSyncService`는 `*_단가인상` tab을 기본 단가로 DB에 동기화하고, 붙지 않은 base tab은 `인상 전 단가`용 `PriceHistory`로 보존한다. 이후 Samhan Public 화면/API는 DB 계약을 통해 CRUD/조회한다.
- `partner-order-service`의 `BootstrapService`는 거래처 발송 주문서 GAS와 동일하게 base payload와 `*_단가인상` helper map을 모두 prefetch한다.
- `partner-order-service`의 `ProductCatalogLookupClient`는 기존 vendor OCR 업로드 UI/계약을 바꾸지 않고 `_단가인상` tab을 catalog lookup source로 사용한다.
- 모든 GAS 이식은 UI/기능을 그대로 유지하고, Notion 통신만 Samhan DB/API 통신으로 변경한다.
- 별도 3열 flat catalog를 운영자가 만들지 않는 한 `INTEGRATED_QUOTE_RANGE`는 비워 둔다.
