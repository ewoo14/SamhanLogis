# PR #147 — TM 통합 검증 결과

| 항목 | 값 |
|------|-----|
| PR | #147 — feat(P1 사진 첨부): 검수/배송/영업 3건 — MinIO storage + RN 카메라/갤러리 |
| Branch | `feature/p1-photo-attachment-minio` → `main` |
| 검증일 | 2026-05-11 |
| 검증자 | TM (Tech Manager) |
| 회고 가드 대상 | PR #134~#146 (P0-1 Slice A~C, P0-2, P0-4~6, P0-9, P1-3~6) |

---

## 1. TM cross-check 매트릭스

| Check | 결과 | 비고 |
|---|---|---|
| UUID 정합성 (cross-service join) | 통과 | partner UUID 미사용, partnerCode 비즈니스 식별자만 BE 호출에 사용. inspection.id 와 slipId 분리 일관 |
| API contract (FE↔BE) | **수정 1건** | 검수/방문/배송 3건 gateway StripPrefix=2 정합성 mismatch → 자가 fix |
| 디자인 일관성 | 통과 | PHOTO-ATTACHMENT-DESIGN.md wireframe 일관, theme/tokens 사용 |
| 도메인 정합성 | 통과 | InboundInspection slipId logical reference, AttachmentType.VISIT_PHOTO V8 enum 확장, SlipAttachmentType.DELIVERY 강제 일관 |
| Flyway 의존성 | 통과 | V9 inspection_attachments 신규 (FK → inbound_inspections 정상), V8 partner CHECK 제약 교체 단방향 idempotent |
| 메모리 가드 | 통과 | 한국어 commit/PR/Issue, UUID 비공개, Role 풀네임, 5-team 디스패치, dev-report 누적, 통합 PR 패턴 모두 충족 |

---

## 2. PR #134~#146 회고 가드 점검

| 가드 | 점검 결과 |
|---|---|
| `feedback_uuid_no_user_visibility` (UUID 비공개) | mobile VisitPhotoScreen 의 `partnerId` UUID 전달이 **위반** → partnerCode 만 사용하도록 fix |
| `feedback_korean_commits` (한국어 commit/PR/Issue) | 4 commit 모두 한국어. PR body 한국어 |
| `feedback_role_naming_full` (Role 풀네임) | controller `@PreAuthorize` 모두 풀네임 (DRIVER/SALES/MANAGER/MASTER/WAREHOUSE) |
| `feedback_no_dev_director_mention` (개발책임자 단어 금지) | 본 PR diff/dev-report 에 "개발책임자" 단어 없음 |
| `feedback_pr_qa_screenshots` (QA 스크린샷) | iteration 2 항목으로 Designer 분리 명시. 본 PR scope 는 BE/FE 정합성 fix |
| `feedback_continuous_docs_sync` (문서 동기화) | dev-report §7-5 신규, 매뉴얼 04-사진-첨부.md 갱신 (선행 commit), TM-VERIFICATION 신규 |
| `feedback_pm_integration_build_check` (사전 컴파일 + Layer 4) | 본 검증에서 BE compile + test + FE typecheck 모두 PASS |
| `feedback_multi_agent_team_pattern` (5-team 패턴) | BE×3 + FE + Designer + DevOps 산출물 모두 단일 PR 통합 |
| `feedback_integrated_pr_pattern` (통합 PR) | Excel/UI 파편화 없이 P1 사진 3건 단일 PR |
| `feedback_it_mockbean_external_clients` | 본 PR IT 신규 없음. 단위 테스트 InspectionAttachmentServiceTest 는 외부 client 미참조 |
| `feedback_korean_path_jdk` | 본 검증은 `assemble`/`compileJava`/`compileTestJava`/단일 `--tests` 만 사용 (한글 path 트랩 회피) |
| `feedback_function_documentation` (3-layer Javadoc + dev-report) | controller / service / repository 모두 한국어 Javadoc 보강 |
| `feedback_uuid_no_user_visibility` 추가 점검 | mobile/desktop 응답 viewer 가 fileName/uploadedAt/capturedAt 만 사용자 노출. UUID는 path/삭제 호출 전용 |

---

## 3. 발견 BLOCKER 및 자가 fix

### BLOCKER 1 — InspectionAttachmentController gateway routing mismatch

- **현상**: controller mapping `@RequestMapping("/inspections/{inspectionId}/attachments")` 가 gateway StripPrefix=2 후 도착 경로 `/inventory/inspections/...` 와 불일치 → 모든 검수 사진 업로드 404
- **fix**: `@RequestMapping("/inventory/inspections/{slipId}/attachments")` 로 도착 경로 기준 mapping. service signature `inspectionId → slipId` 변경 + `findBySlipIdAndIsDeletedFalse(slipId)` lookup 으로 InboundInspection resolve. 단위 테스트 mock 도 동기화

