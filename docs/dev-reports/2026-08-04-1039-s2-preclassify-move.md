# S2 가배차 분류 계산 삼한 이전

## 시작 기록

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 루트 확인: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 시작 HEAD: `e6c0f3fc70349be7896a37b031ee6f850db81190`
- 범위: 삼한 `slip-service`가 8모드 가배차 분류를 직접 제공하고 `clients/desktop`의 `/arologis/pre-classify`가 삼한 API를 호출하도록 이전한다.
- 이번 라운드에 남긴 것: `clients/arologis-desktop`는 S4 범위로 수정하지 않는다. 기존 `arologis-service` 판정 코드는 삭제하지 않고 호출되지 않는 호환 잔존 여부를 최종 보고한다.

## RED-first 기록

### RED-A

명령:

```text
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.service.preclassify.PreClassifyServiceTest --tests com.samhanair.logis.slip.service.preclassify.PreClassifyAdminControllerTest
```

원문 핵심:

```text
> Task :services:slip-service:compileTestJava FAILED
...PreClassifyAdminControllerTest.java:22: error: cannot find symbol
  MockMvc mvc = MockMvcBuilders.standaloneSetup(new PreClassifyAdminController(service)).build();
                                                   ^
  symbol:   class PreClassifyAdminController
...PreClassifyAdminControllerTest.java:24: error: cannot find symbol
  for (DispatchExecutionMode mode : DispatchExecutionMode.values()) {
...
29 errors
BUILD FAILED
```

판정: 삼한 API/8모드 대상 타입과 controller가 없어 RED-A가 기능 부재 원인으로 실패했다.

### RED-B

명령과 동일 실행에서 기존 테스트의 핵심을 이전한 `PreClassifyServiceTest`도 함께 컴파일했다.

원문 핵심:

```text
...PreClassifyServiceTest.java:23: error: cannot find symbol
    private PreClassifySlipQuery slipQuery;
...PreClassifyServiceTest.java:40: error: cannot find symbol
    Map<DispatchExecutionMode, Integer> expected = new EnumMap<>(DispatchExecutionMode.class);
29 errors
BUILD FAILED
```

판정: 새 삼한 서비스/8모드/DTO가 아직 없어 RED-B가 실패했다.

## 규칙 무변경 증명

새 `PreClassifyService`에 레거시 `matchesMode`의 순서를 그대로 옮겼다. 공통 제외(prefix 10자 + `회수/회차/차용/대여/반납/자가` + `LEGACY_CARRIER_MARKER`)가 먼저이고, `STACK_ONLY`/`REGION_ONLY`는 모두 `warehouseAllowed`를 통과해야 하며, 일반 모드는 야적을 창고 판정보다 먼저 보존하고 모드 1~3의 REGION을 제외한다.

기존과 새 테스트의 8모드 기대값은 동일하다: `4, 3, 3, 2, 2, 6, 4, 4`. 새 테스트에는 공통 운송사 marker 제외, 야적 보존, 미확정 창고 count, partnerCode 배차 계획 flag, 기간 검증을 추가 적용했다. 실제 레거시 서비스 회귀도 실행했다.

## 종료조건 검증

### 1. 새 조합 열거 및 실행

- 모드 1~3 × `SANGIL`, `CHOWOL`, `REGION`, `STACK`, `UNKNOWN`: 8모드 행렬 테스트에서 각 결과 count를 확인했다.
- 모드 4 `STACK_ONLY` × 허용/미확정 창고: `STACK` + `UNKNOWN`은 제외되어 창고 gate가 유지됨을 확인했다.
- 모드 5 `REGION_ONLY` × 허용/미확정 창고: 행렬의 2건과 미확정 창고 제외를 확인했다.
- 공통 제외 × 야적/일반: carrier marker 행은 제외되고 야적 행은 보존됨을 확인했다.
- 삼한 API와 기존 아로로지스 API 동시 생존: 두 서비스의 동일 레거시 fixture 기대값(8모드 `4/3/3/2/2/6/4/4`)을 각각 실행했다. 화면 호출은 삼한 경로로만 바꾸고, 아로로지스 판정 endpoint는 S4 정리 대상으로 잔존시켰다.

### 2. 참조 전수

명령:

```text
rg -n --hidden --glob '!**/build/**' 'PreClassifyService|pre-classify|DispatchExecutionMode|PreClassifyResponse' services/slip-service services/arologis-service clients/desktop clients/arologis-desktop
```

출력 결론: `clients/desktop/src/renderer/api/arologisDispatchApi.ts`는 `/admin/dispatches/pre-classify`로 변경되었고, mock handler도 삼한 계약을 추가했다. `clients/arologis-desktop`와 기존 `arologis-service`의 old endpoint/service/test 참조는 사용자 지시대로 수정하지 않고 호환 잔존으로 남겼다. 새 slip controller/service/DTO/query/support client 및 arologis 원천 support endpoint 참조를 확인했다.

### 3. 영향 테스트

삼한 영향 테스트:

```text
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.service.preclassify.PreClassifyServiceTest --tests com.samhanair.logis.slip.service.preclassify.PreClassifyAdminControllerTest --tests com.samhanair.logis.slip.it.ApplicationContextLoadIT
...
> Task :services:slip-service:test
BUILD SUCCESSFUL in 31s
```

기존 아로로지스 규칙 회귀:

```text
.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.service.PreClassifyServiceTest
...
> Task :services:arologis-service:test
BUILD SUCCESSFUL in 6s
```

프런트 계약/컴파일:

```text
npx vitest run src/renderer/api/mock.test.ts
Test Files 1 passed (1)
Tests 128 passed (128)

npx tsc -p tsconfig.web.json --noEmit
Exit code: 0

추가 API/mock 계약:

```text
npx vitest run src/renderer/api/arologisDispatchApi.contract.test.ts src/renderer/api/mock.test.ts
Test Files 2 passed (2)
Tests 129 passed (129)
```
```

전체 `npm test`는 저장소의 기존 `out/main/index.js` 파생물 신선도 사전검사에서 중단되어 실행하지 못했다. 이후 실제 영향 범위인 mock 128건과 web typecheck는 별도 성공했다.

`git diff --check` 출력은 공백 오류 없이 종료 코드 0이었다.

## 변경 파일

### 신규

- `docs/dev-reports/2026-08-04-1039-s2-preclassify-move.md`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/` 전체
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/preclassify/PreClassifyAdminController.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/preclassify/` 전체
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/PreClassifySupportResponse.java`
- `clients/desktop/src/renderer/api/arologisDispatchApi.contract.test.ts`

### 수정

- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java`
- `clients/desktop/src/renderer/api/arologisDispatchApi.ts`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx`

`clients/arologis-desktop`는 수정하지 않았다. `git add`/commit/push도 수행하지 않았다.
