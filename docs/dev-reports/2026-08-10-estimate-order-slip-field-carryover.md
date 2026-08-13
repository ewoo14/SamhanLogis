# 견적서 · 주문서 → 판매전표 **필드 계승** 전수 대조

> 개발책임자 지시 (2026-08-10)
> *"주문서도 **판매전표 정보는 모두 가지고 있어야** 해. 그래야 판매전표로 그대로 전환할 수 있으니까."*
> *"이는 **견적서도 마찬가지**야."*
> *"다만 **견적서는 거래처가 반드시 기초 거래처가 아니라도 생성할 수 있어야** 하므로 주의해."*

> ⚠️ 개발책임자 정정 — **견적서 → 주문서 경로는 없습니다.** 실제 흐름은
> `견적서 → 판매전표` · `견적서 → 종합견적서 웹 → 판매전표` · `주문서 → 판매전표` 입니다.
> 즉 견적서와 주문서는 **판매전표로 수렴하는 두 병렬 입구**입니다.

> 워크플로우 11에이전트 · 조사 5축 병렬 → 3-way 매트릭스 → 적대검증 4각도 → 슬라이스 제안


## 결론 — 요구는 "필드 추가"가 아니라 **네 층 동시 개방**입니다

검증 기준: origin/main 워크트리 `wmain` HEAD `22427d9c6`. 제 재측정 시각 **2026-08-10 14:13~14:16 KST** (병렬 트랙 공유 DB, 읽기 전용 psql). 소스 무수정·git 무조작·Docker 무기동.

### 실측 기반 골격 (제가 직접 재측정)
`slips` **86컬럼** / `slip_lines` **26컬럼** / `estimates` **29컬럼** / `estimate_lines` **25컬럼** / `partner_orders` **26컬럼** / `partner_order_lines` **21컬럼**.
컬럼 집합 차집합(`comm` 실측):
- **헤더**: slips 에만 있고 견적·주문 **둘 다에 없는 컬럼 62개**. 견적 대비 69개, 주문 대비 68개 부족.
- **라인**: slip_lines 에만(견적 대비) **4개** — `category_key`·`unit_price_domain`·`source_order_line_id`·`slip_id`. slip_lines 에만(주문 대비) **11개** — `specification`·`set_head`·`parent_set_model`·`bundle_set_options`·`unit_price`·`unit_price_with_vat`·`line_total`·`note`·`unit_price_domain`·`source_order_line_id`·`slip_id`.
- ⟹ **견적서는 라인 수준에서 거의 전표와 동형**이고, **주문서만 구조적으로 비어 있습니다.** 개발책임자께서 "주문서 (묶음 처리·구성품 펼침)은 채워줘야지" 라고 하신 판단이 데이터로 정확히 확인됩니다.

### 요구가 지금 성립하지 않는 이유 3가지
1. **주문서에 세트 계보 3필드가 아예 없습니다** — `set_head`/`parent_set_model`/`bundle_set_options` 컬럼 부재(실측). 그래서 BUNDLE 부모를 1행으로 담고, 전환 시 `SlipPublishService.java:784-787` 이 400 으로 거부합니다. **활성 주문 324/567(57.1%)이 지금 전환 불가**입니다 — 제가 `product_id` 축으로 재측정해 331라인/324주문을 확인했고, 조사 2(`model_name` 축)와 조사 5(`product_id` 축)가 서로 다른 조인 키로 같은 값에 수렴했습니다.
2. **견적→주문 고리가 끊겨 있습니다** — `EstimateClient` 운영 구현이 `FixtureEstimateClient.java:17-19` 하나뿐이고 무조건 `Optional.empty()`. 사슬의 가운데가 죽어 있습니다.
3. **거래처 개방성이 주문 단계에서 소멸합니다** — `partner_orders.partner_code`·`biz_code` 는 **NOT NULL**(실측)이고 **`partner_name` 컬럼이 없습니다**(실측). 견적이 표현할 수 있는 미등록 거래처를 주문이 담을 자리가 구조적으로 없습니다.

---

## 🚨 조사 간 어긋남 — 7건 전부 실측으로 판정했습니다 (임의 선택 없음)

**① 미등록 거래처 견적 실재 여부 — 조사 3 ↔ 조사 5 정면 충돌. 조사 3 이 맞습니다.**
조사 5: *"미등록 거래처 견적은 실재하며 동작 중"* / 조사 3: *"그 1건은 legacy 행이지 미등록 거래처 견적이 아니다"*.
제 실측(14:13 KST): `partner_id IS NULL` 견적은 `2026/07/16-9` 1건이고 그 `partner_name` **부산냉난방테크는 partner_db 에 등록돼 있습니다** — `e8ae9c86-afe1-3364-b484-1f5a2bf31313` / `P-2026-0003` / `139-21-10093` / `is_deleted=f`. ⟹ **미등록 거래처 견적 실 표본 = 0건. "판정 불가"이며 "동작 중"이 아닙니다.**

**② 조사 4 의 `PartnerOrderDetailResponse.java` 좌표가 틀렸습니다. 조사 2 가 정확합니다.**
원문 실측: `:78` partnerName=null · `:86` siteAddress=null · `:87` contactPhone=null · `:191` bundleMode=null · `:193` expandedComponents=List.of().
조사 4 는 `:186`/`:188`/`:80-81` 로 적었습니다 — 그 줄에는 각각 `line.getVatAmount()`·`line.getLineTotal()`·`order.getStatus().name()` 이 있습니다.

**③ 조사 5 의 `EstimateToSlipConverter` 세트 승계 좌표가 틀렸습니다. 조사 4 가 정확합니다.**
실측 `assignBundleComponent` 는 **`:126-129`**. 조사 5 는 `:128-131`.

**④ `partner_orders.slip_no` 15건 — 조사 2(0건) ↔ 조사 5(15건). 둘 다 맞고 필터가 다릅니다.**
실측: **15건 전부 `is_deleted=true`**. 조사 2 는 활성(0/567), 조사 5 는 전체 기준. ⟹ 조사 5 가 *"화면·통계가 발행됨으로 셀 수 있다 · 별개 도달 결함 후보"* 라 한 것은 **약화됩니다** — `@SQLRestriction(is_deleted=false)` 로 전 조회에서 걸러집니다. 다만 직접 SQL 통계는 여전히 셀 수 있어 완전 해소는 아닙니다.

**⑤ `slips.partner_id IS NULL` — 조사 5 "8건" ↔ 제 실측 활성 1건.** 전체 144 기준 8건이고 그중 **7건이 soft-deleted**, 활성은 1/128. 조사 5 가 필터를 안 밝혀 오해를 부릅니다.

**⑥ SINGLE 품목 2,718(조사 2) ↔ 2,720(조사 5).** 실측: 활성 2,718 + 삭제 2 = 2,720. 둘 다 맞습니다.

**⑦ `BundleModePolicy` 좌표** — 실측 메서드 `:12-16`. 조사 2(`:12-16`) 정확, 조사 3(`:13-17`) 1줄 밀림.

> ④⑤⑥ 은 같은 병증입니다 — **활성/전체 필터를 안 밝힌 수치**. 이 보고서의 모든 수치는 활성/전체를 명시했습니다.

### 제가 원문 재현으로 확증한 핵심 주장 (릴레이 아님)
- `SlipPublishService.java:135` 가 `verifiedPartnerId` 를 얻고 **`:150-153` 이 partnerId 자리에 `null` 을 넘깁니다**. `:171-173` 에서 사업자번호 조회에만 쓰고 버립니다 — 조사 1·3 의 🚩 가 정확합니다.
- `Slip.java:1108-1111` send() 거래처 가드, `:1126-1131` `requirePartnerForCommitted` 확인. **다만 호출처는 조사 1 이 적은 7곳이 아니라 8곳**입니다(`1143·1159·1172·1188·1205·1220·1239·**1262**`).
- `EstimateFormPage.tsx:1758` `legacyWithoutPartner = isEdit && !hydratedPartnerId` 및 `:1759-1765` 저장 중단 원문 확인.
- `PartnerOrderConvertService.java:198-207` 헤더 payload 9키 · `:154-162` 라인 payload 7키 확인. `PublishFromPartnerOrderRequest` 16필드에 **`orderNo` 가 없음** 확인 — 조용히 버려집니다.
- `EstimateToSlipConverter.java:77-78` placeholder 창고 `00000000-0000-0000-0000-000000000001` 하드코딩 확인.

### 발화 조건 카운트 — 라이브 재현 불가
전환 산출물 표본이 세 축 모두 **0**입니다(`estimates.converted_slip_id` 0 · `partner_orders.source_estimate_id` 0 · `slips.source_type='ESTIMATE'/'PARTNER_ORDER'` 0 · `slip_source_orders` 0행 · 활성 `slip_no` 0). **표본 0 = "결함 0" 이 아니라 "판정 불가"** 이며, 아래 판정은 전부 컬럼 실측 + 코드 경로 근거입니다. 컬럼 집합 대조는 인스턴스 수와 무관하게 성립하므로 표본 0 에도 결론이 흔들리지 않습니다.


---

## 필드 매트릭스 (판매전표 기준)


| 필드 | 판매전표 | 주문서 | 견적서 | 판정 |
|---|---|---|---|---|
| slip_type (문서 종류) | 있음 (Slip.java:107-109, NOT NULL · 생성 요청의 유일한 @NotNull 스칼라 CreateSlipRequest.java:50) | 없음 (문서 자체가 주문) | 없음 (문서 자체가 견적) | 전환 가능 — 전환 시 OUTBOUND 고정 생성. 원본 보유 불필요 |
| slip_no (전표번호) | 있음 (Slip.java:111-112 · 서버 채번 SlipService.java:272 · (slip_type,slip_no) 활성 partial UNIQUE) | 이름 다름 (order_no, PartnerOrder.java:62-63, NOT NULL 실측) | 이름 다름 (estimate_no, Estimate.java:82-83) | 전환 가능 — 전환 시 새로 채번. 단 원 문서번호를 전표에 남기는 경로는 source_id 뿐(아래 참조) |
| slip_date (전표일자=상차일) | 있음 (Slip.java:114-115, NOT NULL · 마감·컷오프 게이트 기준) | 없음 (created_at 만) | 이름 다름 (estimate_date, Estimate.java:85-86) | 🔴 전환 시 유실 — 세 경로 전부 전환 실행일로 새로 찍는다. EstimateToSlipConverter.java:68 LocalDate.now(clock) · PartnerOrderConvertService.java:197 LocalDate.now() (원문 확인) |
| seq_no (일자 내 순번) | 있음 (Slip.java:117-118 · SlipService.java:273 서버 파생) | 없음 | 있음 (estimates.seq_no, 실측 컬럼 존재) | 전환 가능 — 서버가 slip_no 에서 추출 |
| status (상태) | 있음 (Slip.java:120-122 · 10단계 SlipStatus.java:50-61) | 있음 (6값 · 실측 활성 567건 전건 DRAFT) | 있음 (5값 · 실측 활성 24건 전건 QUOTE_DRAFT) | 전환 가능 — 전환 결과는 항상 DRAFT 로 생성 |
| version (낙관적 락) | 있음 (Slip.java:647-649 @Version) | 이름 다름 (lock_version NOT NULL 실측) | 있음 (version) | 전환 가능 — 새 문서라 0 부터 |
| partner_id (거래처 UUID) | 있음 (Slip.java:124-125 · DB nullable 실측 · 생성 허용, send() 필수 :1108-1111 · 커밋 전이 8곳 재확인 :1126-1131) | 있음 (DB nullable 실측 · 활성 566/567 채움) | 있음 (DB nullable 실측 · 활성 23/24 채움 · 도메인 필수 아님 Estimate.java:186 '선택') | 보완 필요 — 셋 다 컬럼은 nullable 이나 필수 강제 시점이 전부 다르다. 상세는 partnerConstraint 절 |
| partner_name (거래처명) | 있음 (Slip.java:127-128 · 실측 전체 144/144 채움) | 없음 — partner_orders 26컬럼 실측에 부재. 응답은 하드코딩 null (PartnerOrderDetailResponse.java:78 상세 · PartnerOrderSummaryResponse.java:60 목록, 원문 확인) | 있음 (estimates.partner_name · 실측 활성 24/24 채움) | 🔴 원본에 없어 새로 입력 — 수신 계약 PublishFromPartnerOrderRequest.java:32 에 자리가 있어도 단건 convert 가 안 보낸다(:198-207 원문 확인) → 주문 경유 전표는 partner_name 이 null |
| partner_code (거래처 코드 · 사용자 노출 식별자) | 있음 (Slip.java:149-150 · 실측 활성 127/128) | 있음 (NOT NULL 실측 · distinct 33종 전부 partner_db 해소) | 없음 — estimates 29컬럼 실측에 부재 | 보완 필요 — 견적 전환은 partnerId 로 partner-service 역조회(EstimateToSlipConverter.java:88-91), partnerId 가 null 이면 조회 자체를 건너뛰어 전표 partner_code 도 null |
| business_number (사업자번호) | 있음 (Slip.java:558-559 · 실측 전체 136/144) | 이름 다름 (biz_code NOT NULL 실측 · 거래처 정체성 해석 키) | 이름 다름 (partner_business_no · 실측 활성 20/24, 공백 4건) | 보완 필요 — 견적 전환은 withProjectInfo 1번 인자로 전달(EstimateToSlipConverter.java:92 원문 확인). 주문 전환은 bizCode 를 보내나 전표는 partnerId 로 역조회하는 별개 경로 |
| customer_tel · customer_address · customer_representative (거래처 대표 연락처/주소/대표자, legacy U_MEMO1~3) | 있음 (Slip.java:472-485 · 실측 전체 58 · 49 · 60 / 144 — 죽은 컬럼 아님) | 없음 (SlipPublishService.java:254-255 주석이 'partner-order DTO 에 customer* 필드 없음 → null 보존' 명시) | 부분 (partner_address 만 존재 · 실측 활성 0/24 전부 공백 — PartnerOption 에 address 필드 부재 + EstimateFormPage.tsx:1198 address:null 하드코딩) | 🔴 원본에 없어 새로 입력 — 견적 전환은 applyEcountSchema 를 아예 호출하지 않는다(EstimateToSlipConverter.java:66-141 전체 원문 확인) |
| source_warehouse_id (출고 창고) | 있음 (Slip.java:164-165 · DB nullable 실측이나 OUTBOUND 도메인 필수 :698-700 · 실측 전체 134/144 · 프런트 저장 필수조건 SlipFormPage.tsx:1966-1968) | 없음 — 전환 시 warehouseCode 를 사용자가 새로 입력(ConvertToSlipRequest.java:24, blank 면 409). 사문화 상수 PartnerOrderConfirmService.java:64-66 DEFAULT_WAREHOUSE_ID 참조 0건 | 없음 | 🔴 원본에 없어 새로 입력 — 견적 전환은 실재하지 않는 placeholder UUID 00000000-0000-0000-0000-000000000001 하드코딩(EstimateToSlipConverter.java:77-78 원문 확인). inventory_db.warehouses 에 그 행 0건(조사 3·4 독립 일치). 주석 :75 가 '영업이 SlipForm 수정 시 교체' 를 전제 ⟹ '그대로 전환' 과 배치 |
| source_warehouse_code + 워커 8필드 (_pending · _snapshot_status · _attempt_count · _next_attempt_at · _claimed_at · _claim_token · _last_error · _abandoned_at) | 있음 (Slip.java:168-203, V101·V102·V103·V107 · 실측 source_warehouse_code 활성 126/128) | 없음 | 없음 | 보완 필요 — 워커 8필드는 업무 데이터가 아니라 전환 대상 아님. 단 source_warehouse_code 는 provenance 이고 견적 전환이 setSourceWarehouseCode 를 호출하지 않아 null(발행 경로 SlipPublishService.java:154 는 호출 — 원문 확인) |
| destination_warehouse_id · destination_warehouse_name (도착 창고) | 있음 (Slip.java:205-220 · INBOUND 도메인 필수 :727-729 · 실측 destination_warehouse_name 활성 0/128) | 없음 | 없음 | 전환 가능 — INBOUND 전용 축. OUTBOUND 전환에는 불필요하며 없는 것이 정상 |
| delivery_tag (지방/야적/당일/반납렌탈 등 11값) | 있음 (Slip.java:222-224 · DeliveryTag.java:17-27 · slipType 방향 정합 검증 · 실측 전체 8/144) | 없음 (partner-order-service 전체 grep 0건 — 조사 2) | 없음 | 🔴 원본에 없어 새로 입력 — 견적 전환은 항상 null(EstimateToSlipConverter.java:95 주석 '견적 변환 시 항상 null' 원문 확인). 메모리 규칙상 지방/야적은 태그이지 주소 접두가 아니므로 문자열로 우회 불가 |
| unload_date (하차일 N) | 있음 (Slip.java:239-240, V52 · 실측 활성 2/128 · 지방/야적 태그만 값 보유) | 없음 | 없음 | 🔴 원본에 없어 새로 입력 — delivery_tag 파생이라 태그가 없으면 계산 자체가 불가(EstimateToSlipConverter.java:138 applyDeliverySchedule(null,null) 원문 확인) |
| delivery_address (실제 인수 현장 주소) | 있음 (Slip.java:567-568, V20 · 실측 전체 8/144) | 있음 (delivery_address VARCHAR(500), V14 · 실측 활성 0/567 — FE 가 안 보냄, samhanApi.ts:381) | 없음 | 보완 필요 — 주문은 컬럼도 있고 전환 payload 에도 실린다(PartnerOrderConvertService.java:206 원문 확인). 유일하게 주문→전표로 승계되는 배송 필드이나 실 데이터 채움률 0 |
| shipping_address · inspection_address · receiver_phone (배송지·검수지·현장 수령자 연락처, legacy U_TXT1/ADD_TXT_01_T/ADD_TXT_03_T) | 있음 (Slip.java:494-511 · 실측 전체 0 · 0 · 0 / 144) | 없음 — 단건 convert 는 입력 슬롯조차 없음(ConvertToSlipRequest.java:19-22). 병합만 MergeConvertToSlipRequest.java:62-69 ShippingInfo 로 사용자 재입력 | 없음 | 🔴 원본에 없어 새로 입력 — 수신 계약 PublishFromPartnerOrderRequest.java:36/:38 에 자리는 있으나 주문에 보낼 값이 없다(원문 확인) |
| supervision_address · project_name · recipient_phone (감리주소·프로젝트명·인수자 번호) | 있음 (Slip.java:577-596, V20 · 실측 전체 1 · 0 · 0 / 144) | 없음 | 없음 | 🔴 원본에 없어 새로 입력 — 두 경로 모두 withProjectInfo 6인자 중 1번만 넘기고 나머지 5개에 명시적 null 전달(EstimateToSlipConverter.java:92 원문 확인) |
| payment_due_label (결제 만기 라벨) · payment_due_date (입금예정일 DATE) | 있음 (Slip.java:519-520 · :604-605 · 실측 전체 0 · 0 / 144) | 부분 (due_date DATE 있음 · 실측 활성 0/567) — 🔴 전환 payload 에도 수신 DTO 에도 대응 필드 없음(PublishFromPartnerOrderRequest 16필드 원문 확인) | 부분 (valid_until 은 견적 유효기간이지 납기가 아님 · 실측 NULL 4/24) | 🔴 전환 시 유실 — 주문이 due_date 를 갖고 있어도 전달 경로가 아예 없다. paymentDueLabel 은 계약 :40 에 자리만 존재 |
| discount_info (할인 정보 자유 텍스트, legacy ADD_TXT_06_T) | 있음 (Slip.java:528-529 · 실측 전체 2/144) | 없음 (수신 계약 :41 에 자리만 존재 · 병합만 ShippingInfo 로 재입력) | 없음 | 🔴 원본에 없어 새로 입력 — 메모리 규칙상 고정DC/전역DC 와 무관한 인쇄·감사 reference |
| collect_term · agree_term (대금 회수 조건 · 거래 약정 조건, legacy COLL_TERM/AGREE_TERM) | 있음 (Slip.java:536-545 · 실측 전체 0 · 0 / 144) | 없음 | 없음 | 🔴 원본에 없어 새로 입력 — agree_term 은 할인과 무관(메모리 규칙: '약정DC' 는 없는 말) |
| memo (사용자 자유 메모) | 있음 (Slip.java:226-227, ≤1000 · 실측 전체 12/144) | 있음 (memo VARCHAR(1000), V4 · 실측 활성 0/567 — confirm 경로로는 입력 불가) | 있음 (memo VARCHAR(1000)) | 🔴 전환 시 유실 — ① 주문은 값이 있어도 단건 convert payload 9키에 memo 가 없다(PartnerOrderConvertService.java:198-207 원문 확인, 수신 자리 :39 는 존재) ② 병합은 주문 memo 를 무시하고 ShippingInfo 입력값으로 덮는다 ③ 견적은 계승되나 '[견적변환: {번호}] ' 접두가 강제로 붙어 원문이 오염된다(EstimateToSlipConverter.java:86 buildSlipMemo) |
| requester_id (담당자 · NOT NULL) | 있음 (Slip.java:242-243 · 수기=X-User-Id UUID, 발행=employeeCode 우선 SlipPublishService.java:679-687 — 한 컬럼에 두 도메인 혼재) | 없음 (employeeCode grep 0건 — 조사 2 · created_by 만 존재) | 있음 (requester_id NOT NULL — 견적 도메인의 유일한 필수값 Estimate.java:199-201) | 보완 필요 — 견적 전환은 승계(EstimateToSlipConverter.java:87 원문 확인). 주문 전환은 employeeCode 를 안 보내 내부 호출자 ID 가 각인된다(조사 4 단독 근거, 저는 pickRequester 원문만 확인) |
| source_type · source_id (발행 출처 · 원천 문서 식별자) | 있음 (Slip.java:1648/:1661 · 실측 전체 144/144 MANUAL, source_id 0/144 — 전환 표본 0) | 부분 (source_estimate_id UUID, V6 · 실측 활성 0/567) | 부분 (converted_slip_id · converted_at · 실측 활성 0/24) | 보완 필요 — 견적 전환은 sourceId 에 견적번호를 넣어 사용자 표시가 가능(EstimateToSlipConverter.java:134). 주문 전환은 주문 UUID 만 남고 orderNo 는 payload 에 넣지만 PublishFromPartnerOrderRequest 16필드에 그 이름이 없어 Jackson 이 조용히 버린다(:202 ↔ DTO 원문 대조 확인) |
| idempotency_key (발행 멱등키) | 있음 (Slip.java:1670 · partial UNIQUE uq_slips_idem_key · 실측 활성 0/128) | 있음 (NOT NULL 실측 · PO-CONF-{code}-{seq} / PO-EST-{id}) | 없음 | 전환 가능 — 전환 시 결정적으로 생성(PartnerOrderConvertService.java:166) |
| slip_source_orders (전환 원천 주문 역참조 N:1 — partner_order_id + order_no) | 있음 (V30 별도 테이블 · 실측 0행) | 부분 (slip_no 컬럼 — 실측 15건 전부 is_deleted=true, 활성 0/567) | 없음 | 근거 부족 — 실 전환 표본 0건이라 동작 미확인. 사용자 표시용 주문번호를 전표에 남기는 유일한 자리이므로 orderNo 유실(위 항목)의 대안 후보 |
| 라이프사이클 8필드 (accepted_by · accepted_at · completed_at · confirmed_at · dispatcher_user_id · dispatcher_signed_at · inspector_user_id · inspector_signed_at) | 있음 (Slip.java:245-278 · 전이 시 자동 기입 :1148-1149 · :1193-1194) | 없음 (confirmed_at 은 주문 확정 시각이라 이름만 같고 의미가 다름 — 혼동 주의) | 없음 (sent_at/accepted_at/rejected_at/converted_at 은 견적 자체 lifecycle) | 전환 가능 — 전표 전용 lifecycle. 전환 결과가 DRAFT 이므로 전부 null 인 것이 정상 |
| 인수자 서명 8필드 (signed_at · signer_name · signature_png · signature_hash · signature_channel · signature_source · signature_share_token · signature_share_expires_at) | 있음 (Slip.java:332-393 · PNG≤50KB bytea + SHA-256 재계산 · 서명 가능 단계 INSPECTING/COMPLETED/SHIPPING · 실측 signed_at 활성 0/128) | 없음 | 없음 | 전환 가능 — 전표 전용. 전환 시점에 존재할 수 없는 값 |
| 기사 서명 5필드 (driver_signed_at · driver_signature_png · driver_signature_hash · driver_signature_channel · driver_signature_source) | 있음 (Slip.java:400-424 · share token 은 인수자 것 재사용) | 없음 | 없음 | 전환 가능 — 전표 전용 |
| 배차·배송 5필드 (driver_name · driver_phone · delivery_batch_id · dispatch_status · classified_region_group) | 있음 (Slip.java:285-324 · :161-162 · dispatch_status NOT NULL default UNDISPATCHED, DB CHECK 3값 · 실측 활성 driver_name 5 · driver_phone 5 · delivery_batch_id 0 · classified_region_group 0 / 128) | 없음 (driver_name grep 0건 — 조사 2) | 없음 | 전환 가능 — 배차 축은 전표 생성 이후에 붙는 독립 축. classified_region_group 은 채우는 실경로가 미확인이라 별건 |
| lock_flag (회계 마감 lock) | 있음 (Slip.java:440-441 NOT NULL default false · accounting-service 가 POST /internal/slips/lock-by-period 로 일괄 설정) | 없음 (lockFlag grep 0건 — 조사 2) | 없음 | 전환 가능 — 상태 lifecycle 과 독립 축이며 사후 설정 |
| printed_at (인쇄 시각) | 있음 (Slip.java:613-614, V20 · recordPrint() :1774 · 실측 전체 0/144) | 없음 | 없음 | 전환 가능 — 전표 인쇄 시점 기록 |
| revision_count · revision_count_baseline · redline_anchor_revision_no | 있음 (Slip.java:625-645) | 부분 (revision_count NOT NULL 실측 · baseline/anchor 없음) | 없음 (estimates 29컬럼 실측에 revision_count 부재 · 별도 estimate_revisions 47행으로 관리) | 전환 가능 — 새 문서라 0 부터 시작 |
| io_type · time_date (레거시 e-Count IO 구분/발행시각) | 있음 (Slip.java:454-464 · 서버 자동 '10'/'11' + HHmmss · 실측 전체 144/144 둘 다 채움) | 없음 | 없음 | 🔴 전환 시 유실 — 견적 전환만 null 이다. 발행 경로는 applyEcountSchema 로 채운다(SlipPublishService.java:165-170 원문 확인) ⟹ 같은 출고전표인데 생성 경로에 따라 컬럼 채움이 갈리는 비대칭 |
| id · deleted_by_name · BaseEntity 7 (created_at/by · modified_at/by · deleted_at/by · is_deleted) | 있음 (BaseEntity.java:21-42 · @SQLRestriction(is_deleted=false) Slip.java:60 · deleted_by_name :136-137) | 있음 (동일 7 + deleted_by_name) | 있음 (동일 7 + deleted_by_name) | 전환 가능 — 새 문서의 감사값을 신규 생성. UUID 비공개 가드 때문에 화면 노출은 deleted_by_name 만 |
| 헤더 합계 (총 공급가액 · 총 부가세 · 총 합계) | 없음 — slips 86컬럼 실측에 total_* 부재. 매번 라인에서 유도(SlipDisplayAmount.java:24-47) | 있음 (total_amount NOT NULL — VAT 포함 합계 1개만) | 있음 (total_supply · total_vat · total_amount 3개 NOT NULL, Estimate.java:116/:120/:124) | 전환 가능 — 방향이 반대다. 전표는 라인이 권위이므로 헤더 합계를 옮기면 안 되고, 견적 헤더 합계가 사라지는 것이 정상. 🚩 전표에 합계 컬럼을 만드는 제안은 현행 권위 구조를 깨뜨린다 |
| line: product_id · product_name · model_name | 있음 (SlipLine.java:62-69 · product_id NOT NULL + product-service 실재 검증 ProductClient.java:27-30 · 실측 model_name 활성 302/302) | 있음 (product_id 는 V15 로 nullable · 실측 활성 586/586 채움 · model_name NOT NULL) | 있음 (product_id NOT NULL · 🚩 비세트 라인은 존재 검증 없음 — 조사 3 이 Javadoc :183 과 코드 :110-123 불일치 지적) | 전환 가능 — 세 문서 공통 보유 |
| line: specification (규격) | 있음 (SlipLine.java:71-77, ≤50 · 실측 활성 190/302) | 없음 — partner_order_lines 21컬럼 실측에 부재. 업무 의미 grep 0건(16 hit 전부 JPA Specification) | 있음 (estimate_lines.specification · 실측 비공백 18/35 · 세트 구성품은 GAS 규격 우선 EstimateService.java:151-153) | 🔴 원본에 없어 새로 입력 — 주문 경유는 영구 소실. 수신 계약 PublishLineRequest.java:34 spec 에 자리가 있으나 보낼 값이 없다. 상류 product-service 는 이미 반환(ProductSummaryResponse.java:55) |
| line: quantity | 있음 (NOT NULL · @Positive · DB CHECK >0) | 있음 (NOT NULL · CHECK >0 · @Min(1)) | 있음 (NOT NULL · CHECK >0) | 전환 가능 |
| line: unit_price (VAT 제외 공급 단가) | 있음 (SlipLine.java:82-83 NOT NULL NUMERIC(15,2) · DB CHECK >=0) | 없음 — price_vat(VAT 포함)만 보유. 실측 21컬럼에 공급단가 부재 | 있음 (unit_price NOT NULL · VAT 포함 라인에서는 역산 비권위값) | 보완 필요 — 주문은 VAT 포함 단가만 있어 전표가 재계산한다. 수신 계약 PublishLineRequest.java:36 unitPriceExVat 도 미전송 |
| line: unit_price_with_vat (VAT 포함 단가 · 2026-06-09 이후 화면 입력 도메인) | 있음 (SlipLine.java:88-94 · 실측 활성 301/302) | 이름 다름 (price_vat NOT NULL · 서버 DC 적용 후 값, 클라이언트 가격 무시) | 있음 (unit_price_with_vat, V35 · 실측 34/35 · non-null 여부가 provenance 판정 기준) | 전환 가능 — 세 문서 모두 VAT 포함 단가를 보유하며 실제로 전달되는 유일한 금액 축 |
| line: supply_amount · vat_amount (공급가액 · 부가세) | 있음 (SlipLine.java:96-109 · 실측 활성 301 · 301 / 302 · 라인 단위 권위값) | 있음 (V12 · 실측 활성 585 · 585 / 586 · DB CHECK ck_partner_order_lines_amount_identity 로 S+V=subtotal 강제) | 있음 (NOT NULL · CHECK >=0) | 🔴 전환 시 유실 — 주문이 확정한 S/V 를 전환 payload 7키에 안 싣는다(PartnerOrderConvertService.java:154-162 원문 확인). 수신 자리 PublishLineRequest.java:38-39 는 존재. 부작용으로 SlipPublishAudit 합계가 항상 0 으로 적재(조사 4 근거) |
| line: line_total (라인 합계) | 있음 (SlipLine.java:85-86 NOT NULL NUMERIC(17,2) · CHECK >=0 · 공급가액과 같은 값이나 계약상 별도 보존) | 이름 다름 (subtotal NOT NULL — VAT 포함 합계 T) | 있음 (line_total NOT NULL — VAT 포함 합계 T) | 보완 필요 — 같은 이름이 전표에서는 공급가액, 견적·주문에서는 VAT 포함 합계로 의미가 갈린다. 전환 구현이 이름만 보고 매핑하면 10% 어긋난다 |
| line: unit_price_domain (금액 권위 도메인) | 있음 (SlipLine.java:111-124, V59 · DB CHECK VAT_INCLUSIVE/SUPPLY · 실측 활성 78/302, 나머지는 V59 이전 legacy) | 이름 다름 (amount_authority NOT NULL default PRICE, V17 · 실측 활성 PRICE 586 전건) | 이름 다름 (unit_price_with_vat 의 non-null 여부가 provenance 를 대신함 — 전용 컬럼 없음) | 🔴 전환 시 유실 — 주문의 amount_authority 가 PublishLineRequest 12필드에 없어 전표 라인은 무조건 VAT_INCLUSIVE 로 각인된다. 라인을 평면 재생성하면 도메인이 SUPPLY 로 떨어져 표시 단가가 10% 어긋나므로 SlipLine.copyOf(:427-446) 규칙 재사용 필요 |
| line: set_head · parent_set_model · bundle_set_options (세트 계보 3종) | 있음 (SlipLine.java:141-152, V34·V114 · 실측 활성 set_head 77 · parent_set_model 202 · bundle_set_options 20 / 302 — 세트 전개가 실데이터의 3분의 2) | 없음 — partner_order_lines 21컬럼 실측에 3개 전부 부재. 응답 bundleMode 는 하드코딩 null(PartnerOrderDetailResponse.java:191 원문 확인), expandedComponents 는 하드코딩 List.of()(:193 원문 확인) | 있음 (estimate_lines.set_head · parent_set_model · bundle_set_options, V34·V115 · 실측 6 · 15 · 0 / 35 — bundle_set_options 는 V115 이후 저장분 없음) | 🔴 원본에 없어 새로 입력 — 🚨 이 항목이 개발책임자 지시의 직접 대상이다. 견적→전표만 승계한다(EstimateToSlipConverter.java:126-129 assignBundleComponent 원문 확인). 주문은 컬럼·계약 양쪽에 없고 세트 부모를 1행으로 담아 전환이 400 으로 거부된다 — 활성 주문 324/567(57.1%) 재측정 확인 |
| line: category_key (판매 당시 분류축) | 있음 (SlipLine.java:137-139, V60 · 실측 활성 0/302) | 있음 (NOT NULL 실측 · 활성 commercialMulti 291 · singleSets 270 · homemulti 25) | 없음 — estimate_lines 25컬럼 실측에 부재 | 🔴 전환 시 유실 — 견적→전표는 미전달(EstimateToSlipConverter.java:122-125 가 categoryKey 없는 5-arg create 사용, 원문 확인), 주문→전표는 전달(PartnerOrderConvertService.java:161 원문 확인) ⟹ 같은 '전환으로 생긴 전표'인데 경로에 따라 분류축 보유가 갈리는 비대칭 |
| line: note (라인 메모) | 있음 (SlipLine.java:126-127, ≤200 · 실측 활성 0/302) | 이름 다름 (remark VARCHAR(500) · 실측 활성 584/586 — 세트 옵션을 담는 유일한 자리이나 비구조 텍스트) | 있음 (note ≤200) | 전환 가능 — 주문은 remarks 로(PartnerOrderConvertService.java:159), 견적은 getNote() 로 전달(EstimateToSlipConverter.java:116/:121/:125). 단 주문 remark 500자 → 전표 note 200자 절단 위험 |
| line: source_order_line_id (출처 주문 라인) | 있음 (SlipLine.java:129-135, V29 · 실측 활성 0/302 · copyOf 는 의도적 미승계 :420) | 없음 (라인 id 자체가 원본) | 없음 | 전환 가능 — 주문 전환이 sourceOrderLineId 로 전달한다(PartnerOrderConvertService.java:160 원문 확인). 부분전환 추적의 유일한 축 |
| line: line_no (라인 순번) | 없음 — slip_lines 26컬럼 실측에 부재. addLine 삽입 순서에만 의존 | 없음 (createdAt ASC, id ASC 정렬 PartnerOrder.java:124) | 있음 (estimate_lines.line_no NOT NULL · @OrderBy(lineNo ASC, id ASC)) | 보완 필요 — 전표에 담을 자리가 없고, 계약 PublishLineRequest.java:31 lineNo 는 두 convert 모두 미전송(원문 확인). 라인 순서 보존이 계약으로 보장되지 않는다 |
| line: specification_source (규격 provenance CATALOG/USER) | 없음 — slip_lines 26컬럼 실측에 부재 | 없음 | 있음 (V116 · 실측 활성 0/35 — V116 이후 저장분 없음) | 보완 필요 — 견적에만 있고 전표에 담을 자리가 없어 견적→전표에서 소실된다. 규격 자체는 승계되므로 우선순위는 낮다 |
| 주문 응답 전용 하드코딩 — siteAddress · contactPhone | 대응 유사 (supervision_address · recipient_phone) | 하드코딩 (PartnerOrderDetailResponse.java:86 · :87 원문 확인. record 선언 :35-36 외 코드베이스 출현 0건 — 컬럼·요청필드·채우는 코드 전부 없음. @JsonInclude(NON_NULL) :22 라 JSON 에서 아예 사라져 FE 도 존재를 모름) | 없음 | 근거 부족 — 의도된 출처를 찾지 못했다(조사 2 도 '못 찾음'). 설계 결정이 필요한 항목이며, 지금 상태로는 어느 전표 필드에 대응시킬지 확정할 수 없다 |

