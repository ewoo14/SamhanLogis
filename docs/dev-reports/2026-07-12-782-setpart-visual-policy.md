# #782 part2 — 상업 SET 구성품 하위행(.set-part) 시각 폴리시 (#797)

- **일자**: 2026-07-12
- **PR**: #797 · **연관 Issue**: #782(part2) · #780(#779 P1 그리드 복구) 후속
- **워크플로우**: Codex 구현 → Opus(Design/FE/QA 라이브 before/after) → Design 정제(숫자 muted 해제) → QA 재캡처 → Codex 적대 → 0수렴 → CI → 머지.

## 결함
order-app `renderCommSetParts`가 상업 SET 구성품 하위행에 `.set-part` 클래스만 부여하고 **대응 CSS 전무** → tint 없는 순백행 + `td.colD{font-weight:700}`로 하위행명도 부모 SET처럼 볼드(계층 구분 약함·"누락 부작용").

## 변경 (index.html <style>, 3줄 → 2줄)
- `.set-part td{background:#fafbfc}` — 연한 배경(하위 종속 표현).
- `.set-part td.colD{padding-left:20px;text-align:left;font-weight:400;color:var(--c-muted)}` — 이름셀만 muted+들여쓰기+정상weight(170/341행 볼드 특이도 오버라이드, `!important` 없이).
- 숫자(모델/수량/단가/소계)는 기본 강조색(--c-strong) 유지 → 발주 회계값 판독 뚜렷.

## 리뷰 disposition
- **FE(PASS)**: 특이도 `.est-table tbody tr.set-part td.colD`(0,0,3,3) > 기존(0,0,1,1)·모바일(0,0,3,1) → `!important` 없이 오버라이드. `.set-part`는 `#commBody`(renderCommSetParts) 1곳만 → est-home/single/old 오적용 구조상 없음. 반응형 OK.
- **Design(정제 반영)**: 초기 blanket muted가 숫자(회계값) 가독 저하(CR 4.67 타이트) → **이름만 muted·숫자 강조 복원**. Design 발견(실 편집그리드 부모행은 `.group-top` 아닌 카테고리 파스텔 tint 밴드 — `.set-part` #fafbfc가 밴드 덮음)은 "연한 배경" 지시 충족+하위 종속 표현으로 수용(자율 범위).
- **QA(GREEN)**: 실 Docker+실 product seed(QA797-SET-01+구성품 2종) before/after+정제 재캡처. 이름 #6b7280·숫자 #111827(부모 동일·판독)·모바일 볼드 해소·회귀 0·"3×2"/소계 정합·UUID 미노출·seed 정리.
- **Codex 적대(지적 0)**: 특이도·회귀·숫자 가독·tint 상호작용 PASS.

## 후속
- #782 part3(discoverability·LOW) 후속.
- (Design 참고) 파스텔 밴드 연속성 최적화(하위행이 밴드 hue 유지하며 lighten)는 향후 톤 개선 여지.
