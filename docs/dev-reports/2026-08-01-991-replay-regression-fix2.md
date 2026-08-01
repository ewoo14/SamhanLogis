# 2026-08-01-991 재시도 회귀 수정 보고서

## 확인 10 — 임시 진단물 제거 확인

검사 명령에서 `replay-diagnostic`, `System.out`, `println` 검색 결과는 제품 코드에 없었다. 남은 변경은 회귀 테스트와 실제 수정 코드뿐이며, 진단용 임시 로그는 남기지 않았다.

## 확인 9 — 확인 5 절차의 실 DB 재실행

수정된 현재 소스로 `slip-service` jar를 만들고, 기존 공유 Docker/Postgres 환경에서 `samhan-slip-service`만 재빌드·재기동했다. 확인 5의 기존 전표 `2026/05/31-5`에 대응하는 실제 DB 행과 기존 Idempotency-Key를 읽어, 원 주문 라인·수량 2·HQ-001·원 단가 2,400,000·source order line을 사용해 동일 요청을 다시 보냈다. 새 전표 발행이나 DB 쓰기는 발생하지 않는 replay 경로다.

실행 요청 핵심:

```text
POST http://127.0.0.1:18086/api/v1/slips/from-partner-order
Idempotency-Key: <기존 전표의 키>
partnerOrderId: <기존 전표의 source_id>
ioDate: 20260531
partnerCode: P-2026-0004
warehouseCode: HQ-001
lines: productCode=AC100CNCDEH-76, qty=2, unitPriceVat=2400000.00,
       remarks=Seed sample remark #1, sourceOrderLineId=<기존 라인 ID>
categoryKey는 요청에서 생략
```

실 HTTP 출력 원문(사용자 비공개 UUID/키는 기존 보고서 규칙대로 생략):

```text
HTTP_STATUS:200
{"success":true,"code":"OK","message":"성공","data":{"slipNo":"2026/05/31-5","status":"SENT","sourceType":"PARTNER_ORDER","idempotentReplay":true},...}
```

판정: 구 저장 규약의 `unit_price_with_vat=unit_price×1.1` 라인이 있는 실제 전표에서 동일 전표의 200 replay와 `idempotentReplay=true`를 확인했다.

## 확인 8 — 실 DB 검증 환경 확인

`docker ps` 원문에서 `samhan-slip-service`가 `127.0.0.1:18086->8086`으로 실행 중이고, `samhan-postgres`가 `5432`로 실행 중임을 확인했다. 기존 실 DB와 현재 실행 중인 slip-service를 사용하되, 수정 소스를 반영하기 위해 slip-service 이미지만 재빌드/재기동한 뒤 확인 5의 동일 요청을 다시 보낸다.

## 확인 7 — slip-service 전체 테스트

실행 명령:

```text
PS> .\gradlew.bat :services:slip-service:test
```

결과 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 4m 4s
18 actionable tasks: 1 executed, 17 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

종료 시 JPA/Hikari shutdown 로그가 출력되었고 실패 요약은 없었다.

## 확인 6 — 전체 테스트 잠금 원인 확인

재실행 출력 원문:

```text
Execution failed for task ':services:slip-service:test'.
> java.io.IOException: Unable to delete directory 'C:\dev\Samhan-Public\.claude\worktrees\t991\services\slip-service\build\test-results\test\binary'
  Failed to delete ... output.bin
BUILD FAILED in 11s
```

프로세스 확인 결과 워크트리의 Gradle test daemon/worker PID 24700, 67920이 남아 있었고, 해당 두 프로세스만 종료했다.

## 확인 5 — slip-service 전체 테스트 1차 실행

실행 명령:

```text
PS> .\gradlew.bat :services:slip-service:test
```

출력 원문:

```text
Script running with cell ID 32
...
Script error:
Exit code: 124
command timed out after 124027 milliseconds
```

