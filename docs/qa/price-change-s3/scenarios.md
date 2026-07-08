# PR #688 S3 주문 자동전환 QA 시나리오 결과

브랜치: feat/price-change-s3-order-switch  
HEAD: 9b07853ea  
실행일: 2026-07-01  
QA 담당: QA agent (자동)

---

## Step 1 — BE 테스트 [PASS]

### 실행 명령
```
DOCKER_HOST=tcp://localhost:2375 ./gradlew :services:partner-order-service:test \
  --tests "*Bootstrap*" --tests "*EstimateCatalogClientTest" --rerun-tasks
```

### 결과 (JUnit XML 실증)

| 테스트 파일 | 건수 | PASS | FAIL | SKIP |
|---|---|---|---|---|
| EstimateCatalogClientTest | 2 | 2 | 0 | 0 |
| BootstrapServiceTest | 4 | 4 | 0 | 0 |
| PartnerOrderBootstrapIT | 1 | 1 | 0 | 0 |
| **합계** | **7** | **7** | **0** | **0** |

주요 테스트:
- `catalog_scope를_query_param으로_전달하고_data를_언랩한다()` — PASS
- `components_materialPrices_priceBaseline_priceChangeSchedule_모두_data를_언랩한다()` — PASS  
- `bootstrap_17_keys_seeded_and_dc_secrets_stripped_from_config()` — PASS (Testcontainers Postgres 16-alpine, Docker 가용)
- `fetch_productDb_catalog를_legacy_bootstrap_shape로_변환한다()` — PASS
- `prefetch_시트read_성공시_GAS와_동일하게_base와_단가인상_source가_seed보다_우선하고_config는_seed_fallback()` — PASS

---

## Step 2 — order-app vitest [PASS]

### 실행 명령
```
npm --prefix clients/web/order-app test
```

### 결과

```
Test Files  5 passed (5)
      Tests  14 passed (14)
   Duration  510ms
```

- `priceChangeSchedule.test.ts` 3건 포함 전수 PASS

---

## Step 3 — 금액 전환 실증 [PASS]

### 구현 확인 (index.html L1388-1392)

```js
function incActive(categoryKey, due) {
  const effectiveDate = PRICE_CHANGE_SCHEDULE && PRICE_CHANGE_SCHEDULE[categoryKey];
  if (!effectiveDate || !due) return false;
  return due < String(effectiveDate);
}
```

**판정 로직**: `due < effectiveDate` → INC 인상전 단가, `due >= effectiveDate` → base 인상후 단가.

### vitest 케이스 전환 증거

schedule 주입: `homemulti='2026-12-01', commercialMulti='2026-12-01', singleSets='2026-12-01'`

**케이스 A: due=2026-11-30 (변동일 전) → 인상전(INC) 단가 사용**

| 함수 | 기대값(INC) | 실제값 | 판정 |
|---|---|---|---|
| homeUnitPrice('HM1') | 1000 | 1000 | PASS |
| commUnitPrice('CM1') | 2000 | 2000 | PASS |
| singleUnitPrice({model:'SS1'}) | 3000 | 3000 | PASS |
| partUnitPrice({model:'SP1'}) | 4000 | 4000 | PASS |
| setBasePriceRightFirst({model:'SS1'}) | 3000 | 3000 | PASS |

**케이스 B: due=2026-12-01 (변동일 이상) → 인상후(base) 단가 사용**

| 함수 | 기대값(base) | 실제값 | 판정 |
|---|---|---|---|
| homeUnitPrice('HM1') | 1100 | 1100 | PASS |
| commUnitPrice('CM1') | 2100 | 2100 | PASS |
| singleUnitPrice({model:'SS1'}) | 3100 | 3100 | PASS |
| partUnitPrice({model:'SP1'}) | 4100 | 4100 | PASS |
| setBasePriceRightFirst({model:'SS1'}) | 3100 | 3100 | PASS |

**케이스 C: schedule 없음 → 항상 base(인상후) 단가**

| 함수 | 기대값(base) | 실제값 | 판정 |
|---|---|---|---|
| homeUnitPrice('HM1') | 1100 | 1100 | PASS |
| commUnitPrice('CM1') | 2100 | 2100 | PASS |
| singleUnitPrice({model:'SS1'}) | 3100 | 3100 | PASS |
| partUnitPrice({model:'SP1'}) | 4100 | 4100 | PASS |

**baseline 결측 모델 유지**: `incActive && HOME_INC[model]` 단락평가 — INC 맵에 모델 없으면 false → base 유지. PASS.

