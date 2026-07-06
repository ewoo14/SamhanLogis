# E2 거래처 목록 롤아웃 — 라이브 QA (배포 jar standalone + 실 partner_db)

> [[no-fake-data-ever]] [[standalone-boot-real-qa]]
> Track B 코드(wtB)를 partner-service.jar 로 빌드 → docker PostgreSQL(partner_db, 실 시드) + 실 dev_master 권한으로 standalone(:8099) 부팅 → 배포 상태 라이브 API 실증.
> (worktree→공유 Docker 재빌드는 auth V82/V83 크로스트랙 충돌 위험으로 standalone 채택.)

## ① CRITICAL 해소 실증 — status 필터 (enum ordinal 버그)
enum 을 native query 에 raw 바인딩하면 ordinal→status 필터 영구 0건이던 버그가, `.name()` 문자열 변환 fix 후 정상 동작:
```
[no filter]       total=56  statuses={ACTIVE:51, SUSPENDED:5}
[type=ACTIVE]     total=51  statuses={ACTIVE:51}        ← ACTIVE 만 (버그였다면 0)
[type=SUSPENDED]  total=5   statuses={SUSPENDED:5}      ← SUSPENDED 만
[type=TERMINATED] total=0   statuses={}
```

## ② 삭제 취소선 메타 + 복원 + 2연결 목록 SSE 브로드캐스트 (net-neutral)
기존 거래처 `P-2026-0001` 대상, 세션A 목록 SSE 구독 중 세션B 삭제/복원:
```
[A] 세션A: GET /admin/partners/list-realtime 구독
[B] 세션B: DELETE /admin/partners/P-2026-0001 (X-User-Name=이운영QA) → http=200
[C] GET search → isDeleted=True, deletedByName=이운영QA, deletedAt=True   ← 삭제행 취소선 메타(UUID 비노출)
[D] POST /admin/partners/P-2026-0001/restore → http=200
    GET search → isDeleted=False, status=ACTIVE, deletedByName=None       ← 복원(원상복구)
[E] 세션A SSE 수신:
    event:connected
    event:partner:list:changed  data:{"changeType":"DELETED"}    ← 세션B 삭제가 세션A로 실시간 브로드캐스트
    event:partner:list:changed  data:{"changeType":"RESTORED"}   ← 복원도 실시간 반영
```
→ 2연결 목록 SSE 라이브 반영(멀티 워크스테이션) + soft-delete 취소선 메타 + 복원 전부 배포 상태 실증. P-2026-0001 은 삭제→복원으로 원상.

## 종합
- 위 라이브(배포 jar+실 DB) + real-PG IT(`search_status_filter_returns_only_matching_status`·`delete_search_includes_deleted_metadata_and_restore_reactivates_partner`·권한 매트릭스) + CI green(Playwright mock GUI+JUnit).
- ⚠️ standalone 부팅이 partner_db 에 V13(deleted_by_name) 적용 — additive nullable, 기존 docker partner-service(구코드) 무영향(런타임 미참조). 머지 시 정식 반영.
