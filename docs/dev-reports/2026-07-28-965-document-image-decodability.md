# PR #968 — 문서양식 이미지 디코드 가능성 계약 dev-report

> 작성일: 2026-07-28
> 대상: PR #968 / Issue #965
> 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\965-imgvalid`
> 원칙: R = C1 + C2 + C3. C1·C2·C3를 함께 적용했다.
> 최신 라운드: 2026-07-28 SOL — 박스 내부 경고를 폐기하고 외부 요약·저장 게이트·밴드 분리로 재설계했다.

## 1. 구현 결과

| 계약 | 구현 |
|---|---|
| C1 | 파일 선택과 저장 직전에 실제 렌더 경로인 `HTMLImageElement.decode()`를 호출한다. 실패하면 draft/API 저장을 진행하지 않고 알린다. `createImageBitmap()`은 사용하지 않는다. |
| C2 | groupware validator는 allowlist, 50KB 상한, RIFF/PNG 구조, 64MiB 자원예산만 검사한다. renderer 디코드 성공을 보장한다고 말하던 문구와 Javadoc을 정정했다. |
| C3 | 렌더 `error`는 박스 밖 `role="alert"` + `no-print` 요약에서 밴드·alt·key와 교체 지시를 표시한다. HEADER/BODY/FOOTER 흐름 IMAGE는 좌표 레이어에서 분리하고, 인쇄 미디어에서는 요약을 숨긴다. |

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

---

## 8. PR#968 R1 라운드 fix (SONNET5, 2026-07-28)

R1 적대검증(OPUS 발견 2 + SONNET5 대조 1)이 도달 가능 결함 3건을 확정했다. 아래는 그 fix 라운드의 RED→GREEN→뮤테이션 RED 원문과 회귀 울타리 실행 결과다.

### 8.1 결함1 [HIGH] — 좌표 배치 IMAGE에서 C3 경고가 첫 진입에 안 뜬다

**원인**: React가 `<img>`를 DOM에 삽입하기 전에 `src`를 세팅해 data URL 디코드 실패가 마운트 전에 일어나 synthetic `onError`가 그 이벤트를 못 받는다. `DocumentRenderer.tsx`의 `RenderedImageElement`에 `useIsomorphicLayoutEffect`로 마운트 후 `imgRef.current.decode()`를 직접 호출해 이벤트 버블링과 무관하게 판정하도록 fix했다(`onError`는 src 변경 시 즉시반응용으로 유지).

RED(jsdom, `.decode()` mock reject, `fireEvent.error` 미호출) — fix 전 실행:
```text
✓ flow 배치 IMAGE — 렌더 엔진 error를 인쇄 이전 단계의 no-print 경고로 표시한다(수동 이벤트)
✗ 좌표 배치(geometry) IMAGE — decode() 실패만으로 첫 렌더에서 경고를 표시한다(수동 이벤트 디스패치 없음)
  → Unable to find [data-testid="document-template-image-error-positioned-undecodable-image"]
✗ decode()가 성공하면 경고를 표시하지 않는다(정상 이미지 회귀 방지)
  → expect(decode).toHaveBeenCalled() timeout
Test Files 1 failed (1) | Tests 2 failed | 1 passed (3)
```
GREEN(fix 후): `Test Files 1 passed (1) | Tests 3 passed (3)`.

뮤테이션 RED(라이브 실 브라우저, `useIsomorphicLayoutEffect` 본문을 `setDecodeFailed(false); return undefined`로 되돌림, Vite HMR 반영, 실 그룹웨어 API + dev_master 로그인 후 throwaway 문서양식 편집기 첫 진입/새로고침 2회):
```text
{"trial":"MUTATION-live-1","warningNodes":0}
{"trial":"MUTATION-live-2","warningNodes":0}
```
fix 복원 후 재확인(같은 throwaway 문서양식, 새로고침 5회 + 목록→클릭 SPA 내비게이션 3회, 매회 신규 페이지 로드):
```text
새로고침 5회: [1,1,1,1,1]
SPA 클릭 경유 3회: [1,1,1]
```
DOM 실측(fix 후 1회차): `img.complete=true, naturalWidth=0`(브라우저 native decode 실패, R1 원 실측과 동일 신호) — **그런데도** 경고 1개가 정상 표시됨. 좌표 IMAGE 첫진입 5/5 → 5/5로 반전.

### 8.2 결함2 [HIGH] — C1이 통과시킨 PNG를 BE가 거부

**원인**: PNG는 BE가 `ImageIO.read()` 완전 디코드를 요구했는데, Chromium `<img>`는 IDAT이 절단·손상된 PNG도 부분 렌더한다(jshell 실측: 51% 절단·IDAT 페이로드 손상 둘 다 `IIOException: Error reading PNG image data` — 완전히 빈 IDAT 합성 fixture와 **동일한 예외**라 Java 쪽에서 구분 불가). WebP와 동일 계약으로 통일 — PNG는 `checkImageDecodedByteBudget()`(IHDR 헤더 파싱 + 자원예산)만 통과하면 구조적으로 유효하다고 본다. IHDR 자체가 손상된 입력("I/O error reading PNG header!" — IDAT 단계 실패와 다른 예외로 jshell 실측상 명확히 구분됨)은 그대로 거부된다. JPEG는 이 어긋남이 실측되지 않아(60% 절단 JPEG도 이미 ACCEPTED) 완전 디코드 요구를 유지했다.

RED(BE, `./gradlew :services:groupware-service:test --tests DocumentPayloadValidatorTest --rerun-tasks --no-build-cache`) — fix 전:
```text
44 tests completed, 3 failed
PR968R1_D2_png_acceptsHeaderValidButEmptyIdatBecauseBeNoLongerGuaranteesDecodability() FAILED
  com.samhanair.logis.common.exception.BusinessException: IMAGE 요소 src는 허용된 PNG/JPEG/WebP data URL 또는 기본 로고여야 하며, 크기·구조 제한을 만족해야 합니다.
