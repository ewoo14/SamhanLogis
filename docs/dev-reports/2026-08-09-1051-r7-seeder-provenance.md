# PR #1129 R7 — DeliveryBatchSeeder provenance 수렴

측정 시각: 2026-08-09 09:11~09:13 KST  
대상 HEAD: `8a626012e`  
제약: commit/push 없음, 다른 워크트리·메인 변경 없음, 공유 DB 미접근, 기존 끊긴 행·QA 잔재 미수정/미삭제.

## 판정

R6 진단은 코드와 격리 실행에서 재현됐다. `DeliveryBatchSeeder`가 상태·삭제 여부·유형·기사전화만으로 후보를 수집하면 실제 전표가 배치에 연결될 수 있었다. 이번 수정은 R5 `SlipLockSeeder`와 같은 식별 축인 **시더가 재생한 정확한 전표번호 집합 + `created_by=system`**을 적용했다.

## ① 적용한 축과 R5 대조

| 항목 | 근거 |
|---|---|
| 배치 후보 수집 | `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/DeliveryBatchSeeder.java:65-68,101-105` |
| provenance 집합 생성 | `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:565-583` — `buildSpecs()` 순서, 날짜별 유형별 순번, `formatSlipNo()` 재생 |
| repository 계약 | `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:529-539` |
| R5 정본 대조 | `SlipLockSeeder.java:49-79`는 `confirmedSeedSlipNosByType()` 결과를 `SlipType + slipNo 집합 + created_by=system + status`로 조회한다. R7도 같은 `SlipType + slipNo 집합 + created_by=system + status` 형태를 사용하고, lock 전용 조건만 제외했다. |

R7의 후보 집합은 `SlipSeeder`의 모든 OUTBOUND 중 `SHIPPING`, `DELIVERED`, `CONFIRMED` spec을 상태별로 재생한다. 격리 실행에서 이 집합은 19건이었고, 기존의 넓은 `findAllByStatusAndIsDeletedFalse(..., unpaged())` 수집은 제거됐다.

### RED-A / RED-B

회귀 테스트: `services/slip-service/src/test/java/com/samhanair/logis/slip/seed/DeliveryBatchSeederProvenanceTest.java:21-46`

RED 원문 — 수정 전 구현:

```text
DeliveryBatchSeederProvenanceTest > links_only_system_seed_slips_and_still_creates_all_thirty_batches() FAILED
    org.mockito.exceptions.verification.NeverWantedButInvoked at DeliveryBatchSeederProvenanceTest.java:43
1 test completed, 1 failed
BUILD FAILED
```

실패 의미는 기존 넓은 후보 목록의 첫 전표가 업무 전표 mock인데도 `slipRepository.save(businessSlip)`가 호출됐다는 것이다.

GREEN 원문 — 최소 수정 후:

```text
./gradlew :services:slip-service:test --tests '*DeliveryBatchSeederProvenanceTest' --rerun-tasks
BUILD SUCCESSFUL in 39s
1 test completed, failures 0
```

RED-B도 같은 테스트의 `verify(batchRepository, times(30)).saveAndFlush(...)`로 고정했다. 격리 첫 실행에서 실제 `delivery_batches=30`, 재기동 후 `delivery_batches=30`으로 동시에 GREEN이었다.

## ② 격리 실행 연결 전표 전수

공유 DB는 읽지 않았다. 아래는 `sol-r7-1051-net`의 일회용 PostgreSQL `slip_db`에 첫 실행 직후 수행한 SQL 원문 집계다.

```text
slips | linked_slips | non_system_linked | system_linked | active_locks | system_locks
------+--------------+-------------------+---------------+--------------+-------------
  100 |           19 |                 0 |            19 |            5 |           5
```

연결 전표 전수. 모두 `SlipSeeder`가 재생한 19개 `(status, slipNo)` 집합에 속하고, `created_by=system`이며 생성 시각이 본 시드 실행 시각이다.

