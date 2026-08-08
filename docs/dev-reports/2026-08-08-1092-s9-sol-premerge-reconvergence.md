# #1092 S9 SOL 머지 전 재수렴 — PR #1121 슬라이스 1

## 1. 판정

**BLOCK — 도달 결함 2건. 현재 HEAD `e48a5f3d626433163ae30ffaa3962109a7ed20bb`는 머지 불가다.**

1. **S9-01 BLOCKING:** 전량 수집 중 후속 페이지 하나가 실패하면 이미 성공한 첫 페이지까지 그 계열 전체를 버린다.
2. **S9-02 BLOCKING:** 공용 주문 요약 DTO의 `submittedAt` 의미 변경이 기존 주문서 목록의 **`발송일`**까지 생성일로 바꿨다. 활성 DRAFT 4/4가 실제로 잘못된 라벨 아래 표시되고, 같은 주문 상세 응답과도 모순된다.

상단 기존 견적 표의 `partnerBusinessNo`·`validUntil` `—`는 지시대로 선재로 제외했다.

## 2. S9-01 — 후속 페이지 실패 시 성공분까지 전부 소실

### 도달 경로

`EstimateListPage.tsx:79-87`의 `fetchAllPages()`는 첫 페이지를 받은 뒤 남은 페이지를 `Promise.all()`로 수집한다. 후속 페이지 하나만 reject되어도 함수 전체가 reject된다. 바깥 `Promise.allSettled()`(`:129`)는 이를 해당 계열 전체 실패로 바꾸고, 성공한 첫 페이지도 빈 배열로 대체한다.

Playwright headless에서 실제 gateway의 활성 견적 첫 페이지 53건을 그대로 받은 뒤 응답의 `totalPages`만 2로 만들어 페이지 경계를 발화시키고, 후속 `page=1`만 503으로 중단했다.

| 관찰 | 건수 |
|---|---:|
| 먼저 성공한 견적 첫 페이지 | 53 |
| 후속 페이지 실패 | 1 |
| 실패 후 통합 목록의 견적 | **0** |
| 실패 후 통합 목록의 주문 | 4 |
| 화면에서 사라진 성공 견적 | **53** |

화면은 `종합견적서 목록을 불러오지 못했습니다. 가능한 데이터만 표시합니다.`를 표시하지만, 실제로는 가능한 첫 페이지 53건도 표시하지 않았다. 사용자는 그 견적이 없다고 보게 된다.

### 10,000건 경계와 상한 판정

- `UNIFIED_LIST_FETCH_SIZE = 10_000`(`EstimateListPage.tsx:71`)은 **전체 상한이 아니라 페이지 크기**다.
- 서버 컨트롤러도 받은 `size`로 `PageRequest.of(page, size)`를 만들며 별도 최대 행 상한은 없다.
- 한 계열이 10,001건이면 `totalPages=2`가 되어 후속 페이지까지 요청하므로, 모든 요청이 성공하면 10,001건을 수집한다.
- 반대로 후속 페이지 하나라도 실패하면 위 재현처럼 해당 계열 10,001건 전체가 0건이 된다.
- 첫 응답의 `totalPages`를 한 번만 고정하고 나머지를 동시에 요청하므로, 페이지 수집 중 데이터가 추가·삭제되면 offset 페이지 이동에 따른 누락/중복을 막는 snapshot도 없다.
- 현재 실 DB의 최대 발화는 삭제 포함 견적 2,046 + 주문 2,025 = 통합 DOM **4,071행**이며 아직 한 계열 10,000건 경계에는 닿지 않았다.

## 3. S9-02 — 공용 `submittedAt`의 기존 소비처 의미 훼손

`PartnerOrderSummaryResponse.from()`은 이제 `confirmedAt ?? createdAt`을 `submittedAt`으로 반환한다(`PartnerOrderSummaryResponse.java:61,83-84`). 저장소의 production 소비처를 전수 추적한 결과는 다음과 같다.

| 소비처 | 사용 방식 | 판정 |
|---|---|---|
| 통합 견적 목록 `estimateUnifiedListModel.ts:91` | `submittedAt`을 `작성일`로 표시·정렬 | 이번 기능에는 의도된 변화 |
| 기존 주문서 목록 `SalesPartnerOrderListPage.tsx:272-277` | `submittedAt`을 **`발송일`**로 표시 | **의도되지 않은 의미 변경** |
| 기존 주문서 행 key fallback `SalesPartnerOrderListPage.tsx:65-66` | 주문번호 누락 시 key 보조값 | 실 주문은 주문번호가 있어 현재 영향 0 |
| `sales.ts` 요약 normalizer | 값을 그대로 전달 | 표시 의미를 바꾸지 않는 전달 계층 |

실 DB SELECT 결과:

| 범위 | 전체 | `confirmed_at IS NULL` | 변경 영향 |
|---|---:|---:|---:|
| 활성 주문 | 4 | **4** | 기본 주문 목록 4/4 |
| 전체 주문(삭제 포함) | 2,025 | **1,995** | 삭제 포함 조회 시 1,995건 |

