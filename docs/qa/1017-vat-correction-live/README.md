# VAT Correction Live QA (V61)

## 0단계 — 배포본 확인

명령:
```text
docker inspect -f '{{.Created}}' samhan-slip-service
```
출력:
```text
2026-07-31T20:34:36.319358472Z
```

서비스 단독 재빌드 시도 1:
```text
docker compose -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps slip-service
```
출력 요약 원문:
```text
service "accounting-service" refers to undefined network samhan-net: invalid compose project
```

서비스 단독 재빌드 시도 2 (base + local-all overlay):
```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps slip-service
```
출력 원문(실패):
```text
#9 [4/4] COPY --chown=app:app services/slip-service/build/libs/slip-service.jar /app/app.jar
#9 ERROR: failed to calculate checksum: "/services/slip-service/build/libs/slip-service.jar": not found
failed to solve: failed to compute cache key: failed to calculate checksum: "/services/slip-service/build/libs/slip-service.jar": not found
```

JAR 생성:
```text
.\gradlew.bat :services:slip-service:bootJar -x test
```
출력:
```text
BUILD SUCCESSFUL in 5s
17 actionable tasks: 2 executed, 15 up-to-date
```

재빌드·재기동 원문:
```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps slip-service
...
Image infrastructure-slip-service Built
Container samhan-slip-service Recreated
Container samhan-slip-service Starting
Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:8086 ... bind: An attempt was made to access a socket in a way forbidden by its access permissions.
```

포트 오버라이드 적용 원문(다른 서비스 미조작):
```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml -f infrastructure/docker-compose.slip-port-override.yml up -d --no-deps slip-service
Container samhan-slip-service Recreated
Container samhan-slip-service Started
```
배포 컨테이너:
```text
Created=2026-08-01T02:45:46.817575842Z Status=running Ports={"8086/tcp":[{"HostIp":"127.0.0.1","HostPort":"18086"}]}
```

주의: Flyway는 서비스 기동 시 자동 실행되므로, 위 기동 직후 V61이 적용되었습니다. 적용 전 별도 19행 출력은 확보하지 못했습니다. 아래 감사 테이블의 `before_values`를 원래 값의 복구 가능한 백업으로 남깁니다.

Flyway 실행 원문:
```text
2026-08-01T11:45:52.491+09:00  INFO ... Successfully validated 61 migrations
2026-08-01T11:45:52.509+09:00  INFO ... Current version of schema "public": 60
2026-08-01T11:45:52.536+09:00  INFO ... Migrating schema "public" to version "61 - correct partner order vat overcharge"
2026-08-01T11:45:52.623+09:00  INFO ... Successfully applied 1 migration to schema "public", now at version v61
```

## 1단계 — 적용 전 백업값 (감사 테이블의 before_values)

