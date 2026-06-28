# 현재 작업 핸드오프 노트

> 회사 PC 첫 세션 시작 시 본 파일만 읽으면 즉시 컨텍스트 복원 가능.
> 갱신: 2026-06-28. 다음 세션 첫 읽기 파일.

---

## 현재 슬라이스: 개발 메뉴 그룹 DEV-3 (로그) — 미착수

- **다음 슬라이스**. spec: `docs/superpowers/specs/2026-06-28-development-menu-group-design.md` §3 DEV-3
- 에픽 메모리: `.claude/memory/project_dev_menu_epic.md`
- 내용: logging-service AuditLog 재사용 + 메뉴 접근/액션 로깅 + 로그 뷰어(`dev.activity-log` page-code 신규·메뉴별 필터/검색/기간)
- 착수 시 표준 워크플로우 1단계(Opus 기획 + 조기 PR)부터.

### 🚧 DEV-3 착수 시 다음 단계 (순서)
1. `git checkout main && git pull`(DEV-2 머지 2a98c56c 동기화) → `feat/dev-menu-dev3` 브랜치.
2. Opus 기획(brainstorming) + 조기 PR 개설 + DEV-2 완료 docs 동기화(overview Pages nav-badge/progress/callout) 동반.
3. Codex 개발 → 순차 듀얼리뷰(Opus 5-agent+fix+라이브QA스샷+TM ↔ Codex) 0수렴 → PM 종합 → CI green → 머지.

## ✅ 직전 완료: DEV-2 팝업공지 — PR #655 머지(squash 2a98c56c, 2026-06-28)

- app_notice/app_notice_image(MinIO 이미지·게시기간) + admin CRUD(dev.popup-notice) + 클라이언트 팝업 캐러셀(다시 보지 않기) + 활성/관리자 DTO 분리.
- **순차 듀얼리뷰 + 실서버 라이브 QA(mock OFF)로 0수렴**. 라이브 QA·재리뷰가 **IT/mock 미검출 결함 3건 적발·교정**:
  - M-4: Noop fail-fast가 dev profile까지 잡아 로컬 업로드 깨짐 → 운영 profile allow-list.
  - V5/V6: 적용된 V5 in-place 수정 → Flyway checksum 크래시 → V5 원복 + V6 분리(마이그 불변).
  - Noop 가드: upload만 막고 조회/기동 미보호 → @PostConstruct 기동 가드.
- 검증: NoopGuardTest 3/3·AppNoticeControllerIT 4/4·Playwright dev2 5/5+compensation 7/7·실서버 mock-OFF QA·FE 스샷 2종(docs/qa/dev-menu-dev2/).
- GitGuardian = PM false-positive(access-key=samhan dev username·secret-key 빈 fallback·실 secret 0).
- 0수렴 경로: Opus 재리뷰0 → Codex 재리뷰1 MAJOR(Noop) → fix → Opus 재재리뷰0 → Codex 재재리뷰0.

## 완료된 큰 흐름 (이번 세션)
- ✅ DEV-2 팝업공지 머지(PR #655) — 위 참조.
- ✅ 개발 메뉴 DEV-1 머지(PR #654) — 개발 그룹+버전관리 이전+배포 버튼.

## 남은 백로그
- 개발 메뉴 DEV-3(로그) ← 다음 → A2 그룹웨어 결재(task#24) → Phase11 AWS(task#25)

## ⚠️ 워크플로우 주의(박제)
- **매 단계 ScheduleWakeup 재자각**(연속 mega-턴 금지, 사용자 활성 중에도). 라운드마다 fix후 라이브QA+단계별 스샷 인라인·각 라운드 즉시 독립 게시·fix후 0수렴 재리뷰·듀얼리뷰 순차·단축금지.
- **실 라이브 QA 필수** — DEV-2에서 실배포 QA가 IT/mock 미검출 결함 3건 적발. mock OFF·실 게이트웨이:8080·실 dashboard·실 PG.
- **적용된 마이그레이션 불변** — V* in-place 수정 금지(checksum 크래시), 신규 V로 추가.
- PM 자동 머지: auto-mode 분류기가 자가 머지를 플래그함(개발책임자 2026-06-28 '자율 계속' 승인). 게이트 충족 시 PM 자율 머지 지속.
