# PR #968 — 문서양식 이미지 디코드 가능성 계약 dev-report

> 작성일: 2026-07-28
> 대상: PR #968 / Issue #965
> 워크트리: `D:\dev\Samhan-Public\.claude\worktrees\965-imgvalid`
> 원칙: R = C1 + C2 + C3. C1·C2·C3를 함께 적용했다.

## 1. 구현 결과

| 계약 | 구현 |
|---|---|
| C1 | 파일 선택과 저장 직전에 실제 렌더 경로인 `HTMLImageElement.decode()`를 호출한다. 실패하면 draft/API 저장을 진행하지 않고 알린다. `createImageBitmap()`은 사용하지 않는다. |
| C2 | groupware validator는 allowlist, 50KB 상한, RIFF/PNG 구조, 64MiB 자원예산만 검사한다. renderer 디코드 성공을 보장한다고 말하던 문구와 Javadoc을 정정했다. |
| C3 | 렌더 `error`는 미리보기 화면에서 `role="alert"` + `no-print` 경고로 표시한다. 측정용 인쇄 DOM에는 경고를 렌더하지 않으며 결재 인쇄면에는 오류 문구가 들어가지 않는다. |

## 2. RED → GREEN → 뮤테이션 RED 원문

아래는 실행 터미널에서 실패·성공을 결정한 원문 줄이다. 색상 제어문자와 반복 DOM dump만 생략했다.

### C1 — 저장 전 `<img>.decode()` 게이트

RED:

```text
❯ src/renderer/components/documentTemplate/ElementInspector.test.tsx (17 tests | 1 failed)
× C1: Chromium이 디코드하지 못한 WebP는 source를 draft에 반영하지 않고 저장 전에 알린다
→ Unable to find role="alert"
Test Files 1 failed (1)
Tests 1 failed | 16 passed (17)
```

GREEN:

```text
✓ src/renderer/components/documentTemplate/ElementInspector.test.tsx (17 tests)
Test Files 7 passed (7)
Tests 50 passed (50)
```

뮤테이션 RED — `if (!(await canDecodeImageSource(src)))`를 `if (false && ...)`로 변경:

```text
❯ src/renderer/components/documentTemplate/ElementInspector.test.tsx (17 tests | 1 failed)
× C1: Chromium이 디코드하지 못한 WebP는 source를 draft에 반영하지 않고 저장 전에 알린다
→ Unable to find role="alert"
Test Files 1 failed (1)
Tests 1 failed | 16 passed (17)
```

뮤테이션은 즉시 원복했다.

### C2 — BE renderer 디코드 보장 과장 제거

RED:

```text
40 tests completed, 2 failed
R3_webp_acceptsVp8lHeaderWithoutImagePayloadBecauseChromiumLoadsIt() FAILED BusinessException
DS4_imageSourcePolicy_messageDescribesStructurePolicyNotRendererDecodability() failed expected new phrase, actual "IMAGE 요소 src는 실제로 열 수 있는..."
BUILD FAILED
```

GREEN:

```text
<testsuite ... tests="41" skipped="0" failures="0" errors="0" ...>
```

최종 compile/test:

```text
.\gradlew.bat :services:groupware-service:compileJava :services:groupware-service:test --tests "com.samhanair.logis.groupware.service.DocumentPayloadValidatorTest"
BUILD SUCCESSFUL in 3s
```

뮤테이션 RED — `chunkSize >= 5`를 `chunkSize > 5`로 되돌리고 R3만 실행:

```text
DocumentPayloadValidatorTest > R3_webp_acceptsVp8lHeaderWithoutImagePayloadBecauseChromiumLoadsIt() FAILED
    com.samhanair.logis.common.exception.BusinessException at DocumentPayloadValidatorTest.java:416

1 test completed, 1 failed

BUILD FAILED in 9s
```

R3 주석에 Chromium `<img>`가 이 입력을 4x4로 load하므로 거부하면 I-3 위반이라는 근거를 명시했다. 뮤테이션은 즉시 원복했다.

### C3 — 조용한 삭제 금지, 인쇄 전용 경고

RED:

```text
❯ src/renderer/print/DocumentRenderer.image-error.test.tsx (1 test | 1 failed)
× 렌더 엔진 error를 인쇄 이전 단계의 no-print 경고로 표시한다
→ Unable to find an element by: [data-testid="document-template-image-error-undecodable-saved-image"]
Test Files 1 failed (1) | 1 passed (1)
Tests 1 failed (1) | 17 passed (18)
```

GREEN:

```text
✓ src/renderer/print/DocumentRenderer.image-error.test.tsx (1 test)
✓ src/renderer/print/DocumentRenderer.test.tsx (17 tests)
Test Files 7 passed (7)
Tests 50 passed (50)
```

뮤테이션 RED — `onError`의 `setDecodeFailed(true)`를 제거:

```text
❯ src/renderer/print/DocumentRenderer.image-error.test.tsx (1 test | 1 failed)
× 렌더 엔진 error를 인쇄 이전 단계의 no-print 경고로 표시한다
→ Unable to find an element by: [data-testid="document-template-image-error-undecodable-saved-image"]
Test Files 1 failed (1) | 1 passed (1)
Tests 1 failed (1) | 17 passed (18)
```

뮤테이션은 즉시 원복했다.

## 3. 회귀 울타리 5항목

