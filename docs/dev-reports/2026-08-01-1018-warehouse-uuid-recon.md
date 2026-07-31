# Warehouse UUID 설정 실사용 조사

## 1. 실행 중 컨테이너 확인

명령: `docker ps --format '{{.Names}}`t{{.Image}}`t{{.Status}}'`

출력 원문:

```text
samhan-slip-service    infrastructure-slip-service    Up About an hour (healthy)
samhan-partner-order-service    infrastructure-partner-order-service    Up 6 hours (healthy)
samhan-groupware-service    infrastructure-groupware-service    Up 6 hours (healthy)
samhan-api-gateway    infrastructure-api-gateway    Up 7 hours (healthy)
samhan-accounting-service    infrastructure-accounting-service    Up 7 hours (healthy)
samhan-product-service    infrastructure-product-service    Up 8 hours (healthy)
samhan-auth-service    infrastructure-auth-service    Up 9 hours (healthy)
samhan-dc-config-service    infrastructure-dc-config-service    Up 24 hours (healthy)
samhan-partner-auth-service    infrastructure-partner-auth-service    Up 24 hours (healthy)
samhan-eureka    infrastructure-eureka-server    Up 24 hours (healthy)
samhan-postgres    postgres:16-alpine    Up 24 hours (healthy)
samhan-inventory-service    infrastructure-inventory-service    Up 24 hours (healthy)
```

게이트웨이 컨테이너 `samhan-api-gateway`와 PostgreSQL 컨테이너 `samhan-postgres`가 실행 중임을 확인했다. (나머지 출력은 위 명령의 전체 출력에서 생략하지 않고 확인했으며, 이 보고서에는 조사 대상 행을 우선 기록한다.)

## 2. 설정 위치 및 대상 서비스 확인

명령: `rg -n -i 'warehouse|WAREHOUSE' services/api-gateway`

출력 원문:

```text
services/api-gateway\src\main\resources\application.yml:625:            - Path=/inventory/**,/warehouse/**
```

판정: 사용자 배경에 적힌 `services/api-gateway/src/main/resources/application.yml:187-191`의 `warehouse-code-map`은 이 워크트리의 api-gateway 파일에는 존재하지 않는다. 실제 `warehouse-code-map`과 `WAREHOUSE_UUID_*` 정의는 `services/slip-service/src/main/resources/application.yml:184-191`에 있다. 따라서 해당 매핑을 읽는 실행 대상은 게이트웨이가 아니라 slip-service이며, 게이트웨이 컨테이너의 환경 변수와 slip-service 컨테이너의 환경 변수는 구분해 확인해야 한다.

## 3. 실행 컨테이너 환경변수

명령 원문:

```text
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' samhan-api-gateway | Select-String -Pattern 'WAREHOUSE'
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' samhan-slip-service | Select-String -Pattern 'WAREHOUSE'
docker exec samhan-api-gateway /bin/sh -c "printenv | grep -E 'WAREHOUSE' || true"
docker exec samhan-slip-service /bin/sh -c "printenv | grep -E 'WAREHOUSE' || true"
```

출력 원문: 네 명령 모두 `WAREHOUSE` 일치 행이 없었다(각각 `Exit code: 0`, 출력 본문 없음). 추가로 두 컨테이너의 `SPRING_PROFILES_ACTIVE`는 `dev`였다.

`services/slip-service/src/main/resources/application.yml:188-191`의 실제 정의는 다음과 같다.

```text
"[00003]": ${WAREHOUSE_UUID_HQ:11111111-1111-1111-1111-111111111111}
"[2]":     ${WAREHOUSE_UUID_HUBAL:22222222-2222-2222-2222-222222222222}
"[14]":    ${WAREHOUSE_UUID_ANSEONG:33333333-3333-3333-3333-333333333333}
"[1]":     ${WAREHOUSE_UUID_CHANGWON:44444444-4444-4444-4444-444444444444}
```

판정: 실행 중인 api-gateway와 slip-service 모두 `WAREHOUSE_UUID_*` 환경변수가 주입되지 않았다. 매핑을 실제로 읽는 slip-service의 유효값은 네 개 모두 placeholder UUID다. api-gateway에는 이 매핑 자체가 없다.

## 4. 값 정의 위치 전수 검색

검색 명령:

```text
rg -n --hidden -g '.env*' -g 'docker-compose*.yml' -g '*.yaml' -g '*.yml' -g '*.ps1' -g '*.sh' -g '*.properties' -g '*.xml' -g '*.java' 'WAREHOUSE_UUID_(HQ|HUBAL|ANSEONG|CHANGWON)|warehouse-code-map' .
Get-ChildItem 'infrastructure' -File -Recurse -Include '.env*','docker-compose*.yml' | ForEach-Object { Select-String -Path $_.FullName -Pattern 'WAREHOUSE_UUID|warehouse-code-map' -CaseSensitive:$false }
```

출력 원문 요약(검색 결과의 실제 일치 파일/행):

```text
services/slip-service/src/main/resources/application.yml:187-191  warehouse-code-map 및 네 개의 ${WAREHOUSE_UUID_*:placeholder}
services/slip-service/src/test/java/.../SlipPublishControllerIT.java:72-75  네 개 placeholder를 TestPropertySource로 직접 주입
services/slip-service/src/test/java/.../SlipPublishWarehouseIdIT.java:50  11111111-... 직접 주입
services/slip-service/src/test/java/.../SlipPublishPartnerStrictOffIT.java:50  11111111-... 직접 주입
services/slip-service/src/test/java/.../SlipPublishPartnerStrictIT.java:53  11111111-... 직접 주입
services/slip-service/src/test/java/.../SlipPublishMergeIT.java:73-74  MERGE-WH 가상 UUID 및 11111111-... 직접 주입
services/slip-service/src/test/java/.../Phase26cSlipImmutableIT.java:61-63  11111111-..., 22222222-... 직접 주입
services/slip-service/src/test/java/.../InternalSlipPublishControllerIT.java:57-58  11111111-..., 22222222-... 직접 주입
services/slip-service/src/main/java/.../WarehouseCodeMapper.java:25,38-42,58-63,81  문서/로그/매핑 코드
```

`infrastructure` 아래 `.env*` 및 `docker-compose*.yml` 검색은 출력이 없었다. `.github/workflows` 검색도 `WAREHOUSE_UUID` 또는 `warehouse-code-map` 일치가 없었다. 배포 스크립트(`*.ps1`, `*.sh`)까지 같은 패턴으로 검색했으나 일치가 없었다. 따라서 확인된 실행/배포 설정의 값은 없고, 값은 application.yml의 기본 placeholder 또는 테스트별 직접 주입이다. `.env` 실파일은 `rg --files -g '.env*'` 결과에 없었으므로 확인불가(존재하지 않거나 무시 파일)이다.

## 5. inventory_db 실재 여부 및 실제 창고 목록

데이터베이스 확인 명령:

```text
docker exec samhan-postgres psql -U samhan -d postgres -Atc "select datname from pg_database where datistemplate = false order by datname;"
```

출력 원문에 `inventory_db`가 포함됐다.

테이블/컬럼 확인 명령:

```text
docker exec samhan-postgres psql -U samhan -d inventory_db -Atc "select table_schema || '.' || table_name from information_schema.tables where table_name ilike '%warehouse%' order by 1;"
docker exec samhan-postgres psql -U samhan -d inventory_db -Atc "select ordinal_position || '|' || column_name || '|' || data_type from information_schema.columns where table_schema='public' and table_name='warehouses' order by ordinal_position;"
```

출력 원문:

```text
public.warehouses
staging.ecount_warehouse_map
staging.ecount_warehouse_raw
1|id|uuid
2|code|character varying
3|name|character varying
...
14|is_deleted|boolean
```

실제 창고 목록 조회 명령:

```text
docker exec samhan-postgres psql -U samhan -d inventory_db -P pager=off -F '|' -Atc "select code, name, id::text, is_deleted from public.warehouses order by display_order, code;"
```

출력 원문:

```text
HQ-001|본사창고|11111111-1111-1111-1111-000000000001|f
VH-001|1호차 차량재고|11111111-1111-1111-1111-000000000002|f
CS-001|거래처 위탁창고|11111111-1111-1111-1111-000000000003|f
VR-001|가상창고|11111111-1111-1111-1111-000000000004|f
```

매핑 UUID 존재 여부 조회 명령:

```text
docker exec samhan-postgres psql -U samhan -d inventory_db -P pager=off -F '|' -Atc "select x.code, x.uuid, case when w.id is null then '부재' when w.is_deleted then '실재(삭제됨)' else '실재' end, coalesce(w.code,'-'), coalesce(w.name,'-') from (values ('00003','11111111-1111-1111-1111-111111111111'::uuid),('2','22222222-2222-2222-2222-222222222222'::uuid),('14','33333333-3333-3333-3333-333333333333'::uuid),('1','44444444-4444-4444-4444-444444444444'::uuid)) x(code,uuid) left join public.warehouses w on w.id=x.uuid order by x.code;"
```

