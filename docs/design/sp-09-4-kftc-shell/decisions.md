# SP-09-4 KFTC 오픈뱅킹 입금 매칭 — Designer Decisions Log

**슬라이스**: SP-09-4 KFTC 오픈뱅킹 입금 매칭 Shell  
**작성일**: 2026-05-18  
**Designer**: UI/UX Designer agent

---

## 1. KFTC 컬러 토큰 결정

### 신규 토큰 6종 등록

| 토큰 | 값 | 근거 |
|---|---|---|
| `--color-kftc-primary` | `#0061A8` | KFTC 공식 사이트 brand blue |
| `--color-kftc-50` | `#EEF6FF` | primary 10% tint — 배경/hover |
| `--color-kftc-100` | `#DBEAFE` | primary 20% tint |
| `--color-kftc-200` | `#BFDBFE` | border/divider 용 |
| `--color-kftc-700` | `#004D85` | hover/pressed state |
| `--color-kftc-text` | `#003662` | on-light 고대비 텍스트 |

**WCAG 검토**: `--color-kftc-text(#003662)` on `--color-kftc-50(#EEF6FF)` = 대비비 약 9.4:1 → AAA 충족.

### 4색 vendor 시각 구분 체계

기존 3종 + KFTC 신규 추가로 vendor badge 4색 완성:

| Vendor | 컬러 | 토큰 |
|---|---|---|
| NTS 국세청 | `#0F6523` (dark green) | `--color-nts-primary` |
| Aligo SMS | `#0F766E` (teal) | `--color-aligo-primary` (SP-09-4 사이클 1 fix 추가) |
| Clova OCR | `#03C75A` (Naver green) | `--color-clova-primary` |
| KFTC 오픈뱅킹 | `#0061A8` (official blue) | `--color-kftc-primary` (신규) |

4색 모두 채도/명도 충분히 달라 색맹 시뮬레이션에서도 구분 가능.

---

## 2. 상태 Badge 결정

| 상태 | 컬러 | 근거 |
|---|---|---|
| 매칭 성공 | `#0F766E` (success teal) | 기존 `--color-success` 계열 — "완료/승인" 의미 토큰 원칙 일관 |
| 미매칭 | `#D97706` (warning amber) | 기존 `--color-warning` 계열 — "미결재/주의" 의미 토큰 원칙 일관 |

---

## 3. 금액 typography 결정

- `font-family: 'JetBrains Mono', Consolas, monospace`
- `font-variant-numeric: tabular-nums`
- `text-align: right` (테이블 금액 컬럼 전체)
- 요약 카드 대형 숫자: `font-size: 32px; font-weight: 700`

> **사이클 1 fix (2026-05-18)**: DepositMatchPage.tsx SummaryBadge 의 `fontSize` 를 22 → 32 로 정정.
> monospace fontFamily + fontVariantNumeric: tabular-nums 동시 적용.
> ResultRow 금액 셀에도 fontFamily monospace 추가 (decisions §3 완전 이행).

---

## 4. 자동 분개 미리보기 결정

| 구분 | 계정과목 | 토큰 |
|---|---|---|
| 차변 | 보통예금 | `#1D4ED8` (blue) — `--color-debit` |
| 대변 | 외상매출금 | `#7C3AED` (purple) — `--color-credit` |

차변/대변 색 구분은 한국 회계 교육 표준(차변=파란, 대변=빨간/보라) 관례 준수.  
차변 `#1D4ED8` / 대변 `#7C3AED` — 두 색 모두 WCAG AA on white 충족.

---

## 5. 접근성 결정

| 요소 | 구현 |
|---|---|
| 폼 label/input 연결 | `for` + `id` 1:1 매핑, `aria-required="true"` |
| 조회 결과 요약 | `role="status"` + `aria-label` — 화면 로드 후 자동 읽힘 |
| 에러 배너 | `role="alert"` + `aria-live="assertive"` + `aria-atomic="true"` |
| modal | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby` |
| 테이블 row | `tabindex="0"` + `role="row"` + `aria-label` |
| 핀번호 토글 | `aria-label="핀번호 표시/숨기기"` |
| 비활성 버튼 | `disabled` + `aria-disabled="true"` |

---

## 6. DRY_RUN 배너 패턴

- SP-09-3 Clova OCR 배너 패턴 1:1 재활용 (팀 일관성)
- 결과 화면(#02)에서는 slim 버전으로 축소 표시 — 조회 조건 + 상태만 1줄
- 접근 권한: ACCOUNTANT / MANAGER / MASTER (SALES / DISPATCH / WAREHOUSE 차단)

---

## 7. modal 설계 결정

- 배경 테이블 `opacity: 0.35 + filter: blur(1px)` — 맥락 유지 + 포커스 집중
- modal 너비: `680px` (SP-09-3 OCR 결과 카드 2-column 과 동일 maxW 기준)
- modal body overflow-y: auto — 긴 분개 내역 스크롤 지원
- footer: 좌측 매칭 ID 메타 / 우측 "닫기 + 분개 확정" CTA

---

## 8. design-system 변경 사항

| 파일 | 변경 내용 |
|---|---|
| `clients/web/design-system/src/tokens/tokens.css` | KFTC 토큰 6종 신규 추가 (`:root` 블록) |
| `clients/web/design-system/dist/tokens.css` | 동일 (dist 동기화 + Clova 토큰 누락분 보완) |
| `clients/web/design-system/src/tokens/index.ts` | `colors.kftc` 객체 신규 추가 (6 keys) |
| `clients/web/design-system/src/tokens/tokens.css` | **Aligo 토큰 6종 추가** — `--color-aligo-primary/50/100/200/700/text` (사이클 1 fix DS-04) |
| `clients/web/design-system/src/tokens/index.ts` | **`colors.aligo` 객체 추가** — 6 keys (사이클 1 fix DS-04) |

> **DS-04 결정 (2026-05-18 사이클 1 fix)**: SP-09-2 Aligo SMS 슬라이스에서 누락된 `--color-aligo-*` 6종 토큰을
> 4색 vendor 체계 완성을 위해 본 슬라이스에서 추가. NTS / Aligo / Clova / KFTC 전원 전용 토큰 체계 보유.

---

## 9. HTML mock 산출물

| 파일 | 화면 |
|---|---|
| `01-deposit-fetch-form.html` | 조회 폼 (날짜 범위 + 핀번호 + DRY_RUN 배너 + vendor 4색 badge) |
| `02-deposit-match-result-success.html` | 요약 카드 3종 + 매칭 테이블 5행 |
| `03-deposit-match-detail.html` | 매칭 상세 modal (거래처 + 세금계산서 + 자동 분개 미리보기) |
| `04-deposit-fetch-failure.html` | 실패 케이스 A(422) + B(502) 에러 배너 |

---

## 10. 다음 단계 (FE agent 전달 사항)

1. KFTC 토큰 6종 — `tokens.css` + `index.ts` 등록 완료 (본 PR 포함)
2. `DepositFetchForm` 컴포넌트: `GET /banking/kftc/deposits` 연결, dateFrom > dateTo 클라이언트 유효성
3. `DepositMatchTable` 컴포넌트: tabular-nums + 우측 정렬 + row click modal 연결
4. `DepositMatchDetailModal` 컴포넌트: `role="dialog"` + `aria-modal` + focus trap
5. Phase 11 실 연동 시 `KFTC_MODE=DRY_RUN` 환경변수 false 로 전환
