# §7 그룹웨어 결재 확장 — 결재유형 템플릿 빌더 + 첨부(전표·거래처원장·파일)

> PR #480 통합(개발책임자 2026-06-14 결정 — 별도 슬라이스 아님). 기반 결재 collab 위에 누적.
> 워크플로우: Opus 기획(본 문서) → **Codex 구현** → Opus 라운드 → Codex 라운드 → 수렴 → 머지.

## ✅ 개발책임자 결정 (2026-06-14)
1. **결재유형 = 관리자 템플릿 빌더(풀)**: 관리자가 결재 유형 + 세부 필드(라벨·타입[TEXT/NUMBER/DATE/SELECT/TEXTAREA]·필수·순서[·SELECT 옵션])를 화면에서 생성·설정. 견본 2종(지출결의서·휴가신청서) 시드. 사용자는 유형 선택 → 동적 폼 렌더 → 값 입력.
2. **첨부 = 참조 링크**: 전표(전표번호+유형 참조)·거래처원장(거래처+기간 참조) 링크(클릭 시 원본 화면 이동, 실시간 데이터) + 사진/PDF 파일 업로드(MinIO).
3. **PR #480 통합**.

## 데이터 모델 (groupware-service)

### 템플릿 엔진
- `ApprovalTemplate`(BaseEntity): `code`(unique, 예 EXPENSE_REPORT/LEAVE_REQUEST), `name`(지출결의서/휴가신청서), `description`, `active`(boolean), `displayOrder`. Soft delete. 도메인 메서드(activate/deactivate/rename/reorder, 직접 set 금지).
- `ApprovalTemplateField`(BaseEntity): `template`(ManyToOne), `fieldKey`(template 내 unique·영문 slug), `label`(한글), `fieldType`(enum TEXT/NUMBER/DATE/SELECT/TEXTAREA), `required`(boolean), `displayOrder`, `options`(SELECT 전용 — JSON 배열 문자열 또는 별도 컬럼), `placeholder`(nullable). Soft delete.
- `ApprovalLine` 추가: `templateId`(UUID, nullable — 레거시/자유형 호환), `fieldValuesJson`(JSONB — fieldKey→value 맵). 생성·collab 편집 시 템플릿 스키마로 검증(required 누락 400, 타입 강제: NUMBER 숫자/DATE ISO/SELECT 옵션 포함).

### 첨부 (slip-service attachment 패턴 클론)
- `ApprovalAttachment`(BaseEntity): `approval`(ManyToOne ApprovalLine), `attachmentType`(enum SLIP_REF/PARTNER_LEDGER_REF/FILE), `displayOrder`, `label`.
  - SLIP_REF: `refSlipNo`(슬래시 전표번호), `refSlipType`(SLIP_OUTBOUND/SLIP_INBOUND/ACCOUNTING_VOUCHER 등).
  - PARTNER_LEDGER_REF: `refPartnerCode`(=bizno digits), `refPartnerName`, `refPeriod`(YYYY-MM).
  - FILE: `storageKey`(MinIO object key), `fileName`, `contentType`, `fileSize`(long).
- 스토리지: `ApprovalAttachmentStorage` interface + `MinioApprovalAttachmentStorage`(@ConditionalOnProperty samhan.minio.enabled=true) + `NoopApprovalAttachmentStorage`(fallback). 버킷 `groupware-approval-attachments`(setup-minio-buckets 멱등 추가). build.gradle minio 의존 추가(slip-service 동일 버전).
- **잠금**: COLLAB_LOCKED(APPROVED/REJECTED/WITHDRAWN) 시 첨부 add/remove 거부(409 — guardCollabModifiable 재사용).

## 엔드포인트

### 결재유형 관리 (page-code 신규 `groupware.approval-templates`, MASTER/MANAGER)
- `GET /admin/groupware/approval-templates` (목록 + fields)
- `GET /admin/groupware/approval-templates/{id}`
- `POST /admin/groupware/approval-templates` (유형 생성 — name/code/description + fields[] 일괄)
- `PUT /admin/groupware/approval-templates/{id}` (유형 + fields 전체 교체[replace-set], displayOrder 반영)
- `DELETE /admin/groupware/approval-templates/{id}` (soft delete = 비활성)
- `GET /internal/groupware/approval-templates/active` (사용자 작성 화면용 활성 유형 목록 — VIEW)

