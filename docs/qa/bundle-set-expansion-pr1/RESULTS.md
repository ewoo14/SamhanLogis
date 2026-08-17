# PR #435 (feat/bundle-set-expansion-pr1) — 실 Docker sync QA 결과

> 목표: `ProductSheetSyncService` 가 실 구글시트(`<SHEET_ID>`)에서 세트↔구성품을
> 실제로 `bundle_component` 테이블에 적재하는지 실증.
> 방식: standalone-boot 실 QA ([[standalone-boot-real-qa]]) — product-service jar 를
> 실 SA key + 실 시트 + docker Postgres(`samhan-postgres` / `product_db`) 로 부팅,
> 부팅 시 1회 `syncAll()` 실행 → 실 DB 쿼리로 검증.
> 가짜 데이터/code-read PASS 없음. 모든 수치는 실 시트 read + 실 DB SELECT 결과.

## 환경

| 항목 | 값 |
|---|---|
| 브랜치 | `feat/bundle-set-expansion-pr1` (HEAD `a9300c3d`) |
| SA key | 로컬 SA key (`C:\dev\` 하위, repo 밖) — client_email·private_key·project 미기록, [[lookup-seed-source]] 참조 |
| 시트 ID | `<SHEET_ID>` (default, 실 read 확인) |
| DB | docker `samhan-postgres` → `product_db` (PostgreSQL 16.14), Flyway V1~V11 |
| 부팅 | `product-service.jar` standalone, SERVER_PORT=8184, eureka off, scheduling on (부팅 1회 sync) |
| 부팅 시각 | 2026-06-09 13:41, Started in 12.67s, syncAll duration 68,211ms |

## Flyway V11 적용 (부팅 로그)

```
Migrating schema "public" to version "11 - bundle component unique active"
Successfully applied 1 migration to schema "public", now at version v11 (execution time 00:00.032s)
```

DB 확인: `flyway_schema_history` version 11 success=t, 부분 유니크 인덱스
`ux_bundle_component_active (bundle_product_id, component_product_code) WHERE is_deleted=false` 생성됨.

## sync 로그 (구성품 적재 — 핵심)

```
구성품 tab '싱글 구성품_단가인상' : linked=1447, bundlesMarked=271, softDeleted=0, skipped=11
구성품 tab '상업멀티 구성_단가인상': linked=156,  bundlesMarked=72,  softDeleted=0, skipped=32
sync 완료: inserted=1116, updated=1023, softDeleted=0, skipped=0, 구성품 linked=1603, bundle marked=343, duration=68211ms
```

## 실 DB 검증 쿼리 결과

### 적재 건수 (source of truth)

| 쿼리 | 결과 |
|---|---|
| `count(*) products WHERE product_type='BUNDLE' AND is_deleted=false` | **343** (세트 부모) |
| `count(*) bundle_component WHERE is_deleted=false` | **1584** (구성품) |

> linked 1603 vs active 1584 차이(19) = 동일 (부모,자식코드) natural-key 가 시트에 중복 등장 → 멱등 upsert 가 1행으로 수렴(V11 유니크 인덱스 + `changeAttributes`). 정상.

### 부모 카테고리 분포

| product_category | count |
|---|---|
| SINGLE_SET | 271 |
| COMMERCIAL_MULTI | 72 |

### bundle_mode 분포

| bundle_mode | count |
|---|---|
| EXPAND | 343 |
| KEEP | 0 |

> KEEP 0 = **데이터 정확**(버그 아님). `isKeepSet` 패턴(유선보드/AIM-A01N, 발통세트,
> SI-AL700a, 실링 드레인펌프)은 **부모(`세트` 컬럼) 로 등장하는 세트** 에만 적용된다.
> DB 확인 결과 해당 4개 모델은 모두 `product_type=SINGLE`(구성품/액세서리 자체)로
> 존재하며 현 시트 스냅샷에서 어떤 세트의 부모로도 나타나지 않음 → KEEP 마킹 대상 0.
> (예: AIM-A01N=유선리모컨 키트, 발통세트=원형발통 세트 — 모두 자식 부품) KEEP 분기는
> 도달 가능하나 현 시트에 KEEP 세트 부모가 없을 뿐. 자식 component_kind=FOOT 도 0건.

### qty_mode 분포

| qty_mode | count |
|---|---|
| FOLLOW_SET | 1584 |

> 전량 FOLLOW_SET = PR 리뷰-fix(a9300c3d) 의 "상업 수량 N=FOLLOW_SET(GAS 정합)" 정책과 일치.

### component_kind 분포

| kind | count |
|---|---|
| REMOTE | 315 |
| MATERIAL | 273 |
| OUTDOOR | 271 |
| INDOOR | 271 |
| PANEL | 250 |
| ACCESSORY | 204 |

## 샘플 세트 → 구성품 (GAS 구성 대조)

### 싱글 세트 `AC145CS6PHH1SY` (360 CST UV) — 13 구성품

| comp_code | kind | qty_mode | qty | variant | is_default |
|---|---|---|---|---|---|
| AC145CN6PHH1 | INDOOR | FOLLOW_SET | 1 | 기본 | t |
| AC145CXAPHH1 | OUTDOOR | FOLLOW_SET | 1 | 기본 | t |
| PC6NUNK1NW | PANEL | FOLLOW_SET | 1 | 기본 | t |
| PC6NUDK1NW / PC6NBNK1NW / PC6NBDK1NW / PC6EUCK1NW / PC6NUCK1NW / PC6EUXK1NW / PC6NUXK1NW | PANEL | FOLLOW_SET | 1 | 사각/원형 블랙/사각 블랙/원형 공청/사각 공청/원형 승강/사각 승강 | f |
| AR-EH05 | REMOTE | FOLLOW_SET | 1 | 기본 | t |
| AWR-WG00N / AWR-WE13N | REMOTE | FOLLOW_SET | 1 | 컬러유선리모컨/유선리모컨 | f |

> 합리성 PASS: 1 실내기 + 1 실외기 + 7 판넬 옵션(기본 1 + 대체 6) + 3 리모컨(기본 1 + 대체 2).
> 360 카세트 세트의 실 구성 구조와 정합. is_default=true 가 각 kind 의 기본 옵션을 정확히 표시.

### 상업멀티 세트 `AM460AXVUHH1SY` (DVM S2 프레스티지 46HP, 12HP+16HP+18HP) — 3 구성품

| comp_code | kind | qty | spec |
|---|---|---|---|
| AM120AXVUHH1 | ACCESSORY | 1 | |
| AM160AXVUHH1 | ACCESSORY | 1 | |
| AM180AXVUHH1 | ACCESSORY | 1 | |

> 합리성 PASS: 46HP 콤보 = 12+16+18HP 3개 실외기 모듈로 분해(GAS explodeCommSets_ 정합).
> ⚠️ kind=ACCESSORY: 상업멀티 구성 탭은 `구분` 컬럼이 실외기/실내기를 명시하지 않아
> name+variant fallback 매칭 실패 → ACCESSORY 로 분류. linkage/qty 는 정확. (분류 정밀도 마이너 이슈, P3)

## 헤더 정합 (PASS)

실 시트 헤더가 코드 후보(`세트`/`구분`/`수량`/`구성품특징`·`특징`/`규격`/`모델명`…)와
정합 → `findComponentHeaderRow` + `findColumnByHeader` 가 양 탭에서 `세트`+`모델` 컬럼을
정상 탐색하여 linked>0 달성. 헤더 미정합 시 발생하는 linked=0 / skip 전량 현상 **없음**.
skipped(싱글 11 / 상업 32)는 부모·자식 modelCode 가 DB Product 에 미존재한 행(시트 정합 결측)
으로, 헤더 문제가 아니라 개별 row 데이터 결측(정상 skip).

## 결론

| 항목 | 판정 |
|---|---|
| 실 시트 → bundle_component 실적재 | **PASS — 1584 구성품 / 343 BUNDLE 부모** |
| Flyway V11 + 유니크 인덱스 | **PASS** |
| 샘플 세트 구성품 GAS 정합 | **PASS** (싱글 360 카세트 / 상업 46HP 콤보) |
| 헤더 정합 | **PASS** (보정 불필요) |
| qty_mode FOLLOW_SET | **PASS** (리뷰-fix 정책 정합) |
| 관찰사항 | KEEP 세트 0 = 현 시트에 KEEP 부모 부재(버그 아님, 데이터 정확) / 상업 구성 kind=ACCESSORY 분류 정밀도 P3 |

**최종**: ProductSheetSyncService 가 실 구글시트에서 세트↔구성품을 `bundle_component`
테이블에 **제대로 적재함** 실증 완료(1584건). code-read 아님 — 실 부팅 + 실 시트 read +
실 DB SELECT.
