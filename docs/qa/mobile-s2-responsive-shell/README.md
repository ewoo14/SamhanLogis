# 모바일 슬2 반응형 셸 Drawer — 라이브 QA (PR #597)

> 실서버 라이브(웹빌드 `dist/web` :5175 + 게이트웨이 :8080, 실 로그인 dev_master). 가짜 금지 [[feedback_no_fake_data_ever]]. Playwright `scripts/mobile-s2-responsive-qa.cjs`.

## 결과 (전 시나리오 PASS)
| 캡처/검증 | 결과 |
|---|---|
| `S1` 모바일(390x844) 홈 | ✅ 헤더 햄버거(≡) 노출·사이드바 Drawer 전환·홈 풀폭 단일컬럼·**가로 overflow 0**(scrollWidth=390=innerWidth) |
| `S2` Drawer 열림 | ✅ 좌측 슬라이드·백드롭 dim·**7분류(판매/구매/회계/그룹웨어/인사/배차/창고운영) 셰브론** + 홈/알림 |
| `S3` 링크 이동 후 | ✅ 알림 NavLink 클릭 → **`/notifications` 이동 + Drawer 자동 닫힘**(is-open=0) |
| 백드롭/ESC 닫힘 | ✅ 백드롭 탭·ESC 모두 is-open=0 |
| `S4` 데스크탑(1280) 무회귀 | ✅ **햄버거 숨김 + 사이드바 정적 그리드 노출**(>768px 불변) |

## 닫힘 트리거 (라이브 검증)
route-change(`location.pathname`) · **링크 onClick(anchor 위임)** · ESC · 백드롭 · resize>768px. (라이브 QA 가 초기 "현재 페이지 링크 탭 시 미닫힘" 적발 → nav onClick close 보강.)

## 비고
- 대시보드 위젯 "준비중"은 슬2(셸) 범위 외 기존 거동(슬1 동일).
- 데스크탑/Electron 무회귀: Drawer CSS 전부 `@media (max-width:768px)` 한정, 기존 `.app-shell`/`.app-sidebar` 정적 규칙 불변.
- 단위: vitest 36파일 290/290(+drawer 4) · mock gate(playwright/mobile-s2-drawer) 2/2 · 기존 sp-09-3 5/5 무회귀.