| 전표번호 | 상태 | created_by | created_at (KST) |
|---|---|---|---|
| 2026/02/03-1 | SHIPPING | system | 2026-08-09 09:11:55.558433 |
| 2026/02/04-1 | SHIPPING | system | 2026-08-09 09:11:55.569291 |
| 2026/02/05-1 | SHIPPING | system | 2026-08-09 09:11:55.580486 |
| 2026/02/06-1 | SHIPPING | system | 2026-08-09 09:11:55.588342 |
| 2026/02/07-1 | SHIPPING | system | 2026-08-09 09:11:55.597486 |
| 2026/02/08-1 | DELIVERED | system | 2026-08-09 09:11:55.605968 |
| 2026/02/09-1 | DELIVERED | system | 2026-08-09 09:11:55.616519 |
| 2026/02/10-1 | DELIVERED | system | 2026-08-09 09:11:55.631283 |
| 2026/02/11-1 | DELIVERED | system | 2026-08-09 09:11:55.643027 |
| 2026/02/12-1 | DELIVERED | system | 2026-08-09 09:11:55.651176 |
| 2026/02/13-1 | DELIVERED | system | 2026-08-09 09:11:55.660974 |
| 2026/02/14-1 | DELIVERED | system | 2026-08-09 09:11:55.671672 |
| 2026/02/15-1 | CONFIRMED | system | 2026-08-09 09:11:55.682423 |
| 2026/02/16-1 | CONFIRMED | system | 2026-08-09 09:11:55.689724 |
| 2026/02/17-1 | CONFIRMED | system | 2026-08-09 09:11:55.698053 |
| 2026/02/18-1 | CONFIRMED | system | 2026-08-09 09:11:55.708079 |
| 2026/02/27-1 | DELIVERED | system | 2026-08-09 09:11:55.827532 |
| 2026/02/28-1 | DELIVERED | system | 2026-08-09 09:11:55.838856 |
| 2026/03/10-1 | DELIVERED | system | 2026-08-09 09:11:55.949146 |

전수 SQL의 핵심 결과:

```text
non_system_linked = 0
system_linked = 19
```

따라서 실 업무 provenance 전표가 시드 배치에 연결된 수는 **0건**이다. 첫 실행 로그도 `매핑 가능 슬립 19건 발견`으로 SQL 전수와 일치한다.

## ③ 양방향 보존

첫 실행 로그 원문:

```text
[SlipSeeder] 완료 — 신규 100건, skip 0건 (총 100건)
[DeliveryBatchSeeder] 매핑 가능 슬립 19건 발견 (SHIPPING/DELIVERED/CONFIRMED + driver 보유)
[DeliveryBatchSeeder] 완료 — 신규 30건, skip 0건 (총 30건)
[EstimateSeeder] 완료 — 신규 40건, skip 0건 (총 40건)
[SlipLockSeeder] 완료 — 5건 lock 처리 (시더 대상 집합)
```

재기동 로그 원문:

```text
[SlipSeeder] 완료 — 신규 0건, skip 100건 (총 100건)
[DeliveryBatchSeeder] 매핑 가능 슬립 19건 발견 (SHIPPING/DELIVERED/CONFIRMED + driver 보유)
[DeliveryBatchSeeder] 완료 — 신규 0건, skip 30건 (총 30건)
[EstimateSeeder] 완료 — 신규 0건, skip 40건 (총 40건)
[SlipLockSeeder] 완료 — 0건 lock 처리 (시더 대상 집합)
```

최종 SQL:

```text
delivery_batches | active_delivery_batches
-----------------+------------------------
               30 |                     30

active_locks=5, system_locks=5
```

R5 보존 조건도 유지됐다: 실 업무 lock 0건(`created_by <> system` 활성 lock 0), lock 5건 전부 `created_by=system`, lock 번호 집합은 기존 파생 집합, placeholder 배선은 건드리지 않았다.

## ④ 새로 돌기 시작한 시더 전수

`SAMHAN_SLIP_SEED_TEST_DATA=true` + `dev`에서 새로 도달하는 slip-service runner를 코드 전수 확인했다.

