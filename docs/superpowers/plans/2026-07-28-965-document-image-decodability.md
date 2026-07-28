# #965 — 문서양식 이미지 계약 재정의 (구현 계획)

> 작성 2026-07-28 · OPUS 기획 · 근거 SHA `40c415426` · 브랜치 `fix/965-document-image-decodability`
> spec: [`docs/superpowers/specs/2026-07-28-965-document-image-decodability-spec.md`](../specs/2026-07-28-965-document-image-decodability-spec.md)
> 연관 Issue: #965 · 선행 #913 · #890 · PR #951(`dccf6a917`)

---

## 0. 구현자에게 — 이 계획의 성격

**이 계획은 불변식과 울타리만 지정합니다. 구현 수단은 지시하지 않습니다.**

`.claude/memory/feedback_canonical_workflow.md` — *"PM 은 fix 지시에서 불변식만 말하고 구현 수단을 지시하지 않는다(수단 지시 시 그 결함까지 PM 이 떠안음 — 실측 3건)"*.

아래 §3 의 "실측된 함정"은 **수단 지시가 아니라 이미 측정된 사실**입니다. 어떤 수단을 고르든 §4 울타리 전체가 통과해야 하며, 그 사실들은 통과 여부를 좌우합니다.

---

## 1. 불변식 (이것만이 요구사항)

| ID | 불변식 |
|---|---|
| **I-1** | 저장에 성공한 이미지는 미리보기·인쇄에서 깨지지 않는다. 그 성질을 보장할 수 없다면 **사용자가 저장 시점에 안다.** 인쇄 단계에서 아무 설명 없이 사라지거나 빈 자리가 되면 안 된다 |
| **I-2** | 형태 수와 무관하게 성립한다. **아직 아무도 안 본 형태에서도** 성립해야 한다 — 특정 바이트·비트·청크를 열거해 막는 방식은 이 불변식을 만족하지 못한다 |
| **I-3** | 정상 이미지를 거부하지 않는다. 이 위반은 가설이 아니라 **현행 코드에 이미 3형태 실재**한다(spec §3) |
| **I-4** | validator 가 사용자에게 하는 말은 validator 가 실제로 보장하는 것과 같다 |

I-4 는 #913 항목 6 이 지적하고 #951 에서 고쳐지지 않은 것입니다 — `DocumentPayloadValidator.java:222` 가 "실제로 열 수 있는" 이라고 단언하지만 실제 보장은 구조 검사뿐입니다.

---

## 2. 채택된 계약 (spec §4 권고안 R)

세 조각이 하나의 계약입니다. **분리 채택 불가** — 근거는 spec §4.

| 조각 | 내용 | 어느 불변식 |
|---|---|---|
| **C1** | 저장 요청이 성공하기 전에, **그 이미지를 실제로 그릴 엔진**이 디코드에 성공했다는 사실이 확인된다 | I-1 전단 · I-2 · I-3 |
| **C2** | BE 는 디코드 가능성을 보장하지 않는다는 사실을 **계약(사용자 문구·Javadoc·결정 문서)에 반영**한다. 포맷 allowlist·크기 상한·자원 예산·구조 상한은 **그대로 유지** | I-4 |
| **C3** | 저장된 이미지가 렌더에서 디코드에 실패하면 **조용히 넘어가지 않는다** | I-1 후단 |

> 🚫 **채택하지 않은 것** — VP8L version 비트 검사 추가. 이슈가 명시적으로 권하지 않았고 I-2 를 만족하지 못합니다. **형태를 하나 더 세는 코드를 추가하지 마십시오.**
> 🚫 **채택하지 않은 것** — BE 이미지 디코더 도입. spec §3 이 실측으로 반증했습니다(PNG 는 이미 진짜 디코더인데도 렌더 엔진과 2형태 어긋남).

---

## 3. 실측된 함정 (수단 선택 전에 반드시 읽을 것)

전부 이 워크트리에서 측정한 사실입니다. 하네스: 스크래치패드 `965-plan/`.

### ① 같은 엔진 안에서도 API 마다 판정이 다르다