PR968R1_D2_png_acceptsRealAssetTruncatedAtDownloadInterruptionPoint() FAILED (동일 예외)
PR968R1_D2_png_acceptsIdatPayloadCorruptedWithCrcRecalculated() FAILED (동일 예외)
```
GREEN(fix 후): `tests="44" failures="0" errors="0"`.

뮤테이션 RED(PNG 분기를 `checkImageDecodedByteBudget(decoded) && ImageIO.read(...) != null`로 되돌림): 동일 3건 재실패(`tests="44" failures="3"`), `PR968R1_D2_png_stillRejectsHeaderLevelCorruption`은 영향 없이 계속 GREEN(헤더단계 거부는 무관).

전체 groupware-service 회귀: `--rerun-tasks --no-build-cache` 전체 실행 `tests=227 skipped=0 failures=0 errors=0`.

### 8.3 결함3 [경미] — 경고가 좌표 요소와 겹쳐 그려진다

**1차 시도(불충분, 실측으로 발견)**: 경고에 `position:relative; z-index:1`만 주면 "이미지에 가려짐"은 해소되지만, 경고 `<span>`이 block이라 폭 지정이 없어 **밴드 전체 폭**으로 퍼져 같은 줄의 다른 좌표 TEXT(`ANCHORTEXT좌표기준`)와 글자가 겹쳐 그려졌다(라이브 스크린샷 실측, `noticeOverlapsAnchor:true`). **최종 fix**: 경고에도 실패한 IMAGE와 동일한 `geometryStyle(geometry, …)`을 적용해 이미지 자신의 자리(x/y/w/h)에만 그려지게 했다 — flow 배치(geometry 없음)는 기존 정상 flow를 유지한다.

라이브 재검증(Playwright, `b-img`(손상, 좌표 0~25%)·`b-good`(정상 PNG, 30~55%)·`b-anchor`(TEXT "ANCHORTEXT좌표기준", 60~95%) 3요소를 같은 HEADER 밴드에 배치한 throwaway 양식):
```text
1차 시도: noticeOverlapsGood=true  noticeOverlapsAnchor=true  (겹침 확인)
최종 fix: noticeOverlapsGood=false noticeOverlapsAnchor=false (형제 침범 0)
```
스크린샷으로 "이 이미지는 현재 화면에서 표시할 수 없습니다..." 경고가 자신의 좁은 열 안에서만 줄바꿈되고, `b-good`(검정 사각형)·`ANCHORTEXT좌표기준` 문구가 온전히 분리되어 보임을 확인했다.

### 8.4 회귀 울타리 9항목 실행 결과

같은 throwaway 양식(`b-img`/`b-good`/`b-anchor`)으로 968-a2 라운드의 `qa3.mjs` Playwright 하네스를 재사용(로직 동일, 대상 id·포트만 교체)해 재현했다.

1. **인쇄 PDF 경고문구 0** — `print 미디어 경고 계산스타일 = {"display":"none","visibility":"visible","rect":{"w":0,"h":0}}`. `poppler pdftotext`로 실제 PDF 텍스트 직접 추출: pdfA(no-print 유지) = "결재 문서 미리보기 / 손상 이미지 / ... / ANCHORTEXT좌표기준 / ..."(경고문구 부재) vs pdfB(no-print 클래스 제거 뮤테이션) = "...표시할 수 없습니다. 인쇄 전에 이미지를 교체하고 저장하세요..."(경고문구 실제 인쇄됨) — `no-print`가 원인임을 뮤테이션으로 재확증. CSS 규칙(`global.css`) `@media print { .no-print { display: none !important; } }` — `!important`라 결함3의 인라인 `position/zIndex` 추가와 무관하게 항상 우선한다.
2. **R3 기대 반전 유지** — `R3_webp_acceptsVp8lHeaderWithoutImagePayloadBecauseChromiumLoadsIt` 등 전체 groupware-service 227건에 포함, GREEN.
3. **레이아웃 밀림 0** — 같은 하네스: 경고 표시/숨김 전후 `goodImg`/`anchor`/`band` bounding box 완전 동일(`레이아웃 밀림 0 확인 = true`).
4. **정상 이미지 미삭제** — PDF XObject `["14x16","1x1"]`(14x16=깨진 이미지 브로큰 글리프, 1x1=`b-good` 원본 그대로).
5. **U-gate ③** — 실 에디터 UI로 재현. (a) 파일 선택 경로: PoC WebP(`poc-vp8l-v1.webp`, byte[24] version=1)를 `<input type="file">`에 DataTransfer로 주입 → "이 이미지는 현재 화면에서 표시할 수 없어 저장할 수 없습니다..." 메시지 노출. (b) source 직접 입력 경로: "이미지 source" 필드에 같은 PoC data URL을 native setter로 주입 후 저장 버튼 클릭 → 동일 메시지. 두 경로 모두 `window.fetch`/`XMLHttpRequest.prototype.open`을 in-page monkey-patch로 가로채 호출 이력을 수집 — **두 경로 모두 `calls: []`**(쓰기 요청 0건).
6. **무한 pending 없음** — groupware-service 227건에 `H15_*` 전부 포함, GREEN(549MB급 PNG 폭탄 거부 유지, PNG 분기 변경과 무관 — `checkImageDecodedByteBudget`은 그대로).
7. **CRUD·활성화 계약 불변** — 실 API로 재확인: throwaway 양식 생성 201 → IMAGE 포함 활성화 시도 **422**("자동 업데이트 선행 전에는 DETAIL/IMAGE 양식을 활성화할 수 없습니다") → 이미지 교체 후 재저장(§9) 200. `DocumentTemplateService.java:31` `ADVANCED_ACTIVATION_GATE_ENABLED = true` 불변(미수정).
8. **allowlist·50KB·자원예산 유지** — groupware-service 227건에 `R5_realRepositoryImageFence_preservesAllowlistSizeAndBudgetContract`(마스코트 원본 71,880B 거부) 포함, GREEN.
9. **갇힘 아님** — 실 API로 재확인: 결함1 throwaway 양식(깨진 좌표 이미지)의 src를 정상 1x1 PNG로 교체해 `PUT` → **200**.

### 8.5 계열 sweep

- **DocumentRenderer 이미지 렌더 경로**: `ApprovalDocView`(`clients/desktop/src/renderer/print/ApprovalDocView.tsx`)도 같은 `DocumentRenderer`를 쓴다. `DocumentTemplateService.java:31` `ADVANCED_ACTIVATION_GATE_ENABLED=true`가 IMAGE 포함 양식의 ACTIVE 활성화를 422로 막아(§8.4 항목7 실측) **오늘도 도달 불가**임을 재확인했다 — 코드 미변경, R1의 판정과 동일하게 유지. 결함1 fix는 `RenderedImageElement` 자체를 고쳤으므로 게이트가 열리면 `ApprovalDocView` 경로에도 자동 적용된다(별도 분기 없음).
- **PNG 계열 전수(§8.4 규정 외 추가 실측, jshell)**: IHDR CRC 손상(무시됨, ImageIO가 애초에 IHDR CRC를 검사하지 않음 — 4x4 정상 디코드, 무관), colorType=5(존재하지 않는 값, header 단계 거부), width=0(header 단계 거부), 서명 뒤 랜덤 가비지(header 단계 거부), IHDR 중간 절단(header 단계 거부) — 전부 `PR968R1_D2_png_stillRejectsHeaderLevelCorruption`으로 회귀 고정. IDAT 단계 손상(51% 절단·페이로드 손상·완전 빈 IDAT)만 접수 대상이며 이는 header 단계와 별개 예외로 jshell상 명확히 구분된다.

### 8.6 증거 무결성 정정 A·B 반영

- **정정 A(줄번호 드리프트)**: spec `DocumentPayloadValidator.java:444`→`467`(2곳), `DocumentRenderer.tsx:239-260`/`:240`→`imageDecodeErrorNotice`=`256-274`/`:309`, `:291`→`:306`. plan `:242`→`:315`, `:240`→`:309`, `:239-260`→상동, `:261-295`→`:261-309`, `:372-447`→`:394-469`. `:217-226`·`:222`는 이번 fix 구간 이전이라 드리프트 없음(미변경). 전부 이번 R1 fix로 발생한 **추가** 드리프트다 — R1 정정 시점(444→445, 240→257)과 지금 사이에 내 fix가 다시 밀었다.
- **정정 B(변경 줄 수)**: 본 문서 §6 표는 재확인 결과 **이미 정확했다**(`DocumentPayloadValidator.java` +13/−10, 테스트 +83/−18 — R1 정정과 일치). 오류는 PM이 게시한 **PR 코멘트**(합산치 +23/+101)에만 있었고 이 dev-report 파일 자체에는 없었다.

### 8.7 R1 fix 변경 파일·numstat (원문)

`git diff --numstat HEAD`(HEAD=`b04bcecae`, 구현 커밋) 기준, 위 §8.6 문서 정정을 제외한 코드/테스트만:

```text
87  21  clients/desktop/src/renderer/print/DocumentRenderer.image-error.test.tsx
59  5   clients/desktop/src/renderer/print/DocumentRenderer.tsx
34  12  services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java
142 5   services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java
```

### 8.8 정직한 미완료 목록(R1 fix 라운드)

- `ApprovalDocView` 경로의 결함1 fix 자체는 게이트로 인해 오늘 실행 증거를 못 만들었다(§8.5, 코드 공유 구조로 논리적 적용만 확인).
- CMYK JPEG 등 ImageIO가 못 읽는 실제 포맷의 I-3 표면 확장 여부는 이번에도 미확인(R1과 동일 한계 — 인코더 부재).
- Electron 패키지 앱 실기동은 미실행(웹 프로덕션 렌더러 `vite --config vite.web.config.ts`로 대체, R1과 동일).
- PDF 텍스트 추출 1차 시도(자체 제작 regex 기반 ToUnicode CMap 파서)는 이 PDF 구조에서 textRuns=0으로 실패해 독립 도구로 대체했다. `Get-Command pdftotext`가 찾지 못한 것은 **PowerShell 한정**이며, Git Bash에는 `/mingw64/bin/pdftotext`(xpdf 4.06)가 실존한다. 이번 SOL 검증은 두 도구를 교차 시도했고, PowerShell 도구 부재 사유는 환경 한계로 남긴다.
- FE 전체 vitest 스위트(레포 전역)는 실행하지 않았다 — 관련 표면의 실측은 **26개 파일 / 233건**이다. 이전 기록의 “27개 파일 239건”은 오기다. 정정 산식은 `git ls-tree` 실측 26파일, 신규 2파일 vitest 5건, `238−5=233`이다.
- 거부 경로 표기도 정정한다. 입력은 5종이지만 실제 코드 분기는 4개다(`ElementInspector.tsx:249-281`). 0바이트와 텍스트 위장은 형식 불일치 분기를 공유하며 숨은 분기는 없다.
- throwaway 문서양식은 전부 삭제했다(§8.9). 워크트리에는 새 파일을 남기지 않았다(스크래치패드에만 하네스·로그·PDF·스크린샷 저장).

### 8.9 무훼손

throwaway 문서양식 2건(`PM968R1_DEFECT1_THROWAWAY`, `PM968R1_FENCE_THROWAWAY`) 생성 후 `DELETE` API로 전량 삭제, 목록 재조회로 `PM968R1`/`throwaway` 잔여 0건 확인. 렌더러 dev 서버(포트 5199)는 세션 종료 전 프로세스 종료. 산출물은 스크래치패드(`968-r1fix/`)에만 저장했다. 아래 §9~§11은 그 뒤의 SOL 라운드 기록이다.

### 8.8 정정 각주

1. 커밋 `2ef26713a`의 “FE 239/239 · 27개 파일” 표기는 잘못되었다. 실측은 233건 / 26파일이다. 커밋 메시지는 변경하지 않고 이 각주로 정정한다.
2. “거부 경로 5항목”은 “입력 5종 / 분기 4개”로 정정한다.
3. “환경에 `pdftotext`가 없다”는 표현은 “PowerShell에 없다”로 정정한다. Git Bash `/mingw64/bin/pdftotext`(xpdf 4.06)는 사용 가능하다.

## 9. 2026-07-28 SOL 라운드 — RED 원문

R1·R2·R3처럼 박스 내부 축약을 반복하지 않고, ① 존재 ② 요소 식별 ③ 교체 지시를 박스 밖 요약으로 이동하는 방향을 먼저 고정했다. 그 설계에 대한 실패 테스트를 먼저 추가했다.

결함1(박스 크기 격자)의 최초 RED 원문:

```text
❯ src/renderer/print/DocumentRenderer.image-error.test.tsx (7 tests | 6 failed)
× flow 배치 IMAGE — 렌더 엔진 error를 박스 밖의 no-print 요약으로 표시한다(수동 이벤트)
  → Unable to find [data-testid="document-template-image-error-summary"]
