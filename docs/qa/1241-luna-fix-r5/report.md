# PR #1241 CODEX LUNA R5 수정 보고서

- 브랜치: `feat/gas-parity-order-web`
- 작업일: 2026-08-17 KST
- 커밋·push·add: 수행하지 않음

## ① 옵션 의미와 판정

레거시 `getPriceIncData_()`와 이슈 #1140은 `인상 전 단가`/`단가변동`을 카테고리별 옵션·기본값 축으로 보존한다. 그러나 실제 변동DC의 할인 기준가는 제품의 현행 `outboundPrice`이며, desktop·dc-config는 이 값을 사용한다. `releasePrice`는 baseline 응답에 남아 있던 역사/표시 가격이라 실제 DC 기준가로 재적용하면 기본 ON에서만 화면이 갈라진다.

따라서 **㉠ estimate-app baseline 소비를 `outboundPrice` 우선으로 수정**했다. 옵션 자체와 기본값, 옵션 OFF 경로는 제거하지 않았다.

## ② RED 원문

수정 전 `npm test -- --runInBand test/dc-price-parity.test.js`:

```text
FAIL test/dc-price-parity.test.js
Expected: 2607000
Received: 2929300
Tests: 1 passed, 1 failed
```

## ③ 고친 내용

- product-service `price-baseline` 응답에 현재 제품 `outboundPrice`를 추가했다.
- estimate-app `priceIncData()`가 `outboundPrice || releasePrice`를 사용하도록 변경했다.
- 단가변동 옵션 OFF/ON 양쪽에서 기준가 2,607,000원, 48% 적용 결과 1,355,640원을 단정하는 회귀 테스트를 추가했다.

## ④ GREEN

```text
estimate-app 전체: 21 suites / 360 tests passed
dc-price-parity: 2 tests passed
product-service compileJava + compileTestJava: BUILD SUCCESSFUL
product-service EstimateCatalogInternalControllerIT: 10 tests passed
```

처음 IT 실행은 `SAMHAN_GATEWAY_ATTESTATION` 미설정으로 fail-closed 되었고, 공유 자격을 읽거나 쓰지 않는 로컬 테스트용 비밀이 아닌 더미 attestation을 프로세스에만 주입해 재실행하여 10건 GREEN을 확인했다.

## ⑤ 나란히 캡처

이번 워크트리에는 공유 스택의 웹 런타임(estimate-app/desktop)이 기동되어 있지 않아, 새 라이브 ON 상태의 두 화면을 캡처할 수 없었다. 기존 동일조건 real QA 캡처는 아래에 보존되어 있으며 두 화면 모두 1,355,640원을 보여 준다.

- [desktop 1,355,640원](../1241-sol-merge-verdict-r2-real-qa/screenshots/01-desktop-1355640-real-qa.png)
- [estimate-app 1,355,640원](../1241-sol-merge-verdict-r2-real-qa/screenshots/02-estimate-1355640-real-qa.png)

R5의 새 라이브 ON 캡처는 미수행이며, 자동 양방향 테스트가 ON/OFF 모두 같은 금액을 증명한다. 캡처 저장 규약은 `resolveQaShotsDir()`를 사용한 기존 `*-real-qa` 목적지를 유지했다.

## ⑥ 잃으면 안 되는 것 재확인

- 싱글 구성품 13행, 판넬 128,000원, 리모컨 16,000원: 코드 미변경
- 271세트 총액 518,775,000원 전후, 순증감 0원, 불일치 0건: 코드 미변경
- V44/V45 fresh 적용 308행: 코드 미변경
- estimate-app 옵션 OFF 수렴: 회귀 테스트 통과
- product-service IT 10건 GREEN, estimate-app 360건 GREEN
- 기존 CI 47 pass 기준의 나머지 범위: 코드 외 변경 없음

## ⑦ 프로세스 회수

- 이번 라운드에서 bootJar·컨테이너·공유 스택 변경 없음
- Gradle 테스트 daemon은 종료됨
- 공유 스택 컨테이너/DB는 건드리지 않음
- 확인한 기존 청취 포트는 8080/8084/8089이며 기존 프로세스 그대로 보존
- 이번 라운드 신규 잔여 프로세스·격리 컨테이너·JAR: 0
