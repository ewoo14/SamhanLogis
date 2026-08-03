# #1035 창고 UUID 기동 검증 — 라이브QA (PM 직접 실행)

- 실행일: 2026-08-02
- 실행자: PM (루트)
- 대상: `fix/1035-warehouse-uuid-boot` HEAD 로 빌드한 `slip-service.jar`
- 실행 방식: **standalone jar + 실 PostgreSQL(`slip_db`)**, 포트 `18186`

## 왜 공유 스택에 배포하지 않았는가

`api-gateway` 와 `samhan-slip-service` 는 **전 트랙 공유**다. 이 시각 다른 11개 트랙이 같은 스택 위에서 돌고 있어,
이 브랜치를 배포하면 다른 트랙의 검증이 조용히 이 브랜치 코드를 돌게 된다(실측 전례 있음).

그래서 **별도 포트의 standalone jar** 로 돌렸다. Flyway 와 `ddl-auto` 는 껐다 — 공유 스키마를 건드리지 않기 위해서다.

```text
-Dspring.flyway.enabled=false -Dspring.jpa.hibernate.ddl-auto=none
```

## CASE 1 — 운영과 동일한 정상 env

```text
-DWAREHOUSE_UUID_HQ=11111111-1111-1111-1111-000000000001
-DWAREHOUSE_UUID_HUBAL=11111111-1111-1111-1111-000000000002
-DWAREHOUSE_UUID_ANSEONG=11111111-1111-1111-1111-000000000003
-DWAREHOUSE_UUID_CHANGWON=11111111-1111-1111-1111-000000000004
```

```text
INFO  c.s.l.slip.publish.WarehouseCodeMapper : warehouse-code-map 로드: 4 entries
INFO  c.s.logis.slip.SlipServiceApplication  : Started SlipServiceApplication in 20.909 seconds
```

```text
GET /actuator/health → 200 · {"status":"UP"}     (기동 6초)
```

**PASS** — 정상 설정에서 막히지 않는다. 4건 전부 로드됐다.

## CASE 2 — 형식 오류 UUID 1건 주입

`WAREHOUSE_UUID_ANSEONG=not-a-uuid` (나머지 3개는 정상)

```text
Caused by: java.lang.IllegalStateException: 창고 매핑 기동 검증 실패: 창고코드 '14'
프로세스 종료코드 = 1
```

**PASS** — 기동이 차단되고, **어느 창고코드가 문제인지 정확히 지목**한다.
`14` = 안성 (`application.yml` 의 `"[14]": ${WAREHOUSE_UUID_ANSEONG}`). 잘못 넣은 그 항목이다.

## CASE 3 — 창고 UUID 환경변수 전부 미설정

```text
Caused by: java.lang.IllegalStateException: 창고 매핑 기동 검증 실패: 창고코드 '00003'
프로세스 종료코드 = 1
```

**PASS** — placeholder 가 치환되지 않은 채로 기동되지 않는다.
`00003` = 본사, 즉 맵의 첫 항목에서 즉시 걸린다.

이 PR 이전에는 `application.yml` 에 `${WAREHOUSE_UUID_HQ:11111111-…}` 형태의 **기본값**이 있어
환경변수를 안 넣어도 조용히 기동됐다. 그것이 이 이슈의 출발점이다.

## 🚨 이번에 확인하지 못한 표면 — 정직하게 남긴다

**런타임 `resolve()` 를 실 전표 발행 화면으로 통과시키지 못했다.**

standalone 직결 호출은 `403`(Content-Length 0, Spring Security 단계)으로 끊긴다 —
게이트웨이가 주입하는 헤더 없이 서비스에 직접 쏘았기 때문이며, 이 PR 과 무관한 구조다.
게이트웨이를 경유하면 **공유 스택의 main 기반 컨테이너**로 가므로 이 브랜치를 검증하지 못한다.

```text
POST :18186/api/v1/slips/from-partner-order  (JWT 있음)  → 403 · 본문 없음
POST :8080/api/v1/slips/from-partner-order   (게이트웨이) → 500 · main 배포본이 응답
```

- 다만 `resolve()` 는 `@PostConstruct` 가 검증한 **같은 맵**에 `UUID.fromString` 을 다시 부른다.
  기동 시 4건 전부 파싱에 성공했으므로 형식 사유로 실패할 수 없다.
- **GUI 전표 발행 QA 는 이 브랜치를 공유 스택에 배포해야 가능**하다. 다른 트랙이 비는 시점(머지 직전)에 수행한다.