---

## Step 4 — 실 렌더 스크린샷 [PASS]

### 서비스 상태

| 서비스 | 포트 | 상태 |
|---|---|---|
| samhan-partner-order-service | 18088→8088 | Up, healthy |
| samhan-product-service | 8084 | Up, healthy |
| samhan-api-gateway | 8080 | Up, healthy |

### Flyway V22 적용

```sql
-- price_change_schedule 테이블 생성 + 4종 시드
INSERT INTO price_change_schedule (category, effective_date)
VALUES
  ('homemulti',       '2026-04-01'),
  ('singleSets',      '2026-04-01'),
  ('commercialMulti', '2026-04-01'),
  ('oldProducts',     '2026-04-01');
```

적용 일시: 2026-07-01 06:30:02

### Bootstrap API 응답 확인

```
GET /api/v1/partner-orders/bootstrap  →  17 keys
priceChangeSchedule: {
  "homemulti": "2026-04-01",
  "singleSets": "2026-04-01",
  "commercialMulti": "2026-04-01",
  "oldProducts": "2026-04-01"
}
```

스크린샷: `docs/qa/price-change-s3/01-order-app-initial.png`  
(삼한공조시스템 주문서 — 사업자등록번호 입력 화면, bootstrap 정상 로드)

---

## 도메인 정합성 확인

- price_change_schedule 테이블 4행 (category CHECK 제약 통과)
- bootstrap 17키 — priceChangeSchedule 포함 단일 응답 (16→17 확인)
- incActive() = `due < effectiveDate` 문자열 비교 (yyyy-MM-dd 정렬 보장)

## 참고: homeInc/commInc 현황 (R1 시점 — 아래 R2 로 해소됨)

R1 시점 `price_history` 0행 → `homeInc/commInc/singleInc = {}`.
이는 dev 환경 설계 상태였다 (실 운영 시 인상전 단가 데이터 추가 예정).
incActive 가 true 일 때 `INC[model]` 도 undefined → false → base 사용 — 정상.

---

## R2 추가검증 — 미래일 라이브 전환 실증 (2026-07-09)

브랜치: feat/price-change-s3-order-switch
HEAD: `1707c633875d6b8eb1aa6b0f36b7794c6907af7d`
목적: dev-lead 머지조건 "미래일 라이브전환 미실증" 해소 — `price_change_schedule.homemulti` 를
미래일(2026-08-01)로 두고, 실 `price_history` 데이터 + 실 로그인 + 실 order-app GUI 로
납기희망일 기준 전/후 단가 전환을 종단 실증한다. 합성/목업 데이터 없음 — 전부 실 DB seed +
실 API 응답 + 실 브라우저 캡처.

### QA seed

`product_db.price_history` — 실 product(`TEST-BUNDLE-SET-01`, HOME_MULTI 노출, id
`b0000000-0000-0000-0000-000000000001`) 대상, `created_by='QA_R2_SEED'` 2행:

| effective_date | release_price | delivery_price | 비고 |
|---|---|---|---|
| 2000-01-01 (baseline) | 700,000 | 700,000 | 인상 전 단가 — `EstimateCatalogInternalController.priceBaseline()` 가 하드코딩 조회하는 날짜 |
| 2026-04-01 (인상본) | 1,000,000 | 900,000 | 현재 Product 마스터 값과 동일 (감사용 이력 행, 현재 코드경로에서 직접 조회되진 않음) |

주: 최초 baseline 값을 900,000 으로 시도했으나, 이 product 는 `useK2=false` 라 표시단가가
`currentSheetPrice`(납품가) 우선 로직을 타고, 그 기본값(=현재 Product.delivery_price=900,000)
과 baseline 값이 우연히 같아 전/후 화면상 차이가 없었다 (코드 분석 후 GUI 로 재확인 필요성 확인).
baseline 을 700,000 으로 조정하여 시각적으로 구분되는 전/후 값을 확보했다.

### P0 — bootstrap API 레벨 실증 [PASS]

`GET http://localhost:8080/api/v1/partner-orders/bootstrap` (재기동 후, evict 반영):

```json
"homemulti": [{"model":"TEST-BUNDLE-SET-01","price":900000.0,"list":1000000.0,"useK2":false, ...}],
"homeInc": {"TEST-BUNDLE-SET-01":700000.0},
"priceChangeSchedule": {"homemulti":"2026-08-01","singleSets":"2026-04-01","commercialMulti":"2026-04-01","oldProducts":"2026-04-01"}
```

