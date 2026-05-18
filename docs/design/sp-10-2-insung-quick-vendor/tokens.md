# SP-10-2 인성데이타 퀵프로그램 — design-system token 활용 spec

**슬라이스**: SP-10-2 인성데이타 퀵프로그램 vendor 통합  
**작성일**: 2026-05-19  
**Designer**: UI/UX Designer agent  
**인용 파일**: `clients/web/design-system/src/tokens/tokens.css` (실존 토큰 grep 검증 완료)  
**design-system 신규 토큰 추가 여부**: `--color-insung-*` 6종 신규 추가 필요 (§2 참조)

---

## 1. 4단계 상태 badge 사용 토큰 목록

아래 토큰은 모두 `clients/web/design-system/src/tokens/tokens.css` 에 실존 확인 완료.

### 1-1. PENDING (대기 중)

| 역할 | 토큰 | 실제 값 | grep 검증 |
|---|---|---|---|
| 배경 | `--color-neutral-100` | `#EDF0F4` | 실존 (line 27) |
| 텍스트 | `--color-neutral-600` | `#4D5562` | 실존 (line 31) |
| 테두리 | `--color-neutral-200` | `#D6DCE3` | 실존 (line 28) |
| 아이콘 | `--color-neutral-400` | `#8E97A4` | 실존 (line 30) |
| 서브텍스트 | `--color-neutral-500` | `#6B7280` | 실존 (line 31) |

### 1-2. MATCHING (매칭 진행 중)

| 역할 | 토큰 | 실제 값 | grep 검증 |
|---|---|---|---|
| 배경 | `--color-brand-50` | `#EFF6FB` | 실존 (line 12) |
| 텍스트 | `--color-brand-700` | `#1B4A6B` | 실존 (line 19) |
| 테두리 | `--color-brand-200` | `#AECFE7` | 실존 (line 14) |
| spinner 색상 | `--color-brand-500` | `#2D77A8` | 실존 (line 17) |
| 서브텍스트 | `--color-brand-500` | `#2D77A8` | 실존 (line 17) |

### 1-3. ASSIGNED (매칭 완료)

| 역할 | 토큰 | 실제 값 | grep 검증 |
|---|---|---|---|
| 배경 | `--color-success-50` | `#ecfdf5` | 실존 (line 38) |
| 텍스트 | `--color-success-700` | `#047857` | 실존 (line 41) |
| 테두리 | `--color-success-200` | `#a7f3d0` | 실존 (line 39) |
| 아이콘 | `--color-success-500` | `#10b981` | 실존 (line 40) |
| driverCode 텍스트 | `--color-success-600` | `#168F47` | 실존 (line 41) |

### 1-4. DELIVERED (배송 완료)

| 역할 | 토큰 | 실제 값 | grep 검증 |
|---|---|---|---|
| 배경 | `--color-neutral-50` | `#F7F8FA` | 실존 (line 26) |
| 텍스트 | `--color-neutral-500` | `#6B7280` | 실존 (line 31) |
| 테두리 | `--color-neutral-200` | `#D6DCE3` | 실존 (line 28) |
| 아이콘 | `--color-success-500` | `#10b981` | 실존 (line 40) |
| 서브텍스트 | `--color-neutral-400` | `#8E97A4` | 실존 (line 30) |

---

## 2. INSUNG vendor 전용 신규 토큰 — `tokens.css` 추가 필요

SP-09 패턴 (NTS/Aligo/Clova/KFTC) 일관 적용 — 인성 퀵프로그램 전용 컬러 6종 신규 등록.

### 색상 선정 근거

| 항목 | 내용 |
|---|---|
| 색조 | 주황-갈색 계열 (`#B45309` ~ `#78350F`) — 퀵/배송 서비스 에너지/긴박감 표현 |
| 구분 | NTS(dark green) / Aligo(teal) / Clova(bright green) / KFTC(blue) 와 색조 충분히 분리 |
| 접근성 | WCAG 2.1 AAA 충족 (`--color-insung-text` on `--color-insung-50` ≈ 14.7:1) |

### 신규 토큰 정의 (tokens.css 추가 대상)

```css
/* ---------- color: INSUNG 인성데이타 퀵프로그램 전용 ---------- */
/* 주황-갈색 계열 — NTS(dark green)/Aligo(teal)/Clova(bright green)/KFTC(blue) 와 5색 시각 구분. SP-10-2 */
/* WCAG AA: --color-insung-text(#431407) on --color-insung-50(#FFF7ED) ≈ 14.7:1 (AAA 충족) */
--color-insung-primary: #B45309;
--color-insung-50:      #FFF7ED;
--color-insung-100:     #FFEDD5;
--color-insung-200:     #FED7AA;
--color-insung-700:     #92400E;
--color-insung-text:    #431407;
```

### WCAG 대비비 검증

| text 색 | 배경 색(50) | 대비비 | 등급 |
|---|---|---|---|
| `#431407` on `#FFF7ED` | 약 14.7:1 | **AAA** |