Playwright headless에서 기존 주문서 목록의 활성 DRAFT 4행 모두 `발송일` 열에 생성일 기반 날짜를 표시했다. 그러나 같은 4건의 상세 DTO는 계속 `order.getConfirmedAt()`만 사용한다(`PartnerOrderDetailResponse.java:79`)고 실제 API도 `submittedAt=null`을 반환했다. 따라서 4/4가 **목록에는 발송일 있음, 상세에는 발송일 없음**으로 모순된다. DRAFT 생성 시각을 통합 목록의 작성일로 쓰려는 요구가 기존 `submittedAt/발송일` 계약까지 바꾼 결과다.

백엔드 컨트롤러 주석상 이 목록 endpoint는 내부 desktop과 파트너 PWA가 공유한다. 저장소 안에서 PWA가 `submittedAt`을 직접 표시하는 production 코드는 발견되지 않았지만, 공용 API 계약 변경 자체는 남는다.

## 4. 기존 기능 비차단 실측

통합 토글 ON 상태에서 현재 실 데이터로 확인한 결과다.

| 경로 | 발화 조건 | 결과 | 차단 건수 |
|---|---:|---|---:|
| 기존 견적 페이징 | 활성 53건, 1/2 → 2/2 | 기존 표 50행 → 3행, 통합 57행 유지 | 0 |
| 기간 필터 | 2026-08-07 | 통합 22행 표시 | 0 |
| 복원 | 삭제 포함 2페이지, 복원 가능 4행 | 버튼 4개 노출, POST는 409 차단 후 danger 배너 표시 | 0/4 |
| 견적 상세 이동 | 활성 견적 1행 | 상세 route 이동 | 0/1 |
| 주문 상세 이동 | 통합 주문 1행 | 주문 상세 route 이동 | 0/1 |
| 신규 견적 이동 | 버튼 1개 | 신규 route 이동 | 0/1 |
| 삭제 포함 통합 표시 | 견적 2,046 + 주문 2,025 | 4,071행 표시 | 0 |

DB 변경을 막기 위해 복원 POST만 브라우저에서 409로 차단했다. 직접 DB 작업은 SELECT만 수행했다.

## 5. 기존 저장분 호환

슬라이스 통합 화면 구현 커밋 시각(`2026-08-08 02:39:04 KST`) 이전 생성분은 활성 견적 45건과 활성 주문 4건이다. 통합 목록 57건 중 이 기존 저장분 49건이 모두 표시됐다. 신규 생성분만으로 성립한 PASS가 아니다.

다만 기존 주문 4건 모두 DRAFT이고 `confirmed_at IS NULL`이라, S9-02의 기존 주문서 `발송일` 의미 훼손도 바로 이 기존 저장분 4/4에서 발화했다.

## 6. 권한 판정

- 주문 목록 endpoint는 `@RequirePermission(page="sales.partner-order.list", VIEW)`를 강제한다(`PartnerOrderListController.java:50`). 통합 화면이 별도 FE 권한 필터를 두지 않아도 권한 없는 응답 데이터 자체는 내려오지 않는다.
- PARTNER 호출은 `partnerScope`를 `ownPartnerSpec`/native `partner_code` predicate로 강제한다(`PartnerOrderQueryService.java:87-100,210-213,322-324`).
- 현재 `auth_db`에서 `estimates.list VIEW` 계정은 20개이고, 그중 `sales.partner-order.list VIEW`가 없는 계정은 **0개**다. MASTER/MANAGER/ACCOUNTANT/SALES 역할도 두 VIEW가 동일하게 허용되고, PARTNER는 주문 VIEW만 있어 견적 화면에 진입할 수 없다.

따라서 **현재 계정·역할에서 권한 불일치 발화 조건은 0건이라 end-to-end 화면 판정은 `판정 불가`**다. 정적 방어상 향후 견적-only 커스텀 계정이 생겨도 주문 API는 403이 되고 통합 화면은 견적만 남기므로 무권한 주문 행 노출 결함은 세지 않았다.

## 7. UUID·금지 라벨

- 활성 통합 57행 가시 텍스트 UUID 정규식 일치: **0건**
- 통합 표 가시 텍스트 `담당`: **0건**

## 8. 실행 증거와 신규 파일

- Playwright Chromium headless, 1600×1000, `clients/desktop` cwd, 실 gateway `:8080`, renderer `:5197`.
- 활성 API 실측: 견적 53, 주문 4.
- 관련 FE 테스트: 3 files, **20/20 PASS**.
- `:services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.web.dto.PartnerOrderResponseTest"`: **BUILD SUCCESSFUL**.
- 커밋·push·제품 코드 수정 없음.
- 신규 잔존 파일은 본 보고서 1개뿐이다. 임시 `.tmp-s9-recon.mjs`와 Vite 프로세스는 종료 시 회수했다.

## 9. 이 라운드가 보지 않은 것

- 실제 한 계열 10,001건을 DB에 만들지 않았다. DB 쓰기 금지 때문에 실 53건 첫 응답의 페이지 메타만 2페이지로 바꾸고 후속 페이지 중단 경로를 발화시켰다.
- 실제 복원 성공은 실행하지 않았다. 버튼 도달·이벤트 전파·실패 배너만 확인했다.
- 현재 DB에 존재하지 않는 `견적 VIEW 있음 + 주문 VIEW 없음` 커스텀 계정의 실제 로그인 화면은 보지 못했다.
- 저장소 밖 파트너 PWA 또는 제3자 API 소비처의 `submittedAt` 표시 의미는 확인하지 못했다.
- Electron 패키징 앱과 장시간/대용량 성능은 보지 않았다.