| 시더 이름 | 대상 수집 술어 | provenance 제한 | 실 업무 전표에 닿을 수 있나 |
|---|---|---|---|
| `SlipSeeder` | 자체 `buildSpecs()`를 순회해 전표를 새로 생성하고 `(SlipType, slipNo)` 존재 여부로 멱등 skip | 있음 — 생성 산물이 자체 spec/`created_by=system` | 아니오. 새 전표 생성 경로이며 기존 업무 전표 수집 없음 |
| `DeliveryBatchSeeder` | `SlipType.OUTBOUND + SlipSeeder 재생 slipNo 집합 + created_by=system + status + is_deleted=false`, 이후 driverPhone 비공백 | 있음 — R5와 같은 축 | 아니오. 격리 `non_system_linked=0` |
| `EstimateSeeder` | 자체 결정적 estimate 번호를 40건 순회해 견적을 생성 | 전표 대상 수집 없음 | 아니오. Slip 조회·수정 없음 |
| `SlipLockSeeder` | `SlipType + confirmed seed slipNo 집합 + created_by=system + CONFIRMED + lock=false + active` | 있음 — R5 정본 | 아니오. 격리 system lock 5, non-system lock 0 |

`DeliveryBatchSeeder` 외에 같은 병으로 전표를 넓게 수집하는 새 시더는 발견되지 않았다. `EstimateSeeder`는 전표와 무관하고, `SlipLockSeeder`는 R5에서 이미 동일 축을 사용한다.

## ⑤ 격리 환경·회수 원문

사용한 일회용 자원:

```text
network: sol-r7-1051-net
containers: sol-r7-1051-postgres / redis / rabbitmq / eureka / product / slip
images: sol-r7-1051-product:head / sol-r7-1051-slip:head
databases: 격리 postgres writable layer의 product_db + slip_db
```

초기 컨테이너 배선에서 Eureka가 product 인스턴스를 컨테이너 ID로 등록해 발생한 원문도 기록한다. 이는 애플리케이션 시더 결함이 아니라 격리 배선 문제였고, 공유 자원에는 접근하지 않았다.

```text
ProductClient lookup failed: I/O error ...
Caused by: java.net.UnknownHostException: b36163fc2136
[DeliveryBatchSeeder] 시딩을 건너뜁니다 — 선행 SlipSeeder가 성공하지 않았습니다. 상태=FAILED
```

Eureka registry를 초기화하고 `hostName=product-service`로 재기동한 뒤 정상 실행했다. 회수 명령 및 원문:

```text
docker rm -f sol-r7-1051-slip sol-r7-1051-product sol-r7-1051-eureka sol-r7-1051-rabbitmq sol-r7-1051-redis sol-r7-1051-postgres
sol-r7-1051-slip
sol-r7-1051-product
sol-r7-1051-eureka
sol-r7-1051-rabbitmq
sol-r7-1051-redis
sol-r7-1051-postgres

docker network rm sol-r7-1051-net
sol-r7-1051-net

docker image rm sol-r7-1051-slip:head sol-r7-1051-product:head
Deleted: sha256:6dd3368bc2cb20c05803126b276c09d3111dd077124f7a45fc2ff96dfde86e0d
Deleted: sha256:aeab803713a15e17482481e41714398dcb15d63def43ec1d122d8e817b31f299

containers=0
networks=0
images=0
```

named volume은 만들지 않았다. `docker volume ls`에서도 `sol-r7-1051` 잔존 이름은 0건이었다.

## 관련 검증

```text
./gradlew :services:slip-service:test --tests '*DeliveryBatchSeederProvenanceTest' --rerun-tasks
BUILD SUCCESSFUL

./gradlew :services:slip-service:test --tests '*Seeder*' --rerun-tasks
13 tests completed, failures 0, errors 0, skipped 0
BUILD SUCCESSFUL in 1m 15s

./gradlew :services:slip-service:bootJar --rerun-tasks
exit 0
```

## 신규 파일

- `services/slip-service/src/test/java/com/samhanair/logis/slip/seed/DeliveryBatchSeederProvenanceTest.java`
- `docs/dev-reports/2026-08-09-1051-r7-seeder-provenance.md`

수정 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/DeliveryBatchSeeder.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/seed/SeederDependencyGateTest.java`