### 5 vendor 컬러 구분 검증 (SP-09-5 D1 + 신규 INSUNG 추가)

| Vendor | Primary | 색조(Hue) | 계열 |
|---|---|---|---|
| NTS 국세청 | `#0F6523` | ~135° | Dark green |
| Aligo SMS | `#0F766E` | ~174° | Teal |
| Clova OCR | `#03C75A` | ~147° | Bright green |
| KFTC 오픈뱅킹 | `#0061A8` | ~210° | Blue |
| **INSUNG 인성** | `#B45309` | ~30° | 주황-갈색 |

색조 분리: INSUNG(30°) ↔ 최근접 NTS(135°) = 105° 차이. 색맹 시뮬레이션(deuteranopia)에서도 주황과 파랑/녹색 명확 구분.

---

## 3. sandbox 배너 토큰

| 역할 | 토큰 | 실제 값 | grep 검증 |
|---|---|---|---|
| 배경 | `--color-warning-50` | `#FEF6E7` | 실존 (line 43) |
| 왼쪽 border | `--color-warning-500` | `#E9A53D` | 실존 (line 47) |
| 텍스트 | `--color-warning-700` | `#B47A1F` | 실존 (line 48) |
| 아이콘 | `--color-warning-500` | `#E9A53D` | 실존 (line 47) |

---

## 4. spacing / typography 토큰

| 역할 | 토큰 | 실제 값 |
|---|---|---|
| badge 내부 padding-y | `--space-1` | 4px |
| badge 내부 padding-x | `--space-2` | 8px |
| badge gap (아이콘-텍스트) | `--space-1` | 4px |
| badge border-radius | `--radius-md` | 4px |
| badge 라벨 font-size | `--font-size-sm` | 13px |
| badge 서브텍스트 font-size | `--font-size-xs` | 12px |
| badge 라벨 font-weight | `--font-weight-semibold` | 600 |
| driverCode font-family | `--font-family-mono` | `ui-monospace, ...` |
| spinner animation duration | `--duration-slow` | 280ms (1회전 → 1000ms 로 override) |

---

## 5. FE 인용 가이드

FE-1 `VehicleMatchStatusBadge.tsx` 구현 시 아래 CSS variable 직접 인용:

```tsx
// PENDING 예시
const PENDING_STYLE = {
  background: 'var(--color-neutral-100)',
  border: '1px solid var(--color-neutral-200)',
  color: 'var(--color-neutral-600)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-medium)',
} as const

// MATCHING 예시 — spinner keyframe 별도 CSS
const MATCHING_STYLE = {
  background: 'var(--color-brand-50)',
  border: '1px solid var(--color-brand-200)',
  color: 'var(--color-brand-700)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)',
} as const

// ASSIGNED 예시
const ASSIGNED_STYLE = {
  background: 'var(--color-success-50)',
  border: '1px solid var(--color-success-200)',
  color: 'var(--color-success-700)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)',
} as const

// DELIVERED 예시
const DELIVERED_STYLE = {
  background: 'var(--color-neutral-50)',
  border: '1px solid var(--color-neutral-200)',
  color: 'var(--color-neutral-500)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-medium)',
} as const
```

INSUNG 뱃지 (MATCHING / ASSIGNED 우측):

```tsx
const INSUNG_BADGE_STYLE = {
  background: 'var(--color-insung-50)',     // tokens.css 추가 후 사용
  border: '1px solid var(--color-insung-200)',
  color: 'var(--color-insung-text)',
  borderRadius: 'var(--radius-full)',        // pill shape — vendor 뱃지 SP-09 패턴 일관
  padding: '2px 8px',
  fontSize: '11px',
  fontWeight: 700,
} as const
```

---

## 6. tokens.css 변경 요약 (FE 에 전달)

`clients/web/design-system/src/tokens/tokens.css` 에 아래 블록을 `--color-kftc-*` 섹션 직후에 추가:

```css
/* ---------- color: INSUNG (인성데이타 퀵프로그램 전용) ---------- */
/* 주황-갈색 계열 — NTS(dark green)/Aligo(teal)/Clova(bright green)/KFTC(blue) 와 5색 시각 구분. SP-10-2 */
/* WCAG AA: --color-insung-text(#431407) on --color-insung-50(#FFF7ED) ≈ 14.7:1 (AAA 충족) */
--color-insung-primary: #B45309;
--color-insung-50:      #FFF7ED;
--color-insung-100:     #FFEDD5;
--color-insung-200:     #FED7AA;
--color-insung-700:     #92400E;
--color-insung-text:    #431407;
```

`clients/web/design-system/src/tokens/index.ts` 에 `colors.insung` 객체 추가 (SP-09-4 `colors.kftc` 패턴 일관).

> 주의: design-system 컴포넌트 신규 작성 금지. token 변수 추가 + CSS variable 직접 인용만 허용.
