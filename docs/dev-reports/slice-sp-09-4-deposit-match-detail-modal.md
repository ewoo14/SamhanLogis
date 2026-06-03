# Slice: sp-09-4 KFTC 입금 매칭 상세 모달(자동 분개 미리보기) + 재게이트 (⑥ B/C #7)

> branch `feat/sp-09-4-deposit-match-detail-modal` / 2026-06-04 / clients/desktop.
> **신규 FE 기능 구현** + sp-09-4 5 TC 재게이트. (테스트 전용 아님 — 프로덕션 FE 변경 포함)

## 1. 배경 — feature gap

sp-09-4 의 T4(MATCHED row → 매칭 상세 modal + 자동 분개 미리보기 차변/대변)는 페이지에 **미구현**이었다
(`DepositMatchPage` 에 상세 모달 없음). 나머지 T1/T2/T3/T5 는 in-process mock 값 불일치(테스트가 page.route 로
PARTNER-001 주입 — VITE_MOCK_MODE 에서 무효)였다.

## 2. 신규 기능 — 자동 분개 미리보기 모달

- **API 타입**(`depositMatchApi.ts`): `DepositJournalLine`(side/accountCode/accountName/amount) +
  `DepositJournalDraft`(lines) 추가. `DepositMatchResult.journalDraft?` 옵셔널 필드(BE contract 정합 — MATCHED 만).
- **mock**(`mock.ts`): MATCHED 2건(P-001 2,750,000 / P-004 4,180,000)에 `journalDraft` 추가.
  표준 입금 분개 = 차변 보통예금(103) / 대변 외상매출금(110), 동액(한국 일반기업회계기준).
- **FE**(`DepositMatchPage.tsx`): `DepositDetailModal` 신규 — MATCHED row 클릭(role=button, Enter/Space 키보드 지원) →
  `deposit-match-detail-modal`(role=dialog) 오픈. 거래처코드/세금계산서번호/입금자명/금액 +
  `deposit-match-journal-debit`(차변 보통예금103) / `deposit-match-journal-credit`(대변 외상매출금110) 라인 렌더.
  UNMATCHED row 는 비클릭(분개 없음). DRY_RUN 미리보기 — 실제 전표 미생성 명시.
- **UUID 비공개**: journalDraftId·계정 UUID 미노출 — 계정코드/계정명/금액 + 비즈니스 식별자(partnerCode/taxInvoiceNo)만.

## 3. 재게이트 (테스트 정합)

- T2/T4 값 정합: PARTNER-001→**P-001**, TAX-2026-05-001→**TI-20260502-001** (in-process mock row-1).
  요약 카운트(전체5/매칭2/미매칭3)는 mock 과 일치.
- T4: row-1 클릭 → 모달 + 분개 차변/대변 + 비즈니스 식별자 검증(신규 기능으로 RED→GREEN).
- T5: 역할 cross-check 마다 `page.reload()` 세션 재설정 + 차단 신호 엄격화
  — 느슨한 `bodyText.includes('권한'/'접근')` 공허 통과 제거, `조회버튼 미표시 AND (거부화면 OR redirect)` 로 판정.
- T1/T3 는 기존 통과(배너/422) 유지.

## 4. 검증

- sp-09-4 **5/5 green** → testIgnore 해제 재게이트. desktop `tsc --noEmit` 0.
- QA 캡처: `docs/qa/sp-09-4-kftc-shell/screenshots/T{1..5}-*.png` (T4 모달 분개 미리보기 포함).

## 5. Dual review 반영 (Claude FE + QA + Codex gpt-5.5)

- **🔴 도메인 정정 (FE P1 발) — 보통예금 계정코드 103 → 102**: 초안에서 보통예금을 103 으로 표기했으나
  본 프로젝트 계정과목 seed(`accounting-service V1__init`: `102 보통예금` / `110 외상매출금` / `111 받을어음`)
  기준 **보통예금은 102**. 외상매출금 110 은 정확(받을어음 111 과 구분). mock/타입/페이지 주석/테스트 전부 102 로 정정.
  (FE 가 제안한 108 은 본 프로젝트 chart 에선 미사용 — 코드 검증 지적은 valid, 구체 수치는 seed 기준으로 확정.)
- **QA P0 / Codex P1 — T4 분개 단언 공허(OR)**: `includes('차변')`/`includes('대변')` 레이블만으로 통과 가능 →
  `includes('102') && includes('보통예금')`, `includes('110') && includes('외상매출금')` AND 강화(계정코드+계정명 동시).
- **FE P0 — `<tr role="button">` ARIA 위반**: row context 파괴 → role 제거(implicit row 유지) + tabIndex/aria-label/keydown(Enter·Space) 유지.
- **FE P0 — key index 의존**: `${transactionDate}-${depositorName}-${amount}` 안정 키로(정렬 변경 시 state 오염 방지).
- **FE P1 — mock UNMATCHED 행 matchedPartnerCode 모순**: P-002 → null(MATCHED 상태에만 존재 계약 정합).
- **FE P1 — journalDraft 부재 방어**: MATCHED 인데 분개 없을 시 "자동 분개 데이터를 불러오지 못했습니다." 안내.
- **FE P1 — Escape 닫기(WCAG 2.1 SC 2.1.2)**: modal 에 Escape keydown 핸들러 추가.
- **QA P1 — T3 메시지 bodyText('from' 등) 느슨**: 에러 배너 textContent 로 scoped(`시작일`/`종료일`/`날짜 범위`).
- **Codex P1 / 공통 — `test.skip(SKIP_UI)`**: sp-09-1/2/5·sp-d4 동일 env opt-out 컨벤션(CI 미설정→skipped=0) + silent-skip 가드 2차 방어.
- **QA P1 — page.route 잔존**: VITE_MOCK_MODE in-process mock 에서 무효(false-green 미유발). in-process mock 이 데이터 공급. 유지보수 참고로 문서화.
- 모든 강화 단언(AND 분개·scoped 에러·reload RBAC)에도 5/5 green = 모달 실렌더(102/110)·차단 실작동 확증.
