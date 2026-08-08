# PR #1119 / Issue #1113 — S22 최종 재수렴

## 판정

**BLOCK — 도달 결함 5건이다.**

- S21 신규 표면에서 BLOCKER 2건을 확인했다.
- S13~S18 수정분의 신규 회귀는 0건이지만, S16이 발견하고 S18이 재판정하지 않았던 `종료코드=사람 판정` 불일치 3경로가 현재 HEAD에도 남아 있다.
- S19의 seed 자격 및 k6 수정에서 도달 결함은 0건이다.
- `/api/v1/inventory/balances` 404와 끊긴 product 참조 100건 자체는 개발책임자 지시대로 결함에 포함하지 않았다.

검증 HEAD는 `64be0b14466cc9eae01d90339be780d5b97c9413`이다. 재시드, DB 직접 쓰기, Docker stack 재기동·재생성·중지는 하지 않았다.

## 결함 1 — BLOCKER: 표준 로컬 seed 진입점에 공통 toggle이 배선되지 않았다

S21은 두 서비스가 오직 새 공통 property를 읽도록 바꿨다.

- `services/product-service/src/main/resources/application.yml:56-58`: `app.seed-test-data=${SAMHAN_SEED_TEST_DATA:false}`
- `services/inventory-service/src/main/resources/application.yml:46-51`: `app.seed-test-data=${SAMHAN_SEED_TEST_DATA:false}`
- product/inventory의 5개 mutation seeder는 모두 `app.seed-test-data=true` 조건을 사용한다.

그러나 표준 진입점 두 종류에는 새 환경변수가 없다.

1. `infrastructure/scripts/start-local-full.ps1:273-299`는 `infrastructure/env-templates/.env.dev-seed`를 그대로 로드한다. 이 파일에는 `SAMHAN_SEED_TEST_DATA`가 없고, 제거된 구 toggle만 남아 있다.
   - `:60` `SAMHAN_PRODUCT_SEED_TEST_DATA=false`
   - `:63` `SAMHAN_INVENTORY_SEED_TEST_DATA=true`
   - `:97-98` legacy product/inventory 변수
2. `infrastructure/docker-compose.local-all.yml:181-221`의 product/inventory environment도 `SAMHAN_SEED_TEST_DATA`를 전달하지 않는다.

읽기 전용 probe 결과:

```text
TEMPLATE_COMMON_PRESENT=False
TEMPLATE_OLD_PRODUCT=false
TEMPLATE_OLD_INVENTORY=true
COMPOSE_CONFIG_EXIT=0
COMPOSE_product-service_COMMON_PRESENT=False
COMPOSE_inventory-service_COMMON_PRESENT=False
```

따라서 권장 `start-local-full` Gradle 경로와 Docker compose 경로 모두 새 property의 기본값 `false`가 되어 product·inventory 시드가 실행되지 않는다. 공통 toggle의 Java annotation은 통일됐지만 정상 운영 진입점의 시드 도달성은 끊겼다.

## 결함 2 — BLOCKER: fail-fast가 현재 데이터에서 실행 불가능한 선행 조치를 안내한다

`ProductSeedIntegrityValidator.java:51-54`는 누락 개수와 modelName을 출력하지만, 조치로 다음만 안내한다.

```text
product-service를 먼저 공통 seed toggle로 기동하고 product seed 완료 후 재고 seed를 재시도
```

이 조치는 S20에서 확정된 현재 상태를 복구하지 못한다.

- 기대 deterministic product PK 100개는 모두 `is_deleted=true` 행으로 남아 있다.
- `HvacProductSeeder.java:143-155`는 활성 modelName이 없으면 같은 deterministic PK로 native INSERT를 시도한다.
- 기존 soft-deleted PK와 충돌하면 `HvacProductSeeder.java:157-159`가 행별 예외를 로그로 남기고 계속한다. 활성화나 별도 UUID 생성은 하지 않는다.
- 따라서 안내대로 product-service를 다시 기동해도 활성 product 100개는 계속 누락되고 inventory validator가 같은 메시지로 다시 중단한다.

메시지는 누락 개수·modelName은 제공하지만, 현재 상태에 필요한 soft-delete 처리 정책 또는 별도 운영 결정을 알려주지 않는다. 구현자가 S21 보고서에서 이미 “별도 운영 결정”이 필요하다고 기록했는데 런타임 메시지에는 반영되지 않았다.

## 결함 3 — BLOCKER: `launch-local-stack.ps1`이 bootJar 실패를 성공한 compose로 덮을 수 있다

