# PR #1048 SOL 적대검증 — 창고 UUID 기동 가드 도달성

- 대상: 이슈 #1035 / PR #1048
- 브랜치·HEAD: `fix/1035-warehouse-uuid-boot` / `c2103dcdc1dcccfe5b2ae9b0993ec33b1fee2692`
- 조사일: 2026-08-02 KST
- 유일한 질문: **기동되어야 할 것이 기동되지 않는가?**
- 제약 준수: production 코드 수정, commit/push/checkout, Docker 이미지 rebuild, 공유 DB 데이터 생성, 신규 합성 데이터·mock 작성 없음. 실기동은 기존 standalone jar와 별도 포트만 사용했다. Testcontainers 경로 확인은 저장소의 기존 테스트를 그대로 실행했으며, 그 테스트가 원래 가진 외부 client `@MockBean`은 warehouse 설정값을 대신하지 않는다.

## 1. 결론

**BLOCK — 도달 가능한 결함이다.**

저장소에서 `slip-service`를 실제로 기동하도록 안내·자동화한 독립 실행 경로를 아래 기준으로 11개 세었고, 그중 정상 개발 경로 **2건**이 깨끗한 환경에서 차단된다.

1. 루트 `README.md`의 기본 `:services:slip-service:bootRun`
2. `infrastructure/scripts/start-local-full.ps1`의 `.env.dev-seed` 로드 후 `dev` 프로파일 `bootRun`

두 경로 모두 기존 저장소가 제공하는 정상 실행 경로지만 `WAREHOUSE_UUID_*` 4개를 공급하지도, `local` 프로파일을 켜지도 않는다. 따라서 현재 PR에서는 `WarehouseCodeMapper` 초기화가 실패한다. **차단되는 정상 구성 건수는 2건**이다.

반대 방향에도 결함이 있다. 가드는 `UUID.fromString`만 호출하므로 정규 36자 UUID 문자열이 아닌 `1-1-1-1-1` 같은 축약형을 통과시킨다. 현재 jar에 축약형 4개를 주입한 standalone 실기동이 `warehouse-code-map 로드: 4 entries`와 `GET /actuator/health -> 200`까지 도달했다.

## 2. 카운팅 기준

- “기동 경로 1건”은 사용자가 실행할 수 있는 독립 명령·스크립트·배포 절차를 1건으로 센다.
- 같은 compose를 호출해도 Windows/Unix 스크립트는 별도 사용자 진입점이므로 각각 센다.
- 포트 override는 별도 실행 명령이므로 센다.
- 단순 `bootJar`/`assemble`은 프로세스를 띄우지 않으므로 기동 건수에서 제외한다.
- CI의 서로 다른 matrix job은 각각 별도 실행 경로로 표에 적되, 위의 **운영·개발 기동 경로 11건** 분모에는 넣지 않고 테스트 경로 6건으로 별도 집계한다.
- backend를 애초에 띄우지 않는 구성도 누락 오인을 막기 위해 §5에 별도 열거한다.

## 3. 배포본 나이와 소스 계보 선확인

공유 컨테이너를 제품 판정에 쓰기 전에 지시된 순서로 나이와 jar를 확인했다.

```text
docker inspect -f 'Created={{.Created}} ...' samhan-slip-service
Created=2026-08-02T04:30:03.970155657Z
Started=2026-08-02T04:30:05.930178495Z
Status=running Health=healthy
```

생성 시각은 **2026-08-02 13:30:03 KST**다. 실행 명령은 `java -jar /app/app.jar`였다.

```text
container /app/app.jar SHA-256
ab7dc0b1e8e1f42cc8e4439d60b68f9adfee2e0289b6324f4e46c9ef01fb5e0f

worktree services/slip-service/build/libs/slip-service.jar SHA-256
AB7DC0B1E8E1F42CC8E4439D60B68F9ADFEE2E0289B6324F4E46C9EF01FB5E0F
```

두 해시는 같다. 컨테이너 jar 안의 `BOOT-INF/classes/application.yml`에도 기본값 없는 `${WAREHOUSE_UUID_*}` 4개와 `local` override가 존재했다. 컨테이너 로그는 다음과 같다.

```text
The following 1 profile is active: "dev"
warehouse-code-map 로드: 4 entries
Started SlipServiceApplication in 13.956 seconds
```

반면 `git show origin/main:services/slip-service/src/main/resources/application.yml`에는 아직 `${WAREHOUSE_UUID_HQ:11111111-...}` 형태의 기존 fallback이 있다. 따라서 공유 컨테이너는 낡은 `origin/main` 배포본이 아니라 **현재 PR jar와 바이트가 같은 배포본**이다. 아래 결함을 낡은 배포본 탓으로 세지 않았다.

