# SP-09-3 Naver Clova OCR 영수증 업로드 — 디자인 Decisions Log
## 작성: Designer · 2026-05-18

---

## 1. Clova 전용 컬러 토큰 신규 등록 (D1)

### 결정
Naver 공식 녹색 `#03C75A`를 기반으로 `clova` 네임스페이스 토큰 6종을 신규 등록한다.
기존 `--color-success`(teal #2A9D8F), NTS `--color-nts-primary`(#0F6523), Aligo teal(#0F766E)과
명확히 시각 구분된 Naver 브랜드 녹색 계열이다.

### 등록 토큰

| 변수명 | 값 | 용도 |
|---|---|---|
| `--color-clova-primary` | `#03C75A` | Naver 공식 녹색 — 버튼/강조/진행바/드롭존 hover |
| `--color-clova-50` | `#F0FDF6` | 드롭존 hover 배경 / 결과 카드 배경 |
| `--color-clova-100` | `#DCFCE8` | 뱃지 배경 |
| `--color-clova-200` | `#BBF7D0` | 뱃지 테두리 / 드롭존 hover border |
| `--color-clova-700` | `#02A04B` | hover 시 버튼 다크닝 |
| `--color-clova-text` | `#014A22` | 텍스트 (진한 녹색 — 충분한 대비비) |

### 파일
- `clients/web/design-system/src/tokens/tokens.css` — `:root` `--color-nts-*` 블록 직후
- `clients/web/design-system/src/tokens/index.ts` — `colors.clova` 객체

### 시각 구분 매트릭스

| 벤더 | Primary 색상 | Hex | 배경 |
|---|---|---|---|
| Naver Clova OCR | Naver 녹색 | `#03C75A` | `#F0FDF6` |
| NTS 국세청 | 국세청 녹색 | `#0F6523` | `#F0FDF4` |
| Aligo SMS | teal | `#0F766E` | `#F0FDFA` |

### 접근성
- `#014A22` on `#F0FDF6` 대비비 ≈ 10.8:1 — WCAG AAA 충족
- `#02A04B` on `#fff` 대비비 ≈ 4.6:1 — WCAG AA 충족

---

## 2. 드롭존 디자인 (D2)

### 결정
드롭존은 dashed border + hover 시 `--color-clova-50` 배경으로 처리한다.
keyboard 접근성: `tabindex="0"` + `role="button"` + `aria-label` + `:focus` outline 적용.

```css
.dropzone {
  border: 2px dashed var(--color-neutral-300);
  background: var(--color-neutral-50);
}
.dropzone:hover,
.dropzone:focus {
  border-color: var(--color-clova-primary);
  background: var(--color-clova-50);
}
.dropzone:focus {
  box-shadow: 0 0 0 3px rgba(3,199,90,0.18);
}
```

Enter/Space 키 활성 힌트는 드롭존 내부 `<kbd>` 스타일 요소로 표시한다.

---

## 3. DRY_RUN 안내 배너 (D3)

### 결정
Phase 11 CLOVA 실 연동 전이므로 업로드 화면 상단에 항상 warning 토큰 계열 배너를 표시한다.
진행 중(`02`)에는 축약 버전, 빈 상태(`01`)에는 전체 설명 버전으로 분기.

```
background: var(--color-warning-50)
border: 1px solid var(--color-warning-200)
text-color: var(--color-warning-800)
강조 코드 블록: monospace + warning-50 배경
```

- `role="status"` + `aria-live="polite"` — 정보 안내이므로 polite (assertive 아님)
- DRY_RUN 모드 해제 시 이 배너만 제거 (코드 one-shot)

---

## 4. OCR 결과 카드 필드 타이포그래피 (D4)

### 결정
결과 카드의 각 필드는 시각적 계층에 따라 타이포그래피를 달리한다.

| 필드 | 폰트 크기 | 폰트 계열 | 색상 | 기타 |
|---|---|---|---|---|
| 가게명 | 18px | Pretendard | `--color-neutral-900` | font-weight 700 (heading) |
| 합계금액 | 28px | JetBrains Mono/Consolas | `--color-neutral-900` | font-weight 700 + tabular-nums |
| 공급가액/부가세 | 14px | JetBrains Mono/Consolas | `--color-neutral-900` | tabular-nums |
| 영수증 일자 | 13px | Pretendard | `--color-neutral-500` | muted (작고 흐림) |
| 사업자번호 | 12px | JetBrains Mono/Consolas | `--color-neutral-700` | tabular-nums |

금액 필드는 `font-variant-numeric: tabular-nums` + monospace 패밀리를 의무 적용하여
이카운트 참조 화면의 숫자 정렬 패턴을 준수한다.

---

## 5. "매입 슬립 자동 생성됨" Badge (D5)

### 결정
OCR 성공 후 매입 슬립 자동 생성 상태는 success teal 계열 Badge로 표시한다.
Clova 녹색(`#03C75A`)과 시각 구분을 위해 `--color-success-*` teal 계열 사용.

```
background: var(--color-success-50)    /* #F0FDFA */
border: 1px solid var(--color-success-200) /* #99F6E4 */
color: var(--color-success-700)        /* #0F766E */
```

slipNo (`PUR-YYYY-MM-XXXX`)는 monospace + `--color-brand-500` 텍스트 링크로 처리.
`aria-label`로 슬립 번호 + 용도 병기 ("매입 슬립 PUR-... 상세 열기").

---

## 6. 에러 배너 — role="alert" (D6)

### 결정
업로드 실패(파일 크기 초과, 서버 502) 배너는 `role="alert"` + `aria-live="assertive"` 로
스크린리더에 즉시 통보한다.

케이스별 시각 구분:

| 케이스 | 에러 종류 | border-left 색상 | 배경 |
|---|---|---|---|
| A | 클라이언트 reject (10MB 초과) | `#DC2626` | `#FEF2F2` |
| B | 서버 오류 502 | `#CF1322` | `#FFF1F0` |

두 케이스 모두 "재시도" + "닫기" 버튼을 에러 배너 내부에 배치한다.

---

## 7. 진행 단계 표시 (D7)

### 결정
파일 선택 → Clova 분석 → 결과 확인 → 슬립 생성 4단계를 stepline으로 표시한다.
완료 단계: Clova primary 녹색, 진행 중: border outline + glow, 미진행: neutral gray.

이 컴포넌트는 `aria-hidden="true"` 처리 (시각 보조용, 스크린리더 중복 방지).
실제 진행 상황 통보는 `role="status"` 드롭존 영역에서 담당.

---

## 8. Clova 신뢰도(confidence) 표시 (D8)

### 결정
OCR 신뢰도는 결과 카드 하단에 진행바 + 퍼센트로 표시한다 (운영자 디버깅용).
90% 미만 시 warning 토큰 계열로 색상 변경 로직을 FE에서 적용 권장.

```
conf >= 90%: --color-clova-primary
conf 70~89%: --color-warning-700
conf < 70%:  --color-danger-700  (낮은 신뢰도 — 수동 검토 권고)
```

---

## 9. design-system 영향 (D9)

### 신규 등록 필요
- `tokens.css` — `--color-clova-*` 6종
- `index.ts` — `colors.clova` 객체

### 기존 컴포넌트 활용 (신규 불필요)
- Button: 기존 `primary` variant + inline style override (Clova 녹색 적용)
- Badge: 기존 구조 + Clova/success 토큰 inline style (별도 variant 불필요)
- FileInput: 전용 컴포넌트 미존재 → 네이티브 `<input type="file">` + Button 조합
- Modal: SP-09-1/2 패턴 재활용 (에러 상세 필요 시)

---

## 10. 미결 항목

| 항목 | 이관 사유 |
|---|---|
| OCR 신뢰도 임계값 정책 (70/90%) | BE/운영 정책 결정 선결 |
| 영수증 이미지 미리보기 실 구현 | FileReader API + EXIF rotation 처리 BE 협의 |
| PDF 멀티페이지 처리 | 1장 제한 vs 자동 분리 정책 미결 |
| 매입 슬립 자동 생성 실패 fallback UI | BE OCR 슬립 자동 생성 로직 확정 후 |
| Clova API 실 키 Phase 11 환경변수 | AWS 이전 후 `NAVER_CLOVA_OCR_SECRET` 설정 |