---

## 전환 유실 전수

- 🚨 [경로 ① 견적→주문] 경로 자체가 죽어 있다 — EstimateClient 의 유일한 운영 구현이 FixtureEstimateClient.java:17-19 이고 무조건 Optional.empty() 를 반환해 PartnerOrderFromEstimateService.java:59-62 가 항상 PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND 를 던진다. FE 호출자도 0건(조사 4 전수 grep). 실측 partner_orders.source_estimate_id 활성 0/567 (2026-08-10 14:13 KST). ⟹ '유실 필드 보강' 이전에 '이 고리를 연결한다' 가 먼저다.
- 🚨 [경로 ① 견적→주문] 계약에 세트 계보가 아예 없다 — EstimateClient.EstimateLineSnapshot(EstimateClient.java:29-41)에 setHead·parentSetModel·bundleSetOptions·specification·specificationSource·lineNo·unitPrice·unitPriceWithVat 가 없다. 견적에서 전개된 구성품이 계보 없는 평면 라인으로 주문에 들어가고, 그 다음 전표 전환에서 복원할 근거가 사라진다.
- 🚨 [경로 ① 견적→주문] 헤더 스냅샷 누락 — 계약 헤더(EstimateClient.java:18-27)는 estimateId·estimateNumber·partnerCode·bizCode·dueDate·memo 뿐. partnerName·partnerAddress·partnerBusinessNo·validUntil·estimateDate·totalSupply·totalVat·requesterId 가 전부 사라진다. 게다가 주문에는 이것들을 담을 컬럼도 없다(partner_orders 26컬럼 실측).
- 🚨 [경로 ③ 주문→전표] 세트 부모 주문은 전환이 400 으로 거부되고 우회 수단이 없다 — SlipPublishService.java:784-787 이 BundleModePolicy.shouldExpand(BundleModePolicy.java:12-16 원문 확인: productType==BUNDLE && bundleMode!=KEEP) 인 라인을 INVALID_INPUT 으로 던진다. partner-order-service 는 POST /products/internal/expand 를 한 번도 호출하지 않아 전개할 방법이 없다. 제 재측정(2026-08-10 14:14 KST, product_id 축): 활성 BUNDLE 품목 343개 전부 bundle_mode='EXPAND'(KEEP 0개) · 해당 활성 주문 라인 331건 · 해당 활성 주문 324건 = 활성 567건의 57.1%. 조사 2(model_name 축)와 조사 5(product_id 축)가 서로 다른 조인 키로 같은 값에 수렴했다.
- 🚨 [경로 ③ 주문→전표] 주문이 값을 갖고 있는데 안 보내는 것 4종 (즉시 고칠 수 있는 층) — ① memo(PartnerOrder.java:98, 수신 자리 PublishFromPartnerOrderRequest.java:39 존재) ② due_date(PartnerOrder.java:94, 수신 DTO 에 대응 필드 자체가 없음) ③ 라인 supply_amount·vat_amount(실측 활성 585/586 채움, 수신 자리 PublishLineRequest.java:38-39 존재) ④ 라인 amount_authority(실측 활성 PRICE 586 전건, 계약에 자리 없음). 근거는 PartnerOrderConvertService.java:154-162(라인 7키)·:198-207(헤더 9키) 원문 대조 — 제가 직접 확인했다.
- 🚨 [경로 ③ 주문→전표] 수신 계약에 자리가 있는데 주문에 컬럼이 없어 못 보내는 것 6종 (스키마 확장이 필요한 층) — partnerName(:32) · employeeCode(:33) · shippingAddress(:36) · receiverPhone(:38) · paymentDueLabel(:40) · discountInfo(:41). 추가로 orderApprovedAt(:42) 은 memo 결합 로직(SlipPublishService.java:725-737)이 준비돼 있는데 값을 안 보내 항상 미작동.
- 🚨 [경로 ③ 주문→전표] orderNo 가 조용히 버려진다 — PartnerOrderConvertService.java:202 가 payload.put("orderNo", order.getOrderNo()) 를 넣지만 PublishFromPartnerOrderRequest 의 16필드에 orderNo 가 없다(제가 원문 전체를 확인). Spring Boot 기본 FAIL_ON_UNKNOWN_PROPERTIES=false 라 오류 없이 사라진다. ⟹ 전표에 사용자 표시용 주문번호가 남지 않고 source_id 에 주문 UUID 만 남는다. 에러가 안 나서 지금까지 안 보였다.
- 🚨 [경로 ③ 주문→전표] 라인 계약 미전송 5종 — lineNo(:31) · spec(:34) · unitPriceExVat(:36) · supplyAmount(:38) · vatAmount(:39). spec 은 주문에 값 자체가 없고(specification 컬럼 부재), 나머지는 주문에 값이 있는데 안 보낸다. 결과적으로 전표가 unitPriceVat 로 전량 재계산하고 SlipPublishAudit 의 totalSupplyAmount/totalVatAmount 가 항상 0 으로 적재된다(조사 4 근거, SlipPublishService.java:803-808 → :287-289).
- 🚨 [경로 ③-B 병합 전환] 헤더 7종의 출처가 주문서가 아니라 사용자 재입력이다 — partnerName·shippingAddress·deliveryAddress·receiverPhone·paymentDueLabel·discountInfo·memo 가 MergeConvertToSlipRequest.java:62-69 ShippingInfo 로 들어온다. 즉 '주문서를 그대로 전표로' 가 아니라 '전환 화면에서 헤더를 다시 만든다' 가 현행이며, 단건 경로에는 그 입력 자리조차 없다(ConvertToSlipRequest.java:19-22). 병합도 각 주문의 memo·due_date 는 무시한다.
- 🚨 [경로 ② 견적→전표] 창고가 실재하지 않는 placeholder 다 — EstimateToSlipConverter.java:77-78 이 00000000-0000-0000-0000-000000000001 을 하드코딩하고(제가 원문 확인), inventory_db.warehouses 에 그 행이 없다(조사 3·4 독립 일치, warehouses 총 30건). 주석 :75 가 '영업이 SlipForm 으로 정확한 창고 지정 후 진행' 을 전제하므로 전환 후 사람 손이 반드시 필요하고, 이는 '그대로 전환' 과 배치된다.
- 🚨 [경로 ② 견적→전표] applyEcountSchema 를 한 번도 호출하지 않는다 — EstimateToSlipConverter.java:66-141 전체를 읽어 확인했다. 그래서 io_type·time_date·customer_tel·customer_address·customer_representative·shipping_address·inspection_address·receiver_phone·payment_due_label·discount_info 등 e-Count 계열이 전부 null 로 남는다. 반면 발행 경로는 SlipPublishService.java:165-170 에서 채운다 ⟹ 같은 출고전표인데 생성 경로에 따라 컬럼 채움이 갈린다.
- 🚨 [경로 ② 견적→전표] withProjectInfo 6인자 중 1번만 넘긴다 — EstimateToSlipConverter.java:92 slip.withProjectInfo(estimate.getPartnerBusinessNo(), null, null, null, null, null) 원문 확인. delivery_address·supervision_address·project_name·recipient_phone·payment_due_date 5필드에 명시적 null 을 전달한다.
- 🚨 [경로 ② 견적→전표] 분류축(category_key) 비대칭 — EstimateToSlipConverter.java:122-125 는 categoryKey 없는 create 를 쓰고, 주문 경로 PartnerOrderConvertService.java:161 은 categoryKey 를 전달한다. 같은 '전환으로 생긴 전표' 인데 분류축 보유가 경로에 따라 갈린다.
- 🚨 [경로 ② 견적→전표] 발행 API 는 검증한 partnerId 를 버린다 — SlipPublishService.java:135 가 verifiedPartnerId 를 얻고도 :150-153 Slip.createOutbound 의 partnerId 자리에 null 을 넘긴다(제가 원문 확인). :171-173 에서 사업자번호 조회에만 쓰고 버린다. 반면 주문 경로(:236-239)는 partnerId 를 그대로 넘긴다 — 비대칭. 그 결과 견적 발행 전표는 Slip.java:1108-1111 send() 에서 막히고 사후 backfill 에 의존한다. 실측 source_type='ESTIMATE' 전표 0건이라 라이브 재현은 불가하다.
- [세 경로 공통] 문서 일자가 전환 실행일로 새로 찍힌다 — EstimateToSlipConverter.java:68 LocalDate.now(clock) · PartnerOrderConvertService.java:197 LocalDate.now()(원문 확인). 견적일·주문일이 전표에 남지 않는다.
- [경로 ② 견적→전표] memo 원문이 오염된다 — buildSlipMemo(EstimateToSlipConverter.java:86 → :163-170)가 '[견적변환: {번호}] ' 접두를 강제로 붙인다. 계승되기는 하나 사용자 자유 입력 원문 그대로는 아니다.
- [잠복] PUT 수정이 전환 이력을 파괴한다 — PartnerOrderUpdateService.java:78 replaceLines → PartnerOrder.java:387-401 이 기존 라인을 markDeleted 하고 새 객체로 교체하는데, toLine 이 호출하는 createFromAuthoritativeAmounts 가 convertedQuantity 를 세팅하지 않아 0 으로 리셋된다. update() 에 CONVERTED 차단 가드도 없다. 실측 converted_quantity>0 인 라인이 활성 0/586 이라 아직 발화하지 않았다 — 전환을 실제로 열면 그때 터진다(조사 2 근거, 저는 미검증).
- [주의 · QA 잔재] 조사 5 가 partner_orders.remark 에서 'codex-r4-985-r4' 같은 QA 라운드 식별자를 발견했다. 주문 599건 상당수가 2026/07/29 생성 QA 산물로 보이며 BUNDLE 라인 331건의 다수가 여기 속할 수 있다. '주문 57.1% 가 세트를 담는다' 는 구조적 결론(주문에 전개 컬럼이 없다)에는 영향이 없으나, 업무 빈도로 인용할 때는 QA 잔재를 걸러야 한다. → feedback_qa_rounds_pollute_shared_data
- [정정] partner_orders.slip_no 15건이 실재하지 않는 전표를 가리키는 건 — 조사 5 가 '별개 도달 결함 후보 · 화면·통계가 발행됨으로 셀 수 있다' 고 했으나, 제 실측(2026-08-10 14:13 KST) 결과 15건 전부 is_deleted=true 이고 활성 기준 slip_no 는 0/567 이다. @SQLRestriction(is_deleted=false) 로 전 조회에서 걸러지므로 화면 노출 위험은 없다. 다만 직접 SQL 통계는 여전히 셀 수 있어 완전 해소는 아니다.

---

## 🚨 거래처 제약 판정

## 판정 — 세 문서의 제약이 전부 다르고, **가장 엄격한 것이 주문서**입니다

### ① 견적서 — BE 는 허용, **FE 신규 생성이 막습니다** (요구 미충족)

**BE 는 열려 있습니다**:
- `estimates.partner_id` **nullable**(제가 `information_schema` 로 실측: `nullable=YES`), partner 로 향하는 **FK 없음**(조사 3 의 `pg_constraint` 실측 — PK 하나뿐, 유일 FK 는 `estimate_lines_estimate_id_fkey`). partner_db 가 별도 DB 라 물리 FK 자체가 불가.
- 도메인 필수는 **`requesterId` 하나뿐** — `Estimate.java:199-201`. Javadoc `:186` 도 *"partnerId 거래처 UUID (선택)"*.
- `EstimateService.java:204-206` 이 요청값을 **그대로** 넣고 partner-service 를 조회조차 하지 않습니다(import 에 PartnerClient 없음).
- 생성 API 필수는 `lines` @NotEmpty + 라인 3필드뿐 — 거래처는 하나도 필수가 아닙니다(`CreateEstimateRequest.java:28-38`).

**그러나 실 사용자 경로가 막습니다** — 제가 원문을 직접 읽어 확인했습니다:
```
EstimateFormPage.tsx:729   const isEdit = Boolean(editId)
EstimateFormPage.tsx:1758  const legacyWithoutPartner = isEdit && !hydratedPartnerId
EstimateFormPage.tsx:1759  if (!effectivePartnerId && !legacyWithoutPartner) {
:1762      : '거래처를 선택하세요.')
:1765      return null            ← 저장 중단
```
신규 생성은 `editId` 가 없어 **`isEdit=false` ⟹ `legacyWithoutPartner` 가 항상 false**. 따라서 UUID 형식 `partnerId` 없이는 무조건 차단됩니다. 그 UUID 는 `PartnerAutocomplete` 선택으로만 생기고 그 `onChange` 는 `PartnerOption | null` 만 방출하므로(조사 3, `PartnerAutocomplete.tsx:35`) **자유 입력 거래처를 넘길 경로가 없습니다.** TS 타입도 비대칭입니다 — `CreateEstimateRequest.partnerId: string`(필수) ↔ `UpdateEstimateRequest.partnerId?: string`(선택).

⟹ **개발책임자께서 지키라고 하신 성질은 현재 코드에서 성립하지 않습니다.** 막는 것은 BE 가 아니라 FE 신규 생성 가드이고, 폼 주석(`:1750-1753`)이 *"FE 가드가 BE 계약보다 엄격했던 것이 데드락의 원인"* 이라고 이미 인정하면서 완화를 **수정(isEdit) 경로에만** 적용했습니다.

**실 데이터로도 표본 0입니다** — 조사 3 ↔ 조사 5 가 충돌해 제가 재측정했습니다(2026-08-10 14:13 KST): `partner_id IS NULL` 견적은 `2026/07/16-9` **1건**뿐이고, 그 `partner_name` **부산냉난방테크는 partner_db 에 등록돼 있습니다**(`e8ae9c86-afe1-3364-b484-1f5a2bf31313` / `P-2026-0003` / `139-21-10093` / `is_deleted=f`). ⟹ **조사 3 이 맞고 조사 5 의 "미등록 거래처 견적은 실재하며 동작 중" 은 틀렸습니다.** 진짜 미등록 거래처 견적은 0건 = **판정 불가**이며, 이 경로를 열 때 RED-first 로 고정할 지점입니다(조사 3: 관련 테스트 커버리지도 0).

### ② 판매전표 — 중간. **생성은 허용, 전송 시 필수**

- `slips.partner_id` **nullable**(제가 실측: `nullable=YES`). 실측 활성 128건 중 NULL 1건, 전체 144건 중 8건(그중 7건 soft-deleted) — 조사 5 의 "8건" 은 전체 기준이었습니다.
- 생성 시 필수 아님. **`send()` 에서 처음 막습니다** — `Slip.java:1108-1111` *"전표 전송 전 거래처를 지정해야 합니다"*(원문 확인).
- 이후 모든 커밋 전이가 `requirePartnerForCommitted()`(`:1126-1131`)를 거칩니다. 🚩 **호출처는 조사 1 이 적은 7곳이 아니라 8곳**입니다 — `1143·1159·1172·1188·1205·1220·1239·1262`(제가 grep 으로 확인).
- 프런트 저장 버튼도 거래처를 요구하지 않습니다 — `canSubmit` 은 창고 + 유효 라인 1건만 봅니다(조사 1, `SlipFormPage.tsx:1966-1968`).

⟹ **견적의 개방성과 판매전표는 충돌하지 않습니다.** 전표도 DRAFT/SAVED 까지는 거래처 없이 존재할 수 있고, 거래처는 **"전송 시점 게이트"** 입니다. 견적→전표 직결 경로가 이 성질을 지키는 이유가 여기 있습니다 — `EstimateToSlipConverter.java:83` 이 `estimate.getPartnerId()`(null 가능)를 그대로 넘겨 DRAFT 로 남깁니다.

