# 수량 동기화 **초기값** 전수 추출 — 레거시 GAS 기준

> 개발책임자: *"레거시 및 구글 시트의 내용을 보고 해당 **초기값 설정** 요망."* / *"전수조사 요청. 단 **데이터가 많으므로 많이 나눠서** 조사가 필요."*

> 워크플로우 13에이전트 · 계열별 **8조각** 병렬 수집 → 병합 → 적대검증 3각도 → 세팅 계획


여덟 조각을 공통 자(한 계열 = source 모집합·target 품목군·지배 옵션축이 같은 업무 관계 하나)로 재계수해 **72계열**로 병합했습니다(인벤토리 45 와 차이 +27 — 사유는 아래). 별도로 계열이 아닌 **서버·데스크톱 변형층 9건**을 함께 냅니다.

【기준】 워크트리 D:/dev/Samhan-Public/.claude/worktrees/wmain. 조각들은 origin/main HEAD **22427d9c6** 에서 돌았고, 제가 병합·재확인한 시점 HEAD 는 **d1ea74c51**(clean, 코드 변경 없음 — memory 커밋 1건 추가). 인벤토리 문서는 **다른 기준**입니다 — 문서 3줄이 스스로 `0be8ecd8d`(브랜치 `feat/896-qty-sync-chip-track`)라 적었고, 그래서 조각들이 "`public/quantitySync.js` 가 main 에 없다" 고 보고한 것이 **정확**합니다(증거 무결성 정정 — 브리핑 함정 ①의 좌표는 그 브랜치에서만 재현됨).
【DB 실측】 docker exec samhan-postgres psql -U samhan -d product_db, **2026-08-10 14:45~14:47 KST**(회사PC). quantity_sync_rule/source/target **전부 0행** — 아직 세팅된 규칙이 하나도 없습니다.

【45 와 다른 이유 — 세 가지】
① **입도**: 인벤토리는 판넬·리모컨·펌프·받침대를 **함수 단위**로 셌고(상업 12 · 홈 13/16), 상세 조각들은 자의 문면대로 **source 버킷 단위**로 셌습니다. 스키마상 규칙 1행은 source 목록 하나 + target 하나이므로 **초기값 세팅에는 버킷 단위가 맞습니다**. 버킷으로 세면 홈 판넬 12 · 상업 판넬 15 · 상업 펌프 6 · 상업 받침대/발통 7 로, 이것만으로 +30 이상 벌어집니다.
② **인벤토리가 세지 않은 계열**: 상업 ECO 일자발(SI-AL600a/700a) · 상업 세트 BOM(COMM_PARTS) · 비상품 운임/절삭 · AUTO_CUTOFF · **역방향(세트 구성품→본체, 집계가 SUM 아닌 MAX)** — 문서 §8 이 "데스크톱 표면은 계열 단위로 세지 않았다"고 스스로 적어 둔 공백입니다.
③ **인벤토리 표(37/30)와 조각 실측이 애초에 다름**: 조각 실측은 estimate 홈 29 · order 홈 26 로 표의 13/16 보다 훨씬 큽니다. 45 는 두 수집본을 화해시킨 추정치였고, 이번 전수와는 자가 아니라 **수집 깊이**가 다릅니다.
※ 반대로 골든 케이스 ID 수준(H-01~08 · C-01~09 · S-01~03)으로 세면 **약 22** 입니다. 세 숫자(22 / 45 / 72)는 전부 같은 표면의 다른 입도이며, **세팅 작업 단위는 72** 입니다.

【세팅 가능성 총평】 72계열 중 **옵션축이 없는 것은 17계열뿐**입니다(상업 펌프 6 · 필터 2 · T형 분기관 1 · ACL-KORGHP07 1 · 싱글 실링펌프 1 · 상업 세트 BOM 1 · 분기배지 1 · 비상품 3 · 역방향 1). 나머지 55계열은 전부 옵션 지배를 받고, 평가기가 없습니다(`optionEquals|optionIn` 단어경계 grep → clients/ **0건**, O-싱글상업이 단어경계 없는 grep 의 8건이 전부 `optionInput` 류 오탐임을 밝혀냈습니다 — 결론은 같고 재현 명령만 바로잡습니다). 게다가 소비기 자체가 **origin/main 의 estimate-app 에는 없고**(quantitySync grep 0건), order-app 은 S-03 한 계열만 · 그것도 shadow(console.info)입니다. ⟹ **지금 72계열 중 실제로 화면 수량을 바꿀 수 있는 것은 0개**입니다.

【가장 위험한 발견 — 조각 간 오판 정정】 E-잔여·E-분기관발통이 "상업 카탈로그에 유연호스 0건 · 리모컨은 AWR-VH12N 뿐 · SINGLE_SET 에 발통세트/유선보드 없음" 이라 판정했는데, 이는 `products.product_category` 컬럼으로 센 것입니다. 실제 카탈로그 API 는 **`product_estimate_exposure` M:N 조인**입니다(ProductRepository.java:279-292 `findExposedCatalog` · EstimateCatalogInternalController.java:245-247). 제가 그 쿼리로 다시 재니(14:45 KST) FH-LFHLF·FH-LFHLN·FH-LFHIF 와 AWR-WE13N·AWR-WG00N·AR-CH01·AR-EH05·AR-KH05·AIM-A01N 이 **COMMERCIAL_MULTI 노출에 전부 존재**하고, 발통세트·SI-AL700a·AIM-A01N·ADP-F075SP 는 **SINGLE_SET 노출에 전부 존재**합니다. ⟹ E-호스·E-리모컨·O-싱글상업이 맞고, **E-잔여의 "target 미해소" 8건 중 6건과 E-분기관발통의 3건은 오류**입니다. 살아남은 것은 홈멀티 FOOT_FLAT(SI-AL700a 가 HOME_MULTI 노출에 없음 — SI-AL600A 만 있음)과 아래 unit 게이트 두 건입니다.


---

## 규칙 전수 (82건)