× 좌표 배치 IMAGE 26x2.7px — decode() 실패는 박스 크기와 무관하게 외부 요약에서 읽힌다
  → Unable to find [data-testid="document-template-image-error-summary"]
× 좌표 배치 IMAGE 100x20px — decode() 실패는 박스 크기와 무관하게 외부 요약에서 읽힌다
  → Unable to find [data-testid="document-template-image-error-summary"]
× 좌표 배치 IMAGE 525x16.8px — decode() 실패는 박스 크기와 무관하게 외부 요약에서 읽힌다
× 좌표 배치 IMAGE 525x90.7px — decode() 실패는 박스 크기와 무관하게 외부 요약에서 읽힌다
Test Files 1 failed
```

결함2(HEADER/FOOTER 흐름 IMAGE 분리)의 최초 테스트 실행 원문도 보존한다. 이 실행은 제품 결과보다 JSDOM opaque-origin 설정 오류가 먼저 드러난 RED였고, 테스트에 `url: 'http://localhost/'`를 추가해 유효한 DOM RED를 만들었다.

```text
❯ src/renderer/print/DocumentRenderer.test.tsx (19 tests | 2 failed)
× ... HEADER flow IMAGE ...
  → localStorage is not available for opaque origins
× ... FOOTER flow IMAGE ...
  → localStorage is not available for opaque origins
