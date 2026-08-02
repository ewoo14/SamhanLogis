# PR #1048 머지 전 재수렴 3차 — fix 신규 표면 검증

- 대상 이슈: #1035 `slip-service` 창고 UUID 기동 검증
- 대상 PR: #1048
- 검증 브랜치/HEAD: `fix/1035-warehouse-uuid-boot` / `196101760`
- 검증 일시: 2026-08-02 KST
- 범위: commit `196101760`이 새로 만든 표면 전체만 검증
- 제약 준수: production 코드 수정 없음, Docker 이미지 재빌드 없음, 공유 DB 쓰기 없음, 합성 데이터·목업 없음. standalone jar는 별도 포트 `18388`, `18389`에서만 실행했고 종료했다.

## 1. 결론

**BLOCK — 새 결함 2건. PR #1048은 현재 상태로 머지하면 안 된다.**

1. **B-01 README의 `local` 지정이 개별 서비스 개발 환경을 PostgreSQL에서 휘발성 H2로 바꾼다.** 포트는 그대로지만 DB URL/드라이버/계정, Hibernate DDL 정책, Flyway, Eureka가 함께 바뀐다. 또한 CLI 인수 `local`이 `.env.dev-seed`의 `SPRING_PROFILES_ACTIVE=dev`보다 우선하므로 dev seeder도 비활성화된다. README의 "인프라 stack 기동 → 개별 서비스 실행" 맥락과 다른 환경이다.
2. **B-02 `.env.dev-seed`에 추가된 4개 UUID 중 3개는 변수명이 뜻하는 창고가 아니다.** 네 값은 모두 `inventory_db.warehouses`의 실재 행이므로 단순 placeholder로 끝나지 않는다. `HUBAL`은 `VH-001 1호차 차량재고`, `ANSEONG`은 `CS-001 거래처 위탁창고`, `CHANGWON`은 `VR-001 가상창고`로 런타임에 실재 창고처럼 취급된다. 현재 `slip_db.slips`에도 이 세 UUID를 `source_warehouse_id`로 가진 행이 합계 **1,428건** 있다. 다만 저장소가 원래 요청의 `warehouseCode`를 보존하지 않으므로 이 1,428건을 이번 fix 또는 legacy 매핑이 생성했다고 인과 귀속하지는 않는다.

`resolve`의 canonical 검사 자체가 현재 관측 가능한 정상 값을 새로 거부한 건수는 **0건**이다. repo 공급면 7곳의 literal 28개, 실행 중 공유 slip 컨테이너의 실제 환경값 4개, 현재 DB에 저장된 네 매핑 UUID 대상 전표 2,400건은 모두 canonical이다. 단, production compose는 값 자체가 아닌 환경변수 참조 4개만 가지므로 실제 운영 secret 값은 이 라운드에서 검증하지 못했다.

## 2. fix가 만든 새 표면 목록

| 표면 | 새 동작 | 실측 | 판정 |
|---|---|---:|---|
| `WarehouseCodeMapper.resolve` | `UUID.fromString` 전에 canonical `8-4-4-4-12` 검사 | 관측 가능한 실제 설정값 거부 0건 | PASS |
| README 개별 slip 기동 명령 | `--spring.profiles.active=local` 강제 | H2 선택 1회 재현, `dev` env 무시 1회 재현 | **BLOCK B-01** |
| `.env.dev-seed` | `WAREHOUSE_UUID_*` 4개를 15개 기동 job의 환경에 export | 다른 서비스의 의미 소비 0개, slip 소비 1개, 정체성 불일치 3/4 | **BLOCK B-02** |
| canonical 정규식 공급면 | CI/local compose/env template/Terraform/local profile/실행 컨테이너 값 검사 | 확인값 32/32 통과, 거부 0 | PASS(운영 secret 제외) |

## 3. `resolve` 런타임 거부 여부

### 3.1 데이터 흐름

`resolve(String warehouseCode)`의 새 정규식은 요청의 `warehouseCode`에 적용되지 않는다. `warehouseCode.trim()`으로 map을 찾은 뒤 **map의 `configuredValue`**에 적용된다. 같은 map 전체는 정상 Spring bean 기동 중 `@PostConstruct logEffectiveMap()` → `parseConfiguredUuid()`에서 동일 정규식으로 먼저 전수 검증된다.

