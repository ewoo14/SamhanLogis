# PR #1045 가배차 8개 실행 모드 R5 재수렴 — fix 이후 실제 사용 가능성

## 조사 기준

- 작업 디렉터리: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치 상태 확인 원문: `## feat/1039-provisional-dispatch...origin/feat/1039-provisional-dispatch`
- HEAD 확인 원문: `bf8655c20 [FIX] #1039 CI red 2건 — 출처 없는 창고 조회 500 · Playwright 계약`
- 조사 시작 시 신규 미추적 파일은 이 보고서 하나뿐이었다: `?? docs/dev-reports/2026-08-03-1039-r5-reconvergence.md`
- 이번 범위: fix 이후 실제 사용 가능성(모드별 건수, V101 이후 신규 전표의 source warehouse code, 0건/UNKNOWN/inventory 실패 화면 구분, 부분 장애 전파)만 조사한다.

## 확인 1 — 공유 DB의 V101 적용 상태

실행:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT COUNT(*) AS active_outbound, COUNT(source_warehouse_code) AS code_filled, COUNT(*) FILTER (WHERE source_warehouse_code='00003') AS chowol_code, COUNT(*) FILTER (WHERE source_warehouse_code='2') AS sangil_code, COUNT(*) FILTER (WHERE source_warehouse_code IS NULL OR btrim(source_warehouse_code)='') AS unknown_code FROM slips WHERE slip_type='OUTBOUND' AND is_deleted=false;"
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT installed_rank, version, description, success FROM flyway_schema_history WHERE version IN ('62','101') ORDER BY installed_rank;"
```

출력 원문:

```text
ERROR:  column "source_warehouse_code" does not exist
LINE 1: SELECT COUNT(*) AS active_outbound, COUNT(source_warehouse_c...
                                                  ^
HINT:  Perhaps you meant to reference the column "slips.source_warehouse_id".

 installed_rank | version | description | success
----------------+---------+-------------+---------
(0 rows)
```

확인 결과: 공유 `slip_db`에는 V101이 아직 적용되지 않았고 `slips.source_warehouse_code` 열도 없다. 따라서 공유 DB를 변경하지 않는 이번 라운드에서는 fix 후 HTTP를 직접 실행할 수 없으며, fix 후 건수는 현재 데이터에 V101의 “기존 행 backfill 없음” 의미를 적용한 읽기 전용 SELECT로 산출해야 한다. 이 제한은 HTTP 실측 여부에만 해당하며 현재 행 수와 모드 predicate 산출은 가능하다.

## 확인 2 — 모드별 fix 전후 산출 건수

비교 기준:

- fix 전: `7e5dc46a4`의 실제 코드 계약. `warehouse`가 blank이면 `warehouseAllowed()`가 `true`를 반환한다. 현 공유 outbound 경로에서는 업무 창고명이 projection에 없었던 상태이므로 blank fallback을 적용했다.
- fix 후: HEAD `PreClassifyService.java:118-155`. V101은 기존 행을 backfill하지 않으므로 2,303행 모두 `UNKNOWN`; 공통 제외 후 STACK은 모드 1·2·3·6·7·8에서 창고 판정 전에 통과하고, 모드 4·5와 나머지 일반행은 SANGIL/CHOWOL 판정을 요구한다.

실행:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "WITH base AS (SELECT COALESCE(delivery_tag='STACK',false) AS stack, COALESCE(delivery_tag='REGION',false) AS region, (COALESCE(LEFT(delivery_address,10) ~ '(회수|회차|차용|대여|반납|자가)',false) OR COALESCE(delivery_address ~ '(경동|로젠)',false) OR COALESCE(memo ~ '(회수|회차|차용|대여|반납|자가)',false)) AS old_excluded, (COALESCE(LEFT(delivery_address,10) ~ '(회수|회차|차용|대여|반납|자가)',false) OR COALESCE(delivery_address ~ '(경동|로젠)[^/|:]*(/|[|]|:)',false)) AS new_excluded FROM slips WHERE slip_type='OUTBOUND' AND is_deleted=false), counts AS (SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE stack) AS stack_total, COUNT(*) FILTER (WHERE region) AS region_total, COUNT(*) FILTER (WHERE stack OR (NOT old_excluded AND NOT region)) AS before_mode_1_2_3, COUNT(*) FILTER (WHERE stack) AS before_mode_4, COUNT(*) FILTER (WHERE region) AS before_mode_5, COUNT(*) FILTER (WHERE stack OR NOT old_excluded) AS before_mode_6_7_8, COUNT(*) FILTER (WHERE NOT new_excluded AND stack) AS after_mode_1_2_3_6_7_8 FROM base) SELECT total, stack_total, region_total, before_mode_1_2_3 AS before_m1, before_mode_1_2_3 AS before_m2, before_mode_1_2_3 AS before_m3, before_mode_4 AS before_m4, before_mode_5 AS before_m5, before_mode_6_7_8 AS before_m6, before_mode_6_7_8 AS before_m7, before_mode_6_7_8 AS before_m8, after_mode_1_2_3_6_7_8 AS after_m1, after_mode_1_2_3_6_7_8 AS after_m2, after_mode_1_2_3_6_7_8 AS after_m3, 0 AS after_m4, 0 AS after_m5, after_mode_1_2_3_6_7_8 AS after_m6, after_mode_1_2_3_6_7_8 AS after_m7, after_mode_1_2_3_6_7_8 AS after_m8 FROM counts;"
```

출력 원문:

```text
 total | stack_total | region_total | before_m1 | before_m2 | before_m3 | before_m4 | before_m5 | before_m6 | before_m7 | before_m8 | after_m1 | after_m2 | after_m3 | after_m4 | after_m5 | after_m6 | after_m7 | after_m8
-------+-------------+--------------+-----------+-----------+-----------+-----------+-----------+-----------+-----------+-----------+----------+----------+----------+----------+----------+----------+----------+----------
  2303 |          11 |           12 |      2291 |      2291 |      2291 |        11 |        12 |      2303 |      2303 |      2303 |       11 |       11 |       11 |        0 |        0 |       11 |       11 |       11
(1 row)
```

| 모드 | fix 전 | fix 후(기존 2,303행 UNKNOWN) | 변화 |
|---:|---:|---:|---:|
| 1 | 2,291 | 11 | -2,280 |
| 2 | 2,291 | 11 | -2,280 |
| 3 | 2,291 | 11 | -2,280 |
| 4 | 11 | 0 | -11 |
| 5 | 12 | 0 | -12 |
| 6 | 2,303 | 11 | -2,292 |
| 7 | 2,303 | 11 | -2,292 |
| 8 | 2,303 | 11 | -2,292 |

사용자가 제시한 fix 전 2,304건은 직전 공유 DB 스냅샷이고, 이번 단일 SELECT 시점의 활성 OUTBOUND는 2,303건이다. DB write 없이 한 행이 줄어든 현재 스냅샷을 전후 양쪽에 동일 적용했다.

중요: fix 후 8개 모드가 전부 0건은 아니다. `PreClassifyService.java:136-138`의 STACK 우선 분기 때문에 UNKNOWN인 STACK 11건이 모드 1·2·3·6·7·8에 남고, 모드 4·5만 0건이다. 이번 라운드에서 야적 집합의 옳고 그름은 지시대로 판정하지 않고 수치에만 반영했다.

## 확인 3 — V101 이후 신규 전표의 source warehouse code 저장 경로

### 저장되는 경로

`SlipPublishService`의 세 내부 발행 경로는 요청의 `warehouseCode`를 UUID로 resolve한 직후 동일 원천값을 저장한다.

- 견적 발행: `SlipPublishService.java:121-150` — `publishFromEstimate`, `req.warehouseCode()` resolve 후 `slip.setSourceWarehouseCode(req.warehouseCode())`.
- 거래처 주문 발행: `SlipPublishService.java:201-230` — `publishFromPartnerOrder`, UUID/code resolve 후 동일 setter 호출.
- 주문 병합 발행: `SlipPublishService.java:304-329` — `publishFromOrdersMerge`, UUID/code resolve 후 동일 setter 호출.

### 저장되지 않는 실제 신규 OUTBOUND 경로 — 결함 R5-1

- 파일:줄
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:231-257` — 일반 `POST /slips`가 OUTBOUND를 만들지만 setter 호출 없음.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/CreateSlipRequest.java:49-56` — 요청 계약 자체가 `sourceWarehouseId`만 받고 legacy `warehouseCode`는 받지 않음.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java:107-130` 및 `mobile/dto/MobilePartnerOrderRequest.java:25-34` — 모바일 즉시 주문도 UUID만 받아 OUTBOUND를 만들고 setter 호출 없음.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:52-70,114` — 수락 견적 자동 변환은 placeholder UUID로 OUTBOUND를 저장하고 setter 호출 없음.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDuplicateService.java:80-99` — 기존 OUTBOUND 복사도 원본 `sourceWarehouseId`만 복사하고 `sourceWarehouseCode`는 복사하지 않음.
  - 저장소 전체 생산 코드에서 `setSourceWarehouseCode` 호출은 위 `SlipPublishService` 세 곳뿐이다.
- 사용자 조작
  - 데스크톱 매출전표에서 출고 창고를 고르고 새 전표를 직접 작성한다(`POST /slips`). 또는 모바일에서 주문을 즉시 등록하거나, 기존 출고전표를 복사하거나, 기존 견적을 수락하여 자동 전표 변환한다.
- 잘못된 결과
  - V101 적용 후 생성되는 새 행인데도 `source_warehouse_code=NULL`로 저장된다. outbound 응답은 `WarehouseCodeMapper.businessType(null) -> UNKNOWN`이 되고, 정상 창고를 골랐어도 일반 행은 8개 모드에서 빠진다. 즉 “신규부터 provenance가 쌓인다”는 fix의 전제가 세 내부 publish API에만 성립하고 주요 사용자 생성 경로에는 성립하지 않는다.
- 재현 명령

```powershell
rg -n "Slip\.createOutbound\(|setSourceWarehouseCode" services/slip-service/src/main/java
```

출력 원문:

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:146:        Slip slip = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:150:        slip.setSourceWarehouseCode(req.warehouseCode());
services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:226:        Slip slip = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:230:        slip.setSourceWarehouseCode(req.warehouseCode());
services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:327:        Slip slip = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:329:        slip.setSourceWarehouseCode(req.warehouseCode());
services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:63:        Slip slip = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java:114:        Slip slip = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:342:            slip = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDuplicateService.java:94:            copy = Slip.createOutbound(...
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:251:            slip = Slip.createOutbound(...
```

판정: **도달 가능한 결함 1건.** 신규 전표도 생성 경로에 따라 계속 UNKNOWN이 된다. Seeder는 사용자 조작 경로가 아니므로 결함 경로 수에 별도로 더하지 않았다.

## 확인 4 — 화면의 정상 0건 / UNKNOWN / inventory 실패 구분

### 아로로지스 데스크톱 `/dispatches/pre-classify`

세 상태가 코드상 서로 다른 문구로 구분된다.

- 정상 0건: `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:505-507` — `unknownWarehouseCount===0`이고 결과도 비었을 때 `해당 기간에 출고전표가 없습니다.`
- UNKNOWN: 같은 파일 `:499-503` — `창고 업무 구분 미확정 N건은 분류에서 제외되었습니다...`
- 조회 실패: 같은 파일 `:493-495` — React Query error 상태에 `조회 실패 — 잠시 후 다시 시도해 주세요.`

### Samhan Public 데스크톱 `/arologis/pre-classify` — 결함 R5-2

- 파일:줄
  - `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:345-353` — 오류와 빈 결과만 있고 `unknownWarehouseCount` 분기가 없다.
  - `clients/desktop/src/renderer/api/arologisDispatchApi.ts:62-66` — `PreClassifyResponse`에 `unknownWarehouseCount` 계약이 없다.
  - 반면 같은 PR의 아로로지스 데스크톱 계약은 `clients/arologis-desktop/src/renderer/api/arologisDispatch.ts:67-72`에 필드를 가진다.
- 사용자 조작: Samhan Public 데스크톱에서 `/arologis/pre-classify`에 들어가 기존 전표 기간과 실행 모드를 조회한다.
- 잘못된 결과: 서버가 `unknownWarehouseCount=2303`, 빈 `regionGroups/unclassified`를 정상 반환해도 이 화면은 UNKNOWN을 소비하지 않고 `해당 기간에 출고전표가 없습니다.`라고 표시한다. ① 정상 대상 0건과 ② 업무 구분 미확정이 같은 모양이다. inventory 실패(③)는 별도 오류 문구이므로 ①/②만 충돌한다.
- 재현 명령:

```powershell
rg -n "unknownWarehouseCount|조회 실패|출고전표가 없습니다" clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx clients/arologis-desktop/src/renderer/api/arologisDispatch.ts clients/desktop/src/renderer/api/arologisDispatchApi.ts
```

출력 원문:

```text
clients/arologis-desktop/src/renderer/api/arologisDispatch.ts:71:  unknownWarehouseCount: number
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:493:        {query.isError ? (
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:494:          <div style={errorStyle}>조회 실패 — 잠시 후 다시 시도해 주세요.</div>
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:499:            {(data.unknownWarehouseCount ?? 0) > 0 ? (
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:501:                창고 업무 구분 미확정 {data.unknownWarehouseCount}건은 분류에서 제외되었습니다...
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:505:            {... && (data.unknownWarehouseCount ?? 0) === 0 ? (
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:506:              <div style={emptyStyle}>해당 기간에 출고전표가 없습니다.</div>
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:345:        {query.isError ? (
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:346:          <div style={errorStyle}>조회 실패 — 잠시 후 다시 시도해 주세요.</div>
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:352:              <div style={emptyStyle}>해당 기간에 출고전표가 없습니다.</div>
```

판정: **도달 가능한 결함 1건 추가(누계 2건).** 아로로지스 독립 화면은 세 상태를 구분하지만, 이 PR이 함께 변경한 Samhan Public 화면은 UNKNOWN을 정상 0건으로 오표시한다.

## 확인 5 — inventory 장애의 전파 범위

### 결함 R5-3 — 창고 한 건의 404가 기간 전체 조회를 중단한다

- 파일:줄
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:323-330` — 기간 전표 전체를 stream으로 순회하며 각 행마다 `findWarehouseName`을 호출한다. 행별 예외 격리나 부분 성공 응답이 없다.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/client/WarehouseInternalClient.java:43-65` — 한 UUID의 4xx/5xx/연결 실패를 `IllegalStateException`으로 던진다.
  - `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipServiceClient.java:143-151` — slip-service의 실패는 다시 조회 실패로 전파한다.
- 사용자 조작: 가배차 화면에서 `2026-05-30` 또는 `2026-06-23`을 포함한 기간을 조회한다.
- 잘못된 결과: 해당 기간의 정상 전표가 있어도 inventory에 없는 창고 UUID 전표 한 건에서 map 전체가 중단되어 `/internal/slips/outbound`가 500이 되고 화면 전체가 `조회 실패`가 된다. 업무 구분은 `source_warehouse_code`에서 산출하도록 고쳤으므로 표시명 한 건 실패 때문에 분류 데이터 전체를 잃는 것은 과잉 전파다.
- 현재 영향 건수: inventory에 없는 UUID를 가진 활성 OUTBOUND 4건. 비즈니스 식별자는 `2026/05/30-1`, `2026/05/30-2`, `2026/05/30-3`, `2026/06/23-1`이다. 이 행 중 하나라도 조회 범위에 있으면 그 범위의 정상 행도 함께 실패한다.

읽기 전용 DB 재현:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT slip_no, slip_date, source_warehouse_id FROM slips WHERE slip_type='OUTBOUND' AND is_deleted=false AND source_warehouse_id='11111111-1111-1111-1111-111111111111'::uuid ORDER BY slip_date, slip_no;"
```

출력 원문:

```text
   slip_no    | slip_date  |         source_warehouse_id
--------------+------------+--------------------------------------
 2026/05/30-1 | 2026-05-30 | 11111111-1111-1111-1111-111111111111
 2026/05/30-2 | 2026-05-30 | 11111111-1111-1111-1111-111111111111
 2026/05/30-3 | 2026-05-30 | 11111111-1111-1111-1111-111111111111
 2026/06/23-1 | 2026-06-23 | 11111111-1111-1111-1111-111111111111
(4 rows)
```

실 inventory 재현:

```powershell
curl.exe -sS -i -H "X-Internal-Token: dev-internal-token-change-me" "http://localhost:8085/internal/inventory/warehouses/11111111-1111-1111-1111-111111111111"
```

출력 원문:

```text
HTTP/1.1 404
Content-Type: application/json

{"success":false,"code":"NOT_FOUND","message":"창고를 찾을 수 없습니다","data":null,...}
```

표적 예외 계약 검증(전체 suite 아님):

```powershell
.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.client.WarehouseInternalClientTest" --no-daemon
```

출력 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 13s
18 actionable tasks: 1 executed, 17 up-to-date
```

정상 0건은 오류로 표시되지 않는다. repository 결과가 빈 목록이면 `SlipInternalController.java:323-330`의 map 본문이 호출되지 않고 정상 `ApiResponse.ok([])`가 반환되며, 아로로지스 화면은 `query.isError=false`의 빈 상태 문구로 간다.

판정: **도달 가능한 결함 1건 추가(누계 3건).** 정상 0건과 전체 장애의 구분 자체는 맞지만, 한 창고의 조회 실패를 행 단위로 격리하지 않아 현재 실데이터 4건이 포함된 기간 전체를 죽인다.

## 개발책임자 판단 항목 — 기존 2,303행의 UNKNOWN 정책

기존 행의 발행 당시 warehouse code provenance는 코드만으로 복원할 수 없으므로, “기존 행을 UNKNOWN으로 남기는 것이 맞는가”는 결함으로 세지 않는다. 선택지별 현재 스냅샷 영향은 다음과 같다.

| 선택지 | known / UNKNOWN | 모드 1~8 산출 건수 | 영향 |
|---|---:|---|---|
| A. 원천 엄격 유지(현재) | 0 / 2,303 | 11, 11, 11, 0, 0, 11, 11, 11 | provenance를 추측하지 않는다. 대신 기존 일반 전표 2,292건이 모든 모드에서 사라지고, STACK 11건만 일부 모드에 남는다. |
| B. 현재 UUID 매핑으로 1회 추론 backfill | 1,361 / 942 | 1,354, 864, 501, 11, 7, 1,361, 871, 501 | 현재 HQ UUID→00003/CHOWOL, VH UUID→2/SANGIL로 가정한다. 업무 사용성은 크게 복구되지만 “현재 UUID가 발행 당시 code를 증명한다”는 보장이 없다. |
| C. UNKNOWN을 legacy blank fallback처럼 통과 | 0 / 2,303(표시는 UNKNOWN) | 2,291, 2,291, 2,291, 11, 12, 2,303, 2,303, 2,303 | 기존 화면 건수는 복구되지만 상일/초월 전용 모드가 같은 집합이 되어 창고별 모드 의미와 데이터 신뢰성을 잃는다. |

B 영향 산출 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "WITH base AS (SELECT CASE WHEN source_warehouse_id='11111111-1111-1111-1111-000000000001'::uuid THEN 'CHOWOL' WHEN source_warehouse_id='11111111-1111-1111-1111-000000000002'::uuid THEN 'SANGIL' ELSE 'UNKNOWN' END AS business_type, COALESCE(delivery_tag='STACK',false) AS stack, COALESCE(delivery_tag='REGION',false) AS region, (COALESCE(LEFT(delivery_address,10) ~ '(회수|회차|차용|대여|반납|자가)',false) OR COALESCE(delivery_address ~ '(경동|로젠)[^/|:]*(/|[|]|:)',false)) AS excluded FROM slips WHERE slip_type='OUTBOUND' AND is_deleted=false) SELECT COUNT(*) FILTER(WHERE business_type IN('CHOWOL','SANGIL')) AS inferred_known, COUNT(*) FILTER(WHERE business_type='UNKNOWN') AS still_unknown, COUNT(*) FILTER(WHERE NOT excluded AND (stack OR (NOT region AND business_type IN('CHOWOL','SANGIL')))) AS mode1, COUNT(*) FILTER(WHERE NOT excluded AND (stack OR (NOT region AND business_type='CHOWOL'))) AS mode2, COUNT(*) FILTER(WHERE NOT excluded AND (stack OR (NOT region AND business_type='SANGIL'))) AS mode3, COUNT(*) FILTER(WHERE NOT excluded AND stack AND business_type IN('CHOWOL','SANGIL')) AS mode4, COUNT(*) FILTER(WHERE NOT excluded AND region AND business_type IN('CHOWOL','SANGIL')) AS mode5, COUNT(*) FILTER(WHERE NOT excluded AND (stack OR business_type IN('CHOWOL','SANGIL'))) AS mode6, COUNT(*) FILTER(WHERE NOT excluded AND (stack OR business_type='CHOWOL')) AS mode7, COUNT(*) FILTER(WHERE NOT excluded AND (stack OR business_type='SANGIL')) AS mode8 FROM base;"
```

출력 원문:

```text
 inferred_known | still_unknown | mode1 | mode2 | mode3 | mode4 | mode5 | mode6 | mode7 | mode8
----------------+---------------+-------+-------+-------+-------+-------+-------+-------+-------
           1361 |           942 |  1354 |   864 |   501 |    11 |     7 |  1361 |   871 |   501
(1 row)
```

권고가 아니라 판단 기준: provenance 무추측이 최우선이면 A, 기존 업무 사용성의 즉시 복구가 최우선이고 UUID 역사 동일성을 개발책임자가 보증할 수 있으면 B다. C는 창고별 모드가 실질적으로 무력화되므로 영향이 가장 크다.

## 표적 검증

전체 slip-service suite는 실행하지 않았다.

```powershell
.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.client.WarehouseInternalClientTest" --no-daemon
```

```text
BUILD SUCCESSFUL in 13s
18 actionable tasks: 1 executed, 17 up-to-date
```

```powershell
.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.service.PreClassifyServiceTest" --no-daemon
```

```text
BUILD SUCCESSFUL in 11s
15 actionable tasks: 15 up-to-date
```

화면 UNKNOWN/정상 0건/오류 삼분기를 직접 렌더하는 테스트는 두 데스크톱 모두 검색 결과 0건이었다. 따라서 아로로지스 화면의 세 문구 구분과 Samhan Public 화면의 누락은 생산 TSX/응답 타입 정적 경로로 판정했으며, Docker 이미지 rebuild 금지에 따라 PR HEAD 브라우저 E2E는 미판정이다.

## 최종 판정

**이 각도에서 도달 가능한 결함 3건.** fix 이후 기능은 그대로는 실제 사용 가능하다고 판정할 수 없다.

1. 신규 OUTBOUND도 일반 데스크톱 생성·모바일 주문·견적 자동 변환·전표 복사 경로에서는 `source_warehouse_code`가 계속 NULL이다.
2. Samhan Public의 `/arologis/pre-classify` 화면은 UNKNOWN을 정상 0건과 같은 문구로 표시한다.
3. inventory 창고 한 건의 404가 기간 전체 outbound 조회를 중단한다. 현재 실데이터에 도달 가능한 행 4건이 있다.

별도 개발책임자 판단 항목은 기존 2,303행의 provenance 정책이다. 현재 엄격 정책(A)은 모드 1·2·3·6·7·8 각 11건, 모드 4·5 0건만 남긴다. UUID 추론 backfill(B)은 1,361건을 known으로 복구하지만 역사적 동일성 보증이 필요하다.

## 이번 라운드가 보지 않은 표면

지시대로 다음은 조사·판정하지 않았다.

- 8개 모드 집합 자체의 레거시 대조
- `sourceWarehouseName` 소비자 sweep
- 야적 중복 및 STACK 우선 규칙의 옳고 그름
- 공통 제외 범위
- 화면 mode 저장·복원 상태
- 전체 test suite
- 리팩터링 및 수정 구현

추가 미판정:

- 공유 DB에는 V101이 적용되지 않아 PR HEAD의 실제 HTTP/브라우저 E2E는 실행하지 못했다.
- 운영 DB의 실제 행 수·warehouse UUID 역사와 운영 inventory 상태는 확인하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-03-1039-r5-reconvergence.md`

## 마감 재확인

- `git diff --check`: 출력 없음, exit 0.
- `git status --short`: `?? docs/dev-reports/2026-08-03-1039-r5-reconvergence.md` 한 건.
- 동일 DB 핵심 집계를 마감 직전에 다시 실행한 결과: `total=2303`, fix 전 `m1~3=2291`, `m4=11`, `m5=12`, `m6~8=2303`, fix 후 UNKNOWN 기준 `m1~3·m6~8=11`로 본문 수치와 일치했다.
