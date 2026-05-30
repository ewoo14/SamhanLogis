# Designer Review — Phase 2.4 PartnerOrderVersionHistoryPanel (Cycle 2)

**리뷰어**: Claude Designer
**날짜**: 2026-05-30
**브랜치**: feat/phase-2-4-partner-order-restore (HEAD 6a36e08e)
**대상**: `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`
**목적**: Cycle 1 결함(D-1~D-5) fix cross-check + 신규 결함 탐지

---

## 종합 판정

**Designer CONDITIONAL APPROVE (cycle2)** — D-1/D-2/D-3/D-4/D-5 모두 반영 확인. 단, fix 과정에서 신규 Minor 결함 3건(N-1~N-3) 발견. 접근성/기능상 차단 결함(P1)은 없음. Minor 3건은 다음 슬라이스 일괄 처리 허용.

---

## Cycle 1 결함 fix 검증

### D-1 (P1): 토스트 role=alert 분기 — 완전 반영

- **cycle1 지적**: 토스트 컨테이너 전체에 `role="status"` 고정 → warning/danger 시 즉시 인터럽트 미달.
- **현재 코드** (L215):
  ```
  role={toast.kind === 'success' ? 'status' : 'alert'}
  ```
- **검증**: success → `role="status"` (polite 알림), warning → `role="alert"`, danger → `role="alert"`. 설계서 §3 "warning+role=alert" 기준 충족.
- **판정**: D-1 FIX 완료.

---

### D-2 (P2): 닫기 버튼 × (U+00D7) — 완전 반영

- **cycle1 지적**: `x` (ASCII 소문자 알파벳) — partner 2.3 `×` HTML entity 불일치.
- **현재 코드** (L254): `&times;`
- **검증**: `&times;` = HTML named entity → U+00D7 (×, MULTIPLICATION SIGN). partner 2.3 L203 `×` 와 동일 코드포인트. 시각 일관성 충족.
- **추가 차이점**: partner 2.3 은 네이티브 `<button>` 사용, 2.4 는 DS `<Button variant="ghost" size="sm">` 사용. DS Button 전환은 의도된 개선(ghost variant = 배경 없는 텍스트 버튼, 시각적 방해 없음). size="sm" 으로 높이 압축되어 토스트 상단 정렬(`alignItems: 'flex-start'`)과 시각 균형 유지. 일관성 적절.
- **판정**: D-2 FIX 완료.

---

### D-3 (P2): STATUS badge variant success → brand — 완전 반영

- **cycle1 지적**: STATUS variant='success'(초록) = 긍정/부정 혼재 이벤트에 완료 오해 유발.
- **현재 코드** (L59): `STATUS: { label: '상태변경', variant: 'brand' }`
- **검증**: DS Badge.tsx L4 `BadgeVariant = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'nts'` — brand 실재 variant 확인. Badge.module.css `.variant-brand` = `--color-brand-50` bg + `--color-brand-700` text (파란 계열). 상태변경 이벤트의 중립적 정보성 색상으로 적절. Javadoc L51 에 의사결정 근거 기록됨("success=초록은 완료 오해 유발").
- **판정**: D-3 FIX 완료 + DS variant 실재 확인.

---

### D-4 (Minor): marginLeft 토큰화 — 완전 반영

- **cycle1 지적**: `marginLeft: 8` 하드코딩 — DS 토큰 미사용.
- **현재 코드** (L252): `marginLeft: 'var(--space-2)'`
- **검증**: tokens.css L150 `--space-2: 8px` 확인. 토큰 일관성 충족.
- **판정**: D-4 FIX 완료.

---

### D-5 (Minor): slipResyncRequired 경고 문구 + 시각 강조 — 부분 반영

- **cycle1 지적**: 1줄 과밀 + 시각 강조 없음. 분리 + 아이콘/bold 권장.
- **현재 코드** (L167):
  ```
  text: `rev ${revisionNo} 시점으로 주문을 복원했습니다.\n⚠ 출고전표가 발행된 주문입니다. 연결 전표 재발행을 확인하세요.`
  ```
  렌더: `<span style={{ whiteSpace: 'pre-line' }}>` (L246)
- **검증**:
  - `\n` + `whiteSpace: 'pre-line'` → 브라우저에서 실제 줄바꿈으로 렌더링. 2줄 분리 충족.
  - `⚠` 유니코드 문자(U+26A0 WARNING SIGN) 인라인 삽입으로 시각 강조 제공.
  - "출고전표가 발행된 주문" → "연결 전표 재발행을 확인하세요" 로 문구 압축·명료화 완료.
  - cycle1 의 "Bold 처리 권장"은 미반영 — 그러나 ⚠ 아이콘 + 줄바꿈으로 충분한 시각 차별화 달성. Bold 미반영은 허용 가능.
- **판정**: D-5 핵심(줄바꿈+아이콘) FIX 완료. Bold 처리는 Minor 수준이며 ⚠ 대체로 허용.

---

## 신규 결함 탐지

### N-1 (Minor): 토스트 fallback hex 값 3건 tokens.css 불일치

fix 적용 과정에서 토스트 배경·테두리·텍스트 색상 CSS 변수에 폴백(fallback) 값이 추가됐으나, 실제 tokens.css 정의 값과 불일치.

