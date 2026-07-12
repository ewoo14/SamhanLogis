# #795 알림 게이트웨이 500 — NotificationCenterController X-User-Role optional

- **일자**: 2026-07-12
- **PR**: #799 · **연관 Issue**: #795(SeverityBadge AA QA 발견 별건) · #415(권한그룹 C5-4 role 와이어 제거)
- **워크플로우**: 근본원인 정찰 → 옵션 평가(A/B/C) → codex exec 구현(mcp 타임아웃 우회) → Opus 5-agent(BE/QA/DevOps 라이브) → fix → Codex 적대 → 0수렴 → CI → 머지.

## 근본원인 (확정)
게이트웨이가 X-User-Role을 **#415(2026-06-06)에서 의도적 제거**(재주입 안 함·Samhan JWT role claim 소멸·`JwtAuthenticationGatewayFilterFactory:229` "legacy 인가 폴백 오용 방지"). 그런데 `NotificationCenterController`(2026-05-22 신설)만 `@RequestHeader("X-User-Role")` **필수** → 헤더 부재 → `MissingRequestHeaderException` → `NotificationExceptionHandler` catch-all → **HTTP 500**(알림내역/벨 게이트웨이 경유 전면 다운). IT가 `.header("X-User-Role","MASTER")` 수동주입으로 false-green이라 미포착(#795 근본원인).

## 옵션 평가
- **A(게이트웨이 재주입)**: ❌ #415 의도 역행+JWT role claim 자체 부재(주입할 값 없음).
- **B(컨트롤러 optional+null-safe)**: ✅ 채택. #415 계약 정렬·순수 계약/null-safety·notification 단일 범위·PM 자율.
- **C(role→group 타깃 재설계)**: ⚠️ 정론이나 별건(발행 모델 변경·다서비스·마이그·정식 리뷰). role 브로드캐스트 알림 노출 복원은 후속.

## 변경 (옵션 B)
| 파일 | 변경 |
|---|---|
| `NotificationCenterController` | 3 엔드포인트 X-User-Role `required=false` |
| `NotificationCenterRepository` | 네이티브쿼리 role null-guard(`:role IS NOT NULL AND target_role @> [role]`) — role=null이면 userId 타깃만 |
| `NotificationCenterService.canAccess` | role=null NPE 방지(userId 타깃만·role broadcast acknowledge 403) |
| `NotificationExceptionHandler` | `MissingRequestHeaderException`→400(헤더명 미노출) |
| `NotificationCenterControllerIT` | role 헤더 없이 200 케이스 3 엔드포인트(my/history/acknowledge) 회귀가드 |

## 리뷰 disposition
- **BE(PASS)**: 게이트웨이 실계약 정합(X-User-Role strip·재주입 없음)·인가 분리(@RequirePermission는 X-User-Id/groups/system-master 기반, role 무관→fail-open 없음)·null-guard 대수 검증·genuine 220 tests. P2(history/acknowledge role-less IT)·P3(죽은 조건절)→fix.
- **QA(GREEN)**: `--rerun-tasks` GREEN + **라이브 게이트웨이(:8080) 500→200 실증**(fix 이미지 재빌드·재현/대조)·acknowledge role-broadcast 403 fail-secure·의미보존(role 없으면 broadcast 미조회·userId 타깃 복원)·임시 알림 정리.
- **DevOps(PASS)**: IT false-green 해소(role-less 케이스)·phase9-10 필터없이 전체실행·CI green·마이그/인프라 0.

## 의미 보존
role=null이면 role-브로드캐스트 알림(안전재고·결재)은 미조회(게이트웨이 계약상 role 부재로 불가피). userId-타깃(메신저·결재회신) 정상 복원. 현 500 전면다운 대비 순개선.

## 후속 (별건)
- **옵션 C(group 기반 타깃)**: role 브로드캐스트 알림 노출 복원 = target_role→target_group 재설계(발행처 inventory/accounting/groupware·notification 쿼리 X-User-Groups·Flyway 마이그) → 정식 리뷰 트랙·개발책임자 결정.