```

결함3(대형 미지원 형식)의 RED 원문:

```text
❯ src/renderer/components/documentTemplate/ElementInspector.image-rejection.test.tsx (5 tests | 1 failed)
× 큰 미지원 형식은 용량이 아니라 지원 형식 불일치로 안내한다
  → expected '현재 양식 기준 이미지 최대 50KB까지 저장할 수 있습니다.' to contain
    '비어 있거나 지원되는 PNG/JPEG/WebP 형식이 아니어서'
```

저장 게이트의 다중 식별 테스트 RED 원문:

```text
❯ src/renderer/print/templateSchema.image-decodability.test.ts (1 test | 1 failed)
× 디코드 불가 이미지를 밴드별로 모두 수집하고 저장 오류가 식별 정보를 포함한다
  → expected undefined to be type of 'function'
```

위 RED 직후 구현을 진행했다. 출력에서 Vitest의 반복 DOM dump·색상 제어문자는 제외했지만, 테스트 파일·실패 assertion·원문 메시지는 그대로 보존했다.

## 10. 2026-07-28 SOL fix

- `DocumentRenderer`는 이미지 박스 안의 `⚠`/문구를 완전히 제거하고, `.paper` 바깥의 `ImageDecodeIssueSummary`에 깨진 이미지 수, 밴드명, alt, key, 교체·저장 지시를 표시한다. 초기 source 판정과 `HTMLImageElement.decode()`/`error` 이벤트를 같은 reporter로 합쳐 첫 진입 레이스도 수집한다. `no-print`라서 인쇄물에는 나오지 않는다.
- 한 문서의 깨진 이미지가 GRID 4개처럼 여러 개면 하나의 요약에 4개를 모두 열거한다. 저장 전 `findUndecodableImages`가 모든 밴드의 이미지를 모아 `ImageSourceDecodeError`에 band·alt·key를 포함한다. 따라서 “저장이 차단되는데 어느 이미지인지 모름”을 해소한다.
- 좌표 레이어는 HEADER/BODY/FOOTER 모두 TEXT/FIELD와 좌표 IMAGE만 담는다. geometry 없는 흐름 IMAGE는 각 밴드의 일반 흐름 렌더로 분리해 머리말·맺음말 형제 좌표 글자를 덮지 않는다.
- 파일 선택은 형식/구조 판정을 용량 판정보다 먼저 수행한다. BMP 67,854B도 파일 크기와 무관하게 지원 형식 불일치 안내를 받는다. 0바이트와 텍스트 위장은 같은 형식 불일치 분기를 공유한다: **입력 5종 / 분기 4개**.

GREEN 원문:

```text
Test Files 5 passed (5)
Tests 33 passed (33)
```

관련 전체 회귀 GREEN:

```text
Test Files 29 passed (29)
Tests 246 passed (246)
```

추가로 `npm run typecheck`는 `tsc`와 `typecheck:real-qa` 모두 `fail 0`으로 종료했다. BE를 수정하지 않았으므로 낡은 공유 Docker 이미지 재빌드는 적용 대상이 아니다.

## 11. 2026-07-28 가독성 fix 및 라이브 QA

### 11.1 실제 편집기·박스 격자

실제 Vite 편집기(`127.0.0.1:5199`)를 Chromium으로 열고 실제 API로 양식을 생성·조회·저장 시도·삭제했다. 캡처는 다음 경로에 남겼다.

- [01-desktop-grid-summary.png](../qa/2026-07-28-965-warning-redesign/01-desktop-grid-summary.png)
- [02-three-band-overlap.png](../qa/2026-07-28-965-warning-redesign/02-three-band-overlap.png)
- [03-save-blocked-identifies-elements.png](../qa/2026-07-28-965-warning-redesign/03-save-blocked-identifies-elements.png)
- [04-touch-no-hover-summary.png](../qa/2026-07-28-965-warning-redesign/04-touch-no-hover-summary.png)
- [05-print-no-warning.pdf](../qa/2026-07-28-965-warning-redesign/05-print-no-warning.pdf)

실제 브라우저에서 읽은 값:

```text
summary: display=grid visibility=visible rect=(x=558.765625,y=1690.9375,w=647.484375,h=254)
summary: insidePaper=false itemCount=7 allGridLabels=true
grid geometry matrix: 26x2.7px / 100x20px / 525x16.8px / 525x90.7px → 모두 외부 요약의 band·alt·key로 식별
```

### 11.2 세 밴드 겹침·저장 차단

`getBoundingClientRect()`와 DOM containment를 프로그램으로 검사했다. 세 밴드 모두 flow IMAGE가 좌표 layer의 자식이 아니고, `.paper` 안의 warning count가 0이다.

```text
HEADER layer=(605.109375,2172.421875,554.796875,90.703125)
  anchor=(937.984375,2208.703125,166.4375,20.53125)
  flowImage=(605.109375,2274.453125,554.796875,20.53125) flowImageInLayer=false
