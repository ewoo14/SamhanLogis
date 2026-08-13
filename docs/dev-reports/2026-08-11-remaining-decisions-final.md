# 잔여 결정 최종 정리 — 유실 0 반영

> 작성 기준: 2026-08-11 KST  
> 역할: CODEX SOL 5.6 · 결정 상정안 정리자  
> 조사 범위: 저장소·GitHub Issue/코멘트 읽기, 공유 DB `BEGIN TRANSACTION READ ONLY` 조회만 수행  
> 금지사항 준수: 코드·스키마·Git·공유 DB write·실행 서비스 변경 없음

## 1. 결론 — A 1건 · B 4건 · C 3건

| 분류 | 건수 | 항목 |
|---|---:|---|
| **A 개발책임자 결정 필요** | **1** | 8. 입출고 예측 계산식 |
| **B 기존 이슈로 귀속** | **4** | 2. 정책군 → #896 OPEN · 3. 고정가/fixedDC → #874 CLOSED 회귀 · 5. 미배차/문자 → #1013 CLOSED 회귀 · 6. 내일자 전표 → #1014 CLOSED 회귀 |
| **C 결정 불요** | **3** | 4. 장기미발주 · 7. 전용 OCR fallback · 9. 교육 상태/Sheet |
| **합계** | **8** | §2의 실제 행 2~9 |

### 분모 정정

요청 제목의 “잔여 9건”과 달리 정본 `docs/dev-reports/2026-08-11-gas-sweep-devlead-decisions.md` §2에는 **2번부터 9번까지 8행**만 있다. 이미 확정된 D-G1~D-G4와 V37 기본구성품 72세트를 제외한 뒤 남는 실제 분모도 8이다. 존재하지 않는 아홉 번째 선택지는 만들지 않았다.

### 상정에서 빼는 이유 요약

- 유실 전수조사는 `257 = 대체 132 + 불필요 116 + D-G1 8 + 보류 1`, 신규 유실 **0건**으로 끝났다.
- 보류 1건이던 교육 상태는 #827 CLOSED 코멘트의 개발책임자 결정, 즉 “교육안내 폐기, 이슈도 만들지 않음”으로 이미 해소돼 있었다.
- `fixedDC=0`, 지방·야적 태그, 장기미발주 축은 기존 개발책임자 결정이 이미 정본이다. 현행 코드 차이는 새 정책 선택이 아니라 기존 이슈 회귀다.

---

## 2. A — 개발책임자께 올릴 선택지 1건

### A-1. 입출고 예측: 전년 데이터가 없을 때 무엇을 표시할 것인가

#### 실측 후 남은 진짜 선택

현행식은 `현재연도 출고량 / 전년도 같은 월 출고량` 비율을 전년도 미래 월에 곱한다. 공유 DB의 확정 출고는 2026년 **28문서 · 73행 · 수량 368**이지만 2025년 출고행은 **0**이다. 따라서 현행식은 비율을 1로 두고 2026년 9~12월을 전부 **0대**로 예측한다.

즉 “예측 기능을 둘 것인가”는 이미 #1012 CLOSED에서 끝났다. 남은 선택은 **전년 결측을 0수요로 표시할지, 숫자를 보류할지, 당해 run-rate로 대신할지**다.

#### 선택지

1. **권장 — 전년 비교자료가 0이면 `예측 산출 불가`로 표시하고, 자료가 생긴 뒤 현행 전년동기비 식을 사용한다.**

   - 실행안: 비교 대상 월의 전년도 합계가 0이면 수치 예측을 만들지 않고 “전년 자료 없음”을 표시한다. 전년도 합계가 양수일 때만 현재 식을 실행한다.
   - 대가: 지금 당장은 9~12월에 쓸 구매 수량 숫자를 제공하지 못한다. 담당자가 별도 판단해야 한다.
   - 예: 현재 DB는 2026년 1·2·3·8월 출고가 각각 27·268·64·9대, 2025년은 0대다. 이 안이면 화면에 `9~12월 예측 산출 불가 — 2025년 비교자료 없음`이 보이고, `0대`는 보이지 않는다.

