# #773 S5 — 매입(PURCHASE) 재검증 노출 + modelName 채움

- **PR**: #812 · 브랜치 `feat/773-s5-purchase-render-modelname`
- **일자**: 2026-07-13 (회사PC 착수·집PC 이어받아 완주)
- **에픽**: #773 일마감 단가변동 재검증 (S1a~S4 선행 머지)
- **성격**: read-time 감사 노출 확장(FE) + 표시 전용 modelName 채움(BE). 마감금액 불변·Flyway 무변경·무결성 안전.

## 개발책임자 결정 (2026-07-13)
1. **매입 노출 = "표 + 참고용 배너/배지"**: PURCHASE 도 매출과 동일한 재검증 표를 렌더하되, 상단 참고 배너("매입 재검증은 판매(출고) 기준 참고용·정식 매입단가 감사 아님") + 확인 컬럼 '참고' 마커. referent=판매(출고) 기준(§6.6.5)이라 매입 verified/expectedRate 는 참고값.
2. **modelName BE 채움**: `revalidateProductLines` 가 modelName 상시 null → 실 모델코드 노출. 모델 컬럼 재도입(S4 에서 dead 라 제거).

## 변경 내용
### BE (accounting-service)
- **`ModelTokenExtractor.extractModelTokenOrNull(name)` 신설**(표시 전용): `MODEL_TOKEN` 정규식/`AR(R)-` 접두 매치 시만 토큰, 미매치(운임·서비스)·null/blank → **null**. 기존 `extractModelToken` 은 미매치 시 정규화 품명을 fallback 하나, 모델 컬럼 표시엔 품명과 중복되어 부적절하므로 실 모델코드만 노출.
- **`MonthEndCloseService.revalidateProductLines`**: `modelToken = extractModelToken(e.getKey())` 지역변수화(재검증 분기 인자 — 산식 무변경) + `DailyProductLine` modelName 을 `null` → `extractModelTokenOrNull(e.getKey())`. 3소스(TAX/SALES/PURCHASE) 공유. 그룹 키 = 원본 품명 라벨(accumulateProduct)이라 라벨에서 토큰 추출이 정합.
- 계약 무변경(`DailyProductLine.modelName` 기존 `String` nullable 필드).

### FE (clients/desktop)
- **`DailyClosingPage.tsx`**: ① 모델 컬럼 재도입(품명 다음·`modelName ?? '—'`) ② 게이팅 `closingKind === 'SALES'` → `!== 'ALL'`(SALES+PURCHASE·ALL 은 detailQuery `enabled:false`) ③ PURCHASE 참고 배너(`role="note"`·warning DS 토큰 `--color-warning-50/300/800`·AA 5.35) ④ 확인 컬럼 PURCHASE '참고' 마커(verified 무관 전 행).
- **`closingApi.ts`**: modelName JSDoc 갱신(S4 "항상 null" stale → extractModelTokenOrNull 채움).
- **`mock.ts`**: modelName 실 토큰 parity.
- **`DailyClosingPage.test.tsx`**: BE 계약 충실 픽스처(6 status 전수·modelName 실토큰/서비스 null·매출 참고 마커 부재·매입 참고 마커 verified 무관 양방향·null 폴백).

## 리뷰 이력 (실행=게시 1:1)
### R1 — Opus 5-agent (FE/BE/Design/DevOps/QA) + Opus 직접 fix (`9f1eb98f`)
genuine 다수 포착·수정:
1. **[BE] extractModelTokenOrNull 신설** — 스펙 초안 `extractModelToken`(품명 fallback→모델 컬럼이 품명 중복)을 표시 전용 OrNull 로 개선. 미매치/blank → null.
2. **[Design MED] 배너 미정의 토큰**(`--surface/text/border-warning`) → 형제 audit 관례 `--color-warning-50/300/800`(AA 5.35) + 집계단위 캐비엇 병기.
3. **[mock/JSDoc parity]** modelName 실토큰·closingApi JSDoc stale 해소.
4. **[QA test]** BE-faithful modelName·참고 마커 verified 무관 양방향·null 폴백 커버.
5. **[QA] S5 real-qa 스펙 신설.**