백업 SQL:
```sql
SELECT a.slip_no,
       a.before_values->>'unit_price' AS unit_price,
       a.before_values->>'unit_price_with_vat' AS unit_price_with_vat,
       a.before_values->>'supply_amount' AS supply_amount,
       a.before_values->>'vat_amount' AS vat_amount,
       a.before_values->>'line_total' AS line_total
FROM slip_line_correction_audits a
WHERE a.correction_type='VAT_OVERCHARGE_CORRECTION'
ORDER BY a.slip_no, a.id;
```
출력 원문:
```text
    slip_no    | unit_price | unit_price_with_vat | supply_amount | vat_amount | line_total
---------------+------------+---------------------+---------------+------------+-------------
 2026/05/31-1  | 3000000.00 | 3300000.00          | 6000000.00    | 600000.00  | 6000000.00
 2026/05/31-10 | 840000.00  | 924000.00           | 1680000.00    | 168000.00  | 1680000.00
 2026/05/31-10 | 1080000.00 | 1188000.00          | 1080000.00    | 108000.00  | 1080000.00
 2026/05/31-2  | 750000.00  | 825000.00           | 750000.00     | 75000.00   | 750000.00
 2026/05/31-3  | 750000.00  | 825000.00           | 750000.00     | 75000.00   | 750000.00
 2026/05/31-4  | 900000.00  | 990000.00           | 1800000.00    | 180000.00  | 1800000.00
 2026/05/31-4  | 2100000.00 | 2310000.00           | 2100000.00    | 210000.00  | 2100000.00
 2026/05/31-5  | 2400000.00 | 2640000.00           | 4800000.00    | 480000.00  | 4800000.00
 2026/05/31-6  | 2100000.00 | 2310000.00           | 2100000.00    | 210000.00  | 2100000.00
 2026/05/31-6  | 1320000.00 | 1452000.00           | 5280000.00    | 528000.00  | 5280000.00
 2026/05/31-6  | 2400000.00 | 2640000.00           | 12000000.00   | 1200000.00 | 12000000.00
 2026/05/31-7  | 2400000.00 | 2640000.00           | 2400000.00    | 240000.00  | 2400000.00
 2026/05/31-8  | 750000.00  | 825000.00           | 750000.00     | 75000.00   | 750000.00
 2026/05/31-8  | 1320000.00 | 1452000.00           | 2640000.00    | 264000.00  | 2640000.00
 2026/05/31-8  | 1080000.00 | 1188000.00           | 1080000.00    | 108000.00  | 1080000.00
 2026/05/31-9  | 720000.00  | 792000.00           | 720000.00     | 72000.00   | 720000.00
 2026/05/31-9  | 1320000.00 | 1452000.00           | 2640000.00    | 264000.00  | 2640000.00
 2026/07/05-1  | 1560000.00 | 1716000.00           | 1560000.00    | 156000.00  | 1560000.00
 2026/07/05-2  | 1560000.00 | 1716000.00           | 1560000.00    | 156000.00  | 1560000.00
(19 rows)
```

## 2단계 — 적용 후 검증

검증 SQL:
```sql
WITH a AS (
  SELECT * FROM slip_line_correction_audits WHERE correction_type='VAT_OVERCHARGE_CORRECTION'
), checks AS (
  SELECT a.slip_no,
    (sl.unit_price = (a.after_values->>'unit_price')::numeric
     AND sl.unit_price_with_vat = (a.after_values->>'unit_price_with_vat')::numeric
     AND sl.supply_amount = (a.after_values->>'supply_amount')::numeric
     AND sl.vat_amount = (a.after_values->>'vat_amount')::numeric
     AND sl.line_total = (a.after_values->>'line_total')::numeric) AS after_match,
    (sl.line_total = sl.supply_amount) AS line_total_eq_supply,
    (sl.supply_amount + sl.vat_amount = (a.before_values->>'line_total')::numeric) AS total_preserved
  FROM a JOIN slip_lines sl ON sl.id=a.slip_line_id
)
SELECT 'audit_rows' AS check_name, count(*)::text AS result FROM a
UNION ALL SELECT 'v61_modified_rows', count(*)::text FROM slip_lines WHERE modified_by='v61-vat-correction'
UNION ALL SELECT 'after_values_match', count(*) FILTER (WHERE after_match)::text || '/' || count(*)::text FROM checks
UNION ALL SELECT 'line_total_eq_supply', count(*) FILTER (WHERE line_total_eq_supply)::text || '/' || count(*)::text FROM checks
UNION ALL SELECT 'supply_plus_vat_original_total', count(*) FILTER (WHERE total_preserved)::text || '/' || count(*)::text FROM checks;

SELECT a.slip_no, a.before_values, a.after_values,
       sl.unit_price, sl.unit_price_with_vat, sl.supply_amount, sl.vat_amount, sl.line_total
FROM slip_line_correction_audits a JOIN slip_lines sl ON sl.id=a.slip_line_id
WHERE a.correction_type='VAT_OVERCHARGE_CORRECTION'
ORDER BY a.slip_no, a.id;
```
출력 원문 요약(첫 번째 SELECT):
```text
           check_name           | result
--------------------------------+--------
 audit_rows                     | 19
 v61_modified_rows              | 19
 after_values_match             | 19/19
 line_total_eq_supply           | 19/19
 supply_plus_vat_original_total | 19/19
(5 rows)
```

