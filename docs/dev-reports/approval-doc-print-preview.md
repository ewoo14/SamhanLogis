# 미리보기 표준화 슬라이스2 — 그룹웨어 결재문서 인쇄 미리보기 (approvalDoc 스캐폴드 활성)

> 에픽: 문서/전표 미리보기 표준화. 슬라이스1(#481)에서 `PrintLayout` 의 결재문서 골격
> (`approvalDoc`/`docHeader`/`approvalSteps`/`closingNote`)을 **미사용 스캐폴드**로 박제했다.
> 본 슬라이스는 이 골격을 **그룹웨어 결재(`/groupware/approvals/:id`)** 인쇄 미리보기에 연결하여
> 개발책임자 확정 결재문서 형식(제목 / 결재란(작성자 포함) / 내용 / 첨부 / 마지막 인삿말)을 실현한다.

## 1. 개발책임자 확정 결재문서 형식 (2026-06-14)
- 상단: **제목** 1개 (회사명/사업자번호 블록 제거 — slice1 에서 이미 제거 완료).
- 우측 상단: **결재란** (작성자 포함) — 작성 → 결재자 N (최대 5칸, 전자서명/이름/일자).
- 본문: **내용** (content + 템플릿 fieldValues).
- 본문 하단: **첨부** 목록.
- 문서 최하단: 결재서류용 **정중한 품의 인삿말**(closingNote) + "※ 전자서명으로 결재된 문서입니다."

## 2. 신규/변경 파일
1. **신규** `clients/desktop/src/renderer/print/ApprovalDocView.tsx`
   - 라우트 `/groupware/approvals/:id/print` 진입 컴포넌트.
   - `useParams<{ id }>()` → `getGroupwareApproval(id)` + `listApprovalAttachments(id)` + (templateId 있으면) `getApprovalTemplate(templateId)`.
   - **queryKey 충돌 가드** (slice1 QuoteView 교훈): 상세 페이지가 `['groupwareApproval', id]` / `['groupwareApprovalAttachments', id]` 사용 → 인쇄뷰는 **`['groupware-approval-print', id]` / `['groupware-approval-print-attachments', id]`** 별도 키.
   - 로딩/에러 가드: OutboundView 패턴 동일 (`불러오지 못했습니다` 배너 — QA false-green 방지 단언 대상).
   - `<PrintLayout approvalDoc docHeader={...} approvalSteps={...} closingNote={...}>` 본문(children)에 내용+첨부 렌더.
   - `usePageTitle('결재문서', approval.title)`.
2. **변경** `clients/desktop/src/renderer/print/PrintLayout.tsx`
   - `PrintApprovalStep` 에 `signaturePngBase64?: string` 추가 (현재 cell 의 `SignatureViewer signaturePngBase64=""` 하드코딩을 `step.signaturePngBase64 ?? ''` 로). 사원 등록 서명 실연동 인프라 부재 시 빈 문자열 placeholder 유지(현행 동작 보존) — **회귀 0**.
3. **변경** `clients/desktop/src/renderer/routes/index.tsx`
   - `ApprovalDocView` import + `/groupware/approvals/:id/print` 라우트 등록 (기존 print 라우트 패턴 동일, PermissionGuard 는 그룹웨어 결재 열람 권한과 동일 page-code).
4. **변경** `clients/desktop/src/renderer/routes/GroupwareApprovalDetailPage.tsx`
   - 상단 액션에 **"인쇄 미리보기"** 버튼 → `navigate('/groupware/approvals/${id}/print')`. design-system `Button` 사용.

## 3. 데이터 매핑 (실 DTO — `ApprovalLineAdminResponse`)
| 결재문서 슬롯 | 소스 |
|---|---|
| `docHeader.title` | `approval.title` |
| `docHeader.docNo` | `approval.approvalNo` |
| `docHeader.issueDate` | 첫 step `decidedAt` 있으면 사용, 없으면 생략(optional) |
| `approvalSteps[0]` | `{ label: '작성', name: requesterName ?? '-' }` (작성자 포함) |
| `approvalSteps[1..]` | `steps` 순번순 `{ label: 합의/결재(시퀀스), name: approverName, decidedAt: APPROVED 일 때만 }` |
| 본문 내용 | `approval.content` (null → "내용 없음" 대신 빈 블록) + 템플릿 `fieldValues`(label=templateField.label, value) 표 |
| 첨부 | `listApprovalAttachments(id)` → label/fileName/refDocLabel + **refSlipNo 표시는 `stripSlipNoZeros` 적용**(전역 0제거 일관) |
| `closingNote` | 정중한 품의 멘트 예: "위와 같이 품의하오니 검토 후 재가하여 주시기 바랍니다." |

- **UUID 비공개**: requesterId/approverId/templateId/attachment.id 등 UUID 화면 노출 금지. 이름/번호/라벨만.
- **No fake data**: 실 그룹웨어 결재 시드(`getGroupwareApproval`)만. fieldValues 없으면 표 자체 생략(빈 행 합성 금지).

## 4. 회귀 가드
- 전표/거래명세서/세금계산서/견적 등 기존 9종 print 뷰는 `approvalDoc` 미사용 → **무변경**. `PrintApprovalStep` 필드 추가는 optional 이라 기존 호출처(없음) 영향 0.
- slice1 mock spec(`print-preview-standardization.spec.ts`)의 "InboundView/QuoteView approvalDoc 미사용" 단언 유지.

## 5. QA (Docker 실서버 + 데스크톱 실 캡처 — [[real-server-check-screenshot]] [[no-fake-data-ever]])
- 신규 real-qa 스펙 `approval-doc-print-preview-real-qa.spec.ts`:
  - A1: 실 그룹웨어 결재 1건 인쇄뷰 진입 → 제목/결재란(작성+결재자 이름)/내용/(첨부 있으면)첨부/인삿말 렌더 단언 + 캡처.
  - A2: `불러오지 못` false-green 방지 선행 단언 + `.print-approval-doc` 존재 단언.
  - 실 토큰(dev_master) + 게이트웨이 :8080 프록시(기존 real-qa 헬퍼 재사용).
- 게이트웨이 라이브: `GET /admin/groupware/approvals/{id}` 200 + steps 포함 확인.

## 6. 워크플로우
Codex 구현 → Opus 5-agent 리뷰 + Docker 실QA 캡처(라운드 코멘트 인라인) → Codex 5-agent 리뷰 → PM 종합 → 0결함+CI green 시 머지(정책 게이트 없음, [[feedback_pm_auto_continuous]]).
