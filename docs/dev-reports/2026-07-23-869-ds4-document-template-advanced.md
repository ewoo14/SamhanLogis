# #845 DS-4 — 문서 양식 고도화 (2026-07-23)

> 연관 Issue: #869 · 에픽 #845
> 선행: DS-3b 편집기 MVP(PR #891, 머지 `13414d03a`) ✅

## 1. 범위

편집기 MVP 이후 **실무 양식을 완성**하는 고도화 슬라이스.

| | 항목 |
|---|---|
| **A** | **반복 detail 밴드** — 품목행 N행 |
| **B** | **이미지 / 로고 요소** |
| **C** | **인쇄 fidelity 반복 조정** (`@page` · 픽셀 회귀 가드) |

## 2. 🚨 규율 — 인쇄 양식은 단번 완성 금지

개발책임자 규율 대상이다. **mock → 캡처 → CSS 정정을 3~5회 반복**한다.
한 번에 맞췄다고 선언하지 말 것 — 인쇄물은 화면과 다르게 렌더되고, 이 저장소에는 **인쇄 계약 false-green 이력이 2회** 있다(`scrollIntoViewIfNeeded` 가 사용자가 못 하는 이동을 대신 해줘 통과).

## 3. 불변식

| # | 불변식 |
|---|---|
| **D4-1** | **반복 detail 밴드는 행 수가 달라져도 레이아웃이 깨지지 않는다** — 0행·1행·N행·페이지 넘김 경계 |
| **D4-2** | **이미지/로고는 인쇄물에서 지정한 위치·크기로 나온다.** 화면 미리보기와 실제 인쇄 결과가 일치한다 |
| **D4-3** | **DS-3b 가 세운 인쇄 계약을 깨지 않는다** — `no-print` 은닉 · `.paper` 본문 유지 · A4 210mm · print media 에서 헤더 `row`. 모바일(`screen ≤639px`) 적층 규칙도 유지 |
| **D4-4** | **기존 양식(schema v2)은 그대로 렌더된다** — 새 요소 타입 도입이 기존 저장 양식을 깨지 않는다 |

## 4. 검증 방침

- **RED-first** — 각 항목마다 결함 재현 실패 테스트 먼저, **뮤테이션 RED** 로 방어선 증명
- **인쇄 검증은 클래스 존재가 아니라 실제 가시성/기하로** — DS-3b 에서 확립한 방식(`getClientRects()` 실제 줄 수 · `elementFromPoint()` hit-test · print media 실제 가시성)을 승계한다
- **경계값 회귀 승계** — DS-3b 가 남긴 7 경계값 스위트(1100·1099·700·699·640·639·320)를 새 요소에도 적용
- **라이브QA(PM 직접)** — 실서버 실제 실행 + 스크린샷. **정적 게이트로 대체 금지**
  🚨 **`page.pdf()` 실제 출력물**까지 확인한다(화면 캡처만으로는 인쇄 fidelity 를 증명하지 못한다)

## 5. 참고 — DS-3b 에서 배운 것 (반복 방지)

| 교훈 | 적용 |
|---|---|
| 조건부 통과(`if (count())`)가 전제 불성립을 조용히 삼켰다 | 전제가 안 맞으면 **명확히 실패**하게 쓴다 |
| `usePermissions()` 로딩 레이스가 CI 에서만 재현됐다 | 권한 의존 요소는 **visible 대기 → 클릭 → enabled 확인** 순서 |
| 실서버 하네스가 모바일 가독성 회귀를 못 잡았다 | 하네스에 **실제 렌더 결과 단언**(줄 수·flex-direction·열 수)을 넣는다 |
| A4 고정폭이 모바일에서 글자를 세로로 쪼갰다 | 새 요소도 **좁은 폭에서 읽히는지** 확인 |

## 6. 워크플로우

캐논 준수 — OPUS 기획(본 PR) → CODEX LUNA 5.6 구현 → OPUS 적대리뷰 + PM 라이브QA → CODEX SOL 5.6 리뷰 → 도달가능 0 수렴 → CI green → PM 머지.

## 7. 구현 결과

- schema v2 union에 `DETAIL`·`IMAGE`를 additive로 추가했다. 기존 `FIELD`·`TEXT`·레거시 요소와 v1 upcast 경로는 변경하지 않았다.
- 렌더 경로는 기존 `DocumentRenderer → PrintLayout`을 유지했다. DETAIL은 `body.lineItems`를 `tbody`로 매핑하고 IMAGE는 기존 design-system/정적 자산과 충돌하지 않는 일반 `<img>` 렌더로 연결했다.
- 편집기 팔레트와 기존 인스펙터만 확장했다. 신규 design-system 컴포넌트는 만들지 않았다.
- 새 Flyway/API/DB 컬럼은 없다. 기존 JSONB `document`와 `schema_version` 경계에서만 검증·왕복했다.

### 7.1 DETAIL 허용 목록과 DTO 대조

실제 source는 `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/response/EstimateLineResponse.java`의 `EstimateLineResponse`다. renderer 경계에서는 UUID를 제거한 동일 의미의 `EstimateLine` projection만 사용한다.

| 허용 열 키 | 실제 DTO 필드 | 의미 |
|---|---|---|
| `productName` | `EstimateLineResponse.productName` | 품목명 |
| `modelName` | `EstimateLineResponse.modelName` | 모델명 |
| `specification` | `EstimateLineResponse.specification` | 규격 |
| `quantity` | `EstimateLineResponse.quantity` | 수량 |
| `supplyAmount` | `EstimateLineResponse.supplyAmount` | 부가세 **제외 공급가액** |
| `vatAmount` | `EstimateLineResponse.vatAmount` | 부가세 |
| `lineTotal` | `EstimateLineResponse.lineTotal` | 공급가액 + 부가세인 **부가세 포함 합계** |
| `note` | `EstimateLineResponse.note` | 품목 비고 |

`unitPrice`·`unitPriceWithVat`는 의미가 다른 legacy 단가 계열이라 허용 목록에서 제외했다. DTO Javadoc의 `supplyAmount = unitPrice × quantity`, `vatAmount = supplyAmount × 10%`, `lineTotal = supplyAmount + vatAmount`를 기준으로 금액을 고정했다.

0행 문구는 새 표현을 만들지 않고 기존 화면·공통 목록에서 사용하는 `데이터가 없습니다.`를 재사용했다. 1행/N행은 실제 DTO projection의 서로 다른 품목명·금액을 단언한다.

### 7.2 IMAGE source 정책

허용 범위는 (1) 정확히 `/print-logo.svg`인 로컬 정적 자산, (2) `data:image/png|jpeg|webp;base64,...` data URL이며 decoded payload 50KB 이하로 제한했다. `http`, `https`, `//host`, `blob:`, `file:`, SVG data URL, query/hash가 붙은 `/print-logo.svg`, 토큰성 query string은 거부한다. 외부 호스트·CSP·오프라인 인쇄 실패를 피하면서 기존 public 로고 자산과 오프라인 소형 이미지 fixture만 허용하려는 보수적 선택이다. mock Vite는 root가 `src/renderer`인 점을 확인해 기존 `clients/desktop/public/print-logo.svg`를 같은 `/print-logo.svg` 경로로 서빙하도록 `publicDir`를 명시했다.

## 8. RED/GREEN/뮤테이션 RED 원문 요약

- FE schema RED: 신규 `DETAIL`/`IMAGE` fixture가 초기 parser에서 unsupported element로 실패. GREEN: `npx vitest run src/renderer/print/templateSchema.v2.test.ts` → **8 passed**.
- BE validator RED: 신규 JSONB element 왕복 fixture가 unsupported element로 실패. GREEN: `:services:groupware-service:test --tests '*DocumentPayloadValidatorTest' --rerun-tasks --no-build-cache --console=plain` → 콘솔 **BUILD SUCCESSFUL**, `27 actionable tasks: 27 executed`.
- renderer RED: DETAIL은 `sectionForElement`에서 사라지고 IMAGE가 출력되지 않아 2건 실패. GREEN: `DocumentRenderer.test.tsx` → **11 passed**.
- combined FE GREEN: 관련 5개 파일 → **40 tests passed**; 기존 approval golden **19 passed**.
- mutation RED 1: `parseImageSource`에 `https://` 허용을 임시 주입 → `templateSchema.v2.test.ts`에서 `https://example.com/logo.png: expected true to be false`로 실패.
- mutation RED 2: DETAIL rows를 임시 `.slice(0, 1)`로 잘라냄 → `DocumentRenderer.test.tsx`에서 `밸브 B` 구별 출력 단언 실패(10 passed/1 failed). 두 mutation은 즉시 원복했다.

## 9. 인쇄 조정 라운드 및 실제 PDF

`mockDetailRows=44`로 실제 2페이지를 만든 뒤 매 라운드 `page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })`를 생성하고 PNG로 렌더 확인했다.

1. 1회차: 표 헤더 반복·행 단위 분리는 보였지만 긴 표에서 closing 문구가 1페이지 표 행 위에 겹쳤다. 반복 detail 전용 flex 본문 modifier를 추가했다.
2. 2회차: flex modifier만으로는 Chromium fragmentation이 계속 겹쳤다. 반복 detail 문서만 approval shell을 print block flow로 전환했고, mock 로고를 검은 data fixture에서 허용된 `/print-logo.svg` 실자산으로 교체했다. 로고가 mock root에서 깨지는 것도 함께 발견했다.
3. 3회차: DETAIL wrapper의 `position:absolute`가 표 높이를 flow에 반영하지 않는 원인을 수정해 DETAIL geometry를 flow 참여형 `width/margin/min-height`로 바꿨고, mock Vite publicDir를 고쳤다. 결과 PNG에서 표/마감 순서, 로컬 로고, 2페이지 헤더 반복이 모두 정상이다.

PDF 결과: **2 pages**. 1페이지 마지막 행은 `미리보기 품목 E-31`, 2페이지 첫 행은 `미리보기 품목 F-32`로 행 중간 절단이 없었고, 2페이지 첫 줄에 `품목·수량·공급가액·부가세·합계` 열 헤더가 반복됐다. PNG 시각 검토에서도 겹침·잘림·깨진 로고가 없었다.

## 10. D4 계약 및 반복 실행

- D4-1: renderer unit에서 0행(`데이터가 없습니다.`), 1행, N행 구별 출력과 `break-inside: avoid`/`thead` 반복을 검증하고, PDF 44행 페이지 경계를 실물 확인했다.
- D4-2: 7개 폭에서 이미지 visible·natural size·geometry rect·center `elementFromPoint()` hit-test를 확인하고, PDF에서 로컬 로고를 확인했다.
- D4-3: 기존 H-A print media에서 editor/palette/inspector/footer/no-print가 실제 hidden이고 `.paper`가 visible, A4 CSS 폭, header `row`를 확인했다. 모바일 기존 계약은 H-B의 375px/320px wheel hit-test와 함께 유지했고, DS4 새 요소는 1100·1099·700·699·640·639·320 각각에서 실제 줄·rect·hit-test·`scrollWidth <= clientWidth`를 확인했다.
- D4-4: 기존 schema v1 mock ACTIVE를 그대로 편집기·renderer에 넣었고, 기존 approval golden 19건이 유지됐다. v2 기존 `FIELD`·`TEXT`·legacy element parser/renderer에는 새 타입을 요구하지 않는다.
- 좁힌 Playwright: `npx playwright test playwright/ac-868-document-template-editor.spec.ts --grep 'DS4' --workers=1` → **2 passed**. PDF natural-size gate를 추가한 뒤에도 통과했다. 최종 determinism 반복은 동일 DS4/H-A subset을 3회 연속 실행해 모두 **3/3 green**으로 확인했다.

## 11. 못 한 것 / 제한

- 공유 DB write와 실서버 라이브 QA는 수행하지 않았다. 요청 범위대로 mock Playwright와 로컬 `page.pdf()`를 사용했고, DB에는 접근하지 않았다.
- 전체 mock Playwright suite는 실행하지 않았다(다른 슬라이스 캡처 보호). 지정된 `ac-868` subset만 실행했다.
- Poppler가 기본 설치되어 있지 않아 PDF 스킬의 보조 renderer인 PyMuPDF를 설치해 PNG를 만들었다. PDF 자체는 Playwright `page.pdf()` 원문이며, `pypdf` 페이지/텍스트 경계 확인과 PNG 시각 검토를 함께 했다.
- 최종 H-B 기존 회귀는 `2 passed`였다. 지정 Gradle 전체 명령은 첫 실행에서 코드 결함이 아닌 daemon `stop command received`로 중단됐고, 동일 명령 재실행은 **process exit code 0**으로 종료됐다. 재실행 콘솔 마지막은 compiler deprecation/unchecked note와 JVM warning이었으며 `BUILD SUCCESSFUL` 문자열은 이 환경 캡처에 출력되지 않았다. XML을 성공 근거로 사용하지 않았고, focused BE 실행에서만 콘솔 `BUILD SUCCESSFUL`을 확인했다.