### ③ 주문서 — **가장 엄격하고, 여기서 성질이 소멸합니다**

제가 `information_schema` 로 실측한 `partner_orders` 26컬럼:
- **`partner_code` NOT NULL · `biz_code` NOT NULL** (`partner_id` 는 nullable)
- **`partner_name` 컬럼이 아예 없습니다** — 거래처명을 담을 자리가 구조적으로 없습니다.

코드도 강제합니다:
- `PartnerOrderFromEstimateService.java:63-64` 가 `requirePartnerId(partnerCode, bizCode)` 를 **무조건** 호출.
- `PartnerOrderPartnerIdentityResolver.java:33-43` 이 partner-service 에 활성 거래처가 없거나 사업자번호가 다르면 **400**, partner-service 장애면 **502** 로 fail-closed(조사 2·4·5 삼중 일치).
- 거래처 포털 confirm 경로도 `X-Partner-Code` 없으면 401, `X-Biz-Code` 없으면 400.

⟹ **견적이 표현할 수 있는 미등록 거래처를 주문이 수용하지 못합니다.** `slip_db.estimates` 는 `partner_id`(nullable) + `partner_name`/`partner_business_no`/`partner_address` 스냅샷 4종을 갖는 반면, `partner_orders` 는 코드 2종이 NOT NULL 이고 이름·주소 자리가 없습니다.

### 🚨 설계 제약 — 이 성질을 깨지 않으려면

1. **`estimates.partner_id` 에 FK 나 NOT NULL 을 거는 어떤 제안도 안 됩니다.**
2. 완화할 지점은 **BE 가 아니라 `EstimateFormPage.tsx:1758` 의 `isEdit` 조건**입니다.
3. 다만 이것만 풀면 **새 함정이 생깁니다** — `Estimate.editHeader`(`Estimate.java:219-240`)는 `null = 기존 값 보존` 이라 PUT 으로 거래처를 **뗄 수 없습니다**. 폼 주석 `:1755-1757` 이 *"공백 전반을 열면 화면(빈칸)과 DB(구 거래처)가 조용히 갈라진다"* 며 이 비대칭을 우회 중입니다. **두 개를 함께 다루지 않으면 "거래처 없이 만든 견적에 거래처를 붙였다가 다시 뗄 수 없는" 상태**가 됩니다.
4. **주문서를 채우는 설계는 반드시 세 가지를 함께 가야 합니다** — ① `partner_orders.partner_name` 스냅샷 컬럼 추가 ② `partner_id` nullable 유지 ③ `requirePartnerId` 를 미확정 상태에서 통과시킬 경로. 이것 없이 주문 필드만 늘리면 개발책임자께서 "주의하라" 하신 성질이 그대로 깨집니다.

### ④ 참고 — 견적 표면이 **둘**이고 규칙이 정반대입니다
정규화된 `estimates`(데스크톱 견적서)는 nullable 인데 FE 가 막고, 레거시 종합견적서 `quote_snapshots.cust_name`(`QuoteSnapshot.java:46-47`)은 **partnerId 개념 자체가 없어 완전 자유**입니다(실측 0행). 그런데 **자유로운 쪽이 전환에서 막힙니다** — `POST /api/v1/slips/from-estimate` 가 미등록 `partnerCode` 를 404 로 차단합니다(`SlipPublishService.java:594-598`, `partner-strict-validation` 기본 true). 단 `partnerCode` 가 null/blank 면 검증을 건너뜁니다(`:585-587`). ※ 이 ④ 는 조사 3 단독 근거이며 저는 원문 재현을 하지 않았습니다.


## 개발책임자 확인이 필요한 것

- 🚨 [최우선] 주문서가 '판매전표 정보를 모두 보유' 한다는 것의 범위를 어디까지로 정하시겠습니까. 컬럼 실측상 판매전표 헤더 86개 중 주문서에 없는 것이 68개이고, 그중 43개는 전표 전용 lifecycle(서명 13 · 배차 5 · 검수/출고 8 · 워커 9 · 인쇄/마감 등)이라 주문이 가질 이유가 없습니다. 실제 대상은 업무 헤더 약 20개(partner_name · 창고 · delivery_tag · unload_date · shipping/inspection/supervision 주소 3 · receiver/recipient 전화 2 · customer_tel/address/representative 3 · payment_due_label/date 2 · discount_info · collect_term · agree_term · project_name · employeeCode)와 라인 6개(specification · set_head · parent_set_model · bundle_set_options · unit_price · unit_price_domain)입니다. 이 목록으로 확정해도 되겠습니까, 아니면 더 좁히시겠습니까.
- 🚨 [무결성 도메인 · 정책] 미등록 거래처를 주문서까지 허용하시겠습니까, 아니면 '견적서까지만 미등록 허용, 주문 전환 시점에 거래처 확정 강제' 로 하시겠습니까. 이것이 이번 설계의 첫 번째 갈림길입니다. 전자면 partner_orders 에 partner_name 스냅샷 컬럼 추가 + partner_code/biz_code 의 NOT NULL 완화 + requirePartnerId 우회 경로가 필요합니다(마이그레이션·거래처 정체성 해석 전반에 파급). 후자면 구조 변경 없이 '전환 시 거래처 선택' UX 로 끝나지만, 견적서에서 주문서로 넘어가는 순간 거래처를 못 정한 건은 진행이 막힙니다. 🚩 참고로 판매전표는 이미 후자에 가까운 구조입니다 — 생성은 허용하고 send() 에서 막습니다(Slip.java:1108-1111). 같은 패턴을 주문서에 적용하는 것이 자연스러워 보이나, 신규 정책이라 PM 자율 범위 밖으로 판단해 올립니다.
- 🚨 [정책] 견적서 신규 생성에서 미등록 거래처를 여는 것을 승인하시겠습니까. 지금은 EstimateFormPage.tsx:1758 이 신규 경로를 차단해 요구가 미충족 상태입니다. 함께 결정이 필요한 것: ① 거래처를 뗄 수 있게 할 것인가(Estimate.editHeader:219-240 의 null=보존 비대칭을 풀지 않으면 붙인 뒤 못 뗍니다) ② 미등록 견적의 거래처명을 자유 입력으로 받을 것인가(PartnerAutocomplete 가 PartnerOption|null 만 방출하므로 컴포넌트 계약 변경 필요) ③ 실 표본이 0건이라 RED-first 로 고정할 시나리오를 먼저 정의해야 합니다.
- 🚨 [범위] 견적→주문 고리를 이번에 연결하시겠습니까, 아니면 '견적→전표' 와 '주문→전표' 두 직결 경로만 무손실로 만들고 가운데 고리는 후속으로 두시겠습니까. FixtureEstimateClient.java:17-19 가 무조건 Optional.empty() 를 반환해 이 경로는 코드만 있고 동작하지 않습니다. 실 endpoint 를 만들려면 slip-service(견적이 여기 있습니다)에 조회 API 신설 + partner-order-service 클라이언트 배선이 필요해 범위가 커집니다.
- 🚨 [설계 결정] 주문서 세트 전개를 '저장 시 전개'(견적과 동일)로 하시겠습니까, '전환 시 전개'로 하시겠습니까. 견적서는 저장 시 전개해 부모를 남기지 않습니다(EstimateService.java:138-166). 저장 시 전개로 맞추면 세 문서가 한 규약(set_head/parent_set_model/bundle_set_options/specification)으로 정렬되고 EstimateToSlipConverter.java:126-129 패턴을 그대로 재사용할 수 있습니다 — 새 규약을 만들 필요가 없습니다. 다만 기존 활성 주문 324건의 세트 부모 라인을 어떻게 할지(마이그레이션으로 전개할지, 그대로 두고 전환 시점에만 전개할지) 결정이 필요합니다. 🚩 기존 행 전개는 금액 재배분을 수반하므로 무결성 도메인입니다.
- [데이터] 활성 주문 324건 중 QA 잔재를 어떻게 처리하시겠습니까. 조사 5 가 partner_orders.remark 에서 'codex-r4-985-r4' 같은 라운드 식별자를 발견했고 2026/07/29 생성분이 다수입니다. 마이그레이션으로 세트를 전개한다면 QA 산물까지 실 데이터로 굳어집니다. 정리 후 진행할지, 그대로 둘지 판단이 필요합니다.
- [확인 요청] siteAddress · contactPhone 의 의도된 출처를 알고 계십니까. PartnerOrderDetailResponse.java:35-36 에 record 필드로 선언돼 있고 :86·:87 에서 null 하드코딩인데, 이 두 이름이 코드베이스 어디에도 나타나지 않습니다 — 엔티티 컬럼도, 요청 DTO 도, 채우는 코드도 없습니다. 조사 2 도 '못 찾음' 으로 보고했습니다. 판매전표의 supervision_address/recipient_phone 에 대응시킬 의도였는지, 아니면 폐기 대상인지 확정이 필요합니다.
- [확인 요청] 창고 placeholder 00000000-0000-0000-0000-000000000001 를 어떻게 하시겠습니까. inventory_db.warehouses 에 실재하지 않는 UUID 입니다. ① 실제 default warehouse 를 만들어 등록 ② 견적에 창고 필드를 추가 ③ 전환 시 창고 선택을 강제(주문 경로와 동일) 중 어느 쪽이신지. 소스 주석 EstimateToSlipConverter.java:76 은 '운영 cutover 시점 default warehouse 정책 도입 가능' 을 열어 두고 있습니다.
- [확인 요청] line_total 의 의미 충돌을 어떻게 통일하시겠습니까. 전표는 line_total = 공급가액(VAT 미포함)이고, 견적·주문은 line_total/subtotal = VAT 포함 합계 T 입니다. 이름이 같고 의미가 반대라 전환 구현이 이름만 보고 매핑하면 10% 어긋납니다. 통일하실지, 매핑 규칙을 명시적으로 문서화만 하실지 판단이 필요합니다.
- [측정 한계 · 판정 불가] 전환 무손실을 라이브로 검증하려면 표본을 먼저 만들어야 합니다. 세 축 모두 전환 산출물이 0건입니다(estimates.converted_slip_id 0 · partner_orders.source_estimate_id 0 · slips.source_type ESTIMATE/PARTNER_ORDER 0 · slip_source_orders 0행 · 활성 slip_no 0). 게다가 원인이 '아직 안 써서' 가 아니라 '경로가 막혀서' 입니다(견적→주문 100% 404, 주문→전표 57.1% 400). ⟹ 구현 착수 전 라이브QA 계획에 '실 관리자/사용자 경로로 전환 가능한 견적·주문을 먼저 만든다' 를 포함해야 하며, DB 직접 INSERT 는 금지입니다. 회사PC 기준 수치이므로 집PC 에서는 발화 조건을 다시 세셔야 합니다.
- [증거 무결성 · 보고] 조사 4 의 PartnerOrderDetailResponse 좌표 5개(:186/:188/:80-81)와 조사 5 의 assignBundleComponent 좌표(:128-131)가 원문과 다릅니다. 제가 실측으로 정정했습니다(각각 :191/:193/:86/:87/:78, :126-129). 또 조사 1 의 requirePartnerForCommitted 호출처가 7곳이 아니라 8곳(:1262 누락)입니다. 이 매트릭스는 정정된 좌표를 씁니다 — 후속 fix 브리핑에 조사 4·5 원문 좌표를 그대로 인용하지 않도록 주의가 필요합니다.

---

## 적대검증 4각도


### 판매전표 필드 누락 감사 — 엔티티·마이그레이션(DB information_schema)에서 컬럼을 독립적으로 세어 매트릭스와 집합 대조 + 부속 테이블(첨부·서명·이력·배송·정산) 포함 여부 검증. 워크트리 wmain HEAD 22427d9c6, 측정 2026-08-10 14:24~14:30 KST (읽기 전용 psql, 소스 무수정).

**판정** — 컬럼 축은 누락 0 — 매트릭스가 판매전표 필드를 빠뜨리지 않았음을 제가 독립적으로 센 숫자로 확인했습니다. Slip.java @Column 79 + BaseEntity 7 = 86 = DB slips 86, 매트릭스가 이름을 댄 86개와 DB 86개의 comm 차집합 0줄. slip_lines 도 18+7+slip_id=26=DB 26, 차집합은 slip_id(부모 FK) 1개뿐. 다만 세 가지가 남습니다. ① 증거 무결성 정정 1건 — summary 의 "둘 다에 없는 컬럼 62개"는 실측 **63개**입니다(69/68 은 정확). 매트릭스가 목록을 안 적어 어느 1개를 뺐는지는 특정 불가하므로 63개 전량을 나열했습니다. ② 부속 테이블 축은 사실상 전면 미포함 — slip_db 41 BASE TABLE 중 대조된 것은 2개뿐이고, 첨부(slip_attachments 20컬럼)·이력(slip_revisions 197행·slip_audit_logs 62행)·서명감사·배차 12개가 판단을 받지 않았습니다. 이들 대부분은 전표 생성 이후 lifecycle 이라 결론은 옳으나, "검토 후 제외"라고 적지 않아 openQuestions ①의 컬럼 단위 범위 확정이 이 축을 조용히 삭제합니다. ③ 매트릭스에 없어야 할 진짜 누락 2건 — **최근단가 partner_product_price_memory**(견적·수기전표는 쓰고 전환·발행·주문 경로는 쓰기 0건, SlipPublishService/EstimateToSlipConverter 참조 0)와 **하류 sales_accounting_slips 2,512행**(소비 컬럼 partner_name·due_date·memo·total_supply/vat·slip_date 가 매트릭스 유실 목록과 정확히 겹침). 둘 다 매트릭스 결론을 뒤집지 않고 **심각도를 올립니다**. 종합 판정: 매트릭스는 판매전표 컬럼 축에서 신뢰할 수 있고, 부속·하류 축에서 보강이 필요합니다.

- [결론 · 컬럼 축] 판매전표 컬럼 누락은 0건입니다 — 제가 직접 센 숫자를 제시합니다. ① 엔티티 실측: Slip.java 의 @Column(name="…") 79개 + BaseEntity.java:21-42 의 7개(created_at·created_by·modified_at·modified_by·deleted_at·deleted_by·is_deleted) = 86. ② DB 실측: information_schema.columns where table_name='slips' = 86 (14:24:36 KST). ③ 엔티티+BaseEntity 목록과 DB 목록을 comm 으로 대조 → 차이 0줄(엔티티가 DB 를 정확히 재현). ④ 매트릭스 fieldMatrix 가 이름을 댄 컬럼을 제가 86개로 전개해 DB 86개와 comm 대조 → **차이 0줄, 어느 방향으로도 누락 없음**. slip_lines 도 동일: 엔티티 @Column 18 + BaseEntity 7 + slip_id(@JoinColumn) = 26 = DB 26. ⟹ 매트릭스가 판매전표 '컬럼'을 빠뜨렸다는 주장은 성립하지 않습니다.
- [🚩 증거 무결성 · 수치 오류 1건] summary 의 "slips 에만 있고 견적·주문 **둘 다에 없는 컬럼 62개**" 는 **63개**입니다. 같은 문장의 "견적 대비 69개"·"주문 대비 68개" 는 제 실측과 정확히 일치(69/68)하므로 union 값만 1 틀렸습니다. 검산: slips∩(estimates∪partner_orders)=23 (slips∩PO 18 + PO 에 없고 EST 에만 있는 accepted_at·partner_name·requester_id·seq_no·version 5) → 86−23=63. **빠진 1개를 특정할 수는 없습니다**(매트릭스가 62개 목록을 나열하지 않고 개수만 적었기 때문). 63개 전량: accepted_by·agree_term·business_number·classified_region_group·collect_term·completed_at·customer_address·customer_representative·customer_tel·delivery_batch_id·delivery_tag·destination_warehouse_id·destination_warehouse_name·discount_info·dispatch_status·dispatcher_signed_at·dispatcher_user_id·driver_name·driver_phone·driver_signature_channel·driver_signature_hash·driver_signature_png·driver_signature_source·driver_signed_at·inspection_address·inspector_signed_at·inspector_user_id·io_type·lock_flag·payment_due_date·payment_due_label·printed_at·project_name·receiver_phone·recipient_phone·redline_anchor_revision_no·revision_count_baseline·shipping_address·signature_channel·signature_hash·signature_png·signature_share_expires_at·signature_share_token·signature_source·signed_at·signer_name·slip_date·slip_type·source_id·source_type·source_warehouse_code·source_warehouse_code_abandoned_at·source_warehouse_code_attempt_count·source_warehouse_code_claim_token·source_warehouse_code_claimed_at·source_warehouse_code_last_error·source_warehouse_code_next_attempt_at·source_warehouse_code_pending·source_warehouse_code_snapshot_status·source_warehouse_id·supervision_address·time_date·unload_date. 결론(라인 축 대칭·주문만 구조적 결손)은 이 1 차이로 흔들리지 않습니다.
- [🚩 부속 테이블 축 — 사실상 전면 미포함] slip_db 에 BASE TABLE 이 **41개**인데(14:26 KST) 매트릭스가 스키마를 대조한 것은 `slips`·`slip_lines` **2개**뿐이고, `slip_source_orders` 만 fieldMatrix 1행으로 언급됩니다. 대조되지 않은 전표 부속 테이블(컬럼수·행수 제가 실측): 첨부 `slip_attachments` 20컬럼·0행(FK→slips 실재, pg_constraint 확인) / 이력 `slip_revisions` 18컬럼·**197행** · `slip_audit_logs` 17컬럼·**62행** · `slip_line_correction_audits` 15 · `slip_cleanup_save_history` 13 · `slip_publish_audit` 16·0행 / 서명감사 `slip_signature_audit` 15·0행 / 수정요청 `slip_edit_requests` 21·0행 / 코멘트 `slip_comments` 12·0행 · `slip_collab_comments` 16·0행 · `slip_collab_suggestions` 19 / 배차·배송 12개(`delivery_batches` 15 · `dispatch_task` 19 · `dispatch_groups` 15 · `dispatch_group_slips` 13(FK→slips) · `dispatch_vehicle_group` 15 · `dispatch_vehicle_group_slip` 12 · `dispatch_matched_driver` 14 · `external_dispatch` 14 · `external_dispatch_slip` 11(FK→slips) · `carriers` 14 · `external_carrier` 14 · `dispatch_collab_*`). **대부분은 전표 생성 이후 lifecycle 이라 전환 유실 대상이 아닌 것이 맞습니다** — 즉 결론은 틀리지 않았습니다. 문제는 매트릭스가 "검토했고 대상이 아니다"라고 적지 않고 조용히 스코프 밖에 뒀다는 점입니다. openQuestions ①이 "헤더 86개 중 68개"라는 **컬럼 단위 프레이밍만으로 범위를 확정하자고** 제안하므로, 개발책임자께서 승인하시면 부속 테이블 축이 판단을 받지 못한 채 범위에서 빠집니다.
- [🚩 매트릭스가 놓친 실제 계승 축 — 최근단가 `partner_product_price_memory`] slip_db, 13컬럼·**20행**(14:26 KST). 이 테이블은 매트릭스의 summary·fieldMatrix·lossOnConversion·openQuestions **어디에도 등장하지 않습니다**(전 텍스트 확인). 그런데 세 문서 계열에서 쓰기 대칭이 깨져 있습니다 — 견적: `EstimateService.java:229` rememberBatchAfterCommit(…, "estimate.create") · `:296` "estimate.update" / 수기 전표: `SlipService.java:377` "slip.create" · `:855` "slip.addLine" / **전환·발행 경로: 0건** — `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` 의 `PriceMemory` 참조 **0건**(grep -c = 0), `EstimateToSlipConverter.java` 도 **0건** / **partner-order-service 실 write 0건**(grep 6 hit 전부 Javadoc 주석 — PartnerOrderTaskSchedulerConfiguration.java:31·148·168·183, SlipPublishOutboxResultWriter.java:48·332). ⟹ **수기로 만든 전표는 거래처별 최근단가를 남기고, 전환·발행으로 생긴 전표는 남기지 않습니다.** 금액 축이고 매트릭스가 지적한 다른 비대칭(io_type/time_date·category_key)과 같은 계열이므로 fieldMatrix 에 행이 있어야 할 항목입니다. ⚠️ 이 테이블은 메모리 규칙상 QA 잔재(561,600)가 들어간 곳이므로 20행을 업무 빈도로 인용하면 안 됩니다.
- [🚩 하류 소비자 미검토 — 정산/회계 층으로 유실이 전파됩니다] accounting_db 에 `sales_accounting_slips` 24컬럼·**2,512행**, `sales_accounting_slip_lines` 20컬럼·**10,290행**, `sales_accounting_slip_allocations` 18컬럼·0행 (14:30:23 KST). `sales_accounting_slips` 가 소비하는 컬럼은 slip_no·slip_date·partner_id·partner_code·partner_name·total_supply_amount·total_vat_amount·total_amount·due_date·memo 입니다. **매트릭스가 유실로 판정한 항목과 정확히 겹칩니다** — partner_name(주문 경유 시 null) · due_date(주문 due_date 전달 경로 없음) · memo(단건 convert payload 9키에 없음) · total_supply/total_vat(라인 supply_amount·vat_amount 미전송) · slip_date(전환 실행일로 재작성) · partner_code(견적 경유 시 partnerId null 이면 null). ⟹ 매트릭스는 유실을 **전표 표면에서 끝냈고**, 그 유실이 실행 2,512행 규모의 매출 계정전표로 번지는 것을 보지 않았습니다. 이는 매트릭스 결론을 뒤집는 것이 아니라 **심각도를 올리는 누락**입니다.
- [확인하고 기각한 것 — 지어내지 않기 위해 명시] 첨부 축에는 전환 유실이 없습니다. ① 견적에는 첨부 테이블이 아예 없습니다(slip_db 41 테이블 중 estimate_* 는 estimate_lines·estimate_revisions·estimate_collab_comments·estimate_collab_suggestions·estimate_number_sequences 뿐). ② 주문의 `partner_order_gate_images`(13컬럼·**0행**)는 **주문별 첨부가 아닙니다** — 컬럼이 id·label·s3_key·base64·display_order·mime_type+BaseEntity 로 **order FK 가 없고**, `GateImageRepository.java:11` 이 `findAllByOrderByDisplayOrderAsc()` 로 전역 조회합니다(`GateImage.java:17` Javadoc: "게이트 진입 이미지(legacy getGateImages 7244)"). ③ `slip_attachments` 는 attachment_type·exif_gps_lat/lng·captured_at·uploaded_at 구성이라 인수 현장 사진, 즉 전표 생성 **이후** 산물입니다. ⟹ 매트릭스가 첨부를 다루지 않은 것은 결과적으로 옳으나, 근거를 적지 않아 감사자가 재확인해야 했습니다.
- [원문 재현 확증 — 릴레이 아님] 매트릭스가 인용한 좌표 중 판매전표 계열 3개를 제가 직접 열어 대조했고 **전부 일치**합니다. ① `SlipPublishService.java:784-787` BUNDLE 거부 — 원문 `if (BundleModePolicy.shouldExpand(summary)) { throw new BusinessException(ErrorCode.INVALID_INPUT, "세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요."); }` 확인. ② `:150-153` `Slip.createOutbound(slipNo, slipDate, seqNo, warehouseId, null, null, req.partnerName(), null, memo, requester)` 확인 — 매트릭스는 시그니처 대조 없이 "6번째가 partnerId"를 단정했는데, 제가 `Slip.java:694-697` 시그니처(slipNo, slipDate, seqNo, sourceWarehouseId, destinationWarehouseId, **partnerId**, partnerName, deliveryTag, memo, requesterId)를 대조해 **맞음을 확정**했습니다. 동시에 8번째 deliveryTag 도 null 이라 매트릭스의 delivery_tag 유실 판정과 정합합니다. ③ `BundleModePolicy.shouldExpand` 는 `:12-16` — 매트릭스가 조사 3(:13-17)을 1줄 밀림으로 정정한 것이 옳습니다. 🔧 권고: `SlipPublishService.java` 의 실제 경로는 `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/` 입니다(`slip/service/` 아님). 매트릭스가 디렉터리를 안 적어 후속 fix 브리핑이 오인할 수 있으니 좌표에 경로를 붙이십시오.
- [경미 · 참고] slip_lines 26컬럼 중 `slip_id` 만 fieldMatrix 행이 없고 summary 의 차집합 문장("slip_lines 에만(견적 대비) 4개 — category_key·unit_price_domain·source_order_line_id·slip_id")에만 등장합니다. 부모 FK 라 전환 대상이 아닌 것이 맞으므로 결함은 아니며, 제 26개 대조에서도 이 1개를 제외하면 25/25 정확히 일치합니다.
- [측정 재현 명세] 모든 수치는 wmain(HEAD 22427d9c6)에서 읽기 전용으로 측정했습니다. 컬럼 수 = `docker exec samhan-postgres psql -U samhan -d <db> -P pager=off -Atc "select count(*) from information_schema.columns where table_name='<t>'"`. 교차검증한 매트릭스 골격 수치는 전부 일치: slips 86 · slip_lines 26 · estimates 29 · estimate_lines 25 · partner_orders 26 · partner_order_lines 21 (14:24~14:27 KST). 행수: estimates 24 · estimate_lines 35 · partner_orders 599 · partner_order_lines 648 · partner_order_revisions 568 · partner_order_history 2,595 · partner_order_drafts 2,028 · slip_source_orders **0행**(전환 표본 0 재확인).

### 파일:줄 실재성 적대검증 — 매트릭스가 인용한 좌표를 원문으로 열어 대조하고, '하드코딩' 주장을 원문으로 확인하며, 존재하지 않는 필드·엔티티를 지어낸 곳이 있는지 확인. 워크트리 wmain HEAD 22427d9c6 (clean, docs/dev-reports 미추적 1건 외). DB 재측정 2026-08-10 14:28~14:32 KST, 읽기 전용 psql. 소스 무수정·git 무조작·Docker 무기동.