```text
NAME                                    BYTES  img.decode()      createImageBitmap()
POC_VP8L_VERSION_1                         26  REJECT(EncodingError)  REJECT(InvalidStateError)
TEST_minimalValidWebpVp8_4x4               30  ok 4x4                 REJECT(InvalidStateError)
TEST_minimalValidWebpVp8L_4x4              26  ok 4x4                 REJECT(InvalidStateError)
TEST_minimalValidWebpVp8xWithVp8Image      48  ok 4x4                 REJECT(InvalidStateError)
TEST_headerOnlyWebpVp8L_4x4                26  ok 4x4                 REJECT(InvalidStateError)
ANIM_FRAME_FROM_MASCOT                   8876  ok 171x150             ok 171x150
REAL_pwa-192.png                         2743  ok 192x192             ok 192x192
```

렌더 경로는 `<img>`(`DocumentRenderer.tsx:242`)입니다. 픽셀 버퍼를 요구하는 판정 수단은 위 4형태를 **과잉 거부**해 I-3 을 깹니다.

### ② 판정 비용은 무시할 수 있다

위 전 케이스 **중앙값 0.10 ms**(20회 반복), 새 의존성 0. "비싸서 못 한다"는 근거는 성립하지 않습니다.

### ③ 현행 테스트 3개가 **렌더 현실과 다른 세계를 고정**하고 있다

| 테스트 | 무엇을 고정하나 | 실측 |
|---|---|---|
| `R3_webp_rejectsVp8lHeaderWithoutImagePayload` | 5바이트 VP8L 헤더 입력의 **거부**를 요구 | Chromium 은 `load 4x4` 로 **정상 디코드** |
| `R1_4_webp_acceptsStructurallyValidVp8Lossless` | 합성 4x4 VP8L 의 통과를 요구 | `<img>` 는 되지만 픽셀 API 는 거부하는 **퇴화 입력** |
| `R1_4_webp_acceptsStructurallyValidVp8Lossy` | 합성 4x4 VP8 의 통과를 요구 | 위와 같음 |

C1 채택 시 첫 번째는 **실패합니다.** fix 가 틀려서가 아니라 테스트가 틀린 것을 고정하고 있어서입니다.
⟹ **세 테스트의 처분을 PR 에 명시적으로 기록하십시오.** 조용히 지우거나 `@Disabled` 로 덮으면 그 자체가 결함입니다.
⟹ 첫 번째 테스트의 기대 반전은 **#951 R3 결정의 부분 철회**이므로 spec §8-③ 결정을 받은 뒤 진행하십시오.

### ④ 렌더 층에 실패 신호가 0개다

`grep -rn "onError" clients/desktop/src/renderer/print/ clients/desktop/src/renderer/components/documentTemplate/` → 이미지 관련 **0건**.

그리고 `DocumentRenderer.tsx:240` 은 `isAllowedImageSource` 가 false 면 **`return null`** 로 요소를 통째로 지웁니다 — alt 조차 남지 않습니다. C3 은 이 두 분기를 모두 덮어야 합니다.

### ⑤ 인쇄물의 실제 모습 (증거 무결성 — 이슈 표현 정정)

실제 인쇄 산출물(A4 PDF)의 XObject 실측:

```text
IMAGE_XOBJECTS=4   DRAW_IMAGE_OPS(Do)=2
XObject#1 171x150   ← 정상 이미지
XObject#3  14x16    ← 깨진 이미지 자리의 브로큰 글리프
```

**완전한 빈 칸은 아니고 14×16px 글리프**가 찍힙니다. 설명 문구는 없습니다. 보고서에 "빈 칸"이라고 쓰지 마십시오.

### ⑥ BE 에는 WebP 디코더가 없다

```text
IMAGEIO_WEBP_READERS=0  (png=1, jpeg=1)
```

`javax.imageio` 로는 WebP 를 디코드할 수 없습니다. 이것이 C2 의 물리적 근거입니다.

---

## 4. 회귀 울타리 — 이 목록 전체가 통과해야 한다

🚫 **합성 fixture 로 울타리를 세우지 마십시오** — `.claude/memory/feedback_fixture_must_be_reachable_by_real_path.md`.

### 4.1 반드시 **통과**해야 하는 실재 자산

