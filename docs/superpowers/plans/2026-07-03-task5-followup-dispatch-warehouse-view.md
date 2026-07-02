# task5 후속 — DISPATCH 역할 inventory.warehouse VIEW 부여 (개발책임자 결정)

> 구현=Codex. 캐논 소형 PR. 개발책임자 2026-07-03 결정(task5 #702 BE 권한갭).

**Goal:** task5 배차 판매전표 미리보기의 "출고창고"가 DISPATCH 역할엔 `listWarehouses` 403 → '-'로 뜨던 갭 해소. **DISPATCH 역할에 `inventory.warehouse` VIEW 권한 부여**(auth-service Flyway **V79**). MASTER/MANAGER 는 이미 정상.

**Scope (BE-only):** auth-service 신규 V79 마이그(적용 마이그 불변·신규만). E2 #700 의 **V78**(dispatch.board RESTORE 를 MASTER/MANAGER/DISPATCH group 에 시드) 패턴 그대로 — DISPATCH group(id 106 등)에 `inventory.warehouse` VIEW 시드(role/group/account 계층·partial unique index `ON CONFLICT` 타깃 V39/V42 정합). page_code `inventory.warehouse` 실존 확인.
- FE 무변경(SlipDetailModal 이 이미 listWarehouses 호출 — 권한 부여 시 200→출고창고 표시).

**검증:** `AuthFlywayV79SeedIT`(신규, 실 Testcontainers — DISPATCH 계정이 inventory.warehouse VIEW 획득 확인) + fresh Postgres probe. 라이브 QA: **DISPATCH 역할 계정으로** task5 판매전표 미리보기 "출고창고" 값 표시 확인(seed OUTBOUND 슬립 사용, dispatch.board+inventory.warehouse VIEW 계정).

**Self-Review:** V78 선례 패턴 재사용·enum CHECK 불요(page_code 기존)·적용 마이그 불변·PageCode FE↔BE 일치. DISPATCH 가 창고 목록 열람=배차 운영상 타당(업무규칙, 개발책임자 확정).
