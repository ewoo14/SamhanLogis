# PR #1083 / 이슈 #1052 — SOL R8 재수렴

검증 좌표: `c58c2e962`

## 1. 판정

**실 사용자 경로로 재현 가능한 R8 신규 도달 결함은 확인되지 않았다.**

다만 의도된 정상 회복, 즉 `00003/2`의 권위 alias만 준비된 상태에서 `14/1` 부재와 무관하게
정상 전표가 발행되는지는 이 PC의 정상 발행 실표본이 **0건**이므로 **판정 불가**다. 이를
“결함 0”이나 정상 발행 PASS로 세지 않는다.

R8이 검증 집합을 좁힌 뒤 조용히 통과하게 된 위험 요청은 실 데이터 **0건**이다. `14/1`은
현재 사용자 생성 경로에서 나오지 않고 활성 발행 표본에도 없으며, 임의 요청으로 들어오더라도
요청 단위 `WarehouseCodeMapper.resolve()`가 `VERIFIED`가 아닌 코드를 계속 거부한다.

## 2. 착수 전제 재측정

DB는 `SELECT`만 수행했다. 컨테이너 재빌드·재시작과 라이브 쓰기 요청은 하지 않았다.

### 2-1. inventory DB

```text
SELECT COUNT(*) FROM staging.ecount_warehouse_map;

 staging_ecount_warehouse_map_rows
-----------------------------------
                                 0
```

```text
SELECT COUNT(*) FROM warehouses WHERE is_deleted=false;

 active_warehouses
-------------------
                 8
```

활성 8행 원문:

```text
00003          | 초월창고 S18          | HEADQUARTERS
2              | 상일창고 S18          | HEADQUARTERS
CS-001         | 거래처 위탁창고       | CONSIGNMENT
HQ-001         | 본사창고              | HEADQUARTERS
QA-1039-CHOWOL | 초월창고 QA-1039-초월 | HEADQUARTERS
QA-1039-SANGIL | 상일창고 QA-1039-상일 | HEADQUARTERS
VH-001         | 1호차 차량재고        | VEHICLE
VR-001         | 가상창고              | VIRTUAL
```

### 2-2. 운영 템플릿

`infrastructure/terraform/templates/user_data.sh`는 `WAREHOUSE_MAPPING_MODE=STRICT`를 선언한다.
`services/slip-service/src/main/resources/application.yml`의 운영 consumer map key는 아래 네 개다.

```text
00003, 2, 14, 1
```

따라서 제시된 운영 템플릿 전제와 일치한다.

### 2-3. 정상 발행 실표본

```text
slip_publish_audit 원행   ESTIMATE 1 · PARTNER_ORDER 20
ESTIMATE audit ↔ 활성 slip 조인                         0
그중 source_warehouse_code IN ('00003','2')             0
```

`ESTIMATE` audit 1행은 활성 slip과 조인되지 않는 고아라 정상 발행 실표본으로 세지 않았다.
따라서 **정상 발행 실표본 0건** 전제와 일치한다.

활성 slip의 발행 출처·창고코드 분포도 `ESTIMATE`는 0건이다.

```text
(blank) | MANUAL        46
(blank) | PARTNER_ORDER  4
00003   | MANUAL         3
2       | MANUAL        28
CS-001  | MANUAL       502
HQ-001  | MANUAL       872
HQ-001  | PARTNER_ORDER 16
VH-001  | MANUAL       490
VR-001  | MANUAL       436
```

전제가 달라 중단해야 할 항목은 없었다.

## 3. 첫 각도 — 차단되면 안 되는 것이 차단되는가

### 3-1. 코드 도달 사슬

1. 사용자가 estimate-app에서 전표 생성을 누른다.
2. 수동 선택은 `00003`, 자동 분기는 `00003` 또는 `2`를 만든다.
3. `POST /internal/slips/from-estimate`가 `SlipPublishService.publishFromEstimate()`를 호출한다.
4. 저장 전에 `WarehouseCodeMapper.resolve(warehouseCode)`가 실행된다.
5. R8 validator는 `requiredWarehouseCodes()`인 `00003/2`만 권위 alias와 대조한다.
6. 두 코드가 모두 `VERIFIED`이면 `14/1` 상태와 무관하게 readiness를 허용한다.
7. 실제 요청 코드는 자신의 `VERIFIED` 상태가 있어야만 `resolve()`를 통과한다.