감사 `before_values`/`after_values`와 현재 19행 전체 출력은 위 백업 출력에 이어진 원 명령 출력으로 확인했으며, 현재 값은 전부 `after_values`와 일치했습니다. 감사 테이블은 19행입니다.

감사 JSON 확인용 SQL:
```sql
SELECT a.slip_no || ' | ' || a.before_values::text || ' | ' || a.after_values::text
FROM slip_line_correction_audits a
WHERE a.correction_type='VAT_OVERCHARGE_CORRECTION'
ORDER BY a.slip_no, a.id;
```
출력 원문:
```text
2026/05/31-1 | {"line_total": 6000000.00, "unit_price": 3000000.00, "vat_amount": 600000.00, "supply_amount": 6000000.00, "unit_price_with_vat": 3300000.00} | {"line_total": 5454545.00, "unit_price": 2727272.50, "vat_amount": 545455.00, "supply_amount": 5454545.00, "unit_price_with_vat": 3000000.00}
2026/05/31-10 | {"line_total": 1680000.00, "unit_price": 840000.00, "vat_amount": 168000.00, "supply_amount": 1680000.00, "unit_price_with_vat": 924000.00} | {"line_total": 1527273.00, "unit_price": 763636.50, "vat_amount": 152727.00, "supply_amount": 1527273.00, "unit_price_with_vat": 840000.00}
2026/05/31-10 | {"line_total": 1080000.00, "unit_price": 1080000.00, "vat_amount": 108000.00, "supply_amount": 1080000.00, "unit_price_with_vat": 1188000.00} | {"line_total": 981818.00, "unit_price": 981818.00, "vat_amount": 98182.00, "supply_amount": 981818.00, "unit_price_with_vat": 1080000.00}
2026/05/31-2 | {"line_total": 750000.00, "unit_price": 750000.00, "vat_amount": 75000.00, "supply_amount": 750000.00, "unit_price_with_vat": 825000.00} | {"line_total": 681818.00, "unit_price": 681818.00, "vat_amount": 68182.00, "supply_amount": 681818.00, "unit_price_with_vat": 750000.00}
2026/05/31-3 | {"line_total": 750000.00, "unit_price": 750000.00, "vat_amount": 75000.00, "supply_amount": 750000.00, "unit_price_with_vat": 825000.00} | {"line_total": 681818.00, "unit_price": 681818.00, "vat_amount": 68182.00, "supply_amount": 681818.00, "unit_price_with_vat": 750000.00}
2026/05/31-4 | {"line_total": 1800000.00, "unit_price": 900000.00, "vat_amount": 180000.00, "supply_amount": 1800000.00, "unit_price_with_vat": 990000.00} | {"line_total": 1636364.00, "unit_price": 818182.00, "vat_amount": 163636.00, "supply_amount": 1636364.00, "unit_price_with_vat": 900000.00}
2026/05/31-4 | {"line_total": 2100000.00, "unit_price": 2100000.00, "vat_amount": 210000.00, "supply_amount": 2100000.00, "unit_price_with_vat": 2310000.00} | {"line_total": 1909091.00, "unit_price": 1909091.00, "vat_amount": 190909.00, "supply_amount": 1909091.00, "unit_price_with_vat": 2100000.00}
2026/05/31-5 | {"line_total": 4800000.00, "unit_price": 2400000.00, "vat_amount": 480000.00, "supply_amount": 4800000.00, "unit_price_with_vat": 2640000.00} | {"line_total": 4363636.00, "unit_price": 2181818.00, "vat_amount": 436364.00, "supply_amount": 4363636.00, "unit_price_with_vat": 2400000.00}
2026/05/31-6 | {"line_total": 2100000.00, "unit_price": 2100000.00, "vat_amount": 210000.00, "supply_amount": 2100000.00, "unit_price_with_vat": 2310000.00} | {"line_total": 1909091.00, "unit_price": 1909091.00, "vat_amount": 190909.00, "supply_amount": 1909091.00, "unit_price_with_vat": 2100000.00}
2026/05/31-6 | {"line_total": 5280000.00, "unit_price": 1320000.00, "vat_amount": 528000.00, "supply_amount": 5280000.00, "unit_price_with_vat": 1452000.00} | {"line_total": 4800000.00, "unit_price": 1200000.00, "vat_amount": 480000.00, "supply_amount": 4800000.00, "unit_price_with_vat": 1320000.00}
2026/05/31-6 | {"line_total": 12000000.00, "unit_price": 2400000.00, "vat_amount": 1200000.00, "supply_amount": 12000000.00, "unit_price_with_vat": 2640000.00} | {"line_total": 10909091.00, "unit_price": 2181818.00, "vat_amount": 1090909.00, "supply_amount": 10909091.00, "unit_price_with_vat": 2400000.00}
2026/05/31-7 | {"line_total": 2400000.00, "unit_price": 2400000.00, "vat_amount": 240000.00, "supply_amount": 2400000.00, "unit_price_with_vat": 2640000.00} | {"line_total": 2181818.00, "unit_price": 2181818.00, "vat_amount": 218182.00, "supply_amount": 2181818.00, "unit_price_with_vat": 2400000.00}
2026/05/31-8 | {"line_total": 750000.00, "unit_price": 750000.00, "vat_amount": 75000.00, "supply_amount": 750000.00, "unit_price_with_vat": 825000.00} | {"line_total": 681818.00, "unit_price": 681818.00, "vat_amount": 68182.00, "supply_amount": 681818.00, "unit_price_with_vat": 750000.00}
2026/05/31-8 | {"line_total": 2640000.00, "unit_price": 1320000.00, "vat_amount": 264000.00, "supply_amount": 2640000.00, "unit_price_with_vat": 1452000.00} | {"line_total": 2400000.00, "unit_price": 1200000.00, "vat_amount": 240000.00, "supply_amount": 2400000.00, "unit_price_with_vat": 1320000.00}
2026/05/31-8 | {"line_total": 1080000.00, "unit_price": 1080000.00, "vat_amount": 108000.00, "supply_amount": 1080000.00, "unit_price_with_vat": 1188000.00} | {"line_total": 981818.00, "unit_price": 981818.00, "vat_amount": 98182.00, "supply_amount": 981818.00, "unit_price_with_vat": 1080000.00}
2026/05/31-9 | {"line_total": 720000.00, "unit_price": 720000.00, "vat_amount": 72000.00, "supply_amount": 720000.00, "unit_price_with_vat": 792000.00} | {"line_total": 654545.00, "unit_price": 654545.00, "vat_amount": 65455.00, "supply_amount": 654545.00, "unit_price_with_vat": 720000.00}
2026/05/31-9 | {"line_total": 2640000.00, "unit_price": 1320000.00, "vat_amount": 264000.00, "supply_amount": 2640000.00, "unit_price_with_vat": 1452000.00} | {"line_total": 2400000.00, "unit_price": 1200000.00, "vat_amount": 240000.00, "supply_amount": 2400000.00, "unit_price_with_vat": 1320000.00}
2026/07/05-1 | {"line_total": 1560000.00, "unit_price": 1560000.00, "vat_amount": 156000.00, "supply_amount": 1560000.00, "unit_price_with_vat": 1716000.00} | {"line_total": 1418182.00, "unit_price": 1418182.00, "vat_amount": 141818.00, "supply_amount": 1418182.00, "unit_price_with_vat": 1560000.00}
2026/07/05-2 | {"line_total": 1560000.00, "unit_price": 1560000.00, "vat_amount": 156000.00, "supply_amount": 1560000.00, "unit_price_with_vat": 1716000.00} | {"line_total": 1418182.00, "unit_price": 1418182.00, "vat_amount": 141818.00, "supply_amount": 1418182.00, "unit_price_with_vat": 1560000.00}
(19 rows)
```

