# #965 — 문서양식 이미지 계약 재정의 (기획)

> 작성 2026-07-28 · OPUS 기획 · 근거 SHA `40c415426` · 브랜치 `fix/965-document-image-decodability`
> 연관 Issue: #965 · 선행 #913 · #890 · PR #951(`dccf6a917`)

---

## 0. 이 기획이 답하는 질문

이슈는 **"VP8L version 비트를 검사하지 않는다"** 를 원인으로 지목했습니다. 그것은 사실입니다(§1 에서 실행으로 확증).

그러나 이 기획은 **그 비트를 막는 fix 를 채택하지 않습니다.** 같은 계열이 #951 라운드에서 이미 네 번 나왔고, R6·R7 이 무작위 변이 300,000회를 포함한 소진 검증을 하고도 다섯 번째를 못 막는다는 것이 실측으로 드러났기 때문입니다.

**진짜 결함은 계약입니다.** 그리고 §3 의 실측이 보여주듯, **계약은 BE 에 디코더를 들여도 성립하지 않습니다** — 그것은 이 기획의 가장 중요한 발견이며, 권고안의 근거입니다.

---

## 1. 진단 확증 — 이슈의 실측 4줄을 전부 재현했다

모든 수치는 이 워크트리에서 **실행**한 결과입니다. 하네스는 스크래치패드에 있고 제품 코드는 건드리지 않았습니다.

### 1.1 이슈 원문 4줄 재현

| 항목 | 이슈 원문 | 재현 결과 | 하네스 |
|---|---|---|---|
| `FE_IS_ALLOWED_IMAGE_SOURCE` | `true` | **`true`** | `templateSchema.ts` 를 esbuild 번들 → node 직접 호출 |
| `BE_DOCUMENT_PAYLOAD_VALIDATOR` | `ACCEPTED` | **`ACCEPTED`** | 컴파일된 `DocumentPayloadValidator.class` 를 리플렉션 호출 |
| `VP8L_VERSION` | `1` | **`1`** | 바이트 파싱 |
| `CHROMIUM` | `{"event":"error",…}` | **정확히 일치** | Playwright Chromium 147.0.7727.15 |

실행 원문:

```text
FE_IS_ALLOWED_IMAGE_SOURCE=true          ← FE_SOURCE_IDENTICAL_TO_WORKTREE 확인 후 측정

JAVA=17.0.19
CLASS=file:/D:/dev/Samhan-Public/.claude/worktrees/965-imgvalid/services/groupware-service/build/classes/java/main/
IMAGEIO_WEBP_READERS=0  (png=1, jpeg=1)

POC_VP8L_VERSION_1
  BYTES=26  MIME=webp
  BE_validImageSource=true
  BE_isStructurallyValidWebp=true
  BE_DOCUMENT_PAYLOAD_VALIDATOR=ACCEPTED        ← 전체 문서 payload 경계(TITLE/APPROVAL_GRID/CLOSING+IMAGE)

CHROMIUM_VERSION=147.0.7727.15
POC_VP8L_VERSION_1={"event":"error","complete":true,"naturalWidth":0,"naturalHeight":0}  BYTES=26
```

> ⚠️ **주의** — 메인 레포에 있던 `DocumentPayloadValidator.class` 는 **Jul 23 빌드**로 소스(Jul 28)보다 낡아 있었습니다. 워크트리에서 `:services:groupware-service:compileJava` 를 다시 돌려 **현재 소스로 컴파일된 클래스**를 측정 대상으로 삼았습니다.

### 1.2 바이트 해부

```text
HEX= 52 49 46 46 12 00 00 00 57 45 42 50 56 50 38 4c 06 00 00 00 2f 03 c0 00 20 00
     └─ RIFF ─┘ └ size=18 ┘ └─ WEBP ─┘ └─ VP8L ─┘ └ size=6 ┘ └────── payload ──────┘
LEN=26  WIDTH=4 HEIGHT=4 ALPHA=0 VP8L_VERSION=1
```

