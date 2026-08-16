# GAS Ⓑ 축 5건 전제 정찰

```text
cwd   C:/dev/Samhan-Public   (main, 읽기 전용)
HEAD  c292272ae58670e97c29fde0eb57e7ff6c46728b
```

제품 코드는 수정하지 않았다. 운영 설정값 조회는 `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;`으로 수행했다.

## 판정 기준

- **충돌**: 레거시 동작을 그대로 채택하면 확정 결정의 명시 조항이 깨진다.
- **충돌 아님**: 확정 결정과 레거시가 같은 방향이거나, 분류표가 서로 다른 개념(원천 누락과 soft-delete, 복원과 조회)을 충돌로 묶었다.
- Ⓐ는 레거시 동작으로 맞출 수 있는 차이, Ⓒ는 기존 결정이 이미 답한 차이, Ⓓ는 UI 차이다.

## 1. EST-R01 — 종합견적서 구제품 할인율

- **충돌 주장**: 레거시는 구제품 할인율 50% 고정이고 현행은 설정값이므로, 레거시 고정값 복제가 “설정 구조 유지·레거시 값 0.5” 결정과 충돌한다.
- **실측 판정**: **충돌 아님 — Ⓒ**. 충돌 주장의 “레거시 50% 고정” 전제부터 사실이 아니다.
- **결정 원문**: `docs/decisions/2026-08-15-gas-rule-parity-decisions.md:34-47` — “**설정 유지 · 레거시 값으로 맞춤**”, “구조는 설정 기반 그대로 두고, 현재 설정값이 0.5 / 3% 인지 확인해 다르면 맞춘다”, “현재 설정값을 먼저 읽어 보고 보고할 것 — 이미 0.5 / 3% 면 변경 없음”.
- **레거시 원문·코드**: `tools/legacy-gas/종합견적서/index.html:2250`은 `el('#old_rate')?.value || '50'`을 읽는다. 같은 파일 `6976`은 `numInp('할인율(%)', 'old_rate', 50, 1)`로 입력칸을 만들고 `6979-6982`는 값 변경 시 `renderOld()`를 다시 실행한다. 즉 50은 초기값이고 견적 화면에서 바꿀 수 있다.
- **현행 코드·실측**: `clients/web/estimate-app/views/index.ejs:2425,2466-2476,7421`은 같은 입력칸을 서버 설정값으로 초기화하되 화면 입력값을 계산에 사용한다. `services/dc-config-service/src/main/resources/db/migration/V4__add_estimate_config.sql:9`의 기본값은 `0.5000`; 실행 DB 읽기 전용 조회도 활성 설정 `old_product_discount_rate=0.5000` 1행이었다.
- **금액 축**: **예** — 구제품 단가를 바꾼다.

## 2. EST-R03 — 종합견적서 카드 수수료

- **충돌 주장**: 레거시 3% 상수로 회귀하면 “설정 구조 유지·레거시 값 3%” 결정이 깨진다.
- **실측 판정**: **충돌**. 성격은 **레거시를 따르면 확정 결정이 깨진다**이다.
- **결정 원문**: `docs/decisions/2026-08-15-gas-rule-parity-decisions.md:34-49` — “**설정 유지 · 레거시 값으로 맞춤**”, “요율이 바뀔 때 배포가 필요 없는 구조를 지킨다. 다만 지금 값이 레거시와 같아야 한다.”
- **레거시 원문·코드**: `tools/legacy-gas/종합견적서/index.html:16182-16183`은 `Math.floor(total * 0.03)`으로 3%를 코드에 고정한다.
- **현행 코드·실측**: `clients/web/estimate-app/views/index.ejs:16921-16923`은 `getCardFeeRate()`를 사용하고, `2479-2480`은 `cardFeeRate` 설정을 읽는다. 설정 마이그레이션 기본값은 `0.0300`(`V4__add_estimate_config.sql:11`)이고 실행 DB 읽기 전용 조회도 `card_fee_rate=0.0300`이었다.
- **정해야 하는 것**: 레거시의 3% 코드 고정을 채택하기 위해 이미 확정한 “설정 구조 유지”를 뒤집을 것인지 정해야 한다.
- **금액 축**: **예** — 견적 총액에 더하는 카드 수수료를 바꾼다.

## 3. EST-R04 — 종합견적서 선결제

- **충돌 주장**: 현행은 선결제 시 총액을 차감하므로 “레거시가 맞고 총액은 깎지 않는다” 결정과 충돌한다.
- **실측 판정**: **충돌 아님 — Ⓐ**. 이것은 레거시와 확정 결정의 충돌이 아니라, 현행 코드가 둘과 어긋난 구현 차이다.
- **결정 원문**: `docs/decisions/2026-08-15-gas-rule-parity-decisions.md:14-29` — “**레거시가 맞다. 표기만 바꾼다**”, “견적 총액은 그대로 두고 결제방법만 표시한다”, “현행 음수 할인행을 제거해야 한다 — ‘설정이 0이면 안 뜬다’로 끝내지 마라”.
- **레거시 원문·코드**: `tools/legacy-gas/종합견적서/index.html:15575-15577`은 선택 결과를 `payDue: '선결제'`로 저장할 뿐 할인행이나 총액 차감 계산이 없다.
- **현행 코드·실측**: `clients/web/estimate-app/views/index.ejs:2574-2588`은 `advanceDiscountRate > 0`이면 음수 `선금할인` 행을 추가한다. 실행 DB 설정은 `advance_discount_rate=0.0000`이라 현재 값에서는 차감이 발동하지 않지만, 결정 원문이 명시했듯 코드 경로 자체는 남아 있다.
- **금액 축**: **예** — 설정이 0보다 크면 견적 총액을 직접 낮춘다.

