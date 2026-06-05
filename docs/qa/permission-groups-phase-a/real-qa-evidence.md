# 동적 권한그룹 Phase A — Docker 실서버 QA 실증

> 2026-06-05. PR #396. 실 auth-service(신 이미지 재배포) + 실 auth_db. 가짜 데이터·mock 0([[feedback_no_fake_data_ever]], [[feedback_qa_docker_real_test]]).

## 0. 재배포
`:services:auth-service:bootJar` → `docker compose build auth-service` → `up -d --no-deps --force-recreate auth-service` → `Up (healthy)`. Flyway V42~44 가 실 populated auth_db 에 적용.

## 1. 실 데이터 마이그레이션 (fresh CI 와 달리 기존 24계정 보유 DB)
```
flyway_schema_history: 42 permission groups tables / 43 seed role groups / 44 assign accounts to groups → 전부 success=t
permission_groups(10): 마스터(builtin=t,systemMaster=t) + 매니저/영업원/창고원/회계원/재고원/배차담당자/기사/사원/개발자(builtin=f)
account_groups: assigned=24 == active_accounts=24 (전 계정 자기 역할그룹 배속, 고아 0)
customized_accounts=0 (account_page_permissions == role template) → 무중단·백필 불필요 실증
```

## 2. 실서버 end-to-end (auth-service:8081, X-User-Id=MASTER bypass)
| 단계 | 호출 | 결과 |
|---|---|---|
| 그룹 생성 | POST /auth/admin/permission-groups | `success:true` id=82046f6e… name=QA-PG-PHASE-A |
| 매트릭스 갱신 | PUT /permission-groups/{id}/permissions `{rows:[{pageCode:"inventory.dps", actions:{view:true,create:true,…}}]}` | `success:true changedCount:1` ← **중첩 actions 실 계약 동작**(dual Codex 적발 P1 수정 검증) |
| 계정 배속 | POST /accounts/{SALES}/groups `{groupId}` | `success:true` 오병승→그룹 |
| **materialize 실측** | psql account_page_permissions(SALES, inventory.dps) | **can_view=t, can_create=t** (배속 전 f/f → 그룹 합집합이 실 enforcement 소스에 반영) |
| cleanup 배속해제 | DELETE /accounts/{SALES}/groups/{id} | 204 |
| cleanup 그룹삭제 | DELETE /permission-groups/{id} | 204 |
| **원복 실측** | psql account_page_permissions(SALES, inventory.dps) | **f/f 원복** (unassign 재materialize 동작) |

## 3. 가드 실서버 검증
- 시스템 MASTER 그룹('…0100')에 일반 SALES 계정 배속 시도 → **HTTP 409 차단**(AccountGroupService 가드, Phase B 시한폭탄 사전 차단).

## 4. 결론
실 server·실 DB·실 호출로 **그룹 생성→매트릭스(중첩 actions 계약)→배속→account_page_permissions materialize→cleanup 원복** 전 사이클 + 시스템그룹 가드 409 실증. enforcement 소스(account_page_permissions) 가 그룹/배속 변경을 정확히 반영. dual Codex 가 적발한 FE↔BE 계약 P1 이 실서버에서 정상 동작함을 확인.

## 5. 한계 (정직 보고)
- live **FE→gateway→auth-service** 전 경로 브라우저 캡처는 미수행(현 스택 gateway 컨테이너 미기동 + FE dev server 별도 기동 필요). 대체 = 실 auth-service 직접 호출(위 2~3, 계약/materialize 동일 경로) + FE Playwright(수정 mock=실 계약 정합, 3 passed) + CI Testcontainers 실-HTTP 컨트롤러 IT green. 그룹명 한글은 curl 셸 인코딩 한계로 ASCII 명으로 실증(서버 UTF-8 정상, BE IT 가 한글 UTF-8 커버).