### BLOCKER 2 — PartnerVisitAttachmentController 호출 URL 불일치

- **현상**: mobile `uploadVisitAttachment` 가 `/api/v1/partners/{partnerId}/visit-attachments` 호출 → gateway 도착 `/partners/...` 인데 controller mapping `/admin/partners/...` 와 mismatch → 404
- **fix**: controller mapping 은 `/admin/partners/{partnerCode}/visit-attachments` 유지 (도착 경로 기준). mobile URL 을 `/api/v1/partners/admin/partners/{partnerCode}/visit-attachments` 로 변경 (excelExportApi 패턴 일관)

### BLOCKER 3 — UUID 비공개 가드 위반 (방문 사진)

- **현상**: VisitPhotoScreen 이 `partnerId` UUID prop 으로 BE 호출 → `feedback_uuid_no_user_visibility` 위반
- **fix**: `partnerCode` 인자로 변경. `partnerId` prop 은 deprecated 유지 (SalesTabNavigator 호환 위해 시그니처 보존)

### WARNING 1 — DeliveryAttachmentController FE 미연결

- **현상**: BE `DeliveryAttachmentController POST /slips/{slipId}/delivery-attachments` 신설했지만 mobile attachmentApi 가 인증 기반 호출 함수 미제공 (token 기반 `uploadAttachmentByToken` 만 존재)
- **fix**: `uploadDeliveryAttachment(token, slipId, input)` 신규 추가. desktop `listSlipAttachments` URL 도 `/api/v1/slips/{slipId}/delivery-attachments` 로 정렬

### WARNING 2 — public token URL prefix 누락

- **현상**: mobile `uploadAttachmentByToken` 이 `/public/...` 호출 → gateway slip-service-public route 는 `/api/public/**` 매칭 → mismatch
- **fix**: URL 을 `/api/public/batches/{token}/slips/{slipNo}/attachments` 로 변경

### NIT 1 — desktop deleteAttachment 매개변수 부족

- **현상**: 단순 `DELETE /api/v1/attachments/{attachmentId}` 호출 → BE 매핑 부재
- **fix**: `deleteInspectionAttachment(slipId, attachmentId)` 로 재구성하여 BE `DELETE /inventory/inspections/{slipId}/attachments/{attachmentId}` 와 정합. 호출처 0건 (영향 없음)

---

## 4. 잠재 회귀 (본 PR 외 — 별도 PR 권장)

| 항목 | 위치 | 비고 |
|---|---|---|
| InboundInspectionController 풀패스 매핑 | services/inventory-service/.../InboundInspectionController.java L51 `@RequestMapping("/api/v1/inventory/inbound-inspections")` | gateway StripPrefix=2 후 도착 `/inventory/inbound-inspections` 와 mismatch. PR #142 잠재 운영 routing 결함 가능. 본 PR scope 외 → 후속 fix PR 권장 |
| PartnerAttachmentController 풀패스 매핑 | services/partner-service/.../PartnerAttachmentController.java L37 `@RequestMapping("/api/v1/partners")` | 동일 패턴. P0-6 회귀 분석 필요 |

위 2건은 PR #147 직접 영향 아님 (선행 PR 머지 후 잔존). PR #147 내부의 신규 controller 는 모두 도착 경로 기준 매핑으로 수정 완료.

---

## 5. 빌드 + 테스트 검증 결과

| Stage | 명령 | 결과 |
|---|---|---|
| inventory-service compile | `./gradlew :services:inventory-service:compileJava :services:inventory-service:compileTestJava` | PASS |
| partner-service compile | `./gradlew :services:partner-service:compileJava` | PASS |
| slip-service compile | `./gradlew :services:slip-service:compileJava` | PASS |
| Inspection 단위 테스트 | `./gradlew :services:inventory-service:test --tests InspectionAttachmentServiceTest` | PASS (4/4) |
| mobile-staff typecheck | `npx tsc --noEmit` | PASS (0 error) |
| desktop typecheck | `npx tsc --noEmit` | PASS (0 error) |

---

## 6. PM 위임 사항

- 풀빌드 (`./gradlew assemble :clients:desktop:build` 등) — PM 책임
- CI watch (`gh pr checks 147 --watch`) + green 후 PM 최종 승인 — PM 책임
- 개발책임자 본인 머지 요청 — PM 책임
- 잠재 회귀 (§4) 별도 fix PR 발행 여부 — PM 의사결정

---

## 7. 결론

| 항목 | 결과 |
|---|---|
| TM 통합 검증 | **통과 (자가 fix 6건 적용)** |
| BLOCKER | 0 (모두 fix) |
| WARNING | 0 (모두 fix) |
| NIT | 0 (모두 fix) |
| 권장 후속 | 잠재 회귀 §4 (별도 PR) |