따라서 정상 기동 완료 후 map이 별도로 변조되지 않는 운영 경로에서는 `resolve`에 도달해서 처음 거부되는 configured value가 생기지 않는다. 이번 저장소 검색에서 production 코드가 `setWarehouseCodeMap`으로 기동 후 map을 교체하는 경로는 없었다.

### 3.2 실제 값 계수

정규식 원문과 동일한 `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`(대소문자 무시)로 실제 공급값을 계수했다.

```text
SOURCE=.github/workflows/ci.yml VALUES=4 PASS=4 REJECT=0
SOURCE=infrastructure/terraform/templates/user_data.sh VALUES=4 PASS=4 REJECT=0
SOURCE=infrastructure/docker-compose.local-all.yml VALUES=4 PASS=4 REJECT=0
SOURCE=infrastructure/.env.example VALUES=4 PASS=4 REJECT=0
SOURCE=infrastructure/env-templates/slip-service.env VALUES=4 PASS=4 REJECT=0
SOURCE=infrastructure/env-templates/.env.dev-seed VALUES=4 PASS=4 REJECT=0
SOURCE=services/slip-service/src/main/resources/application.yml VALUES=4 PASS=4 REJECT=0
SOURCE=running:samhan-slip-service VALUES=4 PASS=4 REJECT=0
SOURCE=infrastructure/docker-compose.prod.yml REFERENCES=4 LITERAL_VALUES=0 STATUS=UNRESOLVED
```

- repo literal 공급값: **28/28 통과, 0 거부**
- 현재 실행 중 공유 slip 컨테이너의 실제 환경값: **4/4 통과, 0 거부**
- 합계 관측값: **32/32 통과, 0 거부**
- production compose 실제 값: **4개 미검증**. `${WAREHOUSE_UUID_*}` 참조만 있고 secret 값은 저장소에 없다.

현재 `slip_db.slips`의 실제 저장 결과도 읽기 전용으로 계수했다.

```text
  source_type  |         source_warehouse_id          | rows
---------------+--------------------------------------+------
 ESTIMATE      | 11111111-1111-1111-1111-111111111111 |    1
 MANUAL        | 11111111-1111-1111-1111-000000000001 |  956
 MANUAL        | 11111111-1111-1111-1111-000000000002 |  490
 MANUAL        | 11111111-1111-1111-1111-000000000003 |  502
 MANUAL        | 11111111-1111-1111-1111-000000000004 |  436
 MANUAL        |                                      |   50
 PARTNER_ORDER | 11111111-1111-1111-1111-000000000001 |   16
 PARTNER_ORDER | 11111111-1111-1111-1111-111111111111 |    4

 total_slips | mapped_uuid_slips
-------------+-------------------
        2455 |              2400
```

네 매핑 UUID를 가진 실제 전표는 **2,400건**, canonical이 아닌 저장 UUID는 UUID 컬럼 타입 특성상 **0건**이다. 이 숫자는 실제 persistent output의 영향 상한을 확인하기 위한 것이며, 저장된 전표를 `resolve`가 다시 읽는다는 뜻은 아니다. 원 요청의 `warehouseCode`는 DB에 저장되지 않아 과거 호출별 직접 재생·계수는 불가능하다.

### 3.3 판정

현재 실제 공급값 기준 새 런타임 거부 **0건 — PASS**. 기동 검증과 런타임 검증이 같은 map 값에 같은 정규식을 적용한다. 다만 `resolve` 전용 회귀 테스트는 이번 fix에 추가되지 않았다.

## 4. README `local` 프로파일의 동반 변경

### 4.1 설정 차이

base 설정과 `local` 문서의 실제 차이는 다음과 같다.

| 항목 | base/일반 개발 경로 | `local` |
|---|---|---|
| DB | PostgreSQL `jdbc:postgresql://.../slip_db` | H2 `jdbc:h2:mem:slip_db` |
| DB 계정/드라이버 | `samhan` / PostgreSQL | `sa` / H2 |
| Hibernate | `ddl-auto=validate` | `ddl-auto=create-drop` |
| Flyway | enabled | disabled |
| Eureka | 기본 URL에 등록/조회 | client disabled, register/fetch false |
| 창고 map | 환경변수 필수 | 고정 UUID 4개 |
| 포트 | 기본 8086 | 변경 없음, 기본 8086 |
| auth/Redis/S3/MinIO/Aligo/public URL | base 설정 | 별도 override 없음 |

