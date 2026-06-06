## DevOps 결함표

| ID | 심각도 | 위치 | 내용 | 본 PR 즉시 처리 |
|---|---:|---|---|---|
| DO-1 | P2 | `services/auth-service/src/main/resources/db/migration/V47__seed_products_sync_group_permission.sql`, `docs/qa/permission-groups-c5-followup/real-qa-evidence.md:168-169` | `3374a0c9`가 이미 커밋된 V47 내용을 변경했다. `origin/main`에는 V47이 없으므로 프로덕션/CI 신규 DB는 무영향이지만, 본 PR QA DB처럼 구 V47을 이미 적용한 DB는 현 head 기동 시 Flyway checksum mismatch로 실패한다. 또한 `flyway repair`만 하면 새 `account_page_permissions` backfill SQL이 실행되지 않아 DEF-1이 남는다. | 필요. PR 문서/운영 노트에 "구 V47 적용 DB 전용: V47 history 삭제 후 재적용 또는 수동 backfill SQL 실행 + repair" 절차를 명확히 추가해야 한다. 가능하면 V47 원본 유지 + V48 backfill 분리가 더 안전하다. |
| DO-2 | 없음 | `.github/workflows/ci.yml`, `.github/workflows/arologis-ci.yml` | 변경 모듈 커버리지 확인: 전 변경 모듈이 CI matrix/별도 워크플로로 커버된다. | 조치 없음 |
| DO-3 | 없음 | `.github/workflows/qa-e2e.yml:5-7,69,93`, `clients/desktop/playwright.config.ts:17-25` | PR이 `clients/**`를 변경하므로 `desktop-playwright` job 트리거. 신규 spec 은 hard gate 대상. | 조치 없음 |
| DO-4 | 없음 | `infrastructure/**` | compose/prometheus/grafana/nginx/env 변경 필요 0. | 조치 없음 |
| DO-5 | 없음 | `CorsConfig` / `HttpHeaderConstants` | X-User-Role 노출 제거 — C5 와이어 계약 정합. | 조치 없음 |

## Claude 발견 평가표

| Claude 항목 | 원 판정 | `3374a0c9` 이후 평가 | 근거 |
|---|---|---|---|
| DevOps D-1: V47 soft-delete 주석 | 주석 보완 필요 | Valid / 해소 | V47 상단 주석 추가, V42 partial index 와 ON CONFLICT 정합. |
| DevOps D-2: accounting Prometheus scrape | 선재 결함 | Valid / 본 PR 처리 충분 | InternalTokenFilter 실 게이트 근거 박제. 회귀 아님. |
| QA DEF-1 fix | P0 fix 필요 | 기능 fix Valid, 배포 절차 보완 필요 | 신규 DB 정상. 구 V47 적용 DB 재적용 절차는 DO-1. |

## 판정

**CHANGES REQUESTED** — DO-1 (V47 checksum 운영 절차 문서화 또는 V48 분리) 1건.