2. **당해 run-rate로 대체한다.**

   - 실행안: 전년 자료가 없으면 `당해 누계 / 경과 월수`를 남은 월에 동일 적용한다. 현재는 368대 ÷ 8개월 = 월 **46대**다.
   - 대가: 계절성과 월별 편차를 버린다. 2월 268대와 8월 9대가 같은 평균에 섞여 9~12월 모두 46대로 표시된다.
   - 예: 9월 실수요가 10대여도 화면은 46대를 제안한다. 단가 100만원 품목으로 읽으면 운영자가 최대 3,600만원어치를 과다 발주 판단할 수 있지만, 시스템이 자동 발주하거나 금액을 저장하지는 않는다.

3. **현행 레거시 식을 그대로 유지한다.**

   - 실행안: 전년도 합계가 0이면 비율 1, 전년도 미래 월 수량 0을 그대로 사용한다.
   - 대가: “데이터 없음”과 “수요 0”을 구분하지 못한다. 예측 숫자는 나오지만 정보성이 없다.
   - 예: 2026년 8월까지 368대가 출고됐어도 2025년 9~12월 행이 없으므로 화면의 2026년 9·10·11·12월 예측이 모두 `0대`가 된다.

---

## 3. 8개 항목 상세

### 2. 용량·조합률·금지조합·최대연결·추천·분기관 정책군

**분류: B — #896 OPEN으로 귀속. 개발책임자 신규 결정 목록에서 제외.**

1. **existing_file**

   - `clients/web/estimate-app/views/index.ejs:4888-4978` — HOME 용량 합, AJ025 금지조합, 최대 실내기, 추천 실외기, 130%.
   - `clients/web/estimate-app/views/index.ejs:4982-5064` — COMM 용량 합, 부족 분기관, 최대 실내기, 추천 실외기, 103/120%.
   - `clients/web/estimate-app/views/index.ejs:12924-12997` — 분기관 6경계와 마지막 분기관 실외기 용량 강제.
   - `clients/web/order-app/index.html:3154-3224`, `:7169-7251` — 주문 앱의 조합률과 분기관 계산.

2. **existing_issue**

   - **#896 OPEN** — 하드코딩 수량·조건·용량구간·부속 모델 매핑을 설정으로 전환하는 에픽. #976을 합쳐 “메뉴에서 편집 가능”으로 범위를 확정했다.

3. **prior_decision**

   - 개발책임자는 수량 동기화를 “설정값이 정함 · 조건 5가지만 · 수동값 잠금 · 시트가 수동수정을 덮지 않음”으로 이미 확정했다.
   - #896 코멘트는 견적/주문의 각 현행 결과를 먼저 golden으로 고정하고, 설정 evaluator·shadow diff·cutover에서 차이를 처리하도록 확정했다.

4. **semantic_delta**

   - 원래 업무 임계값 자체는 이미 존재한다. 새로 제안된 차이는 **업무 의미가 아니라 하드코딩 값을 운영 설정으로 바꾸고 두 앱을 수렴시키는 것**이다.
   - 재현: 견적 앱은 AJ025 단독 + AJ072/AM072/AM083을 `조합 불가`로 만들고 최대 실내기도 검사하지만, 주문 앱의 `updateHomeRatio()`는 130%만 검사한다. 이 앱 간 차이를 어느 시점에 어떻게 cutover할지는 이미 #896의 shadow diff 범위다.

5. **발화 조건 카운트**

   - 활성 노출행: HOME_MULTI **123**, COMMERCIAL_MULTI **416**, 합계 **539행**.
   - 추천 lookup **32행**, 분기관 lookup **6행**.
   - 저장 전표에서는 ESTIMATE/ORDER/OUTBOUND `slip_lines` **774행·403문서가 모두 `category_key=NULL`**이라, 실제로 HOME/COMM 정책이 발화한 문서 수는 **판정 불가**다.

6. **금액에 닿는가**

   - **예.** 추천·금지·최대연결·분기관 결과가 선택 품목과 수량을 바꿔 견적·주문 합계에 간접 반영된다. #896도 금액 회귀 0원을 게이트로 둔다.