### 3-2. 실 데이터 건수와 판정

- 현재 required alias: **0건**
- 현재 정상 발행 실표본: **0건**
- R8로 회복됐다고 실측할 수 있는 정상 발행: **0건, 판정 불가**
- 현재 저장된 `00003/2` 활성 slip: **31건**, 전부 `MANUAL`; R8의 estimate 발행 성공 표본이 아니다.

이 PC에서는 required alias 자체가 없어서 R8 전후 모두 `00003/2` 발행이 fail-closed다. 그러므로
“이전 오차단이 실제 사용자에게서 해소됐다”고 주장할 실표본은 없다.

좁은 동작 재현에서는 `00003/2`가 `VERIFIED`이고 `14/1`이 `UNVERIFIED`인 경우 readiness가
`ACCEPTING_TRAFFIC`으로 전이하고 두 required code의 `resolve()`가 성공했다. 그러나 이는
실사용 표본이 아니므로 위 판정을 PASS로 바꾸지 않는다.

## 4. 반대 각도 — 차단돼야 할 것이 통과하는가

### 4-1. 집합에서 빠진 `14/1`

- estimate-app 사용자 생성 코드: `00003/2`만 존재
- 활성 `ESTIMATE` 발행 표본의 `14/1`: **0건**
- 전체 활성 slip의 `source_warehouse_code=14/1`: **0건**
- R8 때문에 새로 조용히 통과한 위험 실데이터: **0건**

readiness가 `14/1`을 보지 않는 것과 요청이 `14/1`을 통과하는 것은 다르다.
`resolve()`는 configured key라는 이유만으로 허용하지 않고, STRICT에서 해당 코드의 verified UUID와
`VERIFIED` 상태가 모두 있어야 반환한다. R8 validator는 `14/1`을 검증하지 않으므로 이 두 코드는
`UNVERIFIED` 또는 기존 설정 오류 상태에 남고, 직접 요청되면 거부된다.

### 4-2. `INVALID_CONFIGURATION` 후 `continue`

R8의 `continue`는 required code인 `00003` 또는 `2`가 consumer map에서 빠진 경우에만 실행된다.
그 코드를 `INVALID_CONFIGURATION`으로 표시한 뒤 다음 code로 넘어가지만, 마지막
`allVerified(requiredWarehouseCodes())`가 false라 readiness는 `REFUSING_TRAFFIC`이다.

따라서 이 분기는 다음의 새 상태를 만든다.

```text
required code 누락
  → 해당 code INVALID_CONFIGURATION
  → verified UUID 제거
  → 전체 required 집합 allVerified=false
  → readiness REFUSING_TRAFFIC
```

즉 “표시만 하고 서비스가 통과”하는 제3의 상태는 만들지 않는다. 반면 계약 밖 configured code는
readiness 대상에서 빠지지만 요청 단위에서는 계속 fail-closed다.

## 5. 증거 무결성

R8 PR 코멘트가 실측으로 제시한 항목을 같은 HEAD에서 다시 확인했다.

```text
WarehouseMappingValidationServiceTest  13 tests · failures 0 · errors 0
WarehouseReadinessLifecycleTest          3 tests · failures 0 · errors 0
WarehouseBootPathConfigurationTest       5 tests · failures 0 · errors 0
합계                                      21 tests · failures 0 · errors 0
Gradle                                    BUILD SUCCESSFUL in 1m 1s
```

`WarehouseCodeMapperStartupValidationTest`도 별도 재실행해 `BUILD SUCCESSFUL in 37s`, XML 기준
8 tests·failures 0·errors 0이었다. PR 코멘트는 이 클래스의 건수를 주장하지 않고 성공만 주장했으므로
수치 충돌이 없다.

