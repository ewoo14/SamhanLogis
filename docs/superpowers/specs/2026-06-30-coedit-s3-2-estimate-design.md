# 코-에디팅 S3-2 — 견적(estimate) 메모 coedit (설계)

> 2026-06-30 야간 자율. #16 협업 에픽 S3 롤아웃 2번. S3-1(주문) 패턴 1:1. 정찰 `a94002d2` 완료.

## Goal
견적 상세화면(데스크톱 `EstimateDetailPage` → `EstimateCollaborationPanel`)에 단일 '협업 메모' 실시간 동시편집 필드 추가. 1차=메모 단일필드(저위험·additive). 폼 전체 셀=후속.

## 정찰 결론 — 최소 델타
견적 = **slip-service 동거**(`com.samhanair.logis.slip.estimate.*`). 견적 collab 인프라(댓글/수정/presence/stream) **이미 존재**. `CollabCoeditService` 빈 **이미 주입 가능**(`EstimateCollabController`가 `RealtimeBroker` 주입 → `@ConditionalOnBean` 충족, 같은 slip-service의 `SlipCollabController`가 이미 동일 주입). 남은 = coedit 3엔드포인트+3DTO+생성자 1줄(BE) + 메모 필드 1개(FE)뿐. estimateId=**순수 UUID**(resolver 불요, %2F 이슈 없음).

## BE — `EstimateCollabController` + dto 3종
파일: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/collab/EstimateCollabController.java`
- 생성자에 `CollabCoeditService coeditService` 주입(import+필드+param). 신규 @Bean/gradle/Flyway 0.
- coedit 3엔드포인트(slip 템플릿 복제, slipId→estimateId):
  - `GET /{estimateId}/collab/coedit` → `@RequirePermission(PAGE_CODE, VIEW)` **+ `permissionGuard.checkView(...)`** → `ApiResponse.ok(new EstimateCoeditUpdatesResponse(coeditService.listUpdates(estimateId)))`
  - `POST /{estimateId}/collab/coedit/update` → `@RequirePermission(PAGE_CODE, UPDATE)` **+ `permissionGuard.checkEdit(..., UPDATE)`** → `coeditService.appendUpdate(estimateId, req==null?null:req.update())`
  - `POST /{estimateId}/collab/coedit/awareness` → `@RequirePermission(PAGE_CODE, VIEW)` **+ `checkView`** → `coeditService.publishAwareness(estimateId, req==null?null:req.awareness())`
  - ⚠️ **견적 고유(R1·D2)**: 견적 collab은 `@RequirePermission` 애너 + **프로그램적 `EstimatePermissionGuard.checkView/checkEdit` 이중가드** + `X-User-Id`/`X-Is-System-Master`(+`X-User-Name`) 헤더 파라미터를 쓴다(기존 견적 댓글/수정 동일) → coedit 3엔드포인트도 **빠짐없이 동일 복제**. page-code 단일 `EstimatePermissionGuard.PAGE_CODE = "estimates.list"`(VIEW/UPDATE 액션 분리).
- DTO 3종(`.../estimate/web/collab/dto/`): `EstimateCoeditUpdateRequest(String update)`·`EstimateCoeditAwarenessRequest(String awareness)`·`EstimateCoeditUpdatesResponse(List<String> updates)`.
- EstimateRevision 직교(coedit=in-memory relay, snapshot/revision 무생성 — 확인됨).

## FE — `EstimateCollaborationPanel`
파일: `clients/desktop/src/renderer/components/collab/EstimateCollaborationPanel.tsx`
- `CollaborativeTextField` import + `collabBasePath = useMemo(() => \`/slips/estimates/${encodeURIComponent(estimateId)}\`, [estimateId])` + 메모 필드 렌더(`fieldName="memo"`, `label="협업 메모"`, `rows={4}`, `readOnly={!canWrite}` — `canWrite=canAccess('estimates.list','update')` 기존 L167) + 안내문구("팀 내 실시간 공유 메모 — 견적 저장과 별개로 보관").
- 게이트웨이: `/api/v1/slips/**` **StripPrefix=2** → `/slips/estimates/{id}/collab/coedit` 도달(정합, 변경 0). `EstimateDetailPage`/`coeditApi`/`createCoeditProvider`/`CollaborativeTextField` 무변경. `estimateCollab.ts` 신규함수 불요(공용 coeditApi 경유).

## mock.ts (S3-1 T04 회귀 방지 필수)
`clients/desktop/src/renderer/api/mock.ts` 에 견적 coedit 3핸들러 추가(slip/order 패턴, `/slips/estimates/{id}/collab/coedit` GET `{updates:[]}` / POST update 누적 / POST awareness null) — 누락 시 Playwright 글롭 fall-through→pageerror.

## 결정 (정찰 D1~D5, 야간 자율 권장방향 채택)
- D1 update 액션 = **UPDATE**(견적 edits 일관). D2 **이중가드 적용**(견적 도메인 일관·마스터 bypass 패리티). D3 **패널 내부** 배치. D4 안내문구 "견적 저장과 별개". D5 마스터 bypass=게이트웨이 JWT claim 주입(FE 무변경).

## Testing
- BE: `EstimateCollabIT` coedit 케이스(GET/POST 실HTTP + VIEW403/null400 + relay 누적/awareness 미저장 + 이중가드).
- FE: `EstimateCollaborationPanel.coedit.test.tsx`(PartnerOrder 동형 — documentId/basePath/fieldName/readOnly 배선).
- 라이브: 견적 standalone/게이트웨이 실 HTTP coedit relay round-trip(POST update→GET 누적+SSE). mock OFF 단계별 스샷.