### 3. 상업 받침대 고정가와 `fixedDC=0`의 의미

**분류: B — #874 CLOSED 계약의 회귀로 귀속. 신규 선택지에서 제외.**

1. **existing_file**

   - `clients/web/estimate-app/views/index.ejs:2433-2441` — 할인 비대상은 시트 납품가 고정.
   - `clients/web/estimate-app/views/index.ejs:3130-3143`, `clients/web/order-app/index.html:1556-1573` — 빈값만 `null`, 숫자 0은 유효한 0으로 파싱.
   - `clients/web/order-app/index.html:2854-2862` — `fixedDc ?? globalRate`; 0도 고정DC로 우선한다.
   - `clients/desktop/src/renderer/utils/slipDiscount.ts:71-90` — `fixed > 0`만 고정DC로 인정해 0이면 전역DC로 내려가는 회귀.

2. **existing_issue**

   - **#874 CLOSED** — PR #1057에서 고정DC 우선·전역DC 반영·화면 단가 저장 계약을 완료했다.
   - 인접 이슈 **#1090 OPEN**은 정액 6종 모델코드 판별 축이며 `fixed_discount_rate=0`의 null 의미를 고르는 이슈는 아니다.

3. **prior_decision**

   - `.claude/memory/feedback_dc_terminology.md:16,28,33-42`: `fixed_discount_rate=null`만 전역DC 영향 품목이고, **“품목 고정DC가 당연히 우선”**, 정본 표현은 `fixedDc ?? globalRate`로 확정돼 있다.
   - 따라서 0과 미설정은 이미 `0` 대 `null`로 구분됐다. 다시 묻지 않는다.

4. **semantic_delta**

   - 웹/기존 결정: `fixedDC=0`은 명시적 **0% 할인**, 즉 정가.
   - 데스크톱: `fixed > 0` 가드 때문에 0을 미설정처럼 보고 전역DC를 적용한다.
   - 재현: `ADP-E075SEK3D` 정가 60,544원·fixedDC 0·전역DC 45%이면 웹 정본은 **60,544원**, 데스크톱은 **33,299원**, 1대당 **27,245원 차이**다. 이는 선택할 정책이 아니라 #874 계약 위반이다.
   - 상업 고정가 받침대 4종은 `has_variable_discount=false`, `fixed_discount_rate=null`, `delivery_price=160,000~330,000원`으로 별도 고정가 데이터가 이미 있다.

5. **발화 조건 카운트**

   - 활성 `fixed_discount_rate=0`: **6품목**.
   - 상업 고정가 받침대: **4품목**(`GHP방진가대`, `방진가대S2대/소/중`).
   - 위 10품목과 일치하는 현재 `slip_lines`: **0행·0문서 — 판정 불가**. 실제 금액 충돌 사례는 아직 DB에 없다.

6. **금액에 닿는가**

   - **예.** 0을 정가로 볼지 전역DC로 볼지에 따라 위 예시처럼 단가가 직접 달라진다.

### 4. 장기미발주 판정축 전환 (#1015)

**분류: C — 이미 주문·출고 활동 30일로 구현돼 의미 차이 없음.**

1. **existing_file**

   - `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:68-104` — 로그인/비밀번호가 아닌 주문·출고 활동 기준 30일.
   - `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java:37-80` — 주문·출고 최근 활동, 복구시각, 생성시각의 최댓값 + 30일.
   - `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:250,280` — 화면도 “주문·출고 활동 없음 30일”로 표시.

2. **existing_issue**

   - **#1015 CLOSED** — PR #1060 머지 완료.

3. **prior_decision**

   - #1015 초기 코멘트의 “로그인·비밀번호 기준, 전환 보류”는 PR #1060 전 기록이다. 이후 코드·화면·테스트가 주문·출고 기준으로 전환돼 종료됐다.

4. **semantic_delta**

   - **0.** 요청한 축과 현재 축이 동일하다. 외부 활동 조회 실패도 “활동 없음”으로 단정하지 않고 보류한다(`PartnerAccessPolicy:12-19,37-42`).