### R1 라이브 QA (집PC 완주 — `203e90c7`)
- Docker 실서버(mock OFF·실 게이트웨이 :8080)·dev_accountant·**accounting+product jar 양측 재배포**. playwright 1 passed.
- ② modelName: 모델 컬럼 실토큰(AR09TXEAAWKNEU-04) 노출·서비스행 '—' 라이브 확증(API `revalidationStatus=MISSING_REFERENT`·정가결측).
- ① 매입 배너: `role=note` 참고 배너 렌더(데이터 무관). 참고 마커=dev 매입 0행이라 vitest 커버(L278·L283).
- **환경 발견(코드 무관)**: stale product-service 이미지(구 `applicable-bulk` 단건-404)→daily-detail 400. 재배포로 200 부분성공→MISSING_REFERENT 정상 degrade. #773 QA=product+accounting 양측 재배포 필요. `docs/qa/773-s5-purchase-render-modelname/qa-report.md`.

### R2 — Codex 5-agent 적대검증 (인라인 diff·gpt-5.5 high) + Codex fix
**종합 판정: 0 blocking·머지 가능.** 5차원 genuine 리뷰(FE 0·BE 2·Design 1·DevOps 0·QA 3). PM disposition:
- **[BE MED] 대괄호 안 모델코드 미표시**(`clean()`이 `[...]` 제거 후 정규식): **no-change(의도된 설계)**. `extractModelTokenOrNull` 은 재검증 분기용 `extractModelToken` 과 동일 `clean()` 기반이라 표시 modelName 이 재검증 토큰과 항상 정합. 실 라벨은 모델을 대괄호 '밖'·규격을 '안'에 둠(dev/legacy 실측 `item_name ~ '\[[A-Z]{2}[0-9]'` = **0건**). raw-first 변경 시 표시/판정 불일치 유발 → 오히려 악화. **단위테스트로 의도 계약 고정**(fix).
- **[BE LOW] AR-/ARR- fallback 약한 보장**: no-change. 분기용 extractModelToken 과 대칭(정합)·near-zero 발생·단위테스트로 고정.
- **[Design LOW] 확인 셀 '참고' 의미충돌·100px 줄바꿈 위험**: **fix** — 확인 컬럼 `width 100→116px` + inline-flex `nowrap` 래퍼 + '참고' `aria-label="판매(출고) 기준 참고값"`.
- **[QA MED] `extractModelTokenOrNull` 경계값 테스트 부재**: **fix** — accounting `ModelTokenExtractorTest` 신설(포트 테스트 0건이었음). 실모델/서비스null/blank/대괄호통째/AR- fallback + extractModelToken 대비 8 케이스.
- **[QA LOW] 참고 마커 verified=false 미커버**: **fix** — purchaseDetailFixture 에 불일치(verified=false) 행 추가 + 참고 노출 단언.
- **[QA LOW] PURCHASE source 계약 assert 부재**: **false-positive** — 테스트가 이미 `toHaveBeenLastCalledWith(_,'PURCHASE','PURCHASE_SLIP')` 단언(L255-259).

fix=Codex 라운드 진행모델(codex exec danger-full-access) → PM commit 대행.

## 검증
- vitest `DailyClosingPage` 3/3 · `mock.test.ts` 51/51 · `npm run typecheck` exit 0.
- BE `compileJava` exit 0 · accounting 1207 · 전체 desktop 691/691 · 0-fail(modelName 회귀 0).
- 라이브 GUI 5장(`docs/qa/773-s5-purchase-render-modelname/`).

## 범위 밖 (불변)
- S1.5(세트 riUsage·거래처 약정DC)·S1d(구형 baseline·실 시트 sync·Google 자격)·S3(검증결과 영속)·totalDiscount 실계산(placeholder ZERO·'총 할인' 정의 정책성).