BODY   layer=(605.109375,2397.734375,554.796875,90.703125)
  anchor=(937.984375,2434.015625,166.4375,18.65625)
  flowImage=(605.109375,2360.1875,554.796875,18.65625) flowImageInLayer=false
FOOTER layer=(605.109375,2588.140625,554.796875,90.703125)
  anchor=(937.984375,2624.421875,166.4375,20.53125)
  flowImage=(605.109375,2690.171875,554.796875,20.53125) flowImageInLayer=false
paperWarnings=0 overlapFree=true
```

저장 버튼 클릭 후 실제 alert는 다음 7개를 모두 명시했고, 저장 요청은 차단되었다.

```text
이 이미지는 현재 화면에서 표시할 수 없어 저장할 수 없습니다. 이미지를 바꾼 뒤 다시 저장하세요. 저장할 수 없는 이미지: 머리말 · 머리말 흐름 이미지 (header-flow-image), 머리말 · GRID 이미지 1 (grid-image-1), 머리말 · GRID 이미지 2 (grid-image-2), 머리말 · GRID 이미지 3 (grid-image-3), 머리말 · GRID 이미지 4 (grid-image-4), 본문 · 본문 흐름 이미지 (body-flow-image), 맺음말 · 맺음말 흐름 이미지 (footer-flow-image).
alert: display=block visibility=visible rect=(x=264,y=978.453125,w=1240.234375,h=63)
```

### 11.3 터치·인쇄·PDF 교차 확인

터치 컨텍스트(`390×844`, `isMobile=true`, `hasTouch=true`)에서 hover/title 없이 요약이 노출되었다.

```text
touch summary: display=grid visibility=visible rect=(x=29,y=2261.9375,w=332,h=296)
title=null paper=false reachableWithoutTitle=true
```

인쇄 미디어와 생성 PDF를 모두 검사했다.

```text
screen: display=grid visibility=visible rect=(558.765625,1690.9375,647.484375,254) paperWarningCount=0
print: display=none visibility=visible rect=(0,0,0,0) textNodes=false
PowerShell: Get-Command pdftotext → NOT_FOUND (PowerShell 환경 한정)
Git Bash: /mingw64/bin/pdftotext (xpdf 4.06) → warning=ABSENT, extracted=132 bytes
```

`05-print-no-warning.pdf`의 Git Bash 추출 텍스트에는 `표시할 수 없는 이미지`, `현재 화면에서 표시할 수 없습니다`, `이미지를 교체`가 없었다. PowerShell 쪽은 실행 파일이 없어 동일 추출을 수행할 수 없었으므로 “미검증”이 아니라 **도구 부재라는 검증 불가능 사유를 명시한 교차 확인**이다.

### 11.4 검증 범위와 남은 한계

- Codex in-app Browser runtime은 세션에서 브라우저 목록이 비어 있어 사용할 수 없었다. 대신 설치된 Playwright Chromium으로 동일한 실제 Vite 편집기/API 경로를 실행했으며, 캡처 후 `getComputedStyle`, `getBoundingClientRect`, 실제 텍스트 노드를 읽었다.
- Electron 패키지 자체는 실행하지 않았다. 데스크톱 의존성은 먼저 `clients/desktop/npm ci`로 설치했고, 웹 실제 렌더러와 관련 Vitest/typecheck를 검증했다.
- 작업 중 생성한 throwaway 양식은 API `DELETE` 응답 200으로 정리했다. 마지막 라이브 QA 양식 id는 `74d71a79-2a94-4bb4-8bd0-1fedd056e55f`이며 cleanup body가 `success=true`였다.

## 12. 2026-07-28 SOL 2차 fix — 손상 요소 자체 제거·결정적 key·현재 상태 재평가

### 12.1 판정 원문에 대한 대응

SOL이 지적한 네 표면을 모두 소비자 표시 변경이 아니라 실제 렌더/상태의 원천에서 닫았다.

- `RenderedImageElement`는 허용되지 않는 source나 `decode()` 실패가 확정된 순간 `<img>`를 더 이상 용지 subtree에 렌더하지 않는다. `display:none`의 placeholder `span`만 남긴다. 아직 판정 중인 허용 source도 `visibility:hidden`으로 두어 브라우저의 broken-image 아이콘·alt fallback·기본 테두리가 한 프레임 칠해지지 않게 했다. 화면 ruler와 인쇄 measurement ruler 양쪽에 같은 규칙을 적용했다.
- 캔버스 각 행과 선택된 인스펙터에 `요소 key: ...`를 보이고, ▲/▼ 버튼의 accessible name에도 같은 key를 넣었다. 따라서 동일 alt 4행도 summary의 key와 exact row/testid로 결정적으로 대응한다.
- reporter state는 template의 현재 band/element 순서로 다시 정렬한다. async reject 도착 순서가 바뀌어도 summary는 canvas 순서를 따른다.
- draft의 IMAGE source/alt/band/order 서명이 바뀌면 `findUndecodableImages`를 다시 실행해 footer `error`를 즉시 비운다. 현재도 손상된 이미지가 남아 있으면 현재 목록만 다시 표시한다.

### 12.2 RED → GREEN 원문

새 RED 테스트를 먼저 추가한 뒤 이전 구현을 대상으로 실행했다. 핵심 실패 원문은 다음과 같다.

```text
DocumentRenderer.image-boundary.test.tsx
  expected 0 image elements, received 6
  → tiny 26×2.7px grid의 실패 <img> 6개가 화면/인쇄 DOM에 남음