5. **발화 조건 카운트**

   - 활성 로컬 인증 거래처 **2건**, 둘 다 `NEED_PW_INPUT`이라 판정 대상이다.
   - 2026-08-11 기준 주문·출고 활동이 없고 생성일이 30일을 넘은 후보는 **1건**(사업자번호는 사용자 보고서에 비공개). 나머지 1건은 생성 후 30일 미만이다.

6. **금액에 닿는가**

   - **아니오.** 주문서 앱 접근 상태만 바꾸며 단가·수량·세액을 계산하지 않는다.

### 5. 미배차 상태·배차안내 문자 정본

**분류: B — #1013 CLOSED 완전계승 계약의 회귀 점검으로 귀속. 신규 정책 선택지에서 제외.**

1. **existing_file**

   - `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/SlipDispatchStatus.java:9-20` — 미배차/발송대기/배차완료 lifecycle.
   - `.claude/memory/feedback_region_is_a_tag_not_address_prefix.md:10-47` 및 `DeliveryTag.java` — 지방·야적은 주소 문자열이 아니라 REGION/STACK 태그.
   - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchMessageGroupComposer.java:11-86` — 단톡방 우선, 없으면 인수자 전화번호, 하차일별 문구 정본.
   - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskBoardQueryService.java:50-84` — 검수 완료 + UNDISPATCHED 배차 대기 조회.

2. **existing_issue**

   - **#1013 CLOSED** — 배차안내문자 완전계승, PR #1059 머지.
   - **#1039 CLOSED** — 가배차·지방가배차 후속 완주.

3. **prior_decision**

   - 개발책임자 정정: 지방·야적은 주소 접두가 아니라 **배송 태그**다. 따라서 레거시의 `지방미배차`·`야적미배차` 문자열을 새 상태 enum으로 다시 만드는 안은 이미 기각된 방식이다.
   - 배차안내문자는 자동 발송이 아니라 표시·편집·복사로 확정됐고, 현재 composer가 단톡방/전화번호/하차일 순서를 보존한다.

4. **semantic_delta**

   - 문자 조합 의미 차이는 없다.
   - 상태 표현은 레거시 5문자열(`미배차/야적미배차/지방미배차/보류/해당없음`)에서 현대의 **lifecycle + delivery_tag** 두 축으로 정규화됐다. REGION/STACK은 같은 의미다.
   - 남은 회귀 점검점은 LOGEN·경동·반납 같은 비배차 태그가 향후 `COMPLETED + 검수완료`가 됐을 때 보드에서 자동 제외되는지다. 현재 조회식에는 태그 제외가 없으므로 새 업무결정이 아니라 #1013 완전계승 acceptance gap이다.

5. **발화 조건 카운트**

   - 현재 배차보드 전체 기간 자격행 **10건**, 기본 조회일(2026-08-10~12) **3건**.
   - 그중 LOGEN·경동·반납 태그 충돌은 **0건 — 판정 불가**. 전체 출고에는 해당 태그가 23건 있으나 현재 검수완료 보드 자격을 충족하지 않는다.
   - 배차문자 저장이력은 **4건**이다.

6. **금액에 닿는가**

   - **아니오.** 배차 대기 분류와 안내문구·수신 그룹만 바꾸며 전표 금액은 수정하지 않는다.

### 6. 내일자 전표의 허용창고·금지거래처·배송 캘린더

**분류: B — #1014 CLOSED의 완전계승 회귀로 귀속. 신규 결정 목록에서 제외.**

