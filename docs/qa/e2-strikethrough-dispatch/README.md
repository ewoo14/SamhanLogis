# E2 기둥2 — 배차 취소선 삭제+복원 라이브 QA (Opus 5-agent 라운드1)

- **일시**: 2026-07-02 (회사PC)
- **환경**: 실 Docker 스택 — 재빌드 `samhan-slip-service`(V55 `deleted_by_name`)·`samhan-auth-service`(V78 RESTORE 시드) healthy, 실 게이트웨이 :8080, 실 Postgres(slip_db·auth_db), 렌더러 vite :5175(mock OFF), dev_master 실 JWT 로그인. 합성/fixture 없음.
- **스펙**: `clients/desktop/playwright/e2-strikethrough-dispatch-real-qa/strikethrough-restore-real-qa.spec.ts` — **1 passed (13.8s)**

## 사전 검증 (실 DB)

- `slip_db.flyway_schema_history`: **V55 success=t** + `dispatch_vehicle_group.deleted_by_name VARCHAR(100)` 실존
- `auth_db.flyway_schema_history`: **V78 success=t** + `role_page_permission_templates` dispatch.board can_restore = **MASTER/MANAGER/DISPATCH=t**, 그 외 8롤=f

## 시드 준비 (정직 기록)

미배차 풀 노출 조건은 `status=COMPLETED + 검수 서명`(SlipRepository.findDispatchReadyOutboundSlips)인데, 라이브 DB의 미배차 실전표 2건이 모두 검수 전 상태(PROCESSING/DRAFT)라 풀이 0건이었다. 검수완료 업무 플로우(결재→창고이관→검수서명) 전체 재현은 본 QA 범위 밖이므로, **기존 실전표 `2026/06/24-902` 1건을 psql 로 COMPLETED+검수서명 상태로 전이**해 풀에 노출시켰다(화면·API 는 전부 실물 — 시드 준비만 DB 직접). 이후 모든 조작(배정·삭제·복원)은 **실 GUI 버튼 → 실 게이트웨이 → 실 slip-service** 경로다.

## 단계별 캡처 (실사용자 화면 — Codex 라운드 fix 반영본, 2026-07-02 재캡처)

> 1차 캡처(풀페이지 7장)는 상태 변화가 우측 카드 한 장에 몰려 "전부 똑같은 스샷"이 되는
> 문제(개발책임자 지적)가 있어, 02~06 을 **대상 카드 클로즈업**으로 재설계해 재캡처했다.
> 재캡처 전 이전 QA 실행들이 남긴 잔재 그룹 9건(tombstone/활성 sequence 중복 — testid 충돌
> 원인)을 오늘 DRAFT 한정 psql 정리(정직 기록 — QA 부산물 청소).

| # | 파일 | 프레임 | 검증 |
|---|---|---|---|
| 01 | `01-board-initial.png` | 전체 | dev_master 로그인·배차 보드 진입 컨텍스트 |
| 02 | `02-closeup-active-slip-in-group.png` | 카드 CU | 신규 그룹 + 실전표 `2026/06/24-902` 활성 배정 — 취소선 없음(기준선) |
| 03 | `03-closeup-slip-strikethrough-badge.png` | 카드 CU | **전표 제거 → 행 취소선 + `삭제: [DEV-SEED] 개발마스터` 배지 + [복원]** (그룹 헤더는 활성). X-User-Name 실전파→deleted_by_name 저장 전 경로 실증. 카운트 (0건)=활성 기준 |
| 04 | `04-closeup-slip-restored-active.png` | 카드 CU | 전표 [복원] → 취소선·배지 소멸(02 와 동일 상태로 복귀하는 것이 정상 — 03→04 대비가 증명) |
| 05 | `05-closeup-group-strikethrough-badge.png` | 카드 CU | 전표 재제거 후 **그룹 삭제 → 그룹 헤더까지 취소선+배지+[복원]** (03 과 명확 대비 — 헤더 상태) |
| 06 | `06-closeup-group-restored-tombstone-kept.png` | 카드 CU | **그룹 복원 → 헤더 활성 복귀, 개별 삭제된 전표 행만 취소선 잔존** = 공유 deletedAt **등호 매칭**의 GUI 실증(05 와 헤더 대비. 03 과 동일 상태로 보이는 것이 정상 — 증명은 05→06 전이) |
| 07 | `07-final-all-restored.png` | 전체 | 전표 단건 복원 → 전체 활성 종료 컨텍스트 |

## 스펙 내 단언 (스샷 외 자동 검증)

- 삭제자 배지 텍스트 `삭제:` 포함(이름 실전파), `text-decoration: line-through` computed style 확인
- 복원 후 배지 count=0 (취소선 소멸)
- 그룹 복원 후 개별 삭제 전표 배지 잔존 (cascade 등호 매칭)

## QA 인프라 fix (본 라운드에서 함께 수정)

- `vite.renderer.dev.config.ts`: PWA 에픽 이후 `virtual:pwa-register` 가상 모듈이 resolve 실패해 QA 단독 서버가 브릭 → `playwright/support/pwa-register-stub.ts` alias 로 해소 (앱 코드 무변).