`scripts/launch-local-stack.ps1:118-135`는 Gradle `bootJar`를 실행한 뒤 `$LASTEXITCODE`를 저장하거나 검사하지 않고 `:138-140`의 compose 단계로 진행한다. compose 종료코드만 `:141-143`에서 검사한다.

따라서 build가 실패해도 후속 compose가 0이면 부모 종료코드와 화면 판정이 성공으로 수렴할 수 있다. S16의 격리 probe에서 확인된 `bootJar exit 23 → 후속 성공` 구조가 현재 HEAD에 그대로이며, S18 이후 이 파일 변경은 0건이다.

## 결함 4 — BLOCKER: `stop-local-stack.ps1`이 compose down 실패 후 `stopped`를 출력한다

`scripts/stop-local-stack.ps1:46-52`는 compose down 결과를 검사하지 않고 `:57`에서 `[stop] local stack stopped`를 출력한다.

실제 Docker를 호출하지 않는 PowerShell 5.1 in-memory native failure probe에서 down exit 19 뒤에도 `stopped`가 출력됐다. 공유 stack에는 손대지 않았다. 실패 종료코드와 사람 판정이 불일치한다.

## 결함 5 — BLOCKER: `stop-local-full.ps1`이 compose down 실패 후 `종료 완료`를 출력한다

`infrastructure/scripts/stop-local-full.ps1:123-139`도 compose down 종료코드를 검사하지 않고 `종료 완료`를 출력한다. S16의 격리 probe에서 down exit 21 뒤 완료/부모 성공 가능성이 확인됐고, S18 이후 이 파일 변경은 0건이다.

## S19 두 수정 재판정

### seed 자격

도달 결함은 0건이다.

- `scripts/seed-local-stack.ps1:27`이 최초 HTTP 전에 `Resolve-QaCredential`을 실행한다.
- 표준 process 환경변수, `infrastructure/.env.local`, 호환 alias 순으로 nonblank 값을 찾는다.
- 전부 없으면 `scripts/lib/qa-credentials.ps1:30`이 누락 키와 확인한 `.env.local` 경로를 포함해 throw한다. 빈 password 로그인 POST에는 도달하지 않는다.
- 현재 정상 자격 환경과 합성 정상 입력 모두 비밀값 출력 없이 nonempty 해석, exit 0이었다. 따라서 자격이 있을 때의 오차단은 0건이다.
- `node --test scripts/lib/qa-credentials.test.cjs`: 6/6, exit 0.

### k6

도달 결함은 0건이다.

- `perf/k6/mixed-load.js:450-465`에서 직원 write는 sales/manager의 estimate와 slip draft 50:50으로 유지된다.
- partner mutation만 제거됐고 partner 검색·주문 목록·상세 read는 남아 있다.
- `WRITE_MODE=partner-order`는 조용히 다른 mutation으로 대체하지 않고 즉시 실패한다.
- 401 재귀 재로그인/재호출은 0건이다. 각 401은 한 번 `recordStatus`를 거쳐 custom 4xx, k6 `http_req_failed`, 2xx check 실패에 남으므로 실패를 놓치지 않는다.
- 임계값은 S19 직전과 byte-equivalent다: `http_req_failed rate<0.01`, `p95<500`, `p99<1500`.
- `node --check perf/k6/mixed-load.js`: exit 0.

## S21 나머지 표면

### validator 정상 경로

validator 알고리즘 자체의 오차단은 확인되지 않았다. modelName 100개를 deterministic UUID로 변환하고, product-service가 그 100개 ID를 모두 반환하면 missing 목록이 비어 정상 반환한다. client와 server의 batch 상한은 모두 100이며 100개 요청은 허용된다.

다만 신규 validator 테스트는 누락 경로 1건만 검증하며 정상 100개 경로의 직접 테스트는 없다. 정상 운영 진입점은 결함 1 때문에 현재 공통 toggle에 도달하지 않는다.

### toggle 우회 전수

- product/inventory main source의 실제 mutation seeder 5개는 모두 `app.seed-test-data`를 사용한다.
- 구 `app.product.seed-test-data`, `app.inventory.seed-test-data` annotation은 main source에 0건이다.
- 별도 product `seed` profile runner는 report/dry-run이며 해당 100/200행 mutation 우회가 아니다.
- 단, 마이크로서비스를 외부에서 하나만 개별 기동하는 행위까지 같은 환경변수 이름만으로 원자적으로 막지는 않는다. inventory 단독 기동은 validator가 write 전에 중단하지만 product 단독 기동은 가능하다.

### 업무용 lookup 계약

