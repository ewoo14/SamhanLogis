# A2-G2 (FE) 그룹웨어 결재 일원화 — 구현 계획 (Opus 기획)

> [[project_groupware_approval_unification]] 잔여 FE 슬라이스. A2-G1(BE) 머지 완료(PR #657). 표준 워크플로우: Opus 기획 → Codex 개발 → 순차 듀얼리뷰(③Opus fix↔④Codex fix) → 실서버 QA(데스크탑+모바일 스샷) → 0수렴 → 머지.

## 목표
A2-G1(BE)의 중앙 config 결재선 인스턴스화를 FE에 노출 — 결재자 관리 일원화 완성.

## 범위 (FE clients/desktop)
1. **결재라인 설정(`ApprovalLineConfigPage.tsx`)**: 기존 전표 종류 결재선 관리에 **그룹웨어 결재유형**(ApprovalTemplate, documentType=`GROUPWARE_`+code) 결재선 관리 추가. 유형별 역할(CREATOR/USER/GROUP)·순서·결재자(그룹∪개인 칩)·필수 지정. 기존 칩/드래그/인라인편집 UI 재사용.
2. **결재 생성 폼**(그룹웨어 결재 작성 페이지): 결재유형 선택 시 해당 config 결재선을 **인스턴스 미리보기**로 표시 + **override 칩**(작성자가 결재자 추가/제거/순서 — 기존 사원검색 칩 재사용). config 미설정 유형=기존 수동 동작(opt-in).
3. **결재 단계 표시(StepView)**: GROUP 단계는 BE가 approverGroupId만 반환(실명 미해석) → **FE가 그룹 카탈로그(`approval-line-configs/groups` 또는 permission-groups)에서 approverGroupId→그룹명 해석**. stepType 라벨 매핑(CREATOR=작성자/USER=직접지정/GROUP=권한그룹).
4. **api**: `approvalLineConfigApi.ts` 그룹웨어 documentType 지원 + 그룹명 lookup. mock.ts 핸들러 + page-code. playwright(결재라인 설정 그룹웨어 유형·결재 생성 결재선/override).

## A2-G1 BE 소비 (기존)
- 결재라인 설정 admin: `ApprovalLineConfigController`(generic documentType — 그룹웨어 documentType 수용 확인).
- 그룹웨어 결재 생성: config 인스턴스화(서비스 자동) + StepView(stepType·approverGroupId).
- 그룹명: auth `/approval-line-configs/groups`(권한 그룹 목록 id+name) 또는 permission-groups.

## 주의 (메모리 가드)
- **FE 모바일 반응형 의무**([[feedback_fe_mobile_responsive]]) — 결재라인 설정·결재 생성 모바일 캡처 동반.
- page-code FE↔BE 일치 · UUID/그룹ID 화면 비노출(그룹명만, [[feedback_uuid_no_user_visibility]]) · 영문 enum(StepType) 직노출 금지(한국어 라벨 매핑).
- FE 가드/옵션 타입 BE DTO 정확 일치([[feedback_fe_option_type_matches_be_dto]]) · mock suite 전체 갱신([[feedback_fe_guard_removal_contract_tests]]).
- **실서버 Docker QA**(mock OFF·:8080·dev_master) — §7 교훈 SAMHAN_USER_SERVICE_URL 운영설정. 결재라인 설정 그룹웨어 유형·결재 생성 config 인스턴스·override·그룹명 표시·모바일.

## 다음
Codex 개발(FE) → Opus 5-agent(FE/Design/BE계약/QA/접근성)+fix+라이브QA ↔ Codex 5-agent+fix → 0수렴 → 머지. → 큐 ④ AWS 이식 준비.