## 4. DS-R17 — 지역표 관리

- **충돌 주장**: CSV에서 빠진 그룹을 DB에 남기는 현행은 “삭제행은 조회되지 않는다” 결정과 충돌한다.
- **실측 판정**: **충돌 아님 — Ⓐ**. CSV **누락 행**은 아직 삭제 처리된 행이 아니므로, 이를 soft-delete **조회 가시성** 결정과 동일시한 충돌 주장이 성립하지 않는다.
- **결정 원문**: `.claude/memory/project_build_conventions.md:17` — “Use `isDeleted=true` + `deletedAt` + `deletedBy`. Apply `@Where(clause = "is_deleted = false")` and global Hibernate filter so reads ignore tombstones automatically.” 즉 결정 대상은 tombstone이 된 행의 조회 제외다.
- **레거시 원문·코드**: `tools/legacy-gas/가배차분류리스트/Code.js:210-251`은 실행할 때마다 현재 Notion 결과만 만들고, `583-594`는 그 결과로 `region_hierarchy`와 `region_priority`를 매번 초기화한다. 원천에서 사라진 그룹은 다음 실행의 활성 분류에 없다.
- **현행 코드**: `RegionDispatchClassification.java:25,31`은 `@SQLRestriction("is_deleted = false")`를 적용하고, `RegionService.java:76-81`은 실제 삭제를 `markDeleted`로 처리한다. 반면 `RegionImportService.java:59-116`은 입력 행만 upsert하고 import 종료 뒤 “기존 활성 그룹 − 이번 CSV 그룹”을 삭제 처리하지 않는다. 실제 soft-delete된 그룹은 조회되지 않지만, CSV 누락 그룹은 삭제 상태가 아니어서 남는다.
- **갈래 범위**: 활성 지역표를 다음 분류에 반영하는 부분은 레거시 동작으로 맞출 수 있는 Ⓐ다. 기존 전표의 `classifiedRegionGroup` snapshot 소급 여부는 “삭제행 조회 제외” 결정이 다루지 않는 별도 시간축이다.
- **금액 축**: **아니오** — 지역 분류와 snapshot 가시성 차이다.

## 5. P-02 — 거래처 업데이트

- **충돌 주장**: 현행 import가 삭제행을 복원하고 파일에서 사라진 행을 남기는 것은 “삭제행은 조회되지 않는다” 결정과 충돌한다.
- **실측 판정**: **충돌 아님 — Ⓒ**. “soft-delete된 행을 일반 조회한다”, “입력 파일에 같은 코드가 다시 나타나 명시적으로 복원한다”, “이번 입력에 코드가 없다”는 서로 다른 상태다. 분류표가 세 상태를 한 충돌로 묶었다.
- **결정 원문 1**: `.claude/memory/project_build_conventions.md:17` — 정상 조회는 tombstone을 무시하고 물리 삭제는 금지한다.
- **결정 원문 2**: `.claude/memory/project_sp_08_legacy_gas_parity.md:13,17` — “raw … 는 이관 시점 snapshot으로만 유지하고 우리 DB/API가 source-of-truth”, “raw와 DB 충돌 시 항상 DB가 정답”, “재이관은 import/sync job 한 곳에서만 (멱등 + Soft Delete)”. 레거시의 배포용 개별 시트 전체 교체를 중앙 거래처 DB 전체 교체로 해석하지 않는다는 답이 이미 있다.
- **레거시 원문·코드**: `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:421-450`은 각 배포 대상 Google Sheet의 `거래처` 탭을 `ws.clear()`한 뒤 `valuesMatrix`로 다시 쓴다. 중앙 업무 DB 삭제 수명주기는 없다.
- **현행 코드**: `Partner.java:40`은 `@SQLRestriction("is_deleted = false")`로 정상 조회에서 삭제행을 제외한다. `EcountPartnerImporter.java:740-751`은 입력에 같은 `partnerCode`가 실제 들어온 경우에만 삭제 포함 조회 후 `markRestored()`하고, `740-789` 전체에는 이번 파일에서 사라진 코드 집합을 삭제하는 처리가 없다. 복원 뒤 행은 더 이상 tombstone이 아니므로 “삭제행 조회”가 아니다.
- **금액 축**: **아니오** — 이 규칙 자체는 거래처 집합과 생명주기 차이다.

## 요약

| 규칙 ID | 한 줄 판정 | 갈래 | 금액 축 |
|---|---|---|:---:|
| EST-R01 | 레거시 50% 고정 전제가 거짓이므로 충돌 아님 | Ⓒ | 예 |
| EST-R03 | 레거시 3% 고정 채택은 설정 유지 결정을 깨므로 충돌 | Ⓑ | 예 |
| EST-R04 | 레거시와 결정은 일치하고 현행 음수 할인행만 어긋남 | Ⓐ | 예 |
| DS-R17 | CSV 누락과 이미 soft-delete된 행의 조회를 혼동했으므로 충돌 아님 | Ⓐ | 아니오 |
| P-02 | 복원·원천 누락·삭제행 조회를 혼동했고 DB 정본 결정이 이미 있음 | Ⓒ | 아니오 |

- **실제 충돌**: **1건 / 5건** (`EST-R03`)
- **금액에 닿는 규칙**: **3건 / 5건** (`EST-R01`, `EST-R03`, `EST-R04`)