| 항목 | 실행 결과 |
|---|---|
| 1. 실재 mascot 원본 | `git ls-files "*.webp"`로 확인한 `clients/web/design-system/src/assets/mascot/samhani.webp` 71,880B를 읽어 50KB 상한 거부 PASS. |
| 2. 실재 mascot 파생본 | 같은 원본의 첫 ANMF 프레임 8,876B를 읽어 validator 허용 PASS. 계획 실측 Chromium 결과는 `load 171x150`이며 이번 로컬 자동화는 validator 계약까지 실행했다. |
| 3. 실 PNG 4종 | `pwa-192.png` 2,743B, `pwa-512.png` 9,707B, `splash.png` 4,040B, `ic_launcher.png` 1,869B를 실제 경로에서 읽어 모두 허용 PASS. |
| 4. 정책 guard·조용한 삭제 | `DocumentPayloadValidatorTest` 41건, `DocumentRenderer.test.tsx` 17건 및 C3 error 1건 PASS. allowlist·50KB·64MiB guard는 변경하지 않았다. |
| 5. CRUD·활성화 | `documentTemplate.test.ts` 6건, `templateSchema.activationGate.test.ts` 6건, roundtrip 1건, 기본양식 mutation 2건을 포함한 FE 7파일 50건 PASS. |

## 4. 전체 검증

FE typecheck:

```text
> @samhan/desktop@0.1.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

groupware 전체:

```text
.\gradlew.bat :services:groupware-service:test
BUILD SUCCESSFUL in 7s
27 actionable tasks: 27 up-to-date
```

대상 FE:

```text
Test Files 7 passed (7)
Tests 50 passed (50)
```

레포 전체 FE Vitest와 실제 Chromium U-gate(파일 선택 → 저장 API → 미리보기 → print media)는 이 작업에서 실행하지 않았다. 위 GREEN은 대상 테스트·typecheck·groupware 전체 테스트 범위다.

## 5. 계열 전수 sweep

`git ls-files "*.webp"`:

```text
clients/web/design-system/src/assets/mascot/samhani.webp
```

`rg -l "RIFF|WEBP" services -g "*.java"`:

```text
services\groupware-service\src\test\java\com\samhanair\logis\groupware\service\DocumentPayloadValidatorTest.java
services\groupware-service\src\main\java\com\samhanair\logis\groupware\service\DocumentPayloadValidator.java
services\dashboard-service\src\main\java\com\samhanair\logis\dashboard\service\AppNoticeService.java
```

`dashboard-service/AppNoticeService.java:291-302`는 PM 결정대로 범위 밖이며 수정하지 않았다. 데스크톱 계열은 `templateSchema.ts` decode preflight, `ElementInspector.tsx` 파일 선택, `DocumentTemplateEditorPage.tsx` 저장 preflight, `DocumentRenderer.tsx` error 경로를 확인했다. `createImageBitmap()` 호출은 없고 금지 설명 주석만 있다.

기존 `R1_4` 합성 WebP 테스트는 구조 validator의 legacy 단위 회귀로 그대로 두었고, 이번 회귀 울타리에는 사용하지 않았다. 새 울타리는 `R5_realRepositoryImageFence...`의 저장소 실재 자산만 사용했다. R3의 5바이트 입력은 기획에서 실측한 Chromium load 입력을 테스트 helper로 재현한 것이며, 기대 반전 근거를 테스트 주석과 본 문서에 함께 남겼다.

## 6. 변경 파일·줄 수

코드·테스트는 `git diff --numstat` 기준이다. 문서 2개는 실행 증거·결정 기록으로 별도 표시한다.

| 파일 | 추가 | 삭제 | 늘어난 이유 |
|---|---:|---:|---|
| `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx` | 6 | 1 | 파일 선택 후 decode 실패 차단 |
| `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.test.tsx` | 27 | 1 | 실측 WebP C1 회귀 |
| `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx` | 10 | 2 | 직접 입력/draft 우회까지 저장 preflight |
| `clients/desktop/src/renderer/print/templateSchema.ts` | 39 | 1 | 공통 decode preflight와 C2 문구 |
| `clients/desktop/src/renderer/print/DocumentRenderer.tsx` | 44 | 18 | 화면 전용 경고와 error state |
| `clients/desktop/src/renderer/print/DocumentRenderer.test.tsx` | 28 | 0 | 비삭제·인쇄면 비노출 회귀 |
| `clients/desktop/src/renderer/print/DocumentRenderer.image-error.test.tsx` | 53 | 0 | 실제 error 이벤트 C3 회귀 |
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java` | 13 | 10 | C2 설명과 VP8L 5B 허용 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java` | 83 | 18 | R3 반전·실재 asset fence |
| `migration/decisions/DECISIONS.md` | 8 | 0 | D-965-01~03 |
| `docs/dev-reports/2026-07-28-965-document-image-decodability.md` | 208 | 0 | 본 실행 보고서 |

변경 증가는 C1/C3 실패 경로와 회귀 테스트, R3 근거 주석, 실제 저장소 자산 fence에만 사용했다. allowlist·50KB·자원예산·CRUD/활성화 구현은 변경하지 않았다.

## 7. 정직한 미완료 목록

- 실제 Chromium U-gate(저장 전 차단·미리보기·print media 비노출) 미실행.
- 레포 전체 FE Vitest 미실행. 대상 7파일 50건만 PASS로 보고한다.
- mascot 파생본의 이번 세션 독립 Chromium `171x150` 측정 미실행. 실제 바이트·크기·validator 허용은 자동 테스트로 확인했다.
- `dashboard-service/AppNoticeService.java:291-302`는 PM 확정 범위 밖이라 미수정.
- git add/commit/branch/PR/CI 조작은 사용자 지시대로 하지 않았다.
- 검증 중 한 차례 레포 루트로 잘못 지정한 명령이 있었으나 소스 수정은 없고, 해당 결과는 최종 근거에서 제외했다. 이후 소스 수정·최종 검증은 지정 워크트리에서 수행했다.