`SlipSeeder` 등은 `@Profile("dev")`로 가드돼 있다. README가 강제한 `local`은 `.env.dev-seed`의 `SPRING_PROFILES_ACTIVE=dev`까지 CLI 우선순위로 덮으므로 dev seeder가 동작하지 않는다.

### 4.2 standalone jar 재현 원문

Docker 이미지는 재빌드하지 않았다. 현재 HEAD에서 `bootJar`만 생성했다.

```text
> Task :services:slip-service:bootJar

BUILD SUCCESSFUL in 23s
17 actionable tasks: 1 executed, 16 up-to-date
```

README와 같은 `--spring.profiles.active=local`, 별도 포트 `18388` 실행:

```text
PID=107936 EXITED=False HEALTH=HTTP 200 123 34 115 116 97 116 117 115 34 58 34 85 80 34 125
2026-08-02T20:05:00.318+09:00  INFO 107936 --- [slip-service] [           main] c.s.logis.slip.SlipServiceApplication    : The following 1 profile is active: "local"
2026-08-02T20:05:08.872+09:00  INFO 107936 --- [slip-service] [           main] com.zaxxer.hikari.pool.HikariPool        : HikariPool-1 - Added connection conn0: url=jdbc:h2:mem:slip_db user=SA
2026-08-02T20:05:24.941+09:00  INFO 107936 --- [slip-service] [           main] c.s.logis.slip.SlipServiceApplication    : Started SlipServiceApplication in 27.017 seconds (process running for 28.315)
```

위 health body의 숫자열은 PowerShell이 응답 byte array를 표시한 것으로 UTF-8 문자열 `{"status":"UP"}`에 해당하며 HTTP status는 200이었다.

환경변수에 `SPRING_PROFILES_ACTIVE=dev`를 실제로 둔 자식 프로세스에도 README CLI 인수 `local`을 함께 주고 별도 포트 `18389`로 재실행했다.

```text
PID=79140 EXITED=False STARTED=True
2026-08-02T20:06:56.883+09:00  INFO 79140 --- [slip-service] [           main] c.s.logis.slip.SlipServiceApplication    : The following 1 profile is active: "local"
2026-08-02T20:07:05.383+09:00  INFO 79140 --- [slip-service] [           main] com.zaxxer.hikari.pool.HikariPool        : HikariPool-1 - Added connection conn0: url=jdbc:h2:mem:slip_db user=SA
2026-08-02T20:07:20.417+09:00  INFO 79140 --- [slip-service] [           main] c.s.logis.slip.SlipServiceApplication    : Started SlipServiceApplication in 25.799 seconds (process running for 26.861)
```

### 4.3 판정

**BLOCK B-01.** README는 바로 위에서 PostgreSQL 등 인프라 stack을 기동하게 한 뒤 개별 서비스를 실행하도록 안내한다. slip-service 한 줄만 `local`을 강제하면 다른 서비스와 달리 공유 PostgreSQL/Eureka/dev seed에서 격리된 휘발성 H2 인스턴스가 된다. health 200은 이 환경 차이를 드러내지 않는다.

## 5. `.env.dev-seed`의 다른 소비자와 창고 실재성

### 5.1 소비자 계수

- `.env.dev-seed`를 실제 파싱하는 스크립트: **1개**, `infrastructure/scripts/start-local-full.ps1`
- README 수동 export 절차: **1개**
- start script가 같은 환경을 상속시켜 시작하는 job: **15개**(eureka, gateway 포함)
- `WAREHOUSE_UUID_*`를 production application 설정에서 의미 있게 소비하는 서비스: **1개**, slip-service
- slip-service 외 다른 서비스의 해당 변수 참조: **0개**

즉 다른 14개 job도 환경변수는 상속하지만 해당 이름을 읽는 application 설정은 없다. 다른 서비스에 직접 설정 충돌은 확인되지 않았다.

### 5.2 실제 `inventory_db` 원문

`.env.dev-seed`에 추가된 네 값을 공유 `inventory_db.warehouses`에서 읽기 전용으로 조회했다.