1. **existing_file**

   - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/NextDaySlipImageService.java:63-117` — 다음날 전표 조회, 차단 거래처 표시, 지역 그룹.
   - `clients/desktop/src/renderer/api/nextDaySlipApi.ts:130-172` — `blocked=true` 자동 제외.
   - `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/schedule/DeliverySchedule.java:39-91` — REGION/STACK 익일, 일요일 회피, STACK 토요일 예외.

2. **existing_issue**

   - **#1014 CLOSED** — 내일자 전표를 포함한 문서 자동저장·이력 계열 완전계승.

3. **prior_decision**

   - #1014가 완전계승으로 닫혔고, 발송금지는 `blocked_partners`, 지방·야적 일정은 구조화 태그/하차일로 쓰는 것이 기존 정본이다.
   - 따라서 초월/상일 허용창고와 차단 거래처의 레거시 집합을 유지할지 다시 묻는 것이 아니라, 닫힌 이슈의 acceptance를 검사해야 한다.

4. **semantic_delta**

   - 금지거래처와 배송 캘린더는 현대 구조로 같은 의미를 보존한다.
   - 허용창고는 차이가 있다. 레거시는 초월·상일만 포함하지만 현재 `NextDaySlipImageService:68`은 날짜만으로 전표를 읽고 창고를 필터링하지 않는다. 재현은 제3창고의 다음날 OUTBOUND를 조회했을 때 현행 응답에는 포함되고 레거시에는 빠지는 경우다.
   - 이것은 정책 선택이 아니라 “완전계승” #1014의 회귀다.

5. **발화 조건 카운트**

   - 2026-08-12 다음날 OUTBOUND **0건**, 허용창고 일치 **0건**, 레거시 금지코드 일치 **0건 — 판정 불가**.
   - 활성 `blocked_partners`도 **0건 — 판정 불가**.
   - 일정 규칙의 누적 대상은 REGION **8건**(8건 모두 하차일 있음), STACK **14건**(4건 하차일 있음)이다. 과거 데이터 backfill 차이는 별도 회귀 근거다.

6. **금액에 닿는가**

   - **아니오.** 문서 포함/제외와 배송일 표시만 바꾸며 라인 금액을 계산하지 않는다.

### 7. 에어디자이너·제이시스템 전용 fallback의 영구성

**분류: C — OCR 입력 기능 자체가 개발책임자 결정으로 폐기돼 현재 영구성 선택이 성립하지 않음.**

1. **existing_file**

   - **없음**(`grep: AirDesignerOrderParser|JSystemOrderParser|detectOptionsFromRawName_|capQtyToOrder_` in `clients services shared`; production parser 0건).
   - 폐기 근거 파일: `docs/superpowers/plans/2026-06-28-remove-ocr-menus.md:3-18`, `services/auth-service/src/main/resources/db/migration/V76__remove_ocr_page_permissions.sql:1-11`.

2. **existing_issue**

   - **#827 CLOSED** — GAS 전수 점검에서 OCR을 명시적으로 제외.
   - **#977 CLOSED** — 전용 GAS 원본 재대조 조사. 현행 구현 소유 이슈는 없다.

3. **prior_decision**

   - 개발책임자 2026-06-28 결정: 영수증 OCR과 발주서 업로드 OCR을 모두 삭제하고, 추후 GAS 직접 주문서 전송으로 대체한다.

4. **semantic_delta**

   - 현재 실행 경로가 없으므로 “fallback을 영구화할지”의 비교 대상도 없다.
   - 향후 GAS-direct가 이 parser를 재사용하기로 결정될 때만 다시 판단한다. 그때는 신규 입력 계약의 하위 설계이지 지금의 잔여 결정이 아니다.

5. **발화 조건 카운트**

   - 전체 공유 DB에서 `education|training|notion|ocr|vendor_order` 이름 테이블 **0개**, 현행 OCR parser 입력행 **0건 — 판정 불가**.

6. **금액에 닿는가**

   - **예(폐기된 레거시 경로 기준).** 에어디자이너는 할인율 fallback 47%, 제이시스템은 `AXJ-YA1509N` 45,000원 고정가를 사용했다(`에어디자이너 전용 주문서 인식/Code.js:328`, `제이시스템 전용 주문서 인식/Code.js:492`). 다만 현재 실행 경로는 없다.

### 8. 입출고 예측 계산식

**분류: A — 계산식의 결측 처리만 개발책임자 결정 필요. 선택지는 §2 A-1.**

1. **existing_file**

   - `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts:86-117` — 현행 전년동기비 예측식.
   - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/InOutAnalysisService.java:33-60,79-83` — 확정 INBOUND/OUTBOUND 월별 수량 원천.