### 1.3 🔑 인과 확증 — **단 1바이트**가 판정을 뒤집는다

version 3비트만 0~7 로 바꾸고 나머지 바이트는 전부 동일하게 유지한 A/B:

```text
=== A/B: 동일 바이트, version 3비트만 상이 ===
  VP8L_VERSION=0  BYTES=26  HEX_TAIL=2f03c0000000  CHROMIUM={"event":"load","complete":true,"naturalWidth":4,"naturalHeight":4}
  VP8L_VERSION=1  BYTES=26  HEX_TAIL=2f03c0002000  CHROMIUM={"event":"error","complete":true,"naturalWidth":0,"naturalHeight":0}
  VP8L_VERSION=2  BYTES=26  HEX_TAIL=2f03c0004000  CHROMIUM={"event":"error",…}
  VP8L_VERSION=3..7                                CHROMIUM={"event":"error",…}   (전부 error)
  차이 바이트: byte[24] 0x20->0x00  (그 외 전부 동일)
```

⟹ **version 0 만 디코드되고 1~7 은 전부 실패한다. 차이는 `byte[24]` 한 바이트뿐이다.**

### 1.4 지목된 줄(`DocumentPayloadValidator.java:444`)은 **원인이 맞다** — 계측 확증

`isStructurallyValidVp8l` 를 리플렉션으로 직접 호출한 결과 PoC 에 대해 `true` 를 반환하고, 그것이 `isStructurallyValidWebp` 를 `true` 로 만듭니다(`BE_isStructurallyValidWebp=true`). 해당 줄의 판정식은 version 비트를 참조하지 않습니다:

```java
private static boolean isStructurallyValidVp8l(byte[] bytes, int dataOffset, long chunkSize) {
    // 0x2F + 4바이트 packed canvas는 헤더일 뿐이며, 뒤에 실제 bitstream payload가 있어야 한다.
    return chunkSize > 5 && (bytes[dataOffset] & 0xFF) == 0x2F;
}
```

**원인 확증.** 다만 §3 이 보이듯 이것은 **원인이지 결함의 경계가 아닙니다.**

### 1.5 실 사용자 경로 전체 추적

| 단계 | 위치 | 이 PoC 에 대한 동작 |
|---|---|---|
| 파일 선택 | `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx:245-273` (`accept="image/png,image/jpeg,image/webp"`) | **통과** — `FileReader.readAsDataURL` 후 `isAllowedImageSource` 만 검사 |
| FE 허용검사 | `clients/desktop/src/renderer/print/templateSchema.ts:389-406` | **통과**(`true`) — 시그니처 12바이트 + 크기만 |
| BE 검증 | `services/groupware-service/.../DocumentPayloadValidator.java:444` | **통과** — 구조만 |
| BE 저장 | `services/groupware-service/.../DocumentTemplateService.java:70` | **201 저장** — 이후 append-only revision(V12/V13)에 각인 |
| 편집기 미리보기 | `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx:275-277` → `DocumentRenderer` | **깨짐**, 고지 없음 |
| 결재 인쇄 | `clients/desktop/src/renderer/print/ApprovalDocView.tsx:302` → 같은 `DocumentRenderer` | **깨짐**, 고지 없음 |
| 이미지 렌더 | `clients/desktop/src/renderer/print/DocumentRenderer.tsx:239-260` | `<img>` — **`onError` 핸들러 0건** |

**어디서도 조용히 실패하지 않는 지점이 없습니다.**

### 1.6 "인쇄할 때 조용히 빈 칸" — 실측은 **거의** 맞지만 정확히는 다르다

증거 무결성 의무에 따라 정정합니다. 실제 인쇄 산출물(Playwright `page.pdf()`, A4)의 XObject 를 뜯어보면:

