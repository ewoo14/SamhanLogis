# SP-09-4 KFTC 오픈뱅킹 — Designer 리뷰 (Claude cycle 1)

**브랜치**: feat/sp-09-4-kftc-shell (commit dee1f20c)  
**작성**: Claude Designer agent  
**날짜**: 2026-05-18

---

## 결함 분류 요약

| ID | 심각도 | 파일 | 항목 |
|---|---|---|---|
| DS-01 | HIGH | DepositMatchPage.tsx | decisions.md §5: role="status" + aria-live="assertive" 미구현 — 접근성 계약 불이행 |
| DS-02 | HIGH | decisions.md §3 vs DepositMatchPage.tsx | 요약 카드 font-size "32px" + fontWeight "700" — 실제 구현은 `fontSize: 22, fontWeight: 700`. decisions 문서와 불일치 |
| DS-03 | MEDIUM | decisions.md §3 vs DepositMatchPage.tsx | `font-family: 'JetBrains Mono'` decisions 명시 — 실제 SummaryBadge/ResultRow 에 monospace font 미적용 |
| DS-04 | MEDIUM | tokens.css + index.ts | Aligo 전용 CSS token (`--color-aligo-*`) 미존재 — decisions §1 "4색 vendor 시각 구분 체계" 에서 Aligo 토큰 미추가, 나머지 3개(NTS/Clova/KFTC)와 대칭 불균형 |
| DS-05 | LOW | 01-deposit-fetch-form.html | HTML mock 에서 KFTC 토큰 CSS variable 사용 여부 미확인 (inline style 하드코딩 vs token 변수 참조) |
| DS-06 | WARN | decisions.md §7 | modal 설계 명시 (deposit-match-detail-modal) — DepositMatchPage 미구현, T4 RED 정당하나 decisions 에 "shell 미구현" 명기 필요 |
| DS-07 | WARN | SummaryBadge | `total` variant 색상이 `--color-brand-*` 참조 — KFTC 전용 `--color-kftc-*` 토큰 미활용. KFTC 화면에서 brand 색(파란) = kftc 색(파란)이라 시각적으론 유사하나 토큰 의미 혼용 |

---

## 검증 항목별 PASS/FAIL/WARN

### 1. KFTC 파란 #0061A8 토큰 일관성

**PASS**

`tokens.css`:
```css
--color-kftc-primary: #0061A8;
--color-kftc-50:      #EEF6FF;
--color-kftc-100:     #DBEAFE;
--color-kftc-200:     #BFDBFE;
--color-kftc-700:     #004D85;
--color-kftc-text:    #003662;
```

`index.ts`:
```typescript
kftc: {
    primary: '#0061A8',
    50: '#EEF6FF', 100: '#DBEAFE', 200: '#BFDBFE',
    700: '#004D85', text: '#003662',
}
```

토큰 등록 일관 확인. decisions §1 명시값과 완전 일치.

### 2. 4색 vendor 시각 구분 (NTS/Aligo/Clova/KFTC)

**PASS with WARN (DS-04)**

| Vendor | 토큰 등록 | 색상 |
|---|---|---|
| NTS | `--color-nts-primary: #0F6523` | PASS |
| Aligo | 전용 토큰 없음 (`#0F766E` 주석에만 언급) | WARN |
| Clova | `--color-clova-primary: #03C75A` | PASS |
| KFTC | `--color-kftc-primary: #0061A8` | PASS |

**DS-04:** Aligo 만 전용 CSS token 없이 주석에서 `#0F766E` 로 언급만 됨.  
SP-09-2 Aligo SMS 슬라이스에서 추가됐어야 하나 누락.  
NTS/Clova/KFTC 는 전용 token 체계 있으나 Aligo 만 없어 설계 불균형.  
`--color-aligo-*` 토큰 추가 필요.

### 3. WCAG 대비비

**PASS**

decisions.md §1 검토:
- `--color-kftc-text(#003662)` on `--color-kftc-50(#EEF6FF)` = 약 9.4:1 → WCAG AAA 충족
- `--color-clova-text(#014A22)` on `--color-clova-50(#F0FDF6)` = 약 10.8:1 → WCAG AAA 충족

DepositMatchPage.tsx StatusBadge:
- MATCHED: `#065f46` on `#d1fae5` — 대비비 약 8.1:1 → WCAG AAA 충족
- UNMATCHED: `#4b5563` on `#f3f4f6` — 대비비 약 4.7:1 → WCAG AA 충족 (AAA 미달, AA 수준)

에러 배너: `#991b1b` on `#fef2f2` — 대비비 약 7.2:1 → WCAG AAA 충족

전반적으로 WCAG AA 이상 준수.

### 4. monospace + tabular-nums

**FAIL (DS-03)**

decisions.md §3:
```
font-family: 'JetBrains Mono', Consolas, monospace
font-variant-numeric: tabular-nums
text-align: right (테이블 금액 컬럼 전체)
요약 카드 대형 숫자: font-size: 32px; font-weight: 700
```