`priceChangeSchedule.homemulti` = 미래일(2026-08-01), `homeInc` 에 baseline(전) 단가 700,000 이
실제로 채워짐을 확인 — R1 시점에는 둘 다 불가능했던 상태.

스크린샷: `r2-01-bootstrap-api-future-inc.png`

### P1 — order-app 실 GUI 전/후 렌더 [PASS]

인프라: `partner-auth-service`(:8091) 컨테이너 미기동 상태였어 신규 기동(기존 이미지
`infrastructure-partner-auth-service:latest` 사용) + 테스트 거래처 계정 1건 등록
(`bizNo=2118712345`, 실 `POST /partner-register` → PENDING→NEED_PW_SET(SQL, 관리자 승인 동형
전환) → 실 `PATCH /partner-password`(PIN 1234, 실 BCrypt 인코딩) → 실 `POST /partner-login`
검증 후 브라우저 BizGate 로 동일 계정 로그인). order-app: `VITE_API_BASE_URL=http://localhost:8080/api/v1`
로 `npm run dev`(mock 없음, 실 게이트웨이 직결).

실행 시나리오 (Playwright, 실 Chromium, 실 클릭/입력):
1. BizGate 로그인 (사업자번호 2118712345 + PIN 1234) → 실 JWT 발급 로그인 성공.
2. 홈멀티 진입 → `TEST-BUNDLE-SET-01` 행에 수량 1 입력.
3. 납기희망일 기본값(오늘, 2026-07-09 — 스케줄 2026-08-01 이전) 상태에서 그리드 납품가 =
   **700,000** (baseline) — 스크린샷 `r2-02-gui-grid-before-due-2026-07-09-700000.png`.
4. 견적/주문하기 → 주문서 미리보기 모달에도 동일 700,000/합계 700,000 —
   `r2-03-gui-preview-before-due-2026-07-09-700000.png`.
5. 주문하기 → 주문 정보 페이지에서 납기희망일을 2026-08-15(스케줄 이후)로 변경. "납기희망일
   기준 카테고리별 단가가 자동 적용됩니다" 고지 문구 노출 확인 —
   `r2-04-gui-orderinfo-due-changed-2026-08-15-notice.png`.
6. 그리드로 복귀 → 납품가 **900,000** (인상 후/현재 Product 단가)로 실시간 재계산 —
   `r2-05-gui-grid-after-due-2026-08-15-900000.png`.
7. 미리보기 재오픈 → 동일 900,000/합계 900,000 —
   `r2-06-gui-preview-after-due-2026-08-15-900000.png`.

| 납기희망일 | 스케줄(2026-08-01) 대비 | 화면 납품가 | 근거 |
|---|---|---|---|
| 2026-07-09 (기본값) | 이전 | 700,000 | `price_history` baseline(2000-01-01).release_price |
| 2026-08-15 | 이후 | 900,000 | `products.delivery_price` (현재 마스터 값) |

### SQL 금액 대조 [PASS]

```sql
SELECT p.model_code, p.release_price AS live_release_price, p.delivery_price AS live_delivery_price,
       ph_base.release_price AS baseline_release_price_2000, pcs.category, pcs.effective_date
FROM products p
LEFT JOIN price_history ph_base ON ph_base.product_id = p.id AND ph_base.effective_date = '2000-01-01'
LEFT JOIN price_change_schedule pcs ON pcs.category = 'homemulti'
WHERE p.model_code = 'TEST-BUNDLE-SET-01';
```

결과: `live_release_price=1000000.00, live_delivery_price=900000.00,
baseline_release_price_2000=700000.00, category=homemulti, effective_date=2026-08-01` —
화면/부트스트랩 API 값과 100% 일치.

### 롤백

QA seed(`price_history` `created_by='QA_R2_SEED'` 2행) 삭제 + partner-order-service 재기동
(evict) 으로 원상복구 완료 (아래 커밋 시점 기준 `price_history` 0행 재확인).

### 미해결 / 참고

- `partner-auth-service` 컨테이너와 테스트 거래처 계정(`bizNo=2118712345`)은 rollback 범위 밖 —
  향후 order-app 실 GUI QA 재사용을 위해 유지(운영 데이터 아님, 명백한 테스트 계정).
- P1 은 `useK2=false` 분기만 실측 — `useK2=true`(고정DC%) 분기의 전/후 전환은 해당 분기 실
  product 부재로 미실측 (별도 seed 필요 시 후속).