**판정** — 조건부 채택 — 매트릭스는 하중을 지는 주장과 DB 수치에서 **전건 재현**되어 신뢰도가 매우 높으나(표본 33좌표/25파일 + DB 20건 직접 대조, 57.1%·부산냉난방테크 4개 값·차집합 4컬럼까지 문자 단위 일치, requirePartnerForCommitted 8곳·BundleModePolicy:12-16 등 매트릭스가 남을 정정한 내용도 옳음), **지어낸 부재 1건**이 있어 그대로 쓰면 안 됩니다. siteAddress·contactPhone 의 *"코드베이스 출현 0건 · FE 도 존재를 모름"* 은 **거짓**이며(FE 가 `현장`·`연락처` 로 렌더링하고 `sales.ts:333-335`·`:989` 에 의도된 출처까지 존재), 이 오류가 해당 항목의 verdict(`근거 부족`)를 잘못 만들고 개발책임자께 올린 openQuestion 1개를 무효화합니다 — 실제로는 더 강한 **도달 가능 결함 후보**입니다. 추가로 좌표 오류 6건과, 매트릭스가 조사 4 를 정정하며 쓴 문장 자체의 부분 오류 1건이 있습니다. 위 8건을 정정하면 후속 fix 브리핑의 좌표 원본으로 채택 가능합니다.

- 【전체 판정】 표본 33개 좌표(25개 파일) + DB 실측 20건을 직접 열어 대조한 결과, 매트릭스는 **압도적으로 정확**합니다. 특히 하중을 지는 주장(전환 경로 유실·세트 계보 부재·거래처 개방성)은 전부 원문과 일치했고, **DB 수치는 20건 전건이 소수점까지 재현**됐습니다. 다만 **지어낸 부재(fabricated absence) 1건**과 **좌표 오류 7건**을 찾았습니다. 아래 ①이 유일한 실질 결함이며, 판정(verdict)을 뒤집고 개발책임자께 올린 질문 1개를 무효화합니다.
- 🚨【①  지어낸 부재 — 판정 뒤집힘】 매트릭스는 siteAddress·contactPhone 에 대해 *"record 선언 :35-36 외 **코드베이스 출현 0건** — 컬럼·요청필드·채우는 코드 전부 없음"*, *"@JsonInclude(NON_NULL) :22 라 JSON 에서 아예 사라져 **FE 도 존재를 모름**"* 이라 적고 verdict 를 `근거 부족 — 의도된 출처를 찾지 못했다` 로 냈으며, 이를 근거로 openQuestion(*"이 두 이름이 코드베이스 어디에도 나타나지 않습니다"*)을 개발책임자께 올렸습니다. **전부 사실이 아닙니다.** FE 는 존재를 알고, 타입으로 선언하고, 화면에 렌더링합니다 — `clients/desktop/src/renderer/api/sales.ts:557-558` 타입 선언 · `:663-664` `siteAddress: raw.siteAddress ?? null` / `contactPhone: raw.contactPhone ?? null` 정규화 · `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1028-1029` `{ label: '현장', value: query.data.siteAddress }` / `{ label: '연락처', value: query.data.contactPhone }` (모바일) · `:1085` `<Input aria-label="현장" ... value={query.data.siteAddress ?? '-'} />` · `:1089` `<Input aria-label="연락처" ... value={query.data.contactPhone ?? '-'} />` (데스크톱) · `clients/desktop/src/renderer/print/QuoteView.tsx:135` `{est.siteAddress ?? est.deliveryAddress ?? '-'}` · `:139` `{est.contactPhone ?? '-'}` (인쇄 양식).
- 🚨【① 계속 — 의도된 출처도 실재한다】 매트릭스가 *"찾지 못했다"* 고 한 provenance 가 코드에 명시돼 있습니다: `clients/desktop/src/renderer/api/sales.ts:333-335` 이 견적→주문 매핑에서 `deliveryAddress: e.partnerAddress` · `siteAddress: e.partnerAddress` · `contactPhone: null` 로 적고 있고, `sales.ts:989` 는 `contactPhone: row.phone` (거래처 행의 전화)로 채웁니다. ⟹ 올려야 할 것은 *"출처를 모르겠습니다"* 라는 질문이 아니라 **도달 가능 결함 후보**입니다: 주문 상세 화면(데스크톱·모바일·인쇄)에 `현장`·`연락처` 칸이 실제로 그려져 있는데 BE 가 `PartnerOrderDetailResponse.java:86`·`:87` 에서 `null` 을 하드코딩해 **사용자에게 영구히 `-` 로 보입니다**. 화면이 실재하므로 실 사용자 경로로 재현 가능합니다. 후속 fix 브리핑에서 이 항목의 verdict 와 openQuestion 을 **교체**해야 합니다.
- ⚠️【② 좌표 오류 6건 — 매트릭스가 남을 지적한 바로 그 유형】 (a) `ConvertToSlipRequest.java:24` → `warehouseCode` 는 **:20**, "blank 면 409" 문구는 javadoc **:15-16**. :24 는 중첩 `Item` record 의 javadoc 줄입니다. (b) `PartnerOrderUpdateService.java:78 replaceLines` → 실제 호출은 **:107** (`order.replaceLines(toLines(order, request.lines()))`). :78 은 `@param id 주문번호 또는 내부 식별자 문자열` javadoc. (c) `Estimate.java:186` 을 *"partnerId 거래처 UUID (선택)"* Javadoc 근거로 인용 → 그 문구는 **:185**, :186 은 `@param partnerName 거래처명 snapshot`. (d) `SlipPublishService.java:254-255` 를 *"partner-order DTO 에 customer* 필드 없음 → null 보존"* **주석** 근거로 인용 → 그 주석은 **:251**, :254-255 는 null 인자 자체. (e) `EstimateToSlipConverter.java:138` 을 `applyDeliverySchedule(null,null)` 로 **인용** → 원문은 `slip.applyDeliverySchedule(slip.getDeliveryTag(), null)` (효과는 동일하나 인용 원문이 아님). (f) `EstimateToSlipConverter.java:122-125` 를 "categoryKey 없는 **5-arg** create" 로 기술 → 실제 8인자 호출(slip+7). categoryKey 미전달이라는 실질 주장은 정확.
- ⚠️【③ 매트릭스의 '조사 4 정정' 자체가 부분 오류】 매트릭스는 조사 4 의 좌표를 정정하며 *"그 줄에는 각각 `line.getVatAmount()`·`line.getLineTotal()`·`order.getStatus().name()` 이 있습니다"* (:186/:188/:80-81)라고 적었습니다. 원문 실측: `:186` = `line.getVatAmount()` ✅ / `:188` = `line.getAmountAuthority() == null ? null : ....name()` ❌ (`line.getLineTotal()` 은 **:187**) / `:80` = `order.getStatus().name()` ✅ 이나 `:81` = `order.getSlipPublishStatus().name()`. 정정 3개 중 1개가 틀렸습니다 — 정정문을 그대로 재인용하지 마십시오.
- ✅【핵심 주장 원문 재현 — 전건 일치】 (1) `SlipPublishService.java:135` `UUID verifiedPartnerId = verifyPartnerOrThrow(req.partnerCode());` 확인. `:150-153` `Slip.createOutbound(slipNo, slipDate, seqNo, warehouseId, null, null, req.partnerName(), null, memo, requester)` 이고 `Slip.java:694-697` 시그니처상 **6번째 인자가 partnerId** ⟹ *"검증한 partnerId 를 얻고 partnerId 자리에 null 을 넘긴다"* 는 **정확**. `:171-173` 에서 사업자번호 조회에만 사용. 반면 주문 경로 `:236-239` 는 `partnerId` 를 그대로 전달 — **비대칭 확인**. (2) `Slip.java:1108-1111` send() 거래처 가드 원문 일치, `:1126-1131` requirePartnerForCommitted 원문 일치, 호출처 grep 결과 **1143·1159·1172·1188·1205·1220·1239·1262 = 정확히 8곳** ⟹ 매트릭스의 "7곳이 아니라 8곳" 정정이 **옳음**. (3) `BundleModePolicy.java:12-16` `shouldExpand` 메서드 범위 정확(조사 3 의 :13-17 이 1줄 밀림) — 내용도 `productType==BUNDLE && !KEEP` 일치.
- ✅【'하드코딩' 주장 — 원문으로 전건 확인】 (a) `EstimateToSlipConverter.java:77-78` `UUID.fromString("00000000-0000-0000-0000-000000000001")` — **문자열 리터럴 하드코딩 맞음**. 주석 `:75` *"영업이 SlipForm 으로 정확한 창고 지정 후 SAVED 단계 진행"*, `:76` *"운영 cutover 시점 default warehouse 정책 도입 가능"* 원문 일치. DB 실측(14:30 KST) `inventory_db.warehouses` 에 해당 UUID **0행**, 전체 30행 ⟹ 실재하지 않는 placeholder 확인. (b) `PartnerOrderDetailResponse.java:78`(partnerName 자리 null) `:86`(siteAddress null) `:87`(contactPhone null) `:191`(bundleMode null) `:193`(expandedComponents `List.of()`) — **전부 리터럴 하드코딩 맞음**, record 위치도 일치. `PartnerOrderSummaryResponse.java:60` null(=partnerName, record 헤더 :16 로 위치 확인) 맞음. (c) `EstimateFormPage.tsx:1198` `address: null,` 하드코딩 맞음. (d) `PartnerOrderConfirmService.java:64-66` `DEFAULT_WAREHOUSE_ID` 하드코딩 맞고, grep 전수 결과 **선언 1줄 외 참조 0건** ⟹ "사문화 상수" 맞음.
- ✅【계약 전수 대조 — 지어낸 필드 없음】 `PublishFromPartnerOrderRequest.java:27-43` 은 정확히 **16필드**이고 **`orderNo` 가 없습니다**(전수 확인). 인용된 자리 좌표 `:32 partnerName` `:33 employeeCode` `:36 shippingAddress` `:38 receiverPhone` `:39 memo` `:40 paymentDueLabel` `:41 discountInfo` `:42 orderApprovedAt` **8개 전건 정확**. 한편 `PartnerOrderConvertService.java:202` 가 `payload.put("orderNo", order.getOrderNo())` 를 실제로 넣습니다 ⟹ *"조용히 버려진다"* 는 기전 확인. `PublishLineRequest.java:30-42` 는 **12필드**, 인용 좌표 `:31 lineNo` `:34 spec` `:36 unitPriceExVat` `:38 supplyAmount` `:39 vatAmount` **전건 정확**. convert 가 보내는 라인 7키(`:154-162` productCode·productName·qty·unitPriceVat·remarks·sourceOrderLineId·categoryKey)와 헤더 9키(`:198-207`)도 원문 그대로 — **미전송 5종 주장 성립**. `SlipPublishService.java:803-808` 이 `supplyAmount`/`vatAmount` null 이면 합산하지 않으므로 audit 합계 0 적재 기전도 확인.
- ✅【견적→주문 계약 — 부재 필드 8종 전건 확인】 `EstimateClient.java:18-27` `EstimateSnapshot` = estimateId·estimateNumber·partnerCode·bizCode·dueDate·memo·lines **뿐**(원문 일치). `:29-41` `EstimateLineSnapshot` = productId·modelCode·productName·categoryKey·quantity·deliveryPrice·remark·supplyAmount·vatAmount·lineTotal·authority ⟹ 매트릭스가 없다고 한 **setHead·parentSetModel·bundleSetOptions·specification·specificationSource·lineNo·unitPrice·unitPriceWithVat 8종 전부 실제로 부재** 확인. `FixtureEstimateClient.java:17-19` 이 무조건 `Optional.empty()` 반환 확인, `PartnerOrderFromEstimateService.java:59-62` 가 그 결과로 `PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND` 를 던지는 것 확인, `:63-64` `requirePartnerId(snapshot.partnerCode(), snapshot.bizCode())` 무조건 호출 확인. `PartnerOrderPartnerIdentityResolver.java:33-43` fail-closed 원문 일치.
- ✅【거래처 개방성 절 — FE 가드 원문 정확】 `EstimateFormPage.tsx:729` `const isEdit = Boolean(editId)` · `:1758` `const legacyWithoutPartner = isEdit && !hydratedPartnerId` · `:1759` `if (!effectivePartnerId && !legacyWithoutPartner) {` · `:1762` `'거래처를 선택하세요.'` · `:1765` `return null` — **인용 5줄 전건 문자 단위 일치**. 신규 생성은 `isEdit=false` ⟹ 항상 차단된다는 추론도 코드상 성립. 주석 `:1750-1753`(*"FE 가드가 BE 계약보다 엄격했던 것이 데드락의 원인"*)·`:1755-1757`(*"공백 전반을 열면 안 된다"*)도 원문 일치. `PartnerAutocomplete.tsx:35` `onChange: (partner: PartnerOption | null) => void` 일치. `SlipFormPage.tsx:1966-1968` `canSubmit` 에 거래처 조건 없음 확인. `Estimate.java:199-201`(requesterId 만 필수)·`:219-240`(editHeader 가 6필드 모두 `if (x != null)` 로 null=보존) 원문 일치 ⟹ *"붙인 뒤 뗄 수 없다"* 는 지적 성립. `EstimateService.java:204-206` 이 요청값을 그대로 전달하고 파일 전체에 `PartnerClient` grep **0건** ⟹ *"partner-service 를 조회조차 하지 않는다"* 확인.
- ✅【DB 재측정 20건 — 전건 재현, 오차 0】 (측정 2026-08-10 14:28~14:32 KST, 병렬 트랙 공유 DB) 컬럼 수 `slips 86`·`slip_lines 26`·`estimates 29`·`estimate_lines 25`·`partner_orders 26`·`partner_order_lines 21` **전건 일치**. `estimates.partner_id`/`slips.partner_id` nullable=YES · `partner_orders.partner_code`/`biz_code` NOT NULL · **`partner_orders.partner_name` 컬럼 부재** · `partner_order_lines` 에 `set_head`·`parent_set_model`·`bundle_set_options`·`specification`·`unit_price` **5개 전부 부재(0/5)** — 전건 일치. `slip_lines` − `estimate_lines` 차집합 = **정확히 4개**(`category_key`·`slip_id`·`source_order_line_id`·`unit_price_domain`) — 매트릭스와 **문자 단위 일치**. `slips` 에 `total%` 컬럼 **0개**(헤더 합계 부재) 확인. `quote_snapshots` 0행 확인.
- ✅【DB — 조사 간 충돌 판정도 재현】 `estimates.partner_id IS NULL` = **1건**(`2026/07/16-9`, partner_name=부산냉난방테크, is_deleted=false)이고, 그 거래처는 partner_db 에 **등록돼 있음**: `e8ae9c86-afe1-3364-b484-1f5a2bf31313` / `P-2026-0003` / `139-21-10093` / is_deleted=false — 매트릭스가 적은 4개 값과 **완전 일치**. ⟹ *"미등록 거래처 견적 실 표본 0건 = 판정 불가"* 이고 조사 3 이 옳다는 판정 **확인**. `slips.partner_id IS NULL` 전체 8 / 활성 1 / 활성총 128 / 전체 144 **일치**. `partner_orders.slip_no` 전체 15 / 활성 0 / 활성총 567 / 전체 599 **일치** (15건 전부 삭제행이라는 정정 성립). 전환 산출물 3축 전부 0 확인: `converted_slip_id 0` · `source_estimate_id 0` · `slips.source_type` = **MANUAL 144 단일값**(ESTIMATE/PARTNER_ORDER 0) · `slip_source_orders 0행`. `estimates.partner_address` 비공백 **0/24** · `partner_order_lines.amount_authority` 활성 **PRICE 586 전건** 일치.
- ✅【57.1% 헤드라인 — 독립 재측정으로 정확히 재현】 product_db 에서 활성 BUNDLE **343개 · EXPAND 343 · KEEP 0** 확인 후, 그 343개 UUID 를 partner_order_db 에 교차 조회한 결과 **활성 BUNDLE 라인 331건 · 해당 활성 주문 324건 · 567 대비 57.1%** — 매트릭스 수치와 **소수점까지 일치**. 조인 키(`partner_order_lines.partner_order_id`)까지 원문 스키마로 확인했습니다. `SlipPublishService.java:784-787` 의 거부 기전과 결합해 *"활성 주문 57.1% 가 지금 전환 불가"* 는 **성립**합니다.
- ℹ️【미검증 표기 항목 — 실질은 맞고 좌표만 틀림】 매트릭스가 *"저는 미검증"* 으로 정직하게 표기한 [잠복] 항목(PUT 수정이 전환 이력 파괴)을 제가 대신 확인했습니다. 좌표 `:78` 은 틀렸지만(실제 `:107`), **실질 주장은 맞습니다** — `update()`(`:85-121`)는 `load`→`verifyVersion`→`validateLines`→`replaceLines(:107)` 만 거치고 **상태 가드가 없습니다**. `CONVERTED` 를 막는 `guardCollabModifiable`(정의 `:197`)은 **`:145` 의 `applyOverlayPatchBatch` 에서만** 호출됩니다(`COLLAB_LOCKED` 선언 `:52-55`). `PartnerOrder.java:387-401` `replaceLines` 가 기존 라인을 `markDeleted` 후 교체하는 것도 원문 일치. 다만 `converted_quantity>0` 활성 라인 0건이라 미발화라는 점도 그대로입니다.
- 📌【종합 권고】 이 매트릭스는 **후속 fix 브리핑의 좌표 원본으로 쓸 수 있는 수준**입니다(하중 주장·DB 수치 전건 재현). 다만 두 가지를 반드시 반영하십시오: **(1) siteAddress·contactPhone 항목의 verdict 와 openQuestion 을 교체** — "출처 못 찾음"이 아니라 FE 3개 화면(`SalesPartnerOrderDetailPage.tsx:1028-1029/:1085/:1089`, `QuoteView.tsx:135/:139`)에 실재하는 칸이 BE 하드코딩 null 로 영구 공란인 **도달 가능 결함 후보**이고, 의도된 출처는 `sales.ts:333-335`(→`partnerAddress`)·`:989`(→`row.phone`)에 이미 적혀 있습니다. **(2) 좌표 7건 정정**: `ConvertToSlipRequest:24→20` · `PartnerOrderUpdateService:78→107` · `Estimate:186→185` · `SlipPublishService:254-255→251(주석)` · `EstimateToSlipConverter:138` 인용문 교체 · `:122-125` "5-arg"→8인자 · 조사4 정정문의 `:188`/`:81` 재기술. 표본 0(전환 산출물 3축 전건 0)이라 라이브 재현이 불가한 것은 매트릭스가 스스로 밝힌 대로이며, 컬럼 집합 대조는 인스턴스 수와 무관하므로 구조적 결론은 유지됩니다.

### 거래처 예외 집중 적대검증 — ① 견적서가 미등록 거래처로 생성 가능한가(코드+실데이터) ② 매트릭스의 보완 제안이 그 성질을 깨는가 ③ 견적/주문/전표 세 문서의 거래처 제약 차이 ④ 거래처 없이 갈 때 어디서 막히는가. 워크트리 wmain HEAD 22427d9c6, 재측정 2026-08-10 14:24~14:35 KST(회사PC, 병렬 트랙 공유 DB, 읽기 전용 psql). 소스 무수정·git 무조작·Docker 무기동.

**판정** — 조건부 채택 — 거래처 축의 큰 그림(견적 BE 개방 · 주문 폐쇄 · 전표는 전송 시점 게이트)은 제가 코드·DB 로 전부 재현해 확증했고, 매트릭스가 조사 3/4/5 를 정정한 판정(미등록 견적 실 표본 0 · 좌표 정정 · 8곳 호출처)도 옳다. 매트릭스가 견적 개방성을 깨는 제안(FK·NOT NULL)을 한 곳도 없다는 점도 확인했다. 그러나 **요구를 실제로 충족시키기에는 처방이 틀렸거나 부족한 지점이 4곳** 있어 이대로 fix 브리핑에 쓰면 라운드를 버린다: ① \"EstimateFormPage.tsx:1758 만 풀면 된다\" 는 오답 — :1767 거래처명 가드와 :2010-2036 readOnly 강등, setPartnerName 4개 호출처가 모두 자동완성 전용이라 미등록 거래처명을 입력할 UI 경로가 아예 없다(풀면 나오는 것은 '이름 없는 견적'이다) ② 같은 폐쇄가 판매전표에도 P0 D-AC3-01 로 걸려 있어 이는 조건문이 아니라 되돌려야 할 설계 결정이다 ③ 주문서를 열 경우의 네 번째 차단기 `SlipPublishService.java:515-519 resolveCommittedPartnerId`(partnerCode blank → 400)를 매트릭스가 한 번도 언급하지 않았다 ④ partner_code 는 표시 스냅샷이 아니라 partner 포털의 행 단위 접근제어 키(PartnerSelfScopeGuard 5파일)이자 멱등키 구성요소라 NOT NULL 완화의 파급이 과소평가돼 있다. 증거 무결성 지적 3건: 매트릭스 자기 좌표 `Estimate.java:186`→실제 `:185` · \"distinct 33종\" 은 삭제 포함 전체 기준이며 활성은 3종(매트릭스가 스스로 비판한 필터 미명시) · ④ 절의 quote_snapshots 전환 404 서술은 전환 경로 자체가 존재하지 않아 성립하지 않는다. 실 표본은 0(활성 견적 24건의 거래처 3종 전부 partner_db ACTIVE 등록, 테스트 커버리지 0)이라 라이브 판정 불가이며, 권장 경로는 견적서만 여는 (A) 안이다 — 견적→전표 직결은 이미 무손실로 열려 있어 변경이 slip-service 안에 갇힌다.

