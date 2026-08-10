# 주문서 상세 ↔ 판매전표 상세 전수 대조

> 개발책임자 지시 (2026-08-10): *"주문서 상세도 **판매전표 상세와 비슷한 UI 및 항목들**로 구성해줘. **열 내역도 판매전표상세와 다른 것 같아.**"*

> 워크플로우 10에이전트 · 조사 5축 병렬 → 차이 표 합성 → 적대검증 3각도 → 슬라이스 제안


## 결론 요약

판매전표 상세(SlipDetailPage.tsx, mode=OUTBOUND)와 주문서 상세(SalesPartnerOrderDetailPage.tsx)를 섹션·열 단위로 대조했습니다. 두 화면의 읽기전용 라인 표는 **둘 다 10열이지만 겹치는 열이 5개뿐**이고, 그중 2개는 이름이 다르고(단가(VAT포함)↔납품가, 합계(VAT포함)↔소계) **모델명·품목명은 순서가 서로 뒤집혀 있습니다**(판매전표 모델명(:4536)→품목명(:4537) / 주문서 품목명(:1175)→모델명(:1176)). 판매전표에만 있는 열은 #(행번호 버튼)·규격·공급가액·부가세 4개, 주문서에만 있는 열은 전환됨·잔여·묶음 처리·구성품 펼침 4개이며 뒤 2개는 BE 가 리터럴 null/빈배열을 넣어 **데이터와 무관하게 영구히 '-'** 입니다(PartnerOrderDetailResponse.java:191, :193). 섹션은 판매전표 28개 중 진행 ProgressBar·결재 정보·전자서명·반려 사유·기사 정보·배송/정산(V20)·잠금 배너·삭제요청 배너·삭제품목 경고·하단 액션 툴바·전표 복사·레드라인이 주문서에 전부 없고(grep 0 실측), 반대로 SalesSubNav·판매전표 전환 모달·보류/해제·참조 조회 모달·전표발행 상태 배지·데스크톱 헤더 합계는 주문서에만 있습니다. 레이아웃 계보 자체가 달라서(판매전표=DS Card+.detail-grid / 주문서=sales.module.css GAS 이식 셸+readOnly Input) 열만 맞춰도 외관 차이는 남습니다 — 주문서 파일에서 detail-grid/detail-label/detail-value/DS Card 사용은 실측 0건입니다. 조사 간 어긋남 3건(주문서 열 구성·CSS 열 개수·partnerOrderAuditApi 재사용 가능성)을 임의 채택하지 않고 실측으로 판정해 기록했습니다.


---

## 🚨 열 차이표 — 개발책임자가 지적한 핵심


| 열 | 판매전표 상세 | 주문서 상세 | 판정 |
|---|---|---|---|
| [읽기전용 라인 표] 1) 체크박스(전체 선택) | th.col-no width 28 aria-label='전체 선택' SlipDetailPage.tsx:4518-4534 / td aria-label=`${modelName} 재고조회 선택` :4563-4570 | th width 28 aria-label='전체 선택' SalesPartnerOrderDetailPage.tsx:1154-1174 / td aria-label=`${modelCode} 재고조회 선택` :1194-1211 | 동일 — 위치(1번)·폭(28)·용도(재고조회 다중선택) 전부 일치. td aria-label 이 참조하는 필드만 modelName ↔ modelCode |
| [읽기전용 라인 표] 2) #  (행 번호 선택 버튼) | th.col-no '#' :4535 / td 는 .slip-line-no-btn 버튼, 클릭 시 selectedLineId 토글 → 행 액션 툴바(행 추가/순서 수정/행 삭제) 노출 :4571-4581. CSS width 44px(global.css:867) | 없음 — 주문서 표에 행 번호 열 자체가 없고 행 선택 개념도 없음(:1152-1184 전수 확인) | 주문서에 없음 — 열 하나가 아니라 '행 선택 → 행 조작' 표면 전체가 없음 |
| [읽기전용 라인 표] 모델명 | 3번째 열. th.col-model :4536 / td RedlineCell(`lines[{i}].modelName`) :4582. line.modelName ?? '-'. CSS width 180px | 3번째 열이지만 품목명 **뒤**. th :1176 / td line.modelCode :1213. BE 는 line.getModelName() 을 modelCode 로 내림(PartnerOrderDetailResponse.java:179) | 순서 다름 — 판매전표는 모델명(3)→품목명(4), 주문서는 품목명(2)→모델명(3)으로 **상대 순서가 뒤집혀 있음**(양쪽 소스 실측). 부가로 API 필드명도 이름 다름(modelName ↔ modelCode) |
| [읽기전용 라인 표] 품목명 | 4번째 열. th.col-product :4537 / td RedlineCell(`lines[{i}].productName`) :4583. CSS 에 .col-product 폭 규칙 없음(잔여 폭 자동) | 2번째 열. th :1175 / td line.productName, styles.tdLeft 좌측 정렬 :1212. 주석 :1151 'v2 §정정 4/5 — 품명→품목명' | 순서 다름 — 위와 같은 축. 라벨은 양쪽 '품목명'으로 동일. 판매전표만 RedlineCell 래핑 |
| [읽기전용 라인 표] 규격 | 5번째 열. th.col-spec :4538 / td RedlineCell(`lines[{i}].specification`) :4584. CSS width 100px 가운데 정렬 | 없음 — PartnerOrderLine 엔티티에 컬럼 없음, partner-order-service 전체 grep 'specification' **0건**(실측) | 주문서에 없음 — UI 만으로 불가. 마이그레이션 + 엔티티 + DTO 전부 필요 |
| [읽기전용 라인 표] 수량 | 6번째 열. th.col-qty :4539 / td RedlineCell(quantity, l.quantity.toLocaleString()) :4585 — **천단위 구분 있음**. CSS width 70px 가운데 정렬 | 4번째 열. th :1177 / td {line.quantity} 원시값 :1214 — **천단위 구분 없음**(styles.numericCol 우측 정렬) | 동일 — 같은 열이 양쪽에 있으나 위치(6↔4)·숫자 포맷·정렬이 다름. 주문서 모바일 카드는 toLocaleString 을 쓰므로(:1330) 같은 화면 안에서도 데스크톱/모바일 포맷이 어긋남 |
| [읽기전용 라인 표] 단가(VAT포함) ↔ 납품가 | 7번째 열. th.col-price '단가(VAT포함)' :4540 / td slipLineAmounts(l).unitWithVat(resolveUnitPrices 기반, :231-248) :4586. CSS width 110px 우측 정렬. 헤더 문자열은 고정 상수 | 5번째 열. th '납품가' :1178 / td krw(line.deliveryPrice) :1215. BE 는 line.getPriceVat()(PartnerOrderDetailResponse.java:183) = VAT 포함 단가 | 이름 다름 — 값 축은 둘 다 'VAT 포함 단가'로 같고 라벨만 다름. 판매전표는 VAT 제외 unitPrice 도 별도 보유, 주문서는 VAT 포함 하나뿐(조사 3) |
| [읽기전용 라인 표] 공급가액 | 8번째 열. th.col-supply :4541 / td slipLineAmounts(l).supply :4587 (RedlineCell 미적용). CSS width 110px 우측 정렬 | 화면에 없음 — 단 BE 는 이미 내려줌(PartnerOrderDetailResponse.java:151 supplyAmount, FE 타입 sales.ts:473-477 보유) | 주문서에 없음 — 🔑 **UI 만으로 채울 수 있는 3열 중 하나**(BE·FE 타입 모두 준비됨) |
| [읽기전용 라인 표] 부가세 | 9번째 열. th.col-vat :4542 / td slipLineAmounts(l).vat :4588 (RedlineCell 미적용). width 110px 우측 정렬 | 화면에 없음 — BE 는 내려줌(PartnerOrderDetailResponse.java:152 vatAmount) | 주문서에 없음 — UI 만으로 가능 |
| [읽기전용 라인 표] 합계(VAT포함) ↔ 소계 | 10번째 열. th.col-total '합계(VAT포함)' :4543 / td RedlineCell(lineTotal, supply+vat) :4589. width 110px 우측 정렬 | 6번째 열. th '소계' :1179 / td krw(line.subtotal) :1216. BE 는 같은 값을 subtotal 과 lineTotal 두 이름으로 동시 노출(PartnerOrderLine.java:253-255) | 이름 다름 — 값 축(VAT 포함 라인 합계) 동일, 라벨만 다름 |
| [읽기전용 라인 표] 전환됨 | 없음 | 7번째 열. th :1180 / td converted>0 이면 배지, 아니면 '-' :1217-1223 (line.convertedQuantity) | 판매전표에 없음 — 부분전환 도메인(주문→전표) 고유 열. 판매전표에 대응 개념 없음 |
| [읽기전용 라인 표] 잔여 | 없음 | 8번째 열. th :1181 / td converted>0 일 때만 remaining, 아니면 '-' :1224-1226. 🚩 전환 이력이 없으면 잔여=수량인데도 '-' 로 표시됨(조사 2) | 판매전표에 없음 — 부분전환 도메인 고유 |
| [읽기전용 라인 표] 묶음 처리 | 없음 | 9번째 열. th :1182 / td bundleModeLabel(line.bundleMode), 없으면 '-' :1227-1233 | 판매전표에 없음 — 🚩 단 BE 가 PartnerOrderDetailResponse.java:191 에서 **null 하드코딩**(주석 :135 '저장 컬럼이 없어 null')이라 이 열은 데이터와 무관하게 **영구히 '-'**. 시드를 바꿔도 절대 안 뜸 |
| [읽기전용 라인 표] 구성품 펼침 | 없음 | 10번째 열. th :1183 / td expandedComponents 를 `{품목명} ({모델}) × {수량}` 로 나열, 빈 배열이면 '-' :1234-1242 | 판매전표에 없음 — 🚩 BE 가 :193 에서 **List.of() 하드코딩**(주석 :140)이라 **영구히 '-'** |
| [읽기전용 라인 표] 합계(소계) 행 — tfoot | 없음 — <tfoot> 0건(SlipDetailPage.tsx:4515-4595 전수). 데스크톱에 총액 표시 지점 자체가 없음 | 없음 — 표에는 없고 헤더 카드에 '합계 {totalAmount}원'(:1067) | 동일 — 양쪽 표 모두 합계 행이 없음. 총액을 어디서 보여주는지(판매전표=모바일 요약만 / 주문서=데스크톱 헤더)가 다름 |
| [수정 표면 라인 표] 판매전표 매출 인라인 폼 ↔ 주문서 정식 편집 모달 — 열 전수 | 9열: 품목 / 모델명 / 규격 / 수량 / {editUnitPriceColumnHeader} / 공급가액 / 부가세 / 합계(VAT포함) / (행 삭제) — SlipDetailPage.tsx:3139-3147. 매입 버전 :3465-3473 동일 | 6열: 품목명 / 모델명 / 구분 / 수량 / 납품가 / 비고 — SalesPartnerOrderDetailPage.tsx:1526-1531 | 순서 다름 — 앞 2열은 품목→모델로 **양쪽 같은 순서**(읽기 표와 반대로 판매전표 수정 폼도 품목이 먼저). 규격·공급가액·부가세·합계·행삭제는 주문서에 없고, 구분(categoryKey 4종)·비고(remark)는 판매전표에 없음 |
| [수정 표면] 구분(categoryKey) | 없음 | 수정 모달 3번째 열, DS Select 4옵션(홈멀티/싱글중대형/상업멀티/구형) :1528, :1569-1572. 유일하게 CollaborativeSlipInput 이 아니라 provider.setItemValue 직접 호출(:1565) | 판매전표에 없음 — 🚩 BE 는 읽기 응답에도 categoryKey 를 내려주는데(PartnerOrderDetailResponse.java:147) 읽기 상세 표에는 열이 없음 |
| [수정 표면] 비고(remark) | BE SlipLineResponse.java:32 note 는 존재하나 읽기·수정 표 어느 쪽에도 열 없음 | 수정 모달 6번째 열 :1531. 읽기 상세 표에는 없음(BE 는 :155 로 내려줌) | 판매전표에 없음 — 양쪽 모두 BE 에 필드가 있으나 화면 노출이 비대칭 |
| [전환 모달 라인 표] (주문서 전용) | 없음 | 6열: 품목명 / 모델명 / 주문수량 / 전환됨 / 잔여 / 전환수량 — :1773-1778. 상세 표와 달리 전환됨·잔여가 0 일 때도 '-' 가 아니라 숫자 | 판매전표에 없음 — 같은 화면 안에서 '전환됨/잔여' 표기 규칙이 상세 표(:1217-1226)와 전환 모달(:1799-1800)에서 서로 다름 |
| [모바일 라인 카드] 필드 전수 | 체크박스 / #{n} 선택 버튼 / 품목명 / 모델명(있을 때) / 수량 / 단가(VAT포함) / 합계(VAT포함)원 — SlipDetailPage.tsx:4614-4664 | 체크박스 / 품목명(+묶음 칩) / 모델명(있을 때) / 수량 / 납품가 / 소계원 / 하단 칩(전환됨 N개·잔여 N개·구성품 N개) — SalesPartnerOrderDetailPage.tsx:1291-1366 | 동일 — mobile-item-card/metrics/total-row 구조가 사실상 같음. 판매전표만 #{n} 번호 버튼, 주문서만 칩 3종. 라벨은 데스크톱과 같은 이름 차이(단가(VAT포함)↔납품가, 합계↔소계) |
| [열 폭·정렬 규칙] | .slip-line-table .col-no 44px / .col-model 180px / .col-spec 100px 가운데 / .col-qty 70px 가운데 / .col-price·.col-supply·.col-vat·.col-total 각 110px 우측 — global.css:867-881 (실측). .col-product 폭 규칙은 **없음** | sales.module.css .estTable(table-layout:fixed, GAS index.html:99 이식) + styles.tdLeft/numericCol. 열별 px 폭 지정 없음 | 이름 다름 — 폭·정렬을 잡는 수단 자체가 다름. ⚠️ 조사 4는 '.col-* = 전표 8열 전제'라고 적었으나 실측상 표는 10열이고 .col-* 클래스는 8종이며 .col-product 는 폭 규칙이 없음 — 조사 1 기술이 정확함 |

---

## 섹션 차이표