Jest의 `axios` 부재 주장도 같은 경로에서 `require('axios')` 종료코드 1과
`Cannot find module 'axios'`로 재현됐다. 이를 테스트 품질 결함으로 세지 않고 원문 재현 여부만 봤다.

GitHub commit API에서 `c58c2e962`의 변경 파일은 6개 전부 `modified`였고 `added`는 0개였다.
따라서 “신규 소스 파일 0” 주장도 재현됐다.

**신규 증거 무결성 결함: 0건.**

## 6. fix 지시서 — 불변식만

이번 라운드에서 실 사용자 도달 결함이 확인되지 않아 신규 fix는 지시하지 않는다. 이후 변경도 아래
불변식을 깨면 안 된다.

1. 전체 readiness가 보장하는 코드 집합은 현재 실 사용자 발행 계약이 생성할 수 있는 코드 집합과 같아야 한다.
2. required code 하나라도 누락·불일치·미검증이면 그 release는 사용자 트래픽을 받아서는 안 된다.
3. readiness 대상에서 제외된 code라도 실제 요청에 들어오면 코드별 권위 검증 없이 통과해서는 안 된다.
4. 계약 밖 code의 부재·오류만으로 정상 required code와 무관한 slip-service 전체를 차단해서는 안 된다.
5. required code가 consumer map에서 빠진 상태는 `INVALID_CONFIGURATION`이며 readiness 비성공이어야 한다.
6. 발행 계약의 생성 가능 코드가 바뀌면 readiness required 집합도 같은 release에서 함께 바뀌어야 한다.
7. `STRICT`의 fail-closed와 `DEV_SUBSTITUTE`의 개발 전용 동작을 유지해야 한다.

## 7. 양방향 RED

### RED-A — 기능 동작

- `00003/2`의 권위 alias가 활성 창고에 올바르게 대응하면 `14/1` alias가 없어도 readiness가 성공해야 한다.
- 위 상태에서 estimate-app의 실제 전표 생성은 전표번호를 반환해야 한다.
- partner-order처럼 권위 warehouse UUID를 직접 전달하는 기존 발행 경로는 정적 alias map을 경유하지 않아야 한다.
- `DEV_SUBSTITUTE` 개발 경로는 외부 alias 조회 없이 계속 동작해야 한다.

### RED-B — 재발 없음

- `00003` 또는 `2`가 consumer map에서 빠지면 `INVALID_CONFIGURATION`이고 readiness는 비성공이어야 한다.
- `00003` 또는 `2`의 alias가 누락·불일치·조회 불가이면 readiness와 해당 발행 요청 모두 실패해야 한다.
- `14/1`을 포함한 비required code가 직접 요청되면 해당 코드가 별도로 권위 검증되지 않은 한 실패해야 한다.
- 향후 UI나 서버 분기가 새 warehouse code를 만들게 되면 그 code가 readiness 계약에서 조용히 빠져서는 안 된다.

## 8. 이번 라운드가 보지 않은 것

- 정상 발행 실표본이 0건이므로 실제 `00003/2` 전표 생성 성공은 실행하지 않았다.
- DB alias import와 신규 전표 생성은 쓰기이므로 실행하지 않았다.
- 라이브 컨테이너 PUT/POST/DELETE, 재빌드, 재시작은 하지 않았다.
- 실제 AWS/RDS/ALB/EC2 release 전환과 운영 데이터는 보지 않았다.
- R8이 고치지 않은 D1 자동 복원 정책과 D2 최초 alias 준비 순서는 판정하지 않았다.
- `phase11-deploy.ps1` parse fail은 제시된 선재 결함 판정을 그대로 받아 다시 세지 않았다.
- 테스트 강도, mock, 문서 과장, 가드 품질은 찾거나 결함으로 보고하지 않았다.
- 전체 테스트 스위트는 실행하지 않았다.

## 9. 신규 파일

- `docs/dev-reports/2026-08-07-1052-sol-r8-reconvergence.md`