- ✅ [확증] 견적서 BE 는 완전히 열려 있다 — 매트릭스 판정 그대로. 제가 원문 재현: `Estimate.java:195-201` create() 의 유일한 필수는 requesterId(`:200` "requesterId 는 필수입니다") · `CreateEstimateRequest.java` 전체를 읽었고 partnerId 에 @NotNull 없음(필수는 `@NotEmpty lines` + 라인 productId/quantity/unitPrice 뿐) · `EstimateService.java:185-206` create() 에 거래처 가드 0, import 에 PartnerClient 부재(:3-42 전수 확인) · `Estimate.java` 전체에 `partnerId == null` 문자열 출현 0 ⟹ send()/accept()/markConverted() 어디에도 거래처 가드 없음 · `EstimateService.java:341-356` convert() 는 QUOTE_CONVERTED/QUOTE_REJECTED 만 차단. DB 실측(14:25 KST): `estimates.partner_id` nullable=YES, partner_name/partner_business_no/partner_address 전부 YES, `pg_constraint`(conrelid=estimates) = PRIMARY KEY 하나뿐 — partner 로 향하는 FK 없음.
- 🚨🚨 [매트릭스 오류 — 요구 지점 정면] 매트릭스의 처방 "완화할 지점은 EstimateFormPage.tsx:1758 의 isEdit 조건" 은 **불충분하고, 그대로 fix 브리핑에 넣으면 라운드를 버린다**. :1758 을 풀어도 미등록 거래처 견적은 만들어지지 않는다 — 만들어지는 것은 **거래처명조차 없는 견적**이다. 근거 3연쇄(제가 원문 재현): ① `EstimateFormPage.tsx:1767-1772` 가 `if (!partnerName.trim() && !legacyWithoutPartner)` 로 거래처명 공백을 또 막는다(매트릭스는 :1759 가드만 인용하고 이 두 번째 가드를 언급하지 않았다) ② `:2010-2024` 거래처명 FormField 가 `required` + `<Input … readOnly>`(`:2019`), `:2025-2037` 사업자번호도 `readOnly`(`:2032`) — 주석 `:2004-2008` 이 "R8-DESIGN-1: '거래처명'·'사업자번호' 를 자유입력에서 자동완성 파생 read-only 로 강등" 이라고 스스로 적었다 ③ `setPartnerName` 호출처는 4곳뿐(`:881` hydrate · `:953` 협업 원격 · `:1117` handleSelectPartner · `:1170` 해제 시 `''`)이고 전부 서버 검색 결과에서만 값이 온다. `PartnerAutocomplete` 의 onChange 계약은 `PartnerOption | null`(`clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.tsx:35`)이며 후보는 `searchPartnerOptions`(`EstimateFormPage.tsx:1126-1135`) = partner-service 검색 결과뿐. ⟹ **미등록 거래처의 이름을 타이핑해 넣을 UI 경로가 존재하지 않는다.** 필요한 것은 조건문 한 줄이 아니라 자유입력 경로의 재도입이고, 그것은 R8-DESIGN-1 결정을 되돌리는 일이다.
- 🚨 [매트릭스 누락 — 범위 오판] 이 폐쇄는 견적 폼만의 사고가 아니라 **두 번 의도적으로 내려진 결정**이다. 판매전표도 동일하다: `SlipFormPage.tsx:2118-2126` 주석 원문 — "AC-3: 거래처 선택은 PartnerAutocomplete 단일 경로. 기존 수동 '거래처명' FormField/input 제거 — P0 D-AC3-01 수정. partnerName state 는 PartnerAutocomplete onChange … 에서만 setPartnerName 을 호출". 매트릭스는 `EstimateFormPage.tsx:2008` 이 인용한 "slip 이 'P0 D-AC3-01' 로 밟은 선례" 를 보고도 그 함의를 짚지 않았다. ⟹ 개발책임자께 올릴 질문은 "견적 신규 생성에서 미등록을 열까요"(매트릭스 openQuestion #3)가 아니라 **"P0 D-AC3-01 / R8-DESIGN-1 의 자유입력 금지 결정을 견적서에 한해 되돌릴까요"** 여야 한다. 그 결정들이 막으려던 것(화면 거래처 ↔ partnerIdSnapshot 괴리, 회계 귀속 오류)은 실재하는 위험이므로 되돌리려면 대체 방어선이 필요하다.
- 🚨🚨 [매트릭스 누락 — 주문 개방 시 다른 서비스에서 400] 매트릭스 설계제약 #4 는 주문서 개방에 필요한 것을 3종(① partner_orders.partner_name 컬럼 추가 ② partner_id nullable 유지 ③ requirePartnerId 우회 경로)으로 열거했으나 **네 번째 차단기가 slip-service 에 있다**. `SlipPublishService.java:515-519` `resolveCommittedPartnerId(String partnerCode)` — `if (partnerCode == null || partnerCode.isBlank()) throw new BusinessException(ErrorCode.INVALID_INPUT, "커밋 전표 발행 전 거래처 코드를 지정해야 합니다")`. 이 메서드는 `:223` 에서 `publishFromPartnerOrder` 가 무조건 호출한다. `:529-531` 은 NOT_FOUND 도 INVALID_INPUT 으로 던진다. 매트릭스는 `verifyPartnerOrThrow`(`:584-587` blank 면 skip, `:594-598` 404)만 인용하고 **이 더 엄격한 쌍둥이 메서드를 한 번도 언급하지 않았다**. ⟹ 주문서를 미등록 거래처에 열면 그 주문은 생성은 되지만 **전표 전환에서 400 으로 막힌다** — 요구("그대로 전환")가 정확히 그 지점에서 깨진다. fix 브리핑에 이 좌표가 반드시 들어가야 한다.
- 🚨 [매트릭스 과소평가 — partner_code 는 보안 키다] 매트릭스는 `partner_orders.partner_code` NOT NULL 완화를 "마이그레이션·거래처 정체성 해석 전반에 파급"(openQuestion #2) 정도로 적었으나, 실제로는 **partner 포털의 행 단위 접근제어 키**다. `PartnerSelfScopeGuard.java:94-102` `assertOwnPartner(resourcePartnerCode, callerPartnerCode, …)` 가 `partnerScope.equals(trimToNull(resourcePartnerCode))` 로 대조하고 불일치 시 AccessDeniedException · `:76-85 restrictRequestedPartnerCode` · `:104-110 requirePartnerCode`(null 이면 AccessDenied). 사용처 5파일(PartnerOrderQueryService · PartnerOrderHistoryService · PartnerOrderEditRequestService · TutorialStateService · 가드 자신), 총 15 hit. 클래스 Javadoc `:20-23` 이 이 검증이 skip 되면 "타 거래처 접근(P0 보안 취약점)" 이라고 스스로 기록했다. 더해 `PartnerOrderConfirmService.java:118-119` 가 `resolveDraftSeq(partnerCode, draftId)` 와 `"PO-CONF-" + partnerCode + "-" + draftSeq` 로 **멱등키까지 partnerCode 로 조립**한다. ⟹ partner_code 를 nullable 로 바꾸는 것은 컬럼 하나가 아니라 자기범위 검증·멱등성 두 축을 동시에 여는 일이다. 무결성/권한 도메인이므로 개발책임자 선확인 대상.
- ✅ [확증 · 강화] 세 문서의 거래처 제약 차이 — 매트릭스 결론 그대로이며 제가 DB·코드로 전부 재현했다(14:25~14:31 KST). **견적서**: partner_id nullable, FK 없음, 도메인 가드 0 ⟹ BE 최대 개방 / 그러나 FE 신규 경로는 완전 폐쇄(위 2·3번). **판매전표**: `slips.partner_id` nullable=YES, 생성 허용, `Slip.java:1108-1111 send()` 에서 처음 차단("전표 전송 전 거래처를 지정해야 합니다"), 이후 `:1126-1131 requirePartnerForCommitted()` 를 **8곳**이 호출(`1143·1159·1172·1188·1205·1220·1239·1262` — grep 실측. 조사 1 의 7곳은 `:1262` 누락이고 매트릭스의 8곳 정정이 옳다). FE 저장 게이트는 거래처를 요구하지 않는다 — `SlipFormPage.tsx:1966-1968 canSubmit = !!requiredWh && validLineCount > 0 && …`(원문 확인, 거래처 조건 없음). **주문서**: `PartnerOrder.java:50-51 partner_code nullable=false` · `:58-59 biz_code nullable=false` · `:55 partnerId` 는 nullable · **partnerName 문자열 출현 0**(grep -c = 0). DB 실측 26컬럼에 partner_name 부재 확인. 🚩 정리하면 **개방도가 요구와 정반대로 배열돼 있다** — 가장 열려 있어야 할 견적서가 UI 상 가장 닫혀 있고(자유입력 0), 가장 닫혀 있어야 할 판매전표가 UI 상 가장 열려 있다(거래처 없이 저장 가능).
- ✅ [확증 · 지도] 거래처 없이 갈 때 막히는 지점 — 파일:줄로 확정. **① 견적 신규 생성**: `EstimateFormPage.tsx:1759-1765`(partnerId 없으면 '거래처를 선택하세요.' 저장 중단) → 통과해도 `:1767-1772`(거래처명 공백 차단). `isEdit=false` 이므로 `legacyWithoutPartner`(`:1758`, `:729 const isEdit = Boolean(editId)`)는 신규에서 항상 false. **② 견적→주문**: 1차 `FixtureEstimateClient.java:17-19` 가 무조건 `Optional.empty()` → `PartnerOrderFromEstimateService.java:59-62` 가 PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND(경로 자체가 죽음). 되살려도 2차 `PartnerOrderFromEstimateService.java:63-64` → `PartnerOrderPartnerIdentityResolver.java:45-51 validateInput` 이 partnerCode/bizCode 공백이면 400, `:53-66 lookupSummary` 가 미등록이면 400 · partner-service 장애면 502(fail-closed). 🚩 추가 발견: `estimates` 29컬럼 실측에 **partner_code 컬럼이 없다** — `EstimateClient.EstimateSnapshot.partnerCode()`(`EstimateClient.java:21`)에 채울 원천이 애초에 없어, **등록된 거래처 견적조차** 이 경로로는 partnerCode 를 공급할 수 없다. **③ 견적→전표 직결**: 막히지 않는다 — `EstimateToSlipConverter.java:80-91` 이 `estimate.getPartnerId()`(null 가능)를 그대로 넘기고 `:88` 이 null 이면 partner-service 역조회를 건너뛴다. DRAFT 로 살아남고 `Slip.java:1108-1111 send()` 에서 처음 막힌다. **④ 주문→전표**: `SlipPublishService.java:515-519`(위 4번). ⟹ **실 업무 흐름의 진짜 병목은 ②이고, 요구를 지키는 유일한 현행 통로는 ③(견적→전표 직결)이다.**
- 🚨 [증거 무결성 — 매트릭스 자기 좌표 오류 1건] 매트릭스 partnerConstraint 절의 *"Javadoc `:186` 도 \"partnerId 거래처 UUID (선택)\""* 는 **1줄 밀렸다**. 실측: `Estimate.java:185  * @param partnerId 거래처 UUID (선택)` / `:186  * @param partnerName 거래처명 snapshot`. 매트릭스가 조사 4(`:186/:188/:80-81`)와 조사 5(`:128-131`)의 좌표를 정정하면서 자기 좌표를 하나 틀린 것이라 지적 가치가 있다 — 후속 fix 브리핑이 `:186` 을 인용하면 다른 줄을 가리킨다. 나머지 제가 검증한 매트릭스 좌표는 전부 정확했다: `Estimate.java:199-201`·`:219-240` · `EstimateFormPage.tsx:1758/1759/1762/1765` · `Slip.java:1108-1111`/`:1126-1131` · `SlipPublishService.java:135`/`:150-153`(createOutbound 6번째 인자 = partnerId 자리에 null — `Slip.java:694-697` 시그니처로 대조 확인)/`:171-173`/`:585-587`/`:594-598` · `EstimateToSlipConverter.java:77-78`/`:83`/`:92`/`:126-129` · `PartnerOrderPartnerIdentityResolver.java:33-43` · `FixtureEstimateClient.java:17-19` · `PartnerOrderDetailResponse.java:78`(null) · `PartnerOrderFromEstimateService.java:63-64`.
- 🚨 [증거 무결성 — 매트릭스가 스스로 비판한 병을 범함] 매트릭스는 ④⑤⑥ 에서 조사 2·5 의 "활성/전체 필터 미명시" 를 지적하고 *"이 보고서의 모든 수치는 활성/전체를 명시했습니다"* 라고 단언했으나, `partner_code` 행에 적은 *"distinct 33종 전부 partner_db 해소"* 는 **전체(삭제 포함) 기준**이다. 제 실측(14:31 KST): `count(distinct partner_code)` 전체 **33** ↔ 활성(`not is_deleted`) **3**. 활성 3종의 내역 — `1068689215`(주식회사 중앙유통) 565건 · `8428102605`(주식회사 제이시스템) 1건 · `1018187629`(비와이텍 주식회사) 1건, 세 코드 모두 partner_db 에 ACTIVE·미삭제로 실재(14:31 KST 확인). 🔑 부수 관찰: 활성 주문의 partner_code 는 전부 **사업자번호 형식이고 partner_code == biz_code** 다. partner_db 7,314건 중 `P-` 형식은 50건뿐이고 숫자형이 7,199건 — 즉 `P-2026-0003` 과 `1068689215` 는 같은 컬럼의 두 세계이며, 거래처 코드 규약을 손대는 설계는 이 이분화를 먼저 봐야 한다. 또한 활성 주문 중 `partner_id IS NULL` 1건(`2026/07/07-9001`, created_by=`qa-757`)이 있는데 매트릭스가 언급하지 않았다.
- 🚨 [매트릭스 ④ 과장 — 실재하지 않는 경로에 대한 서술] 매트릭스는 *"자유로운 쪽(quote_snapshots)이 전환에서 막힙니다 — `POST /api/v1/slips/from-estimate` 가 미등록 partnerCode 를 404 로 차단"* 이라 적고 조사 3 단독 근거임을 밝혔다. 제가 확인한 결과 **전환 경로 자체가 없다**: `QuoteSnapshotService.java` 에 convert/toSlip/publish grep 0건, 코드베이스 전체 `from-estimate` grep 에도 QuoteSnapshot→slip 배선 0건. 게다가 `QuoteSnapshot.java:46-47 cust_name` 만 있고 partnerCode 개념이 없으므로, 설령 발행 API 를 태워도 `SlipPublishService.java:585-587`(blank → skip)로 **404 가 나지 않는다**. `quote_snapshots` 0행(14:33 KST). ⟹ ④ 의 결론("자유로운 쪽이 막힌다")은 성립하지 않으며, 후속 브리핑이 이를 근거로 삼으면 없는 결함을 쫓는다.
- ✅ [확증 · 강화 — 표본 0, 판정 불가] 매트릭스 ①(조사 3 이 옳고 조사 5 가 틀렸다)을 재현했고 **더 넓게 확인했다**. 14:26 KST: 활성/전체 견적 24/24, `partner_id IS NULL` 1건(`2026/07/16-9`, partner_name 부산냉난방테크) — 그 거래처는 partner_db 에 `e8ae9c86-afe1-3364-b484-1f5a2bf31313 / P-2026-0003 / 139-21-10093 / ACTIVE / is_deleted=f` 로 등록. 14:34 KST 추가 측정: **활성 견적 24건의 거래처는 3종뿐이고 3종 전부 partner_db 에 ACTIVE 등록**(부산냉난방테크 18건 · 전주에어시스템 3건 · 한울냉열시스템 3건 — 한울냉열시스템은 partner_code=biz_no=`000011111111`). ⟹ **미등록 거래처 견적 실 표본 0건 = "결함 0" 이 아니라 판정 불가**(feedback_home_office_seed_data_differs). 테스트 커버리지도 0 — `legacyWithoutPartner`/`estimate-form-legacy-partner-note` 는 `EstimateFormPage.tsx` 외 출현 0(clients 전수 grep), BE 테스트의 `Estimate.create` 호출 17곳 중 partnerId 를 null 로 넘기는 것 0건(전수 확인). ⟹ 착수 시 **RED-first 고정 지점 = 미등록 거래처명으로 견적 생성 → 저장 → 전표 전환까지**이며, 라이브QA 는 발화 조건을 먼저 만들어야 한다(DB 직접 INSERT 금지).
- ✅/🚩 [최종 — 매트릭스가 성질을 깨는가] **명시적 위반은 없다.** fieldMatrix·lossOnConversion·partnerConstraint·openQuestions 전문을 훑었고 `estimates.partner_id` 에 FK 나 NOT NULL 을 거는 제안은 없으며, 오히려 설계제약 #1 이 이를 금지하고 #2 가 완화 지점을 BE 아닌 FE 로 지목한다(방향은 옳다). 🚩 다만 **덫이 하나 남아 있다** — fieldMatrix `partner_code` 행이 견적에 대해 "없음 → 보완 필요" 로 적혀 있어, 순진하게 읽으면 `estimates` 에 partner_code 를 추가하고 전환이 그것을 넘기게 만든다. 그 순간 `SlipPublishService.java:594-598`(NOT_FOUND 404)와 `:529-531`(INVALID_INPUT 400)이 켜져 **미등록 거래처 견적이 전환 단계에서 죽는다**. ⟹ fix 브리핑에 불변식으로 못 박아야 할 문장: *"미등록 거래처 견적은 partnerCode 를 비운 상태로 전표 전환까지 도달해야 한다 — partnerCode 를 채우는 어떤 보완도 blank 경로를 정상 경로로 유지해야 한다."* 🚩 내부 불일치 1건도 있다: 설계제약 #4 의 3종에는 `partner_code`/`biz_code` NOT NULL 완화가 빠져 있는데 openQuestion #2 에는 들어 있다 — #4 만 읽고 설계하면 DB 제약에서 막힌다.
- 📌 [권고 — 개발책임자께 올릴 갈림길의 재구성] 매트릭스 openQuestion #2·#3 은 방향이 맞지만 선택지가 실제 코드보다 낙관적이다. 제 실측 기준으로 다시 쓰면: **(A) 견적서만 미등록 허용(권장)** — 견적→전표 **직결** 경로는 이미 무손실로 열려 있다(`EstimateToSlipConverter.java:83` 이 null partnerId 를 그대로 승계, `Slip.java:1108-1111` 이 전송 시점에만 막음). 필요한 변경은 FE 자유입력 재도입 + `Estimate.editHeader:219-240` 의 null=보존 비대칭 해소(거래처를 붙였다 뗄 수 없는 문제) 두 가지로 **한 서비스 안에 갇힌다**. 주문서는 손대지 않는다. **(B) 주문서까지 미등록 허용** — partner_orders 스키마(partner_name 추가 + partner_code/biz_code NOT NULL 완화) + `PartnerOrderPartnerIdentityResolver` 우회 + **`SlipPublishService.java:515-519` 완화** + **`PartnerSelfScopeGuard` 자기범위 검증 재설계**(P0 보안 표면) + 멱등키 조립(`PartnerOrderConfirmService.java:118-119`) 재설계까지 3서비스에 걸친다. ⟹ 요구("견적서는 미등록 거래처로도 생성 가능")는 **(A) 만으로 충족되고**, (B) 는 요구가 아니라 파생 욕구다. 다만 "견적→주문→전표" 를 사슬로 쓰겠다면 미등록 건은 주문 단계에서 거래처 확정을 강제받는다는 점을 명시적으로 정책화해야 한다 — 이는 판매전표가 이미 채택한 패턴(생성 허용 / 전송 시 확정)과 같은 형태다.

### 데이터 실증 (읽기 전용 psql 대조) — 매트릭스의 '전환 시 유실' 주장을 운영 DB 로 재현 가능한 것/코드 판정만인 것으로 가르고, 반대로 '전환 가능' 판정 중 데이터가 비어 있는 것을 역방향으로 조사

**판정** — 매트릭스의 **구조 진단(컬럼 집합·차집합·NOT NULL·부재 컬럼)은 전건 재현되어 정확**하고, 헤드라인 수치 **331라인/324주문/57.1% 는 두 축(product_id·model_name)으로 독립 재현**되었으며 model 축이 실제 런타임 경로(`SlipPublishService.java:780 lookupByModel` → `:784-786` 400)임을 코드로 확인했습니다. 조사 간 어긋남 판정 ①④⑤⑥ 도 DB 로 전부 매트릭스가 옳음을 확인했습니다(특히 미등록 거래처 견적 = 부산냉난방테크는 partner_db 에 ACTIVE 등록 → **실 표본 0건 = 판정 불가**).

다만 **'전환 시 유실' 은 단 한 건도 라이브 실증이 불가능합니다** — 전환 산출물이 세 경로 모두 0건이라 원본↔결과 쌍을 출력할 수 없습니다. 전 항목 **코드 판정만**입니다.

교정이 필요한 5건: ①**활성 주문 567건 전부가 QA 산물이고 실 업무 주문은 0건** — 324건 전건 QA 이므로 '기존 주문 마이그레이션 전개'(openQuestion ⑤)는 QA 산물을 실 데이터로 굳히는 선택입니다 ②매트릭스가 '주문이 값을 갖고 있는데 안 보낸다' 로 묶은 4종 중 **memo·due_date 는 0/567 로 값 자체가 없어** 그 분류가 틀렸습니다(supply/vat 585, amount_authority 586 만 데이터 근거 있음) ③매트릭스가 타 조사를 비판한 **'활성/전체 미표기' 병증을 본인이 4곳에서 범했습니다**(customer_* 삼값에 두 기준 혼재 · memo 12는 활성인데 분모 144 · recipient_phone 전체는 6 · **io_type·time_date '144/144 둘 다' 는 time_date 137 로 반례 7건**) — DB 가 08-06 이후 무변경이라 시점 차이가 아닙니다 ④**'주문 distinct 33종 전부 partner_db 해소' 는 (code,biz) 쌍 기준 3/33 만 참**입니다 ⑤차집합 '62개' 는 실측 63개.

역방향 검사 결과 **'전환 가능' 판정 7항목이 데이터 0**입니다(source_order_line_id·note 양측·idempotency_key·printed_at·배차 3필드·status 전건 단일값·INBOUND 축) — '코드상 가능·데이터 미검증' 으로 재표기해야 합니다. 추가 발견 3건: 활성 라인 1건이 **존재하지 않는 product_id** 참조(QA 잔재), **COMPLETED·거래처 NULL 전표 2건**(직접 시드라 게이트 반증은 아니나 마이그레이션 전제를 깸), `slip_lines.category_key` **활성 0/302** 로 category_key 비대칭은 현재 관측 가능한 영향이 없고 분류도 '유실' 이 아니라 '원본에 없음' 이 맞습니다.

- 【측정 조건】 전 측정 2026-08-10 14:24~14:36 KST, 워크트리 wmain HEAD `22427d9c6` (작업트리 clean, untracked 1건 `docs/dev-reports/2026-08-10-order-bundle-carryover-recon.md`). SELECT 전용·소스 무수정·Docker 무기동. 🔑병렬 트랙 오염 배제 확인 — 네 테이블 최종 기록 시각이 전부 측정창 밖입니다: `slip_db.slips` 2026-08-06 17:26 · `slip_db.estimates` 2026-07-16 15:58 · `partner_order_db.partner_orders` 2026-07-29 16:17 · `product_db.products` 2026-07-30 13:07. 최근 6시간 INSERT/UPDATE 0건. 따라서 아래 수치는 재현 가능하며, 매트릭스와의 차이는 동시 쓰기가 아니라 집계 기준 차이입니다.
- 【확증 ✅ 골격】 컬럼 수 6개 전부 일치 — `slips` 86 · `slip_lines` 26 · `estimates` 29 · `estimate_lines` 25 · `partner_orders` 26 · `partner_order_lines` 21. 차집합도 재현: slips 전용 vs 견적 **69**, vs 주문 **68**, `slip_lines` 전용 vs `estimate_lines` **4개**(`category_key`·`slip_id`·`source_order_line_id`·`unit_price_domain`) · vs `partner_order_lines` **11개**(`bundle_set_options`·`line_total`·`note`·`parent_set_model`·`set_head`·`slip_id`·`source_order_line_id`·`specification`·`unit_price`·`unit_price_domain`·`unit_price_with_vat`) — 매트릭스 열거와 문자 단위로 동일. 🚩단 **'견적·주문 둘 다에 없는 컬럼 62개' 는 실측 63개**입니다(`comm -12`). 결론에 영향 없는 산술 1 차이지만 정정합니다. 🔑추가로 세 문서가 **공유하는 컬럼은 12개뿐**이고 그중 업무 필드는 `memo`·`partner_id`·`status` **3개**입니다(나머지 9개는 id + BaseEntity 7 + deleted_by_name) — '주문서만 구조적으로 비어 있다' 는 진단을 더 강하게 뒷받침합니다.
- 【확증 ✅ 핵심 수치】 BUNDLE 전환 차단 **331 라인 / 324 주문 / 활성 567건의 57.1%** — 제가 두 축으로 독립 재현했고 둘 다 정확히 일치했습니다. ①`product_id` 축: 활성 라인의 distinct `product_id` 333개 → `product_db` 에서 BUNDLE 215 / SINGLE 117. ②`model_name` 축: distinct 333개 → BUNDLE 215 / SINGLE 117. 두 축 모두 331 라인·324 주문·57.1%. 🔑**model 축이 실제 런타임 경로**임을 코드로 확인했습니다 — `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:780` 이 `productClient.lookupByModel(l.productCode())` 로 조회하고 **:784** `if (BundleModePolicy.shouldExpand(summary))` **:785-786** 에서 `INVALID_INPUT` "세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요." 를 던집니다. `BundleModePolicy.java:12-16` 원문도 확인 — `productType==BUNDLE && !KEEP`. 활성 BUNDLE 품목 343개 전부 `bundle_mode='EXPAND'`(KEEP 0) 이므로 예외 없이 전건 차단입니다.
- 【🚩 최대 정정 — 매트릭스 caveat 을 숫자로 확정】 **활성 주문 567건 전부가 QA 산물이며 실 업무 주문은 0건입니다.** 매트릭스는 '상당수가 QA 산물로 보이며 BUNDLE 331건의 다수가 여기 속할 수 있다' 로 완화 표현했으나, 생성자 전수 조사 결과 예외가 없습니다 — 2026-07-29 생성 566건 + 2026-07-07 생성 1건이 전부이고 생성자는 `dbcd598e-abc7-4a2c-ad5c-926ebf938dfd`(553) · `a0000000-…0004`(2) · `00000000-…0001`(2) · `sol-985-null-rate` · `sol-985-review` · `t8-live-qa` · `t8-live-qa-2` · `t8-r2-qa` · `t8-r2-sweep` · `t8-r2-final` · `r3-price-drift` · `r3-price-sweep` · `qa-757` 각 1건. **BUNDLE 324건도 전건 동일**(312 + 12, 전부 QA 식별자). 라인 `remark` 는 586건 중 **553건(94.4%)이 `codex-r4-985-final-2026072918/singleSet/245` 형태**입니다. ⟹ 57.1% 는 **구조적으로는 참이지만 업무 빈도로는 무의미**하며, openQuestions ⑤ 의 '기존 활성 주문 324건을 마이그레이션으로 전개' 는 **QA 산물 100% 를 실 데이터로 굳히는 선택**입니다(feedback_qa_rounds_pollute_shared_data 의 '되살리면 QA 산물이 실 데이터가 된다' 에 정확히 해당). 견적·전표도 같습니다 — 견적 24건 전건 생성자 `a0000000-…0003`, 유일한 비공백 memo 가 `[R6-H3] rev2 편집 프로브`; 활성 전표 128건 중 127건이 같은 합성 UUID 생성자. **세 문서 전부 실 업무 데이터가 아닙니다.**
- 【🚩 실증 실패 — 매트릭스가 '주문이 값을 갖고 있는데 안 보내는 것 4종' 이라 한 것 중 2종은 값이 0건】 lossOnConversion 5번째 항목의 분류 라벨이 절반 틀렸습니다. 실측(활성 567/586 기준): ①`memo` **0/567** ②`due_date` **0/567** ③`supply_amount` **585/586**·`vat_amount` **585/586** ④`amount_authority` **586/586 전건 PRICE**. ⟹ **③④ 만 데이터로 실증되는 유실**이고, **①② 는 '값을 갖고 있는데 안 보낸다' 가 아니라 '컬럼은 있으나 실 데이터가 0건' = 코드 판정만**입니다. 같은 이유로 `delivery_address` 도 0/567 이라 '유일하게 승계되는 배송 필드' 라는 서술은 코드 판정만입니다(매트릭스 fieldMatrix 는 채움률 0 을 정직하게 적었으나 lossOnConversion 요약이 이를 뒤집습니다). 후속 fix 브리핑이 ①② 를 RED 재현 대상으로 잡으면 표본이 없어 실패합니다.
- 【🚩 증거 무결성 — 매트릭스가 스스로 비판한 '활성/전체 미표기' 병증을 본인이 4곳에서 범함】 매트릭스는 조사 ④⑤⑥ 을 '활성/전체 필터를 안 밝힌 수치' 로 정정하며 *"이 보고서의 모든 수치는 활성/전체를 명시했습니다"* 라 단언했으나, `slips` 헤더 채움률에서 **한 줄 안에 두 기준이 섞여 있습니다**(전 수치 재측정, DB 는 08-06 이후 무변경이라 시점 차이 아님): ①`customer_tel·customer_address·customer_representative` **'전체 58·49·60/144'** → 실측 전체 **58·58·60**, 활성 **49·49·49**. 가운데 49 만 활성 기준이 섞였고 전체 기준 `customer_address` 는 58 입니다. ②`memo` **'전체 12/144'** → 전체 **26**, 활성 **12/128**(분자는 활성·분모는 전체). ③`recipient_phone` **'전체 0/144'** → 전체 **6**, 활성 **0/128**. ④`io_type·time_date` **'전체 144/144 둘 다 채움'** → 전체 `io_type` 144 이나 **`time_date` 는 137/144**; 활성 기준으로만 둘 다 128/128. 🔑④ 는 결론에도 닿습니다 — '발행 경로는 두 컬럼을 항상 채운다' 는 서술이 전체 기준에선 7건 반례를 가집니다. 정합 확인된 것: `delivery_tag` 8 · `delivery_address` 8 · `discount_info` 2 · `business_number` 136 · `partner_name` 144 · `supervision_address` 1 · `project_name`·`shipping_address`·`inspection_address`·`receiver_phone`·`payment_due_label`·`payment_due_date`·`collect_term`·`agree_term`·`printed_at` 전부 0 · `source_warehouse_id` 134/144.
- 【🚩 신규 반증 — '주문 distinct 33종 전부 partner_db 해소' 는 3/33 만 참】 매트릭스 fieldMatrix `partner_code` 행의 *"distinct 33종 전부 partner_db 해소"* 를 검증했습니다. ①33 은 **전체 599행 기준**이고 **활성 567건의 distinct 는 3종**입니다(565건이 단일 거래처 `1068689215` 주식회사 중앙유통). ②더 중요한 것 — 매트릭스 자신이 인용한 `PartnerOrderPartnerIdentityResolver.java:33-43` 은 **사업자번호가 다르면 400** 인데, `(partner_code, biz_code)` 쌍으로 대조하면 **33종 중 3종만 partner_db 와 정합**합니다. 나머지 30종은 코드는 존재하나 사업자번호가 조작값입니다 — 예: 주문의 `P-2026-0003 ~ 213-87-34567` ↔ partner_db 의 `P-2026-0003 = 부산냉난방테크 / 139-21-10093`. 30종은 전부 soft-deleted 시드 1행씩이라 지금 발화하지 않지만, **'해소된다' 를 근거로 거래처 정체성 경로를 안전하다고 판단하면 안 됩니다.**
- 【확증 ✅ 조사 간 어긋남 7건 중 DB 로 판정 가능한 4건 — 매트릭스 판정이 전부 맞습니다】 ①**미등록 거래처 견적 실 표본 0건**: `partner_id IS NULL` 견적은 `2026/07/16-9` 1건뿐이고 그 `partner_name` **부산냉난방테크는 partner_db 에 `e8ae9c86-afe1-3364-b484-1f5a2bf31313` / `P-2026-0003` / `139-21-10093` / `is_deleted=f` / `status=ACTIVE` 로 등록**돼 있습니다. 게다가 **같은 이름의 다른 견적 20건은 이 UUID 를 정상 보유**하므로 이 1건은 미등록 거래처가 아니라 결측 이상치입니다. ⟹ 조사 3 이 맞고 조사 5 의 '미등록 거래처 견적은 실재하며 동작 중' 은 틀렸으며, **개발책임자께서 지키라 하신 성질은 표본 0 = 판정 불가**입니다. ④`partner_orders.slip_no` **15건 전부 `is_deleted=true`**, 활성 0/567 — 게다가 15건 모두 `slip_no == order_no` 이고 `created_by='system'`, **그 15개 번호는 `slips` 에 하나도 존재하지 않습니다**(전표 `slip_date` 범위 2026-06-19~2026-08-06, 2026/04/15 자 없음) → 시드 복사값이지 실 전환 흔적이 아닙니다. ⑤`slips.partner_id IS NULL` 전체 **8** / 삭제 **7** / 활성 **1** — 매트릭스 정정 그대로. ⑥SINGLE 품목 활성 **2,718** + 삭제 **2** = **2,720** — 조사 2·5 둘 다 맞음.
- 【확증 ✅ 전환 표본 0 = 판정 불가】 매트릭스의 '발화 조건 카운트' 를 전건 재측정해 확인했습니다 — `estimates.converted_slip_id` **0/24** · `estimates.converted_at` **0/24** · `partner_orders.source_estimate_id` **0/599** · `partner_order_lines.converted_quantity>0` **0/648** · `slips.source_id` **0/144** · `slips.source_type` **144건 전건 MANUAL**(ESTIMATE/PARTNER_ORDER 0) · `slip_source_orders` **0행** · 활성 `partner_orders.slip_no` **0/567**. ⟹ **원본↔결과를 나란히 출력할 전환 쌍이 세 경로 모두 0건**이므로 '전환 시 유실' 은 **단 한 건도 라이브로 실증할 수 없습니다.** 아래 표시대로 전부 컬럼 실측 + 코드 경로 판정입니다. 창고 placeholder 도 확인 — `inventory_db.warehouses` 에 `00000000-0000-0000-0000-000000000001` **0행**(총 30건·활성 30건)이라 `EstimateToSlipConverter` 하드코딩 창고는 실재하지 않습니다.
- 【🚩 역방향 검사 — 매트릭스가 '전환 가능' 이라 한 것 중 실제로 비어 있는 것】 지시대로 반대 방향을 조사했습니다. **데이터가 0인 채 '전환 가능' 으로 판정된 항목**: ①`line: source_order_line_id` — 활성 0/302, '부분전환 추적의 유일한 축' 이라 했으나 한 번도 기록된 적 없음 ②`line: note` — 전표 **0/302**·견적 **0/35** 양쪽 다 0 이고 유일한 원천인 주문 `remark` 584건은 전부 `codex-r4-985-*` QA 문자열 ③`idempotency_key` 활성 0/128 ④`printed_at` 0/144 ⑤`delivery_batch_id`·`classified_region_group`·`signed_at` 전부 활성 0/128 ⑥`status` — 활성 주문 **567건 전건 DRAFT/NOT_REQUIRED**, 견적 **24건 전건 QUOTE_DRAFT** 이라 상태 매핑은 **한 값도 검증된 적이 없습니다** ⑦`destination_warehouse` — 'INBOUND 전용이라 없는 것이 정상' 이라 했으나 활성 INBOUND 전표가 **2건**뿐이고 `destination_warehouse_id` 2건 채움에도 `destination_warehouse_name` 은 **0/128** 이라 INBOUND 축 자체가 미검증입니다. ⟹ 이 7개는 '전환 가능' 이 아니라 **'코드상 가능·데이터 미검증'** 으로 표기해야 합니다.
- 【🚩 신규 — `category_key` 비대칭의 실효성이 데이터로 반증됨】 매트릭스는 `line: category_key` 를 **🔴 전환 시 유실**(견적→전표 미전달 / 주문→전표 전달)로 올렸으나 두 가지가 어긋납니다. ①`estimate_lines` 25컬럼에 **`category_key` 컬럼이 아예 없습니다**(제가 전 컬럼 열거로 확인) — 원본에 값이 없으므로 '전환 시 유실' 이 아니라 다른 행들과 같은 **'원본에 없어 새로 입력'** 분류가 맞습니다(분류 축 오적용). ②더 중요하게 **`slip_lines.category_key` 는 활성 302건 전건 0% 채움**입니다. 수기 생성분을 포함한 모든 실 전표 라인에서 비어 있으므로 이 비대칭은 **오늘 사용자에게 관측 가능한 영향이 없습니다.** 주문 쪽만 `category_key` NOT NULL 586건 전건 채움(`commercialMulti` 291 · `singleSets` 270 · `homemulti` 25)이라, 정작 값을 가진 유일한 문서가 주문서입니다.
- 【🚩 신규 — 활성 주문 라인 1건이 존재하지 않는 품목을 참조】 활성 라인의 distinct `product_id` 333개 중 **332개만 `product_db` 에서 해소**되고 1개가 dangling 입니다: `aa757c01-0000-4000-8000-000000009001` (삭제분 포함해도 `products` 에 0행). 해당 라인은 주문 `2026/07/07-9001` · `model=QA-MODEL-A` · `product_name=QA 활성 품목` · `created_by=qa-757` 로 **QA 잔재**이며 실 결함이 아닙니다(feedback_qa_rounds_pollute_shared_data 판정 3문 중 '이름·created_by 에 라운드 식별자' 에 해당). 다만 **`product_id` 로 조인하는 어떤 마이그레이션·세트 전개도 이 행에서 NULL 을 만나므로**, 전개 작업을 설계한다면 미해소 참조 처리 규칙이 필요합니다. 참고로 런타임은 `product_id` 가 아니라 `lookupByModel` 로 조회하므로 현재 경로에서는 발화하지 않습니다.
- 【🚩 신규 — '커밋 상태 ⟹ 거래처 존재' 는 데이터에서 성립하지 않음】 매트릭스는 판매전표 제약을 '생성 허용, `send()` 에서 필수'(`Slip.java:1108-1111`)로 정리했고 활성 데이터는 이를 지킵니다(활성 NULL 거래처 전표 1건은 `2026/06/19-1` DRAFT, `partner_name='QA-presence-coview'` QA 산물). 그러나 **soft-deleted 중 `partner_id IS NULL` 이면서 `status='COMPLETED'` 인 전표가 2건** 있습니다 — `2026/06/24-901`(대구공조(검수완료)) · `2026/06/24-902`(부산냉동(미검수)), 둘 다 `created_by='dev_master'` · `created_at` 이 `09:00:00`/`09:05:00` 정각 · **`completed_at` 이 NULL**. ⟹ 전이 경로를 타지 않고 **COMPLETED 상태로 직접 시드된 행**이므로 게이트 반증은 아니지만, **'커밋 단계 전표는 거래처를 갖는다' 를 전제하는 마이그레이션·집계는 이 2행에서 깨집니다.** 삭제 상태라 화면에는 안 잡힙니다.
- 【확증 ✅ + 보강 — 견적 라인은 저장 시 전개가 데이터로 확인되나 신규 필드는 전부 미사용】 활성 `estimate_lines` 35건이 참조하는 distinct `product_id` 는 **5개뿐이고 전부 SINGLE** 입니다 — BUNDLE 부모가 라인으로 남지 않는다는 '저장 시 전개'(`EstimateService`) 서술과 정합합니다(`set_head=true` 6건 · `parent_set_model` 15건이 전개 산물). 🚩단 **V115 `bundle_set_options` 0/35 · V116 `specification_source` 0/35** 로 두 신규 컬럼은 실 데이터가 전무하고, `specification` 은 18/35, `line_no` 35/35, `unit_price_with_vat` 34/35 입니다. ⟹ openQuestions ⑤ 의 '견적 패턴(`EstimateToSlipConverter.java:126-129`)을 주문에 그대로 재사용' 은 **`bundle_set_options` 계보에 한해 검증된 적 없는 패턴을 복제**하는 것입니다. 또한 견적 헤더도 `partner_address` **0/24**(전건 공백) · `partner_business_no` 20/24 · `valid_until` 20/24(NULL 4) 로 매트릭스 수치와 일치합니다.
- 【확증 ✅ 부수 — 절단 위험은 데이터로 미실현】 매트릭스가 `line: note` 에서 경고한 '주문 remark 500자 → 전표 note 200자 절단 위험' 을 측정했습니다: 활성 `remark` **최대 길이 43자**, 200자 초과 **0건**. 스키마상 위험은 실재하나 현 데이터로는 발화하지 않습니다 — **코드 판정만**으로 표기해야 합니다. 마찬가지로 `partner_order_lines` 21컬럼 실측으로 `specification`·`set_head`·`parent_set_model`·`bundle_set_options`·`unit_price`·`note`·`line_no`·`unit_price_domain` **부재**를, `partner_orders` 26컬럼 실측으로 `partner_name` **부재** 및 `partner_code`/`biz_code` **NOT NULL**·`partner_id` **nullable** 을 각각 확인했습니다 — 매트릭스의 구조 진단은 전부 정확합니다.

---

# 견적서 · 주문서 · 판매전표 — 전환 무손실 조사 보고서

> **작성 근거**: 매트릭스 1건 + 적대검증 4각도 + **제 직접 재현/재측정**
> **워크트리**: `D:/dev/Samhan-Public/.claude/worktrees/wmain` · HEAD `22427d9c6e9d1d91777d38acd002524793fb444a` (2026-08-10 13:51 KST)
> **작업트리 상태**: clean (untracked 1건 — `docs/dev-reports/2026-08-10-order-bundle-carryover-recon.md`, 다른 트랙의 #1089 정찰 산출물)
> **제 측정 시각**: **2026-08-10 14:39~14:46 KST** (회사PC · 병렬 트랙 공유 DB · 읽기 전용 `psql` 만 사용)
> **준수**: 소스 무수정 · git 무조작 · Docker 무기동 · 운영 DB 쓰기 0 · 타 워크트리 미접근

---

## 1. 한 줄 결론

**성립하지 않습니다.** 라인 수준에서 **견적서는 판매전표와 거의 동형**이지만(전표 전용 4컬럼 차이), **주문서는 구조적으로 비어 있고**(전표 전용 11컬럼 차이 · 세트 계보 3종·규격·공급단가 전부 부재), **견적→주문 고리는 코드만 있고 동작하지 않으며**, 개발책임자께서 지키라 하신 **"견적서는 미등록 거래처로도 생성 가능" 은 지금 신규 생성 경로에서 이미 깨져 있습니다**.

더 정확히 말하면 요구는 **"필드 추가"가 아니라 네 층을 동시에 여는 일**입니다 — ① 주문서 스키마(세트 계보·업무 헤더) ② 전환 payload/계약(값이 있어도 안 보내는 것) ③ 견적→주문 배선(죽어 있음) ④ 거래처 개방성(견적 FE 가 막고, 주문 스키마·slip 발행 가드가 소멸시킴).

> 🚨 **전환 산출물 표본이 세 축 모두 0건입니다** — `estimates.converted_slip_id` **0/24** · `partner_orders.source_estimate_id` **0/599** · `slips.source_type` **144건 전건 `MANUAL`** · `slip_source_orders` **0행** · 활성 `partner_orders.slip_no` **0/567** (제 측정 14:41:50 KST). **표본 0 = "결함 0" 이 아니라 "판정 불가"** 이며, 아래 유실 판정은 **전부 컬럼 실측 + 코드 경로 근거**이고 라이브 재현은 한 건도 불가합니다. 컬럼 집합 대조는 인스턴스 수와 무관하므로 구조적 결론은 흔들리지 않습니다.

---

## 2. 🚨 적대검증이 뒤집은 것 — 먼저 읽으십시오

매트릭스를 그대로 fix 브리핑에 넣으면 라운드를 버립니다. **제가 원문·DB 로 직접 재현해 확정한 뒤집힘 6건**입니다.

### ① 매트릭스의 "출처를 못 찾음" 은 사실이 아니고, 이것은 **도달 가능 결함**입니다 ⟵ 판정 뒤집힘

매트릭스는 `siteAddress`·`contactPhone` 에 대해 *"record 선언 외 코드베이스 출현 0건 · FE 도 존재를 모름"* 이라 적고 `근거 부족` 판정 + 개발책임자 질문으로 올렸습니다. **FE 는 알고, 타입으로 선언하고, 세 화면에 그립니다** (제가 원문 확인):

| 위치 | 원문 |
|---|---|
| `clients/desktop/src/renderer/api/sales.ts:557-558` | `siteAddress: string \| null` / `contactPhone: string \| null` |
| `clients/desktop/src/renderer/api/sales.ts:663-664` | `siteAddress: raw.siteAddress ?? null` / `contactPhone: raw.contactPhone ?? null` |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1028-1029` | `{ label: '현장', value: query.data.siteAddress }` / `{ label: '연락처', value: query.data.contactPhone }` (모바일) |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1085` / `:1089` | `<Input aria-label="현장" readOnly … value={query.data.siteAddress ?? '-'} />` / `aria-label="연락처"` (데스크톱) |
| `clients/desktop/src/renderer/print/QuoteView.tsx:135` / `:139` | `{est.siteAddress ?? est.deliveryAddress ?? '-'}` / `{est.contactPhone ?? '-'}` (인쇄) |
| `clients/desktop/src/renderer/api/sales.ts:334-335` | `siteAddress: e.partnerAddress` / `contactPhone: null` ← **의도된 출처가 코드에 적혀 있음** |
| `clients/desktop/src/renderer/api/sales.ts:989` | `contactPhone: row.phone` |

⟹ **주문 상세 화면 3곳에 `현장`·`연락처` 칸이 실제로 그려져 있는데 BE 가 `PartnerOrderDetailResponse.java:86`·`:87` 에서 `null` 을 하드코딩해 사용자에게 영구히 `-` 로 보입니다.** 실 사용자 경로로 재현 가능하므로 **게이트 ① 대상**입니다. `partnerName`(`:78`)·`PartnerOrderSummaryResponse.java:60` 도 같은 계열입니다.

### ② "`EstimateFormPage.tsx:1758` 의 `isEdit` 만 풀면 된다" 는 오답입니다 ⟵ 처방 뒤집힘

매트릭스의 처방을 그대로 실행하면 나오는 것은 미등록 거래처 견적이 아니라 **거래처명조차 없는 견적**입니다. 제가 원문을 열어 확인한 3연쇄:

```
EstimateFormPage.tsx:1758   const legacyWithoutPartner = isEdit && !hydratedPartnerId
EstimateFormPage.tsx:1759   if (!effectivePartnerId && !legacyWithoutPartner) {   ← 매트릭스가 인용한 가드
EstimateFormPage.tsx:1767   if (!partnerName.trim() && !legacyWithoutPartner) {   ← 매트릭스가 언급 안 한 두 번째 가드
:1768       setTopError('거래처명이 비어있습니다.')
```
```
EstimateFormPage.tsx:2004-2008  /* R8-DESIGN-1: '거래처명'·'사업자번호' 를 자유입력에서 자동완성 파생
                                   read-only 로 강등. … slip 이 "P0 D-AC3-01" 로 밟은 선례와 정렬한다. */
EstimateFormPage.tsx:2019       readOnly      ← 거래처명 Input
EstimateFormPage.tsx:2032       readOnly      ← 사업자번호 Input
```

⟹ **미등록 거래처의 이름을 타이핑해 넣을 UI 경로가 존재하지 않습니다.** 필요한 것은 조건문 한 줄이 아니라 **자유입력 경로의 재도입**이고, 그것은 `R8-DESIGN-1`(견적)·`P0 D-AC3-01`(전표) **두 설계 결정을 되돌리는 일**입니다. 그 결정들이 막으려던 위험(화면 거래처 ↔ `partnerIdSnapshot` 괴리 → 회계 귀속 오류)은 주석에 실재 사유로 적혀 있으므로 **대체 방어선 없이 풀면 안 됩니다.**

### ③ 주문서를 열 때의 **네 번째 차단기**를 매트릭스가 한 번도 언급하지 않았습니다 ⟵ 누락

```java
// services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
:515  private UUID resolveCommittedPartnerId(String partnerCode) {
:516      if (partnerCode == null || partnerCode.isBlank()) {
:517          throw new BusinessException(ErrorCode.INVALID_INPUT,
:518                  "커밋 전표 발행 전 거래처 코드를 지정해야 합니다");
```
이 메서드는 `:223` 에서 `publishFromPartnerOrder` 가 **무조건** 호출합니다(`UUID partnerId = resolveCommittedPartnerId(req.partnerCode());` — 제가 원문 확인). 매트릭스는 견적 경로의 느슨한 쌍둥이(`verifyPartnerOrThrow`, blank 면 skip)만 인용했습니다. ⟹ **주문서를 미등록 거래처에 열면 주문은 생성되지만 전표 전환에서 400 으로 죽습니다** — 요구("그대로 전환")가 정확히 그 지점에서 깨집니다.

### ④ `partner_orders.partner_code` 는 표시 스냅샷이 아니라 **보안 키**입니다 ⟵ 심각도 상향

`PartnerSelfScopeGuard` 가 partner 포털의 **행 단위 접근제어**를 이 컬럼으로 수행하고(제가 사용처 확인: `PartnerOrderQueryService` · `PartnerOrderHistoryService` · `PartnerOrderEditRequestService` · `TutorialStateService` + 가드 자신 = 5파일), `PartnerOrderConfirmService` 는 **멱등키까지 `partnerCode` 로 조립**합니다(조사 각도 3 근거 · `"PO-CONF-" + partnerCode + "-" + draftSeq`). ⟹ `NOT NULL` 완화는 컬럼 하나가 아니라 **자기범위 검증 + 멱등성 두 축을 동시에 여는 일**이며 **무결성/권한 도메인 선확인 대상**입니다.

### ⑤ 매트릭스 자신이 비판한 **"활성/전체 필터 미명시"** 병을 스스로 4곳에서 범했습니다 ⟵ 증거 무결성

제 재측정(14:41:20 KST · DB 는 08-06 이후 무변경이므로 시점 차이가 아닙니다):

| 매트릭스 서술 | 제 실측(전체 144) | 제 실측(활성 128) |
|---|---|---|
| `customer_tel·customer_address·customer_representative` "전체 **58·49·60**" | `58` · **`58`** · `60` | `49` · `49` · `49` ← 가운데만 활성 기준이 섞임 |
| `memo` "전체 **12**/144" | **`26`** | `12` ← 분자는 활성·분모는 전체 |
| `io_type·time_date` "전체 **144/144 둘 다 채움**" | `io_type 144` · **`time_date 137`** | `128` · `128` |

⟹ **"발행 경로는 `io_type`·`time_date` 를 항상 채운다" 는 서술이 전체 기준에선 반례 7건을 가집니다.**

### ⑥ 수치·분류 정정 3건

- **"견적·주문 둘 다에 없는 컬럼 62개" → 실측 63개.** 제가 `comm` 으로 재계산: `slips 86` − `(slips∩estimates 17) ∪ (slips∩partner_orders 18)` = `86 − 23` = **63**. 같은 문장의 "견적 대비 69 · 주문 대비 68" 은 정확합니다(제 실측 69/68, 14:40:56 KST). 매트릭스가 63개 목록을 나열하지 않아 **어느 1개를 뺐는지는 특정 불가**합니다.
- **`category_key` 는 "전환 시 유실" 이 아니라 "원본에 없음" 입니다.** 제가 `estimate_lines` 25컬럼을 전수 출력해 확인 — **`category_key` 컬럼이 아예 없습니다**(14:40:14 KST). 게다가 `slip_lines.category_key` 는 **활성 302건 전건 0% 채움**이라(14:41:20 KST) 이 비대칭은 **오늘 사용자에게 관측 가능한 영향이 없습니다**.
- **주문의 `memo`·`due_date`·`delivery_address` 는 "값이 있는데 안 보낸다" 가 아닙니다.** 제 실측(14:41:05 KST): `memo` **0/567** · `due_date` **0/567** · `delivery_address` **0/567**. **데이터가 0건**이므로 코드 판정만이며, RED 재현 대상으로 잡으면 표본이 없어 실패합니다. 반면 `supply_amount`·`vat_amount` **585/586**, `amount_authority` **586/586 전건 `PRICE`** 는 데이터 근거가 있습니다.

### ⑦ 🚩 표본의 성격 — **활성 주문 567건에 실 업무 주문이 없습니다**

제 실측(14:41:05 / 14:41:20 KST): 활성 주문 `created_by` = `dbcd598e-…`(553) · `a0000000-…0004`(2) · `00000000-…0001`(2) · `sol-985-null-rate` · `t8-live-qa` · `t8-live-qa-2` · `t8-r2-qa` · `t8-r2-sweep` · `t8-r2-final` · `r3-price-drift` · `r3-price-sweep` · `sol-985-review` · `qa-757` 각 1건. 라인 `remark` 는 **584건 중 551건이 `codex-r4-985…` 접두**(조사 각도 4 는 553건으로 셌습니다 — 패턴 차이로 보이며 제 측정값을 씁니다).

⟹ **`57.1%` 는 구조적으로 참이지만 업무 빈도로는 무의미**하고, **"기존 주문 324건을 마이그레이션으로 전개" 는 QA 산물 100% 를 실 데이터로 굳히는 선택**입니다 (`feedback_qa_rounds_pollute_shared_data`).

### ⑧ 매트릭스가 **정정한 쪽이 옳았던 것** (제가 재확인)

- `Slip.requirePartnerForCommitted()` 호출처 = **8곳** (`1143·1159·1172·1188·1205·1220·1239·1262` — grep 실측). 조사 1 의 "7곳" 은 `:1262` 누락.
- `EstimateToSlipConverter.assignBundleComponent` = **`:126-129`** (조사 5 의 `:128-131` 이 밀림).
- 미등록 거래처 견적 **실 표본 0건**: `partner_id IS NULL` 활성 견적 **1건**(14:41:50 KST)이고 그 `partner_name` 부산냉난방테크는 `partner_db` 에 등록돼 있습니다 ⟹ **조사 3 이 옳고 조사 5 의 "동작 중" 은 틀렸습니다.**
- `partner_orders.slip_no` **전체 15 / 활성 0**, `slips.partner_id IS NULL` **전체 8 / 활성 1** (14:41:50 KST) — 매트릭스 정정 그대로.

### ⑨ 아직 **확정하지 않은 것** (제가 재현하지 않음 — 확정 금지)

| 주장 | 근거 출처 | 상태 |
|---|---|---|
| `partner_product_price_memory`(최근단가) 를 견적·수기전표는 쓰고 **전환·발행 경로는 쓰지 않는다** | 적대검증 각도 1 | 🚩 **매트릭스 전문에 한 번도 등장하지 않는 금액 축** — 사실이면 fieldMatrix 에 행이 있어야 함. **PM 재확인 필요** |
| 하류 `accounting_db.sales_accounting_slips` **2,512행** 이 `partner_name`·`due_date`·`memo`·`total_supply/vat`·`slip_date` 를 소비 ⟹ 유실이 회계 층으로 전파 | 각도 1 | 🚩 심각도 상향 근거. **PM 재확인 필요** |
| `quote_snapshots`(레거시 종합견적서) → 전표 **전환 경로 자체가 없다** ⟹ 매트릭스 ④절 "404 로 막힌다" 는 성립 안 함 | 각도 3 | 매트릭스 ④ 를 근거로 삼지 말 것 |
| soft-deleted 중 `partner_id IS NULL` + `status='COMPLETED'` **2건**(직접 시드) | 각도 4 | 마이그레이션 전제("커밋 전표는 거래처를 갖는다")를 깸 |
| 활성 주문 라인 1건이 존재하지 않는 `product_id` 참조(`aa757c01-…9001`, `created_by=qa-757`) | 각도 4 | QA 잔재. `product_id` 조인 마이그레이션 설계 시 미해소 참조 규칙 필요 |
| `slip_source_orders` 가 `order_no` 를 담는다 | 매트릭스 | **0행이라 동작 미확인** — 확정 금지 |
| `siteAddress`·`contactPhone` 의 **의도된 업무 의미** | — | `sales.ts:334-335`/`:989` 에 매핑은 있으나 **주문서 도메인에서의 정의는 미확정** → 개발책임자 확인 항목 |

---

## 3. 필드 매트릭스 (판매전표 기준 · 전수)

**골격 실측** (제 측정 14:40:56 / 14:45:30 KST):

| 테이블 | 컬럼 수 | 전표 전용(차집합) |
|---|---:|---|
| `slip_db.slips` | **86** | vs 견적 **69** · vs 주문 **68** · **둘 다에 없음 63** |
| `slip_db.slip_lines` | **26** | vs `estimate_lines` **4** · vs `partner_order_lines` **11** |
| `slip_db.estimates` | **29** | — |
| `slip_db.estimate_lines` | **25** | — |
| `partner_order_db.partner_orders` | **26** | — |
| `partner_order_db.partner_order_lines` | **21** | — |

- `slip_lines` − `estimate_lines` = `category_key` · `slip_id` · `source_order_line_id` · `unit_price_domain` (**4**)
- `slip_lines` − `partner_order_lines` = `bundle_set_options` · `line_total` · `note` · `parent_set_model` · `set_head` · `slip_id` · `source_order_line_id` · `specification` · `unit_price` · `unit_price_domain` · `unit_price_with_vat` (**11**)
- 세 문서 **공통 컬럼은 12개**뿐이고 그중 업무 필드는 `memo`·`partner_id`·`status` **3개**입니다(나머지 9 = `id` + BaseEntity 7 + `deleted_by_name`) — 각도 4 관찰, 제 컬럼 목록으로 재확인.

### 3-A. 헤더 — `slips` 86컬럼 전수

범례: **✅전환 가능**(원본이 가질 이유 없음/새로 생성) · **🟡보완 필요**(이름·의미 다름 또는 부분 승계) · **🔴유실**(원본에 값이 있는데 안 감) · **🔴없음**(원본에 자리가 없어 새로 입력)

| # | 판매전표 컬럼 | 견적서 | 주문서 | 판정 · 근거 |
|---|---|---|---|---|
| 1 | `slip_type` | 없음 | 없음 | ✅ 문서 종류. 전환 시 `OUTBOUND` 고정 |
| 2 | `slip_no` | `estimate_no` | `order_no` | ✅ 서버 채번 (`SlipService`) |
| 3 | `slip_date` | `estimate_date` | 없음 | 🔴유실 — 세 경로 전부 **전환 실행일로 새로 찍음**. `EstimateToSlipConverter.java:68` `LocalDate.now(clock)` · `PartnerOrderConvertService.java:197` `LocalDate.now()` (원문 확인) |
| 4 | `seq_no` | 있음 | 없음 | ✅ `slip_no` 에서 서버 파생 |
| 5 | `status` | 있음(5값) | 있음(6값) | ✅ 전환 결과는 항상 DRAFT |
| 6 | `version` | 있음 | `lock_version` | ✅ 새 문서라 0부터 |
| 7 | `partner_id` | 있음(nullable) | 있음(nullable) | 🟡 필수 강제 **시점**이 셋 다 다름 → §5 |
| 8 | `partner_name` | 있음 | **없음** | 🔴없음 — 주문 26컬럼에 부재(실측). 응답은 하드코딩 null(`PartnerOrderDetailResponse.java:78`) |
| 9 | `partner_code` | **없음** | 있음(NOT NULL) | 🟡 견적 전환은 `partnerId` 역조회(`EstimateToSlipConverter.java:88-90`), `partnerId` null 이면 건너뜀 |
| 10 | `business_number` | `partner_business_no` | `biz_code`(NOT NULL) | 🟡 견적은 `withProjectInfo` 1번 인자로 전달(`:92`) |
| 11-13 | `customer_tel` · `customer_address` · `customer_representative` | 부분(`partner_address` 만, 실측 활성 **0/24**) | 없음 | 🔴없음 — 견적 전환은 `applyEcountSchema` 를 **아예 호출하지 않음**(`:66-141` 전문 확인) |
| 14 | `source_warehouse_id` | 없음 | 없음(전환 시 사용자 입력) | 🔴없음 — 견적 전환은 **실재하지 않는 placeholder** 하드코딩(§4-C) |
| 15 | `source_warehouse_code` | 없음 | 없음 | 🟡 provenance. 견적 converter 는 미설정 / 발행 경로 `SlipPublishService.java:154` 는 설정 |
| 16-23 | 워커 8: `source_warehouse_code_pending`·`_snapshot_status`·`_attempt_count`·`_next_attempt_at`·`_claimed_at`·`_claim_token`·`_last_error`·`_abandoned_at` | 없음 | 없음 | ✅ 업무 데이터 아님. 전환 대상 아님 |
| 24-25 | `destination_warehouse_id` · `destination_warehouse_name` | 없음 | 없음 | ✅ INBOUND 전용 축 (⚠️ 각도 4: `destination_warehouse_name` 활성 0/128 로 INBOUND 축 자체 미검증) |
| 26 | `delivery_tag` | 없음 | 없음 | 🔴없음 — 견적 전환은 항상 null(`:95` 주석 "견적 변환 시 항상 null"). 태그이지 주소 접두가 아니므로 문자열 우회 불가 |
| 27 | `unload_date` | 없음 | 없음 | 🔴없음 — `delivery_tag` 파생. 태그 없으면 계산 불가(`:138` `applyDeliverySchedule(slip.getDeliveryTag(), null)`) |
| 28 | `delivery_address` | 없음 | **있음** | 🟡 주문→전표로 **유일하게 승계되는 배송 필드**(`PartnerOrderConvertService.java:206`). ⚠️ 실 데이터 **0/567** ⟹ 코드 판정만 |
| 29-31 | `shipping_address` · `inspection_address` · `receiver_phone` | 없음 | 없음 | 🔴없음 — 수신 계약 `PublishFromPartnerOrderRequest.java:36`/`:38` 에 자리는 있으나 보낼 값이 없음 |
| 32-34 | `supervision_address` · `project_name` · `recipient_phone` | 없음 | 없음 | 🔴없음 — 두 경로 모두 `withProjectInfo` 6인자 중 1번만 넘기고 5개에 명시적 null(`:92` 원문 확인) |
| 35-36 | `payment_due_label` · `payment_due_date` | `valid_until`(≠납기) | `due_date` **있음** | 🔴유실 — 주문 `due_date` 를 담을 **수신 DTO 필드가 없음**(16필드 전수 확인). ⚠️ 실 데이터 0/567 ⟹ 코드 판정만 |
| 37 | `discount_info` | 없음 | 없음 | 🔴없음 — 계약 `:41` 에 자리만. 고정DC/전역DC 와 무관한 인쇄·감사 reference |
| 38-39 | `collect_term` · `agree_term` | 없음 | 없음 | 🔴없음 (`agree_term` 은 할인과 무관 — "약정DC" 는 없는 말) |
| 40 | `memo` | 있음 | 있음 | 🔴유실(코드 판정만) — ① 단건 convert 헤더 payload **9키에 `memo` 없음**(`:198-207` 원문 확인, 수신 자리 `:39` 존재) ② 병합은 `ShippingInfo` 입력값으로 덮음 ③ 견적은 승계되나 `[견적변환: {번호}] ` 접두 강제(`:86`). ⚠️ 주문 실 데이터 0/567 |
| 41 | `requester_id` | 있음(도메인 유일 필수) | 없음 | 🟡 견적은 승계(`:87`). 주문은 `employeeCode` 미전송 → 내부 호출자 ID 각인(각도 4 근거) |
| 42-43 | `source_type` · `source_id` | `converted_slip_id`/`converted_at` | `source_estimate_id` | 🟡 견적은 sourceId 에 **견적번호**(사용자 표시 가능, `:133`). 주문은 **UUID 만** 남고 `orderNo` 는 조용히 소실(§4-A) |
| 44 | `idempotency_key` | 없음 | 있음(NOT NULL) | ✅ 전환 시 결정적 생성 |
| 45-52 | 라이프사이클 8: `accepted_by`·`accepted_at`·`completed_at`·`confirmed_at`·`dispatcher_user_id`·`dispatcher_signed_at`·`inspector_user_id`·`inspector_signed_at` | 없음 | 없음(`confirmed_at` 은 **의미 다름**) | ✅ 전표 전용. 전환 결과 DRAFT 이므로 전부 null 정상 |
| 53-60 | 인수자 서명 8: `signed_at`·`signer_name`·`signature_png`·`signature_hash`·`signature_channel`·`signature_source`·`signature_share_token`·`signature_share_expires_at` | 없음 | 없음 | ✅ 전표 전용 |
| 61-65 | 기사 서명 5: `driver_signed_at`·`driver_signature_png`·`driver_signature_hash`·`driver_signature_channel`·`driver_signature_source` | 없음 | 없음 | ✅ 전표 전용 |
| 66-70 | 배차·배송 5: `driver_name`·`driver_phone`·`delivery_batch_id`·`dispatch_status`·`classified_region_group` | 없음 | 없음 | ✅ 전표 생성 이후 붙는 독립 축 |
| 71 | `lock_flag` | 없음 | 없음 | ✅ 회계 마감이 사후 설정 |
| 72 | `printed_at` | 없음 | 없음 | ✅ 전표 인쇄 기록 |
| 73-75 | `revision_count` · `revision_count_baseline` · `redline_anchor_revision_no` | 없음(별도 `estimate_revisions`) | `revision_count` 만 | ✅ 새 문서라 0부터 |
| 76-77 | `io_type` · `time_date` | 없음 | 없음 | 🔴유실(비대칭) — 견적 **converter** 는 null / 견적 **발행 API** 는 `SlipPublishService.java:165-170` 에서 채움(원문 확인) ⟹ 같은 출고전표인데 생성 경로로 갈림. ⚠️ 전체 기준 `time_date` 137/144 |
| 78-86 | `id` · `deleted_by_name` · BaseEntity 7(`created_at/by`·`modified_at/by`·`deleted_at/by`·`is_deleted`) | 있음 | 있음 | ✅ 새 문서 감사값 신규 생성 |
| — | 헤더 합계(`total_*`) | **있음**(3개 NOT NULL) | **있음**(1개) | 🚩 **방향이 반대** — `slips` 에 `total_%` 컬럼 **0개**(실측). 전표는 라인이 권위(`SlipDisplayAmount`) ⟹ **전표에 합계 컬럼을 만드는 제안은 현행 권위 구조를 깬다** |

### 3-B. 라인 — `slip_lines` 26컬럼 전수

| 판매전표 라인 컬럼 | 견적 라인 | 주문 라인 | 판정 |
|---|---|---|---|
| `product_id` · `product_name` · `model_name` | 있음 | 있음 | ✅ |
| `quantity` | 있음 | 있음 | ✅ |
| `specification` | **있음** | **없음**(21컬럼 실측) | 🔴없음 — 주문 경유는 영구 소실. 수신 자리 `PublishLineRequest.java:34 spec` 존재 |
| `set_head` · `parent_set_model` · `bundle_set_options` | **있음** | **없음 (3종 전부)** | 🔴없음 — 🚨 **개발책임자 지시의 직접 대상**. 견적→전표만 승계(`EstimateToSlipConverter.java:126-129` `assignBundleComponent`) |
| `unit_price`(공급단가) | 있음 | **없음**(`price_vat` 만) | 🟡 전표가 재계산. 계약 `:36 unitPriceExVat` 미전송 |
| `unit_price_with_vat` | 있음 | `price_vat` | ✅ 실제 전달되는 유일한 금액 축 |
| `supply_amount` · `vat_amount` | 있음 | **있음 (585/586 채움)** | 🔴유실 — convert 라인 payload **7키에 없음**(`:154-161` 원문 확인). 수신 자리 `:38-39` 존재 ⟹ `SlipPublishAudit` 합계 0 적재 |
| `line_total` | 있음(**VAT 포함 T**) | `subtotal`(**VAT 포함 T**) | 🟡 **같은 이름이 전표에선 공급가액** — 이름만 보고 매핑하면 10% 어긋남 |
| `unit_price_domain` | 없음(`unit_price_with_vat` non-null 이 대신) | `amount_authority`(586 전건 `PRICE`) | 🔴유실 — 계약 12필드에 없어 전표는 무조건 `VAT_INCLUSIVE` 각인 |
| `category_key` | **없음**(25컬럼 실측) | 있음(NOT NULL) | 🔴**없음**(⚠️매트릭스는 "유실" 로 분류 — 오분류). `slip_lines` 활성 **0/302** ⟹ 오늘 관측 영향 없음 |
| `note` | 있음 | `remark`(500자) | ✅ 전달됨(`:159 remarks`). ⚠️ 500→200 절단 위험은 **코드 판정만**(각도 4 실측 최대 43자) |
| `source_order_line_id` | 없음 | 없음(라인 id 가 원본) | ✅ 주문 전환이 전달(`:160`). ⚠️ 활성 0/302 |
| `slip_id` | — | — | ✅ 부모 FK |
| BaseEntity 7 | 있음 | 있음 | ✅ |
| — | `line_no` **있음** | 없음 | 🟡 **전표에 담을 자리가 없음**. 계약 `:31 lineNo` 는 두 convert 모두 미전송 ⟹ 라인 순서 보존이 계약으로 보장되지 않음 |
| — | `specification_source` **있음** | 없음 | 🟡 전표에 자리 없어 소실. 규격 자체는 승계되므로 우선순위 낮음 |

---

## 4. 전환 유실 전수 — 세 갈래로

### 4-A. 🔴 **유실** — 원본에 값이 있는데 안 보낸다 (즉시 닫을 수 있는 층)

| # | 경로 | 항목 | 근거(제가 원문 확인) | 실 데이터 |
|---|---|---|---|---|
| L1 | 주문→전표 | 라인 `supply_amount`·`vat_amount` | payload 7키 `:154-161` ↔ 수신 자리 `PublishLineRequest.java:38-39` | **585/586** ✅근거 있음 |
| L2 | 주문→전표 | 라인 `amount_authority` | 계약 12필드에 자리 자체 없음 | **586/586 `PRICE`** ✅ |
| L3 | 주문→전표 | **`orderNo` 가 조용히 버려짐** | `:202 payload.put("orderNo", …)` ↔ `PublishFromPartnerOrderRequest` **16필드에 `orderNo` 없음**(전수 확인). `FAIL_ON_UNKNOWN_PROPERTIES=false` 라 **오류 없이 사라짐** | 599건 전건 보유 |
| L4 | 주문→전표 | `memo` · `due_date` | payload 9키 `:198-207` 에 없음 / 수신 DTO 에 `dueDate` 대응 필드 없음 | **0/567** ⚠️코드 판정만 |
| L5 | 주문→전표 | 라인 `lineNo`·`spec`·`unitPriceExVat` | 계약 `:31`/`:34`/`:36` 미전송 | `spec` 은 원본에도 없음 |
| L6 | 세 경로 공통 | **문서 일자** | `EstimateToSlipConverter.java:68` · `PartnerOrderConvertService.java:197` | 전건 |
| L7 | 견적→전표 | `memo` **원문 오염** | `:86 buildSlipMemo` 가 `[견적변환: {번호}] ` 접두 강제 | 전건 |
| L8 | 견적→전표 | `io_type`·`time_date` 비대칭 | converter 는 `applyEcountSchema` 미호출 / 발행 경로 `:165-170` 은 호출 | — |
| L9 | 병합 전환 | 헤더 7종이 **주문서가 아니라 사용자 재입력** | `MergeConvertToSlipRequest` `ShippingInfo`. 단건 경로엔 입력 자리조차 없음(`ConvertToSlipRequest`) | — |
| L10 | 잠복 | PUT 수정이 전환 이력 파괴 | `PartnerOrderUpdateService` `update()` 에 CONVERTED 가드 없음 · `replaceLines` 가 `converted_quantity` 리셋 (각도 2 가 좌표 `:78`→**`:107`** 로 정정) | `converted_quantity>0` **0건** ⟹ 미발화 |

### 4-B. 🔴 **원본에 없음** — 자리부터 만들어야 한다 (스키마 확장 층)

**주문서 라인** — 🚨 개발책임자 지시의 직접 대상
- `set_head` · `parent_set_model` · `bundle_set_options` (3종 전부 부재) · `specification` · `unit_price`(공급단가) · `line_no` · `note`(전용) · `unit_price_domain`
- ⟹ 세트 부모를 1행으로 담고, 전환 시 **`SlipPublishService.java:784-787` 이 400 으로 거부**합니다(`"세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요."`).
- **제 재측정(14:41:35 KST)**: 활성 BUNDLE 품목 **343개 전부 `bundle_mode='EXPAND'`**(KEEP 0) → 해당 활성 주문 라인 **331건** · 활성 주문 **324건** = **567건의 57.1%**. 조사 2(`model_name` 축)·조사 5(`product_id` 축)·제 측정이 **세 번 같은 값에 수렴**했습니다. 런타임 조회 키는 `model` 입니다(`SlipPublishService.java:780 lookupByModel`).
- ⚠️ **324건 전부 QA 산물**입니다(§2-⑦).

**주문서 헤더** — 수신 계약에 자리가 있는데 주문에 컬럼이 없어 못 보내는 것 6종: `partnerName`(`:32`) · `employeeCode`(`:33`) · `shippingAddress`(`:36`) · `receiverPhone`(`:38`) · `paymentDueLabel`(`:40`) · `discountInfo`(`:41`). 추가로 `orderApprovedAt`(`:42`) 은 memo 결합 로직이 준비돼 있는데 값을 안 보내 **항상 미작동**.

**견적서** — `partner_code` · 창고 · `delivery_tag` · `customer_tel`/`customer_representative` · `collect_term`/`agree_term` · `discount_info` · 프로젝트 4종.

**견적→주문 계약 자체** — `EstimateClient.EstimateLineSnapshot` 에 `setHead`·`parentSetModel`·`bundleSetOptions`·`specification`·`specificationSource`·`lineNo`·`unitPrice`·`unitPriceWithVat` **8종 전부 부재**(각도 2 전수 확인). 헤더 스냅샷도 `estimateId`·`estimateNumber`·`partnerCode`·`bizCode`·`dueDate`·`memo` 뿐. 🚩 게다가 **`estimates` 29컬럼에 `partner_code` 가 없어**(제 실측) `EstimateSnapshot.partnerCode()` 에 채울 원천이 애초에 없습니다 — **등록 거래처 견적조차** 이 경로로는 partnerCode 를 공급할 수 없습니다(각도 3).

### 4-C. 🔩 **하드코딩** — 값이 코드에 박혀 있다

| 항목 | 원문(제가 직접 확인) | 상태 |
|---|---|---|
| 창고 placeholder | `EstimateToSlipConverter.java:77-78` `java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")` | `inventory_db.warehouses` 에 **0행**(조사 3·4 독립 일치, 총 30건). 주석 `:75` 이 *"영업이 SlipForm 으로 정확한 창고 지정 후 SAVED 단계 진행"* 을 전제 ⟹ **"그대로 전환" 과 배치** |
| `withProjectInfo` 5 null | `:92` `slip.withProjectInfo(estimate.getPartnerBusinessNo(), null, null, null, null, null)` | 명시적 null 전달 |
| 주문 응답 null 5종 | `PartnerOrderDetailResponse.java:78`(partnerName) `:86`(siteAddress) `:87`(contactPhone) `:191`(bundleMode) `:193`(expandedComponents `List.of()`) · `PartnerOrderSummaryResponse.java:60` | 🚨 **`:86`·`:87` 은 FE 가 렌더링 중** → §2-① |
| 견적 폼 주소 | `EstimateFormPage.tsx:1198` `contactPhone: option.phone ?? null` 인접의 `address: null` | `partner_address` 활성 0/24 의 원인 |
| 사문화 상수 | `PartnerOrderConfirmService` `DEFAULT_WAREHOUSE_ID` | 선언 외 참조 0건 (각도 2 전수 grep) |

---

## 5. 🚨 거래처 예외 — 견적서 미등록 거래처 생성

### ① BE 는 완전히 열려 있습니다 ✅

- `estimates.partner_id` **nullable=YES**(실측) · partner 로 향하는 **FK 없음**(별도 DB 라 물리 FK 불가)
- 도메인 필수는 **`requesterId` 하나뿐** (`Estimate.java:199-201`) · Javadoc `:185` *"partnerId 거래처 UUID (선택)"* (⚠️ 매트릭스는 `:186` 으로 적었으나 실제 `:185` — 각도 2·3 일치)
- `EstimateService.java:204-206` 이 요청값을 그대로 저장하고 파일 전체에 `PartnerClient` grep **0건**
- 생성 API 필수는 `@NotEmpty lines` + 라인 3필드뿐

### ② 그러나 **신규 생성은 지금 불가능합니다** 🔴 — 요구 미충족

§2-② 참조. 가드가 **둘**(`:1759`, `:1767`)이고 거래처명·사업자번호 Input 이 **`readOnly`**(`:2019`, `:2032`)이며, 이는 `R8-DESIGN-1` 결정이고 판매전표도 같은 `P0 D-AC3-01` 결정으로 닫혀 있습니다.

**실 표본 0건** — `partner_id IS NULL` 활성 견적 1건(`2026/07/16-9`)의 거래처는 `partner_db` 에 **등록돼 있습니다**(14:41:50 KST). ⟹ **판정 불가**이며 착수 시 **RED-first 고정 지점**은 *"미등록 거래처명으로 견적 생성 → 저장 → 전표 전환까지"* 입니다. 관련 테스트 커버리지도 0(각도 3 전수 확인).

### ③ 판매전표는 **충돌하지 않습니다** ✅ — 참고할 패턴이 이미 있습니다

`slips.partner_id` **nullable**, 생성 시 필수 아님, **`Slip.java:1108-1111 send()` 에서 처음 차단** → 이후 커밋 전이 **8곳**이 `requirePartnerForCommitted()`(`:1126-1131`) 통과 필요. FE 저장 게이트에도 거래처 조건 없음(`SlipFormPage.tsx:1966-1968`). ⟹ **"생성은 허용 · 전송 시 확정"** 패턴.

그리고 **견적→전표 직결 경로는 이 성질을 이미 지킵니다** — `EstimateToSlipConverter.java:83` 이 `estimate.getPartnerId()`(null 가능)를 그대로 넘겨 DRAFT 로 남깁니다(제가 원문 확인).

### ④ 주문서에서 성질이 **소멸합니다** 🔴

- `partner_code` **NOT NULL** · `biz_code` **NOT NULL** · **`partner_name` 컬럼 없음** (26컬럼 실측)
- `PartnerOrderFromEstimateService` 가 `requirePartnerId(partnerCode, bizCode)` 무조건 호출 → `PartnerOrderPartnerIdentityResolver.java:33-43` 이 미등록이면 **400**, partner-service 장애면 **502**(fail-closed)
- 🚨 **네 번째 차단기** `SlipPublishService.java:515-518` (§2-③)
- 🚨 `partner_code` 는 **행 단위 접근제어 키 + 멱등키 구성요소** (§2-④)

### ⑤ 개방도가 **요구와 정반대로 배열돼 있습니다** 🚩

| | BE 개방도 | 실 사용자 경로(FE) |
|---|---|---|
| 견적서 (**가장 열려야 함**) | 최대 개방 | **완전 폐쇄** (자유입력 0) |
| 판매전표 | 전송 시 게이트 | **가장 열림** (거래처 없이 저장 가능) |
| 주문서 (가장 닫혀도 됨) | **최대 폐쇄** (NOT NULL 2 + 4중 가드) | — |

### ⑥ 이 성질을 깨지 않기 위한 **설계 불변식**

1. **`estimates.partner_id` 에 FK 나 NOT NULL 을 거는 어떤 제안도 안 됩니다.**
2. 🚨 **`estimates` 에 `partner_code` 를 추가하고 전환이 그것을 넘기게 만드는 순진한 보완은 금지** — 그 순간 `SlipPublishService.java:594-598`(404) / `:517-518`(400) 이 켜져 **미등록 견적이 전환 단계에서 죽습니다**. 불변식 문장: *"미등록 거래처 견적은 partnerCode 를 비운 상태로 전표 전환까지 도달해야 한다."* (blank 면 검증 skip 하는 `:585-587` 경로가 정상 경로로 유지돼야 함)
3. 거래처를 **뗄 수 있어야** 합니다 — `Estimate.editHeader`(`Estimate.java:219-240`)가 `null = 기존 값 보존` 이라 PUT 으로 뗄 수 없습니다. 이것을 함께 다루지 않으면 *"붙인 뒤 못 떼는"* 상태가 됩니다.
4. 매트릭스 내부 불일치 주의 — 설계제약 #4 의 3종에는 `partner_code`/`biz_code` NOT NULL 완화가 **빠져 있고** openQuestion #2 에는 들어 있습니다. #4 만 읽고 설계하면 DB 제약에서 막힙니다.

---

## 6. 슬라이스 제안

> 🚫 **"한 번에 전부" 는 제안하지 않습니다.** 8슬라이스로 쪼갰고, **금액에 닿는 것은 [정밀]** 로 표시했습니다.
> 🚨 **모든 슬라이스의 공통 선행 조건 (S0)** — **발화 조건을 먼저 만들어야 합니다.** 전환 산출물이 세 축 모두 0건이라 라이브 재현이 불가하고, 원인이 "아직 안 써서" 가 아니라 **"경로가 막혀서"** 입니다(견적→주문 100% 404 · 주문→전표 57.1% 400). QA 브리핑 맨 앞에 **발화 조건 카운트**를 두고, **실 관리자/사용자 API 로** 전환 가능한 견적·주문을 먼저 만드십시오. **DB 직접 INSERT 금지.** 집PC 에서는 수치를 다시 세셔야 합니다.

### 마이그레이션 — 각 서비스 **현재 최고 번호만** (파일 기준, 제 측정 14:39 KST · wmain)

| 서비스 | 최고 번호 | 파일 수 | 비고 |
|---|---|---:|---|
| `slip-service` | **V118** | 79 | 번호 공백 다수 |
| `partner-order-service` | **V18** | 17 | **V16 결번** |
| `product-service` | **V35** | 35 | |
| `inventory-service` | **V25** | 25 | |
| `partner-service` | **V14** | 14 | |
| `accounting-service` | **V96** | 70 | |
| `auth-service` | **V100** | 99 | |
| `notification-service` | **V10** | 10 | |
| `user-service` V12 · `groupware-service` V18 · `dashboard-service` V7 · `dc-config-service` V5 · `arologis-service` V25 · `partner-auth-service` V3 | | | |

🚨 **번호는 제가 만들지 않았습니다.** PM 이 ① 서비스 파일 최고 ② **DB 적용 최고**(`flyway_schema_history`) ③ **열린 PR 예약분** 셋을 다 세십시오 (`feedback_migration_number_three_counts`). 특히 `slip-service`(V118)·`accounting-service`(V96)는 열린 트랙과 충돌 이력이 있습니다.

---

### S1 — [FIX] 주문 상세/목록 응답 하드코딩 null 제거 · **신속 · 금액 무관**

- **무엇**: `PartnerOrderDetailResponse.java:78`(partnerName) `:86`(siteAddress) `:87`(contactPhone), `PartnerOrderSummaryResponse.java:60`. 최소안 = `partner_code`(NOT NULL 이므로 항상 있음) 로 partner-service 를 해석해 `partnerName` 을 채움. `siteAddress`/`contactPhone` 은 **§7-Q6 결정 후**.
- **왜 이 경계**: **FE 가 이미 렌더링 중인 도달 가능 결함**(§2-①)이고, 스키마 변경 없이 BE 한 파일 계열에서 닫힙니다. 스냅샷(=전환 무손실용 저장)은 S6 으로 분리 — **표시 문제와 승계 문제를 섞지 않습니다.**
- **회귀 위험**: 낮음. partner-service 호출 추가 시 **fail-closed 여부** 결정 필요(장애 시 상세가 500 이 되면 안 됨 → null 유지가 안전). `@JsonInclude(NON_NULL)` 이라 값이 생기면 FE 응답 키가 늘어남 → mock handler 유무 확인 필수(`feedback_mock_gate_leaks_to_real_api`).
- **선행**: §7-Q6.
- **범위**: BE(partner-order-service) · FE 확인만 · **마이그레이션 없음**

### S2 — [FIX] 전환 계약 정합 — `orderNo` 조용한 소실 · `lineNo` · **신속 · 금액 무관**

- **무엇**: `PartnerOrderConvertService.java:202` 가 넣는 `orderNo` 가 `PublishFromPartnerOrderRequest`(16필드)에 자리가 없어 **오류 없이 사라짐**. 사용자 표시용 주문번호를 전표에 남길 자리를 확정(수신 DTO 필드 추가 or `slip_source_orders` 경유). 라인 `lineNo` 도 함께.
- **왜 이 경계**: **에러가 안 나서 지금까지 안 보인 계약 구멍**이고, 값은 이미 599건 전건 존재합니다. 계약 정합만 다루므로 금액에 닿지 않습니다.
- **회귀 위험**: `slip_source_orders` 는 **0행이라 동작 미확인**(§2-⑨) — 이 테이블을 경로로 고르면 그 자체가 미검증 표면입니다. DTO 필드 추가 쪽이 회귀가 작습니다. `lineNo` 도입 시 기존 삽입 순서 의존 로직과 **정렬 이중화** 주의.
- **선행**: 없음.
- **범위**: BE 2서비스(partner-order convert · slip publish DTO) · **마이그레이션 없음**

### S3 — [FIX] 주문→전표 **금액 권위** 전달 · 🔴 **[정밀]**

- **무엇**: 라인 `supply_amount`·`vat_amount`(**585/586 실 데이터**) · `amount_authority`(**586 전건 `PRICE`**) · `unitPriceExVat` 를 payload 에 싣기. 수신 자리는 `PublishLineRequest.java:38-39`·`:36` 에 이미 존재.
- **왜 이 경계**: 값이 실제로 있고, 스키마 변경이 없으며(`slip_lines.unit_price_domain` 이미 존재), **`SlipPublishAudit` 합계가 항상 0 으로 적재되는 것**과 **표시 단가 10% 오차**가 여기서 닫힙니다.
- **회귀 위험**: 🔴 **최상**. ① `line_total` 이 전표=공급가액 / 주문=VAT 포함 T 로 **이름은 같고 의미가 반대**(§7-Q7) ② 라인을 평면 재생성하면 도메인이 `SUPPLY` 로 떨어져 단가가 어긋남 → `SlipLine.copyOf` 규칙 재사용 필요 ③ **양방향 RED 필수**(`feedback_bidirectional_red_for_fix`): RED-A "정상 금액이 그대로 전달된다" / RED-B "재계산 경로가 되살아나지 않는다" **동시 GREEN**.
- **선행**: §7-Q7 (line_total 의미 통일 or 매핑 규칙 문서화).
- **범위**: BE 2서비스 · **마이그레이션 없음**

### S4 — [FIX] 견적→전표 직결 경로 비대칭 해소 · 🔴 **[정밀 일부]**

- **무엇**: ① 창고 placeholder(§4-C) ② `applyEcountSchema` 미호출 ③ `withProjectInfo` 5 null ④ `memo` 접두 오염 ⑤ `slip_date` 를 견적일에서 승계 ⑥ **발행 API 가 검증한 `partnerId` 를 버리는 것** — `SlipPublishService.java:135` 가 `verifiedPartnerId` 를 얻고 `:150-153` 에서 partnerId 자리에 `null` 을 넘김(제가 `Slip.java:694-697` 시그니처로 대조 확인). 주문 경로 `:236-239` 는 넘김 ⟹ **비대칭**.
- **왜 이 경계**: **견적→전표 직결이 오늘 요구를 지키는 유일한 통로**입니다(거래처 개방성 승계 §5-③). 변경이 **slip-service 안에 갇힙니다**.
- **회귀 위험**: ⑥ 을 고치면 `Slip.send()` 게이트에 걸리던 전표가 안 걸리게 되므로 **사후 backfill 로직과 충돌** 가능. ⑤ 는 **마감·컷오프 게이트 기준일**을 바꾸므로 `closedDateGuard`/`cutoffGuard` 회귀 필수. ① 은 §7-Q5 결정 전엔 손대면 안 됨.
- **선행**: §7-Q5.
- **범위**: BE(slip-service) 단독 · **마이그레이션 없음**(창고를 "실제 default 창고 등록" 으로 풀면 inventory-service 데이터 작업 발생)

### S5 — [FEAT] 견적서 미등록 거래처 신규 생성 개방 · **정책 승인 선행**

- **무엇**: ① `EstimateFormPage.tsx:1759`·**`:1767`** 가드를 신규 경로에 대해 완화 ② 거래처명 자유입력 재도입(`:2010-2036` readOnly 강등 되돌림 + `PartnerAutocomplete` 계약 확장 — 현재 `PartnerOption | null` 만 방출) ③ `Estimate.editHeader:219-240` 의 `null=보존` 비대칭 해소(**뗄 수 있게**) ④ TS 타입 비대칭 정리(`CreateEstimateRequest.partnerId: string` 필수 ↔ `Update…?: string`)
- **왜 이 경계**: **개발책임자 지시의 명시적 예외**이고, BE 무변경으로 끝나며 slip-service·partner-order-service 를 건드리지 않습니다.
- **회귀 위험**: 🔴 **높음** — `R8-DESIGN-1`/`P0 D-AC3-01` 이 막으려던 것(화면 거래처 ↔ `partnerIdSnapshot` 괴리 → 회계 귀속 오류)이 되살아납니다. **대체 방어선 필수**: 미등록 견적을 화면·응답에서 명시적으로 표시(마커) + 전환 시 거래처 확정 유도. ③ 을 빠뜨리면 *"붙인 뒤 못 떼는"* 상태.
- **선행**: §7-Q2 (정책) · **RED-first**: 실 표본 0이라 시나리오를 먼저 정의 — *"미등록 거래처명 입력 → 견적 저장 → 조회 → 전표 전환(DRAFT) 까지"*.
- **범위**: FE(desktop + design-system) · BE 무변경 · **마이그레이션 없음**

### S6 — [FEAT] 주문서 **헤더** 업무 스냅샷 · 🔴 **[정밀]** · 마이그레이션

- **무엇**: `partner_orders` 에 `partner_name` 외 업무 헤더 스냅샷 추가. **후보 목록**(수신 계약에 이미 자리가 있는 것 우선): `partner_name` · `employee_code` · `shipping_address` · `receiver_phone` · `payment_due_label` · `discount_info`. 그리고 `slip_date` 대응(주문일) · `delivery_tag` · `unload_date` 는 §7-Q1 로 범위 결정.
- **왜 이 경계**: **라인(S7)과 분리**합니다 — 헤더는 금액 재배분이 없어 회귀가 작고, 라인은 세트 전개 정책 결정이 선행돼야 합니다. 한 마이그레이션에 둘을 묶으면 되돌리기가 어려워집니다.
- **회귀 위험**: 마이그레이션 번호 충돌(§ 위 표 — `partner-order-service` V18, **V16 결번 주의**). 컬럼 추가는 Hibernate validate 에 안전하나 **DROP 은 다른 트랙을 재시작 루프에 빠뜨립니다**(`feedback_unmerged_migration_blocks_other_tracks`). partner 포털 응답 필드가 늘어나므로 `PartnerSelfScopeGuard` 노출 범위 재확인.
- **선행**: §7-Q1(범위 확정) · §7-Q3(거래처 개방을 주문까지 할지 — `partner_code` NOT NULL 완화 여부가 이 마이그레이션에 함께 들어갈지 결정)
- **범위**: BE(partner-order-service) · **마이그레이션 1건**(번호는 PM 이 확정)

### S7 — [FEAT] 주문서 **라인** 세트 계보 + 규격 + 공급단가 · 🔴 **[정밀 · 최대]** · 마이그레이션

- **무엇**: `partner_order_lines` 에 `set_head`·`parent_set_model`·`bundle_set_options`·`specification`·`unit_price`(공급단가)·`line_no`·`unit_price_domain` 추가 + **전개 시점 정책 구현**.
- **왜 이 경계**: 🚨 **개발책임자 지시의 직접 대상**이고, **활성 주문 57.1%(324건)의 전환 400 이 여기서 닫힙니다**. 가장 크므로 **마지막**이며, 앞의 S1~S3 이 payload 층을 먼저 닫아 두면 이 슬라이스는 스키마+전개에만 집중할 수 있습니다.
- **왜 견적 규약 재사용인가**: 견적서는 **저장 시 전개**해 부모를 남기지 않습니다 — 제 실측(14:45 KST 계열) `estimate_lines` 활성 35건이 참조하는 품목 5개 전부 SINGLE 이고 `set_head` 6 · `parent_set_model` 15 가 전개 산물입니다. 주문도 같은 규약으로 맞추면 세 문서가 한 규약으로 정렬되고 `EstimateToSlipConverter.java:126-129` 패턴을 그대로 씁니다 — **새 규약을 만들 필요가 없습니다.**
- **회귀 위험**: 🔴 **최상**. ① **기존 활성 324건 전개 = 금액 재배분 = 무결성 도메인** ② 그 324건은 **전부 QA 산물**(§2-⑦) — 되살리면 QA 가 실 데이터가 됩니다 ③ 활성 라인 1건이 **존재하지 않는 `product_id`** 참조(각도 4) → 미해소 참조 규칙 필요 ④ `#1089`(기본 구성품 정의)·`#1133`(품절 BUNDLE **부모가 남고 잠긴다** — `CURRENT-WORK.md` 2026-08-10 결정, **미실행**)와 정합 필수 ⑤ 견적의 `bundle_set_options`(V115)·`specification_source`(V116)는 **실 데이터 0/35** 라 "검증된 적 없는 패턴을 복제" 하는 셈(각도 4).
- **선행**: §7-Q4 · §7-Q5(QA 잔재 처리) · **다른 트랙의 정찰 문서** `docs/dev-reports/2026-08-10-order-bundle-carryover-recon.md`(untracked, `#1089`·`#1126` 정합 절 보유)와 **범위 중복 확인 필수** — 같은 것을 두 트랙에 열지 마십시오.
- **범위**: BE(partner-order-service + product-service `BundleExpander` 호출 배선) · FE(주문 화면 세트 표시) · **마이그레이션 1건**

### S8 — [FEAT] 견적→주문 **실 배선** · 범위 큼 · 마지막 or 후속

- **무엇**: `EstimateClient` 운영 구현 신설(현재 `FixtureEstimateClient.java:17-19` 가 무조건 `Optional.empty()` → `PartnerOrderFromEstimateService.java:59-62` 가 항상 404). slip-service 에 견적 조회 API 신설 + partner-order-service 클라이언트 배선 + **`EstimateClient` 스냅샷 계약 8종 확장**(§4-B).
- **왜 이 경계**: 사슬의 가운데가 죽어 있으므로 **"견적→전표" 와 "주문→전표" 두 직결 경로를 먼저 무손실로 만든 뒤** 붙이는 것이 안전합니다. 지금 연결하면 유실 지점이 두 배로 늘어난 상태에서 배선을 검증하게 됩니다.
- **회귀 위험**: 2서비스 신규 API + FE 호출자 0건(각도 4 전수 grep)이라 **사용자 진입점부터 설계**해야 합니다. `estimates` 에 `partner_code` 가 없어(§4-B) 계약을 그대로 쓰면 등록 거래처 견적도 실패합니다.
- **선행**: S3·S6·S7 · §7-Q3
- **범위**: BE 2서비스 + FE · **마이그레이션 가능성 있음**(견적 측 `partner_code` 를 어떻게 공급할지에 따라)

### 실행 순서 권고

```
S0(발화 조건) ──▶ S1 ─▶ S2 ─▶ S3[정밀] ─▶ S4[정밀]
                              └─ S5(정책 승인 후, 병행 가능 · FE 단독)
                                     └─▶ S6[정밀·MIG] ─▶ S7[정밀·MIG·최대] ─▶ S8
```
S5 는 FE 단독이라 BE 트랙과 **병렬 가능**합니다. S6·S7 은 같은 서비스 마이그레이션이라 **직렬**(번호 충돌 방지). 백엔드 트랙은 Docker 이미지·DB 가 전역이므로 **직렬화**하십시오(`feedback_parallel_backend_tracks_share_docker_stack`).

---

## 7. 개발책임자 확인 항목 — 선택지와 대가

### Q1 🚨 [최우선 · 범위] "주문서가 판매전표 정보를 모두 보유" 의 **범위**를 어디까지로 정하시겠습니까

전표 헤더 86개 중 주문에 없는 것이 **68개**이고, 그중 **43개는 전표 전용 lifecycle**(서명 13 · 배차 5 · 검수/출고 8 · 워커 8 · 인쇄/마감 등)이라 주문이 가질 이유가 없습니다.

- **(a) 업무 헤더 약 20개 + 라인 7개로 확정** — `partner_name` · 창고 · `delivery_tag` · `unload_date` · 주소 3(shipping/inspection/supervision) · 전화 2 · `customer_*` 3 · 결제 2 · `discount_info` · `collect_term`/`agree_term` · `project_name` · `employee_code` / 라인 `specification`·`set_head`·`parent_set_model`·`bundle_set_options`·`unit_price`·`unit_price_domain`·`line_no`
  - 대가: `partner_orders` 컬럼이 26 → 46 근처로 늘어남. 주문 화면·포털 응답 표면이 넓어짐
- **(b) 더 좁게 — 세트 계보 + 규격 + 금액 권위만** (S7 만)
  - 대가: 전환 시 헤더는 여전히 사용자 재입력 ⟹ **"그대로 전환" 이 부분적으로만 성립**
- 🚩 **부속 테이블 축은 이 프레이밍에서 빠집니다** — `slip_db` 에 BASE TABLE 41개 중 대조된 것은 `slips`·`slip_lines` 2개뿐입니다(각도 1). 첨부(`slip_attachments`)·이력(`slip_revisions` 197행·`slip_audit_logs` 62행)·서명감사·배차 12개는 **대부분 전표 생성 이후 lifecycle 이라 대상이 아닌 것이 맞지만**, "검토 후 제외" 라고 판단을 받아 두시는 편이 안전합니다.

### Q2 🚨 [정책 · 무결성 도메인] 견적서 신규 생성에서 **미등록 거래처를 여는 것**을 승인하시겠습니까

지금은 요구가 **미충족 상태**입니다(§5-②). 승인하시면 함께 결정이 필요합니다:
- ② -1 **`R8-DESIGN-1` / `P0 D-AC3-01` 의 자유입력 금지 결정을 견적서에 한해 되돌리는가** — 이것이 실제 질문입니다. 대가: 화면 거래처 ↔ `partnerIdSnapshot` 괴리 위험이 되살아나므로 대체 방어선 필요
- ② -2 **거래처를 뗄 수 있게 할 것인가** — `editHeader` 의 `null=보존` 을 풀지 않으면 붙인 뒤 못 뗍니다
- ② -3 **RED-first 시나리오 정의** — 실 표본 0건, 테스트 커버리지 0

### Q3 🚨 [정책 · 무결성 도메인] **미등록 거래처를 주문서까지** 허용하시겠습니까

- **(A) 견적서까지만 미등록 허용 — 권장** ⟵ 견적→전표 **직결**은 이미 무손실로 열려 있고(`EstimateToSlipConverter.java:83`), 변경이 **slip-service + FE 안에 갇힙니다**. 주문 단계에서 거래처 확정을 강제 = **판매전표가 이미 채택한 패턴**(생성 허용 / 전송 시 확정)
  - 대가: 거래처를 못 정한 견적은 주문 단계에서 진행이 막힘 (명시적 정책화 필요)
- **(B) 주문서까지 개방** — `partner_orders.partner_name` 추가 + `partner_code`/`biz_code` **NOT NULL 완화** + `PartnerOrderPartnerIdentityResolver` 우회 + **`SlipPublishService.java:515-518` 완화** + **`PartnerSelfScopeGuard` 자기범위 검증 재설계(P0 보안 표면)** + **멱등키 조립 재설계** ⟹ **3서비스**
  - 대가: 요구를 넘어서는 범위. 🚩 요구(*"견적서는 미등록 거래처로도 생성 가능"*)는 **(A) 만으로 충족됩니다.**

### Q4 🚨 [설계 결정] 주문서 세트를 **저장 시 전개**할까요, **전환 시 전개**할까요

- **(a) 저장 시 전개 (견적과 동일) — 권장** ⟹ 세 문서가 한 규약으로 정렬, `assignBundleComponent` 패턴 재사용, 새 규약 불필요
  - 대가: 주문 저장 시점에 product master 를 읽어야 함. **기존 활성 324건 처리 결정 필요**
- **(b) 전환 시 전개** ⟹ 구현량·마이그레이션 감소
  - 대가: 주문 후 master 변경 시 전표가 달라져 **"그대로 전환" 과 충돌**
- **(c) 부모로 넘기고 전표가 전개** ⟹ 현재 `SlipPublishService.java:784-787` 이 거부하므로 **그 가드를 여는 일**
  - 대가: 전표에 세트 부모 행이 생기며 금액 권위 구조가 흔들림
- **정합 확인 필요**: `#1089` **기본 구성품 정의** — (a) `is_default=true` 만 전개 / (b) 비-`SINGLE_SET` 은 등록 전체·`SINGLE_SET` 만 옵션 필터 · `#1133` **품절 BUNDLE 은 부모가 남고 잠긴다**(2026-08-10 결정, **미실행**) ⟹ 전개 정책의 예외로 남길지 통합할지
- **기존 활성 324건**: (i) 마이그레이션으로 전개 / (ii) 그대로 두고 전환 시점에만 전개 — 🚩 **324건 전부 QA 산물이라 (i) 은 QA 를 실 데이터로 굳힙니다.** 금액 재배분을 수반하므로 **무결성 도메인**입니다.

### Q5 [데이터] **QA 잔재**를 어떻게 처리하시겠습니까

활성 주문 **567건 전부**가 QA 산물이고(생성자 전수 확인, 14:41:05 KST), 라인 `remark` **551/584** 이 `codex-r4-985…` 입니다. 활성 견적 24건·활성 전표 128건 중 127건도 합성 UUID 생성자입니다. 정리 후 진행할지, 그대로 둘지 판단이 필요합니다. 🚫 **잔재를 지워 "해결" 하는 것은 금지**이므로, 정리한다면 근거를 PR 에 남기고 정상 경로로 하십시오.

### Q6 [확인 요청] `siteAddress` · `contactPhone` 의 **업무 의미**를 확정해 주십시오

**§2-① 로 상태가 바뀌었습니다** — "출처 못 찾음" 이 아니라 **FE 3화면에 실재하는 칸이 BE 하드코딩 null 로 영구 공란인 도달 가능 결함**입니다. 매핑 힌트는 코드에 있습니다(`sales.ts:334-335` `siteAddress ← partnerAddress` · `:989` `contactPhone ← row.phone`). 확정 필요:
- (a) 판매전표 `supervision_address`/`recipient_phone` 에 대응 (b) `delivery_address`/거래처 전화의 별칭 (c) 폐기하고 FE 칸 제거

### Q7 [확인 요청] `line_total` **의미 충돌**을 통일하시겠습니까

전표 `line_total` = **공급가액(VAT 미포함)** / 견적 `line_total`·주문 `subtotal` = **VAT 포함 합계 T**. 이름이 같고 의미가 반대라 전환 구현이 이름만 보고 매핑하면 **10% 어긋납니다**. (a) 통일(마이그레이션 + 회계 하류 영향) / (b) 매핑 규칙 문서화 + 계약 테스트로 고정.

### Q8 [확인 요청] 견적 전환 **창고 placeholder** 를 어떻게 하시겠습니까

`00000000-0000-0000-0000-000000000001` 은 `inventory_db.warehouses` 에 **실재하지 않습니다**. (a) 실제 default warehouse 등록 (b) 견적에 창고 필드 추가 (c) 전환 시 창고 선택 강제(주문 경로와 동일). 소스 주석 `EstimateToSlipConverter.java:76` 은 *"운영 cutover 시점 default warehouse 정책 도입 가능"* 을 열어 두고 있습니다.

### Q9 [PM 재확인 요청 · 제가 확정하지 않음] 아래 2건은 **매트릭스에 없는 금액/회계 축**입니다

- **최근단가 `partner_product_price_memory`** — 견적·수기 전표는 쓰고 **전환·발행·주문 경로는 쓰기 0건**(각도 1). 사실이면 **"수기 전표는 최근단가를 남기고 전환 전표는 안 남긴다"** 는 금액 축 비대칭입니다. ⚠️ 이 테이블은 QA 잔재(`561,600`)가 들어간 곳이라 행 수를 업무 빈도로 인용하면 안 됩니다.
- **하류 `accounting_db.sales_accounting_slips` 2,512행 / `_lines` 10,290행** — 소비 컬럼(`partner_name`·`due_date`·`memo`·`total_supply/vat`·`slip_date`)이 **본 보고서 유실 목록과 정확히 겹칩니다**(각도 1). 사실이면 **심각도가 올라갑니다**(결론은 뒤집히지 않음).

---

## 부록 — 후속 fix 브리핑을 위한 **좌표 정정표**

매트릭스·조사 보고서의 좌표를 그대로 인용하지 마십시오. 아래는 **원문 대조로 확정된 값**입니다.

| 잘못된 좌표 | 정정 | 확인자 |
|---|---|---|
| `Estimate.java:186` "partnerId (선택)" | **`:185`** (`:186` 은 `@param partnerName`) | 각도 2·3 |
| `EstimateToSlipConverter.java:128-131` `assignBundleComponent` | **`:126-129`** | 매트릭스 정정 + 제가 재확인 |
| `BundleModePolicy.java:13-17` | **`:12-16`** | 매트릭스 정정 + 각도 1·2·4 |
| `PartnerOrderDetailResponse.java:186/:188/:80-81` | **`:191`(bundleMode) `:193`(expandedComponents) `:78`(partnerName) `:86`(siteAddress) `:87`(contactPhone)** | 매트릭스 정정 + 제가 재확인 |
| 매트릭스의 정정문 중 `:188 = line.getLineTotal()` | **`:187`** (`:188` 은 `getAmountAuthority()`), `:81` 은 `getSlipPublishStatus()` | 각도 2 |
| `ConvertToSlipRequest.java:24` warehouseCode | **`:20`** (409 문구는 javadoc `:15-16`) | 각도 2 |
| `PartnerOrderUpdateService.java:78 replaceLines` | **`:107`** (`update()` 는 `:85-121`, 상태 가드 없음) | 각도 2 |
| `SlipPublishService.java:254-255` "customer* 없음" 주석 | **`:251`** | 각도 2 |
| `EstimateToSlipConverter.java:122-125` "5-arg create" | **8인자 호출** (실질 주장 = `categoryKey` 미전달, 정확) | 각도 2 |
| `EstimateToSlipConverter.java:138` `applyDeliverySchedule(null,null)` | 원문은 **`applyDeliverySchedule(slip.getDeliveryTag(), null)`** (효과 동일, 인용 원문 아님) | 각도 2 + 제가 재확인 |
| `requirePartnerForCommitted` 호출처 "7곳" | **8곳** (`1143·1159·1172·1188·1205·1220·1239·1262`) | 매트릭스 정정 + 제가 grep 재확인 |
| "둘 다에 없는 컬럼 **62개**" | **63개** | 각도 1·4 + 제가 `comm` 재계산 |
| `SlipPublishService.java` 경로 | **`slip/publish/`** (`slip/service/` 아님) — 좌표에 디렉터리를 붙이십시오 | 각도 1 + 제가 확인 |

**제가 원문/DB 로 직접 확인한 좌표**(그대로 사용 가능): `SlipPublishService.java:135`·`:150-153`·`:165-170`·`:171-173`·`:223`·`:236-239`·`:515-518`·`:780`·`:784-787` · `Slip.java:694-697`·`:1108-1111`·`:1126-1131` · `EstimateToSlipConverter.java:66-92`·`:115-142` · `PartnerOrderConvertService.java:154-161`·`:197-207` · `PublishFromPartnerOrderRequest.java`(16필드, `orderNo` 없음) · `EstimateFormPage.tsx:1758`·`:1759-1765`·`:1767-1772`·`:2004-2008`·`:2019`·`:2032` · `SalesPartnerOrderDetailPage.tsx:1028-1029`·`:1085`·`:1089` · `QuoteView.tsx:135`·`:139` · `sales.ts:334-335`·`:557-558`·`:663-664`·`:989`