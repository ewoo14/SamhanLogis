# PR #1241 GAS 파리티 배치 1 — 라운드 fix 보고

## ① 환경 확인

요청 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # 7b4c94fb4
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain             # 🚨 지금 머지 충돌 상태다 (아래 1번 참조)
```

실행 결과:

```text
7b4c94fb44db354f311d90b9235b6b32da8a66eb
feat/gas-parity-order-web
UU services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java
```

상태 출력에는 다른 동시 라운드의 변경도 다수 있었으며, `git add`, `git commit`, `git push`는 실행하지 않았다.

## ② 충돌 해소 내용과 판단 근거

`ProductClient.toProductSummary()`와 `categoryId` 해석을 공용 `OpaqueUuidDecoder.decode()`로 통일하고 private `decodeOpaqueUuid()` 및 관련 import를 제거했다 (`ProductClient.java:249,254`). 공용 구현은 22자 길이, URL-safe 허용문자, 16바이트, 순수 숫자 22자리까지 검증하며 오류 문구도 통일한다. private 구현이 추가로 수용하던 정상 계약 입력은 확인되지 않았다. 따라서 공용 쪽이 정본이며 500 재발 방지에 유리하다.

파일 본문에서 충돌 마커는 제거되었다. 단, 사용자 지시의 `git add 금지` 때문에 인덱스의 `UU` 표시는 남아 있다.

## ③ RED 원문 2건

결함 1:

```text
BundleExpanderR13Test > ac060cs6pbh1sy_set_allocation_matches_gas_and_remainder() FAILED
org.opentest4j.AssertionFailedError at BundleExpanderR13Test.java:64
2 tests completed, 1 failed
BUILD FAILED
```

결함 2:

```text
× 폐기된 구글 시트 동기화 화면 > 실행 가능한 동기화 화면으로 오인되지 않도록 폐기 상태를 반환한다
→ isSheetSyncRetired is not a function
Test Files 1 failed
Tests 1 failed | 4 passed
```

## ④ 근원

`BundleExpander.java:335`에서 AC060의 구성품 원가 합계가 세트 합계와 같으면 `redistribute()`가 즉시 반환했다. 이 경로가 구성품 kind와 금액의 GAS 역할 교정을 건너뛰었다. 정렬/인덱스 매칭 문제가 아니다.

`SheetSyncPage.tsx`는 `triggerSync` mutation, 「지금 동기화」 버튼, 일반 오류 문구를 그대로 렌더링했다. 백엔드의 의도된 410을 폐기 상태로 해석하지 않는 FE 도달 결함이었다.

## ⑤ 고친 것

- AC060CS6PBH1SY의 단일 INDOOR/OUTDOOR 쌍은 합계 조기 반환 전에 kind 역할로 금액을 교정한다.
- 폐기 화면은 안내 전용 상태를 반환하며 실행 버튼과 재시도 오류 경로가 사용자에게 노출되지 않는다.
- AR06D1150HZS는 기존 원가/역할 매칭을 유지한다.

## ⑥ 세트 계열 라벨-금액 짝 전수표

이번 워크트리에서 계열 배분을 다루는 실측 대상은 R15가 지정한 2세트이며, 테스트 스위트도 2세트를 전수 검증한다.

| 세트 | 라벨 | 기대 금액 | 수정 후 단위 테스트 | 판정 |
|---|---|---:|---:|---|
| AC060CS6PBH1SY | 실내기 AC060CN6PBH1 | 925,050 | 925,050 | 일치 |
| AC060CS6PBH1SY | 실외기 AC060CXAPBH1 | 616,975 | 616,975 | 일치 |
| AC060CS6PBH1SY | 패널 PC6NUNK1NW | 104,060 | 104,060 | 일치 |
| AC060CS6PBH1SY | 리모컨 AR-EH05 | 13,915 | 13,915 | 일치 |
| AR06D1150HZS | 실내기 AR06D1150HZN | 148,000 | 148,000 | 일치 |
| AR06D1150HZS | 실외기 AR06D1150HAX | 222,000 | 222,000 | 일치 |

## ⑦ 합계 일치 확인

단위 테스트에서 AC060은 `925,050 + 616,975 + 104,060 + 13,915 = 1,660,000`, AR06D는 `148,000 + 222,000 = 370,000`을 검증했고 통과했다. 라이브 저장 DB 합계는 이번 라운드에서 PR HEAD 격리 백엔드가 없어 실측하지 못했다.

## ⑧ 시트 동기화 화면 처리

`SheetSyncPage.tsx:51-105`에서 폐기 상태 함수와 안내 화면을 추가했다. 제목은 「구글 시트 동기화 폐기」, 안내는 DB 카탈로그 기준 사용이며 실행 가능한 버튼은 없다.

## ⑨ 미리보기 500 미재발 실HTTP

미실행. 5175, 5184, 28088, 28084 포트가 모두 연결되지 않았고, 실행 중 공유 Docker 서비스는 PR HEAD JAR가 아니다. PR HEAD JAR 격리 배포와 SHA-256 대조 없이 실HTTP 성공을 주장하지 않는다.

## ⑩ 캡처

미실행. Playwright 스펙은 `clients/desktop` 내부에 있으며 `resolveQaShotsDir()`를 사용하지만, 실 앱/PR HEAD 백엔드가 기동되지 않아 캡처 조건을 충족하지 못했다. 따라서 이번 보고서에 실측 캡처를 첨부하지 않는다.

## ⑪ 회귀

- 통과: `gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.service.BundleExpanderR13Test` — BUILD SUCCESSFUL, 2/2.
- 통과: `clients/desktop`의 SheetSyncPage 테스트 — 5/5.
- 통과: `npx tsc -p tsconfig.node.json --noEmit`, `npx tsc -p tsconfig.web.json --noEmit`.
- 차단: partner-order-service 테스트는 동시 라운드가 이미 추가한 `ProductClientTest` 중복 `opaque(UUID)` 때문에 `compileTestJava` 실패.
- 차단: desktop 전체 typecheck는 미추적 R15 스펙이 공식 QA 집합에 포함되어 집합 가드 실패. 금지된 `git add`로 우회하지 않았다.

## ⑫ 증거 무결성 자기 고지

실측으로 표기한 것은 이번 실행에서 실제로 확인한 테스트 출력과 포트 연결 결과뿐이다. 라이브 화면·HTTP·저장 DB·캡처는 확인하지 못했으므로 실측이라고 쓰지 않았다. R15의 기존 실측값은 이번 실행에서 재측정한 값이 아니며, 위 표의 기대값/단위 테스트 결과와 구분했다.

## ⑬ 프로세스 회수

이번 라운드가 기동한 장기 프로세스/격리 컨테이너는 0개이며 회수 잔여도 0개다. Gradle/Node 테스트 프로세스는 명령 종료와 함께 종료됐다. 기존 공유 Docker 스택은 다른 라운드 자산이므로 중지하지 않았다.

## ⑭ `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/admin/SheetSyncPage.test.ts
 M clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx
 M services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java
 M services/product-service/src/test/java/com/samhanair/logis/product/service/BundleExpanderR13Test.java
UU services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java
?? clients/desktop/playwright/1241-r15-adversarial-real-qa/
?? docs/qa/1241-r15-adversarial/
```

위 블록은 이번 라운드 관련 행만 발췌한 것이며, 동시 라운드의 기존 staged/unstaged 행이 함께 존재한다.