## 3단계 — 비대상 행 불변 확인

검증 SQL:
```sql
WITH untouched AS (
 SELECT s.slip_no, sl.*
 FROM slips s JOIN slip_lines sl ON sl.slip_id=s.id
 WHERE s.source_type='PARTNER_ORDER' AND NOT s.is_deleted AND NOT sl.is_deleted
   AND NOT EXISTS (SELECT 1 FROM slip_line_correction_audits a WHERE a.slip_line_id=sl.id)
), classified AS (
 SELECT CASE WHEN slip_no='2026/08/01-6' THEN 'legacy_supply_unit_price'
             WHEN slip_no='2026/08/01-5' THEN 'unverifiable_ambiguous'
             ELSE 'normal' END AS category, * FROM untouched
)
SELECT category, count(*) AS rows_unchanged,
       count(*) FILTER (WHERE line_total=supply_amount) AS line_total_supply,
       count(*) FILTER (WHERE modified_by IS NULL OR modified_by <> 'v61-vat-correction') AS not_modified_by_v61
FROM classified GROUP BY category ORDER BY category;
```
출력 원문:
```text
         category         | rows_unchanged | line_total_supply | not_modified_by_v61
--------------------------+----------------+-------------------+---------------------
 legacy_supply_unit_price |              1 |                 1 |                   1
 normal                   |              7 |                 7 |                   7
 unverifiable_ambiguous   |              3 |                 3 |                   3
(3 rows)
```