```text
PDF_BYTES=52257
IMAGE_XOBJECTS=4
DRAW_IMAGE_OPS(Do)=2  /X5 Do, /X9 Do
XObject#1 171x150 filter=FlateDecode   ← 정상 이미지(마스코트 첫 프레임)
XObject#3  14x16  filter=FlateDecode   ← 깨진 이미지 자리에 그려진 브로큰 아이콘
```

⟹ **완전한 빈 칸은 아니고, 53mm×34mm 상자 안에 14×16px 브로큰 글리프가 찍힙니다.** 설명 문구는 없습니다. 실무적으로는 "빈 칸"과 구별되지 않지만, 기획 문서가 사실과 다른 단정을 물려주지 않도록 정확히 적습니다.

**단, 더 조용한 분기가 따로 있습니다** — `DocumentRenderer.tsx:240` 은 `isAllowedImageSource` 가 false 면 `return null` 로 **요소를 통째로 지웁니다.** alt 도 남지 않고 "여기 이미지가 있었다"는 신호가 0입니다. FE allowlist 가 나중에 좁아지면 **이미 저장된 이미지가 소리 없이 사라집니다.**

### 1.7 도달성 보정 — 결재 인쇄는 지금 **막혀 있다**

`DocumentTemplateService.java:31` `ADVANCED_ACTIVATION_GATE_ENABLED = true` → `:117-120` 이 DETAIL/IMAGE 포함 양식의 **ACTIVE 활성화를 422 로 거부**합니다. 따라서 **오늘** 깨진 이미지가 도달하는 곳은 **편집기 미리보기**까지이고, 결재 인쇄물까지는 아직 못 갑니다.

**그럼에도 도달 가능한 결함입니다:**
1. 편집기 미리보기 자체가 실 사용자 화면입니다.
2. 저장된 payload 는 **append-only 이력에 영구 각인**되고, 게이트는 "자동 업데이트 선행 후 제거"가 예정된 임시 장치입니다(`:30` 주석). 게이트가 열리는 순간 이미 저장된 깨진 이미지가 결재 인쇄물로 나갑니다.

---

## 2. 기존 결정 교차검증 — 모순 없음, 그리고 **이미 열려 있는 문**

| 결정 | 원문 위치 | 이 기획과의 관계 |
|---|---|---|
| **D-DS4-03** — IMAGE source 는 `/print-logo.svg` 또는 50KB 이하 PNG/JPEG/WebP data URL 만 | `migration/decisions/DECISIONS.md:3075` | **유지** |
| **D-913-890-10** — WebP 는 구조 검사만. *"전면 디코더 없이는 **100% 보장 불가**라는 한계를 그대로 남긴다"* | `migration/decisions/DECISIONS.md:3096` | **모순 없음.** 결정문이 스스로 남긴 한계가 터진 것 |
| 개발책임자 불변식 1 — *"업로드가 성공한 이미지는 문서 렌더·인쇄 경로에서 깨지지 않는다"* | PR #951 코멘트 2026-07-27T12:53:10Z | **I-1 로 계승** |
| 개발책임자 불변식 2 — *"보장할 수 없는 포맷이라면 사용자가 **업로드 시점에 그 한계를 알 수 있어야** 한다"* | 같은 코멘트 | 🔑 **권고안의 직접 근거 — 이 문이 이미 열려 있다** |
| 개발책임자 불변식 3 — *"정상 WebP 업로드가 막히면 안 된다. 전면 거부를 택하려면 **제품 동작 변경**임을 인지하고 근거를 PR 에 명시"* | 같은 코멘트 | **I-3 로 계승.** 전면 거부안은 §4 에서 버림 |
| R5 회귀 fix 근거 — 애니메이션 WebP 허용 | `docs/dev-reports/2026-07-27-913-890-verify-quality.md:903-905` | **유지** — 울타리에 필수 포함 |

### 🔑 "BE 에 디코더를 들이지 않는다" 는 결정은 **존재하지 않는다**

존재하는 것은 `docs/dev-reports/2026-07-27-913-890-verify-quality.md:823` 의