## 4. 실제 운영·개발 기동 경로 전수 — 11건

| # | 실제 진입점 / 구성 | 최종 프로파일·값 공급 | 기동 성부 | 정상 구성 차단인가 |
|---:|---|---|---|---|
| 1 | `README.md:882-890`의 `./gradlew :services:slip-service:bootRun` | 기본 프로파일, env 로드 지시 없음 | **실패** | **예 — 1건** |
| 2 | `infrastructure/scripts/start-local-full.ps1:297-321,358-365,430-436` | `.env.dev-seed`의 `SPRING_PROFILES_ACTIVE=dev`; 해당 env 파일에는 창고 4변수 없음 | **실패** | **예 — 1건** |
| 3 | `infrastructure/env-templates/slip-service.env`를 export/EnvironmentFile로 로드한 bootRun·systemd | 기본/dev + 창고 4변수 전부 | 성공 | 아니오 |
| 4 | `--spring.profiles.active=local` standalone/bootRun | `application.yml` local 문서의 고정 UUID 4개가 base를 override | 성공 | 아니오 |
| 5 | 문서화된 직접 local compose: `docker-compose.yml` + `docker-compose.local-all.yml` | `dev`; local-all이 4개를 명시 | 성공 | 아니오 |
| 6 | `scripts/launch-local-stack.ps1` | #5 compose를 호출; 4개 명시 | 성공 | 아니오 |
| 7 | `scripts/launch-local-stack.sh` | #5 compose를 호출; 4개 명시 | 성공 | 아니오 |
| 8 | #5 + `docker-compose.no-host-ports.yml` | env는 #5 그대로, host port만 제거 | 성공 | 아니오 |
| 9 | #5 + `docker-compose.slip-port-override.yml` | env는 #5 그대로, host port만 18086으로 변경 | 성공 | 아니오 |
| 10 | Terraform `user_data.sh`가 만든 `.env.production` + `docker-compose.prod.yml` | `production`; user_data가 4개, prod compose가 4개 전달 | 성공 | 아니오 |
| 11 | 수동 production compose + 정상 `.env.production` | `production`; prod compose가 4개 필수 전달 | 성공 | 아니오 |

### 프로파일별 판정

| 프로파일 | slip-service 전용 문서 존재 | env 0개 | env 4개 정규값 | 실제 사용처 |
|---|---:|---|---|---|
| 기본(무프로파일) | base 문서 | 실패 | 성공 | README 기본 bootRun, 서비스 env 템플릿 |
| `local` | 있음 | **성공** | 성공(local 값이 같은 키를 override) | 개발 standalone/bootRun |
| `dev` | 별도 문서 없음, base 사용 | 실패 | 성공 | local-all compose, `start-local-full.ps1` |
| `docker` | slip-service 문서 없음, base 사용 | 실패 | 성공 | slip-service의 실제 compose는 `dev`; `docker`는 Eureka에만 사용 |
| `test` | main profile 문서 없음 | test resource가 있어 성공 | 성공 | Gradle/Spring test context |
| `production` | 별도 문서 없음, base 사용 | 실패 | 성공 | production compose |
| `prod` | slip-service 문서·실행 경로 없음 | 실패 | 성공 | 아로로지스 독립 compose에만 사용, slip-service는 뜨지 않음 |

### 정상 경로 2건의 공통 원인

`application.yml:188-191`은 base 문서에서 4개 env를 fallback 없이 요구한다. `local` 문서만 같은 map을 고정값으로 덮어쓴다. `README` 기본 명령은 env 파일 또는 `local` 프로파일을 지정하지 않는다.

`start-local-full.ps1`은 `.env.dev-seed`를 실제 프로세스 환경에 로드한 뒤 각 서비스를 `bootRun`한다. `.env.dev-seed`에는 `SPRING_PROFILES_ACTIVE=dev`와 slip seed toggle은 있지만 `WAREHOUSE_UUID_*`는 0개다. 스크립트도 `slip-service.env`를 추가로 로드하지 않는다. 따라서 새 PC·깨끗한 shell이라는 정상 전제에서 slip-service만 기동 실패한다.

## 5. 서비스를 띄우지 않는 저장소 구성 — 누락 방지 목록

| 구성 | slip-service 기동 여부 | 이유 |
|---|---|---|
| `infrastructure/docker-compose.yml` 단독 | 안 뜸 | PostgreSQL/Redis/MinIO 등 기반 인프라만 정의 |
| `infrastructure/docker/docker-compose.arologis.yml` | 안 뜸 | arologis-service만 기동하고 slip-service URL만 소비 |
| `infrastructure/render/render.yaml` | 안 뜸 | 웹 클라이언트 2종만 정의 |
| `.github/workflows/qa-e2e.yml` | 안 뜸 | backend 미가동을 명시하고 Playwright가 skip하도록 실행 |
| `bootJar`/`assemble` 단계 | 안 뜸 | jar 생성/컴파일만 수행 |
| port override 2종 단독 | 안 뜸 | base/local-all에 합쳐야 하는 overlay일 뿐 독립 서비스 정의가 아님 |

