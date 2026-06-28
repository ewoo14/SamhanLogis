# A2 그룹웨어 결재 — 자체 결재선 ↔ 중앙 config 일원화 (설계)

> task#24 · 결재 enforcement 에픽(project_approval_enforcement_epic) 잔여. 2026-06-28 브레인스토밍 확정.
> 개발책임자 승인: 목표=일원화 · 접근 A · 5결정 확정. → writing-plans → 표준 워크플로우.

## 1. 목표
그룹웨어 자체 결재선(per-문서 순차 chain)과 중앙 `approval_line_config`(슬립 B-게이트용)를 **일원화** — 결재자/결재선 정의를 한 곳(중앙 '결재라인 설정')에서 관리.

## 2. 현황 (탐색 완료)
- **그룹웨어 결재 문서 기능 = 완성·머지**(§7 협업 에픽 PR #480 `014d63cf5`): 결재유형 템플릿 빌더(동적필드)·collab·통합 문서 참조 첨부·결재자 사원검색 칩·결재선 실명.
- **그룹웨어 모델**: `ApprovalLine`(per-문서) → 순차 `ApprovalStep`(현재 USER 모드 `approverUserId`·sequence, 로직=shared `ApprovalStepBase`). 결재자=수동 사원검색 칩.
- **중앙 모델**: `auth ApprovalLineConfig`(per-documentType 순차 역할: sequence·label·`StepType`[CREATOR/GROUP/USER]·actionKey·required) + `ApprovalLineApprover`(그룹∪개인). '결재라인 설정' 메뉴. 슬립 A2-1~A2-5 enforcement 소비. **재사용 패턴**: auth `POST /auth/internal/approval-line/authorize`{documentType,actionKey,userId}→{configured,allowed}(X-Internal-Token·generic) ← 서비스 `ApprovalLineAuthorizeClient`(loadBalanced RestClient·parse fail-closed·DI 가드 테스트).

## 3. 접근 = A (확정)
중앙 `approval_line_config` = 그룹웨어 결재유형별 결재선의 **단일 정의원**. 그룹웨어 결재 문서 생성 시 config 결재선 → `ApprovalStep` 인스턴스화(+per-doc override). 결재자 관리 = 중앙 한 곳. 기존 그룹웨어 결재 기능 보존.

## 4. 설계 결정 (5)
**① 결재유형↔documentType (1:1)**: 각 그룹웨어 결재유형(`ApprovalTemplate`) = 중앙 config `documentType`(안정 키, 예 `GROUPWARE_APPROVAL:{templateKey}`). '결재라인 설정' 메뉴가 그룹웨어 결재유형별 결재선(역할·순서·결재자)도 관리 — 슬립 documentType과 동일 카탈로그.

**② 인스턴스화 + per-doc override (허용)**: 그룹웨어 결재 문서 생성 시 해당 유형 config 결재선의 역할(sequence)대로 `ApprovalStep` 생성. CREATOR→문서 작성자, USER→지정 개인, GROUP→③. **override 허용** — 작성자가 인스턴스화된 결재선을 기본값으로 시작해 결재자 추가/제거/순서 조정(기존 사원검색 칩 UI 유지).

**③ GROUP 양 모드**: config GROUP 역할 → 인스턴스화 시 (a) **그룹-역할 단계**(그룹 멤버 누구나 해당 단계 결재 — config GROUP 의미·슬립 B-게이트 일관) **또는** (b) **1인 지정**(작성자/관리자가 그룹에서 구체 결재자 선택). `ApprovalStep`/`ApprovalStepBase`에 **GROUP 모드**(approverGroupId, any-member 충족) 추가 + 기존 USER 모드(approverUserId) 공존. 결재 충족 판정: GROUP 단계=그룹 멤버이면 통과, USER 단계=지정 개인.

**④ 마이그레이션 (additive)**: 기존 그룹웨어 결재 문서=기존 chain 유지(in-flight 무영향). config 결재선 **미설정** 유형=기존 수동 결재선 동작(opt-in — 슬립 A2 `configured=false 통과` 패턴 일관). 신규/설정된 유형만 config 기반 인스턴스화.

**⑤ 슬라이스 (2)**:
- **A2-G1 (BE)**: 중앙 config 그룹웨어 documentType 지원 + `ApprovalStep` GROUP 모드(approverGroupId·CHECK·마이그) + 그룹웨어 결재 생성 서비스가 config 결재선 조회(authorize 패턴 또는 internal 조회)→ApprovalStep 인스턴스화 + override 머지 + GROUP 단계 충족 판정. IT(인스턴스화·override·GROUP both·CREATOR·opt-in, 실 Postgres·fresh PG 마이그 probe).
- **A2-G2 (FE)**: '결재라인 설정' 메뉴에 그룹웨어 결재유형별 결재선 관리 + 결재 문서 생성 시 config 기반 결재선 표시·override 칩(추가/제거/순서). desktop typecheck+Playwright+**실서버 Docker QA**(mock OFF·게이트웨이:8080·dev_master, §7 교훈 SAMHAN_USER_SERVICE_URL 운영설정).

## 5. 아키텍처/컴포넌트
- **auth-service**: `ApprovalLineConfig`/`ApprovalLineApprover` 에 그룹웨어 documentType 수용(기존 구조 재사용). authorize/조회 엔드포인트 그룹웨어 documentType 일반화. V## 시드(그룹웨어 결재유형 결재선, 멱등).
- **groupware-service**: `ApprovalStepBase`/`ApprovalStep` GROUP 모드 + 결재선 인스턴스화 서비스(config 조회 client) + GROUP 단계 충족 판정. V##(approval_steps approver_group_id ALTER + CHECK).
- **공유**: `com.samhanair.logis.approval` StepType 재사용.
- **FE(desktop)**: 결재라인 설정 페이지 그룹웨어 유형 탭/섹션 + 결재 생성 폼 결재선 인스턴스 표시·override 칩(기존 ApprovalLine 칩 컴포넌트 재사용).

## 6. 데이터 흐름
결재라인 설정(중앙)에서 그룹웨어 결재유형별 결재선 정의 → 그룹웨어 결재 문서 생성 시 groupware-service 가 config 결재선 조회 → ApprovalStep 인스턴스화(CREATOR/USER/GROUP) → 작성자 override(칩) → 저장 → 결재 진행 시 각 단계 충족 판정(USER=지정자, GROUP=그룹 멤버).

## 7. 에러/보안
- page-code FE↔BE 일치·결재선 정의는 중앙 권위(위조 방지)·결재자 PII/UUID 비노출(실명 resolve 패턴 §7).
- 적용된 마이그레이션 불변(신규 V·fresh PG probe). config 미설정 유형 fail-safe(기존 수동).
- 사용자 노출 한국어·영문 enum 0.

## 8. 테스트
- **BE**: 그룹웨어 결재 인스턴스화 IT(config→chain·CREATOR/USER/GROUP·override 머지·GROUP both 충족·opt-in 미설정 유형, 실 Postgres) + authorize client DI 가드 + 마이그 fresh PG probe.
- **FE**: 결재라인 설정 그룹웨어 유형·결재 생성 결재선/override Playwright + **실서버 Docker QA**(데스크탑+모바일 스샷).
- §7 교훈: 실서버 QA 가 mock/IT 미검출 운영설정 파손 적발 — 머지 전 필수.

## 9. 워크플로우
표준 워크플로우(유일 진실원): Opus 기획+조기 PR → Codex 개발 → 순차 듀얼리뷰(Opus 5-agent+직접fix+라이브QA스샷+TM ↔ Codex) 0수렴 → PM 종합 → CI green → PM 머지. 슬라이스별(A2-G1→A2-G2).