| # | 자산 | 바이트 | Chromium 실측 | 왜 필수인가 |
|---|---|---|---|---|
| F1 | `clients/web/design-system/src/assets/mascot/samhani.webp` **첫 ANMF 프레임 파생** | 8,876 | `load 171x150` | 🚨 **R5 에서 실제로 회귀가 났던 형식**(애니메이션 WebP). 저장소 유일 WebP 자산 |
| F2 | `clients/desktop/public/pwa-192.png` | 2,743 | `load 192x192` | 실 자산 |
| F3 | `clients/desktop/public/pwa-512.png` | 9,707 | `load 512x512` | 실 자산(큰 쪽) |
| F4 | `clients/desktop/android/app/src/main/res/drawable/splash.png` | 4,040 | `load 480x320` | 실 자산(비정사각) |
| F5 | `clients/desktop/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | 1,869 | `load 48x48` | 실 자산(최소) |
| F6 | `/print-logo.svg` (경로 리터럴) | — | — | D-DS4-03 명시 허용 |

> ⚠️ **F1 의 한계를 테스트 주석에 남기십시오.** `samhani.webp` 원본(71,880 B)은 `MAX_IMAGE_BYTES`(50KB)를 넘어 FE·BE 모두 거부합니다(실측 `FE_IS_ALLOWED_IMAGE_SOURCE=false`). 그래서 첫 ANMF 프레임까지 자르고 RIFF 길이를 재기록한 **파생본**을 씁니다. 실 인코더 청크를 그대로 담지만 **원본 파일 그 자체는 아닙니다.**

### 4.2 반드시 **거부**되어야 하는 것

| # | 입력 | 근거 |
|---|---|---|
| R1 | `UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA=` (VP8L version=1) | 이 이슈. **RED-first 대상** |
| R2 | 같은 바이트의 version 2~7 변형 6종 | 실측 전부 Chromium `error` |

### 4.3 🚨 RED-first

`.claude/memory/feedback_canonical_workflow.md` — *"결함 재현 실패 테스트를 먼저 쓰고 RED 원문 제출 후 고칠 것"*.

R1 을 재현하는 실패 테스트를 **먼저** 쓰고 **RED 출력 원문을 PR 에 게시**한 뒤 고치십시오. fix 이후에 테스트를 쓰면 "구현자가 고른 fix" 만 검증하게 됩니다.

### 4.4 계약 문구 울타리 (I-4)

`DocumentPayloadValidator.java:222` 의 사용자 대면 문구가 실제 보장과 일치하는지 검증하는 장치가 필요합니다. 문구를 고치는 것만으로는 다음에 또 벌어집니다.

---

## 5. 표면 목록 (구현이 닿는 곳)

| 표면 | 파일 | 현재 상태 |
|---|---|---|
| 파일 선택 | `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx:245-273` | `isAllowedImageSource` + 크기만 검사 |
| FE 허용검사 | `clients/desktop/src/renderer/print/templateSchema.ts:389-410` (`parseImageSource`/`isAllowedImageSource`), `:229-246` (`hasImageSignature`) | 시그니처 12바이트만 |
| 이미지 렌더 | `clients/desktop/src/renderer/print/DocumentRenderer.tsx:239-260` | `onError` 없음, false 면 `return null` |
| 편집기 미리보기 | `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx:275-277` | 같은 `DocumentRenderer` |
| 결재 인쇄 | `clients/desktop/src/renderer/print/ApprovalDocView.tsx:302` | 같은 `DocumentRenderer` |
| BE 검증 | `services/groupware-service/.../DocumentPayloadValidator.java:217-226`, `:261-295`, `:372-447` | 구조 검사 + 과장된 문구 |
| BE 저장 | `services/groupware-service/.../DocumentTemplateService.java:70`, `:100` | validator 통과 후 저장 |
| BE 테스트 | `services/groupware-service/src/test/java/.../DocumentPayloadValidatorTest.java` (1,084줄) | §3-③ 3개 재검토 대상 |

---

## 6. 범위 밖 (건드리지 말 것)

- `MAX_IMAGE_BYTES`(50KB) · `MAX_DECODED_IMAGE_BYTES`(64MiB) 등 **자원 예산** — H15 계열 결정 유지
- `ADVANCED_ACTIVATION_GATE_ENABLED` **활성화 게이트 해제** — 별개 슬라이스
- `services/dashboard-service/.../AppNoticeService.java` **형제 표면** — spec §8-② 결정 대기
- 마스코트 원본을 50KB 안에 넣는 문제

---

## 7. 검증 (머지 게이트)

`.claude/memory/feedback_canonical_workflow.md` 현행 정본 — 머지 게이트 = **도달성 축**.

| # | 게이트 |
|---|---|
| ① | **실 사용자 경로로 재현 가능한 결함 0**(심각도 무관) |
| ② | **CI green (exact SHA)** |
| ③ | **라이브QA = 실서버 실제 실행** + 매 라운드 실 GUI 스크린샷 |

### 라이브QA 필수 확인

1. Docker 실서버(mock OFF) + 실 데스크톱 GUI
2. **F1~F5 실 자산이 전부 저장된다**(I-3) — 특히 **F1 애니메이션 WebP**
3. **R1 PoC 가 저장 전에 사용자에게 알려진다**(I-1 전단)
4. **저장된 정상 이미지가 인쇄 미리보기에 실제로 그려진다**(I-1)
5. 스크린샷: `SendUserFile`(사용자 채팅) + PR SHA-pinned 인라인 **둘 다**

### 변경 모듈 전체 테스트

- BE: `:services:groupware-service:test` 전체(타깃만 실행 금지)
- FE: `clients/desktop` — `npm run typecheck` + vitest + **design-system/공용 컴포넌트 변경 시 Playwright mock 스위트**
- ⚠️ `feedback_screenshot_restore_scope_destroys_edits` — mock 스위트 전체 실행이 커밋된 스크린샷을 덮어씁니다. 실행 전후 `git status` 확인

---

## 8. 착수 전 확인 (개발책임자 결정 대기)

spec §8 참조. **③은 착수 전 필수**, ①②는 구현 중 확정 가능합니다.

| # | 항목 | PM 권고 |
|---|---|---|
| ① | C3 의 표시 방식 — 결재 인쇄물에 오류 표시를 찍을 것인가 | (나) 인쇄 이전 단계에서만 경고 |
| ② | 형제 표면(`AppNoticeService`)을 이 슬라이스에 포함할지 | 미포함 + 처분표 명시 |
| ③ | `R3_webp_rejectsVp8lHeaderWithoutImagePayload` 기대 반전(#951 R3 부분 철회) | 반전 |

---

## 9. 문서 동기화 의무

`.claude/memory/feedback_continuous_docs_sync.md` — 별도 docs PR 금지, 이 PR 안에서:

- `migration/decisions/DECISIONS.md` — **D-913-890-10 을 대체/보완하는 신규 결정** 기록. 특히 *"BE 는 디코드 가능성을 보장하지 않는다"* 를 명시적 결정으로 박제
- `docs/dev-reports/2026-07-28-965-document-image-decodability.md` — 신규
- `services/groupware-service/README.md` · `clients/desktop/README.md` — 해당 시 갱신
- `docs/samhan-public-overview.html` — 해당 시 동기화
- 한국어 Javadoc 3-layer(`feedback_function_documentation`)

---

## 10. U-gate (머지 전 PM 1회 실행)

> **이 슬라이스가 끝나면, 결재 문서양식 편집기에서 이미지를 고른 사용자는 그 이미지가 인쇄물에 실제로 나올지를 저장 시점에 알게 된다.**

1. `dev_master` 로 데스크톱(Docker 실서버, mock OFF) → **결재 > 문서양식 관리** → DRAFT 편집기
2. `이미지/로고 추가` → `clients/desktop/public/pwa-192.png` 선택 → 미리보기에 192×192 표시 → 저장 **201**
3. 같은 요소에 PoC `.webp` 선택 → **저장 전에 "표시할 수 없다"는 사실을 사용자가 본다**
4. 2번 양식의 인쇄 미리보기 → 로고가 실제로 그려진다(빈 칸도, 14×16 글리프도 아님)