1차 실행은 실패 단정이 아니라 실행 도구의 124초 제한으로 종료되었다. 전체 테스트를 더 긴 제한으로 재실행한다.

## 확인 4 — 수정 후 회귀 테스트 GREEN

실행 명령:

```text
PS> .\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest

> Task :services:slip-service:test

BUILD SUCCESSFUL in 8s
18 actionable tasks: 2 executed, 16 up-to-date
```

구 저장 규약 테스트를 포함한 `SlipPublishFingerprintTest`가 통과했다.

## 판단 및 수정 방향

구 전표의 `category_key`가 null이고 당시 audit fingerprint에도 category가 없으므로, 구 전표에 대해 category가 다른 요청을 구분할 관측 정보가 저장되어 있지 않다. 따라서 A와 C를 구 저장 데이터 전체에 동시에 만족시키는 것은 불가능하다. 현재/신규 저장 전표는 category를 포함한 현재 fingerprint가 먼저 구분하므로 C를 유지할 수 있다. legacy replay 경로에서는 A를 우선해 category 비교를 제거하고, 구 가격 규약(`요청 unitPriceVat × 1.1`) 또는 현재 규약(직접 일치)을 모두 정상 재시도로 인정한다. 이 선택의 대가는 category를 저장하지 않은 구 전표에 한해 서로 다른 category 요청이 같은 전표로 replay될 수 있다는 점이다.

## 확인 2 — 원인 추적

`SlipPublishService.linesMatch()`는 요청이 `unitPriceVat`를 사용하면 저장값 `line.getUnitPriceWithVat()`를 요청값과 직접 비교한다. 현재 저장된 구 규약 라인은 공급단가 100에 대해 VAT 포함 저장값 110이므로, 동일 요청의 `unitPriceVat=100`과 110을 비교해 false가 된다. `categoryKey` 비교도 현재 포함되어 있어 구 라인의 null과 재시도 요청의 category 값이 다를 때 별도 실패 원인이 된다.

## 확인 3 — 실패 테스트 RED

구 저장 규약을 직접 모사해 `unitPrice=10`, `unitPriceWithVat=11`, `categoryKey=null`인 저장 라인을 만들고, 동일 재시도 요청의 VAT 단가 10을 `linesMatch()`에 넣는 테스트를 추가했다.

실행 명령:

```text
PS> .\gradlew.bat :slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest

FAILURE: Build failed with an exception.

* What went wrong:
Cannot locate tasks that match ':slip-service:test' as project 'slip-service' not found in root project 'samhan-public'.
```

프로젝트 경로를 확인한 결과 실제 task 경로는 `:services:slip-service:test`이다. 위 출력은 테스트 실패 원인이 코드가 아니라 잘못된 Gradle 경로였으므로, 올바른 경로로 RED를 다시 확인한다.

올바른 명령의 RED 출력 원문:

```text
> Task :services:slip-service:test

SlipPublishFingerprintTest > 구_저장_규약의_VAT포함단가도_동일_재시도로_판정한다() FAILED
    org.opentest4j.AssertionFailedError at SlipPublishFingerprintTest.java:39

> Task :services:slip-service:test FAILED
7 tests completed, 1 failed

FAILURE: Build failed with an exception.
Execution failed for task ':services:slip-service:test'.
> There were failing tests.
```

RED 원인은 구 저장값 11과 재시도 요청값 10을 직접 비교하는 현재 구현이다.

## 확인 1 — 기존 검토 보고서 확인

`docs/dev-reports/2026-08-01-991-sol-review.md`를 읽었다. 핵심 재현은 기존 DB 전표 `2026/05/31-5`에 동일 요청을 재시도할 때 변경 전은 HTTP 200 replay, 현재 수정은 HTTP 409 conflict이며, 해당 전표의 23개 라인이 `unit_price_with_vat = unit_price × 1.1`인 구 저장 규약이라는 내용이다. `categoryKey`는 기존 활성 라인 2,791건 전부가 null이다.
