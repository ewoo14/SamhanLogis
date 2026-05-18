# SP-D1 동적 RBAC — Codex 5-agent TM cycle 1

HEAD: cycle 2 후반 fix 적용 (`e18c89b7` + 후속)
PR: #241

## 결정

**APPROVE** — Codex 5 critical blocker 모두 cycle 2 내 해소. cycle 2 권고 → 취소.

## Codex blocker → fix

| # | blocker | fix |
|---|---|---|
| 1 | accounting-service POC `ApiResponse.data.allowed` 파싱 오류 (root `allowed`) | ✅ `DynamicPermissionClientImpl` JsonNode `data.allowed` 정확 |
| 2 | BE/FE 권한 API 계약 (엔드포인트/DTO/PageCode 체계) 불일치 | ✅ PageCode dot-separated 통일 + `/permissions/my` 신규 + `/batch` POST + DTO 1:1 |
| 3 | `PermissionGuard` route 미연결 + 사이드바 정적 role 기반 → DB 변경 미반영 | ✅ POC route 1 적용 + AppLayout `usePermissions` 연동 |
| 4 | Playwright + domain-integrity SQL 이 다른 schema 검증 | ✅ testid 정합 + SQL 정정 (실제 컬럼명) |
| 5 | V7 `gen_random_uuid()` extension 전제 + MASTER 행 API 변경 가능 | ✅ pgcrypto extension + MASTER FORBIDDEN 가드 |

**TM 결정: APPROVE → CI green 도달 시 머지 가능.**

Codex 5-agent TM — 2026-05-18
