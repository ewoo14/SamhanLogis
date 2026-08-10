# PR #1119 / Issue #1113 — S26 최종 재수렴

## 판정

**BLOCK — S25가 연 신규 도달 결함 1건이 있다.**

S25는 표준 `.env.dev-seed`를 `false`로 바꿔 현재 DB에서도 inventory-service가 기동되게 했고, `-RunSeed`에서 product/inventory seed와 validator도 실제 도달 가능하게 유지했다. 그러나 `-RunSeed`가 process 환경에 쓴 `SAMHAN_SEED_TEST_DATA=true`를 복원하지 않아 명시적 seed 실행이 끝난 뒤 같은 PowerShell 세션의 후속 표준 compose까지 seed 모드가 된다. 따라서 정합성 검증이 아직 “시드 실행 시점에만” 한정되지 않는다.

`/balances` 404와 끊긴 참조 100건 자체는 요청대로 판정에서 제외했다.

## 신규 결함 1 — BLOCK: `-RunSeed`가 후속 표준 기동까지 seed 모드로 오염시킨다

### 재현

Windows PowerShell 5.1의 동일 process 안에서 공유 서비스를 실행하지 않고 다음 순서만 수행했다.

1. `SAMHAN_SEED_TEST_DATA`를 제거했다.
2. `start-local-full.ps1 -RunSeed -SkipDocker -SkipServices -SkipPortCheck`를 실행했다. 이 경로는 service/seed를 실행하지 않고 DB SELECT 및 health 조회만 한다.
3. script 반환 직후 process 환경과 `docker compose ... config --format json`을 읽었다.

결과:

```text
AFTER_RUNSEED=true
COMPOSE_PRODUCT=true
COMPOSE_INVENTORY=true
COMPOSE_EXIT=0
STICKY_PROBE_EXIT=0
```

공유 stack의 up/down/restart/recreate 및 seed 실행은 없었다.

### 코드 도달 경로

- `infrastructure/scripts/start-local-full.ps1:291-305`가 template 값을 process 환경에 적재한다.
- `:308-311`이 `-RunSeed`이면 process 전역 `SAMHAN_SEED_TEST_DATA`를 `true`로 덮는다.
- `:390-417`의 product/inventory `Start-Job`은 이 값을 상속하므로 명시적 seed 자체는 도달한다.
- 하지만 script 어디에도 이 override를 template의 `false` 또는 선행 값으로 복원하는 경로가 없다.
- `scripts/launch-local-stack.ps1:142-144`의 후속 compose는 같은 process 환경을 그대로 소비한다.
- `infrastructure/docker-compose.local-all.yml:195,223`은 그 잔류 값을 product/inventory 양쪽에 전달한다.

즉 최초 `-RunSeed`는 의도한 opt-in이지만, script 반환 뒤의 별도 compose는 더 이상 seed 실행 시점이 아닌데도 validator가 활성화된다. 현재 product cohort가 `active=0 / soft_deleted=100`이므로 그 후속 inventory-service는 S24와 같은 validator fail-fast에 다시 도달할 수 있다.

### 재수렴 기준

`-RunSeed`의 `true`는 product/inventory seed process에만 전달되고, script 반환·실패 뒤 부모 PowerShell 환경과 후속 표준 compose에는 남지 않아야 한다. 동시에 product와 inventory job은 모두 `true`를 상속해야 하며 validator fail-fast는 유지해야 한다.

## 1. 현재 DB에서 표준 inventory-service 기동

현재 DB를 SELECT로 다시 확인했다.

```text
product_code ~ '^01[0-9]{4}$': active=0, soft_deleted=100
SELECT exit=0
```

공유 container를 건드리지 않고 inventory-service만 다음 격리 조건으로 실제 기동했다.

- `SERVER_PORT=0` — 별도 랜덤 포트
- `SAMHAN_SEED_TEST_DATA=false`
- Eureka/discovery 비활성
- Flyway 비활성
- 현재 `inventory_db` 연결
- JDBC session `default_transaction_read_only=on` — 예상 밖 DB write도 거부

원본 startup log:

```text
Tomcat started on port 56438 (http)
Started InventoryServiceApplication in 13.696 seconds
```

따라서 soft-deleted product 100건이 그대로인 현재 DB에서도 표준 toggle=false inventory-service는 실제 `Started`까지 도달한다. seed marker와 validator 호출 marker는 없었다. 격리 process tree는 판정 직후 종료했다.

코드에서도 validator의 production 호출자는 `StockBalanceSeeder.run()` 한 곳뿐이다. `StockBalanceSeeder`는 `@Profile("dev")`와 `@ConditionalOnProperty(app.seed-test-data=true)` 양쪽을 만족해야 생성되며, `run()`은 DB insert 전에 `productSeedIntegrityValidator.validate(...)`를 호출한다.

## 2. `-RunSeed`와 S21 validator 목적

seed를 실제 실행하지 않고 도달성만 검증했다.

- template 기본값: `SAMHAN_SEED_TEST_DATA=false`
- `-RunSeed`: service job 생성 전에 `true` 설정
- PowerShell 5.1 최소 재현: `Start-Job` 상속값 `true`, exit 0
- compose 합성: 기본값 product/inventory `false/false`; 명시 override `true/true`, 각 exit 0
- Spring property: product/inventory `application.yml` 모두 `SAMHAN_SEED_TEST_DATA`를 `app.seed-test-data`로 연결
- product seeder와 inventory seeders: dev profile + 동일 property true 조건
- inventory `StockBalanceSeeder.run()`: 첫 mutation 전에 validator 실행
- validator: 활성 product 누락을 `IllegalStateException`으로 전파