| 토큰 변수 | 코드 폴백 | tokens.css 실제 | 불일치 여부 |
|---|---|---|---|
| `--color-success-300` | `#6EE7B7` | **미정의** (tokens.css 에 success-300 없음) | 폴백만 작동 |
| `--color-success-800` | `#065F46` | **미정의** (tokens.css 에 success-800 없음) | 폴백만 작동 |
| `--color-warning-50` | `#FFFBEB` | `#FEF6E7` | **불일치 — 다름** |
| `--color-warning-300` | `#FCD34D` | `#F1C268` | **불일치 — 다름** |
| `--color-warning-800` | `#92400E` | `#8C5C13` | **불일치 — 다름** |
| `--color-danger-50` | `#FEF2F2` | `#FFF1F1` | **불일치 — 다름** |
| `--color-danger-800` | `#991B1B` | `#7F1D1D` | **불일치 — danger-700(#991B1B) 오기입** |

- 영향: `var(--color-*)` 가 정의된 환경(정상 빌드)에서는 토큰 값이 우선하므로 기능 차단은 없음.
- 단, tokens.css 에 해당 변수가 미정의인 경우(`--color-success-300/800`)는 폴백 hex 로만 렌더링되며, 팔레트 변경 시 자동 추적 불가.
- 특히 `--color-danger-800` 폴백 `#991B1B` 는 tokens.css 에서 `--color-danger-700` 값이므로 명백한 오기입.
- **권장**: 폴백 hex 를 tokens.css 실제 값으로 정정하거나, `--color-success-300/800` 을 tokens.css 에 추가. 단, DS 토큰 미정의 변수 추가는 design-system 담당 확인 필요.

---

### N-2 (Minor): `whiteSpace: 'pre-line'` + ⚠ 유니코드 렌더 주의

- L246 `<span style={{ whiteSpace: 'pre-line' }}>{toast.text}</span>` — pre-line 은 `\n` 을 줄바꿈으로 처리하며 공백 축약. 정상 동작.
- ⚠ (U+26A0) 는 이모지 변형(U+26A0 FE0F)이 아닌 순수 텍스트 변형이므로 대부분 플랫폼에서 흑백 텍스트 기호로 렌더링. Electron/Chromium 환경에서는 컬러 이모지 렌더도 발생 가능(OS/폰트 의존).
- 기능 차단 없음. 단, 색상 토큰(`--color-warning-800`)으로 텍스트가 이미 갈색 계열이어서 ⚠ 컬러 이모지가 렌더될 경우 색상 충돌 가능성 존재.
- **권장**: ⚠ 를 유지하되, 향후 Electron QA 실기기 캡처 시 이모지 렌더 여부 확인.

---

### N-3 (Minor): 토스트 `alignItems: 'flex-start'` — 단줄 토스트와 닫기 버튼 정렬 상이

- L220 `alignItems: 'flex-start'` — 멀티라인 토스트(slipResyncRequired)에서는 올바름. 닫기 버튼이 상단 고정.
- 단줄 토스트(success, danger)에서는 `flex-start` 로 인해 닫기 버튼이 텍스트 상단 정렬(1줄이므로 시각상 차이 없음).
- partner 2.3 L170: `alignItems: 'center'` — 단줄 기준 중앙정렬.
- 2.4 는 멀티라인 대응을 위해 `flex-start` 로 변경했으나, 단줄 시 partner 2.3 대비 약간의 수직 정렬 불일치 발생 가능.
- **기능 차단 없음**. flexbox 특성상 단줄 flex 컨테이너에서 `flex-start` 와 `center` 는 실질 동일하게 렌더링되므로 실제 시각 차이는 없음. 허용 가능.

---

## cycle1 결함 재검토 총괄

| 결함 | 중요도 | cycle1 상태 | cycle2 판정 |
|---|---|---|---|
| D-1: 토스트 role=alert 분기 | P1 | OPEN | FIXED |
| D-2: 닫기 × (U+00D7) | P2 | OPEN | FIXED |
| D-3: STATUS variant brand | P2 | OPEN | FIXED (brand 실재 확인) |
| D-4: marginLeft 토큰 | Minor | OPEN | FIXED |
| D-5: 경고 문구 줄바꿈+아이콘 | Minor | OPEN | FIXED (⚠+\n+pre-line) |

## 신규 결함

| 결함 | 중요도 | 내용 |
|---|---|---|
| N-1 | Minor | 토스트 fallback hex 값 7건 중 5건 tokens.css 실제값 불일치, 2건 미정의 변수 |
| N-2 | Minor | ⚠ U+26A0 이모지 렌더 OS/폰트 의존 — Electron QA 필요 |
| N-3 | Minor | alignItems flex-start vs center 단줄 시 partner 2.3 불일치 (실 시각차 없음) |

---

## 결론

Cycle 1 P1/P2/Minor 결함 5건 전부 수정 완료. DS brand variant 실재 확인. role=alert 분기, × entity, marginLeft 토큰화, whiteSpace pre-line + ⚠ 문구 모두 설계 기준 충족.

신규 결함 3건 모두 Minor 등급이며 P1/P2 차단 결함 없음. N-1(폴백 hex 불일치)은 tokens.css 유지보수 이슈로 별도 design-system 슬라이스에서 일괄 처리 권장.

**Designer APPROVE (cycle2)** — 기능 차단 결함 없음. N-1~N-3 는 다음 슬라이스 통합 처리.