> **JDK 표준 API만으로 WebP 전체 디코더를 새로 도입하는 것은 이 범위를 넘어가므로**, 저장 계약에 필요한 구조 검사를 적용하고…

뿐입니다. **외부 라이브러리(TwelveMonkeys 등) 검토 흔적은 어느 문서에도 0건**입니다. 즉 §4-B 는 기존 결정 위반이 아니라 **미검토 영역**이며, 그래서 이 기획이 실측으로 판정합니다.

### 🚨 #913 이 지적했는데 #951 에서 **고쳐지지 않은** 항목

#913 항목 6:

> 오류 문구(`:222`)는 *"실제로 열 수 있는 PNG/JPEG/WebP"* 라 **보장보다 넓습니다.** 검증품질이 아니라 **도달 가능한 LOW 결함**입니다.

현재도 그대로입니다 — `DocumentPayloadValidator.java:222`:

```java
reject("IMAGE 요소 src는 실제로 열 수 있는 PNG/JPEG/WebP 이미지여야 합니다.");
```

**이 문구가 바로 계약 불일치의 코드상 좌표입니다.** validator 는 "구조가 그럴듯한가"를 검사하면서 사용자에게 "실제로 열 수 있는"이라고 말합니다.

---

## 3. 🚨 핵심 실측 — **BE 에 디코더를 들여도 계약은 성립하지 않는다**

이것이 이 기획에서 가장 중요한 측정입니다.

PNG 는 BE 가 **이미 진짜 디코더를 돌리는** 포맷입니다(`ImageIO.read(...) != null`, `DocumentPayloadValidator.java:291`). 그런데도 ImageIO 의 판정과 실제 렌더 엔진의 판정이 갈립니다. 저장소 실 자산 `clients/desktop/public/pwa-192.png` 에서 출발해 **실 경로가 만들 수 있는 변형**(전송 중단·비트 뒤집힘)만 만들어 측정했습니다:

```text
PNG_BASE_UNTOUCHED                   BYTES=2743  CHROMIUM=ok 192x192   BE=ACCEPTED    일치
PNG_IDAT_CRC_CORRUPT                 BYTES=2743  CHROMIUM=ok 192x192   BE=ACCEPTED    일치
PNG_TRUNCATED_NO_IEND                BYTES=2731  CHROMIUM=ok 192x192   BE=ACCEPTED    일치
PNG_IDAT_HALF_TRUNCATED              BYTES=1409  CHROMIUM=ok 192x192   BE=REJECTED  ← 어긋남
PNG_IDAT_PAYLOAD_CORRUPT_CRC_FIXED   BYTES=2743  CHROMIUM=ok 192x192   BE=REJECTED  ← 어긋남
```

### 판정이 갈리는 전체 목록 (양방향)

| 입력 | BE(현행) | Chromium `<img>` | 방향 |
|---|---|---|---|
| `POC_VP8L_VERSION_1` | ACCEPT | **error** | **false-accept** ← 이 이슈 |
| `TEST_headerOnlyWebpVp8L_4x4` | REJECT | **load 4x4** | false-reject |
| `PNG_IDAT_HALF_TRUNCATED` | REJECT | **load 192x192** | false-reject |
| `PNG_IDAT_PAYLOAD_CORRUPT_CRC_FIXED` | REJECT | **load 192x192** | false-reject |

⟹ **세 가지가 동시에 참입니다:**

1. 현행 validator 는 **디코드 불가를 통과시킨다**(이 이슈).
2. 현행 validator 는 **디코드 가능한 것도 거부한다** — I-3 방향 위반이 **이미 3형태 존재**한다. `R3_webp_rejectsVp8lHeaderWithoutImagePayload` 는 Chromium 이 4x4 로 잘 그리는 입력을 거부하도록 **테스트가 고정하고 있다.**
3. **BE 에 디코더를 들여도 2번은 해결되지 않는다** — PNG 는 이미 진짜 디코더인데도 어긋난다. 디코더를 바꾸는 것은 **판정 주체를 바꿀 뿐** 렌더 결과와 일치시키지 못한다.