| 계열 | source | target | 계산 | 옵션축 | 앱 | 지금 세팅 |
|---|---|---|---|---|---|---|
| [홈] 1WAY 실내기 → 유연호스 1WAY군 (L형↔I형 대체) | HOMEMULTI 중 /(실내기/벽걸이)/ ∧ !/벽걸이/ ∧ /1\s*-?\s*way/ — 실측 34모델(AJ012BN1PBC2·AJ016BN1PBC2·AJ020BN1PBC2·AJ020BN1PBC1·AJ023BN1PBC1·AJ032BN1PBC1·AJ040BN1PBC1·AJ052BN1PBC1·AJ060BN1PBC1·AJ072BN1PBC1·AJ012MB1PBC2·AJ016MB1PBC2·AJ020MB1PBC2·AJ020MB1PBC1·AJ023MB1PBC1·AJ032MB1PBC1·AJ040MB1PBC1·AJ052MB1PBC1·AJ060M | FH-LFHLF(유연호스 L형 1WAY) ↔ FH-LFHIF(유연호스 I형). 한쪽에 넣고 반대쪽을 0 으로 미는 대체 관계 | 합 ×1, REPLACE. 배수·나눗셈·올림·상한 없음 | #home_no_hose=false ∧ (#home_hose_i / CONFIG.showIHose 가 L↔I 를 가름) | estimate, order | **옵션 평가기 필요** |
| [홈] 4WAY+360 실내기 → 유연호스 L형 4WAY | AM052BN4DBH1·AM060BN4DBH1·AM072BN4DBH1·AM083BN4DBH1·AM052NN4DBH1·AM060NN4DBH1·AM072NN4DBH1·AM083NN4DBH1(4WAY 8) + AM052BN6PBH1·AM060BN6PBH1·AM072BN6PBH1·AM083BN6PBH1·AM052KN4PBH1·AM060KN4PBH1·AM072KN4PBH1·AM083KN4PBH1(360 8) = 16 | FH-LFHLN (유연호스 L형 4WAY) | (4WAY 합 + 360 합) ×1, REPLACE | #home_no_hose=false 만. I형 옵션과 무관 — HOSE_I_4W 가 카탈로그에 없어 항상 L형 | estimate, order | **옵션 평가기 필요** |
| [홈] 잔여 실내기 차감식 → Y형 분기관 AXJ-YA1509N | indoorCount(실측 56: 1WAY 34 + 4WAY 8 + 360 8 + 벽걸이 6) − 단배관 실외기 5(AJ025/030/040/050/060MXHNBC1) − AJ060MXHNBC1 | AXJ-YA1509N (Y형 실내기 분기관) | 🚩합산 아님 — b1509 = indoorCount − singleOutCount − sixHpSingleCount, 하한 Math.max(0,·), 게이트 `iCnt>=2 && sOut>0`(estimate) / `singleOutCount>0`(order). 코드 주석 원문 '엑셀 수식 적용' | #home_no_branch=false | estimate, order | **옵션 평가기 필요** |
| [홈] 6HP 단배관 실외기 → Y형 분기관 AXJ-YA2512N | AJ060MXHNBC1 (실외기_6HP 단배관) 1모델 | AXJ-YA2512N | 합 ×1 이지만 게이트가 **자기 source 가 아닌 다른 두 집합**(indoorCount·singleOutCount)에 걸려 있음, 하한 0 | #home_no_branch=false ∧ singleOutCount>0 | estimate, order | **옵션 평가기 필요** |
| [홈] 실외기 → 원형발통 세트 | HOMEMULTI 중 /실외기/ — 실측 10건(AJ025RXH3BC1·AJ025MXHNBC1·AJ030RXH4BC1·AJ030MXHNBC1·AJ040RXH4BC1·AJ040MXHNBC1·AJ050RXH5BC1·AJ050MXHNBC1·AJ060MXHNBC1 + 🚩부자재 SI-AL600A '실외기 일자발') | model_code `발통세트` (원형발통 세트 — 모델코드 자체가 한글) | 합 ×1. estimate `homeQty.set(FOOT_ROUND, want?outQ:0)` · order `if(total>0) set… else 0` | #home_foot=true (DB 기본값 estimate_configs.home_with_foot=false → 기본 상태에선 항상 0) | estimate, order | **옵션 평가기 필요** |
| [홈] 유연호스 I형 4WAY 강제 0 / 일자발 FOOT_FLAT 강제 0 (source 없음) | 없음 — 상수 대입 | FOOT_FLAT = HOMEMULTI.find(/SI-AL700a/i on model) → **빈 문자열**. HOME_MULTI 노출에 SI-AL700a 없음(SI-AL600A '실외기 일자발' 만 있음, 14:47 KST 실측) | 항상 0 (실행되지 않는 죽은 가지) | 없음 | estimate, order | **코드 특정 불가** |
| [홈] 에어콤보/전열교환기 → 유선리모컨(컬러) 에어콤보용 | AJ020FERPBC1·AJ020FERPBC2 (비스포크 AI 에어콤보 토출 우/좌). HOME_MULTI 노출에 '전열교환기' 품목은 0건 | AWR-WV00N | 합 ×1, 누적(+=), 하한 0 | #home_remote ≠ '제외' (기본·유선·컬러 전부에서 가산) | estimate, order | **옵션 평가기 필요** |
| [홈] 360CST 실내기 → 무선리모컨 🚨앱마다 다른 품목 | AM052BN6PBH1·AM060BN6PBH1·AM072BN6PBH1·AM083BN6PBH1·AM052KN4PBH1·AM060KN4PBH1·AM072KN4PBH1·AM083KN4PBH1 (8) | 🚨**estimate = AR-EC05**(무선리모컨(냉방전용)) / **order = AR-KH05**(무선리모컨(360cst용)). 둘 다 HOME_MULTI 노출에 실재 | 합 ×1, 누적(+=) | #home_remote='기본' | estimate, order | **판정 불가** |
| [홈] 인피니트 실내기 → 무선리모컨 인피니트(솔라셀) | AJ020CN1FBC1·AJ023CN1FBC1·AJ032CN1FBC1·AJ040CN1FBC1·AJ052CN1FBC1·AJ060CN1FBC1·AJ072CN1FBC1 + AJ020CN1UBC1·AJ023CN1UBC1·AJ032CN1UBC1·AJ040CN1UBC1·AJ052CN1UBC1·AJ060CN1UBC1·AJ072CN1UBC1 (14) | AR-CH01 | 합 ×1, 누적(+=) | #home_remote='기본' | estimate, order | **옵션 평가기 필요** |
| [홈] 1/4WAY 실내기 + 벽걸이 → 무선리모컨(냉방전용) | 1WAY 일반 20 + 4WAY 8 = 28 + 벽걸이 6(AM023TNVDBH1·AM032TNVDBH1·AM040TNVDBH1·AM052TNVDBH1·AM060TNVDBH1·AM083TNVDBH1) = 34 | AR-EC05 | 합 ×1, 누적(+=) | #home_remote='기본' | estimate, order | **옵션 평가기 필요** |
| [홈] 전 실내기 합 → 유선리모컨 본체 (통합↔컬러) | cntC+cntI+cntW+cntWall = 실측 56모델 (360 8 + 인피니트 14 + 1/4WAY 28 + 벽걸이 6). 에어콤보 제외 | AWR-WE13N(유선리모컨(통합)) ↔ AWR-WG00N(유선리모컨(컬러)) | 합 ×1, 누적(+=) | #home_remote ∈ {'유선','컬러'} — estimate 는 else 분기라 '기본'·'제외' 외 **모든 값**이 컬러로 떨어짐 | estimate, order | **옵션 평가기 필요** |
| [홈] 전 실내기 합 → 유선리모컨 키트 AIM-A01N | 위와 동일 56모델 (본체 리모컨과 1:1 동반) | AIM-A01N (유선리모컨 키트) | 합 ×1, 누적(+=) | #home_remote ∈ {'유선','컬러'}. '기본' 에서는 0 | estimate, order | **옵션 평가기 필요** |
| [홈] 1Way WIFI 소형 → 판넬 1way 소형군 | AJ012BN1PBC2, AJ016BN1PBC2, AJ020BN1PBC2 | PC1MWSK3NW (기본계) ↔ PC1MWCK3NW (공청계) | 합 ×1 | #home_panel — '판넬제외'면 0, '공청판넬'·'인피니트 공청+동작감지 AI' 면 공청계(useAir) | estimate, order | **옵션 평가기 필요** |
| [홈] 1Way WIFI 중형 → 판넬 1way 중형군 | AJ020BN1PBC1, AJ023BN1PBC1, AJ032BN1PBC1, AJ040BN1PBC1 | PC1NWSK3NW ↔ PC1NWCK3NW | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 1Way WIFI 대형 → 판넬 1way 대형군 | AJ052BN1PBC1, AJ060BN1PBC1, AJ072BN1PBC1 | PC1BWSK3NW ↔ PC1BWCK3NW | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 1Way 미내장 소형 → 판넬 1way 소형 미내장군 | AJ012MB1PBC2, AJ016MB1PBC2, AJ020MB1PBC2 | PC1MWSK3N ↔ PC1MWCK3N | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 1Way 미내장 중형 → 판넬 1way 중형 미내장군 | AJ020MB1PBC1, AJ023MB1PBC1, AJ032MB1PBC1, AJ040MB1PBC1 | PC1NWSK3N ↔ PC1NWCK3N | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 1Way 미내장 대형 → 판넬 1way 대형 미내장군 | AJ052MB1PBC1, AJ060MB1PBC1, AJ072MB1PBC1 | PC1BWSK3N ↔ PC1BWCK3N | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 4Way WIFI 실내기 → 판넬 4way WIFI군 | AM052BN4DBH1, AM060BN4DBH1, AM072BN4DBH1, AM083BN4DBH1 | PC4NUFK1NW ↔ PC4NUCK4NW (공청). 🚩상수가 아니라 pickPanelBy(kind,wifi,opt) 가 **런타임 이름 점수**로 고름 — 현 카탈로그 해소 결과가 PANEL_MODELS 와 일치함을 두 조각이 각각 확인 | 합 ×1 | #home_panel. wantAir 는 '공청판넬' 만 참 — '인피니트 공청+동작감지 AI' 는 4Way·360 을 **바꾸지 않음**(1Way 만 공청으로 감) | estimate, order | **옵션 평가기 필요** |
| [홈] 4Way 미내장 실내기 → 판넬 4way 미내장군 | AM052NN4DBH1, AM060NN4DBH1, AM072NN4DBH1, AM083NN4DBH1 | PC4NUFK1N ↔ PC4NUCK1N (공청) | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 360CST WIFI 실내기 → 판넬 360 WIFI군 | AM052BN6PBH1, AM060BN6PBH1, AM072BN6PBH1, AM083BN6PBH1 | PC6NUDK1NW ↔ PC6NUCK1NW (공청) | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 360CST 미내장 실내기 → 판넬 360 미내장군 | AM052KN4PBH1, AM060KN4PBH1, AM072KN4PBH1, AM083KN4PBH1 | PC6NUDK1N ↔ PC6NUCK1N (공청) | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 인피니트 중형 실내기 → 판넬 인피니트 중형군 | AJ020CN1FBC1, AJ023CN1FBC1, AJ032CN1FBC1, AJ040CN1FBC1, AJ020CN1UBC1, AJ023CN1UBC1, AJ032CN1UBC1, AJ040CN1UBC1 (8) | PC1YNWK1NW(기본·25년형 공통) / PC1YNCK1NW(공청) / PC1YNRK1NW(AI) | 합 ×1 | #home_panel | estimate, order | **옵션 평가기 필요** |
| [홈] 인피니트 대형 실내기 → 판넬 인피니트 대형군 | AJ052CN1FBC1, AJ060CN1FBC1, AJ072CN1FBC1, AJ052CN1UBC1, AJ060CN1UBC1, AJ072CN1UBC1 (6) | PC1ZNSK1NW(기본) / PC1ZNWK1NW(25년형) / PC1ZNCK1NW(공청) / PC1ZNRK1NW(AI) | 합 ×1 | #home_panel — '인피니트 25년형' 이 실제로 바꾸는 계열은 **이 하나뿐** | estimate, order | **옵션 평가기 필요** |
| [싱글] 세트(발통 대상) → 원형발통 세트 🚨앱마다 source 필터가 다름 | 🚨**estimate**: /운임/절삭/비용/설치비/ 제외 ∧ catL ∉ {부자재,실외기 받침,자재} ∧ **unit ∈ {SET,식}** ∧ AP230/AP290 아닌 것 / **order**: /운임/절삭/ 제외 ∧ AP230/AP290 아닌 것 (**catL·unit 게이트 없음**) | model_code `발통세트` — SINGLE_SET 노출에 실재(14:47 KST 재확인) | 합 ×1, 대입 | #ss_base=true (DB 기본 single_with_base=false) | estimate, order | **판정 불가** |
| [싱글] AP230/AP290 → 실외기 일자발 SI-AL700a | AP230DAPDHH1S, AP290DAPDHH1S (냉난방 프리미엄 스탠드 2모델) | SI-AL700a (실외기 일자발 (전면 8~12HP)) — SINGLE_SET 노출에 실재 | 합 ×1, 대입 | #ss_base=true | estimate, order | **판정 불가** |
| [싱글] 1Way 세트(리모컨 교체가능) → 유선리모컨 키트 AIM-A01N | is1WaySet_(세트명·모델·구성품에 /1\s*way/) ∧ allowRemoteChange_(기본 리모컨 구성품이 /^(AR-?EH05/AR-?EC05/AR-?KH05)$/) — estimate 실측 11세트(AC023CS1DBC1SY·AC023CS1PBH1SY·AC032CS1DBC1SY·AC032CS1PBH1SY·AC040CS1DBC1SY·AC040CS1PBH1SY·AC052CS1DBC1SY·AC052CS1PBH1SY·AC060CS1DBC1SY·AC060CS1PBH1SY·AC072CS1DBC1SY) | AIM-A01N — SINGLE_SET 노출에 실재(E-잔여의 'null' 판정은 오류) | 합 ×1, 대입(조건 미충족이면 0) | #ss_remote_ex=false ∧ #ss_remote ∈ {유선리모컨, 컬러유선리모컨} | estimate, order | **옵션 평가기 필요** |
| [싱글] 실링 세트 → 실링용 드레인펌프 ADP-F075SP | SINGLE_SETS 중 (name+' '+model) 에 /실링/ — estimate 실측 5건. 자기 자신·운임/절삭 제외 | ADP-F075SP (실링용 드레인펌프) — SINGLE_SET 노출에 실재 | 합 ×1, 대입. 서버 계약은 factor×multiplier=1 강제 | 없음 | estimate, order, server | **지금 세팅 가능** |
| [싱글] 세트 → 구성품 BOM 전개 (SINGLE_PARTS) | 각 싱글세트 (partsForSetStrict_ 가 비어 있지 않은 세트) | 그 세트의 구성품 전부. 발통(FOOT·/발통/·SI-AL700A)과 /유연호스 I형/운임/절삭/ 은 **항상 제외** · 판넬은 1개만 선택 · 리모컨은 옵션 집합 · 자재는 포함 시에만 | 🚩합산 아님 — 세트수량 × 구성품 정의수량(SINGLE_PARTS.qty / bundle_component.default_qty). 서버 실측 1,584행 전부 FOLLOW_SET·default_qty=1.00 | #ss_panel · #ss_p360 · #ss_remote · #ss_remote_ex · #ss_mat | estimate, order, server, desktop | **옵션 평가기 필요** |
| [상업] 2Way 실내기 → 판넬 PC2NWSK1N | AM052CN2DBH1, AM060CN2DBH1, AM072CN2DBH1 | PC2NWSK1N | 합 ×1, 누적(+=) | #comm_panel ≠ '판넬제외' (나머지 5값 전부 동일 결과) | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way WIFI내장 소형 → 판넬 | AM016BN1PBH2, AM020BN1PBH2 | PC1MWSK3NW ↔ PC1MWCK3NW(공청) | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way WIFI내장 중형 → 판넬 | AM020BN1PBH1, AM023BN1PBH1, AM032BN1PBH1, AM040BN1PBH1 | PC1NWSK3NW ↔ PC1NWCK3NW | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way WIFI내장 대형 → 판넬 | AM052BN1PBH1, AM060BN1PBH1, AM072BN1PBH1 | PC1BWSK3NW ↔ PC1BWCK3NW | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way 미내장 소형 → 판넬 | AM016MN1PBH2, AM020MN1PBH2 | PC1MWSK3N ↔ PC1MWCK3N | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way 미내장 중형 → 판넬 | AM020MN1PBH1, AM023MN1PBH1, AM032MN1PBH1, AM040MN1PBH1 | PC1NWSK3N ↔ PC1NWCK3N | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way 미내장 대형 → 판넬 | AM052MN1PBH1, AM060MN1PBH1, AM072MN1PBH1 | PC1BWSK3N ↔ PC1BWCK3N | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way 인피니트 중형 → 판넬 | AM020DN1UBH1, AM023DN1UBH1, AM032DN1UBH1, AM040DN1UBH1 | PC1YNWK1NW(기본·블랙·승강·**공청 포함**) / PC1YNRK1NW(동작감지) | 합 ×1, 누적 | #comm_panel — 🚩공청판넬이 여기선 기본과 동일(공청 분기 없음) | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way 인피니트 대형 → 판넬 | AM052DN1UBH1, AM060DN1UBH1, AM072DN1UBH1 | PC1ZNWK1NW / PC1ZNRK1NW(동작감지) | 합 ×1, 누적 | #comm_panel | estimate, order | **옵션 평가기 필요** |
| [상업] 4Way WIFI MINI → 판넬 PC4SUFK1NW | AM032BNNDBH1, AM040BNNDBH1, AM052BNNDBH1, AM060BNNDBH1 | PC4SUFK1NW (swap 미적용 — 6옵션값 전부 동일) | 합 ×1, 누적 | #comm_panel ≠ '판넬제외' | estimate, order | **옵션 평가기 필요** |
| [상업] 4Way WIFI 일반 → 판넬 🚨공청 코드가 앱마다 다르고 한쪽은 부재 | AM052BN4DBH1·AM060BN4DBH1·AM072BN4DBH1·AM083BN4DBH1·AM100BN4DBH1·AM110BN4DBH1·AM130BN4DBH1·AM145BN4DBH1·AM160BN4DBH1·AM170BN4DBH1 + UV-C 10종(AM052BN4UBH1…AM170BN4UBH1) = 20 | 기본/동작감지 PC4NUFK1NW · 블랙 PC4NBFK1NW · 승강 PC4NUXK1NW · 🚨공청: **estimate=PC4NUCK4NW(실재)** / **order=PC4NUCK1NW(카탈로그 0건)** | 합 ×1, 누적 (문자열 치환은 모델 선택용) | #comm_panel | estimate, order | **코드 특정 불가** |
| [상업] 4Way 미내장 MINI → 판넬 PC4SUFK1N | AM032NNNDBH1, AM040NNNDBH1, AM052NNNDBH1, AM060NNNDBH1 | PC4SUFK1N | 합 ×1, 누적 | #comm_panel ≠ '판넬제외' | estimate, order | **옵션 평가기 필요** |
| [상업] 4Way 미내장 일반 → 판넬 🚨공청 코드가 앱마다 다르고 한쪽은 부재 | AM052NN4DBH1, AM060NN4DBH1, AM072NN4DBH1, AM083NN4DBH1, AM100NN4DBH1, AM110NN4DBH1, AM130NN4DBH1, AM145NN4DBH1 (8) | 기본/동작감지 PC4NUFK1N · 블랙 PC4NBFK1N · 승강 PC4NUXK1N · 🚨공청: **estimate=PC4NUCK4N(카탈로그 0건)** / **order=PC4NUCK1N(실재)** | 합 ×1, 누적 | #comm_panel | estimate, order | **코드 특정 불가** |
| [상업] 360CST WIFI내장 → 판넬 (원형/사각 × 4옵션) | AM052BN6PBH1, AM060BN6PBH1, AM072BN6PBH1, AM083BN6PBH1, AM100BN6PBH1, AM110BN6PBH1, AM130BN6PBH1, AM145BN6PBH1 (8) | MAP360 8종 — 원형: PC6NUNK1NW(기본/동작감지)·PC6NBNK1NW(블랙)·PC6EUCK1NW(공청)·PC6EUXK1NW(승강) / 사각: PC6NUDK1NW·PC6NBDK1NW·PC6NUCK1NW·PC6NUXK1NW | 합 ×1, 누적 | #comm_panel × #comm_p360 (2축) | estimate, order | **옵션 평가기 필요** |
| [상업] 360CST 미내장 → 판넬 (원형/사각 × 4옵션) | AM052KN4PBH1, AM060KN4PBH1, AM072KN4PBH1, AM083KN4PBH1, AM100KN4PBH1, AM110KN4PBH1, AM130KN4PBH1, AM145KN4PBH1 (8) | MAP360 8종 — 원형: PC4NUNK1N·PC4NBNK1N·PC6EUCK1N·PC6EUXK1N / 사각: PC4NUDK1N·PC4NBDK1N·PC6NUCK1N·PC6NUXK1N | 합 ×1, 누적 | #comm_panel × #comm_p360 | estimate, order | **옵션 평가기 필요** |
| [상업] 1Way/2Way 실내기 → 유연호스 1WAY군 (L형↔I형) | isCommIndoorRow(model 이 AM…7번째 N) ∧ !/벽걸이/덕트/DUCT/실링/스탠드/ ∧ kind ∈ {1way,2way} — 실측 28모델(AM016BN1PBH2·AM016MN1PBH2·AM020BN1PBH1/2·AM020DN1UBH1·AM020MN1PBH1/2·AM023BN1PBH1·AM023DN1UBH1·AM023MN1PBH1·AM032·AM040·AM052(+AM052CN2DBH1)·AM060(+AM060CN2DBH1)·AM072(+AM072CN2DBH1) 계열) | FH-LFHLF ↔ FH-LFHIF — 🚩상수는 **HOMEMULTI** 이름 정규식으로 해석되지만 두 코드 모두 **COMMERCIAL_MULTI 노출에도 실재**(PM 14:45 KST 재확인 — E-잔여의 '상업에 유연호스 0건' 은 오류) | 합 ×1, 대입(누적 아님). 전 호스행 0 리셋 후 REPLACE | #comm_ex_hose=false ∧ (window.SHOW_I_HOSE ∨ #comm_hose_i) | estimate, order | **옵션 평가기 필요** |
| [상업] 360/4WAY/무구분 실내기 → 유연호스 L형 4WAY | isCommIndoorRow ∧ !/벽걸이/덕트/DUCT/실링/스탠드/ ∧ kind ∉ {1way,2way} — 실측 52모델(360 16 + 4way 36) | FH-LFHLN — COMMERCIAL_MULTI 노출 실재 | 합 ×1 (0 리셋 뒤 누적이라 실질 REPLACE) | #comm_ex_hose=false 만. I형 축과 무관(HOSE_I_4W='') | estimate, order | **옵션 평가기 필요** |
| [상업] 전열교환기 → 유선리모컨(ERV) AWR-VH12N | COMMULTI 중 /전열교환기/ — 실측 11건 | AWR-VH12N (리터럴 하드코딩, COMMERCIAL_MULTI 노출 실재) | 합 ×1, 누적(+=) | #comm_remote ≠ '제외' (옵션값과 무관하게 이 대상) | estimate, order | **옵션 평가기 필요** |
| [상업] 덕트 실내기 → 유선리모컨군 | 위 source 집합 중 /덕트/DUCT/ — 실측 20건 | AWR-WE13N(무선·유선) ↔ AWR-WG00N(컬러유선). 🚩덕트 분기가 옵션 분기보다 **먼저**라 '무선' 을 골라도 유선리모컨이 붙음 | 합 ×1, 누적 | #comm_remote ∈ {무선, 유선, 컬러유선} | estimate, order | **옵션 평가기 필요** |
| [상업] 일반 실내기(유선·컬러유선) → 유선리모컨군 | isCommIndoorRow ∧ !/전열교환기/ ∧ !/덕트/DUCT/ — 실측 93건 | AWR-WE13N(유선) ↔ AWR-WG00N(컬러유선) — 둘 다 COMMERCIAL_MULTI 노출 실재 | 합 ×1, 누적 | #comm_remote ∈ {유선, 컬러유선} | estimate, order | **옵션 평가기 필요** |
| [상업] UV-C·인피니트 실내기(무선) → AR-CH01 | 위 93건 중 /UV-?C/ 10건 + !/UV-?C/ ∧ /인피니트/ 7건 = 17 | AR-CH01 (무선리모컨 인피니트(솔라셀)) — COMMERCIAL_MULTI 노출 실재 | 합 ×1, 누적 | #comm_remote='무선' | estimate, order | **옵션 평가기 필요** |
| [상업] 그 외 실내기(무선, 360 포함) → AR-EH05 | 위 93건 중 !/UV-?C/ ∧ !/인피니트/ — 실측 76건(360CST 28 포함) | AR-EH05 (무선리모컨(냉난방전용)) — COMMERCIAL_MULTI 노출 실재 | 합 ×1, 누적 | #comm_remote='무선' | estimate, order | **옵션 평가기 필요** |
| [상업] 슬림덕트 실내기 → 드레인펌프 MDP-Z075SZED | AM052DNLDBH1, AM072DNLDBH1 | MDP-Z075SZED (DUCT 드레인펌프(슬림덕트)) | 합 ×1, 대입. 계산 후 펌프 입력행 수량을 0 으로 지우는 부수효과 있음(order :5771-5776) | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 슬림덕트 5.2~10kW → 드레인펌프 ADP-E075SEK3D | AM100FNLDBH1 | ADP-E075SEK3D | 합 ×1, 대입 | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 중정압 덕트 → 드레인펌프 MDP-M075SGK2D | AM130DNMDBH1, AM145DNMDBH1 | MDP-M075SGK2D | 합 ×1, 대입 | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 고정압 덕트 → 드레인펌프 ADP-G075SPK1D | AM083DNMDBH1, AM100DNMDBH1, AM110DNMDBH1, AM052ANHDBH1, AM060ANHDBH1, AM072ANHDBH1, AM083ANHDBH1, AM100ANHDBH1, AM110ANHDBH1, AM130ANHDBH1, AM145ANHDBH1, AM230ANHDBH1 (12) | ADP-G075SPK1D | 합 ×1, 대입 | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 고정압 29kW이상 → 드레인펌프 ADP-N047SNK1D | AM290HNHDBH1 | ADP-N047SNK1D | 합 ×1, 대입 | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 실링 실내기 → 실링용 드레인펌프 ADP-F075SP | AM072TNCDBH1, AM110TNCDBH1, AM130TNCDBH1, AM145TNCDBH1 | ADP-F075SP — 🚩SINGLE_SET·COMMERCIAL_MULTI 양쪽 노출 | 합 ×1, 대입 | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 실외기 HP구간 → 방진가대S2소 | chooseBaseModel: 프라임∧[8,10,12] · 한랭지∧[8,10,12] · 표준형∧[8,10,12,14] · 냉방전용 상부토출∧[8,10,12,14] · (프레스티지/동시냉난방/공장전원)∧[8,10,12]. 모델코드 열거를 **어느 조각도 하지 않음**(HP 토큰·이름 정규식 라우팅) | 방진가대S2소 — 이름 키워드를 modelByNameLike 로 해석(우연히 model_code 와 동일) | 합 ×1, 누적. 세트행이면 괄호 안 HP 조각 수만큼 반복 가산 | #comm_ex_base=false | estimate, order | **코드 특정 불가** |
| [상업] 실외기 HP구간 → 방진가대S2중 | 프라임∧[14,16,18,20] · 한랭지∧[14~24] · 표준형∧[16~28] · 상부토출∧[16~30] · 기타옵션∧[14,16,18,20] | 방진가대S2중 | 합 ×1, 누적 (세트는 HP 조각 수만큼) | #comm_ex_base=false | estimate, order | **코드 특정 불가** |
| [상업] 실외기 HP구간 → 방진가대S2대 | 프라임∧[22,24] · 표준형∧[30,32,34] · 상부토출∧[32,34] | 방진가대S2대 | 합 ×1, 누적 | #comm_ex_base=false | estimate, order | **코드 특정 불가** |
| [상업] 가스히트펌프 실외기 → GHP방진가대 | 실외기 이름에 /가스히트펌프/ — 실측 9건(O-싱글상업) | GHP방진가대 | 합 ×1, 누적 | #comm_ex_base=false | estimate, order | **코드 특정 불가** |
| [상업] 가스히트펌프 실외기 → ACL-KORGHP07 | 동일 (가스히트펌프 실외기) | ACL-KORGHP07 | 합 ×1, 누적 | 🚩없음 — '받침대 제외' 정규식 /방진가대/받침대/발통세트/일자발/SI-AL/ 에 안 걸려 **제외해도 살아남음** | estimate, order | **코드 특정 불가** |
| [상업] ECO 실외기 3.5·4·5·6HP → 실외기 일자발 SI-AL600a | 실외기 이름에 /\bECO\b/ ∧ HP ∈ {3.5,4,5,6} — 후보 상한 ECO 실외기 21~23건 중 12건 | SI-AL600a — **COMMERCIAL_MULTI 노출 실재**(PM 14:47 KST 재확인 — E-분기관발통의 '상업에 없음' 은 오류) | 합 ×1, 누적. 세트행은 HP 조각 수만큼 반복 | #comm_ex_base=false · COMM_MANUAL_BASE 수동잠금 | estimate, order | **코드 특정 불가** |
| [상업] ECO 실외기 7.5·8·10·12·14HP → 실외기 일자발 SI-AL700a | ECO 실외기 ∧ HP ∈ {7.5,8,10,12,14} — 9건 | SI-AL700a — COMMERCIAL_MULTI 노출 실재 | 합 ×1, 누적 | #comm_ex_base=false | estimate, order | **코드 특정 불가** |
| [상업] 세트 실외기 → T형 분기관 AXJ-TA3419M 🚨앱마다 게이트가 다름 | 🚨**estimate**: `String(r.unit).toUpperCase()==='SET'` **만** / **order**: `unit==='SET' // /\(.*\+.*\)/.test(name)` | AXJ-TA3419M (T형 분기관, 리터럴 하드코딩, COMMERCIAL_MULTI 실재). ※Y형 AXJ-YA3419M 과 다른 품목 | 🚩배수가 고정이 아님 — countBranchForSet = **품목 이름 괄호 안 '+' 개수** × 세트 수량 | 없음 | estimate, order | **판정 불가** |
| [상업] ECO 실외기 3종 → 리뉴얼 필터 AF-R09A | AM035FXMRHC1, AM050MXMRBC1, AM050FXMRHC1 | AF-R09A (ECO 리뉴얼 필터) | 합 ×1, 누적 | 없음 (COMM_MANUAL_BASE 수동잠금만) | estimate, order | **지금 세팅 가능** |
| [상업] ECO 실외기 → 리뉴얼 필터 AF-R12A | AM075FXMRHC1 | AF-R12A | 합 ×1, 누적 | 없음 | estimate, order | **지금 세팅 가능** |
| [상업] 세트 실외기 → 구성품 BOM 전개 (COMM_PARTS) | isCommSetRow(catL='실외기' ∧ unit='SET') | partsForCommSet_ 이 돌려주는 COMM_PARTS 구성품 전부 | 🚩세트수량 × 구성품 정의수량(합산 아님) | 없음 | estimate, order, server, desktop | **판정 불가** |
| [상업] 분기 보드 배지 → Y형 분기관 6종 🚩본체→부자재가 아님 | 🚩품목 수량이 아니라 **분기 도면의 `.code-cell` 배지 개수**. 코드 배정은 누적 용량 csum(codeByCumulativeSum: <150→1509, <406→2512, <464→2812, <696→2815, <986→3419, else 4119)과 실외기 HP 강제(codeByOutdoorHP), 첫 칸은 '-' | AXJ-YA1509N · AXJ-YA2512N · AXJ-YA2812M · AXJ-YA2815M · AXJ-YA3419M · AXJ-YA4119M (6종 전부 실재) | 배지 개수 + 사용자 수동 가산, 대입 | 없음 | estimate, order | **코드 특정 불가** |
| [비상품] 운임 — 금액 입력 시 수량 1 자동 🚩입력 방향이 반대 | 🚩없음 — 사용자가 단가 칸 전용 input 에 금액을 입력. 수량 칸은 `.qty-static` 읽기전용 | 운임 행 자기 자신 (model_code='운임', unit='EA', selling_price=0). 홈·싱글·상업·구형 네 탭 공통 | 금액≠0 → 수량 1 고정, 금액=0 → 수량 0. 합산·배수 개념 없음 | 없음. 입력 즉시 HOME_MANUAL_BRANCH/COMM_MANUAL_BASE 수동잠금 집합에 등록 | estimate | **코드 특정 불가** |
| [비상품] 절삭 — 금액 입력 시 수량 1 + 항상 음수 단가 | 없음 — 사용자 직접 금액 입력 | 절삭 행 자기 자신 (model_code='절삭') | `if (isCut && val !== 0) val = -Math.abs(val);` — 단가 항상 음수, 수량 1 고정. 총액을 깎음 | 없음 | estimate | **코드 특정 불가** |
| [비상품] 자동 절삭행 AUTO_CUTOFF 🚩source 가 총액 | 🚩품목 수량이 아니라 **견적 총액의 나머지** `rem = grandTotal % cutUnit` | ① 마지막 섹션부터 역순으로 qty===1 인 행의 단가에서 rem 차감 ② 없으면 '기타' 섹션에 절삭 행을 **새로 생성**(qty:1, price:-rem) | target.price -= rem. 수량은 항상 1 | 절삭 단위(cutUnit) 설정 시 | estimate | **코드 특정 불가** |
| [역방향] 세트 구성품 → 세트 본체 수량 🚩집계가 MAX | 🚩부자재→본체 **역방향**. 세트 구성품 수량 input(.part-qty-comm / .part-qty-single) | 해당 세트 **본체 행** (commQty/singleQty) | 🚨**합이 아니라 max** — `maxQty = Math.max(...pos)` (전부 음수면 `Math.min(...neg)`). 본체가 수동 입력 상태면 덮지 않음. 부수효과로 본체 단가도 `Math.round(sumSub/effQty)` 재계산 | 없음 (본체 수동 여부만 게이트) | estimate | **코드 특정 불가** |
| [변형층·계열 아님] 저장 시 구성품 수량 정수화 (HALF_UP + 하한 1) | BundleExpander 가 돌려준 구성품 라인 quantity(BigDecimal) | slip_line.quantity / estimate_line.quantity (int) | `setScale(0, HALF_UP).intValue()` 후 `if (q <= 0) q = 1` | 없음 | server, desktop | **판정 불가** |
| [변형층·계열 아님] order-app bootstrap 페이로드 정수화 | bundle_component.default_qty | order-app 컴포넌트 행 qty | null→1, 소수→HALF_UP 정수(경고 로그) | 없음 | server | **판정 불가** |
| [변형층·계열 아님] 세트 구성품 FIXED 모드 (세트수량 무관 고정) | BUNDLE 부모 (이 모드에서는 setQty 미사용) | qty_mode='FIXED' 인 bundle_component | qty = defaultQty | 없음 | server | **판정 불가** |
| [변형층·계열 아님] 구성품 링크 POST/PATCH — 수량 강제 1·FOLLOW_SET 리셋 | 구성품 편집 화면의 부모 지정 요청(수량 필드 없음) | bundle_component 행 | `changeAttributes(BigDecimal.ONE, FOLLOW_SET, …, null, false, null)` — 🚩기존 default_qty·variant·is_default·spec 을 **무조건 1/null/false/null 로 덮어씀** | 없음 | server | **판정 불가** |
| [변형층·계열 아님] quantity_sync_rule 저장 계약 — 평가기 부재 | quantity_sync_source (factor ∈ (0,1000], 소수 4자리) | quantity_sync_target (multiplier ∈ (0,1000], rounding ∈ {NONE, FLOOR}, display_order ≥ 1) | 의미 = Σ(source × factor) → aggregation='SUM' → × multiplier → rounding. 🚨**서버에 이 식을 실행하는 evaluator 가 없음** | condition_json — 저장 허용 연산자 optionEquals·optionIn·all·any·not. **option key 화이트리스트 없음**(키 계약 미확정) | server | **판정 불가** |
| [변형층·계열 아님] S-03 shadow 계약 — factor×multiplier=1 강제 | rule_key='SINGLE_S03_CEILING_DRAIN_PUMP' 의 source | target 정확히 1개 강제 | `factor.multiply(multiplier) != 1` 이면 거부. FLOOR 아니면 소수 계수 거부 | 없음 — order-app 이 조건 있는 규칙을 아예 거부 | server, order | **판정 불가** |
| [변형층·계열 아님] 데스크톱 — 사용자 수정 수량이 서버 계산을 이긴다 | 서버 전개 수량 + 사용자 override | 화면·저장 최종 quantity | `effectiveQuantity = override?.quantity ?? quantity` | 없음 | desktop | **판정 불가** |
| [변형층·계열 아님] 데스크톱 mock — remoteExcluded 가 실외기를 제거 | mock 카탈로그 세트 구성품 | mock 응답 라인 | `quantity = qtyMode==='FOLLOW_SET' ? defaultQty*quantity : defaultQty` | 🚨`if (componentKind === 'OUTDOOR' && remoteExcluded) return false` — **서버에는 없는 규칙** | desktop | **판정 불가** |
| [변형층·계열 아님] 데스크톱 재전개가 setOptions 를 보내지 않음 | 데스크톱 전표 화면의 재전개 요청 | 서버 전개 결과(옵션 미적용) | — | 서버 기본옵션(기본 패널·리모컨 유지·자재 제외·360=원형)으로만 전개 | desktop | **판정 불가** |

---

## 🚨 앱 간 충돌 (정본을 정해야 세팅 가능)

- 🚨【1위 · 싱글 발통 source 필터】 estimate 는 `if (unit !== 'SET' && unit !== '식') return;` 와 `catL ∈ {부자재,실외기 받침,자재}` 제외 게이트를 갖고(index.ejs:7987-7994), order 는 **두 게이트가 모두 없다**(index.html:5171-5177). DB 실측 2026-08-10 14:46 KST — SINGLE_SET 노출 **288행 전부 unit='EA'** ⟹ **estimate 싱글 원형발통·일자발은 영구 0, order 는 전 세트 수량 합산**. 같은 계열이 두 문서에서 0 과 N 으로 갈린다. 정본 판정 없이 세팅하면 어느 쪽이든 한 문서가 틀린다.
- 🚨【2위 · 상업 T형 분기관 게이트】 estimate `String(r.unit).toUpperCase()==='SET'`(index.ejs:8487) vs order `(unit==='SET') || /\(.*\+.*\)/.test(nm)`(index.html:5786). DB 14:47 KST — COMMERCIAL_MULTI 노출 **416행 전부 unit='EA'**, 이름에 `(x+y)` 가 있는 실외기 **84건**. ⟹ estimate 는 T형 분기관 **및 세트 HP 분해(방진가대 계열 전체)** 가 영구 0, order 는 84건에서 발화. 방진가대·일자발 계열까지 함께 갈리므로 파급이 가장 넓다.
- 🚨【3위 · 상업 4Way 공청판넬 코드 생성식 — 정본이 두 앱 어느 쪽도 아님】 estimate `.replace('NUF','NUC').replace('K1','K4')`(index.ejs:8635) vs order `.replace(/NBF|NUF/,'NUC')`(index.html:5919). DB 14:46 KST — PC4NUCK4NW 1건·PC4NUCK1NW **0건**·PC4NUCK1N 1건·PC4NUCK4N **0건**. ⟹ WIFI 칸은 estimate 가 맞고 미내장 칸은 order 가 맞다(정확히 상보적). **실재 조합 {PC4NUCK4NW, PC4NUCK1N} 을 정본으로 못박아야** 하며, 한 앱을 그대로 복사하면 반드시 한 칸이 죽는다.
- 🚨【4위 · 홈멀티 360CST 리모컨】 estimate `REMOTE_360_DEFAULT = /(AR-?EC05)/i`(index.ejs:4528) → **AR-EC05** vs order `/(AR-?KH05)/i || /360.*리모컨/i`(index.html:2897) → **AR-KH05**. 둘 다 HOME_MULTI 노출에 실재. estimate 에서는 360CST 전용 AR-KH05 가 어떤 규칙의 target 도 아니라 항상 0 이고, 게다가 estimate 는 AR-EC05 에 1/4WAY+벽걸이 계열과 **한 행에 누적**된다. 저장소 자체 문서 clients/web/legacy-quantity-golden/legacyQuantityBoundary.js:65 가 이미 '실제 앱 드리프트' 로 기록.
- 🚨【5위 · 조각 간 오판 — 카탈로그 소속 판정 근거가 틀림】 E-잔여·E-분기관발통이 `products.product_category` 컬럼으로 세어 '상업에 유연호스 0건 · 상업 리모컨은 AWR-VH12N 뿐 · SINGLE_SET 에 발통세트/유선보드 없음 · 상업에 SI-AL600a/700a 없음' 이라 판정했으나, 실제 카탈로그는 **product_estimate_exposure M:N 조인**이다(ProductRepository.java:279-292 findExposedCatalog · EstimateCatalogInternalController.java:245-247). PM 재측정(14:45~14:47 KST) 결과 위 품목이 **전부 해당 카테고리 노출에 존재**한다. ⟹ E-호스·E-리모컨·O-싱글상업이 맞고 E-잔여 6건·E-분기관발통 3건이 오류. E-잔여가 파생시킨 'estimate 상업 리모컨이 requireCommCatalogRow_ 예외로 중단될 수 있다' 는 우려도 성립하지 않는다(AR-EH05 실재).
- 🚨【6위 · 계열 입도 불일치】 같은 상업 판넬 표면을 E-판넬은 **15계열**(source 버킷 단위), O-싱글상업은 **1계열**(골든 C-01 함수 단위)로 셌다. 상업 리모컨은 E-리모컨 9 · O-싱글상업 1. 상업 펌프는 양쪽 다 1 이지만 스키마상 6행이다. **어느 입도로 대조할지 먼저 고정하지 않으면 계열 총계가 22↔45↔72 로 흔들린다.** 세팅 단위는 버킷(72)이 맞다.
- 🚨【7위 · 레거시 vs 현행 두 앱 — 방진가대 30HP】 레거시 tools/legacy-gas/종합견적서/index.html:3768(상부토출 중형 [16~28])·:3774(대형 [30,32,34]) vs 현행 estimate index.ejs:4184·4190 및 order index.html:2537·2544(중형에 30 포함, 대형 [32,34]). ⟹ **냉방전용 상부토출 30HP 가 레거시는 방진가대S2대, 현행 두 앱은 방진가대S2중**. 두 앱은 서로 같으므로 '앱 간 충돌' 이 아니라 '레거시 계승 여부' 판정 사항이다(E-분기관발통은 이것을 레거시↔estimate 차이로만 적었는데 order 도 estimate 쪽이다 — PM 대조).
- 🚨【8위 · 초기값 첫 커밋이 곧바로 밟는 표면】 브랜치 origin/feat/896-qty-sync-chip-track 의 recomputeHomeHoses_ 에 `hasServerHomeRules` 분기가 있어, **호스와 무관한 규칙(예: 판넬)을 한 건만 세팅해도** `#home_hose_i` 모드에서 4WAY 호스가 FH-LFHLN(L형) → FH-LFHIF(I형) 로 옮겨간다(E-호스 발견). origin/main 에는 이 분기가 없다. 라이브QA 시나리오 1번에 넣어야 한다.
- 🚨【9위 · 운임·절삭 취급이 정반대】 서버 BundleExpander.java:416-418 은 세트 전개 결과에서 `/유연호스 I형|운임|절삭/` 라인을 **무조건 제거**한다. 개발책임자 메모리(feedback_freight_cutting_amount_first_entry)는 *'운임·절삭은 제외 대상이 아니다 — 금액을 넣으면 수량 1 이 자동으로 붙어 견적서에 포함된다'* 이며 근거는 레거시 `종합견적서/index.html:2698 handleFreightInput`. **같은 표면인지(세트 구성품 전개 vs 견적서 자유 입력행) 확정되지 않았다** — S-서버데스크톱도 임의 판정하지 않았고 저도 하지 않았습니다. 개발책임자 판정 필요.
- 【10 · 소수 계수의 종착지가 넷 다 다름】 규칙 스키마는 factor·multiplier 소수 4자리와 rounding FLOOR 를 허용하는데, 서버 3좌표(SlipService:218-222 · EstimateService:145-149 · MobileQuotationService:166-171)와 데스크톱(SlipFormPage.tsx:1012)이 각자 HALF_UP + 하한 1 로 뭉갠다. order-app bootstrap 은 별도로 한 번 더 정수화(BootstrapService:470-481). 예: 3개 × factor 0.5 = 1.5 → 규칙상 1.5(NONE)/1(FLOOR) 인데 저장 라인은 2. **초기값을 소수 계수로 넣으면 문서마다 다른 수가 나온다.**
- 【11 · 홈멀티 판넬 target 이 런타임 선택】 두 앱 모두 pickPanelBy(estimate :3201-3230 / order :1636-1666)가 이름 점수로 고르고, 기본/25년형/AI 3옵션은 **점수 동점**이라 카탈로그 display_order 로만 갈린다. 현 카탈로그에서는 PANEL_MODELS 상수와 일치하지만(두 조각이 각각 확인) 행이 하나 추가되거나 이름·순서가 바뀌면 **경고 없이 다른 모델이 선택된다**.
- 【12 · 저장 경로 두 개가 서로 다른 수량 정책】 BundleComponentService.java:466-491(부모 지정 PATCH)은 기존 default_qty·variant·is_default·spec 을 **무조건 1/null/false/null 로 리셋**하고, :320-339(replace-all)은 요청값을 보존한다. 구성품 수량을 2 로 세팅해도 앞 경로를 한 번 타면 1 로 돌아간다.
- 【13 · 데스크톱 mock 이 서버에 없는 규칙을 갖고 있음】 mock.ts:1816 `if (componentKind === 'OUTDOOR' && remoteExcluded) return false` — 서버 remoteExcluded 는 REMOTE 만 제거(BundleExpander:235-238). mock QA 는 실서버와 다른 라인 집합을 본다.
- 【14 · 인벤토리 문서 좌표가 main 에서 재현되지 않음(증거 무결성)】 문서 3줄이 기준을 `0be8ecd8d`(브랜치 feat/896-qty-sync-chip-track) 라 적었고, 그래서 §6 이 인용한 `clients/web/estimate-app/public/quantitySync.js:61` 은 origin/main 에 없다. 조각 5개가 독립적으로 이를 보고했고 **조각들이 옳다**. 다만 그 브랜치에서는 함정 ① 자체가 정확하다(evaluateQuantitySyncRules 의 `if (evaluated == null) return null;` 이 정확히 61줄 — E-호스 확인). 문서 인용 시 **브랜치명을 함께** 적어야 한다.
- 【15 · grep 재현 명령 정정(증거 무결성)】 `grep -rn "optionEquals\|optionIn" clients/` 는 **8건**이 나오지만 전부 `optionInput`·`optionInfo`·`optionInactive` 오탐이다(O-싱글상업 발견). 단어경계(`\boptionIn\b`)를 넣어야 인벤토리가 말한 **0건**이 재현된다. 결론은 같고 명령만 바로잡는다.
- 【16 · 조각이 대조하지 않은 것 — 분기 보드 알고리즘】 codeByCumulativeSum·codeByOutdoorHP 가 estimate(:12669-12738)·order(:7169-7268)·레거시(:12338-12407) **세 곳 모두에 같은 함수명으로 존재**함은 PM 이 확인했으나, 세 본문을 줄 단위로 대조하지는 않았습니다. 이 계열은 스키마 표현 불가 판정이라 우선순위가 낮지만 '값이 같은가' 는 미확인입니다.

## 🚨 모델코드 미해소 (세팅을 막는 것)

- 【target 이 빈 문자열로 해소 — 계열이 통째로 죽음】 홈멀티 FOOT_FLAT = `HOMEMULTI.find(/SI-AL700a/i on model)` → HOME_MULTI 노출에 SI-AL700a **없음**(SI-AL600A '실외기 일자발' 만 있음, 14:47 KST). estimate index.ejs:4523·7965-7967 / order index.html:2892·5165 가 영구 no-op. SI-AL600A 는 어떤 규칙의 target 도 아니고 markAutoHome 의 `.filter(Boolean)` 때문에 자동관리 등록도 안 됨.
- 【target 이 빈 문자열】 HOSE_I_4W = `/유연호스.*(I형|아이형).*(4WAY)/i` → 매칭 0. '유연호스 I형 4WAY' 품목이 카탈로그에 없음. 귀결: 홈·상업 모두 4WAY 호스는 I형 옵션과 무관하게 항상 L형 FH-LFHLN 이고, `if(HOSE_I_4W) setH(…,0)` 3곳이 죽은 가지. **'I형 4WAY' 규칙을 세팅하면 레거시에 없던 동작을 새로 만드는 것** — 개발책임자 확인 필요.
- 【정규식 어순 불일치로 null】 REMOTE_WIRED_COLOR = `/컬러\s*유선\s*리모컨/i` — 실 품명은 '유선리모컨(컬러)' 라 매칭 0(estimate :4525 / order :2894). 현재 컬러 계열은 `/^AWR-WG00N$/` 리터럴을 쓰므로 무해하지만 **이 상수를 정본으로 삼아 세팅하면 안 됨**. 같은 이유로 REMOTE_WIRED(:4524)·REMOTE_INF_DEFAULT(:4529)도 선언만 되고 계산에 안 쓰임.
- 【치환 결과가 카탈로그에 없음】 estimate 상업 4Way 미내장 공청 → **PC4NUCK4N (0건)** · order 상업 4Way WIFI 공청 → **PC4NUCK1NW (0건)**. 두 앱이 각자 다른 칸에서 죽어 있고 정본은 실재 조합 {PC4NUCK4NW, PC4NUCK1N}. estimate 는 requireCommCatalogRow_ 화이트리스트 밖이라 예외 없이 조용히 건너뜀.
- 【source 가 HP·이름 토큰 라우팅이라 모델코드 미열거】 상업 방진가대S2 소/중/대 · GHP방진가대 · ACL-KORGHP07 · SI-AL600a · SI-AL700a **7계열 전부**. chooseBaseModel(estimate :4150-4219 / order :2504-2547)이 이름의 프라임·한랭지·표준형·상부토출·프레스티지·동시냉난방·공장전원·ECO·가스히트펌프 × HP 토큰으로 target 을 고른다. **어느 조각도 source 모델코드를 뽑지 않았다**(후보 상한만 측정: 옵션 키워드 220건 · ECO 21~23건 · GHP 9건). 세팅 전 실 카탈로그에 판별식을 돌려 전수를 뽑아야 한다.
- 【target 이 이름 키워드 → modelByNameLike 로 해석】 위 7계열의 target 은 모델코드가 아니라 '방진가대S2소' 같은 **이름 키워드 문자열**이고, 못 찾으면 키워드 자체를 모델코드로 쓴다(estimate :4207-4218). 현 카탈로그에서는 우연히 model_code 와 같아 맞아떨어진다 — 이름이 바뀌면 조용히 어긋난다.
- 【대소문자만 다른 동명이인】 `SI-AL600A`(HOME_MULTI '실외기 일자발') 와 `SI-AL600a`(COMMERCIAL_MULTI/SINGLE_SET '실외기 일자발 (전면 4~6HP)') 가 별개 행으로 공존. order-app 평가기는 productCode 를 `.toUpperCase()` 로 비교(quantitySync.ts:69)해 **두 행이 한 코드로 뭉친다**. modelByNameLike 는 대소문자 무시 first-match 라 행 순서에 좌우된다. 어느 행을 쓸지 확정해야 한다.
- 【target 이 모델코드가 아니라 합성키】 싱글중대형 4계열(SS_FOOT_ROUND_ID·SS_FOOT_FLAT_ID·SS_WIRED_BOARD_ID·SS_CEILING_PUMP_ID)의 target 식별자는 `id = ${name}|${size}|${idx}` — **품목명+평형+배열 인덱스** 합성 문자열이다(db-catalog.js:104-106). 카탈로그 행 순서가 바뀌면 id 가 통째로 바뀐다. 반면 quantity_sync_target.target_product_id 는 UUID — **축이 다르다**.
- 【source 가 품목 수량이 아님】 상업 분기 보드 배지 → Y형 분기관 6종(AXJ-YA1509N/2512N/2812M/2815M/3419M/4119M). source 가 `.code-cell` DOM 배지 개수와 칩 배치 순서·누적용량 csum 이라 (source 집합, factor) 로 표현 불가. S4·인벤토리 §8 과 동일 판정.
- 【source 자체가 없음】 비상품 운임·절삭(금액 입력 → 수량 1 자동, 절삭은 항상 음수 단가) 과 AUTO_CUTOFF(source = 견적 총액의 나머지, target 을 **새로 생성**). 스키마의 source→target 형태에 자리가 없다. 🚨단 운임·절삭은 **sync 에서 빼면 안 되는 항목**(개발책임자 2026-08-06).
- 【집계 방식이 스키마에 없음】 역방향 세트 구성품 → 세트 본체(estimate :18841-18877)는 **MAX**(양수 최댓값, 전부 음수면 최솟값). 현 스키마는 `CHECK (aggregation = 'SUM')` 으로 SUM 외 금지(V24:45). 개발책임자께서 요구하신 '반대 방향도 동작' 의 유일한 레거시 선례가 바로 이것이므로, aggregation 확장 여부를 먼저 결정해야 한다.
- 【계수가 데이터·이름에서 유도됨】 ①상업 T형 분기관 = 품목 이름 **괄호 안 '+' 개수** × 수량(countBranchForSet) ②세트 BOM 전개 = 세트수량 × **구성품 정의수량**(SINGLE_PARTS.qty / bundle_component.default_qty, 서버 1,584행) ③상업 받침대 세트행 = parseSetHPs 조각 수만큼 반복 가산. 셋 다 `quantity_sync_source.factor`(고정 numeric) 로 표현 불가.
- 【차감·게이트·하한】 홈멀티 AXJ-YA1509N = indoorCount − singleOutCount − sixHpSingleCount, `Math.max(0,·)`, 게이트 `sOut>0`. AXJ-YA2512N 은 게이트가 **자기 source 가 아닌 다른 두 집합**에 걸림. 현 스키마(SUM·factor>0·rounding NONE|FLOOR)에 차감항·게이트·하한 축이 없다. S4·인벤토리와 동일 판정(H-07).
- 【estimate 상수 전부가 런타임 정규식 해석】 유연호스 4종·분기관 2종·발통 2종·리모컨 7종·싱글 4종의 target 이 하드코딩 모델코드가 아니라 `카탈로그.find(정규식)` 의 **첫 매칭**이다(estimate :4513-4548 / order :2882-2917). 품명이 한 글자만 바뀌면 상수가 '' 이 되어 그 계열이 **오류 없이 조용히 사라진다**(`if(X) setX(...)` 가드). 특히 REMOTE_WIRELESS 는 `/(AR-EC05|무선\s*리모컨|무선리모콘)/i` 를 품명에 걸어 무선리모컨 3종이 모두 매칭되고 display_order 첫 행이 뽑힌다. **초기값을 model_code 로 못박는 것이 정확히 이 위험을 없앤다 — 이것이 이 작업의 가장 큰 값이다.**
- 【fallback 리터럴이 다른 품목】 order index.html:5462 `setR(REMOTE_COLOR_AIRCOMBO, …, 'AWR-WG00N')` — 이 계열의 target 은 **AWR-WV00N**(에어콤보용)인데 fallback 은 일반 컬러 리모컨이다. 현 카탈로그엔 AWR-WV00N 이 있어 안 타지만 규칙 표에 fallback 을 정본으로 쓰면 안 된다.
- 【세팅해도 선택되지 않는 코드】 PANEL_MODELS.infM='PC1YNSK1NW'(판넬 1way 무풍중형 인피니트, 카탈로그 실재)는 두 앱 어떤 옵션 조합으로도 선택되지 않는다(중형 기본이 25년형 PC1YNWK1NW 로 고정). 대형만 25년형이 별도 코드. 의도인지 레거시 잔재인지 판정 필요(레거시 :7657-7665 도 같은 비대칭이라 계승 자체는 정확).
- 【규칙의 target 이 아닌데 0 으로 초기화되는 품목】 PC1DWSK1(시스템제습기 판넬) — isPanelRow 로 걸려 매 계산마다 0 이 되지만 어떤 규칙의 target 도 아니다. 짝인 INDOOR_AY047(AY047BA1SBA 시스템제습기 본체)와 PANEL_PC1DWSK1 은 order-app index.html:1467-1468 에 **정의만 되고 참조 0건**. ⟹ 시스템제습기 본체→판넬 계열이 **어느 앱에도 없다**(두 품목 모두 HOME_MULTI 노출 실재). 누락 계열인지 의도인지 판정 필요.

---

## 적대검증 3각도


### 품목코드 실재성 적대검증 — 병합된 72계열의 모든 모델코드(연인원 314 · 서로 다른 코드 261)를 **실 카탈로그 API 를 직접 호출해** 대조했습니다. `products` 컬럼이 아니라 `ProductRepository.findExposedCatalog`(services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:279-292)가 실제로 돌려주는 것을 자로 삼았습니다 — 조각들이 `products.product_category` 로 세어 틀렸던 실수를 되풀이하지 않기 위해, 그리고 병합보고가 쓴 `product_estimate_exposure` 조인도 **아직 한 겹 모자라기** 때문입니다. 병행해 ①정규식으로만 정의된 상수 23개를 실 카탈로그에 돌려 매칭 수를 세고 ②병합보고의 DB 수치 12개를 재현 대조하고 ③`quantitySync.js:61` 전멸 함정이 실제로 어떤 조건에서 발화하는지 서버 검증까지 따라갔습니다.

**판정** — **병합된 72계열의 모델코드 314건(서로 다른 코드 261건)을 실 카탈로그 API 로 전수 대조한 결과 미해소 11건입니다** — ①`products` 에 행 자체가 없는 것 2건(`PC4NUCK1NW`·`PC4NUCK4N`) ②품목·노출행은 살아 있는데 `usage_scope='NONE'` 이라 카탈로그가 제외하는 것 8건(`PC4NBFK1NW`·`PC4NUXK1NW`·`PC6NUNK1NW`·`PC6NBNK1NW`·`PC6EUCK1NW`·`PC6EUXK1NW`·`PC6NBDK1NW`·`PC6NUXK1NW`) ③카테고리 소속이 어긋난 것 1건(`SI-AL700a` 가 HOME_MULTI 에 없음).

**병합보고를 한 곳 정정합니다.** '20개 상업 전용 판넬 코드 전부 COMMERCIAL_MULTI 노출 실재' 는 틀렸습니다. 실 endpoint 응답은 COMMERCIAL_MULTI **408행**이지 병합보고가 쓴 416 이 아닙니다 — `findExposedCatalog` 가 `usageScope IN (ESTIMATE, BOTH)` 를 한 겹 더 걸기 때문입니다(ProductRepository.java:288). 병합보고가 E-잔여의 `product_category` 오판을 잡은 것은 옳았지만, **노출행까지만 보고 멈춘 것이 같은 계열의 오판**이었습니다. 이것이 데이터 사고라는 증거는 명확합니다 — display_order 238~252 판넬 블록 안에서 NONE 8행이 BOTH 행 사이에 **번갈아 끼어 있고**, 여덟 모두 `usage_scope_manual=false` 에 `modified_at` 이 동일한 시트 sync 1회 실행(`2026-07-30 13:07:32.757352`) 값입니다. ⟹ **관리자가 손으로 고쳐도 다음 sync 가 되돌립니다.**

**제 초기 가설도 하나 정정합니다.** 이 11건은 브리핑 함정 ①의 '조용한 전멸' 을 일으키지 **않습니다**. `QuantitySyncRuleValidator.validateProduct`(:376-382)가 `visible`(=`usageScope != NONE`)을 검사해 400 으로, 미존재 코드는 `PRODUCT_NOT_FOUND`(Service:407-409)로, 카테고리 불일치는 `\"category 안에서만…\"`(Validator:286-288)로 **크게 실패**합니다. 즉 조용히 죽지는 않지만 **그 11건은 지금 어떤 경로로도 규칙에 넣을 수 없습니다.** 계열로 환산하면 `상업 360CST WIFI 원형`은 4옵션 전 축이 막혀 통째로 불가, `상업 4Way WIFI 일반`은 4칸 중 3칸 불가, `상업 360 사각`은 8칸 중 6칸 불가, `홈 일자발`은 target 부재 — 72계열 중 **4계열이 부분·전부 세팅 불가**입니다. 홈멀티 판넬 12계열과 '지금 세팅 가능' 9계열(펌프 6·필터 2·싱글 실링펌프 1)은 코드가 전부 실재해 **무사**합니다.

정규식 전용 상수 23개도 실 카탈로그에 돌렸습니다. **0건 4개**(`_HOSE_I_1W`·`_HOSE_I_4W`·`FOOT_FLAT`·`REMOTE_WIRED_COLOR`)는 병합보고 판정과 일치합니다. **2건 이상 2개** 중 `REMOTE_WIRELESS` 는 3건(AR-EC05/AR-KH05/AR-CH01)이 잡히고 `display_order` **96/97/98 한 칸 차**로 AR-EC05 가 이기는데, 이 상수는 `index.ejs:8262` 에서 **실제 수량 계산에 쓰입니다** — 시트 순서가 한 칸만 바뀌면 target 이 경고 없이 옮겨갑니다. 초기값을 model_code 로 못박아야 하는 가장 구체적인 근거입니다. 반대로 병합보고의 `SI-AL600A`↔`SI-AL600a` 뭉침 우려는 **하향**합니다 — 평가기는 카테고리별 배열 하나만 받고 세 카탈로그 모두 uppercase 충돌 0건입니다.

병합보고의 나머지 DB 수치 12개(34·6·10·93·11·20·10/7/76·28/52·84·21·9·전부EA)는 릴레이 없이 다시 세어 **전부 일치**했습니다. 신뢰도는 높고 어긋난 곳은 판넬 실재성 한 곳뿐입니다.

**개발책임자 판정이 필요한 것 2건**: ①상업 판넬 8행의 `usage_scope` 를 BOTH 로 되돌릴지(되돌린다면 시트 탭 매핑을 고쳐야 하며, `usage_scope_manual=true` 로만 잠그면 시트와 영구히 어긋납니다) ②`PC4NUCK1NW`·`PC4NUCK4N` 은 실재 조합 `{PC4NUCK4NW, PC4NUCK1N}` 로 못박을지. **둘이 정리되기 전에는 상업 판넬 계열 초기값 세팅을 시작하지 마십시오** — 저장 자체가 400 으로 거부되어 라운드 하나를 버립니다. 이 조사에서 DB 쓰기는 하지 않았고 모든 수치에 측정 시각을 붙였습니다.

- 【기준·측정】 워크트리 D:/dev/Samhan-Public/.claude/worktrees/wmain, HEAD **dc9db5dfe**. 병합보고 기준 `d1ea74c51` 이후 `clients/`·`services/`·`tools/` 변경 커밋 **0건**(docs 2건뿐, `git log --oneline d1ea74c51..dc9db5dfe -- clients/ services/ tools/` 무출력) — 소스 드리프트 없음. DB·API 실측 **2026-08-10 15:00~15:10 KST**(회사PC). 카탈로그는 SQL 재현이 아니라 **실 endpoint 호출**: `curl -H 'X-Internal-Token: dev-internal-token-change-me' http://localhost:8084/products/internal/estimate-catalog/products?category=<C>` → 전부 HTTP 200. `quantity_sync_rule`/`source`/`target` **전부 0행**(15:06:08 KST) 재확인.
- 🚨🚨【1위 발견 — 병합보고가 '노출 실재' 로 판정한 상업 판넬 8개가 앱 카탈로그에 **없다**】 실 API 응답 행수는 HOME_MULTI **119** · SINGLE_SET **288** · LEGACY **40** 인데 COMMERCIAL_MULTI 는 **408** 입니다 — 병합보고가 반복해 쓴 **416 이 아닙니다**. 차이 8행의 정체: `findExposedCatalog` 는 `AND p.usageScope IN :scopes`(ProductRepository.java:288) 를 걸고, 컨트롤러가 넘기는 scope 는 `List.of(scope, BOTH)`·기본 `ESTIMATE`(web/EstimateCatalogInternalController.java:248-251) 입니다. 그런데 이 8행은 `usage_scope='NONE'` 이라 **노출행(product_estimate_exposure)은 살아 있는데 카탈로그에서 통째로 빠집니다**. 병합보고는 노출행만 세어 '20개 상업 전용 판넬 코드 전부 COMMERCIAL_MULTI 노출 실재' 라 적었고, 그 문장이 틀렸습니다. 병합보고가 E-잔여의 `products.product_category` 오판을 잡아낸 것은 옳았으나, **조인을 한 겹 더 들어가 usage_scope 까지 보지 않은 것이 같은 계열의 오판**입니다.
- 🚨【미해소 코드 전건 — 314 대조 중 11건】 ▸**A. `products` 테이블에 행 자체가 없음(2건)**: `PC4NUCK1NW`(order-app 상업 4Way WIFI 공청 치환 결과, index.html:5919) · `PC4NUCK4N`(estimate-app 상업 4Way 미내장 공청 치환 결과, index.ejs:8635). `model_code ILIKE 'PC4NUC%'` 전수(15:08:05 KST)로 근접 코드까지 확인 — 실재는 `PC4NUCK1N`·`PC4NUCK4NW` 뿐이고 나머지는 `PC4NUCK4NPP`·`PC4NUCK4NWPP`·`PC4NUCK5NW`(전부 name==model_code 인 이카운트 잔재·scope NONE). 병합보고의 '0건' 판정이 정확합니다. ▸**B. 품목·노출행은 있으나 `usage_scope='NONE'` 이라 카탈로그 제외(8건)**: `PC4NBFK1NW`(판넬 무풍4Way 블랙 WIFI) · `PC4NUXK1NW`(승강 WIFI) · `PC6NUNK1NW`(360 원형 WIFI) · `PC6NBNK1NW`(360 원형 블랙) · `PC6EUCK1NW`(360 원형 공청) · `PC6EUXK1NW`(360 원형 승강) · `PC6NBDK1NW`(360 사각 블랙) · `PC6NUXK1NW`(360 사각 승강). 여덟 모두 `status=ACTIVE`·`is_deleted=false`·COMMERCIAL_MULTI 노출행 비삭제. ▸**C. 카테고리 소속 미해소(1건)**: `SI-AL700a` 는 HOME_MULTI 카탈로그에 **없고**(COMMERCIAL_MULTI·SINGLE_SET 에만 있음) — 병합보고 재확인.
- 🚩【B 8건이 '업무상 제외' 가 아니라 데이터 불일치라는 결정적 증거】 COMMERCIAL_MULTI 노출 display_order 232~252 를 그대로 뽑으면(15:07:56 KST) 판넬 블록 안에서 **NONE 과 BOTH 가 번갈아 섞여 있습니다**: 238 PC4NUFK1NW=**BOTH** / 239 PC4NBFK1NW=**NONE** / 240 PC4NUXK1NW=**NONE** / 241 PC4NUCK4NW=**BOTH** / 245 PC6NUDK1NW=**BOTH** / 246 PC6NUNK1NW=**NONE** / 247 PC6NBDK1NW=**NONE** / 248 PC6NBNK1NW=**NONE** / 249 PC6NUCK1NW=**BOTH** / 250 PC6EUCK1NW=**NONE** / 251 PC6NUXK1NW=**NONE** / 252 PC6EUXK1NW=**NONE**. 같은 시트 탭에서 같은 sync 실행이 붙인 연속 번호인데 8칸만 안 보입니다. 여덟 전부 `usage_scope_manual=false` · `estimate_category` NULL · `modified_at` 이 **동일한 `2026-07-30 13:07:32.757352`**(그 타임스탬프를 공유하는 품목 2,667건 = 시트 sync 1회 실행). 노출행은 그보다 뒤인 `2026-07-29 09:10:01` 에 정상 품목과 같이 갱신됐습니다. ⟹ **관리자가 손으로 usage_scope 를 고쳐도 `usage_scope_manual=false` 라 다음 시트 sync 가 되돌립니다**(ProductSheetSyncService.java:1373 `if (!p.isUsageScopeManual())`).
- 🚨【그래서 어느 계열이 못 들어가나 — 계열 단위 귀결】 ▸`[상업] 4Way WIFI 일반 → 판넬`: 4옵션 중 **블랙·승강·공청 3칸이 죽습니다**(블랙 PC4NBFK1NW ✗ / 승강 PC4NUXK1NW ✗ / 공청은 order 식이 PC4NUCK1NW ✗, estimate 식 PC4NUCK4NW 만 ✓). 기본 PC4NUFK1NW 만 성립. ▸`[상업] 360CST WIFI내장 → 판넬`: **원형은 base·블랙·공청·승강 4/4 전부 ✗** — 이 계열은 원형 축이 통째로 세팅 불가. 사각은 base·공청 ✓, 블랙·승강 ✗ (**8칸 중 6칸 사망**). ▸`[상업] 4Way 미내장 일반 → 판넬`: estimate 식 PC4NUCK4N ✗ / order 식 PC4NUCK1N ✓ (병합보고의 '상보적' 판정 그대로). ▸`[상업] 360CST 미내장 → 판넬`: 8/8 ✓ **무사**. ▸`[홈] 일자발 FOOT_FLAT`: SI-AL700a ✗ (기존 판정 유지). ⟹ 72계열 중 **4계열이 부분·전부 세팅 불가**이고, 그중 `상업 360CST WIFI 원형`은 옵션 전 축이 막혀 있습니다. 홈멀티 판넬 12계열은 **전부 무사**(PC4NUFK1NW·PC4NUCK4NW·PC6NUDK1NW·PC6NUCK1NW 모두 HOME_MULTI 카탈로그 실재).
- 🚨🚩【자기 정정 — 브리핑 함정 ①의 '조용한 전멸' 은 이 11건에는 발화하지 않습니다. 대신 저장이 400 으로 막힙니다】 처음엔 '서버 validator 가 노출행만 보므로 NONE 품목 규칙이 저장되고 클라이언트에서 전멸한다' 고 의심했는데, 코드를 끝까지 따라가니 **틀렸습니다**. `QuantitySyncRuleService.toSnapshot`(:468-478)이 `product.getUsageScope() != UsageScope.NONE` 를 `visible` 로 담고, `QuantitySyncRuleValidator.validateProduct`(:376-382)가 `if (!product.visible()) invalid("삭제되었거나 비노출인 Product는 연결할 수 없습니다.")` 로 **거부**합니다. ⟹ **B 8건**은 400(비노출) · **A 2건**은 `PRODUCT_NOT_FOUND "품목을 찾을 수 없습니다: <code>"`(QuantitySyncRuleService.java:407-409) · **C SI-AL700a**는 `"category 안에서만 source/target을 연결할 수 있습니다."`(Validator :286-288). 셋 다 **크게 실패**합니다. 이것은 좋은 소식이자 나쁜 소식입니다 — 조용히 전멸하지는 않지만 **그 11건은 지금 어떤 방법으로도 규칙에 넣을 수 없습니다**. 초기값 세팅 스크립트를 짜면 이 지점에서 멈춥니다.
- 【함정 ① 재현 확인 + 전멸 조건 전수】 `evaluateQuantitySyncRules` 의 `if (evaluated == null) return null;` 은 **정확히 61줄**이 맞고(브랜치 `origin/feat/896-qty-sync-chip-track` 의 `clients/web/estimate-app/public/quantitySync.js`), origin/main 에는 그 파일이 없다는 병합보고의 증거 무결성 정정도 옳습니다. 전멸을 부르는 `return null` 은 61줄 하나가 아니라 **여섯 곳**입니다 — :24 `enabled !== true` 또는 `estimateCategory !== 'HOME_MULTI'` · :25 `aggregation !== 'SUM'` 또는 `inactiveBehavior !== 'ZERO'` · :28 source/target 빈 배열 · :36 source 코드 미해소 또는 factor≤0 · :48 target 코드 미해소 또는 multiplier≤0(`numberOrNull` 이 **>0 만 통과**시키므로 factor 0 도 전멸). 그중 둘은 이미 방어돼 있습니다: 규칙 fetch 가 `'/quantity-sync-rules?estimateCategory=HOME_MULTI'`(chip 브랜치 lib/db-catalog.js:52-53)로 카테고리를 걸고, 뷰가 `HOME_QUANTITY_SYNC_RULES.filter(rule => rule?.enabled === true)`(index.ejs:2267-2268)로 비활성을 걸러냅니다. **남은 실질 전멸 조건 = 홈 규칙의 source/target 코드가 119행 HOMEMULTI 에 없을 때** — 그리고 위 서버 게이트 덕에 그 상황은 '카탈로그에서 나중에 빠질 때' 만 생깁니다(ProductService.java:837-844 `assertNotReferencedByEnabledQuantitySyncRule` 가 API 경로를, ProductSheetSyncService.java:1383-1394 `losesVisibility` 가 시트 경로를 막고 있습니다).
- 【정규식 전용 상수 — 0건인 것 4개(그 규칙은 못 넣습니다)】 실 카탈로그에 그대로 돌린 결과(15:04:52 KST, HOME_MULTI 119행): ▸`_HOSE_I_1W` /유연호스.*(I형|아이형).*(1\s*-?\s*WAY|1WAY)/ → **0건**. 다만 `HOSE_I_1W=_HOSE_I_1W||_HOSE_I_ANY` 라 fallback 이 **FH-LFHIF** 로 살아납니다(index.ejs:4521). ▸`_HOSE_I_4W` → **0건**이고 `HOSE_I_4W=_HOSE_I_4W||''` 라 **''** — 죽은 가지 확정. ▸`FOOT_FLAT` /SI-AL700a/i on model → **0건** → '' (index.ejs:4523). ▸`REMOTE_WIRED_COLOR` /컬러\s*유선\s*리모컨/ → **0건**(실 품명은 `유선리모컨(컬러)`). 넷 다 병합보고 판정과 일치합니다. 반대로 병합보고가 못 찾았다고 우려한 것들은 전부 **1건 정확 해소**: `FOOT_ROUND`→`발통세트[원형발통 세트]` · `MODEL_6HP_SINGLE`→`AJ060MXHNBC1` · `BRANCH_1509/2512` · `REMOTE_COLOR_AIRCOMBO`→`AWR-WV00N` · SINGLE_SET 4상수(`AIM-A01N`·`ADP-F075SP`·`발통세트`·`SI-AL700a`) 전부 1건.
- 🚨【정규식 2건 이상 — 어느 것을 고를지 정해야 하는 것 2개, 그중 하나는 실제 계산에 쓰입니다】 ▸`REMOTE_WIRELESS` /(AR-EC05|무선\s*리모컨|무선리모콘)/ on **name** → **3건**: `AR-EC05[무선리모컨(냉방전용)]` · `AR-KH05[무선리모컨(360cst용)]` · `AR-CH01[무선리모컨 인피니트(솔라셀)]`. `.find()` 가 배열 첫 행을 집으므로 현재 **AR-EC05** 로 떨어지는데, 그 근거는 `display_order` **96 / 97 / 98 단 한 칸 차**입니다(15:07:14 KST). 그리고 이 상수는 죽어 있지 않습니다 — `index.ejs:8262 if (REMOTE_WIRELESS) setR(REMOTE_WIRELESS, cntW + cntWall);` 로 **1/4WAY+벽걸이 무선리모컨 수량을 실제로 씁니다**. 시트에서 무선리모컨 3종 순서가 한 칸만 바뀌면 그 계열 target 이 경고 없이 AR-KH05 나 AR-CH01 로 옮겨갑니다. **초기값을 model_code 로 못박아야 하는 가장 구체적인 근거**입니다. ▸`REMOTE_WIRED` /유선\s*리모컨(?!.*컬러)/ → **2건**: `AWR-WE13N[유선리모컨(통합)]`(승) · `AIM-A01N[유선리모컨 키트]`. 다만 이 상수는 선언(:4524)과 `markAutoHome`(:4548) 외 참조가 없어 무해 — 병합보고의 '계산에 안 쓰임' 판정이 `REMOTE_WIRED`·`REMOTE_INF_DEFAULT` 에 대해서는 맞습니다.
- 【병합보고 우려 하향 — 대소문자 동명이인은 실제로는 충돌하지 않습니다】 병합보고는 `SI-AL600A`(HOME_MULTI)와 `SI-AL600a`(COMMERCIAL_MULTI/SINGLE_SET)가 order-app 평가기의 `toUpperCase()` 비교(quantitySync.ts:69)로 '한 코드로 뭉친다' 고 했는데, 평가기는 **카테고리별 카탈로그 배열 하나만** 받습니다. 세 카탈로그 각각에서 uppercase 충돌을 전수로 셌더니 HOME_MULTI 119행→distinct 119 · COMMERCIAL_MULTI 408행→408 · SINGLE_SET 288행→288, **충돌 0건**(15:03:39 KST)이고 model_code 공백 행도 0건입니다. 한 평가 안에서 두 행이 뭉치는 일은 현재 데이터로는 일어나지 않습니다. 남는 것은 '어느 행을 쓸지 정하라' 는 **업무 판정**이지 계산 오염이 아닙니다.
- ✅【병합보고의 DB 수치 재현 — 12개 지표 전부 일치】 릴레이하지 않고 실 카탈로그에서 다시 셌습니다(15:06~15:09 KST): 홈 1WAY **34**(주장 34, 코드 34개 집합까지 완전 일치 — 주장에만 있는 코드 0 · 실제에만 있는 코드 0) · 홈 벽걸이 **6** · 홈 /실외기/ **10**(부자재 `SI-AL600A` 가 포함되는 것까지 재현 — 병합보고의 '부자재가 자기 수량으로 발통을 늘린다' 는 지적 성립) · `isCommIndoorRow` 중 일반 실내기 **93** · 전열교환기 **11** · 덕트 **20** · UV-C **10** / 인피니트 **7** / 나머지 **76** · 호스 대상 1·2way **28** / 그 외 **52** · 이름에 `(x+y)` 있는 실외기 **84** · ECO 실외기 **21** · 가스히트펌프 실외기 **9** · COMMERCIAL_MULTI·SINGLE_SET **unit≠'EA' 0행**(= '전부 EA' 확인). ⟹ 병합보고의 수치 신뢰도는 높고, 어긋난 곳은 **판넬 실재성 판정 한 곳**뿐입니다.
- 【세팅 1순위 재확인 — 지금 넣을 수 있는 것은 그대로 유효】 병합보고가 '지금 세팅 가능' 으로 꼽은 계열의 코드는 전부 실재합니다: 상업 드레인펌프 6계열(source 22코드 · target `MDP-Z075SZED`·`ADP-E075SEK3D`·`MDP-M075SGK2D`·`ADP-G075SPK1D`·`ADP-N047SNK1D`·`ADP-F075SP`) 전건 ✓, ECO 리뉴얼 필터 2계열(source 4 · target `AF-R09A`·`AF-R12A`) 전건 ✓, 싱글 실링펌프(`ADP-F075SP`) ✓. `발통세트`·`운임`·`절삭` 처럼 model_code 가 한글인 것도 각 카테고리에서 정확히 1행으로 해소됩니다. 받침대 계열 target(`방진가대S2소/중/대`·`GHP방진가대`·`ACL-KORGHP07`)도 COMMERCIAL_MULTI 실재 — 막는 것은 코드 부재가 아니라 **source 모델코드가 아직 열거되지 않은 것**뿐입니다(병합보고 판정 유지).
- 【부수 확인 — 규칙 응답의 코드 축】 `QuantitySyncRuleService`(:577-578)는 `productCode` 를 `model_code` 로 내고 비면 `model_name` 으로 fallback 합니다. 카탈로그 API 도 `modelCode` 를 내고, 클라이언트 `rowsByCode` 는 `row.modelCode ?? row.model` 을 대조하므로 축이 맞습니다. 위 7개 리모컨 품목은 `model_code`·`product_code` 값이 동일해 혼선 여지도 없습니다(15:07:14 KST). 다만 **모델코드가 빈 품목이 생기면 규칙은 모델명을, 카탈로그는 빈 modelCode 를 내보내 즉시 미해소가 됩니다** — 현재 세 카탈로그에 빈 model_code 행은 0건이라 지금은 안전합니다.

### 누락 적대검증 — 병합 결과 72계열을 인벤토리 45와 대조하고, 레거시 소스(tools/legacy-gas/종합견적서/index.html)·estimate-app·order-app 을 직접 훑어 여덟 조각이 다 못 본 계열을 찾음. 모든 DB 수치는 회사PC docker samhan-postgres product_db 실측(2026-08-10 15:02~15:05 KST). 워크트리 D:/dev/Samhan-Public/.claude/worktrees/wmain, HEAD dc9db5dfe(= 병합 결과가 기준 삼은 d1ea74c51 대비 docs 2건만 추가, `git diff --stat d1ea74c51 dc9db5dfe` 로 코드 변경 0 확인).

**판정** — 누락 있음 — 계열 2건(카드수수료·선금할인), 계열 내부 factor 오기 1건, 미보고 앱간 차이 2건. 병합 결과 72(목록 73)는 74(목록 75)로 올라가야 하며, 변형층은 9→11.

【누락 계열 2건】 ① **카드수수료** — estimate `index.ejs:16651-16681`(호출 `:9630`·`:11362`), 레거시에도 실재 `tools/legacy-gas/종합견적서/index.html:16172`(호출 `:9323`·`:11036`), 도달 UI `index.ejs:1745 #chkCardPay`. 병합 결과가 **동일 종인 AUTO_CUTOFF 를 계열로 세었으므로 자기 자를 어긴 누락**입니다. ② **선금할인** — estimate `index.ejs:2567-2582`(호출 `:9633`·`:11363`), 도달 UI `:1738 #payDuePre`. 레거시 0건이라 "계승 목록" 사고틀에서 빠졌습니다. 놓친 조각 = 비상품/구형 담당 조각(운임·절삭·AUTO_CUTOFF 셋만 제출).

【계열 오기 1건 — 초기값 세팅에 직결】 계열 #29 BOM 전개의 factor 를 "세트수량 × 구성품 정의수량" 으로 적고 `estimate index.ejs:5199-5239` 를 근거로 들었으나, estimate 는 `:5247` 이 `qty: qty` 로 **구성품 정의수량을 곱하지 않습니다**. order 는 `index.html:3380` 에서 곱합니다. 오늘 안 보이는 이유는 `bundle_component` 1,584행이 전부 `default_qty=1.00` 이라서이며, 그것이 바로 이번 세팅이 건드릴 값입니다. estimate 는 상업 세트에서는 곱하므로(`:7244-7248`) **estimate 내부도 비대칭**입니다.

【미보고 앱간 차이 2건】 상업 세트 구성품 0건 시 estimate 는 세트 1줄 반환(`:7228-7238` isSetFallback) / order 는 `return []`(`index.html:4771-4774`) — 줄이 통째로 사라짐. 그리고 위 BOM 곱셈 차이.

【대조 방법론 자체의 결함 — 브리핑 전제 정정】 인벤토리 문서에는 **45계열의 개별 목록이 없습니다**(전문 178줄 확인, §1 은 탭별 집계표뿐). "하나씩 대조" 는 이 문서 단독으로 수행 불가입니다. 그래서 저는 ① 탭 단위 재구성 ② 레거시 전수 훑기로 갈음했습니다 — 레거시 함수 365개 중 두 앱에 없는 것은 로더 3개뿐(`loadInitialData`·`initDataLayer`·`runHeavyInit`)이므로 **함수 입도에서 레거시가 통째로 떨어져 나간 계열은 없습니다**.

【병합 결과가 옳았음을 제가 독립 재현한 것】 conflicts #1·#2(SINGLE_SET 288행·COMMERCIAL_MULTI 416행 전부 `unit='EA'`, 15:02 KST — 여기에 병합 결과가 못 보인 연결고리 `db-catalog.js:111 unit: r.unit || 'SET'` 를 추가), #3(치환 결과를 손으로 재유도 + `PC4NUCK1NW`·`PC4NUCK4N` 0건 / `PC4NUCK4NW`·`PC4NUCK1N` 실재, 15:04 KST), #5(exposure 조인 재측정으로 E-잔여 오판 정정 확인), #14(`estimate-app/public/quantitySync.js` main 부재 — `git ls-files` 확인), #15(`\boptionIn\b` 0건 vs 나이브 8건), 역방향 MAX(`index.ejs:18841-18877`), FOOT_FLAT 죽은 가지(HOME_MULTI 에 `SI-AL700a` 없음).

【추가 확정 2건】 인벤토리의 "estimate 구형 1" = 운임/절삭이 맞습니다(`oldQty.set` 은 `:7546` 사용자 입력과 `:7526 handleFreightInput` 둘뿐, 파생 0). 시스템제습기(`AY047BA1SBA`/`PC1DWSK1`)는 미계승이 아니라 **레거시에서부터 선언·대입만 되고 사용처 0건인 잔재**입니다(legacy `:2194-2195`·`:8962-8963`).

【병합 결과 산수】 `canonicalRules` 실제 82항목 = 계열 73 + 변형층 9. `totalFamilies: 72` 는 6번째 항목의 자기선언("계열로 세지 않았음")을 빼야 성립하므로 표기로 못박아야 합니다.

【기준】 워크트리 `D:/dev/Samhan-Public/.claude/worktrees/wmain`, HEAD `dc9db5dfe`(병합 결과 기준 `d1ea74c51` 대비 docs 2건만 추가, 코드 diff 0). DB 는 `docker exec samhan-postgres psql -U samhan -d product_db`, 측정 시각 2026-08-10 15:02~15:05 KST(회사PC). 구글 시트에는 접근하지 않았고 저장소 커밋된 레거시 소스를 정본으로 삼았습니다.

- 🚨【누락 1 — 계열】 **카드수수료**가 병합 결과에 없습니다. `clients/web/estimate-app/views/index.ejs:16651-16681 applyCardFeeLogic` — source = rows 총액 × `getCardFeeRate()`(:2472-2474, 기본 0.03), target = `qty===1 && type!=='set-head'` 인 행의 단가에 **가산**, 없으면 `{name:'카드수수료', model:'카드수수료', unit:'식', qty:1, price:fee}` 행을 **새로 생성**(:16675-16679). 호출 좌표 2곳 — 전송/전표 파이프라인 `:9630`, 인쇄/미리보기 파이프라인 `:11362`. **레거시에도 실재**합니다(`tools/legacy-gas/종합견적서/index.html:16172` 정의 · `:9323`·`:11036` 호출 · `:16197` 행 생성). 사용자 도달 경로도 실재 — `index.ejs:1745 <input type="checkbox" id="chkCardPay">`. 🔑병합 결과는 **정확히 같은 종(種)인 AUTO_CUTOFF 를 계열 #72 로 세었으므로**(source=총액의 나머지 → qty=1 행의 단가 차감 또는 신규 생성), 카드수수료를 빼는 것은 자기 자를 어긴 것입니다. 어느 조각이 놓쳤는지 = **비상품/구형 담당 조각**(운임·절삭·AUTO_CUTOFF 세 건만 냈습니다).
- 🚨【누락 2 — 계열】 **선금할인**이 병합 결과에 없습니다. `clients/web/estimate-app/views/index.ejs:2567-2582 applyEstimateTotalAdjustments` — source = rows 총액(`baseTotal`, :2569) × `advanceDiscountRate`(:2571, 기본값 `:2353` 에서 0), target = `{section:'ETC', name:'선금할인', model:'선금할인', unit:'식', qty:1, price:-discount}` **신규 생성**(:2577). 호출 좌표 `:9633`(전송) · `:11363`(인쇄). 도달 경로 = `index.ejs:1738 <input id="payDuePre" type="checkbox"> 선결제 표시`. ⚠️카드수수료와 달리 **레거시에는 없습니다**(`grep -c 선금할인` → legacy 0 · estimate 4 · order 0) — 즉 레거시 이후 estimate-app 이 **새로 만든 계열**이라 "레거시 계승" 목록에서 빠지기 쉬웠고, 실제로 여덟 조각 전부가 놓쳤습니다. 초기값 세팅 관점에서는 계승 대상이 아닐 수 있으나, **estimate 총액을 실제로 바꾸는 자동 qty=1 행**이므로 절삭·카드수수료와 함께 처리 정책을 정해야 합니다.
- 🚨【병합 결과의 계열 내부 오기 — factor 가 estimate 에서 틀림】 계열 #29 `[싱글] 세트 → 구성품 BOM 전개` 가 factor 를 *"세트수량 × 구성품 정의수량(SINGLE_PARTS.qty / bundle_component.default_qty)"* 로 적고 근거로 `estimate index.ejs:5199-5239` 를 들었으나, **estimate 는 구성품 정의수량을 곱하지 않습니다**. `index.ejs:5242-5252` 의 `mapped` 생성부가 `qty: qty`(:5247, 함수 인자 = 세트 수량) 이고 `p.qty` 를 아예 쓰지 않습니다. 반면 `order-app/index.html:3380` 은 `qty: qty * (parseInt(p.qty, 10) || 1)` 로 **곱합니다**. ⟹ 구성품 수량이 1 이 아닌 순간 두 문서가 갈립니다. 오늘 안 보이는 이유는 `bundle_component` 1,584행이 전부 `default_qty=1.00` 이기 때문이며, 이는 **초기값 세팅이 정확히 건드리는 값**입니다. 🔑더 나쁜 것은 estimate 내부 비대칭 — 같은 estimate 가 **상업 세트에서는 곱합니다**(`index.ejs:7244-7248` `finalQty = qtySet * (parseInt(p.qty,10)||1)`, `'Q'` 센티넬은 세트수량 그대로). 즉 estimate 는 싱글 BOM 만 곱셈이 빠져 있습니다. 병합 결과는 이 계열을 "네 곳 독립 구현" 의 대표로 들면서 정작 **웹 두 곳이 서로 다르다는 사실**을 놓쳤습니다.
- 🚨【병합 결과가 보고하지 않은 앱간 차이 — 상업 세트 구성품 0건일 때 줄이 통째로 사라짐】 `estimate index.ejs:7228-7238` 은 `parts.length===0` 이면 **세트 행 자체를 1줄로 반환**합니다(`isSetFallback:true`). `order index.html:4771-4774` 는 같은 조건에서 **`return []`** — 줄이 통째로 사라집니다. 같은 세트를 견적서는 1줄로 보내고 주문서는 0줄로 보냅니다. conflicts 목록 16건 어디에도 없습니다.
- ✅【검증 — conflicts #1·#2 는 사실이고, 병합 결과가 빠뜨린 마지막 한 홉을 채웁니다】 DB 실측 **2026-08-10 15:02 KST** `SELECT e.estimate_category, p.unit, count(*) FROM product_estimate_exposure e JOIN products p ON p.id=e.product_id AND p.is_deleted=false WHERE e.is_deleted=false GROUP BY 1,2` → `COMMERCIAL_MULTI|EA|416` · `SINGLE_SET|EA|288` · `HOME_MULTI|EA|119` · `LEGACY|EA|40`. **전 카테고리에 EA 외의 unit 이 한 행도 없습니다.** 병합 결과가 보이지 않은 연결고리 = `clients/web/estimate-app/lib/db-catalog.js:111` `unit: r.unit || 'SET'`(SINGLE_SETS) · `:78` `unit: r.unit || ''`(COMMULTI). DB 가 'EA' 를 채워 보내므로 `|| 'SET'` 폴백이 **절대 발동하지 않고**, 따라서 `index.ejs:7993 if (unit !== 'SET' && unit !== '식') return;` 과 `index.ejs:8487 String(r.unit).toUpperCase()==='SET'` 이 영구 거짓입니다. estimate 싱글 발통·일자발 = 항상 0, estimate 상업 T형 분기관 + 세트 HP 분해(방진가대 계열 전체) = 항상 0. order 는 두 게이트가 없어(`index.html:5172-5178` · `:5786`) 발화합니다. 두 충돌 모두 CONFIRMED.
- ✅【검증 — conflict #3 은 사실이며 손으로 재유도했습니다】 `estimate index.ejs:8633-8636` 공청 치환: `base.replace(/NUF(K1N|K1NW|DK1N|DK1NW)|WSK3(NW|N)/i, m => m.replace('NUF','NUC').replace('K1','K4'))`. 정규식 대안 순서상 `K1N` 이 먼저 매칭되므로 `PC4NUFK1NW`→`PC4NUCK4NW`, `PC4NUFK1N`→`PC4NUCK4N`. `order index.html:5917-5919` 는 `m.replace(/NBF|NUF/,'NUC')` 만 하므로 `PC4NUFK1NW`→`PC4NUCK1NW`, `PC4NUFK1N`→`PC4NUCK1N`. DB 실측 **15:04 KST**: `PC4NUCK4NW`(COMMERCIAL_MULTI·HOME_MULTI 실재) · `PC4NUCK1N`(실재) · **`PC4NUCK1NW` 와 `PC4NUCK4N` 은 어느 카테고리에도 0건**. ⟹ 정본은 어느 한 앱이 아니라 실재 조합 `{PC4NUCK4NW, PC4NUCK1N}` 이라는 병합 결과의 판정이 정확합니다.
- ✅【검증 — conflict #5(조각 오판 정정)가 옳습니다】 `product_estimate_exposure` 조인으로 재측정(**15:04 KST**): `발통세트`·`AIM-A01N`·`ADP-F075SP`·`AR-EC05`·`AR-EH05`·`AR-KH05`·`AWR-WE13N`·`AWR-WG00N`·`FH-LFHLF`·`FH-LFHLN`·`FH-LFHIF`·`SI-AL600a`·`SI-AL700a` 가 **SINGLE_SET 에 전부 실재**, `FH-*` 3종·`AR-CH01`·`AR-EH05`·`AWR-WE13N`·`AWR-WG00N`·`SI-AL600a`·`SI-AL700a`·`ADP-F075SP`·`AIM-A01N`·`발통세트` 가 **COMMERCIAL_MULTI 에 전부 실재**. E-잔여·E-분기관발통의 `products.product_category` 기반 판정이 오류라는 정정이 재현됩니다. 살아남은 미해소도 재현 — `SI-AL700a` 는 **HOME_MULTI 에 없고** `SI-AL600A`(대문자 A, '실외기 일자발')만 있어 `FOOT_FLAT`(`index.ejs:4523`·`7965-7967`)은 죽은 가지입니다.
- ✅【검증 — 증거 무결성 정정 #14·#15 가 옳습니다】 `git ls-files "clients/**quantitySync*"` → order-app 4개뿐이고 **`clients/web/estimate-app/public/quantitySync.js` 는 main 에 존재하지 않습니다**. estimate-app 전체에 `quantitySync|applyServer` 참조 파일 0개. ⟹ 브리핑 함정 ①의 좌표는 브랜치 `feat/896-qty-sync-chip-track` 에서만 재현되며 인벤토리 문서 3줄이 스스로 `0be8ecd8d` 기준이라 적은 것과 일치합니다. `grep -rEn "\b(optionEquals|optionIn)\b" clients/` → **0건**, 단어경계 없는 grep → **8건**(전부 `optionInput` 류 오탐). 두 정정 모두 CONFIRMED.
- ✅【레거시 전수 훑기 — 여덟 조각이 다 못 본 "계열"은 카드수수료 하나뿐입니다(함수 입도 기준)】 세 소스의 최상위 함수명을 전부 뽑아 대조했습니다: 레거시 **365개** · estimate **389개** · order **312개**. `comm -23 legacy (estimate ∪ order)` → 레거시에만 있는 함수는 **3개뿐**이고 전부 로더입니다 — `loadInitialData`(legacy:8897) · `initDataLayer`(:8934) · `runHeavyInit`(:9007). ⟹ **레거시의 수량 규칙 함수 중 두 앱이 통째로 떨어뜨린 것은 없습니다.** 카드수수료가 누락된 이유는 함수가 사라져서가 아니라(estimate 에 그대로 있음) 조각들이 "총액→qty1 자동행" 축을 절삭 하나로만 본 탓입니다.
- ✅【구형 탭 = 인벤토리의 "estimate 구형 1" 은 운임/절삭이 맞습니다】 `oldQty.set` 호출 좌표는 estimate 전체에 **2곳뿐** — `index.ejs:7546`(사용자 수량 입력) 과 `:7526 handleFreightInput(e, isCut, oldCustomPrices, oldQty, item.model, syncOldTotals)`. 파생 계산이 하나도 없습니다. DB 실측 15:02 KST `LEGACY` 노출 40행. ⟹ 병합 결과가 구형을 별도 탭 계열로 세지 않고 [비상품] 운임·절삭의 배선 좌표(`5921·6399·6930·7526`)에 흡수한 것은 **정확**하며, 구형 누락 아님을 확인했습니다.
- ✅【시스템제습기는 미계승이 아니라 레거시 잔재입니다 — 병합 결과의 unresolvedCodes 항목을 한 단계 확정】 `AY047BA1SBA`(시스템제습기 본체)·`PC1DWSK1`(시스템제습기 판넬) 둘 다 **HOME_MULTI 노출에 실재**(15:04 KST). 그러나 참조를 세 소스에서 전수 grep 한 결과 **레거시도 선언·대입만** 합니다 — legacy `:2194-2195` 선언, `:8962-8963` 대입, **사용처 0건**. estimate `:2362-2363`, order `:1467-1468` 도 같습니다. ⟹ "두 앱이 제습기 계열을 빠뜨렸다" 가 아니라 **레거시에서부터 배선된 적이 없는 상수**입니다. 계열로 셀 것이 아니라 정리 대상으로 올리는 게 맞습니다.
- 🚩【인벤토리 45 는 애초에 "하나씩 대조"가 불가능합니다 — 문서에 계열 목록이 없습니다】 `docs/dev-reports/2026-08-10-896-quantity-sync-full-inventory.md` 전문 178줄을 읽었습니다. §1 이 주는 것은 탭별 표(estimate 홈13/싱글11/상업12/구형1=37 · order 홈16/싱글5/상업9/구형0=30)와 `짝35+estimate전용10=45` 라는 **집계뿐**이고, 45개 계열의 개별 이름·source·target 은 **어디에도 열거돼 있지 않습니다**. ⟹ 브리핑이 요구한 "45계열과 하나씩 대조"는 이 문서 단독으로는 수행 불가이며, 제가 대신 **탭 단위 재구성 + 소스 전수 훑기**로 갈음했습니다. 병합 결과가 "45 를 믿지 말고 다시 세라"는 지시를 따른 것은 옳았으나, 대조 불가라는 사실 자체를 명시하지 않았습니다.
- 🚩【병합 결과의 재계수 서사가 한 방향만 설명합니다 — 싱글은 늘어난 게 아니라 줄었습니다】 인벤토리 estimate 싱글 **11** vs 병합 결과 싱글 **5**. 병합 결과 summary 는 차이를 전부 "입도 확대(버킷 단위)"로 설명하는데, 싱글만 **축소**된 것을 다루지 않습니다. 제가 확인한 estimate 싱글의 파생 target 은 정확히 4개입니다 — `singleQty.set` 파생 좌표가 `index.ejs:8006`(SS_FOOT_ROUND) `:8007`(SS_FOOT_FLAT) `:8023`(SS_WIRED_BOARD) `:8031`(SS_CEILING_PUMP) 뿐(나머지 `:6455`·`:7770`·`:7772` 는 사용자 입력, `:18864` 는 역방향). ⟹ 인벤토리의 11 은 BOM 내부 옵션 축을 쪼개 센 것으로 보입니다 — `explodeSetParts` 의 포함 판정 `index.ejs:5227-5239` 이 **판넬 선택 · 리모컨 옵션집합 · 자재 포함(#ss_mat) · 발통/숨김자재 제외** 4축을 각각 다르게 굴립니다. 병합 결과는 판넬을 12·15 버킷으로 쪼개면서 BOM 4축은 1로 뭉쳐 **자기 자를 두 방향으로 다르게 적용**했습니다. 계열 총계를 다시 낼 때 이 축을 먼저 고정해야 합니다.
- 🚩【병합 결과 내부 산수 — 72 는 목록 73개 중 하나를 빼야만 맞습니다】 `canonicalRules` 배열 실제 항목 수 **82** = 계열 표기 항목 **73** + `[변형층·계열 아님]` **9**. `totalFamilies: 72` 와 맞추려면 6번째 항목 `[홈] 유연호스 I형 4WAY 강제 0 / 일자발 FOOT_FLAT 강제 0`(reason 에 *"🚩계열로 세지 않았으나(source 없음)"* 자기선언)을 빼야 합니다. 모순은 아니지만 **목록을 세면 73 이 나오므로** 다음 대조자가 반드시 걸립니다. 표기로 못박을 것.
- 📌【제가 직접 센 숫자】 병합 결과의 자(= source 모집합·target 품목군·지배 옵션축이 같은 업무 관계 하나)를 그대로 쓰면 — 병합 결과 목록 **73**(집계 72) → 여기에 **카드수수료 +1 · 선금할인 +1** ⟹ **75 목록 / 74 집계**. 탭별로는 홈 24(집계 23) · 싱글 5 · 상업 40 · 비상품 **5**(운임·절삭·AUTO_CUTOFF·카드수수료·선금할인) · 역방향 1. 변형층은 병합 결과 9건에 **explodeSetParts 세트수량 곱셈 유무(estimate↔order)** 와 **explodeCommSets_ 빈 구성품 폴백(estimate 1줄 vs order 0줄)** 을 더해 **11건**. 🚫 "빠진 것 없음" 이라고 답할 수 없습니다.

### 양방향 지정이 실제로 가능한가 — quantity_sync_rule 스키마·서버 validator/DTO·관리자 UI 가 "부자재에서 본체들을 고르는 작성"과 "본체에서 부자재를 고르는 작성" 둘 다를 담을 수 있는지, sources/targets 가 복수인지, 한 방향만 된다면 다른 방향에 무엇이 필요한지 (적대검증)

**판정** — 🚩 **양방향 '작성'은 스키마상 가능하지만, 실제로는 어느 방향으로도 불가능하다 — 작성 UI 가 0줄이기 때문이다.**

세 층으로 갈라 답합니다.

**① 스키마 — 통과.** 방향 컬럼이 아예 없어 표현이 `Σ(source×factor) → target` 하나뿐이고(V24:8-39, DB 실측 2026-08-10 15:00:18 KST), 두 작성 방향이 같은 행으로 정규화됩니다. `sources` 복수 ✅ `targets` 복수 ✅ 상한 없음(QuantitySyncRuleRequest.java:39-40). **합산 요건 충족.** 스키마 확장은 필요 없습니다.

**② 서버 — 정규화는 하지만 방향을 비대칭으로 취급한다.** DTO/validator 는 방향을 구분하지 않고 하나로 정규화합니다. 그러나 세 군데가 비대칭입니다 — ⓐ 역방향을 **별개 규칙으로** 만들면 순환으로 거부되고, 이는 `QuantitySyncRuleExistingRuleAliasIntegrityIT.java:84-88` 의 대조군이 *의도 동작으로 고정*한 계약입니다(같은 규칙을 PUT 으로 뒤집는 것만 허용 — CrudIT.java:86). ⓑ **BUNDLE 가드가 단방향**이라 하필 개발책임자가 원하는 본체→부자재 쪽만 막힙니다 — 실측으로 `AWR-WE13N` 이 65개 BUNDLE 의 구성품이고 병합 보고가 지목한 1Way 세트 **11개가 전부 포함**되어(15:05:57 KST), 같은 source 로 AIM-A01N 은 저장되고 AWR-WE13N 은 거부됩니다. ⓒ 역방향의 유일한 레거시 선례는 집계가 **MAX** 인데 `CHECK (aggregation='SUM')` + enum 단일값으로 삼중 차단됩니다.

**③ UI/API — 여기가 진짜 결론.** `grep -rniE "quantity[-_ ]?sync" clients/desktop/src` → **0줄**. 브리핑이 지목한 `EstimateItemsCatalogPage.tsx` 는 1,860줄인데 참조 0건이고, 생성/수정/삭제 호출이 클라이언트 전체에 없습니다. **"관리자 UI 가 어느 방향으로 작성하게 돼 있는가" 의 답은 "어느 방향으로도 작성하게 돼 있지 않다"** 입니다. 게다가 본체측 방향을 열면 API 에 source 추가 연산이 없어(POST/PUT/DELETE 뿐) **남의 규칙을 통째로 읽어 되쓰는 구조**가 강제되는데 version/etag 가 없어 **lost update 가 우연이 아니라 필연**입니다.

**PM 께 올리는 판정 요청 2건** — (1) *"반대로 지정"* 이 **작성 진입점 두 개**를 뜻하는지(현 구조로 충분, UI 만 만들면 됨) 아니면 **두 방향 규칙의 동시 존재**를 뜻하는지(테스트 3건이 고정한 순환 계약을 바꿔야 함). (2) 유선리모컨 본체 `AWR-WE13N` 이 별도 sync 규칙을 필요로 하는지 — 필요하다면 BUNDLE 가드 때문에 **현재 저장 불가**이며, 저는 이것을 미계승 계열로 단정하지 않고 판정 사항으로 남깁니다.

**증거 무결성 정정 1건**: 이 워크트리 HEAD 는 **dc9db5dfeb10a9e86615c15f563eae67f9d0a873** 로, 병합 보고가 적은 22427d9c6·d1ea74c51 과 다릅니다. 위 좌표는 전부 dc9db5dfe 기준입니다.

**소스 수정·commit·재배포·DB 쓰기 없음** — DB 는 읽기 전용 psql 조회만 수행했습니다.

- 【기준·측정 시각】 워크트리 D:/dev/Samhan-Public/.claude/worktrees/wmain, HEAD **dc9db5dfeb10a9e86615c15f563eae67f9d0a873** (병합 보고가 적은 22427d9c6·d1ea74c51 과 다름 — 이 조사의 모든 좌표는 dc9db5dfe 기준입니다). DB 실측은 `docker exec samhan-postgres psql -U samhan -d product_db`, `now()` 원문 **2026-08-10 15:00:18 / 15:05:18 / 15:05:34 / 15:05:57 KST**. `quantity_sync_rule` / `quantity_sync_source` / `quantity_sync_target` 은 15:00:18 과 15:05:20 두 시점 모두 **0행** — 아직 어느 방향으로도 세팅된 규칙이 없습니다.
- 【핵심 답 ①·스키마】 **스키마에 방향 축이 아예 없다 — 표현은 하나뿐이고, 그래서 양방향 '작성'은 스키마 확장 없이 가능하다.** `quantity_sync_rule` 18개 컬럼(V24__quantity_sync_rule_schema.sql:8-39, information_schema 실측 15:00:18 KST) 어디에도 direction/reverse/side 컬럼이 없고, 저장 표현은 항상 `Σ(source×factor) → target×multiplier` 하나입니다. ⟹ 부자재 화면에서 본체들을 고르든 본체 화면에서 부자재를 고르든 **같은 행 모양으로 정규화**됩니다. 개발책임자 정의(*"의미는 본체→부자재 하나"*)와 스키마가 일치하므로, 양방향 요구는 **스키마 문제가 아니라 순수 UI/API 문제**입니다. 이 판정이 이하 모든 발견의 전제입니다.
- 【핵심 답 ②·복수성】 **sources 복수 ✅ · targets 복수 ✅ · 상한 없음.** `QuantitySyncRuleRequest.java:39-40` 이 `@NotEmpty List<@Valid SourceRequest> sources` / `targets` 이고 `@Size(max=)` 상한이 없습니다. DB 는 `ux_qss_rule_source_active(rule_id, source_product_id)`(V24:88-90) 로 **한 규칙 안 중복만** 막고 개수는 제한하지 않습니다. Validator:212-214 도 `sources.isEmpty() || targets.isEmpty()` 만 거부. ⟹ 1WAY 실내기 34모델 같은 큰 source 모집합을 한 규칙에 담을 수 있어 **합산 요건은 충족**합니다. 다만 비대칭 하나 — `display_order` 는 target 에만 있고 NOT NULL·규칙 내 unique(V24:64·100-102)인 반면 source 에는 순서 축이 없습니다.
- 🚨【역방향은 별개 규칙으로 만들 수 없다 — 테스트로 고정된 의도 동작】 `QuantitySyncRuleValidator.java:398-448 rejectCycles` 가 활성·enabled 규칙 전체로 간선 그래프를 만들어 순환을 거부합니다. 결정적 증거는 기존 테스트의 **대조군**입니다 — `QuantitySyncRuleExistingRuleAliasIntegrityIT.java:84-88` 이 주석 *"대조군 — modelCode(원표기)로 역방향을 시도하면 여전히 순환으로 거부된다"* 와 함께 `hasMessageContaining("순환")` 을 단언합니다. 나아가 `QuantitySyncRuleProductDiscontinueIT.java:320 동시_반대_규칙_생성도_활성_그래프에_순환을_남기지_않는다` 가 동시 생성 경합까지 advisory lock 으로 막아 **활성 그래프에 양방향이 남지 않음을 보증**합니다. ⟹ 한 품목 쌍에 대해 **전역적으로 한 방향만** 저장 가능합니다. 개발책임자의 *"반대로 지정해 놓더라도 동작 가능"* 이 '두 방향을 동시에 걸어 둔다'는 뜻이라면 **현재 구조는 그것을 명시적으로 금지**하고 있으므로 의미 확정이 필요합니다.
- 【"반대로 지정"의 유일한 합법 경로 = 같은 규칙을 PUT 으로 뒤집기】 `QuantitySyncRuleCrudIT.java:86-107 기존_규칙의_source_target을_맞교환해도_순환으로_거부되지_않는다` 가 A→B 규칙을 같은 ruleKey 로 B→A 로 **교체**하는 것을 허용함을 실 서비스+실 Postgres 로 고정합니다. ⟹ 반대 지정은 **'대체'만 가능하고 '추가'는 불가**. 이는 개발책임자 정의(의미는 본체→부자재 하나)와는 정합하지만, 관리자가 '양쪽에서 편하게 지정'하는 UX 로 읽으면 오해 소지가 큽니다.
- 🚨🚨【브리핑 질문에 대한 직답 — 관리자 UI 는 어느 방향으로도 작성하게 돼 있지 않다】 `grep -rniE "quantity[-_ ]?sync" clients/desktop/src` → **0줄**. 브리핑이 지목한 `EstimateItemsCatalogPage.tsx` 는 **1,860줄인데 sync 참조 0건**이고, `clients/desktop/src/renderer/api/` 에 수량동기화 API 파일이 없습니다(`sheetSyncApi.ts` 는 시트 sync 로 무관). 클라이언트 전체에서 이 API 를 쓰는 곳은 order-app 의 **읽기 한 곳뿐**(`clients/web/order-app/src/samhanApi.ts:190` — GET `/quantity-sync-rules`, `estimateCategory: 'SINGLE_SET'` 고정). ⟹ **생성/수정/삭제 호출 0건**. 초기값 세팅은 현재 **API 직접 호출로만** 가능하며, '양방향 작성 UI' 는 한 방향조차 존재하지 않습니다.
- 🚨【본체 쪽 작성 제스처를 담을 API 원시연산이 없다 → 구조적 lost update】 `QuantitySyncRuleController.java:41-83` 의 엔드포인트는 GET(목록)·GET(단건)·POST(전체 생성)·PUT(전체 교체)·DELETE **5개뿐이고 PATCH 도 하위 리소스도 없습니다**. 즉 "이 본체를 부자재 X 규칙의 source 로 **추가**" 하는 연산이 없어, 본체측 작성은 반드시 **남의 규칙 전체를 읽어 통째로 다시 PUT** 하는 read-modify-write 가 됩니다. 그런데 `QuantitySyncRuleRequest`/`QuantitySyncRuleResponse` 어디에도 **version·etag 가 없고**, `QuantitySyncRuleService.java:306-328 replace()` 는 `findByRuleKeyForUpdate` + advisory lock 으로 **트랜잭션만 직렬화할 뿐 stale read 를 검출하지 않습니다**. ⟹ 관리자 둘이 서로 다른 본체를 같은 부자재에 붙이면 **나중 PUT 이 앞 사람의 source 를 조용히 지웁니다**. 이는 우연한 경합이 아니라 **본체측 작성 방향이 강제하는 패턴**이라, 그 방향을 열면 반드시 밟습니다.
- 【부자재로 규칙을 역인덱스할 조회가 서버엔 있는데 노출돼 있지 않다】 본체측 작성 UI 는 먼저 "이 부자재를 target 으로 하는 규칙이 이미 있나" 를 물어야 하는데, `QuantitySyncRuleController.java:43-49 list()` 는 `estimateCategory` 만 받습니다. 정작 서버에는 `QuantitySyncRuleService.java:146 findEnabledRuleKeysReferencing(UUID productId)` 가 이미 있으나 **품목 단종/삭제 차단 사유 표시 전용**이고 컨트롤러에 노출되지 않습니다. ⟹ UI 는 카테고리 전체를 받아 스캔해야 합니다(응답이 sources/targets 의 productCode·factor·multiplier·roundingMode·displayOrder 를 모두 실어 주므로 — `QuantitySyncProductRef.java:6-8` — 재구성 자체는 가능). 노출만 하면 되는 낮은 비용 항목입니다.
- 🚨【본체별로 한 품목씩 = 별개 규칙 N개 로 가면 REPLACE 계열이 두 번째 품목에서 막힌다】 `QuantitySyncConflictPolicy.java:3` 이 이 축을 명시적으로 *"동일 target에 여러 규칙이 기여할 때의 충돌 정책"* 이라 정의합니다. `QuantitySyncRuleValidator.java:307-316` 은 (다른 ruleKey · 둘 다 enabled · **둘 다 REPLACE** · 같은 category · jsonb-equal condition · target 겹침) 이면 400 `"동일 condition의 REPLACE target이 중복됩니다."` 로 거부하며 `QuantitySyncRuleReplaceDuplicateJsonbNumericEqualityHttpIT.java:129` 이 이를 고정합니다. 병합 보고상 레거시 다수 계열이 **대입(REPLACE)** 의미(호스·펌프·발통이 `set()`)이므로 **본체별 지정은 2번째 본체에서 차단**됩니다. ADD 계열은 N규칙이 통과하지만 아래 evaluator 부재 때문에 'ADD 누적'과 'SUM 합산'이 같은 수를 내는지 확인할 코드가 **존재하지 않습니다**.
- 🚨🚨【BUNDLE 가드가 단방향이고, 하필 개발책임자가 원하는 방향이 막히는 쪽이다 — 실 카탈로그로 도달 확인】 `QuantitySyncRuleValidator.java:262-279` 는 `source 가 BUNDLE 이고 target 이 그 BUNDLE 의 구성품` 이면 거부하지만, **반대(구성품 source → 그 BUNDLE 부모 target)는 어떤 검사도 하지 않습니다**. 실측(15:05:34·15:05:57 KST): `AWR-WE13N` 은 **65개 BUNDLE 의 구성품**이고, 그 안에 병합 보고가 `[싱글] 1Way 세트 → AIM-A01N` 계열의 source 로 지목한 **11개 세트가 전부 포함**됩니다(AC023CS1DBC1SY·AC023CS1PBH1SY·AC032CS1DBC1SY·AC032CS1PBH1SY·AC040CS1DBC1SY·AC040CS1PBH1SY·AC052CS1DBC1SY·AC052CS1PBH1SY·AC060CS1DBC1SY·AC060CS1PBH1SY·AC072CS1DBC1SY). `AR-EC05` 12건·`AR-EH05` 50건도 같은 구조(부모는 전부 SINGLE_SET 노출 BUNDLE). ⟹ 같은 11개 세트를 source 로 두고 target 을 **AIM-A01N 으로 하면 저장되고**(AIM-A01N·발통세트·SI-AL700a·ADP-F075SP 는 bundle_component **0건**, 15:05:18 KST), **AWR-WE13N 으로 하면 거부**됩니다. 유선리모컨 본체와 그 키트는 레거시에서 같은 분기의 짝인데 **한쪽만 표현 가능**합니다. ※ 병합 보고의 72계열 목록 자체에 '세트→AWR-WE13N' 항목은 없으므로, 이 짝이 별도 규칙을 필요로 하는지(아니면 세트 BOM 구성품 교체로 처리되는지)는 **개발책임자 판정 사항**으로 올립니다 — 제가 미계승 계열로 단정하지 않았습니다.
- 【역방향의 유일한 레거시 선례는 스키마가 못 담는다】 병합 보고의 `[역방향] 세트 구성품 → 세트 본체` 는 집계가 **MAX**(estimate index.ejs:18841-18877)인데, `V24:28 CONSTRAINT chk_qsr_aggregation CHECK (aggregation = 'SUM')` + `QuantitySyncRuleValidator.java:199-201` + `QuantitySyncAggregation.java` (enum 값이 `SUM` **하나뿐**) 로 SUM 외가 삼중 차단됩니다. ⟹ 개발책임자께서 *"반대로 지정해도 동작 가능"* 이라 하신 것의 **유일한 레거시 선례를 현 스키마로는 그대로 담을 수 없습니다**. 역방향을 진짜로 지원하려면 aggregation 확장이 선행 조건입니다.
- 【evaluator 부재 재확인 — 방향 논쟁 이전의 층】 `grep -rn "evaluate" services/product-service/src/main/java/com/samhanair/logis/product/` → **0건**. 서버에 저장된 규칙을 수량으로 바꾸는 코드가 아예 없고, `QuantitySyncRuleService` 클래스 주석도 *"evaluator를 호출하거나 기존 견적·주문 수량을 변경하지 않는다"* 라 스스로 적습니다. 클라이언트 유일 소비자인 `clients/web/order-app/src/quantitySync.ts` 도 S-03 한 규칙 전용이며 조건 있는 규칙을 거부합니다(`when` 의 키가 하나라도 있으면 `'S-03 규칙은 조건 없는 설정만 지원합니다.'`). ⟹ **어느 방향으로 세팅하든 지금은 화면 수량이 바뀌지 않습니다.**
- 【부수 — read-modify-write 를 강제하는 순간 같이 터지는 지점】 `QuantitySyncRuleService.java:551·559 toResponse()` 는 참조 품목을 못 찾으면 `productCode` 를 **null** 로 내보냅니다(품목명만 `(삭제된 품목)`). 본체측 작성이 강제하는 read-modify-write 는 이 응답을 그대로 PUT 으로 되돌려 보내는데 `QuantitySyncRuleRequest.SourceRequest.productCode` 가 `@NotBlank` 라 **400** 입니다. ⟹ 규칙 안에 삭제·비노출 품목이 하나라도 섞이면 **다른 본체를 추가하는 것 자체가 불가능**해집니다(Validator:376-383 이 어차피 inactive/invisible 을 거부하므로 자가 치유 경로도 없음).
- 【다른 방향을 지원하려면 무엇이 필요한가 — 스키마 변경은 사실상 불필요, 나머지가 전부】 ① **스키마 변경 0** (방향 축이 없으므로 본체측 작성도 같은 행으로 정규화됨) — 단 진짜 역방향(부자재→본체)을 원한다면 `chk_qsr_aggregation` 과 `QuantitySyncAggregation` enum 확장이 필요. ② **source 추가/제거 원시연산 신설** — `PATCH /api/v1/quantity-sync-rules/{ruleKey}/sources` 또는 PUT 에 version 토큰. 이것 없이는 lost update 를 구조적으로 못 막음(발견 7). ③ **target 역인덱스 조회 노출** — 서버 메서드는 이미 존재, 컨트롤러 노출만(발견 8). ④ **본체측 진입 시 규칙이 아직 없을 때의 ruleKey 자동 명명 규칙** — ruleKey 는 `^[A-Za-z0-9_-]+$` 전역 unique(V24:38·80-82)라 UI 가 생성해 주지 않으면 관리자가 키 문자열을 직접 입력해야 함. ⑤ **작성 UI 2종 신설**(현재 0). ⑥ **양방향 동시 존재를 허용할지 결정** — 허용하려면 순환 정책 재정의가 필요하고, 이는 테스트 3건(CrudIT:86 / AliasIntegrityIT:84 / DiscontinueIT:320)이 고정한 계약을 바꾸는 일이라 개발책임자 판정 사항.

---

# 수량 동기화 초기값 세팅 계획 (#896) — 개발책임자 보고

## 0. 기준 · 측정 원천 (증거 무결성)

| 항목 | 값 |
|---|---|
| 워크트리 | `D:/dev/Samhan-Public/.claude/worktrees/wmain` |
| HEAD | **`dc9db5dfeb10a9e86615c15f563eae67f9d0a873`** (`git status` = untracked 문서 1건 외 clean, 15:13:32 KST) |
| 병합보고 기준과의 차이 | 병합보고는 `22427d9c6`/`d1ea74c51`, 각도 검증은 `dc9db5dfe`. `git log --oneline d1ea74c51..dc9db5dfe -- clients/ services/ tools/` **무출력** — 코드 드리프트 없음 |
| DB | `docker exec samhan-postgres psql -U samhan -d product_db` (회사PC), **읽기 전용** |
| 이 보고서의 재측정 시각 | **2026-08-10 15:13:33 ~ 15:19:08 KST** (PM 직접 실행, 릴레이 아님) |
| 구글 시트 | **접근하지 않았습니다.** 저장소에 커밋된 레거시 소스 `tools/legacy-gas/종합견적서/index.html` 를 정본으로 삼았습니다 |
| 규칙 테이블 현황 | `quantity_sync_rule` / `_source` / `_target` **전부 0행** (15:13:33 KST) — 아직 어느 방향으로도 세팅된 규칙이 없습니다 |

> 이 보고서에서 **PM 이 직접 재측정한 것**은 각 문장에 시각을 붙였습니다. 각도 검증자의 측정을 그대로 옮긴 것은 **[각도N 측정]** 으로 표시했고, 검증자가 "판정 불가"로 남긴 것은 **확정하지 않았습니다.**

---

## 1. 한 줄 결론

> **계열은 74개(목록 75)인데, 지금 관리자 API 로 실제 저장까지 되는 것은 9계열(12%)뿐이고 — 그 9개조차 화면 수량을 바꾸지 않습니다(서버·클라이언트 양쪽에 evaluator 가 없음). 나머지 65계열은 ①옵션 평가기 부재 55 ②품목코드 미해소 11(계열 4개에 걸침) ③모델코드 미특정 7 ④앱 간 정본 미정 4 ⑤스키마 표현 불가 11 의 다섯 벽에 막혀 있습니다.**

숫자를 세 가지 입도로 함께 둡니다 — 셋 다 같은 표면입니다.

| 입도 | 개수 | 쓰임 |
|---|---|---|
| 골든 케이스 ID(H-01~08 · C-01~09 · S-01~03) | 약 22 | 회귀 테스트 단위 |
| 인벤토리 문서 §1 집계(`짝35+estimate전용10`) | 45 | 과거 추정치 — **개별 목록이 문서에 없어 하나씩 대조 불가**(각도2 가 178줄 전문 확인) |
| **source 버킷 = 규칙 1행** | **74** (목록 75) | **← 이번 세팅의 작업 단위** |

---

## 2. 🚨 적대검증이 뒤집은 것 — 먼저 읽으십시오

### 뒤집힌 것 ① 상업 판넬 8개는 "실재"가 아닙니다 — 병합보고 정정 (PM 재측정 확정)

병합보고는 *"20개 상업 전용 판넬 코드 전부 COMMERCIAL_MULTI 노출 실재"* 라고 적었습니다. **틀렸습니다.**

PM 직접 측정 (**15:13:39 KST**):

```
COMMERCIAL_MULTI|BOTH|408
COMMERCIAL_MULTI|NONE|  8      ← 노출행은 있는데 카탈로그에서 빠짐
HOME_MULTI      |BOTH|119
SINGLE_SET      |BOTH|288
LEGACY          |BOTH| 40
```

카탈로그 API 는 노출행만 보지 않고 `AND p.usageScope IN :scopes` 를 한 겹 더 겁니다 — `ProductRepository.java:279-292 findExposedCatalog`, 호출자가 넘기는 scope 는 `List.of(scope, UsageScope.BOTH)`(`web/EstimateCatalogInternalController.java:250-251`). 그래서 **노출 416 ≠ 카탈로그 408** 입니다.

**근본 원인까지 확정했습니다** (각도1 은 "시트 sync 잔재"까지만 갔습니다). 15:17:07 KST 에 display_order 236~253 판넬 블록을 그대로 뽑으니:

| display_order | model_code | usage_scope | **product_category** |
|---|---|---|---|
| 238 | PC4NUFK1NW | BOTH | HOME_MULTI |
| **239** | **PC4NBFK1NW** | **NONE** | **SINGLE_PART** |
| **240** | **PC4NUXK1NW** | **NONE** | **SINGLE_PART** |
| 241 | PC4NUCK4NW | BOTH | HOME_MULTI |
| 245 | PC6NUDK1NW | BOTH | HOME_MULTI |
| **246~248, 250~252** | PC6NUNK1NW · PC6NBDK1NW · PC6NBNK1NW · PC6EUCK1NW · PC6NUXK1NW · PC6EUXK1NW | **NONE** | **SINGLE_PART** |

그리고 전수 교차표(**15:17:17 KST**) — **`product_category='SINGLE_PART'` 345건은 예외 없이 전부 `usage_scope='NONE'`** 입니다.

```
COMMERCIAL_MULTI|BOTH|342     SINGLE_PART|NONE|345     SINGLE_SET|BOTH|276
HOME_MULTI      |BOTH|119     OLD        |BOTH| 37     (분류없음)|NONE|1942
```

⟹ **원인은 시트에서 이 8개 판넬이 `SINGLE_PART`(싱글 부자재)로 분류된 것**이고, 그 분류의 탭 매핑이 `usageScope=NONE` 입니다. 여덟 전부 `usage_scope_manual=false` · `modified_at` 이 동일한 `2026-07-30 13:07:32.757352`(시트 sync 1회 실행), 이름은 정상(`판넬 무풍4Way(블랙 WIFI)` 등), `status=ACTIVE`(15:14:05 KST).

🚨 **손으로 고치면 다음 sync 가 되돌립니다.** `ProductSheetSyncService.java:1373 if (!p.isUsageScopeManual())` 이 전체 블록을 감싸고 있습니다. 같은 파일 `:1383-1390` 의 보호 장치(`losesVisibility` → `findEnabledRuleKeysReferencing`)는 **이미 활성 규칙이 참조 중인 품목만** 지켜 주므로, 규칙이 0개인 지금은 아무 보호가 없습니다.

### 뒤집힌 것 ② 브리핑 함정 ①의 "조용한 전멸" 은 **저장 시점에는 발화하지 않습니다** — 크게 실패합니다

각도1 이 자기 초기 가설을 스스로 뒤집었고, PM 이 코드로 재확인했습니다:

| 상황 | 서버 반응 | 좌표 (PM 확인) |
|---|---|---|
| `usage_scope='NONE'` 품목 연결 | 400 `"삭제되었거나 비노출인 Product는 연결할 수 없습니다."` | `quantitysync/QuantitySyncRuleValidator.java:380-381` |
| `products` 에 없는 코드 | `PRODUCT_NOT_FOUND` `"품목을 찾을 수 없습니다: <code>"` | `service/QuantitySyncRuleService.java:408-409` |
| 다른 카테고리 품목 연결 | 400 `"category 안에서만 source/target을 연결할 수 있습니다."` | `Validator:288` |
| `aggregation ≠ SUM` | 400 `"aggregation은 SUM만 허용됩니다."` | `Validator:199-200` |

⟹ 좋은 소식이자 나쁜 소식입니다. **조용히 45개가 다 죽지는 않지만, 미해소 11건은 지금 어떤 경로로도 규칙에 넣을 수 없습니다.** 초기값 세팅 스크립트는 그 지점에서 **멈춥니다**.

전멸 함정 자체는 **브랜치 `origin/feat/896-qty-sync-chip-track` 에서만 재현**됩니다 — `clients/web/estimate-app/public/quantitySync.js` 는 `origin/main` 에 **존재하지 않고**(PM `grep -rln "quantity-sync\|quantitySync" clients/web/estimate-app` → **0건**), 인벤토리 문서 3줄이 스스로 `0be8ecd8d` 기준이라 적었습니다. 문서를 인용할 때는 **브랜치명을 함께** 적어야 합니다.

### 뒤집힌 것 ③ 계열 2건이 통째로 누락돼 있었습니다 — 72 → 74

각도2 가 레거시 함수 365개를 전수로 훑어 찾았고, PM 이 좌표를 직접 열어 확인했습니다.

- **카드수수료** — `clients/web/estimate-app/views/index.ejs:16651 applyCardFeeLogic(rows)` (호출 `:9629` 전송 · `:11362` 인쇄), 행 생성 `:16676 name:'카드수수료', model:'카드수수료', unit:'식'`. **레거시에도 실재** `tools/legacy-gas/종합견적서/index.html:16172`(호출 `:9323`·`:11036`). 도달 UI `index.ejs:1745 <input id="chkCardPay">`.
- **선금할인** — `index.ejs:2567-2582 applyEstimateTotalAdjustments`. PM 이 원문 확인: `const discount = -Math.round(baseTotal * advanceRate);` → `rows.push({section:'ETC', name:'선금할인', model:'선금할인', unit:'식', qty:1, price:discount, …})` (`:2571`·`:2577`). 호출 `:9633`·`:11363`, 도달 UI `:1738 #payDuePre`. **레거시 0건** — estimate-app 이 이후에 새로 만든 계열입니다.

🔑 병합보고는 **정확히 같은 종(種)인 AUTO_CUTOFF 를 계열로 세었으므로**, 이 둘을 뺀 것은 자기 자를 어긴 누락입니다.

### 뒤집힌 것 ④ 병합보고의 factor 기재가 estimate 에서 틀렸습니다 — 초기값에 직결

병합보고 계열 #29(싱글 BOM 전개)가 factor 를 *"세트수량 × 구성품 정의수량"* 이라 적고 `estimate index.ejs:5199-5239` 를 근거로 들었으나, PM 이 원문을 열어 보니:

| 좌표 | 코드 | 곱셈 |
|---|---|---|
| `estimate index.ejs:5247` (싱글 BOM) | `qty: qty,` | ❌ **안 곱함** |
| `order index.html:3380` (싱글 BOM) | `qty: qty * (parseInt(p.qty, 10) \|\| 1),` | ✅ 곱함 |
| `estimate index.ejs:7248` (상업 BOM) | `finalQty = qtySet * (parseInt(p.qty,10) \|\| 1);` | ✅ 곱함 |

⟹ **estimate 는 싱글 BOM 에서만 곱셈이 빠져 있고**, 오늘 안 보이는 이유는 `bundle_component` 1,584행이 **전부 `FOLLOW_SET` · `default_qty` min=max=1.00** 이기 때문입니다(PM 실측 **15:15:13 KST**). **그 값이 바로 이번 세팅이 건드릴 값입니다.**

### 뒤집힌 것 ⑤ 양방향 — 스키마는 방향이 없고, 막는 것은 UI 와 BUNDLE 가드입니다 (§6 상술)

### 뒤집힌 것 ⑥ 병합보고의 `SI-AL600A`↔`SI-AL600a` 뭉침 우려는 **하향**

각도1 이 세 카탈로그 각각에서 uppercase 충돌을 전수로 셌습니다 — HOME_MULTI 119→distinct 119 · COMMERCIAL_MULTI 408→408 · SINGLE_SET 288→288, **충돌 0건** [각도1 측정 15:03:39 KST]. 평가기는 카테고리별 배열 하나만 받으므로 한 평가 안에서 두 행이 뭉치지 않습니다. 남는 것은 **"어느 행을 쓸지" 업무 판정**이지 계산 오염이 아닙니다.

---

## 3. 규칙 표 전수 — 74계열(목록 75) + 변형층 11

**가능 여부 범례** — ✅저장 가능 / 🔵옵션 평가기 필요 / 🟠모델코드 미특정 / 🔴정본 미정(앱 충돌) / ⛔코드 부재 / ⬛스키마 표현 불가

### 3-1. 홈멀티 — 24목록 / **23계열** (H06 은 source 가 없어 계열로 세지 않음)

| # | family | sources | target | factor | condition | apps | 가능 | 근거(파일:줄) |
|---|---|---|---|---|---|---|---|---|
| H01 | 1WAY 실내기 → 유연호스 1WAY군 | **34모델** (`AJ###BN1PBC#`·`MB1PBC#`·`CN1FBC1`·`CN1UBC1` 계열) | `FH-LFHLF` ↔ `FH-LFHIF` | 합×1, REPLACE | `#home_no_hose=false` ∧ (`#home_hose_i`/`CONFIG.showIHose`) | est·ord | 🔵 | est `index.ejs:8336-8368` · ord `index.html:5627-5658` |
| H02 | 4WAY(8)+360(8) → 유연호스 L형 4WAY | 16모델 | `FH-LFHLN` | 합×1, REPLACE | `#home_no_hose=false` | est·ord | 🔵 | `:8343-8372` · `:5640-5661` |
| H03 | 잔여 실내기 차감식 → Y형 분기관 | `indoorCount(56) − 단배관 실외기 5 − AJ060MXHNBC1` | `AXJ-YA1509N` | **차감식** `max(0,·)` + 게이트 `iCnt≥2 && sOut>0` | `#home_no_branch=false` | est·ord | ⬛ | `:8314-8329` · `:5497-5539` |
| H04 | 6HP 단배관 실외기 → Y형 분기관 | `AJ060MXHNBC1` | `AXJ-YA2512N` | 합×1 + **타 집합 게이트** | `#home_no_branch=false` ∧ `singleOut>0` | est·ord | ⬛ | `:8307-8328` · `:5487-5537` |
| H05 | 실외기 → 원형발통 세트 | /실외기/ **10건** (🚩부자재 `SI-AL600A` 포함) | `발통세트` | 합×1 | `#home_foot=true` (DB 기본 false) | est·ord | 🔵 | `:7958-7964` · `:5159-5167` |
| H06 | *(계열 아님)* FOOT_FLAT·HOSE_I_4W 강제 0 | 없음 (상수 대입) | `''` (미해소) | 항상 0 | — | est·ord | ⛔ | `:7965-7967`·`:4523` · `:2892`·`:5165` |
| H07 | 에어콤보 → 유선리모컨(컬러) 에어콤보용 | `AJ020FERPBC1`·`AJ020FERPBC2` | `AWR-WV00N` | 합×1 누적 | `#home_remote ≠ 제외` | est·ord | 🔵 | `:8242-8253` · `:5451-5462` |
| H08 | 360CST → 무선리모컨 | 8모델 | 🚨 **est=`AR-EC05` / ord=`AR-KH05`** | 합×1 누적 | `#home_remote=기본` | est·ord | 🔴 | est `:4528` vs ord `:2897` |
| H09 | 인피니트 → 무선리모컨(솔라셀) | 14모델 | `AR-CH01` | 합×1 누적 | 기본 | est·ord | 🔵 | `:8239·8257·8261` · `:5442-5472` |
| H10 | 1/4WAY(28)+벽걸이(6) → 무선리모컨 | 34모델 | `AR-EC05` | 합×1 누적 | 기본 | est·ord | 🔵 | `:8240-8262` · `:5442-5473` |
| H11 | 전 실내기 → 유선리모컨 본체 | **56모델** | `AWR-WE13N` ↔ `AWR-WG00N` | 합×1 누적 | `#home_remote ∈ {유선,컬러}` | est·ord | 🔵 | `:8255-8266` · `:5465-5481` |
| H12 | 전 실내기 → 유선리모컨 키트 | 56모델 | `AIM-A01N` | 합×1 누적 | `{유선,컬러}` | est·ord | 🔵 | `:8267·4526` · `:5474-5483` |
| H13 | 1Way WIFI 소형 판넬 | `AJ012BN1PBC2`·`AJ016BN1PBC2`·`AJ020BN1PBC2` | `PC1MWSK3NW` ↔ `PC1MWCK3NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8147-8179` · `:5328-5375` |
| H14 | 1Way WIFI 중형 판넬 | 4모델 | `PC1NWSK3NW` ↔ `PC1NWCK3NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8177-8180` · `:5376` |
| H15 | 1Way WIFI 대형 판넬 | 3모델 | `PC1BWSK3NW` ↔ `PC1BWCK3NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8178-8181` · `:5377` |
| H16 | 1Way 미내장 소형 판넬 | 3모델 | `PC1MWSK3N` ↔ `PC1MWCK3N` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8152-8186` · `:5379-5383` |
| H17 | 1Way 미내장 중형 판넬 | 4모델 | `PC1NWSK3N` ↔ `PC1NWCK3N` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8184-8187` · `:5384` |
| H18 | 1Way 미내장 대형 판넬 | 3모델 | `PC1BWSK3N` ↔ `PC1BWCK3N` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8185-8188` · `:5385` |
| H19 | 4Way WIFI 판넬 | 4모델 | `PC4NUFK1NW` ↔ `PC4NUCK4NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:3201-3230·8165-8170` · `:1636-1666·5321-5357` |
| H20 | 4Way 미내장 판넬 | 4모델 | `PC4NUFK1N` ↔ `PC4NUCK1N` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8166-8171` · `:5353-5358` |
| H21 | 360CST WIFI 판넬 | 4모델 | `PC6NUDK1NW` ↔ `PC6NUCK1NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8163-8168` · `:5350-5355` |
| H22 | 360CST 미내장 판넬 | 4모델 | `PC6NUDK1N` ↔ `PC6NUCK1N` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8164-8169` · `:5351-5356` |
| H23 | 인피니트 중형 판넬 | 8모델 | `PC1YNWK1NW`/`PC1YNCK1NW`/`PC1YNRK1NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8191-8201` · `:5387-5403` |
| H24 | 인피니트 대형 판넬 | 6모델 | `PC1ZNSK1NW`/`PC1ZNWK1NW`/`PC1ZNCK1NW`/`PC1ZNRK1NW` | 합×1 | `#home_panel` | est·ord | 🔵 | `:8193-8202` · `:5397-5405` |

✅ **홈멀티 target 코드 42개를 PM 이 전수 재측정(15:19:08 KST) — `SI-AL700a` 하나만 HOME_MULTI 카탈로그에 없고 나머지 42개 전부 `BOTH` 로 실재합니다.** 판넬 12계열 전건 무사.

### 3-2. 싱글 — 5계열

| # | family | sources | target | factor | condition | apps | 가능 | 근거 |
|---|---|---|---|---|---|---|---|---|
| S01 | 세트(발통 대상) → 원형발통 | 🚨est: `unit∈{SET,식}` ∧ catL 제외 게이트 / ord: 게이트 없음 | `발통세트` | 합×1 대입 | `#ss_base=true` | est·ord | 🔴 | est `index.ejs:7987-7994` vs ord `index.html:5171-5177` |
| S02 | AP230/AP290 → 실외기 일자발 | `AP230DAPDHH1S`·`AP290DAPDHH1S` | `SI-AL700a` | 합×1 대입 | `#ss_base=true` | est·ord | 🔴 | `:7997-8007` · `:5177-5181` |
| S03 | 1Way 세트 → 유선리모컨 키트 | **11세트** (`AC0##CS1DBC1SY`·`AC0##CS1PBH1SY`) | `AIM-A01N` | 합×1 대입 | `#ss_remote_ex=false` ∧ `#ss_remote∈{유선,컬러유선}` | est·ord | 🔵 | `:8012-8023·4538` · `:5184-5195·2907` |
| S04 | **실링 세트 → 실링용 드레인펌프** | 실링 세트 5건 | **`ADP-F075SP`** | 합×1 대입, `factor×multiplier=1` 강제 | **없음** | est·ord·srv | **✅** | `:8023-8033` · `:5196-5202` · `QuantitySyncRuleValidator.java:465-504` |
| S05 | 세트 → 구성품 BOM 전개 | 각 싱글세트 | 그 세트 구성품 전부 | 🚩**est 는 안 곱함(`:5247`) / ord 는 곱함(`:3380`)** | `#ss_panel`·`#ss_p360`·`#ss_remote`·`#ss_mat` | est·ord·srv·dsk | ⬛🔵 | `BundleExpander.java:114-116·150-266` · `mock.ts:1843` |

### 3-3. 상업 — 40계열

| # | family | sources | target | factor | condition | apps | 가능 | 근거 |
|---|---|---|---|---|---|---|---|---|
| C01 | 2Way → 판넬 | 3모델 | `PC2NWSK1N` | 합×1 누적 | `#comm_panel≠판넬제외` | est·ord | 🔵 | `index.ejs:8414-8419·8644` |
| C02~C04 | 1Way WIFI내장 소/중/대 → 판넬 | 2·4·3모델 | `PC1MWSK3NW`↔`PC1MWCK3NW` / `PC1NW…` / `PC1BW…` | 합×1 누적 | `#comm_panel` | est·ord | 🔵 | `:8646-8649` |
| C05~C07 | 1Way 미내장 소/중/대 → 판넬 | 2·4·3모델 | `PC1MWSK3N`↔`PC1MWCK3N` 등 | 합×1 누적 | `#comm_panel` | est·ord | 🔵 | `:8651-8654` |
| C08 | 1Way 인피니트 중형 → 판넬 | 4모델 | `PC1YNWK1NW`/`PC1YNRK1NW` | 합×1 누적 | `#comm_panel`(🚩공청=기본 동일) | est·ord | 🔵 | `:8656-8657` |
| C09 | 1Way 인피니트 대형 → 판넬 | 3모델 | `PC1ZNWK1NW`/`PC1ZNRK1NW` | 합×1 누적 | `#comm_panel` | est·ord | 🔵 | `:8658` |
| C10 | 4Way WIFI MINI → 판넬 | 4모델 | `PC4SUFK1NW` ✅실재 | 합×1 누적 | `#comm_panel` | est·ord | 🔵 | `:8661-8662` |
| C11 | **4Way WIFI 일반 → 판넬** | **20모델** | 기본 `PC4NUFK1NW`✅ · 블랙 `PC4NBFK1NW`**⛔** · 승강 `PC4NUXK1NW`**⛔** · 공청 est `PC4NUCK4NW`✅ / ord `PC4NUCK1NW`**⛔** | 합×1 누적 | `#comm_panel` | est·ord | ⛔🔴 | est `:8633-8636` vs ord `:5917-5920` |
| C12 | 4Way 미내장 MINI → 판넬 | 4모델 | `PC4SUFK1N` ✅ | 합×1 누적 | `#comm_panel` | est·ord | 🔵 | `:8665-8666` |
| C13 | **4Way 미내장 일반 → 판넬** | 8모델 | 기본 `PC4NUFK1N`✅ · 블랙 `PC4NBFK1N`✅ · 승강 `PC4NUXK1N`✅ · 공청 ord `PC4NUCK1N`✅ / est `PC4NUCK4N`**⛔** | 합×1 누적 | `#comm_panel` | est·ord | 🔴 | 위와 **정확히 상보적** |
| C14 | **360CST WIFI내장 → 판넬** | 8모델 | 원형 4종 **전부 ⛔** · 사각 `PC6NUDK1NW`✅ `PC6NUCK1NW`✅ / `PC6NBDK1NW`⛔ `PC6NUXK1NW`⛔ | 합×1 누적 | `#comm_panel`×`#comm_p360` | est·ord | ⛔ | `:8670-8688` · `:5955-5964` |
| C15 | 360CST 미내장 → 판넬 | 8모델 | 8종 **전부 ✅ 실재** | 합×1 누적 | `#comm_panel`×`#comm_p360` | est·ord | 🔵 | `:8676-8688` |
| C16 | 1/2Way → 유연호스 1WAY군 | **28모델** | `FH-LFHLF` ↔ `FH-LFHIF` (COMM 실재) | 합×1 대입 | `#comm_ex_hose=false` ∧ (`SHOW_I_HOSE`∨`#comm_hose_i`) | est·ord | 🔵 | `:8421-8445` · `:5722-5742` |
| C17 | 360/4WAY/무구분 → 유연호스 L형 4WAY | **52모델** | `FH-LFHLN` | 합×1 | `#comm_ex_hose=false` | est·ord | 🔵 | `:8423-8446` · `:5722-5742` |
| C18 | 전열교환기 → 유선리모컨(ERV) | 11건 | `AWR-VH12N` | 합×1 누적 | `#comm_remote≠제외` | est·ord | 🔵 | `:4099·8450-8463` · `:2444-2475` |
| C19 | 덕트 → 유선리모컨군 | 20건 | `AWR-WE13N` ↔ `AWR-WG00N` | 합×1 누적 | `#comm_remote∈{무선,유선,컬러유선}` 🚩덕트 분기가 먼저 | est·ord | 🔵 | `:4102-4105` · `:2444-2475` |
| C20 | 일반 실내기(유선·컬러유선) → 유선리모컨군 | **93건** | `AWR-WE13N` ↔ `AWR-WG00N` | 합×1 누적 | `{유선,컬러유선}` | est·ord | 🔵 | `:4108-4109` · `:2462-2466` |
| C21 | UV-C·인피니트(무선) → 무선리모컨 | 17건 | `AR-CH01` | 합×1 누적 | `#comm_remote=무선` | est·ord | 🔵 | `:4112-4117` · `:2467-2472` |
| C22 | 그 외(무선, 360 포함) → 무선리모컨 | 76건 | `AR-EH05` | 합×1 누적 | `#comm_remote=무선` | est·ord | 🔵 | `:4118-4119` · `:2473-2474` |
| **C23** | **슬림덕트 → 드레인펌프** | `AM052DNLDBH1`·`AM072DNLDBH1` | **`MDP-Z075SZED`** | 합×1 대입 | **없음** | est·ord | **✅** | `:8465-8478` · `:5753-5761` |
| **C24** | **슬림덕트 5.2~10kW → 드레인펌프** | `AM100FNLDBH1` | **`ADP-E075SEK3D`** | 합×1 대입 | **없음** | est·ord | **✅** | 〃 |
| **C25** | **중정압 덕트 → 드레인펌프** | `AM130DNMDBH1`·`AM145DNMDBH1` | **`MDP-M075SGK2D`** | 합×1 대입 | **없음** | est·ord | **✅** | 〃 |
| **C26** | **고정압 덕트 → 드레인펌프** | `AM083DNMDBH1`·`AM100DNMDBH1`·`AM110DNMDBH1`·`AM052ANHDBH1`·`AM060ANHDBH1`·`AM072ANHDBH1`·`AM083ANHDBH1`·`AM100ANHDBH1`·`AM110ANHDBH1`·`AM130ANHDBH1`·`AM145ANHDBH1`·`AM230ANHDBH1` (12) | **`ADP-G075SPK1D`** | 합×1 대입 | **없음** | est·ord | **✅** | 〃 |
| **C27** | **고정압 29kW↑ → 드레인펌프** | `AM290HNHDBH1` | **`ADP-N047SNK1D`** | 합×1 대입 | **없음** | est·ord | **✅** | 〃 |
| **C28** | **실링 실내기 → 실링용 드레인펌프** | `AM072TNCDBH1`·`AM110TNCDBH1`·`AM130TNCDBH1`·`AM145TNCDBH1` | **`ADP-F075SP`** | 합×1 대입 | **없음** | est·ord | **✅** | 〃 |
| C29 | 실외기 HP구간 → 방진가대S2소 | **모델코드 미열거** (이름·HP 토큰 라우팅) | `방진가대S2소` | 합×1 누적 (세트는 HP 조각 수) | `#comm_ex_base=false` | est·ord | 🟠 | `:4150-4219` · `:2504-2547` |
| C30 | → 방진가대S2중 | 미열거 | `방진가대S2중` | 〃 | 〃 | est·ord | 🟠 | `:4180-4185` · `:2534-2539` 🚩레거시와 30HP 갈림 |
| C31 | → 방진가대S2대 | 미열거 | `방진가대S2대` | 〃 | 〃 | est·ord | 🟠 | `:4188-4190` · `:2541-2544` |
| C32 | 가스히트펌프 → GHP방진가대 | /가스히트펌프/ 9건, 코드 미열거 | `GHP방진가대` | 합×1 누적 | `#comm_ex_base=false` | est·ord | 🟠 | `:4150-4166` · `:2522-2525` |
| C33 | 가스히트펌프 → ACL-KORGHP07 | 〃 | `ACL-KORGHP07` | 합×1 누적 | 🚩**없음**(받침대 제외해도 살아남음) | est·ord | 🟠 | `:2522-2525·5858-5866` · 골든 `goldens.js:145` |
| C34 | ECO 3.5~6HP → 실외기 일자발 | ECO 실외기 중 12건, 코드 미열거 | `SI-AL600a` (COMM 실재) | 합×1 누적 | `#comm_ex_base=false` | est·ord | 🟠 | `:4163-4166` · `:2517-2520` |
| C35 | ECO 7.5~14HP → 실외기 일자발 | 9건, 코드 미열거 | `SI-AL700a` (COMM 실재) | 합×1 누적 | 〃 | est·ord | 🟠 | 〃 |
| C36 | 세트 실외기 → T형 분기관 | 🚨est `unit==='SET'` / ord `unit==='SET' ‖ /\(.*\+.*\)/` | `AXJ-TA3419M` | 🚩**괄호 안 `+` 개수 × 수량** | 없음 | est·ord | 🔴⬛ | est `:8487` vs ord `:5786` |
| **C37** | **ECO 3종 → 리뉴얼 필터** | `AM035FXMRHC1`·`AM050MXMRBC1`·`AM050FXMRHC1` | **`AF-R09A`** | 합×1 누적 | **없음** | est·ord | **✅** | `:8507-8517·4229-4232` · `:2583-2586` |
| **C38** | **ECO → 리뉴얼 필터** | `AM075FXMRHC1` | **`AF-R12A`** | 합×1 누적 | **없음** | est·ord | **✅** | 〃 |
| C39 | 세트 실외기 → COMM_PARTS BOM | `catL='실외기' ∧ unit='SET'` | 구성품 전부 | 세트수량 × 정의수량 | 없음 | est·ord·srv·dsk | 🔴⬛ | `:7221` · `:4752-4808` · `BundleExpander.java:114-116` |
| C40 | 분기 보드 배지 → Y형 분기관 6종 | 🚩**품목 수량 아님** — `.code-cell` 배지 개수 | `AXJ-YA1509N`·`2512N`·`2812M`·`2815M`·`3419M`·`4119M` | 배지 개수 + 수동 가산 | 없음 | est·ord | ⬛ | `:12669-12738·13311-13338` · `:7169-7268·7773-7790` |

### 3-4. 비상품 — 5계열 (2건 신규)

| # | family | sources | target | factor | condition | apps | 가능 | 근거 |
|---|---|---|---|---|---|---|---|---|
| N01 | 운임 — 금액 입력 시 수량 1 자동 | 🚩없음 (단가 칸 전용 input, 수량 칸 `.qty-static`) | 운임 행 자기 자신 | 금액≠0 → qty 1 | 없음 | est | ⬛ | `index.ejs:2991-3007` (배선 `5921·6399·6930·7526`) |
| N02 | 절삭 — 금액 입력 시 수량 1 + **항상 음수** | 없음 | 절삭 행 자기 자신 | `if(isCut && val!==0) val=-Math.abs(val)` | 없음 | est | ⬛ | `:2996` |
| N03 | AUTO_CUTOFF | 🚩견적 총액의 나머지 `rem` | qty=1 행 단가 차감 또는 절삭 행 **신규 생성** | `price -= rem` | 절삭 단위 설정 시 | est | ⬛ | `:11386-11424` (중복 `:16690-16730`) |
| **N04** | **카드수수료 🆕** | 🚩rows 총액 × `getCardFeeRate()`(기본 0.03) | qty=1 행 단가에 **가산**, 없으면 `{name:'카드수수료', unit:'식', qty:1}` 신규 생성 | 총액 × 요율 | `#chkCardPay` | est(+레거시) | ⬛ | `index.ejs:16651·16676` (호출 `:9629`·`:11362`) · 레거시 `:16172` |
| **N05** | **선금할인 🆕** | 🚩rows 총액 × `advanceDiscountRate` | `{section:'ETC', name:'선금할인', unit:'식', qty:1, price:discount}` 신규 생성 | `discount = -Math.round(baseTotal × rate)` | `#payDuePre` · 레거시엔 **없음** | est | ⬛ | `:2567-2582`(호출 `:9633`·`:11363`) |

### 3-5. 역방향 — 1계열

| # | family | sources | target | factor | condition | apps | 가능 | 근거 |
|---|---|---|---|---|---|---|---|---|
| R01 | 세트 구성품 → 세트 본체 수량 | 🚩**부자재→본체** (`.part-qty-comm`/`.part-qty-single`) | 세트 본체 행 | 🚨**합이 아니라 `Math.max(...pos)`** (전부 음수면 `min`) | 본체 수동 입력이면 미적용 | est | ⬛ | `index.ejs:18841-18877` |

### 3-6. 변형층 11건 — **계열이 아니지만 초기값의 최종 수량을 바꿉니다**

| # | 층 | 무엇 | 근거 |
|---|---|---|---|
| V01 | srv·dsk | 저장 시 구성품 수량 **HALF_UP + 하한 1** | `SlipService.java:218-222` · `EstimateService.java:145-149` · `MobileQuotationService.java:166-171` · `SlipFormPage.tsx:1012` |
| V02 | srv | order-app bootstrap 페이로드 별도 정수화 | `BootstrapService.java:461·470-481` |
| V03 | srv | `qty_mode='FIXED'` (세트수량 무관 고정) — **실측 표본 0건** | `BundleExpander.java:114-116` · PM 실측 15:15:13 KST: 1,584행 전부 `FOLLOW_SET`·`1.00` |
| V04 | srv | 구성품 링크 POST/PATCH 가 수량을 **무조건 1·FOLLOW_SET 으로 리셋** | `BundleComponentService.java:418-427·466-491` vs `:320-339` |
| V05 | srv | `quantity_sync_rule` 저장 계약 — **evaluator 부재** | `V24__…sql:14·28·45` · `QuantitySyncRule.java:24-26` · PM `grep -rn "evaluate" …/product/` → **0건** |
| V06 | srv·ord | S-03 shadow 계약 `factor×multiplier=1` | `Validator:465-504` · `quantitySync.ts:126-129` |
| V07 | dsk | 사용자 override 가 서버 계산을 이김 | `SlipFormPage.tsx:1011·1017·866-884` |
| V08 | dsk | mock 이 서버에 없는 규칙 보유(`OUTDOOR && remoteExcluded` 제거) | `mock.ts:1816-1843` vs `BundleExpander.java:235-238` |
| V09 | dsk | 재전개가 `setOptions` 를 안 보냄 | `SlipFormPage.tsx:1228-1232` (도달 여부 **미확인**) |
| **V10** 🆕 | est↔ord | **싱글 BOM 세트수량 곱셈 유무** | est `index.ejs:5247` vs ord `index.html:3380` (PM 원문 확인) |
| **V11** 🆕 | est↔ord | 상업 세트 구성품 0건 시 est=세트 1줄 / ord=`return []` | est `:7228-7238` vs ord `:4771-4774` |

---

## 4. 🚨 막는 것 전수

### 4-1. 카탈로그에 없는 품목코드 — **11건** (PM 전수 재측정 15:18:40 · 15:19:08 KST)

| 코드 | `products` | 카탈로그 | 유형 | 어느 계열 |
|---|---|---|---|---|
| `PC4NUCK1NW` | **없음** | — | ⛔A 품목 부재 | C11 공청(ord 치환식) |
| `PC4NUCK4N` | **없음** | — | ⛔A 품목 부재 | C13 공청(est 치환식) |
| `PC4NBFK1NW` | 있음 | `NONE` | ⛔B 비노출 | C11 블랙 |
| `PC4NUXK1NW` | 있음 | `NONE` | ⛔B | C11 승강 |
| `PC6NUNK1NW` | 있음 | `NONE` | ⛔B | C14 원형 기본 |
| `PC6NBNK1NW` | 있음 | `NONE` | ⛔B | C14 원형 블랙 |
| `PC6EUCK1NW` | 있음 | `NONE` | ⛔B | C14 원형 공청 |
| `PC6EUXK1NW` | 있음 | `NONE` | ⛔B | C14 원형 승강 |
| `PC6NBDK1NW` | 있음 | `NONE` | ⛔B | C14 사각 블랙 |
| `PC6NUXK1NW` | 있음 | `NONE` | ⛔B | C14 사각 승강 |
| `SI-AL700a` | 있음 (`BOTH`) | **HOME_MULTI 에 없음** | ⛔C 카테고리 불일치 | H06 FOOT_FLAT |

**계열 단위 귀결** (PM 측정에서 직접 도출):

| 계열 | 옵션 칸 | 살아 있는 칸 | 죽은 칸 |
|---|---|---|---|
| C11 4Way WIFI 일반 | 4 (기본·블랙·승강·공청) | **2** (기본 `PC4NUFK1NW` · 공청 `PC4NUCK4NW`) | 2 (블랙·승강) |
| C13 4Way 미내장 일반 | 4 | **4** (실재 조합 `PC4NUCK1N` 로 못박을 때) | 0 |
| C14 360CST WIFI내장 | 8 (원형4·사각4) | **2** (`PC6NUDK1NW`·`PC6NUCK1NW`) | **6** — 원형 축 전멸 |
| C15 360CST 미내장 | 8 | **8** | 0 |
| H06 홈 일자발 | — | 0 | target 자체 부재 |

> ※ 각도1 은 C11 을 "3칸 사망"으로 셌습니다. PM 재측정으로 **2칸 사망**(공청은 estimate 식의 `PC4NUCK4NW` 가 실재)으로 정정합니다. 결론(정본은 실재 조합 `{PC4NUCK4NW, PC4NUCK1N}`)은 같습니다.

🚨 **저장 시도 시 무슨 일이 벌어지나** — 조용히 죽지 않고 **크게 실패**합니다: A유형 → `PRODUCT_NOT_FOUND` / B유형 → 400 `"삭제되었거나 비노출인 Product는 연결할 수 없습니다."` / C유형 → 400 `"category 안에서만 …"`.

### 4-2. 모델코드를 특정 못 한 것 — **7계열** (C29~C35)

`chooseBaseModel`(est `:4150-4219` / ord `:2504-2547`)이 **이름 토큰 × HP 토큰**으로 라우팅합니다. source 가 코드 목록이 아니라 판별식입니다.

- 후보 상한만 측정됨 [각도들 측정]: 옵션 키워드(프라임·한랭지·표준형·냉방전용 상부토출·프레스티지·동시냉난방·공장전원) **220건** · ECO 실외기 **21건** · 가스히트펌프 실외기 **9건**.
- target 도 모델코드가 아니라 **이름 키워드**(`방진가대S2소` 등)이고 `modelByNameLike` 로 해석합니다(est `:4207-4218`). 현 카탈로그에서 우연히 `model_code` 와 같아 맞아떨어질 뿐입니다.
- ⟹ **판별식을 실 카탈로그에 돌려 모델코드를 전수로 뽑는 작업이 선행**돼야 합니다. 이 조사에서는 하지 않았습니다.

### 4-3. 옵션 평가기가 없어 동작하지 않는 것 — **55계열**

| 층 | 사실 | 근거 |
|---|---|---|
| 조건 평가기 | `grep -rEn "\b(optionEquals\|optionIn)\b" clients/` → **0건**. (단어경계 없는 grep 은 8건이 나오지만 전부 `optionInput`·`optionInfo` 오탐 — 재현 명령 정정) | 각도2 확인 |
| order-app | 조건 붙은 규칙을 **거부** (`when` 키가 하나라도 있으면) | `quantitySync.ts:126-129` |
| 서버 | `grep -rn "evaluate" .../product/` → **0건** (PM 확인) | `QuantitySyncRule.java:24-26` 주석이 스스로 명시 |
| estimate-app (main) | 수량동기화 참조 **파일 0개** (PM 확인) | — |
| order-app (유일 소비자) | `samhanApi.ts:190` GET `/quantity-sync-rules` `{estimateCategory:'SINGLE_SET'}` 고정, 소비는 shadow `console.info` | `index.html:5545-5558` |

🚨 **귀결: 74계열 중 어느 것을 세팅해도 지금은 화면 수량이 바뀌지 않습니다.** ✅ 9계열도 예외가 아닙니다 — 세팅은 "데이터 적재"이지 "동작"이 아닙니다.

### 4-4. 앱마다 값이 다른 것 — 정본을 정해야 하는 4건 (우선순위 순)

| 순위 | 표면 | estimate | order | DB 실측 | 파급 |
|---|---|---|---|---|---|
| **1** | 싱글 발통 source 게이트 | `if (unit !== 'SET' && unit !== '식') return;` (`index.ejs:7993`) + catL 제외 | **두 게이트 없음** (`index.html:5171-5177`) | SINGLE_SET 288행 **전부 `unit='EA'`** (15:13:39) | **est 영구 0 / ord 전량 합산** — S01·S02 |
| **2** | 상업 T형 분기관 게이트 | `String(r.unit).toUpperCase()==='SET'` (`:8487`) | `unit==='SET' ‖ /\(.*\+.*\)/.test(nm)` (`:5786`) | COMM 416행 **전부 `EA`**, 이름에 `(x+y)` 있는 실외기 **84건** [각도들 측정] | **est 는 T형 + 세트 HP 분해(방진가대 전체) 영구 0** — C29~C36 파급 |
| **3** | 상업 4Way 공청 판넬 치환식 | `.replace('NUF','NUC').replace('K1','K4')` (`:8635`) | `.replace(/NBF\|NUF/,'NUC')` (`:5919`) | `PC4NUCK4NW`✅ `PC4NUCK1N`✅ / `PC4NUCK1NW`❌ `PC4NUCK4N`❌ (15:18:40) | **정본은 어느 앱도 아님** — 실재 조합 `{PC4NUCK4NW, PC4NUCK1N}` |
| **4** | 홈멀티 360CST 무선리모컨 | `/(AR-?EC05)/i` (`:4528`) | `/(AR-?KH05)/i` (`:2897`) | 둘 다 HOME_MULTI 실재 (15:19:08) | H08. 저장소 자체 문서 `legacyQuantityBoundary.js:65` 가 이미 "실제 앱 드리프트" 로 기록 |

**+ 레거시 vs 현행** (앱 간 충돌이 아니라 **계승 판정** 사항): 냉방전용 상부토출 **30HP** 가 레거시(`종합견적서/index.html:3768·3774`)는 **방진가대S2대**, 현행 두 앱(`index.ejs:4184·4190` / `index.html:2537·2544`)은 **방진가대S2중**.

### 4-5. 스키마가 표현하지 못하는 것 — 11계열

| 축 | 계열 | 왜 |
|---|---|---|
| 차감·게이트·하한 | H03·H04 | `SUM`·`factor>0` 만 있고 차감항·타집합 게이트·`max(0,·)` 축이 없음 |
| 곱셈 전개 | S05·C39 | 세트수량 × **구성품 정의수량** — 고정 `factor` 로 표현 불가 |
| 데이터 유래 계수 | C36 | 품목 이름 **괄호 안 `+` 개수** |
| source 가 품목 수량이 아님 | C40 | `.code-cell` DOM 배지 개수 + 칩 배치 순서 |
| source 자체가 없음 | N01·N02·N03·N04·N05 | 금액 입력 → 수량 1 자동 / 총액의 나머지·요율 |
| 집계가 SUM 이 아님 | R01 | **MAX**. `CHECK (aggregation='SUM')`(`V24:45`) + `QuantitySyncAggregation` enum **값이 `SUM` 하나뿐**(PM 파일 전문 확인) + `Validator:199-200` — **삼중 차단** |

---

## 5. 세팅 순서 — 배치 크기 제안

### 🚨 먼저: 지금 세팅하면 **되돌리기 어려운 부작용**이 생깁니다

PM 이 코드 원문으로 확인한 것 — 규칙이 품목을 참조하는 순간:

```java
// ProductService.java:837-844 (discontinue:681 · delete:814 · update(노출구분) · updateUsageAndReturn 에서 호출)
throw new BusinessException(ErrorCode.CONFLICT,
    "수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: " + ruleKeys);
```

⟹ **그 품목의 단종·삭제·노출구분 변경이 409 로 막힙니다.** 74계열을 한꺼번에 넣으면 약 260개 품목이 잠깁니다. 시트 sync 도 그 품목의 `usageScope→NONE` 전환을 보류합니다(`ProductSheetSyncService.java:1383-1390`, 카운터 `preservedByRuleProductOccurrences`). 보호이자 락인입니다.

### 배치 계획

| 배치 | 내용 | 계열 | 규칙 수 | 품목 잠금 | 확인 방법 |
|---|---|---|---|---|---|
| **B0 (선행 · 세팅 아님)** | §7 판정 2건 + 상업 판넬 8행 `product_category` 시트 교정 | — | 0 | 0 | 재sync 후 COMMERCIAL_MULTI 카탈로그 **408→416** 확인 |
| **B1-a** | C23·C24·C25 (드레인펌프 3) | 3 | 3 | 8 | GET 재조회 + 400 없음 |
| **B1-b** | C26·C27·C28 (드레인펌프 3) | 3 | 3 | 17 | 〃 |
| **B1-c** | C37·C38 (ECO 필터 2) + S04 (싱글 실링펌프 1) | 3 | 3 | 11 | S04 는 order-app SINGLE_SET shadow 로그(`console.info`)까지 |
| **B2** | 옵션 평가기 구현 **이후** — 홈 판넬 12(H13~H24) → 홈 리모컨 6 → 홈 호스 2 | 20 | 20 | ~120 | 라이브QA (옵션 축별) |
| **B3** | 상업 판넬 15(C01~C15) — B0 완료가 전제 | 15 | 15 | ~200 | 〃 |
| **B4** | 상업 호스·리모컨 7(C16~C22) | 7 | 7 | ~150 | 〃 |
| **B5** | 받침대 7(C29~C35) — 모델코드 전수 추출 **이후** | 7 | 7 | ~250 | 〃 |
| **보류** | H03·H04·S05·C36·C39·C40·N01~N05·R01 (11계열) | 11 | — | — | 스키마 확장 결정 필요 |

**배치 크기 = 3.** 근거 세 가지:

1. 서버가 잘못된 코드를 **크게 실패**시키므로(§2 ②) "45개 넣었더니 조용히 다 죽었다" 는 일어나지 않습니다. 그러나 **실패는 요청 단위**라 한 요청에 여러 규칙을 몰면 어느 규칙이 걸렸는지 되짚는 비용이 듭니다.
2. 각 규칙이 품목을 **잠그므로**(위) 되돌릴 때 DELETE 를 규칙 단위로 해야 합니다. 3개면 롤백이 한눈에 들어옵니다.
3. `Validator:307-316` 의 cross-rule REPLACE 중복 검사는 **같은 category · jsonb-equal condition · target 겹침** 3조건이 모두 맞을 때만 발화합니다(PM 원문 확인). B1 은 target 이 전부 다르고 S04/C28 은 카테고리가 달라(`SINGLE_SET` vs `COMMERCIAL_MULTI`) **충돌하지 않습니다** — 그래도 3개씩 넣어 그 판단을 실물로 확인하는 편이 낫습니다.

### B1 이 지금 통과하는 근거 (PM 전수 실측)

| 검사 | 결과 | 시각 |
|---|---|---|
| source 26 + target 8, **34코드 전부 COMMERCIAL_MULTI 카탈로그 `BOTH`** | ✅ 미해소 0 | 15:15:34 KST |
| source 26개 `product_type` | **전부 `SINGLE`** ⟹ BUNDLE 가드 발화 불가 | 15:15:47 KST |
| S04 target `ADP-F075SP` SINGLE_SET 실재 | ✅ | 각도2 15:04 KST |
| aggregation | 전부 `SUM` | — |
| condition | **전부 없음** ⟹ 평가기 부재와 무관하게 저장 가능 | — |

🚫 **B1 을 넣어도 화면 수량은 바뀌지 않습니다.** evaluator 가 없기 때문입니다(§4-3). 확인은 ①GET 재조회로 저장 형상 대조 ②400/409 부재 ③S04 만 order-app 콘솔 shadow 로그 — 이 셋뿐이며, **라이브QA 로 수량 변화를 검증할 수 없습니다.**

> 🚫 **DB 직접 INSERT 는 계획에 넣지 않았습니다.** 전 배치는 `POST /api/v1/quantity-sync-rules` 로만 들어갑니다. 다만 §6 대로 **관리자 화면이 없으므로 현재는 API 직접 호출뿐**입니다 — 이것 자체가 개발책임자 판정 사항입니다.

---

## 6. 양방향 지정 — 지금 가능한가

**세 층으로 갈라 답합니다.**

### ① 스키마 — **통과.** 확장 불필요

`quantity_sync_rule` 18개 컬럼 어디에도 direction/reverse/side 가 없고 저장 표현은 `Σ(source×factor) → target×multiplier` 하나입니다(`V24__…sql:8-39`). ⟹ **부자재 화면에서 본체들을 고르든, 본체 화면에서 부자재를 고르든 같은 행으로 정규화됩니다.** 개발책임자 정의(*"의미는 본체 → 부자재 하나"*)와 스키마가 일치합니다.

- `sources` 복수 ✅ · `targets` 복수 ✅ · **상한 없음** (`QuantitySyncRuleRequest.java:39-40` `@NotEmpty List<…>`, `@Size(max=)` 없음) ⟹ 1WAY 실내기 34모델을 한 규칙에 담을 수 있어 **합산 요건 충족**.
- 비대칭 하나: `display_order` 는 target 에만 있고 NOT NULL·규칙 내 unique(`V24:64·100-102`), source 에는 순서 축이 없습니다.

### ② 서버 — 정규화는 하지만 **세 군데가 비대칭**

| 비대칭 | 내용 | 근거 |
|---|---|---|
| **역방향을 별개 규칙으로 못 만듦** | A→B 가 있으면 B→A 는 순환으로 거부. **의도 동작으로 테스트에 고정** — `QuantitySyncRuleExistingRuleAliasIntegrityIT.java:84-88` 주석 *"대조군 — 역방향을 시도하면 여전히 순환으로 거부된다"*. 합법 경로는 **같은 ruleKey 를 PUT 으로 뒤집는 대체**뿐(`QuantitySyncRuleCrudIT.java:86-107`) | `Validator:442` |
| 🚨 **BUNDLE 가드가 단방향인데, 막히는 쪽이 하필 본체→부자재** | `sourceProduct.bundle() && componentCodes.contains(targetCode)` 만 검사 — 즉 **세트를 source 로, 그 세트의 구성품을 target 으로** 하면 거부. 반대는 무검사 (PM 원문 확인) | `Validator:262-279` |
| **역방향의 유일한 레거시 선례를 못 담음** | R01 의 집계가 **MAX** — `CHECK`+enum+Validator 삼중 차단 | `V24:45` · `QuantitySyncAggregation.java` |

**BUNDLE 가드의 실제 도달 — PM 재측정 (15:15:19 KST)**

```
AWR-WE13N | 65개 BUNDLE 의 구성품
AR-EH05   | 50
AR-EC05   | 12
AIM-A01N / ADP-F075SP / 발통세트 / SI-AL700a | 0 (구성품 아님)
```

⟹ 같은 1Way 세트 11개를 source 로 두고 target 을 **`AIM-A01N` 으로 하면 저장되고(S03), `AWR-WE13N` 으로 하면 거부**됩니다. 유선리모컨 본체와 그 키트는 레거시에서 같은 분기의 짝인데 **한쪽만 표현 가능**합니다. ※ 각도3 과 마찬가지로 저도 이것을 "미계승 계열"로 **단정하지 않습니다** — 개발책임자 판정 사항입니다.

### ③ UI/API — **여기가 진짜 결론**

| 질문 | 답 | 근거 |
|---|---|---|
| 관리자 UI 는 어느 방향으로 작성하게 돼 있나 | **어느 방향으로도 작성하게 돼 있지 않다** | PM `grep -rniE "quantity[-_ ]?sync" clients/desktop/src` → **0줄** |
| 클라이언트에서 이 API 를 쓰는 곳 | order-app **읽기 한 곳뿐** | `clients/web/order-app/src/samhanApi.ts:190` (GET, `SINGLE_SET` 고정) |
| 생성/수정/삭제 호출 | **0건** | 〃 |
| API 원시연산 | GET(목록)·GET(단건)·POST·PUT·DELETE **5개, PATCH 없음** | PM 확인 `web/QuantitySyncRuleController.java:41·50·57·66·75` |

🚨 그래서 본체 쪽 작성을 열면 **"이 본체를 부자재 X 규칙의 source 로 추가"** 하는 연산이 없어 **남의 규칙을 통째로 읽어 되쓰는 read-modify-write 가 강제**되는데, Request/Response 에 version·etag 가 없고 `replace()` 는 advisory lock 으로 **트랜잭션만 직렬화할 뿐 stale read 를 검출하지 않습니다** ⟹ **lost update 가 우연이 아니라 구조적 필연**입니다.

### 다른 방향을 지원하려면 필요한 것 (각도3 정리 + PM 확인)

| # | 항목 | 비용 |
|---|---|---|
| 1 | **스키마 변경 0** (진짜 역방향 R01 을 원할 때만 `aggregation` 확장) | — |
| 2 | source 추가/제거 원시연산 신설(`PATCH …/{ruleKey}/sources` 또는 PUT 에 version 토큰) | 필수 — 없으면 lost update |
| 3 | target 역인덱스 조회 **노출만** — 서버 메서드는 이미 존재 `QuantitySyncRuleService.java:146 findEnabledRuleKeysReferencing` | 낮음 |
| 4 | `ruleKey` 자동 명명 규칙 (`^[A-Za-z0-9_-]+$` 전역 unique, `V24:38·80-82`) | 낮음 |
| 5 | **작성 UI 2종 신설** (현재 0) | 최대 |
| 6 | 양방향 동시 존재 허용 여부 결정 — 허용하면 테스트 3건이 고정한 계약을 바꿔야 함 | 개발책임자 판정 |

---

## 7. 개발책임자 확인 항목 — 선택지와 대가

### 🚨 Q1. 상업 판넬 8행의 `usage_scope='NONE'` 을 어떻게 풀 것인가 *(B3 의 전제 · 가장 급함)*

원인 확정: **`product_category='SINGLE_PART'` ⟹ 시트 탭 매핑이 `usageScope=NONE`** (SINGLE_PART 345건 예외 없이 전부 NONE, 15:17:17 KST).

| 안 | 조치 | 대가 |
|---|---|---|
| **A (권장)** | 시트에서 이 8행의 분류를 `SINGLE_PART` → 상업/홈 판넬로 바로잡고 재sync | 시트 원본을 고쳐야 함. **근본 해결** — sync 가 되돌리지 않음 |
| B | 관리자 API 로 `usageScope=BOTH` + `usage_scope_manual=true` 잠금 | 그 8행이 **시트와 영구히 어긋남**. 다음에 시트에서 바뀌어도 반영 안 됨 |
| C | 그대로 두고 C11 블랙·승강, C14 원형 4칸을 **미계승으로 확정** | 상업 360 원형 판넬 축이 통째로 사라짐 |

🚫 **B0 를 건너뛰고 B3 를 시작하면 저장이 400 으로 거부되어 라운드 하나를 버립니다.**

### 🚨 Q2. 앱 간 정본 4건 — 어느 쪽으로 못박을 것인가

| 표면 | 선택지 | PM 권고 (근거) |
|---|---|---|
| 4Way 공청 판넬 코드 | est식 / ord식 / **실재 조합** | **실재 조합 `{PC4NUCK4NW, PC4NUCK1N}`** — 한 앱을 복사하면 반드시 한 칸이 죽습니다(15:18:40 실측) |
| 싱글 발통 source 게이트 | est(항상 0) / ord(전량 합산) | **판정 불가로 남깁니다.** 어느 쪽이 업무상 옳은지는 코드로 알 수 없습니다 |
| 상업 T형 분기관 게이트 | est(영구 0) / ord(84건 발화) | **판정 불가.** 다만 est 를 택하면 방진가대 계열 전체가 함께 0 이 되므로 파급이 큽니다 |
| 홈 360CST 무선리모컨 | `AR-EC05` / `AR-KH05` | **판정 불가.** 저장소 문서가 이미 "드리프트" 로 기록했습니다 |

### Q3. 냉방전용 상부토출 **30HP** — 레거시 계승 여부

레거시 = 방진가대S2**대** / 현행 두 앱 = 방진가대S2**중**. 두 앱이 서로 같으므로 앱 충돌이 아니라 **계승 판정**입니다.

### Q4. 옵션이 걸린 55계열 — 지금 넣을 것인가 미룰 것인가

| 안 | 대가 |
|---|---|
| **미룸 (권장)** | 평가기가 생기기 전에는 검증 수단이 GET 재조회뿐이라 **회귀 안전망이 없습니다.** 게다가 각 규칙이 품목을 잠급니다(409) |
| 지금 적재 | 데이터는 준비되지만 **동작 확인 불가**. 조건 스키마(`condition_json`)의 **option key 화이트리스트가 아직 없어**(`Validator:534-548`) 키 계약이 미확정 — 나중에 전량 재작성 위험 |

### Q5. 모델코드 미특정 7계열(C29~C35) — 어떻게 할 것인가

| 안 | 대가 |
|---|---|
| **판별식을 실 카탈로그에 돌려 전수 추출 후 코드로 못박음 (권장)** | 추출 라운드 1회 필요. 이후 이름이 바뀌어도 안전 |
| 이름 판별식을 그대로 규칙에 옮김 | **스키마가 이름 판별식을 담지 못합니다** — `quantity_sync_source` 는 품목 참조입니다 |
| 미계승 | 방진가대·일자발·GHP 계열 전부 수동 입력으로 남음 |

### Q6. 양방향의 의미 확정 *(§6)*

- (a) **작성 진입점이 두 개** — 현 구조로 충분, **UI 만 만들면 됨**
- (b) **두 방향 규칙의 동시 존재** — 테스트 3건(`CrudIT:86` / `AliasIntegrityIT:84` / `DiscontinueIT:320`)이 고정한 순환 계약을 바꿔야 함

### Q7. `AWR-WE13N`(유선리모컨 본체)은 별도 sync 규칙이 필요한가

필요하다면 **BUNDLE 가드 때문에 현재 저장 불가**입니다(65개 BUNDLE 의 구성품, 15:15:19 KST). 각도3 과 PM 모두 이것을 미계승 계열로 **단정하지 않았습니다**.

### Q8. 운임·절삭의 취급이 서버와 정반대입니다

`BundleExpander.java:416-418` 은 세트 전개 결과에서 `/유연호스 I형|운임|절삭/` 라인을 **무조건 제거**합니다. 개발책임자 메모리(2026-08-06)는 *"운임·절삭은 제외 대상이 아니다"* 이며 근거는 레거시 `종합견적서/index.html:2698 handleFreightInput`. **같은 표면인지(세트 구성품 전개 vs 견적서 자유 입력행) 확정되지 않았습니다** — 각도들도 PM 도 임의 판정하지 않았습니다.

### Q9. 신규 발견 2계열(N04 카드수수료 · N05 선금할인) 처리

- N04 는 **레거시에도 있으므로 계승 대상**입니다. N05 는 **레거시에 없어(grep 0) estimate-app 이 새로 만든 것**이라 계승 대상이 아닐 수 있습니다.
- 둘 다 `source→target` 형태가 아니라 **총액 축**이라 현 스키마로는 못 담습니다. N01~N03 과 함께 **"금액 축 자동행" 이라는 별도 축**으로 다룰지 판정이 필요합니다.

### Q10. 소수 계수는 지금 넣지 마십시오

`factor`·`multiplier` 소수 4자리와 `rounding=FLOOR` 를 스키마는 허용하는데, 최종 수량은 **네 곳이 각자 HALF_UP + 하한 1** 로 뭉갭니다(V01·V02). 예: 3개 × 0.5 = 1.5 → 규칙상 1.5/1 인데 저장 라인은 **2**. **초기값은 전부 정수 계수(1)로 시작하는 것이 안전합니다** — 다행히 B1 9계열은 전부 ×1 입니다.

---

## 부록 — 이 보고서가 확정하지 **않은** 것

| 항목 | 상태 |
|---|---|
| C36·S01 의 업무상 정본 | **판정 불가** — 코드로는 알 수 없음 |
| H08 리모컨 정본 | **판정 불가** |
| C29~C35 의 source 모델코드 | **미추출** — 후보 상한만 측정됨 |
| C40 분기 배지 알고리즘이 est·ord·레거시 셋에서 같은 값을 내는가 | **미대조** — 함수명이 세 곳에 같음만 확인 |
| V09 데스크톱 `setOptions` 미전송의 사용자 도달 여부 | **미확인** |
| 구글 시트 원본 | **미접근** — 레거시 커밋 소스를 정본으로 삼음 |
| 각도1 의 "연인원 314 · 서로 다른 코드 261" | [각도1 측정] — PM 이 재현하지 않음 |

**이 조사에서 소스 수정 · git commit/add/push · Docker 재배포 · DB 쓰기는 하지 않았습니다.** DB 는 읽기 전용 psql 조회만 수행했습니다.