출력 원문:

```text
00003|11111111-1111-1111-1111-111111111111|부재|-|-
1|44444444-4444-4444-4444-444444444444|부재|-|-
14|33333333-3333-3333-3333-333333333333|부재|-|-
2|22222222-2222-2222-2222-222222222222|부재|-|-
```

판정 표:

| legacy 코드 | 매핑 UUID | 결과 | 현재 목록 기준 올바른 후보 |
|---|---|---|---|
| 00003 | 11111111-1111-1111-1111-111111111111 | 부재 | HQ-001 / 본사창고 / 11111111-1111-1111-1111-000000000001 |
| 2 | 22222222-2222-2222-2222-222222222222 | 부재 | 확인불가(목록에 코드 2 없음) |
| 14 | 33333333-3333-3333-3333-333333333333 | 부재 | 확인불가(목록에 코드 14 없음) |
| 1 | 44444444-4444-4444-4444-444444444444 | 부재 | 확인불가(목록에 코드 1 없음) |

네 UUID 모두 `warehouses.id`에 부재한다. 코드 `00003`은 현재 `HQ-001`로 보이지만, 나머지 legacy 코드와 현재 창고 코드의 대응은 이 조회만으로 확인불가다.

## 6. 실제 매핑 소비 코드와 실행 확인

코드 검색 명령:

```text
rg -n 'warehouseCodeMapper\.resolve|resolveWarehouseId|sourceWarehouseId|warehouseId' services/slip-service/src/main/java/com/samhanair/logis/slip/publish services/slip-service/src/main/java/com/samhanair/logis/slip/web
```

확인된 핵심 행:

```text
SlipPublishService.java:135  UUID warehouseId = warehouseCodeMapper.resolve(req.warehouseCode());
SlipPublishService.java:215  UUID warehouseId = resolveWarehouseId(req.warehouseId(), req.warehouseCode());
SlipPublishService.java:316  UUID warehouseId = resolveWarehouseId(req.warehouseId(), req.warehouseCode());
SlipPublishService.java:446  private UUID resolveWarehouseId(String warehouseId, String warehouseCode)
SlipPublishService.java:447  if (warehouseId != null && !warehouseId.isBlank()) {
SlipPublishService.java:449  return UUID.fromString(warehouseId.trim());
SlipPublishService.java:455  return warehouseCodeMapper.resolve(warehouseCode);
```

`SlipPublishService.java:135`의 estimate 발행 경로는 항상 `WarehouseCodeMapper.resolve(warehouseCode)`를 사용한다. `:215`, `:316`의 partner-order/merge 경로는 `warehouseId`가 있으면 그 UUID를 그대로 사용하고, 없을 때만 `:455`에서 매퍼로 폴백한다. 따라서 partner-order가 inventory의 실제 UUID를 전달하면 placeholder를 우회한다.

실행 확인 1 — 기동 로그:

```text
docker logs --since 8h samhan-slip-service 2>&1 | Select-String -Pattern 'warehouse-code-map|Phase 6 M5|Started'
```

출력 원문:

```text
2026-08-01T05:34:44.991+09:00 ... WarehouseCodeMapper : [Phase 6 M5] warehouse-code-map 로드: 4 entries
2026-08-01T05:34:46.844+09:00 ... SlipServiceApplication : Started SlipServiceApplication in 8.408 seconds (process running for 8.932)
```

맵이 비어 있지 않아 `@PostConstruct`의 경고/실패가 발생하지 않고 정상 기동했다. 값의 실재성은 검증하지 않는다.