> 🔑 **"디코드 가능"은 단일한 사실이 아니라 *어느 디코더에게 묻느냐*의 함수입니다.** 그리고 I-1 이 말하는 "깨지지 않는다"의 유일한 판정자는 **실제로 그 이미지를 그리는 엔진**입니다.

### 부수 실측 — 같은 엔진 안에서도 API 마다 판정이 다르다

```text
NAME                                    BYTES  img.decode()      createImageBitmap()
POC_VP8L_VERSION_1                         26  REJECT(EncodingError)  REJECT(InvalidStateError)
TEST_minimalValidWebpVp8_4x4               30  ok 4x4                 REJECT(InvalidStateError)
TEST_minimalValidWebpVp8L_4x4              26  ok 4x4                 REJECT(InvalidStateError)
TEST_minimalValidWebpVp8xWithVp8Image      48  ok 4x4                 REJECT(InvalidStateError)
TEST_headerOnlyWebpVp8L_4x4                26  ok 4x4                 REJECT(InvalidStateError)
ANIM_FRAME_FROM_MASCOT                   8876  ok 171x150             ok 171x150
REAL_pwa-192.png                         2743  ok 192x192             ok 192x192
REAL_splash.png                          4040  ok 480x320             ok 480x320
```

**구현자를 위한 실측 함정** — 렌더 경로는 `<img>` 이므로 `<img>` 가 그릴 수 있는지가 정답입니다. 픽셀 버퍼를 요구하는 판정 수단은 위 4형태를 과잉 거부해 **I-3 을 깹니다**. 수단은 구현자가 정하되, 어떤 수단을 고르든 **§5 울타리 전체가 통과해야** 합니다.

**비용**: 렌더 엔진 디코드 판정의 소요는 위 전 케이스에서 **중앙값 0.10 ms**(20회 반복), 새 의존성 0.

---

## 4. 계약 설계 — 선택지 비교

### 불변식 (확정)

- **I-1** 저장에 성공한 이미지는 **미리보기·인쇄에서 깨지지 않는다.** 보장할 수 없다면 **사용자가 저장 시점에 안다.** 인쇄할 때 아무 설명 없이 사라지면 안 된다.
- **I-2** **형태 수와 무관하게 성립한다** — 아직 아무도 안 본 형태에서도.
- **I-3** **정상 이미지를 거부하지 않는다** — §3 이 보이듯 이 위반은 가설이 아니라 **이미 3형태 실재**한다.

### 선택지

| # | 안 | I-1 | I-2 | I-3 | 비용·파급 |
|---|---|:--:|:--:|:--:|---|
| **A** | **version 비트 검사 추가**(이슈 지목 fix) | ▲ | ❌ | ❌ | 0. 네 번째 형태만 막고 다섯 번째는 남음. §3 의 false-reject 3형태는 그대로 |
| **B** | **BE 에 이미지 디코더 도입**(외부 라이브러리 or 컨테이너 동봉 Chromium) | ▲ | ▲ | ❌ | **최대**. 네이티브 의존성·컨테이너 크기·부팅·CVE 표면·`MAX_DECODED_IMAGE_BYTES` 예산 재설계. **그리고 §3 이 반증** — PNG 는 이미 진짜 디코더인데 어긋난다 |
| **C** | **계약을 낮춰 명시만** (BE 는 "구조 검사"만 보장한다고 문구·문서 정정) | ❌ | ⭕ | ⭕ | 0. 정직해지지만 **사용자는 여전히 깨진 이미지를 저장하고 모른다** |
| **R** | **권고안 = 판정 주체를 렌더 엔진으로 옮기고(C1), BE 계약을 실제 보장에 맞추고(C2), 렌더 실패를 보이게 한다(C3)** | ⭕ | ⭕ | ⭕ | 낮음. 의존성 0, 0.10ms |

