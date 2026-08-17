# PR #436 (feat/bundle-set-expansion-pr1b-specs) — 실 Docker 사양 적재 QA 결과

> 목표: `ProductSheetSyncService` 가 실 구글시트(`<SHEET_ID>`)에서 사양을 실제로
> `product_spec` 테이블에 적재하는지 실증(개발책임자 "사양도 제대로 적재").
> 방식: standalone-boot 실 QA ([[standalone-boot-real-qa]]) — product-service jar 를
> 실 SA key + 실 시트 + docker Postgres(`samhan-postgres` / `product_db`) 로 부팅,
> 부팅 시 1회 `syncAll()` 실행 → 실 DB 쿼리로 검증.
> 가짜 데이터/code-read PASS 없음. 모든 수치는 실 시트 read + 실 DB SELECT 결과.

## 환경

| 항목 | 값 |
|---|---|
| 브랜치 | `feat/bundle-set-expansion-pr1b-specs` (HEAD `02a8edf3` — PR-1b FEAT `ce8c646d` + 리뷰-fix `02a8edf3`) |
| SA key | 로컬 SA key (`C:\dev\` 하위, repo 밖) — 파일명·client_email·private_key·project 미기록, [[lookup-seed-source]] 참조 |
| 시트 ID | `<SHEET_ID>` (default, 실 read 확인) |
| DB | docker `samhan-postgres` → `product_db` (PostgreSQL), Flyway V1~**V12** |
| 부팅 | `product-service.jar` standalone, SERVER_PORT=8184, eureka off, cron 비활성화(`0 0 5 31 12 *`)로 부팅 1회 sync 단독 |
| 부팅 시각 | 2026-06-09 14:27, Started in 12.13s, syncAll(상품) duration 80,206ms |

> products(1216) 는 직전 docker 스택이 이미 시드. `product_spec` 은 **이전 docker 이미지(PR-1b 前)
> 가 사양 적재 미수행 → 0건**에서 출발. 매 실행 전 `DELETE FROM product_spec` 로 clean slate.

## ⚠️ 머지차단 함정 1건 적발 — 스테일 jar (V12 누락) → `uq_ps_product_key` 실 INSERT 거부

본 QA 의 **핵심 적발**. 최초 빌드한 jar 가 V12 마이그레이션을 **포함하지 않아**(Gradle
`processResources UP-TO-DATE` 가 신규 `V12__product_spec_unique_active.sql` 을 jar 에 미반영),
부팅 sync 의 **상업멀티(COMMERCIAL_MULTI) 탭이 `duplicate key value violates unique
constraint "uq_ps_product_key"` 로 롤백** → 상업멀티 사양 일부 유실(249/338 품목만 적재).

- 근본 원인: V3 의 `uq_ps_product_key (product_id, spec_key)` 가 **전체 UNIQUE**(soft-delete 행 포함).
  `loadSpecsForProduct` 는 `@SQLRestriction(is_deleted=false)` 로 soft-delete 행을 못 보고 INSERT →
  키 churn / 동일 품목 다중 row 시 soft-deleted 행과 신규 active 행 충돌.
- PR-1b 리뷰-fix(`02a8edf3`)가 이미 **V12 — 부분 UNIQUE `ux_product_spec_active (…) WHERE
  is_deleted=false`** 로 정확히 교정해 둠. 그러나 **clean 빌드 없이는 jar 에 누락**되어 재현됨.
- 교훈([[enum-expansion-check-constraint]] 류): **신규 마이그레이션 추가 시 `clean bootJar` 필수**.
  `processResources UP-TO-DATE` = 시드/마이그레이션 stale jar 함정. → `boot-sync-stale-jar-defect.log`.

**해소**: `gradlew :services:product-service:clean :services:product-service:bootJar` 로 V12 포함
재빌드 → 부팅 시 **Flyway V12 적용**(`uq_ps_product_key` DROP + `ux_product_spec_active` 부분 UNIQUE 생성)
→ 6탭 전부 무오류 완주. 아래 모든 본문 수치는 **V12 적용 후(fixed jar)** 기준.

```
Migrating schema "public" to version "12 - product spec unique active"
Successfully applied 1 migration ... now at version v12
```

live index 확인: `ux_product_spec_active` (partial unique, WHERE is_deleted=false) 존재, `uq_ps_product_key` 제거됨.

## sync 로그 (사양 적재 — 핵심, V12 적용)

```
tab '홈멀티'       : updated=119
tab '싱글 세트'    : updated=288
tab '싱글 구성품'  : updated=790, unchanged=945      (사양 비대상 탭)
tab '상업멀티'     : updated=412, unchanged=2         (← 스테일 jar 에선 롤백, V12 후 무오류)
tab '상업멀티 구성': updated=489, unchanged=27        (사양 비대상 탭)
tab '구형'         : updated=41                        (사양 비대상 탭)
sync 완료: 구성품 linked=1603, bundle marked=343, 사양 linked=8286, duration=80206ms
```

(`boot-sync-fixed.log` 전문 첨부. 사양 보유 3탭 무오류 완주, duplicate-key 0건.)

## 실 DB 검증 쿼리 결과 (V12 적용 후)

### Q1. 적재 건수 (source of truth)

| 쿼리 | 결과 |
|---|---|
| `count(*) product_spec WHERE is_deleted=false` | **7866** (0 → 7866, 적재 성공) |
| 보유 품목 수 (distinct product_id, active) | 736 |

> `사양 linked=8286`(upsert 호출 수) > active 7866 차이 = 동일 품목이 여러 row 로 등장하여
> 마지막 row 값이 active 로 수렴(아래 관찰사항 2). 0 이 아니므로 헤더 정합 PASS.

### Q2. 사양 보유 카테고리별 적재 분포

| product_category | specs | products |
|---|---|---|
| SINGLE_SET | 4061 | 276 |
| COMMERCIAL_MULTI | 2968 | 335 |
| HOME_MULTI | 813 | 117 |
| SINGLE_PART | **24** | 8 |

> **HOME_MULTI / SINGLE_SET / COMMERCIAL_MULTI 3종만 의도 대상** (`isSpecBearing`) — 정상.
> 구형(OLD)·상업멀티 구성(COMMERCIAL_PART)·싱글 구성품(SINGLE_PART) = 사양 비대상 → 0 기대.
> **SINGLE_PART 24건은 의도외 누출**(관찰사항 1). 구형/COMMERCIAL_PART 는 0 확인(누출 없음).

### Q3. DISTINCT spec_key 목록 (비사양 누출 검사) — 30종

```
규격 / 난방성능(정격) / 냉매가스 / 냉방성능(정격) / 등급(냉방/난방) / 배관경 /
배관길이/고낙차(m) / 성능(kW)(최소/정격/최대) / 성능(kcal/h)(최소/정격/최대) /
소비전력(kW)(최소/정격/최대) / 소비전력(정격) / 소비효율등급 / 실내기중량(kg) /
실내기크기(mm) / 실내기포장(mm) / 실내기포장중량(kg) / 실외기중량(kg) / 실외기크기(mm) /
실외기포장(mm) / 에너지소비효율 / 용량 / 전원(mm²)/차단(A) / 전원선 / 제품중량 /
제품크기 / 차단기 / 최대고저차 / 최대연결실내기대수 / 최대장배관 / 포장치수
```

**가격/식별자성 키 누출 0건 (PASS)** — 명시 검사:
`spec_key ~ '출고|납품|소비자|단가|금액|합계|총액|정가|부가세|VAT|소계|LIST'`
`OR spec_key IN ('품명','모델명','모델','세트','수량','단위','평형','구분')` → **결과 0행**.
배관경/냉매가스/차단기/전원선/제품크기/중량/포장/냉방성능/소비전력/에너지효율 등 합리적 사양만 존재.
(SPEC_EXCLUDE_HEADERS + 리뷰-fix `isPriceLikeHeader` 가드 정상 작동.)

## 샘플 품목 사양 (GAS 사양 대조 — 합리성 PASS)

### 홈멀티 `AJ012BN1PBC2` (실내기 1-Way 무풍 소형 WIFI 3평형)

| spec_key | spec_value |
|---|---|
| 규격 | 소형 내장형 |
| 배관경 | 6/9 |
| 냉방성능(정격) | 1.2kw |
| 소비전력(정격) | 0.018kw |
| 냉매가스 | R410A |
| 전원선 | 2.5sq |
| 제품크기 | 740x135x360 |
| 용량 | 1.2 |
| 제품중량 | 8 |
| 포장치수 | 895x223x435 |

> 합리성 PASS: 3평형 1-Way 실내기 사양 구조 정합. spec_key↔value 정렬 정확.

### 싱글 세트 `AC023CS1DBC1SY` (15종 사양)

등급(냉방/난방)=3등급 / 배관경=6/9 / 소비전력(kW)(최소/정격/최대)=0.14/0.60/1.02 /
성능(kW)=0.80/2.30/3.10 / 성능(kcal/h)=688/1978/2666 / 전원(mm²)/차단(A)=2.5/20 /
실내기크기(mm)=970x135x410 / 실외기크기(mm)=790x548x285 / 배관길이/고낙차(m)=20/15 /
냉매가스=R410A / 실내기중량=9 / 실외기중량=28.5 / 실내기포장=1173x231x487 /
실외기포장=913x622x371 / 실내기포장중량=11.5

> 합리성 PASS: 싱글 세트 풀스펙(성능 kW·kcal/h 병기, 실내외기 별도 크기/중량/포장) 정합.

### 상업멀티 `AM016BN1PBH2` (V12 fix 로 복구된 카테고리)

용량=1.6 / 배관경=6/12 / 냉매가스=R410A / 냉방성능(정격)=1400kcal/h /
소비전력(정격)=0.019kw / 난방성능(정격)=1500kcal/h / 전원선=2.5sq / 제품크기=740x135x360

> 합리성 PASS. 스테일 jar 에선 이 탭이 통째 롤백되어 미적재였으나 V12 후 정상 적재.

## 멱등성 재sync 실증 (boot4)

동일 jar 로 **2차 부팅**(product_spec 이미 7866건 적재된 상태 위에 재sync):

| 항목 | 결과 |
|---|---|
| duplicate-key / `uq_ps_product_key` / `ux_product_spec_active` 위반 | **0건** |
| active spec 수(재sync 후) | **7866 (안정)** |
| 탭 sync 실패 | 0건 |

> V12 부분 UNIQUE 가 churn/재등장을 정상 흡수. 2차 sync 도 무오류 완주. `boot-sync-idempotency.log`.

## 관찰사항 (이슈)

### [P2] 동일 품목 다중 탭/다중 row 사양 소유권 충돌 → soft-delete 행 무한 누적 + last-row-wins
- `loadSpecsForProduct` 는 row 단위로 호출되고, 끝에서 "이번 row 의 `seenKeys` 에 없는 기존 spec"
  을 soft-delete 한다. 동일 modelCode 가 **여러 탭(예: 홈멀티 실내기 ↔ 싱글 세트 구성)** 또는
  한 탭의 여러 row 로 등장하면, 탭 A 가 적재한 키를 탭 B 가 "안 보임"으로 soft-delete →
  매 sync 마다 서로 키를 지워 **flapping**.
- 실측: 2회 sync 후 soft-deleted spec **416건 누적**(HOME_MULTI 규격 114 / 포장치수 98 /
  제품중량 90 …). active∩deleted 동일 (product, spec_key) **flapping 50건**(HOME_MULTI 39 /
  SINGLE_SET 11). 동일 (product, spec_key) 가 soft-deleted 행으로 **중복 누적**(예
  `AM052BN4DBH1` 규격 deleted 2행) → 부분 UNIQUE 는 active 만 막으므로 deleted 행은 무한 증가.
- 영향: **active 세트(7866)는 sane·결정적**(마지막 row 값 수렴)이라 "사양 적재" 자체는 PASS.
  단 (1) deleted 행 무한 누적(테이블 비대), (2) 다중 row 품목은 union 이 아닌 last-row-wins
  → 일부 사양 라벨 유실 가능. 머지차단 아님(P2). 후속: per-product 1회 사양 적재(탭 순서
  결정 또는 키 union) + deleted 행 정리 고려.

### [P3] 사양 비보유 행(KIT/판넬/액세서리)의 컬럼 오정렬 raw 저장
- 사양 보유 탭에 섞여 등장하는 비-유닛 행(예 `ACR-SKE|인체감시센서 KIT`,
  판넬 `PC6NUNK1NW`)은 헤더와 컬럼 레이아웃이 달라 `냉방성능(정격)=360 전용`,
  `냉방성능(정격)=Ø1020`(실제 판넬 치수) 처럼 **key↔value 오정렬** raw 저장.
- 이는 시트 자체의 행별 레이아웃 편차(legacy 데이터 품질)이며, 코드의 "통짜저장" 원칙상
  raw 보존이라 코드 버그 아님. PR-3 렌더 단계에서 카테고리별 정형화 대상. P3.

### [관찰] SINGLE_PART 24건 사양 누출 (위 P3 와 동근원)
- Q2 의 SINGLE_PART 24건(8 품목, 전부 판넬 PC*)은 해당 판넬이 **싱글 세트 탭의 row 로도
  등장** → `findByModelCodeAndIsDeletedFalse` 가 기존 SINGLE_PART 품목으로 resolve →
  싱글 세트 탭(spec-bearing)의 `loadSpecsForProduct` 가 SINGLE_PART 품목에 사양 부착.
  값은 위 오정렬(냉방성능=W900xD900 등)이라 P2/P3 동근원. 비사양 탭 의도(SINGLE_PART 0)와
  엄밀히는 어긋나나, 사양 보유 탭에 그 row 가 존재하므로 코드 동작 자체는 일관. 머지차단 아님.

## 결론

| 항목 | 판정 |
|---|---|
| 실 시트 → product_spec 실적재 | **PASS — 7866 사양 / 736 품목** (0 → 7866) |
| 사양 보유 3카테고리(HOME_MULTI/SINGLE_SET/COMMERCIAL_MULTI)만 적재 | **PASS** (구형·COMMERCIAL_PART 0) |
| 비사양(가격/식별자) spec_key 누출 | **PASS — 0건** (SPEC_EXCLUDE + isPriceLikeHeader 가드) |
| 샘플 품목 사양 GAS 정합 | **PASS** (홈멀티/싱글세트/상업멀티 실유닛 spec 정렬 정확) |
| Flyway V12 부분 UNIQUE + 멱등 재sync | **PASS** (재sync 무오류, active 안정 7866) |
| 머지차단 함정 | **적발·해소** — V12 누락 스테일 jar → `uq_ps_product_key` 롤백. clean 재빌드로 해소(빌드 절차 교훈) |
| 관찰 이슈 | P2 다중-row/탭 사양 flapping + deleted 행 누적(union 아닌 last-wins) / P3 비유닛 행 오정렬 raw / SINGLE_PART 24건 누출(동근원) |

**최종**: ProductSheetSyncService 가 실 구글시트에서 사양을 `product_spec` 테이블에
**제대로 적재함** 실증 완료(7866건, 3 카테고리, 비사양 누출 0). code-read 아님 — 실 부팅 +
실 시트 read(SA key) + 실 DB SELECT. 단, **clean bootJar 필수**(V12 누락 스테일 jar 가
상업멀티 탭을 롤백시키는 함정 적발), 그리고 다중-row 품목 사양 flapping(P2)·비유닛 행
오정렬(P3)은 후속 정리 대상.
