# 모바일 슬4a 공용 Modal 풀스크린 — 라이브 QA (PR #599)

> 실서버 라이브(웹빌드 :5175 + 게이트웨이 :8080, 실 로그인 dev_master). 가짜 금지. Playwright `scripts/mobile-s4a-modal-qa.cjs`. 모달=거래처 상세(PartnerDetailDialog, /admin/partners 행 클릭).

## 결과
| 캡처 | dialog 박스 | 결과 |
|---|---|---|
| `M1` 모바일(390px) 거래처 상세 | **390×844 = 100%×100%** | ✅ **풀스크린**·헤더 sticky(거래처상세+X 닫기 상단)·푸터 sticky(편집/닫기 하단)·body 스크롤 |
| `M3` 데스크탑(1280px) 거래처 상세 | 720×576 = 56%×72% | ✅ **중앙 카드**(size-lg 720·라운드·백드롭) — 무회귀 |

- 공용 `Modal.module.css` `@media(max-width:768px)` 1블록(backdrop padding0·dialog 100%/100dvh·min-width0[size-xl 980 override]·border-radius0·header/footer sticky·safe-area) → **32개 모달 자동 풀스크린**. 데스크탑(>768px)·애니·reduced-motion 무변동. Modal.tsx 무변경.
- mock gate(playwright/mobile-s4a-modal-fullscreen) 2/2 + inventory-lookup 무회귀 2/2.

## 비고
- "신규 등록"은 모달 아닌 `/admin/partners/new` 페이지라 QA 트리거에서 제외(거래처 상세 모달로 대표 검증). 다른 모달(버전이력·SaveDialog 등)도 동일 공용 Modal 사용 → 동일 풀스크린 적용.
- 모달 모양/간격은 개발책임자 스크린샷 보정 반영([[feedback_print_design_iteration]]).