> ▲ = 부분 충족 · ❌ = 불충족 · ⭕ = 충족

### 🎯 권고안 R — 세 조각이 하나의 계약

**C1. 판정 주체 = 그 이미지를 실제로 그릴 엔진.**
저장 요청이 성공하기 전에, **그 이미지를 렌더할 엔진이 디코드에 성공했다는 사실이 확인**되어야 한다. 형태를 세지 않고 엔진에게 직접 묻으므로 **I-2 를 구조적으로 만족**하고, 렌더되는 것은 정의상 디코드되므로 **I-3 을 구조적으로 만족**한다.

**C2. BE 계약 = 실제 보장 범위로 진술.**
BE 는 디코드 가능성을 보장하지 **않는다**(실측: WebP reader 0개, PNG 조차 렌더 엔진과 어긋남). 사용자 대면 문구·Javadoc·결정 문서를 이 사실에 맞춘다. BE 는 계속 **포맷 allowlist·크기 상한·자원 예산·구조 상한**을 지킨다 — 이건 보안 축이고 그대로 필요하다. **디코드 가능성 주장만 걷어낸다.**

**C3. 렌더 실패는 조용하지 않다.**
어떤 경로로 들어왔든 저장된 이미지가 렌더에서 디코드에 실패하면 사용자가 알 수 있어야 한다. `return null` 로 요소를 지우거나 14×16 글리프만 남기는 현재 동작은 I-1 후단("조용히 사라지면 안 된다")을 만족하지 못한다.

**왜 셋이 다 필요한가** — C1 만으로는 편집기를 우회한 직접 API 호출을 막지 못하고, C2 만으로는 사용자가 여전히 모르며, C3 만으로는 이미 저장된 뒤라 늦다. C1 이 정상 경로를 닫고, C2 가 거짓 약속을 걷어내고, C3 이 남은 모든 경로에 최종 안전망을 놓는다.

### 버린 이유 (명시)

- **A** — 이슈가 명시적으로 권하지 않았고, I-2 를 만족하지 못한다. R6·R7 이 무작위 변이 300,000회로도 다섯 번째 형태를 배제하지 못한다는 것이 이미 실측됐다.
- **B** — **§3 이 실측으로 반증**한다. PNG 에서 이미 진짜 디코더(ImageIO)를 돌리는데도 렌더 엔진과 2형태 어긋난다. 디코더 도입은 "형태 목록"을 "라이브러리 목록"으로 바꿀 뿐이다. 비용은 가장 크고(네이티브 바이너리·컨테이너·예산 재설계) 얻는 것은 없다. ※ `services/arologis-service/build.gradle:71-72` 가 컨테이너에 Chromium 을 동봉하는 선례이긴 하나, groupware-service 로 끌어오는 것은 **새 표면**이고 §3 의 반증을 뒤집지 못한다.
- **C 단독** — 정직해지지만 I-1 을 포기한다. 개발책임자 불변식 1 이 살아 있으므로 단독 채택 불가.
- **WebP 전면 거부** — 개발책임자 불변식 3 위반이고(저장소 자산이 WebP), §3 에 따라 PNG 만 남겨도 계약은 여전히 성립하지 않으므로 얻는 것이 없다.

---

## 5. 회귀 울타리 — **실재 자산으로만**

`.claude/memory/feedback_fixture_must_be_reachable_by_real_path.md` 에 따라 **합성 fixture 로 울타리를 세우지 않습니다.**

### 실재 자산 인벤토리 (실측)

```text
git ls-files "*.webp"  →  1건   clients/web/design-system/src/assets/mascot/samhani.webp  (71,880 B)
git ls-files "*.png"   →  4,772건
git ls-files "*.jpg" "*.jpeg" → 0건
```

### 🚨 반드시 통과해야 하는 것 (I-3 울타리)

