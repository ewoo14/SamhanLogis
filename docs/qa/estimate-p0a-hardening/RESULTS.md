# P0-A snapshots permitAll → X-Internal-Token 하드닝 — 실 QA

- 일시: 2026-06-10 / branch `feat/p0a-snapshots-internal-token`
- 방법: 실 Docker(slip-service+api-gateway 본 PR 코드 재빌드) + 실 Postgres slip_db. 가짜 데이터 0.

## 토큰 게이트 enforcement (실 HTTP, slip-service 직결 :8086)

| # | 시나리오 | 결과 | 판정 |
|---|---|---|---|
| ① | 유효 X-Internal-Token 저장 | **201** `P0A하드닝QA` (한글 무결) | ✅ |
| ② | 토큰 미제시 조회 | **403** (미인증 → /internal/** system-internal 강제) | ✅ |
| ③ | 토큰 불일치 조회 | **401** (InternalTokenFilter 즉시 차단) | ✅ |
| ④ | 유효 토큰 조회 + 사용자 격리 | **hits 1** `P0A하드닝QA` | ✅ |
| ⑤ | 구 경로 `/api/v1/estimates/snapshots` 무인증 | **403** (permitAll 폐기, authenticated() 차단) | ✅ |
| ⑥ | 게이트웨이 구 라우트 `/api/v1/estimates/**` | **404** (NoStripPrefix 무인증 라우트 폐기) | ✅ |

## 변경 요약

- slip-service `QuoteSnapshotController` `/api/v1/estimates/snapshots` → **`/internal/estimates/snapshots`**(save/history/by-customer 3종) — `/internal/` prefix 로 `InternalTokenFilter` + #452 의 system-internal principal 강제(X-User-* 위조 면역) 자동 적용.
- SecurityConfig: 무인증 `permitAll` 제거.
- api-gateway: `/api/v1/estimates/**` NoStripPrefix 무인증 라우트 제거.
- estimate-app `lib/code.js`: saveQuoteSnapshot/getQuoteHistory/getQuoteHistoryByCustomer → 내부 경로 + `X-Internal-Token`(SAMHAN_INTERNAL_TOKEN) + 봉투 언래핑.

## 테스트

- estimate-app jest **71/71**. slip-service 전체 테스트 green — QuoteSnapshotControllerIT 전 케이스 토큰 헤더 적용 + enforcement 3종 신규(무토큰 403 / 오토큰 401 / 위조 X-User-* 403).
- QA 잔여물 정리 완료(DELETE 1).