**실제 구현:**
- `ResultRow` 금액 셀: `fontVariantNumeric: 'tabular-nums'` 적용됨 (PASS)
- `ResultRow` 금액 셀: `fontFamily` 미지정 (기본 sans-serif) (FAIL)
- `SummaryBadge` 숫자: `fontVariantNumeric` 없음, `fontFamily` 없음 (FAIL)
- `SummaryBadge` 숫자: `fontSize: 22` (decisions의 32px 불일치) (DS-02)

decisions.md 와 실제 FE 구현 사이 monospace font 적용 범위 불일치가 명확하다.

### 5. role="status" / role="alert" 접근성

**FAIL (DS-01)**

decisions.md §5 명시:
```
조회 결과 요약: role="status" + aria-label
에러 배너: role="alert" + aria-live="assertive" + aria-atomic="true"
```

실제 구현:
- summary 섹션: `aria-label="입금 매칭 요약"` 만 있음 → `role="status"` 누락
- 에러 배너: `role="alert"` 있음 → `aria-live="assertive"` / `aria-atomic="true"` 누락

`role="status"` 는 스크린리더가 조회 완료를 자동으로 알리는 핵심 요소.  
`role="alert"` 단독으로도 동작하나 `aria-live` 명시적 선언이 접근성 명세 준수.

### 6. HTML mock 4장 검토

**PASS (DS-05 확인 필요)**

4장 HTML mock 파일 존재 확인:
- `01-deposit-fetch-form.html`
- `02-deposit-match-result-success.html`  
- `03-deposit-match-detail.html`
- `04-deposit-fetch-failure.html`

**DS-05:** HTML mock 파일 내부에서 CSS token variable (`var(--color-kftc-primary)`) 사용 여부를 직접 확인하지 못함.  
하드코딩된 hex 값이면 향후 token 변경 시 mock 과 토큰 간 괴리 발생.  
반드시 CSS variable reference 사용 권장.

### 7. modal (deposit-match-detail-modal) decisions vs 구현

**WARN (DS-06)**

decisions.md §7에 modal 상세 설계 명시:
```
backdrop: opacity 0.35 + filter: blur(1px)
너비: 680px
footer: 좌측 매칭 ID / 우측 닫기 + 분개 확정 CTA
```

DepositMatchPage.tsx 에 modal 미구현 (row 클릭 이벤트 없음, `deposit-match-detail-modal` testid 없음).  
T4 Playwright 가 RED 인 것은 문서화됨. 그러나 decisions.md 에 "shell 단계 미구현" 명기가 없어  
design 산출물(decisions.md)이 구현 상태와 다른 것으로 오해될 수 있다.  
decisions.md §7 하단에 "Phase 11 구현 예정" 주석 추가 권장.

### 8. DRY_RUN 배너 디자인 일관성 (SP-09-3 패턴)

**PASS**

decisions.md §6: "SP-09-3 Clova OCR 배너 패턴 1:1 재활용"  
실제 DepositMatchPage.tsx DRY_RUN 배너:
```jsx
<div style={{
    border: '1px solid var(--color-warning-200, #fde68a)',
    background: 'var(--color-warning-50, #fffbeb)',
    color: 'var(--color-warning-800, #92400e)',
    ...
}}>
    <div style={{ fontWeight: 600 }}>처리 방식: DRY_RUN (sandbox)</div>
    <div>현재 shell 단계에서는 DRY_RUN 모드가 고정 사용됩니다. Phase 11...</div>
```

warning 색 계열 일관 사용. SP-09-3 패턴 답습 확인.

---

## 권장 fix 우선순위

1. **[MUST FIX]** DS-01: summary 섹션 `role="status"` 추가 + 에러 배너 `aria-live`/`aria-atomic` 추가
2. **[SHOULD FIX]** DS-03: 금액 컬럼 + SummaryBadge 에 monospace font-family 적용 (decisions §3 이행)
3. **[SHOULD FIX]** DS-02: SummaryBadge 숫자 font-size 22 → 32 조정 (decisions §3 이행)
4. **[SHOULD FIX]** DS-04: `--color-aligo-*` 토큰 6종 tokens.css + index.ts 에 추가 (4색 체계 완성)
5. **[CONSIDER]** DS-05: HTML mock 파일 CSS variable reference 방식 확인
6. **[COSMETIC]** DS-06: decisions.md §7 modal 에 "Phase 11 구현 예정" 주석
7. **[COSMETIC]** DS-07: `total` variant `--color-kftc-*` 토큰 활용 검토

---

## 총평

KFTC 토큰 6종 등록 및 4색 vendor 시각 구분 체계의 구조는 올바르다.  
WCAG 대비비 전반적으로 AA 이상 준수.  
주요 문제는 decisions.md §3 (monospace font, 32px 대형 숫자) 과 §5 (role="status", aria-live) 가  
실제 FE 구현에 반영되지 않은 점이다. Designer decisions 문서와 구현 간 gap 이 존재하며  
이는 cycle 2 전 반드시 이행해야 한다.  
Aligo 전용 토큰 누락(DS-04)은 4색 체계 완성을 위해 수정 권장.
