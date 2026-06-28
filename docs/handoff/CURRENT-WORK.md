# 현재 작업 핸드오프 노트

> 회사 PC 첫 세션 시작 시 본 파일만 읽으면 즉시 컨텍스트 복원 가능.
> 갱신: 2026-06-29 (야간 자율 세션). 다음 세션 첫 읽기 파일.

---

## ✅ 에픽 task#24 (A2 그룹웨어 결재 일원화) — **완료** (A2-G1 BE + A2-G2 FE 머지)

자체 결재 chain ↔ 중앙 `approval_line_config` **일원화** (개발책임자 결정: A — 중앙 config 정의원 + 그룹웨어 인스턴스화, override 허용, 그룹/1인 지정 모두).

- ✅ **A2-G1 (BE 중앙 config 인스턴스화)**: PR #657 머지(`8d7450b2d`). approval_line_config 가 그룹웨어 documentType 수용·authorize/조회 일반화·V75 시드(GROUPWARE_EXPENSE_REPORT 작성자/부서장 GROUP/대표 USER)·ApprovalStep GROUP 모드(approverGroupId any-member)·CREATOR→requester USER 변환·per-doc override·opt-in. 실결함 적발: GROUP approve 409·identity spoofing·권한상승·IT false-green·V9 NOT NULL.
- ✅ **A2-G2 (FE 결재 일원화 노출)**: PR #659 머지(squash `7ec80eddd`). 결재라인 설정 그룹웨어 결재유형 결재선·생성 폼 config 미리보기+override 칩·StepView 비-admin 라벨·작성자 추론. 실결함 적발: BE계약 CREATOR→USER·**비-admin 페이지 admin 엔드포인트 403**·mock V75 불일치·**V77 대표=dev_master 자기결재 충돌**·dead code·템플릿 admin 호출·CREATOR-only 결재선. 라이브 BE QA(재빌드 A2-G1): GROUPWARE_EXPENSE_REPORT config 실존 확인.

에픽 메모리 `project_groupware_approval_unification.md`. spec `docs/superpowers/specs/2026-06-28-groupware-approval-unification-design.md`. plan `docs/superpowers/plans/2026-06-29-a2-g2-groupware-approval-fe.md`.

## ✅ OCR 메뉴 전수 삭제 — **완료** (PR #658 머지 `6abc7d859`)

개발책임자 지시: OCR 메뉴 모두 삭제, **추후 GAS(외부)→주문서 직접 전송 레거시 패턴으로 대체 예정**. 영수증 OCR(CLOVA)·발주서 업로드 OCR(Tesseract) 제거·V76(role_page_permissions hard delete + 5테이블 soft delete). 실결함 적발: V76 5테이블 패턴·CI Tesseract·ps1 UTF-16 손상 근본(.gitattributes CRLF)·credential guard. 메모리 `project_ocr_removal_gas_direct.md`.

## ✅ Phase 11 AWS 이식 준비 — **머지 완료** (PR #660 `579835efc`, terraform 검증 통과)

개발책임자 야간 지시 "AWS 이식 준비 — 바로 이식할 수 있도록". 기존 IaC(#152, May 11)를 **17 service 현행화 + 이식 준비 산출물** 보강. 메모리 `project_overnight_autonomous_aws_prep.md`·`project_phase11_aws.md`.

- **0수렴**(Opus 0 / Codex 0, **5 듀얼리뷰 반복**) + **terraform v1.15.7 직접 검증 통과**: `validate` Success · `fmt` clean · `plan`(더미 tfvars) 그래프/data source/Outputs 계산 완료(STS 더미자격서만 실패=구조적 plan-ready).
- **산출물**: IaC 17서비스 현행화 · `ecr.tf`·**`infrastructure/docker-compose.prod.yml`**(17 service+RDS/S3)·`init-rds.sql`·**`infrastructure/terraform/CUTOVER.md`**(6단계 런북+수동 18항목)·`user_data.sh`·aws_s3_object 자동 업로드. 시크릿 평문 0→**Secrets Manager 일원화**·S3 첨부 5서비스 env·기존 hosted zone data source.
- **CI**: 앱 전 그린 · GitGuardian = PM false-positive(Secrets Manager 참조·placeholder).

### 🚀 회사 PC = 실 cutover 만 남음 (IaC 코드·terraform validate 완료)
IaC는 머지·validate 통과. 회사 PC(AWS 계정 보유):
1. `infrastructure/terraform/terraform.tfvars` 실값 작성(rds_password·route53_zone_id·ami_id 등) + AWS 자격 설정
2. `cd infrastructure/terraform && terraform init && terraform plan -var-file=terraform.tfvars` (실 AWS 대상 plan)
3. `terraform apply` → `CUTOVER.md` 단계 0~6 이식
4. 수동 18항목(M-1~18: AWS 계정·Secrets Manager 시크릿 7종·SSH키·S3 backend·도메인 hosted zone 위임·ACM `*.arologis` SAN·로컬 PG→RDS 이관) — CUTOVER.md 기재, 선행 필수

## 🚧 백로그 (개발책임자 착수 확인 필요)
- **OCR → GAS-direct 주문서 전송** — OCR 삭제 후속(레거시 GAS 패턴 재사용). 개발책임자 계획.
- **Phase 11 AWS 실 cutover** — #660 머지·terraform validate 완료. 회사 PC 실 자격 `terraform apply` + 수동 18항목(CUTOVER.md) 후 운영.

## 완료된 큰 흐름 (이번 야간 자율 세션)
- ✅ A2 그룹웨어 결재 일원화 에픽(task#24) 완결 — A2-G1 BE + A2-G2 FE 표준 워크플로우(순차 듀얼리뷰·0수렴) 머지.
- ✅ OCR 메뉴 전수 삭제(#658).
- ✅ AWS 이식 준비(#660) **머지** + terraform v1.15.7 validate/plan 통과 — 회사 PC는 실 자격 cutover만.
- 순차 듀얼리뷰가 compile/unit 미검출 실결함 다수 적발(A2-G1 5·A2-G2 7·OCR 4·AWS 16+).

## ⚠️ 워크플로우 주의(박제)
- 매 단계 ScheduleWakeup 재자각·연속 mega턴 금지. 라운드마다 fix후 라이브QA(mock OFF)+스샷·각 라운드 즉시 독립 게시·fix후 0수렴 재리뷰·**듀얼리뷰 순차**(Opus 라운드=Opus fix / Codex 라운드=Codex fix)·단축금지.
- 마이그레이션 불변(V* in-place 금지, 신규 V만). page-code FE↔BE 일치·UUID/그룹ID 비노출·게이트웨이 단일 신원 권위(X-User-Role 미주입). 적용 마이그 불변(V75→V77 신규).
- Codex=`mcp__codex__codex`(리뷰 read-only / 수정 danger-full-access). PM 자동 머지: 0수렴+CI green 시 자율(개발책임자 '자율 계속' 승인). IaC는 terraform validate 게이트 추가.
- **IaC 머지는 실 terraform validate/plan 필수**(terraform CLI+AWS 계정). 집 PC 미설치 → 회사 PC 과제.