기존 업무용 partial lookup 계약은 유지된다.

- `ProductClient.lookup()`은 `lookupInternal(..., true)`를 호출한다.
- seed 전용 `lookupForSeedIntegrity()`만 `false`를 사용한다.
- 기존 업무용 부분 응답은 계속 `NOT_FOUND`를 발생시킨다.
- fresh 강제 재실행 결과 `ProductClientTest` 7/7, 실패 0이다.

### 기존 재고 200행 수량 보존

구현자 주장은 코드상 참이다.

- `StockBalanceSeeder.java:141-144`에서 validator가 insert loop보다 먼저 실행된다. 현재 누락 상태에서는 여기서 중단하므로 기존 행에 닿지 않는다.
- 정상 product 100개가 있는 재실행에서도 `:167-175`가 deterministic balance ID 존재 여부를 검사하고 기존 행이면 즉시 skip한다.
- 이 seeder에는 기존 `stock_balances` UPDATE/DELETE가 없고 신규 INSERT만 있다. `available_qty`, `reserved_qty`, `total_qty`, `version`을 다시 쓰지 않는다.
- 같은 toggle의 `StockInstanceSeeder`와 `InventoryAuditSeeder`도 `stock_balances`를 UPDATE/DELETE하지 않는다.

재시드나 DB 쓰기는 실행하지 않았다.

## S13~S18 회귀

| 축 | 결과 |
|---|---|
| resolver 우선순위 | stale 설정 `18081`보다 Docker 관측 `8081` 선택, exit 0 |
| Dockerless 합성 | 존재하지 않는 `DOCKER_HOST`에서 3-file compose와 resolver **16/16 일치**, mismatch 0, exit 0 |
| BOM / PS 5.1 | tracked PS1 65개, non-ASCII BOM 누락 0, parse 실패 0, exit 0 |
| guard 기준점 | 자기 checkout 및 decoy `-Root` 모두 자기 checkout 기준 검사, exit 0 |
| S7 회귀 본체 | `S7 axis regression tests passed`, exit 0 |
| 기존 stack 확인 | `start-local-full -SkipDocker -SkipServices -SkipPortCheck` 15/15 UP, exit 0 |
| 종료코드=판정 | S13 지정 경로는 유지됐으나, 전수 기준 결함 3~5가 잔존하므로 FAIL |

## 실행 증거

| 명령/검사 | 결과 |
|---|---|
| `node --test scripts/lib/qa-credentials.test.cjs` | 6/6, exit 0 |
| `node --check perf/k6/mixed-load.js` | exit 0 |
| inventory `ProductClientTest` + `ProductSeedIntegrityValidatorTest`, product `HvacProductSeederTest`, `--rerun-tasks` | 15/15, failures 0, errors 0, fresh task exit 0 |
| `tools/operational-validation/test-s7-axis-redefined.ps1` | exit 0 |
| Dockerless resolver vs compose config | 16/16, mismatch 0, exit 0 |
| PS1 BOM/parse audit | 65개, 누락/parse 실패 0, exit 0 |
| `git diff --check` | exit 0 |

## 환경·프로세스 회수

- 공유 Docker stack은 up/down/recreate/restart하지 않았다.
- 종료 확인 시 running container 24개를 유지했다. 선재 `samhan-nginx` unhealthy는 손대지 않았다.
- k6 process/container 잔여 0, PowerShell background job 0.
- `gradlew.bat --stop`으로 Gradle daemon을 회수했다.
- DB 직접 쓰기와 재시드는 0건이다. 기존-stack 확인 스크립트의 row-count SELECT만 실행됐다.
- 커밋·push·코드 수정은 하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1113-s22-final-reconvergence.md`

## 이 라운드가 보지 않은 것

- 재시드 및 실제 product/inventory seed 성공 실행. 사용자 금지에 따라 코드·단위 테스트로만 판정했다.
- 실제 compose up/down, Docker stack 재기동, 실제 bootJar 실패를 포함한 파괴적/공유환경 변경 경로.
- k6 smoke/baseline/peak/stress/soak 실제 부하 실행. write 시나리오가 업무 데이터를 변경하므로 실행하지 않았다.
- `/api/v1/inventory/balances` 404 및 끊긴 참조 100건의 수정·재매핑·soft-delete 정책 결정.
- PR의 43개 CI check 재실행. 현재 HEAD의 제공된 43/43 green 사실과 별개로 이번 라운드는 요구된 도달 경로와 관련 단위 테스트만 실행했다.
- AWS 배포, Terraform, 외부 vendor, 모바일/데스크톱 GUI 전체 회귀.
