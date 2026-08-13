# #999 S1 — 재고 인스턴스 시리얼키·품질 축 소급 발급 (LUNA)

## 범위와 미적용 사항

- `inventory-service`에 UUID와 분리된 사용자 노출용 `serial_key`와 독립 품질 축 `quality`를 추가했다.
- 기존 `status`(재고상황), UUID PK, 기존 행의 업무 컬럼은 유지했다.
- 기존 행의 빈 serial만 `SI-` 접두사로 소급 발급하고 품질은 `NORMAL(정상)`으로 채웠다.
- QR 이미지/스캐너/모바일/데스크톱 UI는 이번 슬라이스에서 변경하지 않았다.
- 요청받은 정찰 보고서 `docs/dev-reports/2026-08-12-999-stock-instance-recon.md`는 워크트리에 존재하지 않았다. 동일한 좌표와 측정값은 기존 `docs/superpowers/specs/2026-08-12-999-stock-instance-serial-qr.md`에서 확인했다.

## 이슈 코멘트 확인

`gh issue view 999 --comments` 전체 결과: 코멘트 1개(2026-08-06, ewoo14).

```text
시리얼키는 창고 방식 그대로 (접두사만 다르게)
'WH-' + 6자
charset = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
0/1/O/I/L 제외
```

소급 발급과 기본 품질은 개발책임자 요청의 확정값대로 적용했다. 재결정하지 않았다.

## RED → GREEN 원문

### RED — 구현 전

실행:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.domain.StockInstanceSerialQualityTest --no-daemon
```

결과(구현 전):

```text
> Task :services:inventory-service:compileTestJava FAILED
error: cannot find symbol
  symbol:   method getSerialKey()
error: cannot find symbol
  symbol:   variable StockInstanceQuality
error: cannot find symbol
  symbol:   method getQuality()
4 errors
BUILD FAILED
```

이는 테스트 오타가 아니라 구현 전 계약(`serialKey`, `quality`) 부재로 발생한 RED다.

### GREEN — 구현 후

실행:

```text
$env:GRADLE_OPTS='-Xmx1g'; .\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.domain.StockInstanceSerialQualityTest --no-daemon --stacktrace
```

결과:

```text
> Task :services:inventory-service:test
BUILD SUCCESSFUL in 24s
18 actionable tasks: 3 executed, 15 up-to-date
```

검증한 RED 항목은 다음과 같다.

1. 창고 방식 동일 charset·6자리·접두사만 다른 serial 형식: `SI-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}`
2. 신규 품질 기본값: `NORMAL`
3. 100회 생성 distinct serial 수: `100`

## Flyway 번호 선정 근거

읽기 전용 `git ls-tree`와 migration 디렉터리 조사 결과:

```text
현재 브랜치 HEAD inventory latest: V25
main inventory latest:             V25
머지되지 않은 다른 active refs:    V25가 최고
오래된 wip refs:                   V21
```

따라서 이미 적용된 migration을 수정하지 않고 `V26__add_stock_instance_serial_key_and_quality.sql`을 선택했다. V26보다 높은 inventory migration을 가진 ref는 확인되지 않았다.

## Fresh Postgres 검증 원문

공유 DB가 아닌 임시 `postgres:16-alpine` 컨테이너에서 V1~V25를 처음부터 적용하고 fixture 20행을 삽입한 뒤 V26을 적용했다. PowerShell 파이프 dump/restore는 사용하지 않았다.

적용 전 카운트:

```text
 rows_before | preserved_marker | shipped_before
-------------+------------------+----------------
          20 |                1 |             10
```

V26 적용 후:

```text
 rows_after | blank_serials | distinct_serials | normal_quality | preserved_marker | shipped_after
------------+---------------+-----------------+----------------+------------------+--------------
         20 |             0 |              20 |             20 |                1 |           10
```

불변식별 판정:

- 행 수 보존: `20 → 20`
- 빈 serial: `0`
- 중복 serial: `20 distinct / 20 rows`
- 소급 품질 정상: `20`
- 기존 `product_code='KEEP-MODEL'` 보존: `1 → 1`
- 기존 `status='SHIPPED'` 보존: `10 → 10`

### 창고 형식 대조 원문

```text
warehouse     | CS-001
stock_instance| SI-2T46MY
```

`CS-001`은 fresh seed에 이미 존재하는 창고의 실제 code이고, 신규 인스턴스 값은 `SI-` + 6자 혼동방지 charset이다. 실제 생성된 인스턴스 값 20개도 모두 `SI-` 접두사와 동일 charset·6자리 조건을 만족했다.

## 변경 파일

- `StockInstanceQuality.java`: `NORMAL/USED/DAMAGED/REPACKAGED/BOX_DEFECT`
- `StockInstance.java`: `serialKey`, `quality`, 신규 발급기
- `StockInstanceResponse.java`: serial/quality 응답 필드
- `StockInstanceRepository.java`, `StockInstanceService.java`, `StockInstanceController.java`: serial 단건 조회 계약
- `V26__add_stock_instance_serial_key_and_quality.sql`: 컬럼 추가, 빈 값 소급, 품질 기본값, NOT NULL/unique index
- `StockInstanceSerialQualityTest.java`: RED-first 도메인 불변식 테스트

## inventory-service 전체 테스트 원문

실행:

```text
$env:GRADLE_OPTS='-Xmx1g'; .\gradlew.bat :services:inventory-service:test --no-daemon
```

결과:

```text
BUILD SUCCESSFUL in 2m 1s
18 actionable tasks: 1 executed, 17 up-to-date
test result files: 70
tests=544 failures=0 errors=0 skipped=4
```

skipped 4건은 기존 테스트의 환경/fixture 조건이며 이번에 추가한 테스트는 3/3 통과했다. 새 테스트에는 별도 Linux skip 가드가 필요하지 않은 순수 도메인 테스트만 추가했다.

## 못 한 것

- QR 스캐너, QR 이미지 저장, 모바일/데스크톱 화면은 확정된 범위 밖이므로 하지 않았다.
- 지정된 정찰 보고서 파일은 워크트리에 없어서 읽지 못했고, 기존 spec에 남아 있는 동일 정찰 결과를 근거로 삼았다.

## 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
=> 출력 없음 (삭제된 추적 파일 없음)
Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs
=> True (파일 생존)
docker ps -a | Select-String inventory-999-fresh
=> 출력 없음 (격리 컨테이너 제거)
```

임시 fresh Postgres 컨테이너는 검증 직후 제거했고, 별도 임시 디렉터리나 남겨 둔 프로세스는 없다. QR 스캐너/화면은 범위 밖이므로 구현·검증하지 않았다.