| 섹션 | 판매전표 상세 | 주문서 상세 | 판정 |
|---|---|---|---|
| 0. 로딩 / 조회 실패 / 빈 상태 | Spinner('불러오는 중') SlipDetailPage.tsx:2340-2346 · error-banner :2348-2357 · '조회할 권한' 문구일 때만 [목록으로 돌아가기] :2352-2356 | '주문번호가 지정되지 않았습니다'+목록 링크 :705-720 · '주문 상세를 불러오는 중…' :1010-1011 · '주문 조회에 실패했습니다' :1012-1016 | 동일 — 표면은 양쪽에 있고 문구·분기만 다름(판매전표만 권한 문구 분기) |
| 서브 내비게이션 (SalesSubNav) | 없음 — SlipDetailPage.tsx 에 SalesSubNav import 0건 | SalesPartnerOrderDetailPage.tsx:724 (견적서/주문서/승인/권한/DC설정/가격설정 + 외부웹 2링크) | 판매전표에 없음 — 주문서 전용 판매 서브트리 탭 |
| 헤더 — 문서번호 표시 | <SlipNumberDisplay slipDate seqNo size="lg"> → 'YYYY/MM/DD - {seq}' SlipDetailPage.tsx:3637 | 제목 '주문서 상세' + orderNumber 배지(styles.badge) SalesPartnerOrderDetailPage.tsx:728-729 | 이름 다름 — 같은 '문서번호' 축이나 컴포넌트·형식이 다름(SlipNumberDisplay 는 slipDate+seqNo 2필드 필요, 주문번호는 단일 문자열이라 그대로 못 씀 — 조사 4) |
| 헤더 — '수정 {N}회' 배지 | auditLogs 의 distinct revisionNo 개수 SlipDetailPage.tsx:3639-3655 (계산 :2674) | 없음 — 파일 내 대응 표시 0건. PartnerOrder.revisionCount(PartnerOrder.java:132)는 존재하나 web/ DTO grep 0건(실측) | 주문서에 없음 — BE DTO 미노출이라 UI 만으로는 불가(단 revisions API 로 우회 가능, 아래 미해결 질문 참조) |
| 헤더 — PresenceIndicator(동시 접속자) | 헤더 바 안 SlipDetailPage.tsx:3656 (usePresence :1615) | 협업 패널 내부 PartnerOrderCollaborationPanel.tsx:299-301 | 동일 — 양쪽 존재, 배치 위치만 다름 |
| 헤더 — '마감 잠금' 배지 | slip.lockFlag===true 일 때 Badge(danger) SlipDetailPage.tsx:3657-3661 | 없음 — partner-order-service grep 'lockFlag' 0건(실측) | 주문서에 없음 — DB 컬럼 자체 부재 |
| 헤더 우측 액션 바 (데스크톱) | 거래명세서/계산서/판매전표 출력 3종 + 매입 인쇄 + 직접 수정 + 협업 수정 + 전표 삭제(매입/매출) + 목록으로 SlipDetailPage.tsx:3663-3791. 인쇄는 라우트 이동(/sales/:id/print/*) | 인쇄 + 수정(협업) + 정식 편집 + 보류 + 보류 해제 + 판매전표 전환 + 삭제 + ← 목록 SalesPartnerOrderDetailPage.tsx:726-814. 인쇄는 GET /api/v1/partner-orders/{id}/print blob 다운로드(:521-527) | 동일 — 컨테이너 .detail-action-bar 는 9개 상세 화면 공통(조사 4). 버튼 구성과 인쇄 방식(라우트 이동 ↔ blob)은 다름 |
| 모바일 요약 카드 | mobile-summary-card — 전표번호/상태배지/거래처명/합계금액/전표일자 SlipDetailPage.tsx:3796-3816 | mobile-summary-card — 주문번호/상태배지/전표발행상태 배지/거래처명/합계/납기 SalesPartnerOrderDetailPage.tsx:842-888 | 동일 — 같은 mobile-summary-card 클래스 계열(조사 4: 모바일은 이미 통일) |
| 모바일 액션 바 + 더보기 시트 | MobileActionSheet SlipDetailPage.tsx:3818-3997 (인쇄/직접수정/협업수정/삭제/반려/취소/복사/목록) | MobileActionSheet SalesPartnerOrderDetailPage.tsx:890-1006 (수정/정식편집/보류/해제/전환/삭제/목록) | 동일 — 같은 컴포넌트, 항목만 도메인별로 다름 |
| 진행 단계 ProgressBar | <ProgressBar currentStatus branchReason> SlipDetailPage.tsx:4005-4007, 6단계(ProgressBar.tsx:57-62) | 없음 — SalesPartnerOrderDetailPage.tsx 에서 'ProgressBar' grep 0건(실측) | 주문서에 없음 — ProgressBar 는 currentStatus:SlipStatus + 6단계 하드코딩이라 그대로 이식 불가(조사 4) |
| SSE 결정 토스트 (수정/삭제 요청 수락·거절) | SlipDetailPage.tsx:4012-4056 | 없음 — 대신 전환 성공 토스트(:830-838, 4초 자동 소멸)가 별개로 존재 | 주문서에 없음 — 수정/삭제 승인 요청 도메인 자체가 없음 |
| 삭제 요청 배너 ('창고 인계 후 — 삭제 요청') | isApprovalRequired && canRequestDelete SlipDetailPage.tsx:4065-4135 + SlipEditRequestDialog :5005-5030 | 없음 — SlipEditRequestDialog 사용 0건 | 주문서에 없음 — 승인 요청 워크플로 미보유 |
| 잠금 안내 배너 | isLocked(lockFlag // 물리 종결) SlipDetailPage.tsx:4138-4148 | 없음 — '잠금' 문자열 유일 매치는 :485 주석(provider 로드 실패 관련) | 주문서에 없음 |
| 삭제 품목 경고 배너 | deletedProductWarningIds>0 SlipDetailPage.tsx:4150-4154 (lookupProductPresence :1599-1603) | 없음 — product presence 조회 자체를 하지 않음(조사 3) | 주문서에 없음 |
| 기본 정보 카드 (거래처/일자/배송태그/배송일정/메모/배송지) | DS Card + .detail-grid + .detail-label/.detail-value 텍스트 SlipDetailPage.tsx:4156-4227. RedlineCell 6필드 적용 | styles.card + styles.formGrid, 값은 readOnly <Input> SalesPartnerOrderDetailPage.tsx:1048-1103 — 거래처코드/연결전표/배송지/현장/연락처/납기/요청사항 | 이름 다름 — 대응 카드는 있으나 항목·구현 계보가 다름. 주문서에 detail-grid/detail-label/detail-value/DS Card 사용 0건(실측). 판매전표의 일자·배송태그·배송일정은 주문서에 없고, 주문서의 연결전표·현장은 판매전표에 없음 |
| 배송 · 정산 정보 (V20) 카드 | 배송주소/감리주소/프로젝트명/인수자번호/입금예정일/사업자번호/인쇄여부/검수상태 SlipDetailPage.tsx:4234-4293 | 없음 — 배송주소만 거래처 카드로 흡수(:1080). 감리주소·프로젝트명·인수자번호·입금예정일은 partner-order-service grep 각 0건(실측) | 주문서에 없음 — 8항목 중 7항목이 DB 컬럼 부재. 사업자번호(bizCode)만 BE 가 이미 내려주고 화면이 안 씀 |
| 기사 정보 (배송) 카드 + 인라인 편집 | isOutbound 전용, 읽기/편집 모드 + PATCH /slips/{id}/driver SlipDetailPage.tsx:4300-4410 | 없음 — partner-order-service grep 'driverName' 0건(실측) | 주문서에 없음 — 마이그레이션 필요 |
| 라인 툴바 (선택/재고조회/행 조작) | [선택 품목 재고조회(N)] [선택 해제] :4432-4455 + 행 번호 클릭 시 [행 추가][순서 수정][행 삭제][선택 해제] :4462-4498 + 힌트 :4500-4502 | '라인 (N건)' :1107-1109 + [선택 품목 재고조회] :1112-1126 + [참조 조회] :1127-1136 + [선택 해제] :1137-1145 (별도 구현) | 동일 — 재고조회/선택해제는 양쪽 존재하나 별도 구현(조사 4: 공통화 후보). 행 선택 액션 툴바(추가/순서/삭제)는 주문서에 없고, [참조 조회]와 라인 건수 표시는 판매전표에 없음 |
| 라인 표 (읽기전용, 데스크톱) | raw <table className="slip-line-table"> SlipDetailPage.tsx:4513-4596, 10열, tfoot 없음, 빈 상태 colSpan=10 '라인이 없습니다.' | raw <table className={styles.estTable}> SalesPartnerOrderDetailPage.tsx:1148-1248, 10열, tfoot 없음, 빈 상태 처리 없음(빈 tbody) | 이름 다름 — 양쪽 다 존재하나 열 구성이 다르고(아래 columnDiffs 전수) CSS 계보가 다름(.slip-line-table global.css:826 ↔ sales.module.css estTable, GAS 이식본). 양쪽 다 DS DataTable 미사용 |
| 라인 모바일 카드 리스트 | 체크박스 + #{n} 선택 버튼 + 품목명 + 모델명 + 수량 + 단가(VAT포함) + 합계(VAT포함)원 SlipDetailPage.tsx:4598-4669 | 체크박스 + 품목명(+묶음 칩) + 모델명 + 수량 + 납품가 + 소계원 + 칩(전환됨/잔여/구성품) SalesPartnerOrderDetailPage.tsx:1280-1370 | 동일 — 같은 mobile-item-card/metrics/total-row 구조. 판매전표에만 #{n} 번호 버튼, 주문서에만 하단 칩 3종 |
| 재고조회 모달 (InventoryLookupModal) | SlipDetailPage.tsx:4674-4678 | SalesPartnerOrderDetailPage.tsx:1832-1838 (BUNDLE 제외 로직 :635-646 추가) | 동일 — 같은 컴포넌트 |
| 참조 조회 모달 (자재단가/추천실외기/분지관) | 없음 | LineLookupReferenceModal SalesPartnerOrderDetailPage.tsx:1839-1842 | 판매전표에 없음 |
| 결재 정보 카드 (출고자/검수자/담당부서/담당자) | SlipDetailPage.tsx:4684-4712 | 없음 — '결재' grep 0건(실측) | 주문서에 없음 — dispatcher/inspector 컬럼 자체 부재. ⚠️ 판매전표의 '담당부서'는 BE 전체 grep 'ownerDepartment' 0건이라 항상 '-'(실측 — 조사 3 확인) |
| 전자서명 정보 카드 + 서명 무효화 모달 | SlipDetailPage.tsx:4720-4793 / 무효화 모달 :4799-4855 | 없음 — 'SignatureViewer'/'전자서명' grep 0건(실측) | 주문서에 없음 — 🚩 단 판매전표 쪽도 SlipDetailResponse.java 에 signature 컴포넌트 0건(실측)이라 GET /slips/{id} 만으로는 이 카드가 채워지지 않음(조사 3). 이식 시 양쪽 BE 작업 필요 |
| 반려 사유 카드 | possibleActions.includes('reject') 일 때 SlipDetailPage.tsx:4860-4891 | 없음 — '반려' grep 0건(실측) | 주문서에 없음 — 상태 전이 도메인 자체가 다름(PartnerOrderStatus 6종) |
| 코멘트 패널 | SlipCollaborationPanel SlipDetailPage.tsx:4893-4925 — 연결 필드 11종(SlipCollaborationPanel.tsx:42-54) | PartnerOrderCollaborationPanel :1380/:1395 — 연결 필드 3종(전체/요청사항/납기/N번 라인 비고, Panel:405-423) | 동일 — 양쪽 존재. 연결 필드 수(11 ↔ 3)와 협업 수정 가능 필드가 다름 |
| 버전 이력 패널 | SlipVersionHistoryPanel (SlipCollaborationPanel.tsx:517 에서 마운트, 패널 :268-282/:331-460) | PartnerOrderVersionHistoryPanel (PartnerOrderCollaborationPanel.tsx:599 에서 마운트, 패널 :236-488) — 복원 버튼·복원 가드·복원 확인 모달 포함 | 동일 — 양쪽 존재(실측). 주문서 쪽이 복원 UI 를 더 갖고 있음 |
| 하단 액션 툴바 (데스크톱) | .slip-detail-footer-actions — [전표 복사][전표 취소][협업 수정][완료(다음단계)] SlipDetailPage.tsx:4930-4988 | 없음 — 액션이 전부 상단 헤더 바에 모여 있음 | 주문서에 없음 — [전표 복사](duplicate grep 0건)·상태 전이 버튼 미보유 |
| 오류/안내 배너 | errorMessage + editSurfaceNotice SlipDetailPage.tsx:4990-4999 | 인쇄/보류/전환 오류 배너 3종 + 전환 성공 토스트 SalesPartnerOrderDetailPage.tsx:815-838 | 동일 — 양쪽 존재, 배너 종류가 도메인별로 다름 |
| 삭제 확인 모달 | 매입 :5037-5134 / 매출 :5142-5281 2종. 422·409·권한 배너 + [최신 내용 불러오기] | 주문서 삭제 확인 1종 :1619-1659. 422 '확정 또는 전표 발행된 주문서는 삭제할 수 없습니다.' | 동일 — 양쪽 존재, 판매전표는 매입/매출 2종 |
| 수정 표면 (직접 수정 / 정식 편집) | 모달이 아니라 라인 표 자리에 인라인 폼 렌더 SlipDetailPage.tsx:2960-3302(매출)/:3305-3621(매입) | Modal size=xl SalesPartnerOrderDetailPage.tsx:1411-1618 | 이름 다름 — 양쪽 수정 표면은 있으나 렌더 방식(인라인 ↔ 모달)과 열 구성이 다름(columnDiffs 참조) |
| 판매전표 전환 모달 | 없음 | size=lg, 비가역 경고 + 출고 창고 선택(required) + 전환수량 입력 표 SalesPartnerOrderDetailPage.tsx:1661-1827 | 판매전표에 없음 |
| 보류 / 보류 해제 | 없음 | 헤더 버튼 :763-784 + POST /hold, /release | 판매전표에 없음 |
| 전표발행 상태 배지 (slipPublishStatus) | 없음 | PENDING_RETRY/FAILED_PERMANENT 한정 배지 :854-862(모바일)/:1056-1064(데스크톱) + FAILED_PERMANENT 안내 캡션 | 판매전표에 없음 |
| 헤더 합계 금액 (데스크톱) | 없음 — 데스크톱에 총액 표시 지점이 없음. tfoot 0건·'총액' grep 0건(실측). 모바일 요약 카드의 mobileSlipTotal(:2676, 표시 :3810-3813) 하나뿐 | '합계 {krw(totalAmount)}원' SalesPartnerOrderDetailPage.tsx:1067 (BE totalAmount) | 판매전표에 없음 — 🚩 두 화면의 구조적 비대칭(조사 3). 판매전표는 라인 합계만, 주문서는 헤더 총액만 |
| 레드라인 (변경 전/후 겹쳐보기) | RedlineCell 12곳 + GET /api/v1/slips/{id}/redline SlipDetailPage.tsx:1625-1651 | 없음 — 'RedlineCell' grep 0건(FE), partner-order-service 'redline' grep 0건(BE, 실측) | 주문서에 없음 — 유일하게 BE 엔드포인트 자체가 없어 신규 개발 필요 |
| AuditOverlay (메모/배송지 필드 이력 오버레이) | SlipDetailPage.tsx:4194-4225 (memo, shippingAddress) | 없음 — 'AuditOverlay' grep 0건(실측) | 주문서에 없음 — 컴포넌트 자체는 도메인 무관이라 재사용 가능(조사 4) |
| 레이아웃 계보 (카드/라벨-값) | DS Card(padding4/shadow sm) + .detail-grid(global.css:515) + .detail-label/.detail-value 텍스트 | styles.card(sales.module.css:156, GAS 종합견적서 index.html 이식) + styles.formGrid + 값이 readOnly <Input>(:1073,1077,1081,1085,1089,1093,1099) | 이름 다름 — 🚩 시각적 차이의 1차 요인(조사 4). 주문서 파일에서 detail-grid/detail-label/detail-value/DS Card 사용 실측 0건. sales.module.css:7 은 'DS 컴포넌트 import 금지'를 명문화했으나 이미 Badge/Button/Input/Modal 은 쓰고 있어 결정문과 코드가 어긋남(조사 2) |

---

## BE 변경이 필요한 것

- 【영구 '-' — 열/필드가 화면에 있는데 BE 가 리터럴 null 을 넣음 (시드와 무관, 마이그레이션 필요)】 묶음 처리 bundleMode — PartnerOrderDetailResponse.java:191 null 하드코딩(주석 :135 '저장 컬럼 없음') → 라인 표 9번 열이 항상 '-'(:1228-1232)
- 【영구 '-'】 구성품 펼침 expandedComponents — PartnerOrderDetailResponse.java:193 List.of() 하드코딩(주석 :140) → 라인 표 10번 열이 항상 '-'(:1234-1241)
- 【영구 '-'】 현장 siteAddress — PartnerOrderDetailResponse.java:86 null 하드코딩, PartnerOrder 엔티티·V1__init_partner_order.sql 에 컬럼 없음 → 데스크톱 :1085 / 모바일 :1028 항상 '-'
- 【영구 '-'】 연락처 contactPhone — PartnerOrderDetailResponse.java:87 null 하드코딩, 컬럼 없음 → :1089 / :1029 항상 '-'
- 【BE DTO 만 고치면 됨 — 마이그레이션 불필요】 거래처명 partnerName — PartnerOrderDetailResponse.java:78 null 고정. PartnerOrder.partnerId(:53-55)가 있어 partner-service lookup 으로 채울 수 있음. 현재는 FE 가 partnerName ?? partnerCode 로 폴백(:1052, :877). legacy 주문(partnerId=null)은 여전히 null — 비율 미측정
- 【BE DTO 만】 작성일 createdAt — 목록 DTO 에는 있으나(PartnerOrderSummaryResponse.java:18, :61) 상세 DTO 에 컴포넌트 자체가 없음. FE 는 PartnerOrderSummary 를 상속해 raw.createdAt 을 매핑하므로(sales.ts:649) 상세에서 항상 null. 레거시 '주문일자'(order-app/index.html:8922) 대응 항목이라 미계승 3건 중 하나
- 【BE DTO 만】 수정 횟수 revisionCount — PartnerOrder.java:132 에 존재하고 서비스에서 증분(:527)하지만 web/ 하위 DTO grep **0건**(실측). 판매전표의 '수정 {N}회' 배지(SlipDetailPage.tsx:3639-3655)를 이식하려면 DTO 노출이나 revisions API 카운트 중 하나가 필요
- 【BE DTO 만】 낙관적 잠금 버전 lockVersion — PartnerOrder.java:114-115 존재, DTO 미노출(판매전표는 SlipDetailResponse.java:95 로 노출)
- 【마이그레이션 필수 — partner-order-service 전체 grep 0건 실측】 규격 specification(0) · 배송태그 deliveryTag(0) · 마감잠금 lockFlag(0) · 인쇄여부 printedAt(0) · 감리주소 supervisionAddress(0) · 프로젝트명 projectName(0) · 인수자 번호 recipientPhone(0) · 입금예정일 paymentDueDate(0) · 기사 driverName(0) · 검수 inspectionStatus(0)
- 【마이그레이션 필수 — 조사 3 열거, 위 grep 계열과 동일 근거】 하차일 unloadDate · 배송일정 라벨 deliveryScheduleLabel · 배송지 shippingAddress(deliveryAddress 와 별개 축) · 검수지 inspectionAddress · 수령자 연락처 receiverPhone · 거래처 snapshot 3종(customerTel/customerAddress/customerRepresentative) · 결제만기 라벨 paymentDueLabel · 할인정보 discountInfo · 회수조건 collectTerm · 약정조건 agreeTerm · 창고 3종(sourceWarehouseId/destinationWarehouseId/destinationWarehouseName) · 결재 8종(dispatcher/inspector/acceptedBy/owner 계열)
- 【BE 자체가 없음 — 신규 엔드포인트 필요】 레드라인 — partner-order-service 전체 grep 'redline' **0건**(실측). getRedline 은 /api/v1/slips/{id}/redline 하드코딩(slipRedline.ts:27)이라 판매전표 상세의 셀 인라인 변경 전/후 표시(SlipDetailPage.tsx:1631-1651, 적용 12곳)는 주문서로 이식 불가
- 【양쪽 BE 작업 필요】 전자서명 7필드 — SlipDetailResponse.java 에 signature/signerName 컴포넌트 **0건**(실측; dispatcherSignedAt/inspectorSignedAt 뿐). 판매전표의 '전자서명 정보' 카드(SlipDetailPage.tsx:4720-4791)조차 GET /slips/{id} 만으로는 채워지지 않는 구조. 주문서로 이식하려면 slip 쪽 DTO 보강 + partner-order 마이그레이션 둘 다 필요
- 【판매전표 쪽 사문 필드 — 이식 시 함께 정리 대상】 담당부서 ownerDepartment — services/ 전체 grep **0건**(실측)인데 FE 타입(slip.ts:150)·화면(:4704-4705)에 존재해 항상 '-'
- 【반대 목록 — BE 차단이 아니고 UI 만으로 되는 것 6종】 ①공급가액 supplyAmount(PartnerOrderDetailResponse.java:151) ②부가세 vatAmount(:152) ③VAT 포함 합계 lineTotal(:153) ④사업자번호 bizCode(:26, 현재 PUT 본문 전용 :1432) ⑤금액 권위 authority(:154) ⑥품목 유형 productType(:158, 현재 BUNDLE 제외 판정에만 사용). 삭제 상태 isDeleted/deletedAt/deletedByName(:40-42)도 응답에 있으나 상세 화면 미표시

## 🚩 개발책임자 확인이 필요한 것

- 🚨 **열 순서를 어느 쪽으로 통일합니까** — 판매전표는 모델명(:4536)→품목명(:4537), 주문서는 품목명(:1175)→모델명(:1176)으로 뒤집혀 있습니다. 판매전표 자신도 읽기 표(모델→품목)와 수정 인라인 폼(:3139-3140 품목→모델)이 서로 반대라 '판매전표에 맞춘다'만으로는 답이 정해지지 않습니다.
- 🚨 **주문서 전용 4열(전환됨·잔여·묶음 처리·구성품 펼침)을 유지합니까 버립니까** — 전환됨/잔여는 부분전환 도메인 고유라 계승 대상이 아니지만, 묶음 처리·구성품 펼침은 BE 가 리터럴 null/빈배열을 넣어(PartnerOrderDetailResponse.java:191, :193) **어떤 데이터로도 값이 안 뜹니다**. ①열을 지운다 ②마이그레이션으로 값을 채운다 ③둘 다 아님(현상 유지) 중 결정이 필요합니다.
- **총액 축을 어느 쪽에 맞춥니까** — 판매전표 데스크톱에는 총액이 아예 없고(tfoot 0건, 모바일 요약 mobileSlipTotal 만), 주문서는 데스크톱 헤더에 합계가 있습니다(:1067). 두 화면을 '같은 항목'으로 맞추려면 이 축을 먼저 정해야 하며, 양방향 모두 마이그레이션은 불필요합니다.
- **라인 표 구현 표준을 무엇으로 잡습니까** — 조사 4 실측상 DS DataTable 은 상세 화면 9개 중 7개가 쓰는 표준이고, raw <table> 을 쓰는 건 판매전표·주문서 둘뿐입니다. '주문서를 판매전표처럼' 이 곧 'DataTable 표준에서 더 멀어짐' 이 됩니다. 참조 구현으로 TransferDetailPage.tsx:363-390(Card→detail-grid→DataTable)이 제안돼 있습니다.
- **작업 범위가 주문서 상세 하나입니까 판매 서브트리 전체입니까** — sales.module.css(GAS 종합견적서 index.html 이식본)를 import 하는 파일이 7개입니다(SalesPartnerOrderDetailPage :40 · SalesPartnerOrderListPage :38 · EstimateListPage :40 · EstimatePricingConfigPage :25 · SalesOrderApprovalsPage :35 · SalesPartnerDcConfigPage :36 · SalesSubNav :18). 주문서만 고치면 같은 탭 안에서 두 계보가 섞입니다.
- 🚨 **'수정 N회' 이력 표시 이식이 기존 결정과 충돌합니다 — 실측으로 확인한 사항입니다.** 조사 4는 partnerOrderAuditApi(createAuditApi.ts:113)를 재사용하면 즉시 얻는다고 제안했으나, 계약 테스트 sp-08-4-2-partner-order-edit-put.spec.ts:71-72 가 `expect(page).not.toContain('partner-order-edit-audit-timeline')` · `expect(page).not.toContain('partnerOrderAuditApi')` 를 **단언**하고 있고 주석(:62-64)에 *'#31 이력 일원화(2026-07-06) — PO 상세 인라인 수정 이력은 제거되고 PartnerOrderVersionHistoryPanel(revisions API)로 일원화됐다'* 고 적혀 있습니다. 되살리면 CI red 입니다. revisions API 로 카운트를 세는 방향이 맞습니까, 아니면 #31 결정을 뒤집습니까?
- **금액 권위 도메인 충돌을 어떻게 매핑합니까** — 판매전표 unitPriceDomain 은 VAT_INCLUSIVE|SUPPLY 2종(UnitPriceDomain.java:33,40), 주문서 authority 는 PRICE|SUPPLY|VAT|TOTAL 4종(PartnerOrderLine.java:111-116)으로 공통값이 SUPPLY 뿐입니다. 표시 계층을 공유하려면 별도 매핑 규칙이 필요하고 단순 rename 으로는 안 됩니다.
- **레거시 미계승 3건을 이번에 채웁니까** — 조사 5 실측: ①결제예정(입금예정일, order-app/index.html:8922·입력폼 :1183 payDue) ②인수자(:8940 d.receiver·입력폼 '인수자번호' :1161) ③주문일자(:8922). 셋 다 데스크톱 상세에 없고 ①②는 DB 컬럼도 없습니다. 더 근본적으로 조사 5는 **레거시 전송 경로가 값을 아예 안 보낸다**고 보고했습니다(samhanApi.ts:381 이 `{ lines }` 만 전송, ConfirmRequest.java:15-17 이 lines+deliveryAddress 만 수신) — 컬럼을 만들어도 채워질 경로가 없습니다. 이것이 이번 범위입니까?
- **수량 천단위 구분을 통일합니까** — 주문서 데스크톱 표만 원시값(:1214)이고, 같은 화면의 모바일 카드(:1330)와 판매전표(:4585)는 toLocaleString 입니다.
- **읽기 상세에 구분(categoryKey)·비고(remark)를 노출합니까** — BE 는 읽기 응답으로 내려주는데(PartnerOrderDetailResponse.java:147, :155) 주문서 읽기 표에는 열이 없고 수정 모달에만 있습니다(:1528, :1531). 판매전표도 note(SlipLineResponse.java:32)를 어느 표에도 안 씁니다.
- ⚠️ **조사 간 어긋남 3건 — 임의 채택하지 않고 실측으로 판정했습니다.** ①주문서 라인 표 열 구성: 조사 4는 '모델/품목/수량/납품가/소계/전환수량/잔여/묶음' 8열·모델 먼저로 적었으나 실측은 **품목명(:1175)→모델명(:1176) 순서의 10열**(체크박스·구성품 펼침 포함) — 조사 2가 정확합니다. ②CSS: 조사 4의 '.slip-line-table 컬럼 폭 = 전표 8열 전제'는 실측상 표가 10열이고 .col-* 는 8종이며 .col-product 폭 규칙은 없음(global.css:867-881) — 조사 1이 정확합니다. ③partnerOrderAuditApi 재사용 가능성: 조사 4는 '새 BE 작업 불필요할 가능성 높음(BE 확인 필요)', 조사 3은 'BE 엔드포인트 존재'로 서로 보완되지만, **어느 조사도 FE 재도입을 금지하는 계약 테스트를 보지 못했습니다**(위 항목 참조). 또 조사 3이 적은 컨트롤러 경로는 web/ 직하가 아니라 audit/web/·revision/web/ 하위입니다(파일명·줄 번호는 정확).
- ⚠️ **문서-코드 불일치 정정 여부** — 조사 4가 docs/qa/mobile-s4c-detail-responsive/README.md:14 의 *'주문서 상세 | .detail-grid'* 기술이 현 코드와 반대라고 보고했고, 저도 SalesPartnerOrderDetailPage.tsx 에서 detail-grid/detail-label/detail-value/DS Card 사용이 **0건**임을 재확인했습니다. 그 QA 문서를 근거로 삼은 후속 작업이 있다면 함께 정정해야 합니다.

---

## 적대검증


### 차이 표가 빠뜨린 것 — 두 상세 화면(SlipDetailPage.tsx / SalesPartnerOrderDetailPage.tsx)을 워크트리 wmain(HEAD 1a5250b8f)에서 직접 열어 ①최상위 섹션 전수 카운트 ②표(thead/tbody) 셀 전수 카운트 ③조건부(권한·상태·모바일) 게이트 ④표가 인용한 수치의 재현 대조를 수행

**판정** — 빠진 것 있음 — 최상위 섹션 층위는 완전(판매전표 24/24, 주문서 14/14 대응 확인)이나, 하위·조건부·열 층위에서 8계열이 누락됐고 인용 수치 2건이 실측과 다릅니다. 가장 무거운 것은 ①판매전표 수정 인라인 표가 실제로는 thead 9 / tbody 10 으로 어긋나 있는데(td-right 포맷 합계 셀 :3277·:3601) 표가 '9열'로 적어 헤더 없는 열을 통째로 놓친 점, ②수정 표면의 헤더 필드 축(10 ↔ 9 ↔ 3)이 표에 아예 없는 점, ③주문서 모바일 기본정보 MobileCollapsible(:1019-1046)과 라인 모바일 액션 바(:1249-1279)가 빠진 채 모바일을 '동일'로 판정한 점, ④'빈 값'이 판매전표에서는 모바일에서 행째로 숨겨지고(global.css:626-628) 주문서에서는 '-'로 남는 비대칭입니다. 열 순서·총액 축 결정 전에 최소한 ①②는 표에 반영해야 하며, ⑤RedlineCell 12곳→실측 18곳·기본정보 6필드→실측 5필드는 정정이 필요합니다.

- 【최상위 섹션은 누락 없음 — 내가 센 개수】 SlipDetailPage.tsx 메인 return(:3624-5282)의 최상위 JSX 자식을 직접 세어 **24개**였습니다(:3626 헤더 / :3794 모바일블록 / :4005 ProgressBar / :4012 결정토스트 / :4065 삭제요청배너 / :4138 잠금배너 / :4150 삭제품목경고 / :4156 기본정보Card / :4234 배송·정산Card / :4300 기사정보 / :4415 라인툴바블록 / :4507 라인표|인라인수정 / :4674 재고조회모달 / :4684 결재정보 / :4720 전자서명 / :4799 서명무효화모달 / :4860 반려사유 / :4893 코멘트패널 / :4930 하단액션툴바 / :4990 오류배너 / :4995 editSurfaceNotice / :5005 SlipEditRequestDialog / :5037 매입삭제모달 / :5142 매출삭제모달). 24개 전부 표의 sectionDiffs 에 대응 항목이 있습니다. SalesPartnerOrderDetailPage.tsx 최상위도 **14개**(:724 SubNav / :726 top / :815·:820·:825·:830 배너4 / :840 모바일블록 / :1010 본문 / :1411 수정모달 / :1619 삭제모달 / :1661 전환모달 / :1832 재고조회모달 / :1839 참조조회모달)로 전부 커버됩니다. ⇒ **누락은 최상위가 아니라 하위·조건부·열 층위에 있습니다.**
- 【열 누락 — 확정적】 판매전표 **수정 인라인 표는 9열이 아니라 thead 9 / tbody 10 으로 어긋나 있습니다.** 매출: thead 9개(SlipDetailPage.tsx:3139-3147 품목/모델명/규격/수량/{editUnitPriceColumnHeader}/공급가액/부가세/합계(VAT포함)/빈 th aria-label='행 삭제') ↔ tbody 10개(:3161, :3171, :3181, :3191, :3204, :3233, :3246, :3262, **:3277 `<td className="td-right">{lineTotalWithVat}원</td>`**, :3280 × 버튼). 매입도 동일 구조(thead :3465-3473 9개 ↔ tbody :3487·3497·3507·3517·3530·3557·3570·3586·**3601 td-right**·3604 = 10개). 표는 두 폼 모두 '9열'로 적고 9개만 열거했습니다. 실제로는 **헤더 없는 10번째 셀(포맷된 합계 금액)**이 있고, 그 결과 9번째 헤더('행 삭제' 빈 th)가 포맷 합계 셀 위에 오고 × 버튼 열에는 헤더가 아예 없습니다.
- 【축 하나가 통째로 빠짐 — 수정 표면의 헤더 필드】 표의 '수정 표면' 항목은 라인 열만 비교하고 **수정 폼의 헤더 입력 필드를 한 개도 열거하지 않았습니다.** 실측: 판매전표 매출 인라인 폼 10필드(SlipDetailPage.tsx:3038 판매번호 / :3051 거래처=PartnerAutocomplete / :3063 거래처코드 / :3067 사업자번호 / :3071 배송주소 / :3081 감리주소 / :3091 프로젝트명 / :3101 인수자 번호 / :3111 입금예정일 / :3124 적요), 매입 인라인 폼 9필드(:3382 구매번호 / :3387 거래처 / :3399 거래처코드 / :3403 사업자번호 / :3407 배송주소 / :3417 프로젝트명 / :3427 인수자 번호 / :3437 입금예정일 / :3450 적요 — **감리주소가 매출에만 있는 매출/매입 비대칭**), 주문서 수정 모달 3필드(SalesPartnerOrderDetailPage.tsx:1488 거래처 코드 / :1499 납기 / :1511 요청사항). 10·9 ↔ 3 의 차이는 표의 어느 행에도 없습니다.
- 【판매전표 수정 표면에만 있는 조건부 표시물 6종이 전부 누락】 ①최근단가 재적용 배너 `price-memory-refresh-banner`(SlipDetailPage.tsx:3025-3034 매출, :3369-3378 매입 — 주문서 파일에서 '최근단가'·'priceRefresh' grep **0건**) ②재조회 변경 행 강조 `price-memory-refreshed-row`(:3159, :3485 + CSS global.css:124-130) ③단가 출처 note `price-source-note`(:3226-3230) + `EditPriceChangeIndicator`(:3231) ④부가세 `⚠ 10%와 다름` 경고(:3258-3260) ⑤세트 구성품 행의 공급가액·부가세 readOnly(:3242, :3255, :3566, :3579) ⑥전이 충돌 stale 배너 `sales-slip-edit-stale-banner`(:2996-3000). 반대로 주문서 수정 모달에만 있는 '협업 연결 중…' 표시(SalesPartnerOrderDetailPage.tsx:1481-1485)도 표에 없습니다.
- 【주문서 전용 섹션 2개 누락】 ①**모바일 기본정보 = MobileCollapsible '주문 상세 정보'**(SalesPartnerOrderDetailPage.tsx:1019-1046) — `mobile-field-row/mobile-field-label/mobile-field-value` 마크업으로 7항목을 항상 렌더하고, 데스크톱 카드는 `!isMobile` 게이트(:1048, :1103)입니다. 표의 '기본 정보 카드' 행은 :1048-1103 만 인용하고 이 모바일 표면을 언급하지 않습니다. ②**라인 카드 전용 모바일 액션 바**(:1249-1279 `mobile-action-bar` role=toolbar aria-label='주문 라인 액션' — 재고조회/해제/참조 3버튼). 표의 '모바일 액션 바 + 더보기 시트' 행은 페이지 레벨의 :890-1006 만 다룹니다. 판매전표에는 라인 레벨 모바일 액션 바가 없고, 대신 데스크톱용 Button 툴바(:4423-4456)와 선택 라인 툴바(:4462-4498)·힌트(:4500-4502)가 **모바일에서도 그대로 노출**됩니다(`detail-mobile-hide` 없음, CSS `.slip-line-toolbar` global.css:1446·`.slip-line-hint` :1462 는 미디어쿼리 밖).
- 【'동일' 판정이 틀린 곳 — 빈 값 처리】 같은 '빈 값'이 한쪽은 사라지고 한쪽은 남습니다. 판매전표는 `DetailGridItem`(SlipDetailPage.tsx:200-217)이 `isEmptyDetailValue`(:193-198, null/''/'-'/'—')일 때 `detail-grid-item-empty` 를 붙이고 CSS 가 모바일에서 `display:none !important`(global.css:626-628) 로 **행을 통째로 숨깁니다**(배송·정산 카드 7항목 :4239-:4275 전부 해당). 주문서는 같은 상황에서 `emptyLabel(value)`(:1033)로 '-' 를 회색 표시할 뿐입니다(`.mobile-field-value-empty` global.css:1400-1402). 표는 이 축을 다루지 않고 두 화면 모바일을 '동일'로 판정했습니다.
- 【조건부 게이트 축이 표 전체에 거의 없음 — 질문 2번 항목】 표의 sectionDiffs 는 대부분 존재/부재만 적고 **무엇이 있어야 보이는지**를 적지 않았습니다. 실측 게이트: 주문서 헤더 버튼 6종이 각각 다름 — 인쇄=`canPrint`(:733) / 수정=`canCollabEdit && !collabEditMode`(:743) / 정식 편집=`canCollabEdit`(:753) / 보류=`canEdit && status==='DRAFT'`(:763) / 보류 해제=`canEdit && status==='ON_HOLD'`(:774) / 판매전표 전환=`canConvert && linkedSlipNo==null && CONVERTIBLE_STATUS.has(status)`(:785-788) / 삭제=`canDelete`(:799). **[참조 조회]는 `canViewProductLookups` 권한 게이트**(:1127 데스크톱, :1269 모바일)인데 표의 '참조 조회 모달' 행에는 조건이 없습니다. 요청사항 필드는 `query.data.memo` 가 있을 때만 렌더돼 데스크톱 카드가 6칸/7칸으로 가변(:1095-1100)입니다. 판매전표 쪽도 서명 무효화=`canAccess('slip.signature','delete')`(:4767) / 반려 카드=`possibleActions.includes('reject')`(:4860)+버튼에 '(권한 부족)' 접미(:4886) / 하단 전표취소=`possibleActions.includes('cancel')`(:4939) / 완료 버튼 라벨이 상태별 동적(:4983-4985) / 배송일정 행=`slip.deliveryScheduleLabel` 있을 때만(:4184-4193) / 배송지 오버레이=`isOutbound` 한정(:4211) 입니다.
- 【표의 '대응 개념 없음' 판정이 부정확 — 판매전표에도 세트 계보가 내려옴】 표는 주문서의 '묶음 처리·구성품 펼침'을 '판매전표에 없음 — 대응 개념 없음'으로 적었으나, 판매전표 BE 는 `SlipLineResponse` 에 **`setHead`(:51)·`parentSetModel`(:56)·`setOptions`(:57)** 를 내려주고 FE 는 이를 수정 폼에서만 씁니다(SlipDetailPage.tsx:535 `isBundleComponent: Boolean((line.parentSetModel ?? '').trim())`, :555-560 `bundleComponentLineIds`). 즉 **읽기 상세 표에만 미표시**인 것이지 개념이 없는 것이 아닙니다. 표의 'UI 만으로 되는 것' 반대 목록은 주문서 쪽 6종만 담고 판매전표 쪽(setHead/parentSetModel/setOptions/note/unitPriceDomain)은 담지 않았습니다.
- 【증거 무결성 — 표의 수치 2건이 실측과 다름】 ①표: '레드라인 … RedlineCell 12곳' / '적용 12곳' → 실측 `renderRedlineCell(` 호출 **18곳**(SlipDetailPage.tsx:4161, 4167, 4173, 4197, 4215, 4242, 4248, 4254, 4260, 4266, 4272, 4582, 4583, 4584, 4585, 4586, 4589, 4633 — `grep -c` 결과 18). ②표: '기본 정보 카드 … RedlineCell 6필드 적용' → 실측 **5필드**(:4161 거래처, :4167 일자, :4173 배송태그, :4197 메모, :4215 배송지). 배송일정(:4184-4192)은 레드라인 미적용입니다. ③사소: 표의 'SlipLineResponse.java:32 note' → 실제 `String note,` 는 **:31**(:32 는 unitPriceWithVat javadoc). ④표가 미해결로 남긴 `{editUnitPriceColumnHeader}` 는 실제로는 항상 상수 **'단가(VAT포함)'** 입니다(:420-424 `editUnitPriceLabel` 이 무조건 상수 반환 → :431-439 도 그 상수로 수렴, '단가(행별 VAT 기준)' 분기는 도달 불가). 열 정렬 작업 시 이 열은 읽기 표(:4540)와 같은 고정 라벨로 취급하면 됩니다.
- 【표의 주요 주장 재현 대조 — 아래는 실측 일치, 반박 없음】 판매전표 읽기 표 thead 10 / tbody 10 (:4518-4543, :4563-4589) ✔ · 주문서 읽기 표 thead 10 / tbody 10 (:1154-1183, :1194-1242) ✔ · 모델명↔품목명 순서 역전(판매 :4536→:4537 / 주문 :1175→:1176) ✔ · 주문서 수정 모달 6/6, 전환 모달 6/6 ✔ · `PartnerOrderDetailResponse.java` **:191 `null`(bundleMode) · :193 `List.of()`(expandedComponents)** 리터럴 하드코딩 ✔(javadoc :135·:140 '저장 컬럼이 없어') · `SlipDetailResponse.java`(282줄) 에 signature 계열 컴포넌트 **0건**(레코드 컴포넌트 :56-156 전수 — dispatcherSignedAt :89 / inspectorSignedAt :91 뿐) ✔ · `ownerDepartment` services 전체 **0건** ✔ · `.slip-line-table` 열 폭 규칙 8종이고 `.col-product` 폭 없음(global.css:867-881) ✔ · 판매전표 데스크톱에 총액 표시 지점 없음(`mobileSlipTotal` :2676 → :3812 모바일만) ✔ · SlipCollaborationPanel 에 PresenceIndicator **0건**, 연결 필드 11종(:42-53) ✔ · 버전이력 패널 양쪽 존재(SlipCollaborationPanel.tsx:517 / PartnerOrderCollaborationPanel.tsx:599) ✔.
- 【추가로 표에 없는 소소한 조건부 상태 3건】 ①판매전표 읽기 표의 선택 행 하이라이트 `tr.is-selected`(:4561 + global.css:882) ②주문서 전환 모달의 전환완료 행 비활성 + '전환완료' 라벨(:1789, :1793-1795) ③판매전표 배송·정산 카드가 데스크톱 `<h4>배송 · 정산 정보 (V20)</h4>`(:4235)와 모바일 `detail-section-title mobile-only`(:4237) **제목을 이중으로** 갖는 반면 주문서 카드 제목은 `cardTitle` 하나(:1051, :1107).

### 차이 표의 근거 실재성 검증 — 파일:줄 앵커 40개+ 직접 개봉 대조, 열 라벨 문자열 축자 일치 확인, "0건 실측" 주장 재현 그렙

**판정** — 근거 실재함 — 날조 0건, 정밀도 오류 8건(정정 후 사용 가능). ①지어낸 파일·컴포넌트·필드 없음: 표본 40개+ 앵커 전부 실재하고 두 라인 표의 10열 라벨은 축자 일치. ②단, "실측"으로 제시된 수치 중 3건이 틀림 — '총액 grep 0건'→실제 1건(:499 주석, 결론은 유지) · 'RedlineCell 12곳'→18곳 · '기본정보 카드 6필드'→5필드. ③줄번호 오차 4건 — 계약 테스트 단언 :71-72→:73-74(2줄), #31 주석 :62-64→:63-65, SlipLineResponse note :32→:31, SummaryResponse getCreatedAt :61→:62. ④범위 누락 1건 — sales.module.css importer '7개'에 MergeConvertDialog.tsx:62 빠짐(프로덕션 8개). ⑤재현 함정 — 'specification/redline 0건'은 대소문자 구분 시에만 참이며 grep -i 로는 16/5건 오탐이 나오므로 그렙 원문을 명기할 것. 위 8건만 정정하면 차이 표는 그대로 후속 판단 근거로 쓸 수 있다.

- 【결론】 지어낸 파일·컴포넌트·필드는 0건. 표본 40개 이상을 직접 열어 확인했고 전부 실재했다. 어긋난 것은 수치 8건뿐이며 전부 정밀도 오류(위치·개수)이지 날조가 아니다. 워크트리 D:/dev/Samhan-Public/.claude/worktrees/wmain HEAD=1a5250b8f 기준.
- 【핵심 주장 = 열 구성 — 전부 축자 일치 확인】 SlipDetailPage.tsx:4536-4543 이 '모델명'·'품목명'·'규격'·'수량'·'단가(VAT포함)'·'공급가액'·'부가세'·'합계(VAT포함)' 순서로 실재하고 :4535 가 '#', :4518 이 체크박스(width 28, aria-label='전체 선택') — 10열 확정. SalesPartnerOrderDetailPage.tsx:1175-1183 이 '품목명'·'모델명'·'수량'·'납품가'·'소계'·'전환됨'·'잔여'·'묶음 처리'·'구성품 펼침' + :1154 체크박스 — 10열 확정. 표가 주장한 **모델명/품목명 상대 순서 역전은 실재**한다(판매전표 모델(:4536)→품목(:4537) / 주문서 품목(:1175)→모델(:1176)).
- 【핵심 주장 = 영구 '-' — 실재 확인】 PartnerOrderDetailResponse.java record 컴포넌트 순서(:24-42)를 from(...) 인자(:75-96)와 1:1 대조한 결과 :78=partnerName·:86=siteAddress·:87=contactPhone 이 정확히 null 리터럴이다. LineResponse.from(:176-193) 에서 :191=null(bundleMode)·:193=List.of()(expandedComponents) 확인, Javadoc :135 '현재 저장 컬럼이 없어 null' / :140 '현재 저장 컬럼이 없어 빈 배열' 도 원문 그대로. FE 소비 지점 :1228-1232(묶음)·:1234-1241(구성품)·:1085(현장)·:1089(연락처) 도 실재 — **'영구 -' 판정은 근거가 성립**한다.
- 【핵심 주장 = 계약 테스트 충돌 — 실재하나 줄번호 2줄 오차】 sp-08-4-2-partner-order-edit-put.spec.ts 의 `expect(page).not.toContain('partner-order-edit-audit-timeline')` / `not.toContain('partnerOrderAuditApi')` 는 **:73-74** 에 있다(표는 :71-72 로 기재 — 2줄 오차). '#31 이력 일원화(2026-07-06)' 주석은 **:63-65**(표는 :62-64 — 1줄 오차). 인용문 내용은 원문과 일치하며, partnerOrderAuditApi 재도입이 CI red 를 부른다는 **판단 자체는 유효**하다.
- 🚩【오류 1 — 증거 무결성 정정 필요】 표는 판매전표 헤더 합계 부재 근거로 "'총액' grep 0건(실측)" 을 두 번 적었으나 **SlipDetailPage.tsx:499 에 1건 존재**한다(가격기억 관련 주석 '저장값이 VAT 제외 총액과…'). 다만 그 매치는 주석이고 UI 표시 지점이 아니므로 결론('데스크톱에 총액 표시 지점 없음')은 유지된다 — `<tfoot>` 0건은 실측 확인. **수치 문장만 '주석 1건 외 UI 0건' 으로 정정할 것.**
- 🚩【오류 2 — 개수 과소】 '레드라인 RedlineCell 12곳' / '적용 12곳' → 실측 **18곳**. `grep -c "renderRedlineCell(" SlipDetailPage.tsx` = 18 (:4161,4167,4173,4197,4215,4242,4248,4254,4260,4266,4272,4582,4583,4584,4585,4586,4589,4633). 이식 범위 산정이 6곳만큼 작게 잡혀 있다.
- 🚩【오류 3 — 개수 과다】 '기본 정보 카드 … RedlineCell 6필드 적용' → 실측 **5필드**(:4161 partnerName, :4167 slipDate, :4173 deliveryTag, :4197 memo, :4215 shippingAddress). 배송일정 라벨(:4184-4193)은 redline 미적용이다.
- 🚩【오류 4 — 범위 과소, 작업 스코프에 영향】 'sales.module.css 를 import 하는 파일이 7개' → 나열한 7개의 줄번호는 **전부 정확**(SalesPartnerOrderDetailPage :40 · SalesPartnerOrderListPage :38 · EstimateListPage :40 · EstimatePricingConfigPage :25 · SalesOrderApprovalsPage :35 · SalesPartnerDcConfigPage :36 · SalesSubNav :18)하나, **MergeConvertDialog.tsx:62 가 빠졌다**(나머지 4건은 테스트 vi.mock 이라 제외 타당). 프로덕션 importer 는 8개다 — '판매 서브트리 전체' 범위 질문의 대상이 하나 늘어난다.
- 🚩【오류 5~7 — 1줄 오차】 ①SlipLineResponse.java 의 `String note` 는 **:31**(표는 :32). ②PartnerOrderSummaryResponse.java 의 `order.getCreatedAt()` 는 **:62**(표는 :61 — 단 record 컴포넌트 `LocalDateTime createdAt` :18 은 정확). ③slipRedline.ts:27 은 `export async function getRedline` 선언이고 `/api/v1/slips/{id}/redline` 문자열 하드코딩은 **:29**.
- ⚠️【재현 함정 — 표는 옳으나 재검증자가 오판할 지점】 'partner-order-service 전체 grep specification 0건' / 'redline 0건' 은 **대소문자 구분 시 참**이다. 그러나 `grep -ri` 로 돌리면 specification 16건·redline 5건이 나온다 — 전자는 JPA `Specification`/`JpaSpecificationExecutor`(PartnerOrderRepository.java:12,20 등), 후자는 `captu**redLine**s`(PartnerOrderConvertIT.java:469 등) 오탐이다. main 소스 대소문자 구분 결과는 둘 다 0. 보고서에 **사용한 grep 원문을 남길 것**.
- ✅【실측으로 재확인한 0건 주장 — 전부 참】 주문서 페이지 grep: ProgressBar 0 · SlipEditRequestDialog 0 · AuditOverlay 0 · RedlineCell 0 · SignatureViewer/전자서명 0 · 결재 0 · 반려 0 · detail-grid/detail-label/detail-value 0 · duplicate 0 · tfoot 0. '잠금' 은 **:485 주석 1건이 유일**하다는 기술까지 정확. partner-order-service: deliveryTag·lockFlag·printedAt·supervisionAddress·projectName·recipientPhone·paymentDueDate·driverName·inspectionStatus 전부 0. services/ 전체 ownerDepartment 0(FE 는 slip.ts:150 · mock.ts:986 등에 존재 — '항상 -' 판정 성립). SlipDetailResponse.java 에 signature/signerName 컴포넌트 0(dispatcherSignedAt:89 · inspectorSignedAt:91 뿐) — **전자서명 카드가 GET /slips/{id} 로 안 채워진다는 지적은 사실**.
- ✅【CSS·수정폼·모달 열 — 축자 일치】 global.css:515 `.detail-grid` · :826 `.slip-line-table` · :867-881 폭 규칙(col-no 44px / col-model 180px / col-spec 100px center / col-qty 70px center / col-price·supply·vat·total 각 110px right)이 그대로 있고 **`.col-product` 폭 규칙 부재도 사실**. sales.module.css:7 'DS 컴포넌트 import 금지' 원문 확인 · :156 `.card` · :207 `.estTable{table-layout:fixed}` 확인(다만 :11 import 는 Badge/Button/Input/Modal 외 **Select·WarehouseAutocomplete 도 포함** — 표가 축소 기재). 판매전표 수정 9열(:3139-3147, 매입 :3465-3473) · 주문서 수정 모달 6열(:1526-1531) · 전환 모달 6열(:1773-1778) 전부 문자열 일치.
- ✅【그 외 앵커 실측 일치】 SlipDetailPage :3637 SlipNumberDisplay · :3639-3655 '수정 {N}회' · :2674 revisionCount 계산 · :3656 PresenceIndicator · :3657-3661 마감 잠금 Badge(danger) · :4006 ProgressBar(6단계 ProgressBar.tsx:57-62) · :2340-2357 로딩/오류+권한 분기 · :4150 삭제품목 경고 · :4231-4293 V20 8항목 · :4684-4712 결재 4항목(:4704-4705 담당부서) · :4720 전자서명 카드 · :4931 slip-detail-footer-actions · :5005 SlipEditRequestDialog · :5037/:5142 삭제 모달 2종 · :231-248 slipLineAmounts · :2676/:3812 mobileSlipTotal. 주문서 :724 SalesSubNav · :728-729 배지 · :732 detail-action-bar · :521-527 print blob · :635-646 BUNDLE 제외 · :649 allSelectedAreBundle · :1067 '합계 …원' · :1072-1099 readOnly Input 7필드 · :1108 '라인 (N건)' · :1411-1415 Modal size=xl · :1432 bizCode · :1565 setItemValue · :1619 삭제 모달 · :1832/:1839 모달 2종 · :320-323 토스트 4000ms. Java: PartnerOrder.java:53-55/114-115/132/527 · PartnerOrderLine.java:111-116(PRICE/SUPPLY/VAT/TOTAL)/253-255(getLineTotal→subtotal) · SlipDetailResponse.java:95 version. FE: createAuditApi.ts:113 · sales.ts:649 · SlipCollaborationPanel.tsx:42-54(11종)/:517 · PartnerOrderCollaborationPanel.tsx:300/:414-419(전체·요청사항·납기·N번 라인 비고)/:599.
- ⚠️【사소 — 라벨 띄어쓰기 원문 불일치】 표 산문의 항목 나열이 소스 문자열과 공백이 다르다: 실제 '인수자 번호'(:4258)·'인쇄 여부'(:4276)·'검수 상태'(:4283)·'배송 태그'(:4171)·'거래처 코드'(:1072)·'연결 전표'(:1076) ↔ 표는 '인수자번호'·'인쇄여부'·'검수상태'·'배송태그'·'거래처코드'·'연결전표'. 표(컬럼) 라벨은 전부 정확하고 카드 항목 나열에서만 발생 — 이 문자열로 grep/단언을 짜면 헛친다.

### 진행 중 트랙과의 충돌 — 차이 표가 바꾸자고 하는 파일을 열린 PR 9개(#1125·#1126·#1128·#1131·#1132·#1134·#1157·#1158·#1159)가 이미 바꾸고 있는지, 대조 기준(판매전표 상세)이 움직이는 중인지, 머지 순서 제약이 생기는지를 각 브랜치의 `git diff --name-status <merge-base> <branch>` 실측으로 판정

**판정** — 🚨 **충돌 있음 — 조건부. 기준(판매전표 상세)이 실제로 움직이는 중입니다.**

**(1) #1131 = 직접 충돌·고위험.** 열린 PR 9개 중 `SlipDetailPage.tsx` 를 건드리는 유일한 PR 이며(+82/-8, 5,383→5,457줄) 차이 표의 482줄 이후 모든 좌표가 **+74** 밀립니다. 더 중요한 건 아직 오지 않은 부분입니다 — `ProductAutocomplete`·`appendBlankRowIfLastChanged`·`applyProductSelectionToEditLine` 이 **import·정의만 되고 호출부 0건**이라, PR 제목이 예고한 `#1071 수정 화면 품목 추가`·`#1068 전잔/후잔` JSX 는 다음 라운드에 들어옵니다. ⟹ 차이 표의 `[수정 표면 라인 표] 9열` 행과 `헤더`·`기본 정보 카드` 행은 **곧 옛 기준**입니다. 반면 **읽기전용 라인 표 10열은 브랜치에서도 내용 동일**이라 columnDiffs 본체는 좌표만 보정하면 그대로 유효합니다.

**(2) #1134 = 예정 충돌.** 지금은 두 파일 다 안 건드리지만, 그 트랙의 정찰 문서가 스스로 *"#1131 … 직접 충돌, 고위험"* · *"가장 위험한 표면은 SlipDetailPage"* 라 적었고 슬라이스 2 의 명시 대상이 **`SlipDetailPage.tsx:4199,4217` 의 AuditOverlay 2개** — 차이 표의 `AuditOverlay` 행이 인용한 `:4194-4225` 와 같은 자리입니다. 적용 패턴이 **병존(치환 아님)** 이라 판매전표 상세 섹션이 28→29 로 늘어납니다. 게다가 차이 표 openQuestions #6 의 *"#31 결정을 뒤집습니까"* 선택지는 **바로 그 #1134 트랙의 전제를 무너뜨리는 것**이라 CI red 이전에 트랙 간 정책 충돌입니다(계약 단언 실재 확인: spec `:73`,`:74`).

**(3) #1126 = 인접·저위험.** `partner-order-service` 는 `BootstrapService.java` 만(DTO·엔티티·마이그레이션 무관), `order-app/samhanApi.ts` 는 `:185-190` 만 — openQuestions #8 이 인용한 `:381` 은 무사. 같은 파일이라 리베이스 순서 의존만 생깁니다.

**(4) 충돌 없음 6건 (변경 파일 전수 근거 제시함).** #1159 는 `accounting/admin/OrderDetailPage.tsx`(≠`SalesPartnerOrderDetailPage.tsx`)를 지우는 것이라 무관하나, 둘 다 한국어로 '주문서 상세' 라 **브리핑에 `/sales/partner-orders/:id` 병기 필수**. #1157(product-service V35+docs)·#1132·#1158(각 docs 1파일)·#1128·#1125(각 docs 2파일)는 소스 접점 0.

**(5) 마이그레이션.** partner-order-service 최고 V18, **V16 결번**, 열린 PR 예약 0건 ⟹ **V19 부터** 사용하고 V16 은 채우지 말 것.

**권고 머지 순서 / 범위:** 우리 트랙을 **주문서 편도(`SalesPartnerOrderDetailPage.tsx` + `partner-order-service` 만 편집)로 동결**하면 세 트랙 병렬 유지가 가능하고 파일 충돌 0 입니다. 반대로 openQuestions 의 `열 순서 통일`·`총액 축`·`수량 천단위` 중 하나라도 **판매전표 쪽을 고치는 안**으로 결정되면 즉시 `SlipDetailPage.tsx` 3중 충돌이므로 **#1131 머지 후**로 직렬화해야 합니다. 이 갈림길은 차이 표를 확정하기 전에 먼저 정해야 합니다.

**⚠️ 차이 표 자체의 증거 오차 2건(정정 요망):** ① spec 좌표 `:71-72`/`:62-64` → 실측 **`:73-74`/`:63-65`**(내용은 정확). ② `sales.module.css` importer **7개 → 실측 8개**, 누락 = `routes/components/MergeConvertDialog.tsx:62` (+ CSS 를 mock 하는 테스트 4곳도 CSS 계보 교체 시 함께 깨짐).

- 【전체 실측 근거】 origin/main = `1a5250b8f`. 열린 PR 9개 전부에 대해 `git merge-base origin/main origin/<branch>` 기준 `git diff --name-status` 를 돌렸고, 차이 표의 대상 파일군(SlipDetailPage / SalesPartnerOrderDetail / sales.module.css / global.css / partner-order-service / PartnerOrder* / SlipDetailResponse / SlipLineResponse / SalesSubNav / *CollaborationPanel / *VersionHistoryPanel / createAuditApi / ProgressBar / api/sales.ts / slipRedline / partner-order-edit)로 필터한 결과 **히트는 단 2개 브랜치**였습니다 — `feat/1068-sales-slip-header-track`(#1131) 과 `feat/896-qty-sync-chip-track`(#1126). 나머지 7개는 이 파일군을 하나도 건드리지 않습니다.
- 🚨【#1131 = 직접 충돌 · 기준이 실제로 움직이는 중】 판매전표 상세 `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` 를 건드리는 열린 PR 은 **#1131 하나뿐**입니다(브랜치 `feat/1068-sales-slip-header-track`, merge-base `b2d53a092`). 현재 변경분 = `SlipDetailPage.tsx` **+82/-8**, `SlipDetailPage.lineIdContract.test.tsx`, 그리고 docs 3건. 파일 줄 수 origin/main **5,383줄 → 브랜치 5,457줄(+74)** 실측. ⟹ 차이 표가 인용한 SlipDetailPage 좌표 중 **482줄 이후 전부가 +74 만큼 밀립니다**(예: 라인 표 헤더 `:4535-4543` → 브랜치 `:4609-4617`, `git show` 로 양쪽 10줄을 떠서 내용 동일·좌표만 이동함을 확인).
- 🚨【#1131 이 앞으로 바꿀 것 — 차이 표의 2개 행이 곧 무효화됨】 PR 제목 = `[FEAT] #1068 판매전표 헤더 거래처 자동채움·전잔/후잔 + #1071 수정 화면 품목 추가`. 브랜치의 자체 정찰 문서 `docs/dev-reports/2026-08-10-1131-s1-recon.md` 가 *"판매전표 직접수정 표는 있지만 품목 선택기와 신규 행 생성 경로는 없다… `SlipDetailPage.tsx:4426-4441` 의 '행 추가' 버튼은 `alert` 만 실행"* · *"판매전표 폼/상세 헤더에 원장 openingBalance/closingBalance 를 공급하는 경로 0건"* 이라고 적었습니다. ⟹ 차이 표의 **`[수정 표면 라인 표] 판매전표 매출 인라인 폼 ↔ 주문서 정식 편집 모달 — 열 전수`(9열)** 행과 **`헤더`/`기본 정보 카드`** 행은 #1131 머지 후 항목이 늘어납니다. 지금 대조한 9열은 곧 옛 기준입니다.
- 【#1131 은 아직 모델 계층만 바꿨고 JSX 는 안 바꿨다 — 즉 진행 중】 브랜치 파일을 떠서 grep 한 실측: `ProductAutocomplete`(:44 import), `appendBlankRowIfLastChanged`(:143), `removeLinePreservingMinimum`(:145), `searchProducts as searchProductsApi`·`isSelectableProductStatus`(:132), `applyProductSelectionToEditLine`(:521 정의) — **전부 import/정의만 있고 호출부가 0건**입니다. 실제로 배선된 것은 `createBlankPurchaseEditLine`(:501) 을 `ensureTrailingBlankRow(...)` 에 넘긴 2곳(:611 `toPurchaseEditLines`, :830 `coeditLinesToEditLines`) 과 저장 payload 필터 2곳(`purchaseEditLines.filter(willLineBeSaved)` / `salesEditLines.filter(willLineBeSaved)`)뿐. `PurchaseEditLine.productId` 가 `string` → `string | null` 로 바뀐 것도 확인. ⟹ **수정 표면 JSX(열 구성) 변경은 아직 오지 않았고, 다음 라운드에 옵니다.**
- ✅【#1131 이 아직 안 건드린 것 — 차이 표 핵심은 아직 유효】 읽기전용 라인 표 헤더 10열 블록은 origin/main 과 브랜치가 **내용 동일**(`#` / 모델명 / 품목명 / 규격 / 수량 / 단가(VAT포함) / 공급가액 / 부가세 / 합계(VAT포함), 체크박스 열 포함 10열). #1131 의 hunk 는 전부 `@@ -2952 +3026 @@` 이하로는 없습니다(마지막 hunk = 저장 payload 필터). ⟹ 차이 표의 **columnDiffs 읽기 라인 표 부분은 지금 기준 그대로 쓸 수 있고, 좌표만 +74 하면 됩니다.**
- 🚨【#1134 = 예정 충돌 · 다른 트랙이 이미 스스로 경고문을 써 놨다】 `feat/1091-version-history-remaining` 은 **현재는** `SlipDetailPage.tsx` 도 `SalesPartnerOrderDetailPage.tsx` 도 건드리지 않습니다(변경 13파일 전수 확인 — AuditVersionHistory 신규 2, InventoryAudit/MonthEnd/PeriodClose/SalesClosing/SalesPartnerDcConfig/TaxInvoiceDetail/TaxInvoiceForm 7, docs 3). 그러나 그 브랜치의 `docs/dev-reports/2026-08-10-1091-recon.md` 가 **`| #1131 | … | 직접 충돌, 고위험. SlipDetailPage 의 AuditOverlay 2곳과 같은 파일이며…`** 라고 적었고, `§7 슬라이스 제안` 2번 = *"전표·감사 이력 슬라이스: **SlipDetailPage 의 2개 AuditOverlay**, TaxInvoice detail/form, DC config, SalesClosing, PeriodClose, MonthEnd, InventoryAudit"*, `§8` = *"가장 위험한 표면은 **`SlipDetailPage`** 다"*. 표 4행이 지목한 좌표는 `SlipDetailPage.tsx:4199,4217` 로 **차이 표의 `AuditOverlay (메모/배송지 필드 이력 오버레이)` 행이 인용한 `:4194-4225` 와 정확히 같은 자리**입니다.
- 【#1134 의 적용 패턴은 '치환' 이 아니라 '병존' — 판매전표 상세에 섹션이 하나 늘어난다】 실측: `SalesPartnerDcConfigPage.tsx` 변경분은 기존 `AuditOverlaySection` 을 **남겨 둔 채** `AuditVersionHistory` 를 그 아래에 추가합니다(`import { AuditVersionHistory } from '../components/audit/AuditVersionHistory'` :32 추가, `const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)` :50 추가, `:390-398` 에 `<AuditVersionHistory logs={…} open={auditHistoryOpen} onOpenChange={setAuditHistoryOpen} testIdPrefix="partner-dc-config-audit" />` 삽입). ⟹ 같은 패턴이 SlipDetailPage 에 오면 차이 표의 **판매전표 28개 섹션이 29개가 됩니다.**
- 🚨【#1134 와 차이 표 openQuestions #6 은 방향이 정면으로 맞선다】 차이 표는 *'`revisions API` 로 카운트를 세는 방향이 맞습니까, 아니면 **#31 결정을 뒤집습니까?**'* 를 물었습니다. 실측 확인 결과 그 계약 테스트는 실재합니다 — `clients/desktop/playwright/sp-08-4-2-partner-order-edit-put/sp-08-4-2-partner-order-edit-put.spec.ts:73` `expect(page).not.toContain('partner-order-edit-audit-timeline')` · `:74` `expect(page).not.toContain('partnerOrderAuditApi')`, 주석 `:63-65` *"#31 이력 일원화(2026-07-06) — PO 상세 인라인 '수정 이력'… 은 제거되고 PartnerOrderVersionHistoryPanel(버전이력 — revisions API)로 일원화됐다"*. 그런데 **#1134 트랙 전체가 바로 그 '이력 일원화' 의 연장(나머지 18개 표면)** 입니다. ⟹ '#31 을 뒤집는다' 선택지는 단순 CI red 문제가 아니라 **가동 중인 다른 트랙의 전제를 무너뜨리는 결정**이므로, PM 자율이 아니라 개발책임자 판단 대상으로 보입니다.
- 【#1126 = 인접 · 저위험 · 같은 파일 다른 구역】 `feat/896-qty-sync-chip-track`(339파일, 대부분 QA png)의 히트 2건: ① `services/partner-order-service/.../service/BootstrapService.java` (+96/-38) — 실측상 order-app 부트스트랩 카탈로그 페이로드의 카테고리별 실패 격리(`catalogSafely`) 뿐이고 **`PartnerOrderDetailResponse.java`·엔티티·마이그레이션은 전혀 안 건드립니다**. ② `clients/web/order-app/src/samhanApi.ts` (+2/-2) — 변경 위치는 `:185-190` `fetchQuantitySyncRules` 의 `estimateCategory: 'SINGLE_SET' → 'HOME_MULTI'` 이고, 차이 표 openQuestions #8 이 인용한 **`:381` 의 `post('/partner-orders/{draftId}/confirm', { lines })` 는 손대지 않았습니다**(main 원문 `:381` 을 떠서 확인). ⟹ 텍스트 충돌 0, 그러나 **같은 파일**이므로 '레거시 미계승 3건' 을 이번 범위에 넣으면 리베이스 순서 의존이 생깁니다.
- 【#1159 = 코드 충돌 없음 · 다만 이름 혼동이 실질 위험】 `feat/826-remove-migrated-order-menu` 가 지우는 것은 `clients/desktop/src/renderer/routes/accounting/admin/OrderDetailPage.tsx` + `OrderListPage.tsx`(라우트 `/accounting/admin/orders/:orderNo`, 사이드바 **'주문서 관리 (이관)'**, pageCode `ecount.mig14.order-list`)이며, 차이 표의 대상인 `routes/SalesPartnerOrderDetailPage.tsx`(`/sales/partner-orders/:id`, 사이드바 '주문서 관리')**와는 다른 파일**입니다. `AppLayout.tsx` 변경분은 sales 사이드바 `activeTargets` 배열에서 `/accounting/admin/orders` 한 줄만 빼고 `/sales/partner-orders` 는 그대로 둡니다(diff 실측). `routes/index.tsx` 도 해당 route 2개만 삭제. ⟹ 충돌 없음. 🚩단 **두 화면 모두 한국어로 '주문서 상세'** 라서, 후속 브리핑이 경로 없이 '주문서 상세' 라고만 쓰면 **삭제 중인 파일을 대상으로 지목할 수 있습니다** — 브리핑에 `/sales/partner-orders/:id` 를 반드시 병기해야 합니다.
- ✅【충돌 없음 5건 — 근거 = 변경 파일 전수】 #1157 `feat/1051-product-link-integrity` = docs 3 + `services/product-service/.../db/migration/V35__repair_issue_1096_product_cleanup.sql` + IT 1 (총 6파일, FE 0). #1132 `feat/1089-bundle-expand-base-only` = `docs/dev-reports/track-open-1089.md` **1파일**. #1158 `feat/845-ds-next-slice` = `docs/tracks/2026-08-10-845-document-designer-next.md` **1파일**. #1128 `feat/999-stock-instance-serial-qr` = docs **2파일**. #1125 `feat/894-internal-chat` = docs **2파일**. 넷은 트랙 개설만 된 상태로 소스 0줄입니다.
- 【마이그레이션 슬롯 — 지금은 비어 있으나 함정이 하나 있다】 차이 표 `blockedByBackend` 는 partner-order-service 마이그레이션을 10여 종 요구합니다. 실측: main 의 partner-order-service 마이그레이션 최고 = **V18**(`V18__soft_delete_test_seed_orders.sql`), 그리고 **V16 이 결번**입니다(V15 → V17 로 건너뜀). 열린 PR 9개 중 partner-order-service 마이그레이션을 예약한 것은 **0건**(전 브랜치 `db/migration` 필터 결과: #1159 = auth-service `V100__remove_mig14_order_list_page.sql`, #1157 = product-service `V35__…` 둘뿐). ⟹ 슬롯 충돌은 현재 없고 **V19 부터** 잡으면 됩니다. 🚩**빈 V16 을 채우지 마십시오** — 이미 적용된 DB 는 V16 을 건너뛴 상태라 낮은 슬롯은 적용되지 않고 부팅만 막습니다(#1057 실측 계열).
- ⚠️【증거 무결성 정정 1 — 차이 표의 인용 좌표가 2줄 어긋남】 openQuestions #6 이 `sp-08-4-2-partner-order-edit-put.spec.ts:71-72` 와 주석 `:62-64` 를 인용했으나, 실측 grep 결과 단언은 **`:73`, `:74`**, 주석은 **`:63-65`** 입니다. 주장 내용(두 `not.toContain` 단언의 존재, #31 일원화 경위)은 **정확**하고 좌표만 틀렸습니다.
- ⚠️【증거 무결성 정정 2 — 작업 범위가 한 파일 더 넓다】 openQuestions #5 는 `sales.module.css` import 파일을 **7개**로 셌으나, 워크트리 grep 실측 production import 는 **8개**입니다. 누락분 = **`clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx:62`** (`import styles from '../../components/sales/sales.module.css'` — Phase 2.6b D2 '병합 전환 모달', 다중 주문 → 단일 출고전표). 추가로 CSS 를 mock 하는 테스트 4곳도 존재합니다(`MergeConvertDialog.test.tsx:118`, `EstimatePricingConfigPage.priceSchedule.test.tsx:74`, `SalesPartnerOrderDetailPage.coedit.test.tsx:133`, `SalesPartnerOrderListPage.test.tsx:75`) — CSS 계보를 갈아엎으면 이 mock 4개도 같이 깨집니다.
- ✅【차이 표의 판매전표 좌표 자체는 origin/main 과 일치】 표본 검증: `SlipDetailPage.tsx:3637` = `<SlipNumberDisplay slipDate={slip.slipDate} seqNo={slip.seqNo} size="lg" />` 일치, `:4535-4543` = 라인 표 헤더 9줄(`#`~`합계(VAT포함)`) 일치. main 의 이 파일 최근 커밋은 `b2d53a092`(#1156) 이고 그 뒤 6커밋은 이 파일을 안 건드렸으므로 **#1131 의 merge-base 판본 = 현재 main 판본**입니다.
- 【머지 순서 제약 — 실측에서 도출】 ① **우리 트랙이 `SalesPartnerOrderDetailPage.tsx` + `partner-order-service` 만 건드리면 파일 충돌은 0** 입니다(#1131·#1134 어느 쪽과도 안 겹침). 이 경우 제약은 '파일' 이 아니라 '**기준**' — #1131 이 판매전표 수정 표면과 헤더를 바꾸므로 그 두 행만 재대조하면 됩니다. ② 그러나 차이 표의 openQuestions 중 **`열 순서를 어느 쪽으로 통일합니까`(판매전표 읽기 표를 품목→모델로 뒤집는 안)**, **`총액 축을 어느 쪽에 맞춥니까`(판매전표 데스크톱에 총액 신설)**, **`수량 천단위 구분 통일`** 은 전부 `SlipDetailPage.tsx` 를 편집해야 합니다 ⟹ 채택하는 순간 **#1131 과 하드 충돌**, 나아가 #1134 슬라이스 2 까지 겹쳐 **3중 충돌**. ③ 따라서 순서는 **#1131 → (#1134 슬라이스 2) → 우리 트랙** 이거나, 우리 트랙을 **주문서 편도(판매전표 미편집)로 동결**해 병렬 유지하는 두 갈래뿐입니다.

---

# 주문서 상세 ↔ 판매전표 상세 정렬 — 슬라이스 근거 보고서

**기준**: `D:/dev/Samhan-Public/.claude/worktrees/wmain`, HEAD = `1a5250b8f` (`docs(audit): 감사 기록 전 서비스 전수 조사 …`)
**표기**: ✅ = 이 세션에서 PM 이 직접 재현 확인 · ⚠️ = 적대검증 보고만 있고 이 세션에서 미재현(확정 금지) · 🚩 = 차이 표가 틀려 정정된 항목

---

## 0. 한 줄 결론

**"열만 맞추면 되는 일"이 아닙니다.** 두 읽기전용 라인 표는 둘 다 10열이지만 **겹치는 축은 5개뿐**이고 그중 2개는 라벨만 다르며(단가(VAT포함)↔납품가 / 합계(VAT포함)↔소계) **모델명·품목명은 상대 순서가 서로 뒤집혀 있습니다**(✅ 판매전표 `SlipDetailPage.tsx:4536`→`:4537` / 주문서 `SalesPartnerOrderDetailPage.tsx:1175`→`:1176`). 나머지 차이는 **① UI 만으로 되는 것 3열**(공급가액·부가세·합계 — BE·FE 타입 모두 준비됨) **② BE DTO 만 고치면 되는 것 4종** **③ 마이그레이션이 필요한 것 10종 이상** **④ BE 엔드포인트가 아예 없는 것 1종(레드라인)** 으로 갈라지고, 여기에 **레이아웃 계보 자체가 다른 문제**(판매전표 = DS Card + `.detail-grid` / 주문서 = `sales.module.css` GAS 이식 셸 + readOnly `Input`)가 겹쳐 있어 **한 슬라이스로는 불가능**합니다. 결정적으로 **비교 기준인 판매전표 상세가 지금 움직이는 중**입니다(⚠️ #1131 이 `SlipDetailPage.tsx` 를 +82/-8 로 편집 중, ✅ 파일 5,383→5,457줄로 **482줄 이후 좌표 전부 +74 이동**) — 그래서 이번 트랙은 **주문서 편도(판매전표 미편집)** 로 동결하는 것이 유일한 병렬 유지 경로입니다.

---

## 1. 🚩 적대검증이 뒤집은 것 — **차이 표를 확정하기 전에 반드시 반영**

아래 8건은 차이 표가 "실측"으로 제시했으나 실제와 다릅니다. **전부 정밀도 오류이고 날조는 0건**입니다(적대검증 2가 앵커 40개+ 를 직접 개봉해 실재 확인, 지어낸 파일·컴포넌트·필드 0건). 아래 ①~⑤는 이 세션에서 PM 이 직접 재현했습니다.

| # | 차이 표 기술 | 실측 | 영향 |
|---|---|---|---|
| ① ✅ | "RedlineCell 12곳 / 적용 12곳" | **18곳** — `grep -c "renderRedlineCell(" SlipDetailPage.tsx` = 18 (`:4161,4167,4173,4197,4215,4242,4248,4254,4260,4266,4272,4582,4583,4584,4585,4586,4589,4633`) | 레드라인 이식 범위가 **6곳만큼 작게** 잡혀 있었음 |
| ② ✅ | "기본 정보 카드 … RedlineCell **6필드**" | **5필드**(`:4161` 거래처 · `:4167` 일자 · `:4173` 배송태그 · `:4197` 메모 · `:4215` 배송지). 배송일정(`:4184-4193`)은 미적용 | 소 |
| ③ ✅ | "판매전표 수정 인라인 표 = **9열**" | **thead 9 / tbody 10 으로 어긋나 있음.** 매출 thead `:3139-3147`(9 `<th>`, 마지막은 `aria-label="행 삭제"` 빈 th) ↔ tbody `:3161,3171,3181,3191,3204,3233,3246,3262,`**`3277`**`,3280`(10 `<td>`). `:3277` = `<td className="td-right">{lineTotalWithVat}원</td>` 로 **헤더가 없는 10번째 셀** | **가장 무거운 정정.** 판매전표 수정 표면을 "9열"로 대조한 모든 판단이 어긋남 |
| ④ ✅ | "`총액` grep **0건**"(2회 기재) | **1건 존재** — `SlipDetailPage.tsx:499` 주석. 단 UI 표시 지점은 아니므로 **결론("데스크톱에 총액 표시 지점 없음")은 유지**(`tfoot` grep = **0** ✅) | 수치 문장만 "주석 1건 외 UI 0건" 으로 정정 |
| ⑤ ✅ | "`sales.module.css` importer **7개**" | **8개** — 누락분 `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx:62`. (추가로 CSS 를 `vi.mock` 하는 테스트 4곳도 존재 ⚠️) | §6 Q5 "판매 서브트리 전체인가" 의 대상이 하나 늘어남 |
| ⑥ ✅ | 계약 테스트 단언 `:71-72`, 주석 `:62-64` | **`:73`, `:74`**, 주석 **`:63`** (`sp-08-4-2-partner-order-edit-put.spec.ts`). 단언 내용·#31 경위는 **정확** | 좌표만 |
| ⑦ ✅ | `SlipLineResponse.java:32 note` | **`:31`** (`String note,`) | 좌표만 |
| ⑧ ⚠️ | `PartnerOrderSummaryResponse.java:61 getCreatedAt` | **`:62`**(레코드 컴포넌트 `:18` 은 정확) — 적대검증 2 보고, 미재현 | 좌표만 |

**추가 정정 (PM 이 이 세션에서 발견 — 적대검증에도 없던 것)**

- ✅ **파일 경로 오기**: 차이 표는 `PartnerOrderDetailResponse.java` 를 `web/` 직하로 인용했으나 실제는 **`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java`** 입니다(`web/dto/`). 줄 번호(`:78`,`:86`,`:87`,`:191`,`:193`)와 javadoc(`:135` "현재 저장 컬럼이 없어 `null`", `:140` "빈 배열")은 ✅ 전부 정확합니다.
- ✅ **"판매전표 28개 섹션"은 재현되지 않습니다.** 메인 return(`SlipDetailPage.tsx:3624-5282`)의 최상위 JSX 자식을 직접 세면 **24개**이고(적대검증 1의 수치와 일치 — PM 이 독립 재현), 차이 표의 `sectionDiffs` 배열은 **38행**입니다. 28 이라는 수는 어느 쪽에도 대응하지 않습니다. **총 개수 인용을 지우거나 24 로 고칠 것.**
- ✅ **`editUnitPriceColumnHeader` 는 미해결이 아닙니다.** 차이 표는 `{editUnitPriceColumnHeader}` 를 가변으로 남겨 뒀으나, `SlipDetailPage.tsx:420-424` 의 `editUnitPriceLabel` 이 **무조건 상수 `'단가(VAT포함)'`** 을 반환하므로 `:431-439` 도 항상 그 상수로 수렴합니다(`'단가(행별 VAT 기준)'` 분기는 도달 불가). 읽기 표(`:4540`)와 **같은 고정 라벨**로 취급하면 됩니다.

**차이 표가 놓친 축(⚠️ 적대검증 1 보고, 일부만 PM 재현)**

- ✅ **수정 표면의 "헤더 필드" 축이 표에 아예 없습니다.** 판매전표 매출 인라인 폼 **10필드**(`SlipDetailPage.tsx:3037` 판매번호 · `:3050` 거래처 · `:3062` 거래처코드 · `:3066` 사업자번호 · `:3070` 배송주소 · `:3080` 감리주소 · `:3090` 프로젝트명 · `:3100` 인수자 번호 · `:3110` 입금예정일 · `:3123` 적요) ↔ 주문서 수정 모달 **3필드**(`SalesPartnerOrderDetailPage.tsx:1487` 거래처 코드 · `:1498` 납기 · `:1510` 요청사항). 매입 폼은 **9필드**(감리주소 없음 — 매출/매입 비대칭) ⚠️.
- ✅ **주문서 모바일 표면 2개가 표에 없습니다.** ① `MobileCollapsible "주문 상세 정보"`(`:1020-1045`, `mobile-field-row/label/value` 로 7항목) — 데스크톱 카드는 `!isMobile` 게이트(`:1048`)라 **모바일/데스크톱이 별개 마크업**입니다. ② 라인 전용 `mobile-action-bar`(`:1249-1277`, 재고조회/해제/참조 3버튼).
- ✅ **"빈 값" 처리가 비대칭인데 표는 모바일을 "동일"로 판정했습니다.** 판매전표는 빈 값이면 모바일에서 **행이 통째로 사라집니다**(`global.css:626-628` `.detail-grid-item-empty { display:none !important }`, `@media (max-width:768px)` `:597` 안). 주문서는 같은 상황에서 `'-'` 를 회색으로 **남깁니다**(`:1033` `emptyLabel(value)`).
- ✅ **"판매전표에 세트/묶음 대응 개념 없음"은 부정확합니다.** BE `SlipLineResponse.java:51 setHead` · `:56 parentSetModel` · `:57 setOptions` 가 실재하며, FE 는 이를 **수정 폼에서만** 씁니다(⚠️ `SlipDetailPage.tsx:535,555-560`). 즉 **읽기 상세 표에만 미표시**입니다.
- ⚠️ 판매전표 수정 표면에만 있는 조건부 표시물 6종(최근단가 재적용 배너 `:3025-3034` · 재조회 변경 행 강조 `:3159` · 단가 출처 note `:3226-3230` · 부가세 `⚠ 10%와 다름` `:3258-3260` · 세트 구성품 readOnly `:3242,3255` · 전이 충돌 stale 배너 `:2996-3000`) — 적대검증 1 보고, 미재현.
- ⚠️ **조건부 게이트 축이 표 전체에 거의 없습니다.** 주문서 헤더 버튼 7종이 각각 다른 조건(`:733 canPrint`, `:743`, `:753`, `:763 status==='DRAFT'`, `:774 status==='ON_HOLD'`, `:785-788 canConvert && linkedSlipNo==null`, `:799 canDelete`), `[참조 조회]` 는 `canViewProductLookups` 권한 게이트(✅ `:1269` 에서 확인) 입니다. **"있다/없다"만으로는 QA 발화 조건을 못 셉니다.**

---

## 2. 열 차이표 — **판매전표 읽기전용 라인 표 순서 기준** (✅ 양쪽 thead/tbody 전수 재현)

판매전표 `SlipDetailPage.tsx:4515-4595` / 주문서 `SalesPartnerOrderDetailPage.tsx:1148-1245`.

| # | 판매전표 (기준) | 주문서 | 판정 | 비고 (근거) |
|---|---|---|---|---|
| 1 | 체크박스 `th.col-no` w28 `aria-label="전체 선택"` `:4518` / td `:4563` | 체크박스 w28 동일 `:1154` / td `:1194` | **동일** | 위치·폭·용도 일치. td `aria-label` 참조 필드만 `modelName`↔`modelCode` |
| 2 | **`#`** 행번호 **버튼** `th.col-no` `:4535` / td = `.slip-line-no-btn`, 클릭 시 행 액션 툴바 노출 ⚠️`:4571-4581`. 폭 44px `global.css:867` | **없음** | **주문서 없음** | 열 하나가 아니라 **"행 선택 → 행 추가/순서 수정/행 삭제" 표면 전체**가 없음 |
| 3 | **모델명** `th.col-model` `:4536` / td `renderRedlineCell('lines[i].modelName')` `:4582`. 폭 180px | **3번째이지만 품목명 뒤** `th :1176` / td `line.modelCode` `:1213` | **순서 역전** | 판매전표 모델→품목 / 주문서 품목→모델. API 필드명도 `modelName`↔`modelCode`(BE 가 `getModelName()` 을 `modelCode` 로 내림, `PartnerOrderDetailResponse.java:180`) |
| 4 | **품목명** `th.col-product` `:4537` / td `:4583`. **폭 규칙 없음**(`.col-product` 미정의) | **2번째** `th :1175` / td `styles.tdLeft` 좌정렬 `:1212` | **순서 역전** | 라벨은 양쪽 "품목명" 동일 |
| 5 | **규격** `th.col-spec` `:4538` / td `:4584`. 100px 가운데 | **없음** | **주문서 없음 · 마이그레이션 필요** | `partner-order-service` 전체 `grep specification` **0건**(⚠️ 대소문자 구분 시에만 참 — `-i` 로는 JPA `Specification` 16건 오탐) |
| 6 | **수량** `th.col-qty` `:4539` / td `l.quantity.toLocaleString()` **천단위 있음** `:4585`. 70px 가운데 | 4번째 `th :1177` / td `{line.quantity}` **천단위 없음** `:1214`, 우정렬 | **동일 축 · 포맷 불일치** | 🚩 같은 화면 안에서도 모바일 카드는 `toLocaleString`(⚠️`:1330`) 이라 **데스크톱/모바일이 어긋남** |
| 7 | **단가(VAT포함)** `th.col-price` `:4540` / td `slipLineAmounts(l).unitWithVat` `:4586`. 110px 우정렬 | **납품가** 5번째 `th :1178` / td `krw(line.deliveryPrice)` `:1215` | **라벨만 다름** | 값 축은 둘 다 VAT 포함 단가(BE `getPriceVat()`) |
| 8 | **공급가액** `th.col-supply` `:4541` / td `slipLineAmounts(l).supply` `:4587` | **없음** | **주문서 없음 · 🔑 UI 만으로 가능** | BE `PartnerOrderDetailResponse.java:151 supplyAmount`, FE 매퍼 `sales.ts:622` 까지 준비됨. ⚠️단 legacy NULL — §4 참조 |
| 9 | **부가세** `th.col-vat` `:4542` / td `:4588` | **없음** | **주문서 없음 · 🔑 UI 만으로 가능** | BE `:152 vatAmount`, FE `sales.ts:623` |
| 10 | **합계(VAT포함)** `th.col-total` `:4543` / td `renderRedlineCell('lines[i].lineTotal')` `:4589` | **소계** 6번째 `th :1179` / td `krw(line.subtotal)` `:1216` | **라벨만 다름** | BE 가 같은 값을 `subtotal`·`lineTotal` 두 이름으로 동시 노출(`PartnerOrderLine.java:252-255` `getLineTotal(){return this.subtotal;}`) |
| — | **없음** | **전환됨** `th :1180` / td `converted>0 ? 배지 : '-'` `:1217-1223` | **판매전표 없음** | 부분전환 도메인 고유 |
| — | **없음** | **잔여** `th :1181` / td `converted>0 ? remaining : '-'` `:1224-1226` | **판매전표 없음** | 🚩 전환 이력이 없으면 잔여=수량인데도 `'-'` 로 표시(✅ `:1225` 재현) |
| — | **없음** | **묶음 처리** `th :1182` / td `:1227-1233` | **판매전표 읽기표에 없음** | 🚩 **영구 `'-'`** — BE `:191` `null` 리터럴(✅). 단 §1 정정대로 판매전표 BE 에는 `setHead/parentSetModel/setOptions` 가 존재 |
| — | **없음** | **구성품 펼침** `th :1183` / td `:1234-1242` | **판매전표 없음** | 🚩 **영구 `'-'`** — BE `:193` `List.of()` 리터럴(✅) |
| — | `<tfoot>` **0건** ✅ · 데스크톱 총액 표시 지점 없음 | 표에는 없고 **헤더 카드**에 `합계 {krw(totalAmount)}원` ⚠️`:1067` | **비대칭** | §6 Q3 |

**수정 표면 열 (정정 반영)**

| | 판매전표 매출 인라인 폼 | 주문서 정식 편집 모달 |
|---|---|---|
| 헤더 필드 | ✅ **10필드** (`:3037,3050,3062,3066,3070,3080,3090,3100,3110,3123`) | ✅ **3필드** (`:1487,1498,1510`) |
| 라인 열 | ✅ **thead 9 / tbody 10** (`:3139-3147` ↔ `:3161…3277,3280`) — 품목 / 모델명 / 규격 / 수량 / 단가(VAT포함) / 공급가액 / 부가세 / 합계(VAT포함) / (빈 th) + **헤더 없는 포맷 합계 셀** | ✅ **6/6** (`:1526-1531`) — 품목명 / 모델명 / **구분** / 수량 / **납품가** / **비고** |
| 특이 | 읽기표(모델→품목)와 **반대로 품목→모델** ✅ | 구분(`categoryKey` 4옵션 ⚠️`:1528,1569-1572`)·비고는 판매전표에 없음 |

---

## 3. 섹션 차이표

판매전표 최상위 JSX 자식 **24개**(✅ PM 재현) 기준. 아래는 차이가 있는 것만 추렸습니다(전부 동일한 것 — 로딩/오류, 모바일 요약 카드, 모바일 액션 시트, 재고조회 모달, 삭제 확인 모달, 오류 배너, `PresenceIndicator` — 은 생략).

### 3-1. 판매전표에만 있음 (= 이식 후보)

| 섹션 | 판매전표 근거 | 주문서 실측 | 이식 장벽 |
|---|---|---|---|
| 진행 ProgressBar | `:4005-4007`, 6단계 ⚠️`ProgressBar.tsx:57-62` | grep 0건 ⚠️ | `currentStatus: SlipStatus` + 6단계 하드코딩 ⟹ 그대로 이식 불가. `PartnerOrderStatus` 6종은 다른 축 |
| 헤더 "수정 {N}회" | `:3639-3655`(계산 `:2674`) | 없음 ⚠️ | **BE DTO 미노출** — `PartnerOrder.revisionCount`(⚠️`:132`) 존재, `web/` DTO grep 0건. **§6 Q6 과 충돌** |
| 마감 잠금 배지 / 잠금 배너 | `:3657-3661` / `:4138-4148` | `lockFlag` grep 0건 ⚠️ | DB 컬럼 부재 |
| SSE 결정 토스트 · 삭제 요청 배너 · 반려 사유 카드 | `:4012-4056` / `:4065-4135`+`:5005` / `:4860-4891` | 각 grep 0건 ⚠️ | **승인 요청·상태 전이 도메인 자체가 없음** |
| 삭제 품목 경고 | `:4150-4154` | product presence 조회 미수행 ⚠️ | BE 조회 경로 추가 |
| 배송·정산 정보 (V20) | `:4234-4293` (8항목) | 배송주소만 흡수 ⚠️`:1080` | 8 중 7 이 DB 컬럼 부재. `bizCode` 만 이미 내려옴 |
| 기사 정보 + 인라인 편집 | `:4300-4410` (PATCH `/slips/{id}/driver`) | `driverName` grep 0건 ⚠️ | 마이그레이션 |
| 결재 정보 카드 | `:4684-4712` | `결재` grep 0건 ⚠️ | 🚩 **판매전표 쪽도 "담당부서"가 `services/` 전체 grep 0건이라 항상 `'-'`** ⚠️ — 이식 시 함께 정리 |
| 전자서명 카드 + 무효화 모달 | `:4720-4793` / `:4799-4855` | grep 0건 ⚠️ | 🚩 **판매전표 쪽도 `SlipDetailResponse.java` 에 signature 컴포넌트 0건**(⚠️ `dispatcherSignedAt`/`inspectorSignedAt` 뿐) ⟹ `GET /slips/{id}` 만으로 안 채워짐. **양쪽 BE 작업 필요** |
| 하단 액션 툴바 (`.slip-detail-footer-actions`) | `:4930-4988` (복사/취소/협업수정/완료) | 없음(전부 상단) ⚠️ | 상태 전이 도메인 부재 |
| 레드라인 | ✅ **`renderRedlineCell` 18곳** + `GET /slips/{id}/redline` | `redline` grep 0건(FE·BE) ⚠️ | **유일하게 BE 엔드포인트 자체가 없음 — 신규 개발** |
| AuditOverlay (메모/배송지) | `:4194-4225` | grep 0건 ⚠️ | 컴포넌트는 도메인 무관이라 재사용 가능 ⚠️. **단 #1134 가 같은 좌표를 예약** — §6 Q7 |

### 3-2. 주문서에만 있음 (= 유지/삭제 결정 대상)

| 섹션 | 주문서 근거 | 판단 |
|---|---|---|
| `SalesSubNav` | ⚠️`:724` | 판매 서브트리 탭 — 유지 |
| 판매전표 전환 모달 | ⚠️`:1661-1827` (6열 표) | 도메인 고유 — 유지 |
| 보류 / 보류 해제 | ⚠️`:763-784` | 도메인 고유 — 유지 |
| 참조 조회 모달 | ⚠️`:1839-1842`, 권한 게이트 ✅`:1269` | 유지 |
| 전표발행 상태 배지 | ⚠️`:854-862` / `:1056-1064` | 유지 |
| 데스크톱 헤더 합계 | ⚠️`:1067` | §6 Q3 |
| 모바일 `MobileCollapsible` | ✅`:1020-1045` | 판매전표는 같은 항목을 데스크톱 카드가 모바일에서 재사용 + 빈 행 숨김 ⟹ **정렬 대상** |
| 라인 모바일 액션 바 | ✅`:1249-1277` | 판매전표는 데스크톱 툴바를 모바일에도 그대로 노출 ⚠️ ⟹ 정렬 방향 결정 필요 |

### 3-3. 레이아웃 계보 (시각 차이의 1차 요인)

- 판매전표: DS `Card`(padding4/shadow sm) + `.detail-grid`(⚠️`global.css:515`) + `.detail-label`/`.detail-value` **텍스트**
- 주문서: `styles.card`(⚠️`sales.module.css:156`, GAS 종합견적서 이식) + `styles.formGrid` + 값이 **readOnly `<Input>`** ⚠️`:1073-1099`
- ⚠️ 주문서 파일에서 `detail-grid`/`detail-label`/`detail-value`/DS `Card` 사용 **0건**
- 🚩 ⚠️ `sales.module.css:7` 이 "DS 컴포넌트 import 금지"를 명문화했으나 실제로는 Badge/Button/Input/Modal/Select/WarehouseAutocomplete 를 쓰고 있어 **결정문과 코드가 어긋남**
- 🚩 ⚠️ `docs/qa/mobile-s4c-detail-responsive/README.md:14` 이 "주문서 상세 | `.detail-grid`" 라고 적었으나 **현 코드와 반대** — 그 문서를 근거로 삼은 후속 작업이 있으면 함께 정정

---

## 4. BE 변경 필요 / UI 만으로 되는 것

### 4-A. UI 만으로 되는 것 (BE·FE 타입 모두 준비됨) — ✅ 재현

| 항목 | BE | FE 타입/매퍼 | 주의 |
|---|---|---|---|
| **공급가액** | `PartnerOrderDetailResponse.java:151` | `sales.ts:473`, 매퍼 `:622` | ⚠️ **legacy NULL** — `V12__add_partner_order_line_supply_vat.sql` 원문: *"기존 주문은 소급 재계산하지 않는다. 두 컬럼은 nullable legacy snapshot으로 남긴다."* ✅ |
| **부가세** | `:152` | `sales.ts:475`, `:623` | 위와 동일 |
| **VAT포함 합계** | `:153 lineTotal` | `sales.ts:477`, `:624` | `subtotal` 과 동일 값 |
| 금액 권위 `authority` | `:154` | — | 표시 여부는 별개 판단 |
| 라인 비고 `remark` | `:155` | `sales.ts:626` | 읽기 표 미노출 (수정 모달에만) |
| 구분 `categoryKey` | `:147` | `sales.ts:618` | 읽기 표 미노출 (수정 모달에만) |
| 품목 유형 `productType` | `:158` | — | 현재 BUNDLE 제외 판정에만 사용 |
| 사업자번호 `bizCode` | `:26` | — | 현재 PUT 본문 전용 ⚠️`:1432` |

🚨 **공급가액·부가세 이식 시 결정적 함정 (PM 이 이 세션에서 발견 — 어느 조사도 지적하지 않음)**
판매전표의 `slipLineAmounts`(✅ `SlipDetailPage.tsx:231-248`)를 **그대로 재사용하면 금액이 틀립니다**. 이 함수는 `supplyAmount` 가 null 일 때 **`lineTotal` 을 공급가액(VAT 제외)으로 간주**합니다(`:232`). 그런데 주문서의 `lineTotal` 은 **VAT 포함 값**입니다(✅ `PartnerOrderLine.java:252-255` `getLineTotal(){ return this.subtotal; }`, javadoc `:252` *"주문의 VAT 포함 lineTotal은 기존 subtotal의 의미를 그대로 노출한다"*). ⟹ legacy 행(supply/vat NULL)에 이 폴백을 쓰면 **공급가액이 10% 과대·부가세가 11% 과대**로 표시됩니다. **폴백 로직은 재사용이 아니라 신규 작성**이어야 합니다.

### 4-B. BE DTO 만 고치면 되는 것 (마이그레이션 불필요) — ⚠️ 적대검증 보고, 미재현

| 항목 | 근거 | 비고 |
|---|---|---|
| 거래처명 `partnerName` | ✅ `PartnerOrderDetailResponse.java:78` **null 리터럴** | `PartnerOrder.partnerId` 로 partner-service lookup 가능. 현재 FE 는 `partnerName ?? partnerCode` 폴백. **legacy 주문(partnerId=null) 비율 미측정** |
| 작성일 `createdAt` | 목록 DTO 에는 있고(⚠️`PartnerOrderSummaryResponse.java:18,:62`) 상세 DTO 에 컴포넌트 없음 | 레거시 "주문일자" 대응 |
| 수정 횟수 `revisionCount` | ⚠️`PartnerOrder.java:132` 존재, `web/` DTO grep 0건 | **§6 Q6 과 충돌** |
| 낙관적 잠금 `lockVersion` | ⚠️`PartnerOrder.java:114-115` 존재, DTO 미노출 | 판매전표는 노출(`SlipDetailResponse.java:95`) |

### 4-C. 마이그레이션 필요 (partner-order-service grep 0건) — ⚠️

`specification`(규격) · `deliveryTag` · `lockFlag` · `printedAt` · `supervisionAddress` · `projectName` · `recipientPhone` · `paymentDueDate` · `driverName` · `inspectionStatus`
추가로 ⚠️: `unloadDate` · `deliveryScheduleLabel` · `shippingAddress`(`deliveryAddress` 와 별개 축) · `inspectionAddress` · `receiverPhone` · 거래처 snapshot 3종 · `discountInfo` · `collectTerm` · `agreeTerm` · 창고 3종 · 결재 8종.
그리고 **영구 `'-'` 4종**(✅): `bundleMode`(`:191` null) · `expandedComponents`(`:193` `List.of()`) · `siteAddress`(`:86` null) · `contactPhone`(`:87` null).

> ⚠️ **재현 함정 — 브리핑에 grep 원문을 반드시 남길 것.** `specification`·`redline` 0건은 **대소문자 구분 시에만 참**입니다. `grep -ri` 로 돌리면 `Specification`(JPA) 16건 · `capturedLines` 5건이 오탐으로 나옵니다.

🚨 **마이그레이션 슬롯** (✅ PM 재현): partner-order-service 최고 = **V18**(`V18__soft_delete_test_seed_orders.sql`), **V16 은 결번**(V15→V17). 열린 PR 중 partner-order-service 마이그레이션 예약 **0건** ⚠️. ⟹ **V19 부터** 쓰고 **V16 을 채우지 마십시오**(적용된 DB 는 V16 을 건너뛴 상태라 낮은 슬롯은 적용 안 되고 부팅만 막습니다 — #1057 계열).

### 4-D. BE 자체가 없음 — 신규 개발

- **레드라인**: `partner-order-service` 전체 `grep redline` **0건** ⚠️. `getRedline` 은 `/api/v1/slips/{id}/redline` 하드코딩(⚠️`slipRedline.ts:29`). 판매전표 쪽 적용은 ✅ **18곳**.
- **전자서명**: ⚠️ 판매전표 BE 도 미완(`SlipDetailResponse.java` signature 컴포넌트 0건) ⟹ **양쪽 BE 작업**.

---

## 5. 슬라이스 제안

> 🚨 **전제**: 이 저장소는 넓은 변경에서 반복 실패했습니다. 아래는 **전부 주문서 편도**(`SalesPartnerOrderDetailPage.tsx` + `partner-order-service` 만 편집)로 잡았습니다. 그래야 ⚠️#1131(`SlipDetailPage.tsx` 편집 중) · ⚠️#1134(같은 파일 `:4199,:4217` AuditOverlay 예약)와 **파일 충돌 0** 으로 병렬 유지됩니다.

### S1 — 읽기 라인 표 **라벨·포맷** 정렬 (UI only, 파일 1개)
- **무엇**: `납품가` → `단가(VAT포함)`(`:1178`), `소계` → `합계(VAT포함)`(`:1179`), 수량에 `toLocaleString` 적용(`:1214`). 모바일 카드의 같은 라벨(⚠️`:1330` 계열)도 함께.
- **왜 그 경계**: BE 무변경 · 파일 1개 · 순서 변경 없음 ⟹ **§6 Q1 결정을 기다리지 않고 지금 실행 가능한 유일한 조각**. 수량 포맷은 같은 화면 안(데스크톱 원시값 ↔ 모바일 `toLocaleString`)의 **자기모순 해소**라 방향 논쟁이 없습니다.
- **회귀 위험**: 라벨 문자열로 셀렉트하는 e2e/spec. **RED-A** = 데스크톱·모바일 두 표면이 같은 라벨/포맷을 낸다, **RED-B** = 금액 값 자체는 변하지 않는다(라벨만 바뀌었는데 값이 바뀌면 폴백을 건드린 것).
- **선행 조건**: 없음.

### S2 — 읽기 라인 표에 **공급가액·부가세** 열 추가 (UI only + null 정책)
- **무엇**: `:1179`(소계) 뒤가 아니라 판매전표 순서대로 **단가 → 공급가액 → 부가세 → 합계** 로 배치. 값은 `line.supplyAmount`/`line.vatAmount`(FE 매퍼 `sales.ts:622-623` 이미 매핑됨).
- **왜 그 경계**: BE·FE 타입이 이미 준비돼 있어 **마이그레이션 0** 인 유일한 열 추가. 열 2개로 좁혀야 §4-A 의 폴백 함정을 한 라운드에서 닫을 수 있습니다.
- **회귀 위험**: 🚨 **legacy NULL 행**. `V12` 원문이 "소급 재계산하지 않는다"(✅) ⟹ 기존 주문 라인은 두 컬럼이 NULL 입니다. 판매전표 `slipLineAmounts`(`:231-248`)를 **복사하면 금액이 틀립니다**(§4-A 참조 — 주문서 `lineTotal` 은 VAT 포함). **RED-A** = 신규 행에서 S+V=T 가 성립, **RED-B** = legacy NULL 행에서 화면이 `'-'` 를 내고 **역산으로 숫자를 지어내지 않는다**.
- **선행 조건**: 🚨 **실 DB 에서 `supply_amount IS NULL` 행 비율 카운트**(집/회사 PC 데이터가 다르므로 그 PC 에서). 표본 0 이면 "결함 0" 이 아니라 "판정 불가" 입니다. + §6 Q4 (NULL 표시 정책).

### S3 — **영구 `'-'` 열/필드** 처리 (범위는 §6 Q2 결정에 종속)
- **무엇**: `묶음 처리`(`:1182,1227-1233`) · `구성품 펼침`(`:1183,1234-1242`) · 데스크톱 `현장`(⚠️`:1085`) · `연락처`(⚠️`:1089`) · 모바일 같은 2항목(✅`:1029-1031`).
- **왜 그 경계**: 이 4개는 **데이터가 아니라 코드가 원인**(✅ BE `:191` `null` / `:193` `List.of()` / `:86` / `:87` 리터럴)이라 QA 로 절대 재현되지 않고, 남겨 두면 **다음 라운드가 매번 "값이 안 뜬다"로 다시 발견합니다**. "지운다"로 결정되면 UI only · 파일 1개로 가장 싼 슬라이스입니다.
- **회귀 위험**: 열 index 로 단언하는 테스트. 지우면 표가 10열 → 8열. ⚠️ 부수로 `잔여` 가 `converted===0` 일 때 `'-'` 인 문제(✅`:1225`)도 같은 표면이라 같이 볼 것.
- **선행 조건**: **§6 Q2 결정**(지운다 / 마이그레이션으로 채운다 / 현상 유지).

### S4 — **BE DTO 노출 4종** + 헤더 "수정 N회" (마이그레이션 불필요)
- **무엇**: `partnerName`(✅`:78` null) · `createdAt` · `revisionCount` · `lockVersion` 을 상세 DTO 에 추가하고, 헤더에 판매전표식 "수정 {N}회" 배지(⚠️`SlipDetailPage.tsx:3639-3655`)를 붙임.
- **왜 그 경계**: 이 4개는 **엔티티에 이미 컬럼이 있고 DTO 만 비어 있는** 동질 계열이라 한 번에 닫는 것이 싸고, 마이그레이션이 없어 다른 트랙을 막지 않습니다.
- **회귀 위험**: 🚨 `@JsonInclude` 계약 테스트가 존재(⚠️ `sp-08-4-2-…spec.ts:30` `expect(dto).not.toContain('@JsonInclude')`) — DTO 를 건드리면 이 spec 를 반드시 함께 실행. 그리고 **"수정 N회"는 §6 Q6 이 풀리기 전엔 착수 금지**.
- **선행 조건**: **§6 Q6**(#31 이력 일원화 결정과의 충돌).

### S5 — **규격(specification) 1열**만 마이그레이션 (V19)
- **무엇**: `partner_order_lines.specification` 컬럼 + 엔티티 + DTO + 읽기 표 5번째 열.
- **왜 그 경계**: §4-C 의 마이그레이션 대상 10여 종 중 **읽기 라인 표 열 정렬에 직접 걸리는 것은 규격 하나뿐**입니다. 나머지(기사·V20·결재)는 라인 표가 아니라 **별개 섹션**이라 같은 슬라이스에 넣을 이유가 없습니다. 마이그레이션 1개짜리 슬라이스로 잘라야 다른 트랙 배포를 막지 않습니다.
- **회귀 위험**: 🚨 **다른 트랙 전체 정지 위험** — 스키마 변경은 이미지 롤백으로 안 돌아옵니다. `DROP` 은 없지만 Hibernate validate 가 붙으므로 **배포 순서와 되돌릴 계획을 PR 에 기록**. **V16 결번을 채우지 말 것**(✅ V15→V17). 착수 시점에 **① 서비스 최고(V18) ② DB 적용 최고 ③ 열린 PR 예약분** 셋을 다시 세십시오.
- **선행 조건**: 채워 넣을 경로 확인 — **컬럼을 만들어도 값이 들어오는 경로가 있어야** 합니다(⚠️ 레거시 전송 경로가 `{ lines }` 만 보낸다는 조사 5 보고 참조 → §6 Q8).

### S6 — **CSS 계보 통일** (별도 트랙 권고 — 이번 범위에서 뺄 것)
- **무엇**: 주문서 카드/그리드를 DS `Card` + `.detail-grid` 로.
- **왜 분리**: ✅ `sales.module.css` 를 import 하는 **프로덕션 파일이 8개**(SalesSubNav `:18` · MergeConvertDialog `:62` · EstimateListPage `:40` · EstimatePricingConfigPage `:25` · SalesOrderApprovalsPage `:35` · SalesPartnerDcConfigPage `:36` · SalesPartnerOrderDetailPage `:40` · SalesPartnerOrderListPage `:38`) 이고, ⚠️ CSS 를 `vi.mock` 하는 테스트가 4곳 더 있습니다. 주문서만 바꾸면 **같은 탭 안에서 두 계보가 섞입니다**. 이건 "주문서를 판매전표에 맞추기"가 아니라 **판매 서브트리 리팩터링**입니다.
- **선행 조건**: §6 Q5.

### 이번 범위에서 **빼야 하는 것** (근거와 함께)
- **레드라인**(BE 엔드포인트 없음, 적용 ✅18곳) · **전자서명**(양쪽 BE 미완) · **ProgressBar**(상태 enum 이 다름) · **결재/기사/V20**(마이그레이션 8~10종) · **삭제요청·반려·SSE 토스트**(승인 워크플로 도메인 자체 부재). 각각 **별개 이슈**로, 지금 열지 마십시오.
- **판매전표 쪽을 고치는 안 전부**(열 순서 뒤집기 · 데스크톱 총액 신설 · 하단 툴바 등) — ⚠️ 즉시 #1131 과 하드 충돌, #1134 까지 겹치면 3중 충돌.

---

## 6. 개발책임자 확인이 필요한 것

| # | 질문 | 선택지와 대가 |
|---|---|---|
| **Q1** 🚨 | **열 순서를 어느 쪽으로 통일합니까** — ✅ 판매전표 읽기표는 **모델명→품목명**(`:4536,4537`), 주문서는 **품목명→모델명**(`:1175,1176`). 그런데 ✅ **판매전표 자신의 수정 폼은 품목→모델**(`:3139,3140`)이라 "판매전표에 맞춘다"만으로는 답이 안 정해집니다 | **A. 모델→품목**(판매전표 읽기표 기준): 주문서 2열 교체 = UI only, 파일 1개. 대가 = 판매전표 수정 폼과 여전히 반대 · 열 index 단언 테스트 수정 / **B. 품목→모델**(주문서 기준): 주문서 무변경, 대신 판매전표 읽기표를 뒤집어야 함 ⟹ ⚠️ **#1131 하드 충돌 · 트랙 직렬화** / **C. 안 맞춘다**: 비용 0, 대가 = "같은 항목"이라는 목표를 포기 |
| **Q2** 🚨 | **주문서 전용 4열을 유지합니까 버립니까** — `전환됨`·`잔여`는 부분전환 도메인 고유라 계승 대상 아님. `묶음 처리`·`구성품 펼침`은 ✅ BE 가 리터럴 `null`/`List.of()`(`:191,:193`)라 **어떤 데이터로도 안 뜸** | **A. 열 삭제**: UI only, 가장 쌈. 대가 = 향후 기능 추가 시 되살려야 함 / **B. 마이그레이션으로 채움**: V19+, 컬럼 2종+구성품 테이블. 대가 = 슬라이스가 커지고 다른 트랙 배포를 막음 / **C. 현상 유지**: 대가 = **매 라운드마다 "값이 안 뜬다"로 재발견됨**(이미 조사 2가 발견) |
| **Q3** | **총액 축을 어느 쪽에 맞춥니까** — ✅ 판매전표 데스크톱에 총액 표시 지점 **없음**(`tfoot` 0건, 모바일 요약만), 주문서는 데스크톱 헤더에 합계 ⚠️`:1067` | **A. 주문서에서 뺀다**: UI only, 주문서 편도. 대가 = 사용자가 보던 정보 제거 / **B. 판매전표에 추가**: ⚠️ #1131 충돌 / **C. 그대로**: 두 화면이 계속 다름 |
| **Q4** | **legacy NULL 금액을 화면에 어떻게 표시합니까** — ✅ `V12` 가 소급 재계산을 안 해 기존 주문 라인의 공급가액/부가세가 NULL | **A. `'-'` 표시**: 정직. 대가 = 오래된 주문에서 열 2개가 비어 보임 / **B. 화면에서 역산**: 🚨 대가 = 판매전표 폴백을 복사하면 **금액 10% 오류**(§4-A) · "단가는 결코 역산되지 않는다"(2026-07-25 결정)와 충돌 / **C. 백필 마이그레이션**: 대가 = 무결성 도메인 변경 ⟹ **별도 선확인 대상** |
| **Q5** | **범위가 주문서 상세 하나입니까, 판매 서브트리 전체입니까** — ✅ `sales.module.css` 프로덕션 importer **8개** + 테스트 mock 4곳 ⚠️ | **A. 주문서만**: 파일 충돌 0, 병렬 유지. 대가 = 같은 탭 안에 두 계보 공존 / **B. 서브트리 전체**: 대가 = 8파일 + mock 4개 동시 변경 = 이 저장소가 반복 실패한 크기 |
| **Q6** 🚨 | **"수정 N회" 이식이 기존 결정과 정면 충돌합니다** — ✅ `sp-08-4-2-partner-order-edit-put.spec.ts:73,74` 가 `not.toContain('partner-order-edit-audit-timeline')` · `not.toContain('partnerOrderAuditApi')` 를 **단언**하고, 주석 `:63` 이 *"#31 이력 일원화(2026-07-06) — PO 상세 인라인 수정 이력은 제거되고 `PartnerOrderVersionHistoryPanel`(revisions API)로 일원화됐다"* 고 기록 | **A. revisions API 로 카운트만 센다**: 계약 유지. 대가 = 추가 호출 1회 / **B. #31 결정을 뒤집는다**: 🚨 CI red 이전에 **⚠️#1134 트랙 전체(나머지 18개 표면의 이력 일원화)의 전제를 무너뜨림** ⟹ PM 자율 범위 밖 / **C. 안 이식한다** |
| **Q7** 🚨 | **AuditOverlay 좌표를 ⚠️#1134 가 먼저 예약했습니다** — 그 트랙 정찰 문서가 스스로 *"#1131 … 직접 충돌, 고위험"*, *"가장 위험한 표면은 `SlipDetailPage`"* 라 적었고 슬라이스 2 대상이 `SlipDetailPage.tsx:4199,4217` = 차이 표의 AuditOverlay 행(`:4194-4225`)과 같은 자리 ⚠️ | **A. 우리는 주문서 편도 동결 + #1134 를 기다린다**(권고) / **B. 직렬화**: #1131 → #1134 S2 → 우리 |
| **Q8** | **레거시 미계승 3건(결제예정·인수자·주문일자)을 이번에 채웁니까** — ⚠️ 조사 5 는 컬럼뿐 아니라 **전송 경로가 값을 아예 안 보낸다**고 보고(`samhanApi.ts:381` 이 `{ lines }` 만, `ConfirmRequest.java:15-17` 이 lines+deliveryAddress 만 수신). 이 세션에서 **미재현** | **A. 범위 밖**: 권고 — 컬럼을 만들어도 채워질 경로가 없음 / **B. 포함**: 대가 = FE order-app + BE 계약 + 마이그레이션 3층 동시 변경, ⚠️#1126 이 같은 파일(`samhanApi.ts`)을 편집 중이라 리베이스 순서 의존 |
| **Q9** | **모바일 "빈 값" 처리를 어느 쪽으로 맞춥니까** — ✅ 판매전표는 빈 값 **행 자체를 숨김**(`global.css:626-628`), 주문서는 `'-'` 로 **남김**(`:1033`) | **A. 판매전표식(숨김)**: 주문서 모바일에서 현장·연락처(영구 `'-'`)가 사라져 화면이 깨끗해짐. 대가 = 항목 자체가 안 보여 "빠진 것"으로 오인 가능 / **B. 주문서식 유지** |

---

## 7. 🚩 근거 부족 / 미확정 — **확정하지 마십시오**

이 세션에서 재현하지 못했거나 조사 간 어긋남이 남은 항목입니다.

1. ⚠️ **열린 트랙 충돌 판정 전체**(#1131·#1134·#1126·#1159 의 diff 내용, 정찰 문서 인용)는 적대검증 3의 보고이며, PM 이 이 세션에서 재현한 것은 **#1131 의 `SlipDetailPage.tsx` +82/-8 · 5,383→5,457줄 · `col-model` 4536→4610(+74)** 뿐입니다. 나머지는 브리핑 전에 재확인하십시오.
2. ⚠️ **판매전표 수정 표면 조건부 표시물 6종**(최근단가 배너 등) — 적대검증 1 보고, 미재현.
3. ⚠️ **`setHead`/`parentSetModel`/`setOptions` 의 FE 소비 지점**(`SlipDetailPage.tsx:535,555-560`) — BE 필드 존재는 ✅ 확인(`SlipLineResponse.java:51,56,57`), FE 배선은 미재현.
4. ⚠️ **레거시 전송 경로가 값을 안 보낸다**(조사 5) — 이 세션에서 `samhanApi.ts:381` / `ConfirmRequest.java` 를 열지 않았습니다. Q8 판단 전 재확인 필요.
5. 🚩 **"판매전표 28개 섹션"** — ✅ 재현 실패. 최상위 자식 **24개**, `sectionDiffs` **38행**. 28 의 출처 불명 ⟹ **인용 금지**.
6. 🚩 **`partnerName` legacy NULL 비율 미측정** — "`partnerId` 로 lookup 하면 채워진다"는 주장은 `partnerId` 가 채워진 행에만 참입니다. 🚨 **조회 키로 쓰는 코드 컬럼이 비어 있는 사고가 이 저장소에서 하루 3회 난 적이 있습니다** — S4 착수 전 `partner_id IS NULL` 비율을 세십시오.
7. ⚠️ **QA 발화 조건 카운트 전무** — 위 슬라이스 어느 것도 "이 화면에 그 조건을 만족하는 주문이 몇 건인가"를 세지 않았습니다. **표본 0 = 결함 0 이 아니라 판정 불가** 입니다. 특히 S2(legacy NULL 행)·S3(전환 이력 있는 라인)는 그 PC 에서 카운트가 선행돼야 합니다.
8. ⚠️ **라벨 띄어쓰기 원문 불일치** — 차이 표 산문이 `인수자번호`·`인쇄여부`·`검수상태`·`배송태그`·`거래처코드`·`연결전표` 로 적었으나 실제 소스는 `인수자 번호`(`:4258`)·`인쇄 여부`·`검수 상태`·`배송 태그`·`거래처 코드`(`:1072`)·`연결 전표` 입니다. **이 문자열로 grep/단언을 짜면 헛칩니다**(표 컬럼 라벨 자체는 정확).
9. 🚨 **브리핑 시 경로 병기 필수** — ⚠️#1159 가 지우는 `routes/accounting/admin/OrderDetailPage.tsx`(`/accounting/admin/orders/:orderNo`, 사이드바 "주문서 관리 (이관)")도 한국어 이름이 **"주문서 상세"** 입니다. 경로 없이 "주문서 상세"라고만 쓰면 **삭제 중인 파일을 대상으로 지목할 수 있습니다**. 항상 **`/sales/partner-orders/:id` · `SalesPartnerOrderDetailPage.tsx`** 를 병기하십시오.