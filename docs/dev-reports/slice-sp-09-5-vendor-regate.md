# Slice: sp-09-5 vendor 통합 재게이트 (⑥ B/C #4)

> branch `feat/sp-09-5-vendor-regate` / 2026-06-04 / clients/desktop. **프로덕션 src 무변경**(테스트 전용).
> Phase 9 4 vendor(NTS/Aligo/Clova/KFTC) 통합 cross-check 5 TC 재게이트.

## 근본원인 + 수정

- **T1/T2(Clova placeholder/DRY_RUN)**: `fileInput.isAttached()` — Playwright Locator 에 없는 메서드(TypeError) → `(await fileInput.count()) > 0` 로 교정.
- **T3(SALES KFTC 차단)·T4(Aligo 토큰)·step6(WAREHOUSE Clova 허용)**: 역할 cross-check 가 hash 네비게이션으로 진행돼 직전 role 세션이 새 mockRole 로 재설정되지 않음 → 각 role-switch goto 뒤 `page.reload()` 추가(세션 재독, sp-09-3 확립 패턴).
- sp-09-5 testIgnore 해제 재게이트.

## 검증

- sp-09-5 **5/5 green**. desktop tsc 0. 프로덕션 무변경.