2. **existing_issue**

   - **#1012 CLOSED** — 입출고 내역·분석 완전계승, PR #1047 머지.

3. **prior_decision**

   - #1012에서 예측 기능의 존폐와 레거시 계산식 이식은 끝났다.
   - 이번 PM 정정대로 질문은 “예측을 만들지”가 아니라 **전년 자료가 없을 때 계산식을 어떻게 처리할지**다. 이 부분의 후속 결정은 없다.

4. **semantic_delta**

   - 현행은 전년 합계 0이면 `forecastRate=1`로 두고, 전년도 미래 월 0에 곱해 모두 0을 낸다.
   - 변경안의 차이는 결측을 `0수요`, `산출 불가`, `당해 run-rate` 중 무엇으로 해석하는지다. 이는 화면에서 재현 가능하고 결과 수량이 달라진다.

5. **발화 조건 카운트**

   - 확정 OUTBOUND **28문서·73행·368대**, 월별 2026-01 27대 · 02 268대 · 03 64대 · 08 9대.
   - 2025 비교행 **0건**이므로 전년동기비의 유효 비교 모집단은 **0 — 현 계산 정확도는 판정 불가**.
   - 현행식의 실제 화면 결과는 9~12월 각 0대다.

6. **금액에 닿는가**

   - **아니오.** 현재 예측은 조회·추천 표시만 하며 구매전표나 발주 금액을 자동 생성하지 않는다. 다만 사람의 구매 판단에는 간접 영향을 준다.

### 9. 교육 상태·담당자별 Sheet 배포 존폐

**분류: C — 개발책임자가 이미 폐기함. 다시 묻지 않음.**

1. **existing_file**

   - **없음**(`grep: checkAndUpdateNotion|등록마감일|신청불가|문자발송내역|안내문자발송|교육 상태` in `clients services shared`; 0건).

2. **existing_issue**

   - **#827 CLOSED** — 구현 이슈를 만들지 않고 폐기한 결정이 코멘트에 기록돼 있다.

3. **prior_decision**

   - #827 종료 코멘트: “폐기 3건(거래처 업데이트 14 · **교육안내 10** · 비밀번호 일괄 암호화 6)은 이슈를 만들지 않았습니다.”
   - `.claude/memory/project_sp_08_legacy_gas_parity.md:45`의 “검토 대기”는 이보다 앞선 기록이므로 #827의 후행 결정이 우선한다.

4. **semantic_delta**

   - 없음. 미구현이 아니라 **폐기 결정의 결과로 코드가 없는 것**이다. 담당자별 Sheet 배포도 폐기된 교육안내 흐름의 transport이므로 별도 존폐 질문을 만들 이유가 없다.

5. **발화 조건 카운트**

   - 전체 공유 DB에서 education/training/notion 이름 테이블 **0개**, 직접 적용행 **0건 — 판정 불가**.

6. **금액에 닿는가**

   - **아니오.** 등록 가능 상태와 문자 발송 상태만 다루며 금액 필드를 읽거나 쓰지 않는다.

---

## 4. 개발책임자께 올릴 최종 한 문장

> 잔여라고 적힌 것은 실제 8건이며, 신규 유실은 0건입니다. 기존 결정·이슈로 7건을 제외하고, **입출고 예측에서 전년 자료가 0일 때 (권장) `산출 불가`로 표시할지 / 당해 run-rate를 쓸지 / 현행 0 예측을 유지할지** 한 건만 결정 부탁드립니다.

## 5. 조회 재현 메모

- GitHub Issue는 반드시 `--state all` 범위로 확인했다: #827, #874, #896, #977, #1012, #1013, #1014, #1015, #1039, #1090.
- 공유 DB 조회는 매 호출을 `BEGIN TRANSACTION READ ONLY; ... COMMIT;`으로 감쌌다.
- 0행은 결함 없음으로 해석하지 않고 모두 **판정 불가**로 표기했다.
- DB 수치는 2026-08-11 조회 시점 snapshot이다.
