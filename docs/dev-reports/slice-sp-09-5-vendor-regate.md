# Slice: sp-09-5 vendor 통합 재게이트 (⑥ B/C #4)

> branch `feat/sp-09-5-vendor-regate` / 2026-06-04 / clients/desktop. **프로덕션 src 무변경**(테스트 전용).
> Phase 9 4 vendor(NTS/Aligo/Clova/KFTC) 통합 cross-check 5 TC 재게이트.

## 근본원인 + 수정

- **T1/T2(Clova placeholder/DRY_RUN)**: `fileInput.isAttached()` — Playwright Locator 에 없는 메서드(TypeError) → `(await fileInput.count()) > 0` 로 교정.
- **T3(SALES KFTC 차단)·T4(Aligo 토큰)·step6(WAREHOUSE Clova 허용)**: 역할 cross-check 가 hash 네비게이션으로 진행돼 직전 role 세션이 새 mockRole 로 재설정되지 않음 → 각 role-switch goto 뒤 `page.reload()` 추가(세션 재독, sp-09-3 확립 패턴).
- sp-09-5 testIgnore 해제 재게이트.

## 리뷰 반영 (Codex P1 — T1 502 vacuous guard)

- **Clova 502**(testable): reload + 드롭존/파일입력 strict 단언(vacuous skip 제거) + in-process mock '502' 파일명 컨벤션으로 502 실트리거 → OCR_SUBMIT_FAILED 에러 strict 검증.
- **NTS/KFTC/Aligo 502**: 해당 vendor 의 in-process mock 은 DRY_RUN 성공을 반환한다(502 는 placeholder 자격의 **실 API 전용** 동작이라 DRY_RUN mock 으로 재현 불가). 따라서 이들 502 차단 검증은 mock 한계로 strict 화 불가 — **Phase 11 후속**: 각 vendor 의 in-process mock 에 502-트리거(예: `?mockVendor502=1`) 추가 후 strict 화. 현 단계는 vendor 페이지 접근/렌더를 검증한다.

## 검증

- sp-09-5 **5/5 green**(Clova 502 strict 포함). desktop tsc 0. 프로덕션 무변경.