### 결재 생성 (기존 GroupwareAdminController POST 확장)
- body: `templateId` + `fieldValues`(map) + `title` + `attachments`(선택) + `approverIds`. templateId 있으면 스키마 검증. title 은 유지(문서 제목), content 는 nullable(템플릿형은 fieldValues 가 본문).

### 첨부 (page-code groupware.approvals, action UPDATE; 조회 VIEW)
- `GET /admin/groupware/approvals/{id}/attachments`
- `POST /admin/groupware/approvals/{id}/attachments` (참조 추가 — SLIP_REF/PARTNER_LEDGER_REF)
- `POST /admin/groupware/approvals/{id}/attachments/file` (multipart 업로드 → MinIO → FILE)
- `GET /admin/groupware/approvals/{id}/attachments/{attId}/download` (MinIO presigned 또는 proxy 스트림)
- `DELETE /admin/groupware/approvals/{id}/attachments/{attId}` (잠금 시 409)

### collab overlay 확장 (기존 GroupwareApprovalCollabEditService)
- changeSet 화이트리스트 = `title`, `content`, **+ `field.{fieldKey}`**(템플릿 스키마 검증 — 없는 키/타입불일치 400). 핵심필드(approvalNo/status/steps/templateId/requesterId) 400 유지. 첨부는 collab changeSet 아님(전용 엔드포인트).

## 시드 (groupware V5 마이그 + Seeder)
- 템플릿 **지출결의서**(EXPENSE_REPORT): 필드 — 지출항목(TEXT,req), 금액(NUMBER,req), 계정과목(SELECT[복리후생비/여비교통비/소모품비/접대비/기타] 또는 TEXT), 지출일(DATE,req), 적요(TEXTAREA).
- 템플릿 **휴가신청서**(LEAVE_REQUEST): 필드 — 휴가종류(SELECT[연차/반차(오전)/반차(오후)/병가/경조사],req), 시작일(DATE,req), 종료일(DATE,req), 사유(TEXTAREA,req).
- page-code `groupware.approval-templates`: PageCode enum + V57(auth, V56 그룹모델 패턴 — group_page_permissions 101 + account materialize). FE PageCode 타입 + canAccess.

## FE (clients/desktop)
- **결재유형 관리** `GroupwareApprovalTemplateAdminPage`(`/groupware/approval-templates`): 유형 목록 + 생성/수정(필드 빌더 — 행 추가/삭제, label·type·required·order·SELECT options 편집, drag 또는 order 입력). 메뉴 그룹웨어 → "결재 양식". canAccess groupware.approval-templates.
- **결재 작성** `GroupwareApprovalCreatePage`(또는 모달, `/groupware/approvals/new`): 유형 선택 → `DynamicFieldRenderer`(fieldType별 Input/Select/Date/Textarea) → 값 입력 + 제목 + 결재선 + 첨부(전표 검색 모달·거래처+기간 선택·파일 업로드).
- **상세** 확장: templateName + 동적 fieldValues(스키마 라벨) 렌더 + 첨부 목록(전표 링크→전표 상세 이동, 원장 링크→accounting 거래처원장 이동, 파일→다운로드).
- **collab 패널** 확장: 수정완료 편집에 동적 field 값 포함(템플릿 스키마 기반 입력). 첨부 add/remove(잠금 시 숨김/비활).
- api 클라이언트: groupwareApprovalTemplate.ts + groupwareApprovalAttachment.ts. UUID 비공개.

## 검증
- BE: 템플릿 CRUD + 스키마검증 + 첨부(ref/file) + collab field overlay IT(실 Testcontainers). MinIO 는 Noop fallback 으로 IT(파일 업로드는 Noop 또는 testcontainers minio). 마이그 fresh-postgres probe.
- 실서버 라이브 QA: 유형 생성(빌더) → 결재 작성(동적 폼) → 첨부(전표 링크·원장 링크·파일 업로드) → 상세 렌더 → 수정완료(field 편집) → 잠금. dev_master, 합성 0.

## 구현 단계 (Codex)
1. BE-1: 템플릿 엔진(엔티티/repo/service/admin 컨트롤러/DTO + 스키마검증) + V5 마이그(template/field 테이블 + approval_lines templateId/field_values + 2종 시드) + page-code enum/V57.
2. BE-2: 첨부(엔티티/storage Minio+Noop/service/컨트롤러/DTO + 버킷) + collab field overlay 확장.
3. FE-1: 유형 관리(빌더) + api.
4. FE-2: 결재 작성(동적 폼 + 첨부) + 상세 렌더 + collab field 편집.
5. IT + 라이브 QA.