| 자산 | 바이트 | Chromium | 근거 |
|---|---|---|---|
| **마스코트 애니메이션 WebP 첫 프레임**(`samhani.webp` 파생, 8,876 B) | 8,876 | `load 171x150` | **R5 에서 실제로 회귀가 났던 형식.** 필수 |
| `clients/desktop/public/pwa-192.png` | 2,743 | `load 192x192` | 실 자산 |
| `clients/desktop/public/pwa-512.png` | 9,707 | `load 512x512` | 실 자산(50KB 상한 근처 아님, 여유 확인용) |
| `clients/desktop/android/.../drawable/splash.png` | 4,040 | `load 480x320` | 실 자산(비정사각) |
| `clients/desktop/android/.../mipmap-mdpi/ic_launcher.png` | 1,869 | `load 48x48` | 실 자산(최소) |
| `/print-logo.svg` (경로 리터럴) | — | — | D-DS4-03 이 명시 허용 |

> ⚠️ **`samhani.webp` 원본(71,880 B)은 50KB 상한을 넘어 FE·BE 모두 거부**됩니다(실측 `FE_IS_ALLOWED_IMAGE_SOURCE=false`). 그래서 울타리는 기존 테스트와 같이 **첫 ANMF 프레임 파생본**(8,876 B)을 씁니다. 이 파생본은 실 인코더가 쓴 청크를 그대로 담고 있고 Chromium 이 `171x150` 으로 디코드하지만, **원본 파일 그 자체는 아닙니다.** 이 한계를 테스트 주석에 남기십시오.

### 🚨 반드시 거부되어야 하는 것 (I-1 울타리)

| 입력 | 근거 |
|---|---|
| `UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA=` (VP8L version=1) | 이 이슈 |
| version 2~7 변형 6종 | §1.3 — 전부 Chromium error |

### 🚨 재검토 대상 — 지금 테스트가 **틀린 것을 고정**하고 있다

`DocumentPayloadValidatorTest.R3_webp_rejectsVp8lHeaderWithoutImagePayload` 는 Chromium 이 **`load 4x4` 로 정상 디코드하는 입력**의 거부를 요구합니다. C1 을 채택하면 이 테스트는 실패합니다 — **fix 가 틀려서가 아니라 테스트가 렌더 현실과 다른 세계를 고정하고 있어서**입니다.

같은 계열로, `R1_4_webp_acceptsStructurallyValid*` 3종이 쓰는 합성 4x4 fixture 는 `<img>` 로는 그려지지만 픽셀 버퍼 API 로는 디코드되지 않는 **퇴화 입력**입니다(§3 부수 실측). **실 자산으로 대체하는 것이 원칙에 맞습니다.**

⟹ 구현자는 이 세 테스트의 처분을 **PR 에 명시적으로 기록**해야 합니다. 조용히 지우면 안 됩니다.

---

## 6. 계열 전수 sweep — 형제 표면

`.claude/memory/feedback_defect_family_sweep_fix.md` 에 따라 동일 패턴을 전수 grep 했습니다.

```text
grep -rln "RIFF\|WEBP" --include="*.java" services/
  → services/groupware-service/.../DocumentPayloadValidator.java        (이 슬라이스 대상)
  → services/groupware-service/.../DocumentPayloadValidatorTest.java    (테스트)
  → services/dashboard-service/.../AppNoticeService.java                ← 형제 표면
```

**`AppNoticeService.java:291-302`** 는 WebP 를 **12바이트 RIFF/WEBP 시그니처만** 보고 통과시킵니다 — **#951 이전 groupware 와 정확히 같은 상태**이며, 표면은 더 넓습니다(`:40-45` GIF 까지 허용, `MAX_IMAGE_SIZE_BYTES` = 5MB = 문서양식의 100배).

**처분** — §8 개발책임자 결정 항목 ②로 올립니다. 이 슬라이스에 포함할지는 범위 결정이고, `feedback_expanded_scope_reinstate_review` 에 따라 포함 시 리뷰 범위가 커집니다.

---

## 7. U-gate — 머지 전 PM 이 1회 실행

