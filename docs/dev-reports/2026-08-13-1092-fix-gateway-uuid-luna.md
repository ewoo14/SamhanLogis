# #1092 S1 fix — gateway·상세 진입·UUID 비노출

- 실행일: 2026-08-13
- 담당: CODEX LUNA
- 브랜치: `feat/1092-estimate-menu-canon`
- 공유 DB 쓰기: 없음

## 원인과 변경

1. `api-gateway`에 `/api/v1/estimates/web-snapshots` 라우트가 없었다. slip-service 컨트롤러의 full path를 유지하는 JWT 라우트를 추가했다.
2. 통합 모델의 웹 snapshot/draft 행 `navigationPath`가 `null`이었다. 두 웹 행에 각각 읽기 전용 상세 route를 연결하고, 상세 화면은 같은 UUID-free 요약 API로 대상을 찾는다.
3. 기존 GET 견적 목록·상세 응답 DTO가 내부 UUID와 line UUID를 직렬화했다. GET 전용 `EstimateReadResponse`·`EstimateDetailReadResponse`를 추가했다. 상세 line의 `id`는 line 번호 문자열이고 product/estimate/partner/converted-slip/requester UUID는 제외했다. bundle `instanceKey`도 상세 읽기 응답에서 제외했다. 기존 쓰기 응답 DTO는 변경하지 않았다.

## RED → GREEN 원문

### 불변식 1·2 — 웹 건수와 상세 진입

추가한 RED 테스트 실행:

```text
$ npm exec vitest run src/renderer/routes/estimateUnifiedListModel.test.ts
FAIL (8 tests | 1 failed)
× 웹 저장 행은 종합견적서와 주문서 모두 상세 진입 경로를 가진다
  → expected null to be '/sales/estimates/web-snapshots/snapshot-1'
```

변경 후:

```text
$ npm exec vitest run src/renderer/routes/estimateUnifiedListModel.test.ts src/renderer/routes/EstimateListPage.test.tsx
Test Files  2 passed (2)
Tests       18 passed (18)
```

실측 원문(직전 라이브 QA의 공유 DB read-only 집계):

```text
quote_snapshots 4 + partner_order_drafts 11 = 웹 저장분 15건
estimates 45 + partner_orders 4 = 변경 전 기존 목록 49건
estimates 45 + partner_orders 4 + quote_snapshots 4 + partner_order_drafts 11 = 변경 후 기대 목록 64건
```

코드 모델 테스트도 `웹 종합견적 4건`, `웹 주문서 11건`, `웹 합계 15건`, 기존 fixture `45 + 7 = 52건`을 각각 확인한다. 공유 DB에 다시 쓰거나 live 서비스 JAR를 교체하는 QA는 이번 라운드에 실행하지 않았으므로, **수정 후 실 GUI 화면의 64건·gateway 200·상세 URL은 아직 라이브 재확정하지 못했다.**

### gateway 404 — 불변식 1

RED:

```text
$ .\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.config.S27SlipRouteContractTest --no-daemon
S27SlipRouteContractTest > webEstimateSnapshotRoutePreservesFullControllerPath() FAILED
2 tests completed, 1 failed
```

GREEN:

```text
BUILD SUCCESSFUL
S27SlipRouteContractTest: 2 tests completed, 0 failed
```

### UUID 전수 본문 검사 — 불변식 3

RED 테스트는 특정 필드가 아니라 Jackson 직렬화된 **전체 본문 문자열**에 대해 다음 정규식을 검색했다.

```text
(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
```

초기 실행 원문:

```text
EstimateReadResponseUuidContractTest > listResponseBodyContainsNoUuidAnywhere() FAILED
EstimateReadResponseUuidContractTest > detailResponseBodyContainsNoUuidAnywhereIncludingLines() FAILED
2 tests completed, 2 failed
```

DTO 수정 후 원문:

```text
$ .\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.estimate.web.dto.EstimateReadResponseUuidContractTest --no-daemon
BUILD SUCCESSFUL
2 tests completed, 0 failed
```

이 검사는 목록, 상세, 중첩 line, bundle option을 모두 JSON 본문으로 직렬화해 검사하며 bundle 내부 `instanceKey`도 안전 응답에서 제외했는지 확인했다.

## 검증

```text
$ npm run typecheck  # clients/desktop
exit 0

$ .\gradlew.bat :services:partner-order-service:compileJava :services:slip-service:compileJava --no-daemon
BUILD SUCCESSFUL

$ .\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.config.S27SlipRouteContractTest --no-daemon
BUILD SUCCESSFUL

$ .\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.estimate.web.dto.EstimateReadResponseUuidContractTest --no-daemon
BUILD SUCCESSFUL
```

변경 서비스 전체 테스트는 아래처럼 시도했으나 둘 다 120초 제한으로 완주하지 못했다.

```text
$ .\gradlew.bat :services:slip-service:test --no-daemon
command timed out after 124043 milliseconds (exit 124)

$ .\gradlew.bat :services:partner-order-service:test --no-daemon
command timed out after 124041 milliseconds (exit 124)
```

따라서 backend 전체 테스트 통과를 주장하지 않는다. 타임아웃으로 남은 이번 실행의 Gradle Java PID는 정리했고, 공유 Docker Desktop/기존 사용자 프로세스는 건드리지 않았다.

## 라운드 종료 점검

```text
git ls-files --deleted: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: 추적 파일·실파일 존재
공유 DB 쓰기: 0건
임시 컨테이너 생성: 0건
이번 라운드에서 시작된 잔여 Gradle Java 프로세스: 0건
```

`S26 ??? ???` 및 해당 깨진 한글 잔재는 #1176 소관으로 건드리지 않았다.