DocumentRenderer.image-error.test.tsx
  expected ["image-row-a", "image-row-b"]
  received ["image-row-b", "image-row-a"]

ElementInspector.test.tsx
  Unable to find an element with the text: 요소 key: image-row-b

BandCanvas.test.tsx
  Unable to find an element with the text: 요소 key: image-row-a

DocumentTemplateEditorPage.image-decodability.test.tsx
  직전 저장 차단 사유가 현재 draft 수정 뒤에도 남아 있음
```

fix 후 실행 원문:

```text
Test Files 5 passed (5)
Tests 30 passed (30)

npm run typecheck
tsc ... exit 0
typecheck:real-qa: tests 2, pass 2, fail 0

npm run lint
0 errors, 기존 경고만 존재
```

### 12.3 증거 무결성 정정

직전 보고서의 `xpdf 4.06 → 132 bytes`는 같은 도구·같은 파일로 재현되지 않았다. 이번 새 PDF
`docs/qa/2026-07-28-965-sol2-fix/04-live-print.pdf`에 대해 같은 xpdf 4.06을 다시 실행한 값은 다음과 같다.

```text
PowerShell: C:\Program Files\Git\mingw64\bin\pdftotext.exe
           pdftotext version 4.06 [www.xpdfreader.com]
           UTF-8 bytes = 1019
           인쇄 경고 문구 hit = 0