> **이 슬라이스가 끝나면, 결재 문서양식 편집기에서 이미지를 고른 사용자는 그 이미지가 인쇄물에 실제로 나올지를 저장 시점에 알게 된다.**

**시나리오 (실데이터·실서버):**

1. `dev_master` 로 데스크톱(Docker 실서버, mock OFF) 로그인 → **결재 > 문서양식 관리** → DRAFT 양식 편집기 진입
2. `이미지/로고 추가` → 파일 선택에서 **저장소 실 자산** `clients/desktop/public/pwa-192.png` 선택 → **미리보기에 192×192 로고가 보이고**, 저장 → **201**
3. 같은 요소에 이번엔 **PoC 파일**(`UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA=` 를 `.webp` 로 저장한 것) 선택 → **저장에 도달하기 전에 사용자가 "이 이미지는 표시할 수 없다"는 사실을 본다**(문구·수단은 구현자 재량)
4. 2번에서 저장된 양식의 **인쇄 미리보기**를 열어 로고가 실제로 그려지는지 확인 — 빈 칸도, 브로큰 글리프도 아니어야 한다

**증거**: 각 단계 실 GUI 스크린샷.

---

## 8. 개발책임자 결정이 필요한 항목

### ① C3 의 표시 방식 — **무결성 도메인 정책**

저장된 이미지가 렌더에서 디코드에 실패했을 때 **결재 인쇄물에 무엇을 찍을 것인가**는 제품 결정입니다.

- (가) 인쇄물에 "이미지를 표시할 수 없습니다" 류 표시를 남긴다 → 대외 문서에 오류 문구가 찍힌다
- (나) 인쇄물은 지금처럼 두되, **인쇄 이전 단계**(편집기·활성화·인쇄 미리보기)에서만 경고한다
- (다) 그 밖

`feedback_integrity_domain_policy_preconfirm`(회계원장·감사·결재 정책은 착수 전 선확인)에 해당합니다.
**PM 권고: (나)** — I-1 후단은 "사용자가 안다"이지 "인쇄물에 찍는다"가 아니고, 결재 문서의 대외 형식을 바꾸는 쪽이 파급이 큽니다.

### ② 형제 표면(`AppNoticeService`, 팝업공지 이미지 업로드)을 이 슬라이스에 포함할지

- 포함 → `feedback_defect_family_sweep_fix`(계열 전수) 충족. 단 다른 서비스·다른 계약(5MB·GIF·MinIO)이라 범위가 커지고 `feedback_expanded_scope_reinstate_review` 가 발동
- 미포함 → 처분표에만 기록. 단 새 이슈 등록은 금지되어 있으므로 **기록만 남고 소진되지 않음**

**PM 권고: 미포함 + 처분표 명시.** 계약 축이 다릅니다(문서양식=인쇄물 진실성 / 팝업공지=화면 표시). 다만 개발책임자 판단을 받습니다.

### ③ `R3_webp_rejectsVp8lHeaderWithoutImagePayload` 의 처분

Chromium 이 정상 디코드하는 입력의 거부를 요구하는 테스트입니다. C1 채택 시 이 요구는 **I-3 위반**이 됩니다.
**PM 권고: 테스트 기대를 뒤집는다**(거부 → 허용). 단 #951 R3 이 명시적으로 추가한 것이라 기존 결정의 부분 철회이므로 기록이 필요합니다.

---

## 9. 범위 밖 (명시)

- `MAX_IMAGE_BYTES`(50KB)·`MAX_DECODED_IMAGE_BYTES`(64MiB) 등 **자원 예산은 건드리지 않는다** — H15 계열 결정 유지
- **활성화 게이트**(`ADVANCED_ACTIVATION_GATE_ENABLED`) 해제는 이 슬라이스가 아니다
- `AppNoticeService`(§8-②의 결정에 따름)
- 마스코트 원본(71,880 B)을 50KB 상한 안에 넣는 문제 — 별개 축