## 6. CI·통합 테스트·Testcontainers 기동 경로 — 6건

| # | 경로 | Spring context 기동 성부 | 가드 입력 출처 |
|---:|---|---|---|
| T1 | 로컬 `:services:slip-service:test` | 성공 | `src/test/resources/application.properties` 4개 |
| T2 | `ci.yml` `slip-units` | 성공 | workflow env 4개 + test properties |
| T3 | `ci.yml` `slip-it-public` | 성공 | workflow env 4개 + test properties |
| T4 | `ci.yml` `slip-it-core` | 성공 | workflow env 4개 + test properties |
| T5 | `nightly-slip-it.yml` `slip-it-public` | 성공 | workflow env는 없지만 test properties 4개 |
| T6 | `nightly-slip-it.yml` `slip-it-core` | 성공 | workflow env는 없지만 test properties 4개 |

모든 `@SpringBootTest`/Testcontainers 컨텍스트는 test runtime classpath의 동일한 `application.properties`를 읽는다. `AbstractPostgresIT`의 `DynamicPropertySource`는 datasource·Flyway·Eureka·internal token만 덮고 warehouse map을 지우지 않는다.

fresh 실행 원문:

```text
.\gradlew.bat :services:slip-service:test \
  --tests "com.samhanair.logis.slip.publish.WarehouseCodeMapperStartupValidationTest" \
  --tests "com.samhanair.logis.slip.it.ApplicationContextLoadIT" \
  --no-daemon --rerun-tasks

BUILD SUCCESSFUL in 1m 23s
18 actionable tasks: 18 executed
```

JUnit XML 집계:

```text
WarehouseCodeMapperStartupValidationTest tests=6 failures=0 errors=0 skipped=0
ApplicationContextLoadIT                tests=3 failures=0 errors=0 skipped=0
```

`ApplicationContextLoadIT`는 실제 Testcontainers PostgreSQL을 사용했고 `skipped=0`이다. 따라서 통합 테스트·Testcontainers가 이 가드 때문에 막히는 경로는 **0건**이다. 다만 이 성공은 production과 독립된 test properties가 4개를 대신 공급한 결과다.

## 7. 실제 실행 재현 원문

### 7.1 env 전부 미설정 — 기본 정상 개발 명령이 차단됨

현재 jar, 실 `slip_db`, 별도 포트에서 4개 env를 제거해 실행했다. 기존 PM 라이브QA 원문도 같은 결과를 남긴다.

```text
Caused by: org.springframework.beans.factory.BeanCreationException:
  Error creating bean with name 'warehouseCodeMapper': Invocation of init method failed
Caused by: java.lang.IllegalStateException:
  창고 매핑 기동 검증 실패: 창고코드 '00003'
프로세스 종료코드 = 1
```

이것은 잘못된 production 구성에는 의도된 결과지만, §4의 README 및 full-local 스크립트는 그 env를 공급하라는 연결이 없어 **정상 개발 경로에도 동일하게 도달**한다.

### 7.2 일부만 설정 — 전체 기동 차단

HQ/HUBAL/ANSEONG 3개만 정규값으로 설정하고 CHANGWON을 미설정한 standalone jar를 포트 `18390`에서 실행했다. Flyway는 false, Hibernate DDL은 none으로 두어 공유 DB를 쓰지 않았다.

```text
Exception encountered during context initialization - cancelling refresh attempt
UnsatisfiedDependencyException: Error creating bean with name 'slipPublishService'
... Error creating bean with name 'warehouseCodeMapper': Invocation of init method failed
Caused by: org.springframework.beans.factory.BeanCreationException:
Error creating bean with name 'warehouseCodeMapper': Invocation of init method failed
```

기동 완료/health 응답 없이 프로세스가 종료됐다. 현재 map은 네 legacy 코드 모두를 지원하는 고정 계약이므로 **4개 중 1개라도 없으면 전체 기동 차단은 의도된 원자적 구성**으로 판단한다. 선택적 창고별 부분 운영 계약은 저장소에 없다.

### 7.3 local 프로파일, env 0개 — 정상 기동

```text
java -jar slip-service.jar --server.port=18389 --spring.profiles.active=local

The following 1 profile is active: "local"
warehouse-code-map 로드: 4 entries
Started SlipServiceApplication in 20.453 seconds
GET /actuator/health -> 200
```

local override 자체는 정상이다.

### 7.4 비정규 축약 UUID — 잘못 통과

JDK 17.0.18의 실제 파서 원문:

