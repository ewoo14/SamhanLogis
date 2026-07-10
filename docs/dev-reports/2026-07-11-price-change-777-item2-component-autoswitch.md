# #17 단가변동 #777 item2 — 구성품(싱글·상업) 카테고리별 단가 자동전환 (dev-report)

- **연관**: #17(단가변동) · 후속 이슈 **#777** item2 · **PR #778** · S3(#688) 후속
- **운영모드**: 표준 Opus+Codex 듀얼리뷰(SONNET 대체 해제 — Codex 회복). Opus=기획/PM/직접fix/머지, Codex=구현.
- **일자**: 2026-07-11 (집PC)

## 1. 개요
S3(#688)가 order-app에 Model B 자동전환(due < 카테고리 변동일 → 인상 전, 이후 → 인상 후)을 도입했으나 **구성품(singleParts/commercialParts)은 항상 인상 후**만 적용됐다. 원인: product-service `EstimateCatalogInternalController.priceBaseline()`이 `ProductEstimateExposure` 순회 emit이라 exposure 미생성 구성품(estimateCategory=null)이 배제 → `commPartsInc`/`singlePartsInc` 상시 빈맵. item2는 **priceBaseline을 exposure-비의존으로 전환**해 구성품 자동전환을 활성화한다. (구성품 baseline 데이터 price_history@2000-01-01은 이미 존재 — exposure 필터만이 차단이었음.)

## 2. 스코프 결정
- **item2만 확정**(데이터 존재·결정불요). **item1**(캐시 evict/TTL)·**item3**(oldProducts 자동전환)은 개발책임자 결정 필요분으로 **분리**(§7).
- item2 = 순수 "S3 자동전환의 잔여 카테고리(구성품) 완성" — 새 정책 아님(D5=Model B·구성품=부모 카테고리 변동일 준용, singleParts→singleSets 기존 규약과 동일).

## 3. 구현 (Codex, PM commit `3f263021a`)
- **product-service** `EstimateCatalogInternalController.priceBaseline()`: exposure-per-row emission 유지 + **exposure 미커버 baseline product를 estimateCategory=null로 추가 emit**(교체 아닌 추가 — 다중노출 회귀 방지).
- **partner-order-service** `BootstrapService`: `commPartsInc` payload + `incPriceMapFirstDecimal`(출고가 우선·납품가 fallback = `componentRows(commercial=true)` parity) + `CACHE_KEYS` 18종 등재. singlePartsInc는 priceBaseline 수정으로 자동 활성.
- **order-app** `index.html`: `COMM_PARTS_INC` 주입 + 상업 구성품 사이트에 `incActive('commercialMulti', due)` 게이트. singleParts(`partUnitPrice`)는 기배선.

## 4. R1 리뷰 (Opus 5-agent — FE/BE/Design/DevOps/QA) + Opus 직접 fix (`945e2c76f`)
- **🔴 HIGH(H1) — FE+Design 독립 확증**: 상업 구성품 단가 계산 **4사이트 중 2곳만** 게이트(explode 2곳만, 라이브 그리드 `renderCommSetParts`/`bindCommQtyEvents` 누락) → 화면(#commBody)≠미리보기/제출 불일치 위험. vitest가 순수함수 추출이라 DOM 경로 미커버 → CI 미포착.
  - **fix**: `commPartUnitPrice(model, basePrice)` **공유 헬퍼** 신설 → 4사이트 전부 라우팅(단일 게이트·재발 구조 차단). `renderCommSetParts` `data-part-price`로 render=resync 일관 + `|| p.price` 폴백 포함.
- **🟡 MED**: (BE) `incPriceMapFirstDecimal` 출고가-우선 0-커버리지 → BootstrapServiceTest에 COMM-PART-2(출고가 82000≠납품가 99999) 추가로 잠금. (BE) IT fixture 실 구성품 카테고리 → `ProductCategory.SINGLE_PART`. (DevOps/BE) "17종" 문서 stale → **18종+commPartsInc 전수 sweep**(README·6 javadoc·IT 메서드명 bootstrap_18_keys). (Design) sumComm/#commTotal → §6 QA 확인.
- **반증(SOUND)**: modelCode active-unique(`ux_products_model_code_active`)로 null-category 추가행이 exposure행과 충돌 불가(오염 없음)·NPE 안전(String category·NOT NULL exposure)·estimate-app default:break 무영향·firstDecimal 시그니처 호환·N+1 없음·oldProducts 무영향·CI 3그룹 full-module 실행(allowlist false-green 없음).
- **참고(범위 문서화)**: null-category 추가는 "구성품"뿐 아니라 "baseline 있고 활성 exposure 없는 전 품목"에 적용되나 modelCode 유일성 + INC맵이 구성품 리스트만 소비 → 무해한 비활성 여분 entry.

## 5. 검증 (genuine · --rerun-tasks --no-build-cache)
- order-app vitest **8 PASS**(commPartUnitPrice 직접 테스트 포함) · product-service `EstimateCatalogInternalControllerIT` BUILD SUCCESSFUL(7) · partner-order-service `BootstrapServiceTest`+`PartnerOrderBootstrapIT` BUILD SUCCESSFUL. 마이그레이션 없음.

## 6. 라이브 QA (Docker 실서버·실 GUI·QA_777_ITEM2 투명시드→롤백) — item2 PASS
스샷 `docs/qa/price-change-777-item2/`(SHA `603608b17`). dev에 COMMERCIAL 데이터 0건이라 QA777-COMM-SET-01/PART-01 최소 시드(구성품 baseline 500,000=인상 전 / 현재가 700,000=인상 후 / commercialMulti 변동일 2026-09-01).
- **P0 bootstrap API**: `commPartsInc={QA777-COMM-PART-01:500000}` + `priceChangeSchedule.commercialMulti=2026-09-01` — exposure 없이 baseline 채워짐 실증(R1 이전 commPartsInc 부재).
- **P1 실 GUI**(실 BizGate 거래처 로그인·mock OFF): 미리보기(제출 경로) due 2026-08-01(전)=**구성품 500,000** / due 2026-10-01(후)=**700,000**. 우회 그리드(08/09)도 동일 전환 — H1 4사이트 정합 실증.
- **화면=API=DB 100% 일치**. QA_777_ITEM2 전량 롤백(commPartsInc={} 원복 확인).
- **Design M2(#commTotal)**: sumComm=부모 SET 번들가(1,200,000 고정) vs 미리보기 합계(500k/700k) 괴리 관찰 — **선존재 아키텍처**(diff 미변경)·item2 회귀 아님.

### ⚠️ 라이브 QA가 발견한 사전존재 레거시 버그 3건 → **후속 이슈 #779**
전부 `13ce6f89e`(v4 임베드·#777/#778 무관): ①`buildCommSetIndex()` `window.COMM_PARTS` 오참조 → 상업 SET 구성품 하위행 **그리드 미렌더**(item2의 renderCommSetParts/bindCommQtyEvents 게이트가 현재 dead path — 가격계산·제출은 정상) ②`fixFootersForMobile` `#commTotal` 파괴 ③OrderCancel 미리보기 재표시 합계 stale. **#778 머지 블로커 아님**(item2 가격 로직은 제출·API·DB 정확). QA에서 ①을 1줄 우회해 그리드 전환 실증.

## 7. 분리 — 개발책임자 결정 필요 (#777 잔여)
- **item 1 (캐시 evict/TTL)**: bootstrap `@Cacheable` TTL 없음·product→partner evict 미배선(=#688 결정 A "재기동 SOP"). commPartsInc도 동일 계승. **evict-on-write(이벤트/webhook) vs 유계 TTL** 설계결정 필요.
- **item 3 (oldProducts 자동전환)**: 구형은 baseline 데이터 자체 부재(`ProductSheetSyncService:124` `beforeIncreaseTabName=null`, 인상 전/후 구분 없는 단일가 tab). **baseline 데이터 소스 결정 필요**: (a) 구형 인상 전/후 시트 도입 (b) admin 수동 baseline (c) 구형 인상 미적용 확정. 돈로직·무결성 도메인 → 착수 전 확인.

## 8. Known limitations
- item2 그리드 표시 이득은 #779 P1(buildCommSetIndex) 해소 후 가시화(가격 계산·제출·API는 무관하게 정상).
- useK2 분기 GUI는 해당 실 product 부재로 미실측(스위치 로직 동일).