fresh `--rerun-tasks --no-daemon` 결과:

| 계약 | tests | failures | errors | skipped | task exit |
|---|---:|---:|---:|---:|---:|
| `HvacProductSeederTest` | 7 | 0 | 0 | 0 | 0 |
| `ProductClientTest` | 7 | 0 | 0 | 0 | 0 |
| `ProductSeedIntegrityValidatorTest` | 1 | 0 | 0 | 0 | 0 |

합계 15/15이다. S21의 “inventory mutation 전 활성 product batch 검증 + fail-fast” 목적은 유지됐다. 결함은 validator 제거가 아니라 opt-in toggle의 수명 경계다.

## 3. S13~S23 전체 회귀

| 축 | fresh 결과 |
|---|---|
| resolver 우선순위 | stale 설정 `18081`보다 실행 중 Docker 관측 `8081` 선택, exit 0 |
| S7 / Dockerless 16개 / guard 기준점 | `S7 axis regression tests passed`, 16 resolver 값 대조, exit 0 |
| BOM / PowerShell 5.1 parse | tracked PS1 65개, non-ASCII BOM 누락 0, parse 실패 0 |
| 종료코드 전수 표 | tracked 65개와 S23 표 65개 정확히 일치, missing 0, extra 0 |
| 종료코드 수정 3곳 + toggle 계약 | `s23-toggle-exitcode-contract.test.cjs` 6/6 |
| seed 자격 | `qa-credentials.test.cjs` 6/6 |
| k6 | `node --check perf/k6/mixed-load.js` exit 0; S19 이후 파일 변경 0, 50:50 직원 write·partner read-only·401 단일 기록·threshold 유지 |
| product/inventory seed 계약 | fresh 15/15, failure/error/skip 0 |
| 표준 stack 비변경 점검 | `start-local-full -SkipDocker -SkipServices -SkipPortCheck` 15/15 UP, exit 0; DB 단계 SELECT만 수행 |
| S25 Node 계약 포함 | 자격 6 + S23/S25 6 = 12/12, exit 0 |
| compose toggle 3단 | template false, compose product/inventory default false·override true, Spring property 양쪽 연결 |
| PR 상태 | head `8cabd0369c46ab24ba37042b52563872592d9275`, `gh pr checks 1119` exit 0, 43 checks green |

S13~S23의 기존 축에서 신규 도달 결함은 없었다. 이번 BLOCK은 S25가 추가한 `-RunSeed` override의 process 수명에만 있다.

## 4. 증거 무결성

- 첫 격리 startup 감시 루프는 Windows redirect 파일 잠금 때문에 `TIMEOUT` 문자열을 남겼다. 그러나 같은 원본 로그에 `Tomcat started`와 `Started InventoryServiceApplication`이 명시됐고 process는 살아 있었다. 판정은 모순되는 감시 문자열이 아니라 직접 startup marker를 사용했다.
- 첫 PowerShell job 상속 probe는 command quoting 오류로 parser exit 1이었다. 해당 결과는 폐기하고 `-EncodedCommand`로 독립 재실행해 `JOB_INHERITED=true`, exit 0을 얻었다.
- 첫 fresh Gradle 시도는 검증 도구 timeout을 잘못 짧게 지정해 wrapper가 고아가 됐다. 명령행과 PID를 확인해 해당 tree만 종료한 뒤 두 Gradle task를 처음부터 다시 실행했다. 위 15/15는 재실행 XML과 exit 0만 집계했다.
- PR 전체 `git diff --check origin/main...HEAD`는 기존 k6 raw log 공백과 세 markdown EOF 공백 때문에 exit 2다. S25 보고서 EOF 공백도 포함된다. 이는 이번 도달성 BLOCK과 별개지만, `git diff --check` 성공으로 보고하지 않았다.

## 5. 변경·환경 회수

- 코드 수정, commit, push 없음.
- 신규 파일: `docs/dev-reports/2026-08-08-1113-s26-final-reconvergence.md` 한 개.
- 공유 Docker stack의 up/down/restart/recreate 없음.
- DB write 및 seed 실행 없음. DB 접근은 SELECT와 read-only startup session만 사용.
- 격리 inventory process tree와 잘못 짧은 timeout에서 남은 Gradle wrapper tree를 각각 PID·명령행 확인 후 회수했다.
- `gradlew.bat --stop` exit 0, daemon 1개 종료. 이후 현재 점검 process 자신을 제외한 이 worktree Java/Gradle/PowerShell 잔여 0, S26 임시 log 0, k6 container 0.
- 공유 container는 최종 24개 running으로 유지됐고 `samhan-inventory-service`는 기존 container 그대로 healthy였다.

## 이 라운드가 보지 않은 것

- `/api/v1/inventory/balances` 404와 끊긴 참조 100건의 복구 정책·데이터 수정은 개발책임자 지시대로 판정에서 제외했다.
- 실제 `-RunSeed` seed mutation은 실행하지 않았다. product/inventory 도달성과 validator 차단은 코드, PowerShell job 상속, compose 합성, 단위 계약으로 검증했다.
- 공유 stack 재기동·중지 및 stop script 실동작은 수행하지 않았다.
- k6 smoke/baseline/peak/stress/soak는 업무 데이터를 변경하므로 실행하지 않았다.
- AWS 배포, Terraform, 외부 vendor, 모바일 GUI 전체 회귀는 수행하지 않았다.