```text
                  id                  |  code  |      name       |     type     | is_deleted
--------------------------------------+--------+-----------------+--------------+------------
 11111111-1111-1111-1111-000000000001 | HQ-001 | 본사창고        | HEADQUARTERS | f
 11111111-1111-1111-1111-000000000002 | VH-001 | 1호차 차량재고  | VEHICLE      | f
 11111111-1111-1111-1111-000000000003 | CS-001 | 거래처 위탁창고 | CONSIGNMENT  | f
 11111111-1111-1111-1111-000000000004 | VR-001 | 가상창고        | VIRTUAL      | f
(4 rows)
```

실재성은 **4/4**, 변수명과 창고 정체성 일치는 **1/4**, 불일치는 **3/4**다.

현재 `slip_db.slips`에서 불일치 세 UUID의 `source_warehouse_id` 행 수:

- `...0002` 차량재고: 490건
- `...0003` 거래처 위탁창고: 502건
- `...0004` 가상창고: 436건
- 합계: **1,428건**

이 값들은 존재하지 않는 placeholder가 아니라 DB의 활성 창고다. 따라서 legacy code `2`, `14`, `1`의 변환 결과가 downstream에서 FK 없는 문자열 placeholder가 아니라 실제 다른 창고 정체성으로 처리될 수 있다.

### 5.3 판정

**BLOCK B-02.** 다른 서비스 직접 소비는 0개지만, fix가 복구한 dev full-start slip 경로에서 3개 이름이 다른 실제 창고로 해석된다. 형식 검증 통과와 창고 의미 정합은 별개다.

## 6. canonical 정규식의 정상 값 false reject

### 확인 결과

- CI literal 4/4 통과
- Terraform user-data 운영 기본 literal 4/4 통과
- local compose literal 4/4 통과
- `.env.example` 4/4 통과
- `slip-service.env` 4/4 통과
- `.env.dev-seed` 4/4 통과
- `application.yml` local 값 4/4 통과
- 현재 공유 slip 컨테이너 실제 환경값 4/4 통과
- 합계 **32/32 통과, false reject 0건**

정규식은 대소문자 무시이므로 canonical uppercase hex도 허용한다. 하이픈 위치가 정확한 표준 텍스트 UUID를 거부하는 패턴은 발견하지 못했다.

### 판정

관측 가능한 운영 기본값·CI·local compose·실행 컨테이너 범위는 **PASS**. 다만 `docker-compose.prod.yml`은 4개 환경변수 참조만 보유하고 실제 production secret 값은 이 작업공간에 없으므로 그 4개는 **조사하지 않음/검증 불가**이며 결함 0에 포함하지 않았다.

## 7. 최종 판정

| ID | 심각도 | 판정 |
|---|---|---|
| B-01 | BLOCK | README `local` 강제가 PostgreSQL/dev/Eureka 개발 경로를 H2/local 격리 경로로 변경 |
| B-02 | BLOCK | dev-seed의 3/4 UUID가 변수명과 다른 활성 창고를 가리켜 실제 정체성으로 처리 가능 |
| R-01 | PASS | `resolve` canonical 검사로 현재 관측 실제 configured value가 새로 거부된 건수 0 |
| R-02 | PASS(제한) | 확인 가능한 정상 공급값 32/32 통과; production secret 4개 미검증 |

**최종: BLOCK 2건.**

## 8. 이 라운드가 보지 않은 것

- commit `196101760` 이전 production 코드와 기존 결함의 재검토
- 직전 보고의 기동 경로 11/11 전체 재실행
- 축약형/공백/중괄호 등 합성 invalid matrix 재실행(이번 라운드는 합성 데이터 금지)
- 실제 production secret/Parameter Store의 `WAREHOUSE_UUID_*` 4개 값
- 실 운영 트래픽 payload와 과거 요청별 `warehouseCode` 빈도: 저장소와 `slip_db`가 원 요청 코드를 보존하지 않아 계수 불가
- 1,428개 기존 전표가 어떤 입력 경로로 생성됐는지의 인과 추적
- 다른 서비스 전체 기능·CI 전체 suite·성능·보안·UI
- Docker 이미지 재빌드 및 Docker 기반 PR HEAD 기동
- 결함 수정안 설계·코드 수정

## 9. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1035-r3-postfix-reconvergence.md`
