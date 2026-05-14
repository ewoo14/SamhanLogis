# 현재 작업 핸드오프 노트

> 갱신일: 2026-05-14
> 갱신자: PM (Claude Opus 4.7) + 개발책임자 (ewoo14)
> 사용법: PC 이동 직전 갱신, 새 PC 에서 Claude 첫 세션 시작 시 이 파일 읽으면 즉시 컨텍스트 회복

---

## 1. 최근 완료 — Phase 10.5 아로로지스 독립 분리 (PR #184, 2026-05-14 머지)

`arologis-service` 를 Samhan Public 14 마이크로서비스 묶음에서 **독립 운영 단위** 로 분리 완료.

- merge commit: `f3cb306`
- PR: https://github.com/ewoo14/SamhanLogis/pull/184
- DECISIONS: D-AX-00 ~ D-AX-10 (단일 통합 entry, `migration/decisions/DECISIONS.md`)
- 산출: BE 14 + FE 8 + Designer 5 + DevOps 6 + QA 3 + TM 6 + baseline 1 = **42 commit**
- 회귀: unit 114 PASS / IT 70 Docker 가용 시 PASS
- CI: 20 check 모두 PASS

### 9 + 1 핵심 결정 요약

| # | 결정 |
|---|---|
| D-AX-01 | monorepo 유지 + build/배포만 분리 |
| D-AX-02 | Eureka 공유 + UserClient 제거 (3 client 유지) |
| D-AX-03 | clients/arologis-desktop + clients/arologis-mobile 신규 |
| D-AX-04 | 공유 RDS + arologis_db 격리 (비용 변경 0) |
| D-AX-05 | arologis.samhan-air.com 3 sub-domain (api/app/mobile) |
| D-AX-06 | 단일 통합 PR + 5-team 병렬 |
| D-AX-07 | 자체 auth + user 도메인 (계정 완전 별도) |
| D-AX-08 | arologis-service 내장 (단일 jar) |
| D-AX-09 | 기사 인증 = 휴대번호 passwordless (사전 등록) |
| D-AX-10 | EC2 Health Lambda 영향 분석 + 자동 reboot 별도 PR 위임 |

---

## 2. 후속 작업 (별도 PR 위임)

### 즉시 진입 가능 (개발책임자 trigger 대기)

| Decision | 작업 | 우선순위 |
|---|---|---|
| **D-AX-11** | FE 산재 페이지 이전 — `ArologisManualDispatchPage` / `PreClassifyPage` / `UnassignedPage` / `DispatchReconcilePage` 4 page + `arologis*Api.ts` 3 + `ArologisRealtimeClient.ts` 가 `clients/desktop/{routes,api,realtime}` 루트에 산재. 본 PR = placeholder. 후속 = `git mv` + import 갱신 + 실 routing | **HIGH** (placeholder 상태 불완전) |
| **D-AX-12** | mobile cross-import 분리 — `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx` 가 `../SlipDetailScreen` (sales/slip) cross-import. `SlipDetailScreen` 처리 결정 (같이 이전 / shared 추출 / 복제) | **MEDIUM** |
| **D-AX-13** | BE/FE auth schema 정합 검증 — `/auth/me` 응답 형태 (`AuthMeResponse` vs `MeResponse`) e2e 통합 검증 | **MEDIUM** |

### 운영 환경 의무 (cutover 직전)

| 항목 | 작업 |
|---|---|
| ACM SAN 갱신 | Terraform main.tf `aws_acm_certificate.main.subject_alternative_names` 에 `*.arologis.samhan-air.com` 추가 (별도 PR) |
| EC2 Health Lambda | CloudWatch alarm + SNS 만 추가 (Samhan Public 14 service 함께 outage 회피, 별도 PR) |

---

## 3. 양 PC 메모리 sync (자동)

본 PR 머지로 다음 메모리가 `.claude/memory/` 에 추가됨 (양 PC 자동 sync):

- `project_arologis_independent.md` — 9 결정 + 도메인 영향 (UserClient 제거 / 자체 auth / Flyway V7~V9)
- `feedback_arologis_name.md` — 한국어 표기 "아로로지스" 정식
- `feedback_samhan_public_name.md` — 외부 호칭 "Samhan Public"
- `feedback_arologis_extract_autopilot.md` — 본 작업 자율 진행 권한 (머지 외 + QA 캡처 자율)

회사 PC 에서 `git pull && ./scripts/sync-claude-memory.ps1` 실행으로 갱신.

---

## 4. 미완료 / 사용자 결정 필요

- [ ] D-AX-11 (FE 산재 페이지) 진입 시점 — 개발책임자 trigger 대기
- [ ] ACM SAN 갱신 + EC2 Health Lambda 별도 PR — Phase 11 cutover 전 의무
- [ ] arologis-teal `#2A9D8F` brand color — Samhan Public design system (`clients/web/design-system`) 확장 합의 필요 (Designer concern)

---

## 5. 양 PC 작업 인계 순서

### 떠나는 PC

```powershell
git add docs/handoff/CURRENT-WORK.md
git commit -m "handoff: Phase 10.5 머지 완료 + 후속 D-AX-11~13 + ACM/EC2 대기"
git push
```

### 도착하는 PC

```powershell
git pull
.\scripts\sync-claude-memory.ps1   # 4 신규 메모리 동기화
# Claude Code 새 세션 → CLAUDE.md 자동 로드 + 본 파일 read 으로 컨텍스트 회복
```