Git Bash:  /mingw64/bin/pdftotext
           pdftotext version 4.06 [www.xpdfreader.com]
           wc -c = 1017
           인쇄 경고 문구 hit = 0
```

두 byte 값의 2바이트 차이는 PowerShell `Out-String`의 줄바꿈 처리 차이이며 PDF 내용의 판정 차이가 아니다. 따라서 `132 bytes`는 정정하고 재사용하지 않는다.

직전 `textNodes=false`도 “DOM Text node가 없다”는 뜻으로는 틀렸다. 정확한 측정 대상은 **print summary가 `display:none`이고 rect가 `(0,0,0,0)`이지만 `textContent.length`는 321인 상태**였다. 이번 측정에서는 실제 인쇄 기준 문구 3개 각각 `actualTextNodeCount=1`, summary는 `display=none`, rect `(0,0,0,0)`, `textLength=228`이었다. 즉 “DOM Text node 부재”가 아니라 “인쇄 summary가 paint/layout 대상이 아님”이라고 표현해야 한다.

### 12.4 실 API·실 편집기·화면/인쇄/PDF QA

실제 `vite.renderer.dev.config.ts` 편집기(`127.0.0.1:5175`)와 로컬 실 API(`localhost:8080`)를 사용했다. 전용 양식을 UI에서 생성하고, API PUT으로 손상 WebP 4개·동일 alt 4행·HEADER/BODY/FOOTER tiny 좌표 격자를 주입한 뒤 다시 편집기로 reload했다. 마지막 양식은 API DELETE HTTP 200으로 정리했다.

캡처:

- [01-live-screen-before-print.png](../qa/2026-07-28-965-sol2-fix/01-live-screen-before-print.png)
- [02-live-screen-measured.png](../qa/2026-07-28-965-sol2-fix/02-live-screen-measured.png)
- [03-live-print-media.png](../qa/2026-07-28-965-sol2-fix/03-live-print-media.png)
- [04-live-print.pdf](../qa/2026-07-28-965-sol2-fix/04-live-print.pdf)
- [05-live-after-source-fix.png](../qa/2026-07-28-965-sol2-fix/05-live-after-source-fix.png)

프로그램 측정 결과:

```text
screen: failed <img> DOM=0, invalidImageDom=[], painted placeholder=0
        HEADER/BODY/FOOTER overlapY=0
        actual text node count=1,1,1
        summary display=grid rect=(558.765625,1633.9375,647.484375,191)
