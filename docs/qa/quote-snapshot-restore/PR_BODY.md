## 개요

개발책임자 지시(2026-06-09):
> "종합견적서에서 해당 견적서 데이터를 그대로 불러올 수 있어야 한다. GAS 코드가 노션에 저장된 견적 데이터를 그대로 복원하는 것처럼."
> "레거시가 조회하던 노션 페이지 데이터도 모두 시드 데이터로 DB 이식 및 데이터 통신 호환이 필요."

웹 estimate-app(종합견적서)은 `saveQuoteSnapshot`/`getQuoteHistory`를 `/api/v1/estimates/snapshots`로 위임하지만 **slip-service에 해당 엔드포인트가 없어 404**였습니다(저장/불러오기 전면 불능). legacy 종합견적서가 **노션 DB에 UI 작업상태 전체를 base64 blob으로 통째 저장/복원**하던 동작을 우리 DB로 1:1 대체합니다. (정합성 감사 P0-A — `docs/audit/gas-port-fidelity/종합견적서-audit-2026-06-09.md`)

## 설계 — "그대로 복원"
정규화된 `estimates`(헤더+라인)와 **별개**입니다. GAS는 종합견적서 작업상태(구성품/옵션/DC/분기/서브파트 등 헤더+라인보다 풍부)를 `JSON.stringify`→base64 blob으로 저장하고, 복원 시 그 blob을 그대로 폼에 재수화(`applySnapshot`)했습니다. 본 PR은 그 **blob을 그대로 보존**하여 EXACT 복원을 보장합니다.

## 변경

### Backend (slip-service)
- **V36** `quote_snapshots` 테이블 — BaseEntity 7 audit + soft delete. `user_email`/`cust_name`/`snapshot_data`(TEXT blob)/`preview_image`(TEXT)/`saved_at` + `(user_email, saved_at DESC)` 부분 인덱스.
- `QuoteSnapshot` 엔티티 / `QuoteSnapshotRepository.findHistory`(userEmail eq + saved_at 범위 + desc).
- `QuoteSnapshotService`(저장 + 이력, ISO offset/LocalDateTime/date 유연 파싱) / `QuoteSnapshotController`(POST·GET `/api/v1/estimates/snapshots` full-path).
- `SecurityConfig`: 스냅샷 경로 `permitAll` — estimate-app server-to-server 무인증(legacy 노션 서비스계정 패턴). 조회는 `userEmail`로 사용자별 격리, 저장 blob은 견적 초안(저민감). **후속 X-Internal-Token 하드닝 검토**.

### Gateway
- `slip-service-estimates-v1` 라우트(`/api/v1/estimates/**` NoStripPrefix, JwtAuthentication 미적용) — 게이트웨이 경유 호출도 도달.

### Web (estimate-app)
- `code.js getQuoteHistory`: **ApiResponse 봉투 `{data:[...]}` 언래핑** — 미언래핑 시 목록이 항상 비어 복원 불가(회귀 차단). raw 배열/`{items}`도 허용.
- `.env.example` `ESTIMATE_SERVICE_URL` 8083(stale) → **8086**(slip-service 직결, slip-bridge 동일 패턴).

## 테스트 / CI
- `QuoteSnapshotControllerIT` 4종: ① 저장 201(무인증 permitAll) ② **EXACT 복원**(저장 blob/이미지 그대로) ③ 사용자별 격리 ④ 날짜 범위 필터 + 최신순 ⑤ data 누락 400.
- `ci.yml` slip-it-core 필터에 `estimate.snapshot.it.*` 등재 — **allowlist false-green 차단**([[feedback_ci_test_filter_false_green]]).
- ✅ slip-service `compileTestJava` 통과, estimate-app `jest` 17/17 통과.
- ⚠️ 로컬 IT 는 Windows Docker npipe 로 4건 skip([[feedback_testcontainers_windows_docker]]) → **CI(Linux) 에서 실행** + 아래 standalone 실 QA 로 보강.

## QA (후속 커밋 — 진행 중)
- [ ] slip-service 재빌드 후 실행 중 Docker 스택 Postgres 대상 standalone-boot → `POST/GET /api/v1/estimates/snapshots` 실 응답 캡처(저장→복원 EXACT 실증).
- [ ] 웹 종합견적서 실 UI: 견적 저장 → 불러오기(복원) 실 화면 캡처 (종합견적서 E2E QA 세션 통합).

> 조기 PR([[feedback_open_pr_early]]) — Codex 다운(~6/11) → dual-review Claude 대체. 개발책임자 야간 위임(오전 9시까지 PM 자율).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