비대상 11행은 모두 감사 대상/`v61-vat-correction` 수정 대상이 아니며, 7 정상·3 확인불가·1 legacy 공급단가형이 그대로였습니다.

## 4단계 — 재실행 안전성

재기동 명령(두 번째 적용 경로 확인):
```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml -f infrastructure/docker-compose.slip-port-override.yml restart slip-service
Container samhan-slip-service Restarting
Container samhan-slip-service Started
```

재실행 확인 SQL:
```sql
SELECT 'audit_rows_after_second_run' AS check_name, count(*)::text AS result FROM slip_line_correction_audits WHERE correction_type='VAT_OVERCHARGE_CORRECTION'
UNION ALL SELECT 'v61_modified_rows_after_second_run', count(*)::text FROM slip_lines WHERE modified_by='v61-vat-correction';
```
출력 원문:
```text
             check_name             | result
------------------------------------+--------
 audit_rows_after_second_run        | 19
 v61_modified_rows_after_second_run | 19
(2 rows)
```
재기동 후 Flyway 원문:
```text
2026-08-01T11:50:03.134+09:00  INFO ... Current version of schema "public": 61
2026-08-01T11:50:03.140+09:00  INFO ... Schema "public" is up to date. No migration necessary.
```
추가 행 0, 추가 감사 0으로 재실행 안전성을 확인했습니다.

## 5단계 — 화면 확인

시도한 렌더러:
```text
VITE_APP_VERSION="2026/08/01-1"
cd clients/desktop
node_modules/.bin/vite src/renderer --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5940 --strictPort
```
결과:
```text
Renderer PID=90768
RENDERER_ERROR=원격 서버에 연결할 수 없습니다.
.\node_modules\.bin\vite.cmd : The term '.\node_modules\.bin\vite.cmd' is not recognized ...
```
브라우저 연결도 실패했습니다(`Browser is not available: iab`). 따라서 실 사용자 전표 상세 화면 캡처는 수행하지 못했습니다. 합성·목업 캡처는 생성하지 않았으며, PM이 실제 화면 캡처를 진행해야 합니다.

## PM 화면 캡처 (2026-08-01)

Codex 샌드박스에 브라우저가 없어 PM 이 직접 수행했습니다. 실 게이트웨이 `:8080` · mock OFF · `dev_manager`.

정정된 전표 **`2026/05/31-1`** 상세 (`01-corrected-slip-detail.png`):

| 모델명 | 수량 | 단가(VAT포함) | 공급가액 | 부가세 | 합계(VAT포함) |
|---|---:|---:|---:|---:|---:|
| AM100BNNDEH-57 (삼성 DVM-S 10HP) | 2 | **3,000,000** | **5,454,545** | **545,455** | **6,000,000** |

DB 저장값과 일치합니다.

```text
unit_price 2,727,272.50 · unit_price_with_vat 3,000,000
supply 5,454,545 + vat 545,455 = 6,000,000   ← 원래 사용자 총액
line_total 5,454,545 = supply_amount          ← 현행 계약
```

**두 계약이 화면에서 동시에 확인됩니다.**
