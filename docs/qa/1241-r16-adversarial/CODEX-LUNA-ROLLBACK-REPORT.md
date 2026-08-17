# PR #1241 CODEX LUNA 되돌림 + 정리 보고서

## ① 환경 확인

요청 원문 명령:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # 3c76f0eec
git status --porcelain
```

실행 원문:

```text
3c76f0eec771463496e197ff4377b7a97e2e9ee1
?? clients/desktop/playwright/1241-r16-adversarial-real-qa/
?? docs/qa/1241-r16-adversarial/
?? docs/qa/1241-set-allocation-diagnostic/
```

커밋·push·git add는 실행하지 않았다.

## ② 두 커밋의 해당 파일 diff와 분류

### `7b4c94fb4`

`BundleExpander.java`에 아래 9줄이 추가됐다.

```java
BigDecimal componentSum = picked.stream()
        .map(p -> round(p.price))
        .reduce(BigDecimal.ZERO, BigDecimal::add);
if (componentSum.compareTo(round(setUnit)) == 0) {
    return;
}
```

`BundleExpanderR13Test.java`가 신규 추가됐고, AC fixture는 부모명을 실제 카탈로그와 반대로 `"가정용 세트"`로 만들었다. 이어서 `AC-IN=925050`, `AC-OUT=616975`를 수동 주입하고 그 역전값을 기대했다.

판정: 둘 다 ⓐ 가짜 배분 결함 산물이다. 500 fix는 partner-order의 opaque UUID 역직렬화 변경이고, 시트 차단은 scheduler/service/controller/config 변경이다. 이 두 파일의 위 변경은 어느 쪽에도 필요하지 않다. 합계 일치 조기 반환은 레거시 재배분을 건너뛰어 기존 IT 3건을 깨뜨렸다.

### `3c76f0eec`

`BundleExpander.java`에 아래 SKU 전용 swap이 추가됐다.

```java
if ("AC060CS6PBH1SY".equals(parent.getModelCode())
        && indoor.size() == 1 && outdoor.size() == 1) {
    BigDecimal indoorPrice = indoor.get(0).price;
    indoor.get(0).price = outdoor.get(0).price;
    outdoor.get(0).price = indoorPrice;
    return;
}
```

테스트 fixture는 `AC-IN=616975`, `AC-OUT=925050`으로 바뀌었지만 기대값은 계속 `AC-IN=925050`, `AC-OUT=616975`였다.

판정: ⓐ 가짜 배분 결함이다. 정본은 비가정 360/CST UV의 실내 616,975원·실외 925,050원이다. 3c의 실제 폐기 시트 동기화 화면 안내 변경은 이 두 파일 밖에 있으므로 유지했다.

## ③ 되돌린 것과 남긴 것

되돌림:

- `BundleExpander.java`: SKU 전용 swap 제거.
- `BundleExpander.java`: 합계 일치 조기 반환 제거.
- `BundleExpanderR13Test.java`: 잘못된 부모명·수동 역전 fixture 전체 삭제.

남김:

- 7b4의 가격 미리보기 500 fix(opaque UUID decoder 계열).
- 7b4의 런타임 Google Sheets 연결 차단.
- 3c의 폐기 시트 동기화 화면 안내.

되돌린 뒤 현재 파일과 `f1513b8d1`의 해당 부분을 비교한 원문은 다음과 같다.

```text
git diff f1513b8d1 -- services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java services/product-service/src/test/java/com/samhanair/logis/product/service/BundleExpanderR13Test.java
```

출력: 없음. 즉 두 대상 파일의 해당 상태가 fix 직전 `f1513b8d1`과 동일하다.

## ④ 되돌린 뒤 3절 6항목 실측

`SAMHAN_GATEWAY_ATTESTATION`은 `infrastructure/.env.local`에서 export하되 값은 출력하지 않았다.

실행 명령:

```text
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.it.BundleExpanderIT --no-daemon
```

실행 원문 핵심:

```text
BundleExpanderIT > 가정용_싱글세트_세트단가_실내6_실외4_재배분() PASSED
BundleExpanderIT > 비가정_4way_싱글세트_실내4_실외6_재배분() PASSED
BundleExpanderIT > 다수_실내기_비례배분_마지막_잔차흡수() PASSED
BUILD SUCCESSFUL
25 tests completed
```

확인 결과:

1. BundleExpanderIT 전체: 통과. 요청한 3건도 모두 통과.
2. `AC060CS6PBH1SY`: 레거시 실행식의 비가정 4:6 및 fixed 117,975원 대입 결과 `실내 616,975 / 실외 925,050`.
3. `AR06D1150HZS`: 기존 IT/레거시 4:6 대입 결과 `실내 148,000 / 실외 222,000`.
4. 가격 미리보기 500: 7b4의 opaque UUID decoder 변경은 유지됐고, 이번 되돌림은 해당 파일을 건드리지 않았다. 500 재발 근거 없음.
5. 시트 연결 시도 0: 7b4의 scheduler/service 차단 변경은 유지됐고, 이번 되돌림은 해당 파일을 건드리지 않았다. 카탈로그 DB 경로 유지.
6. 폐기 시트 동기화 화면 안내: 3c의 desktop `SheetSyncPage` 변경을 유지했다.

## ⑤ CI 실패 8건 분류와 조치

PR 당시 원문 상태는 `통과 39 · 실패 8`이었다.

| 실패 check | 분류 | 조치/판정 |
|---|---|---|
| Desktop Playwright | 시트 폐기 정책과 옛 SP-07/권한그룹 mock 단언 충돌 | 이번 배분 되돌림과 무관. 폐기 안내는 유지하고 옛 Google Sheets 실행 가능 단언은 복원하지 않음 |
| GitGuardian | `scripts/redeploy-service.credentials.test.ps1`, `OpaqueUuidDecoderTest.java`의 외부 high-entropy 탐지 | Bundle과 무관. 대시보드 incident 회수·rotate/false-positive 판정이 필요한 외부 보안 조치 |
| JUnit product-quantity-sync-schema | R6 1건, R7 2건, ScopeReduction 2건 | 모두 sheet sync 정책 변경 축. BundleExpander와 무관 |
| JUnit user+product+inventory+logging | 804건 중 68 실패 | 시트 sync 통합 테스트군의 옛 활성 계약. BundleExpander 3건은 되돌림으로 닫힘; 나머지는 시트 폐기 정책과 별도 수렴 필요 |
| 문서 본문 단언 스펙 | SP-07의 seed fallback/홈멀티/시트 read 단언 2건 | 옛 시트 활성 계약. 폐기 정책과 무관하게 문서·스펙 수렴 필요 |
| 빌드 + 테스트 accounting+partner | `ProductClientTest.java:218` `opaque(UUID)` 중복 정의 | Bundle과 무관한 병합 컴파일 오류 |
| 빌드 + 테스트 product-quantity-sync-schema | 위 R6/R7/ScopeReduction 5건의 빌드 결과 | 같은 sheet sync 원인, Bundle과 무관 |
| 빌드 + 테스트 user+product+inventory+logging | 위 68건의 빌드 결과 | 같은 sheet sync 원인; Bundle 3건만 이번 변경으로 닫힘 |

`EcountSheetOrderConvergenceIT`도 `test-sheet-id`를 주입하고 `readSheetDisplay("test-sheet-id", ...)`를 stub하는 옛 시트 정본 계약 때문에 실패한 것으로 판정했다. 네 테스트군은 모두 Bundle 변경과 별개다.

이번 워크트리에서 수행한 범위는 PR #1241의 가짜 배분 결함 회수다. 사용자 지시대로 커밋·push하지 않았으므로 원격 8개 check를 재실행하거나 상태를 바꿀 수 없다.

## ⑥ 증거 무결성 자기 고지

초기 R16의 `실내 925,050 / 실외 616,975`를 계약이라고 단정한 것은 근거 없는 기대값이었다. 실제 카탈로그명과 레거시 분류·배분 실행식을 다시 대조한 결과를 기준으로 정정한다. 삭제한 R13 fixture는 원천 검증이 아니라 그 잘못된 기대를 반복한 것이므로 증거로 사용하지 않는다.

## ⑦ 프로세스 회수

```text
이번 작업이 기동한 Gradle daemon: 1 → 테스트 종료 후 회수
gradle_daemon_processes=0
running_containers=26
isolated_1241_containers=0
```

실행 중인 `samhan-*` 공유 컨테이너는 건드리지 않았다. 격리 컨테이너를 새로 만들지 않았고, 잔여 격리 컨테이너 수는 0이다.

## ⑧ 최종 `git status --porcelain` 원문

```text
 M services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java
 D services/product-service/src/test/java/com/samhanair/logis/product/service/BundleExpanderR13Test.java
?? clients/desktop/playwright/1241-r16-adversarial-real-qa/
?? docs/qa/1241-r16-adversarial/
?? docs/qa/1241-set-allocation-diagnostic/
```

`git add`, `git commit`, `git push`는 하지 않았다. 기존 untracked 산출물은 다른 라운드 산물이므로 건드리지 않았다.