```text
1-1-1-1-1 => PASS 00000001-0001-0001-0001-000000000001
```

현재 jar에 `1-1-1-1-1`, `2-2-2-2-2`, `3-3-3-3-3`, `4-4-4-4-4`를 네 env로 주입하고 포트 `18388`에서 실행했다.

```text
warehouse-code-map 로드: 4 entries
GET /actuator/health -> 200, {"status":"UP"}
```

따라서 “UUID 형식 검증”이 정규 `8-4-4-4-12` 문자열 형식을 강제한다는 주장은 성립하지 않는다. `UUID.fromString`은 일부 짧은 그룹을 0으로 padding한다.

## 8. 값 종류별 통과/차단 판정

| 입력 종류 | 결과 | 판정 |
|---|---|---|
| 정규 36자 소문자 UUID | 통과 | 정상 |
| 정규 36자 대문자 UUID | 통과 후 소문자로 normalize | 정상; UUID hex는 대소문자 비구분 |
| 빈 문자열 / 공백만 | 차단 | 정상 |
| 앞뒤 공백 또는 개행 포함 | 차단 | 정상; 가드는 trim하지 않음 |
| `{uuid}` 중괄호 형식 | 차단 | 정상; Java canonical 형식 아님 |
| `1-1-1-1-1` 등 축약 그룹 | **통과** | **결함 — 정규 UUID 문자열 형식이 아님** |
| 하이픈 없는 32 hex | 차단 | 정상 |
| 형식은 맞지만 실재하지 않는 UUID | **통과** | 외부 조회를 제거한 현재 구현의 명시적 한계; 잘못된 창고 오주입 방어는 못 함 |
| 실재하지만 legacy 코드 의미와 다른 창고 UUID | **통과** | 형식 전용 가드의 한계; 코드↔창고 정체성은 검증하지 않음 |

fresh 단위 테스트의 `형식이_맞는_UUID는_실재하지_않아도_외부_호출_없이_기동한다`도 통과했다. 즉 실재성·정체성 미검증은 추정이 아니라 테스트로 고정된 동작이다. PR 설명이 “형식 검증”으로 한정돼 있으므로 이 둘만으로 범위 위반이라 단정하지는 않지만, **가드가 통과시키면 안 되는 잘못된 운영값은 실제로 존재한다.**

## 9. 도달 가능한 결함 판정

### SOL-B01 — 정상 로컬 기동 경로 2건 차단

- 심각도: **BLOCK**
- 도달성: 높음. README 명령 또는 `start-local-full.ps1`을 깨끗한 shell/새 PC에서 실행하면 된다.
- 수량: 운영·개발 실제 기동 경로 11건 중 **2건**.
- 원인: base map은 4개 env를 필수화했지만 두 정상 경로가 local profile 또는 `slip-service.env`를 연결하지 않았다.

### SOL-B02 — 비정규 축약 UUID가 기동 가드를 통과

- 심각도: **BLOCK**
- 도달성: 직접 env 오주입으로 재현됨.
- 원인: canonical textual UUID 검사가 아니라 관대한 `UUID.fromString`의 성공 여부만 사용한다.

### 범위 내 최종 판정

**머지 불가.** 질문 “기동되어야 할 것이 기동되지 않는가?”에 대한 답은 **예, 실제 저장소 정상 경로 2건**이다. 또한 반대 방향으로 정규 형식이 아닌 축약 UUID도 실제 서비스 health까지 통과한다.

## 10. 이 라운드가 보지 않은 것

- warehouse UUID가 실제 `inventory_db.warehouses`에 존재하는지 및 legacy 코드와 의미상 같은 창고인지 재조회하지 않았다. 이번 질문은 기동 도달성과 형식 가드였고, production UUID 원문 노출을 피했다.
- 전표 발행 후 해당 UUID가 저장·표시되는 업무 경로는 보지 않았다.
- 다른 PR 변경인 창고명 snapshot client 제거, `SlipService`/`SlipDuplicateService` 런타임 행위, 보안·권한·성능은 보지 않았다.
- 전체 slip-service 1,545개 테스트를 재실행하지 않았다. 이번에는 가드 단위 6개와 실제 Testcontainers context 3개만 fresh 실행했다.
- 실제 AWS EC2/RDS production 배포를 실행하지 않았다. 저장소의 `user_data.sh`와 prod compose 전달 계약을 정적으로 대조했다.
- Docker 이미지를 재빌드·재기동하지 않았다. 공유 컨테이너는 나이·로그·jar 해시 확인에만 사용했다.
- 모든 가능한 Unicode 공백·제어문자 조합을 전수 fuzz하지 않았다.

## 11. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1035-r-sol-boot-guard-reachability.md`

이 파일 외 새 파일은 만들지 않았다.