실행 확인 2 — 현재 slip 데이터:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -F '|' -Atc "select count(*) filter (where source_warehouse_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444')) as placeholder_rows, count(*) filter (where source_warehouse_id='11111111-1111-1111-1111-000000000001') as actual_hq_rows, count(*) as total_rows from public.slips;"
```

출력 원문:

```text
5|972|2455
```

placeholder UUID로 저장된 전표 5건이 실제로 존재한다. 상세 조회 원문:

```text
2026/07/31-1|ESTIMATE|QA-991-THROWAWAY-20260731|11111111-1111-1111-1111-111111111111|2026-07-31 23:50:58.387557
2026/06/23-1|PARTNER_ORDER|liveqa-585-rt3|11111111-1111-1111-1111-111111111111|2026-06-23 23:51:13.45032
2026/05/30-3|PARTNER_ORDER|1341ce0a-c15d-441f-9112-02596aba92cb|11111111-1111-1111-1111-111111111111|2026-05-30 13:39:39.203047
2026/05/30-2|PARTNER_ORDER|1341ce0a-c15d-441f-9112-02596aba92cb|11111111-1111-1111-1111-111111111111|2026-05-30 13:38:25.726897
2026/05/30-1|PARTNER_ORDER|1341ce0a-c15d-441f-9112-02596aba92cb|11111111-1111-1111-1111-111111111111|2026-05-30 13:37:02.464956
```

동시에 2026-08-01 실행 데이터의 partner-order 전표는 실제 HQ UUID를 사용했다.

```text
2026/08/01-8|PARTNER_ORDER|ce1cb9eb-7047-4a5d-a8a4-d3068e025919|...|11111111-1111-1111-1111-000000000001||2026-08-01 06:01:15.219828
2026/08/01-7|PARTNER_ORDER|6c1a168e-3687-4cfe-a64b-74ddfc5b9409|...|11111111-1111-1111-1111-000000000001||2026-08-01 05:21:08.218865
```

결론: placeholder 상태에서 estimate 경로 및 `warehouseId` 없는 partner-order/merge 폴백은 실재하지 않는 UUID를 전표에 저장할 수 있다. 반면 현재 실행된 partner-order 요청 중 `warehouseId`가 전달된 경로는 inventory가 해석한 실제 HQ UUID로 저장되어 매핑을 우회했다. 확인된 데이터에는 placeholder 전표가 실제로 있으므로 “전부 우회”가 아니다. 해당 placeholder 전표가 운영 전표인지 테스트/QA 전표인지는 `source_id`와 명칭만으로는 확인불가다.

## 7. 기동 실패 조건을 넣을 때 영향 범위

테스트 설정 파일 검색 명령:

```text
rg -l 'app\.publish\.warehouse-code-map|WAREHOUSE_UUID_' services/slip-service/src/test infrastructure .github
```

출력 원문:

```text
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishWarehouseIdIT.java
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishPartnerStrictOffIT.java
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishPartnerStrictIT.java
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/Phase26cSlipImmutableIT.java
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/InternalSlipPublishControllerIT.java
services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java
```

영향 목록:

1. **현재 실행 중인 slip-service** — 현재는 `4 entries`로 정상 기동 중이다. 실제 DB 존재성 검증을 추가하고 재기동하면 네 기본값이 모두 부재이므로 기동 실패 대상이다. 이번 조사에서는 재기동하지 않았고, 실패 여부를 실행으로 검증하지 않았다.
2. **로컬 slip-service 실행** — `services/slip-service/src/main/resources/application.yml:188-191`의 기본값을 사용하고 `WAREHOUSE_UUID_*`를 주입하지 않으면 기동 실패 대상이다. 별도 `.env`/compose 주입 정의는 검색되지 않았다.
3. **CI의 slip-service Spring 컨텍스트 테스트** — 위 7개 통합 테스트가 `@TestPropertySource`로 placeholder UUID를 직접 주입한다. DB 존재성 검증을 기동 시 수행하면 이 컨텍스트들은 placeholder가 `warehouses`에 없으므로 실패 대상이다. CI 실제 실행은 사용자 지시(빌드·테스트 금지) 때문에 확인하지 않았다.
4. **테스트 기본 설정을 사용하는 기타 slip-service 테스트** — application.yml 기본값을 읽는 Spring 컨텍스트가 있다면 동일하게 실패 대상이다. 정확한 테스트 수/실패 수는 테스트를 실행하지 않아 확인불가다.
5. **api-gateway** — 이 워크트리의 api-gateway에는 해당 매핑이 없고, 검색된 유일한 warehouse 관련 행은 `application.yml:625`의 라우팅 경로다. 따라서 이 매핑의 기동 검증 변경으로 api-gateway가 직접 깨지는 근거는 없다.

검증하지 않은 항목: CI에서 어느 job이 slip-service 테스트를 실제로 실행하는지, 로컬에서 어떤 profile/compose 조합이 실제 사용되는지, strict validation을 넣었을 때의 실제 실패 stack trace는 빌드·테스트·재기동 금지로 확인불가다.