print : failed <img> DOM=0, invalidImageDom=[], painted placeholder=0
        HEADER/BODY/FOOTER overlapY=0
        actual text node count=1,1,1
        summary display=none rect=(0,0,0,0)
summary order:
  image-row-b → image-row-d → body-overlap-image → footer-overlap-image
canvas order:
  ... image-row-a → image-row-b → image-row-c → image-row-d → header-overlap-text ...
  ... body-overlap-image → body-overlap-text ... footer-overlap-image → footer-overlap-text
selected inspector: 요소 key: body-overlap-image
source fix live recheck:
  summary = image-row-b → image-row-d → footer-overlap-image
  footer error = 현재 3개 목록만 표시, body-overlap-image는 제거됨
```

동일 alt 네 행의 문제 두 건은 summary에 `image-row-b`, `image-row-d`로 표시되고, 캔버스 행에도 같은 key가 보였다. PDF는 두 xpdf 경로에서 경고 0회였고 HEADER/BODY 기준 문구는 정상 인쇄됐다.

### 12.5 SOL의 “이 라운드가 보지 않은 것”과 이번 fix의 범위

SOL 원문이 보지 않았다고 명시한 물리 프린터, Safari/WebKit/Firefox, 네트워크 URL 이미지, 수백 개 이미지 부하, native Ctrl+ 확대, 실제 스크린리더 음성, `APPROVAL_GRID`의 BODY/FOOTER 비사용 조합, 공유 실데이터는 이번 fix가 검증했다고 주장하지 않는다. 다만 이번 변경은 브라우저 공통 DOM의 실패 `<img>` 제거와 CSS visibility/display, 편집기 row/ARIA key, 현재 draft 재평가를 건드렸으므로 Chrome 화면·print media·Chrome PDF와 키보드/접근 가능한 이름 경로는 재검증했다. 물리 장치·타 브라우저·네트워크 응답·대규모 부하·음성 출력은 별도 검증 영역으로 남긴다.
