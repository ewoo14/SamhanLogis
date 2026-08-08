# 이슈 #1110 S1 — 거래처 주문 상세 권위 갱신 사건 표

## 0. 좌표와 선행 전제 정정

- 조사 브랜치/HEAD: `fix/1110-collab-revision-authority` / `767c6fa14`
- 조사 화면: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`
- 방식: 현재 HEAD 정적 데이터 흐름 역추적 + 실패 시도 커밋 `9bbda8c0a`(R7), `ba05d4013`(R9), `fa8637fc4`(R11 분리) 이력 대조. 코드 실행·라이브QA·Docker·서비스·다른 워크트리는 건드리지 않았다.
- **전제 정정:** 현재 HEAD에는 “협업 저장 1회 → `/revisions` 최대 3 GET” 로직이 없다. 현재 제품 코드에서 `['partner-order-revisions', orderId]`를 무효화하는 곳은 **로컬 revision 복원 성공 한 곳뿐**이다(`PartnerOrderVersionHistoryPanel.tsx:171-180`). 중복은 R7 커밋 `9bbda8c0a`가 추가했다가 R11 `fa8637fc4`가 백엔드-only 분리 때 제거한 실패 시도의 표면이다. 따라서 현재 결함은 “중복과 누락” 중 **누락이 기본**, 실패 시도는 누락을 넓게 막다가 중복을 만든 계보다.

## 1. 저장소와 경계

### 1.1 미저장 초안은 어디에 사는가

1. 정식 편집의 공유 초안은 renderer 메모리의 `Y.Doc` 안 `header`/`items`에 산다. provider가 새 `Y.Doc`을 만들고 두 shared type을 꺼낸다(`clients/desktop/src/renderer/realtime/createCoeditProvider.ts:511-517`). 입력은 `setHeaderValue`/`setItemValue*`/`replaceItems`가 이 문서를 바꾼다(`createCoeditProvider.ts:690-753`).
2. 같은 값의 React mirror도 `partnerCode`, `dueDate`, `memo`, `lines` local state에 있다(`SalesPartnerOrderDetailPage.tsx:218-223`). provider 구독이 Y.Doc을 읽어 이 state를 덮는다(`SalesPartnerOrderDetailPage.tsx:444-448,480-482`). 즉 편집 중 실질 원천은 Y.Doc, React state는 화면/submit용 mirror다.
3. “협업 수정완료” overlay 초안은 별도의 React local state `memoDraft`/`dueDateDraft`/`lineRemarkDrafts`에 있다(`clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx:118-123,153-165`). 이것은 정식 편집 Y.Doc과 같은 저장소가 아니다.
4. IndexedDB는 사용하지 않는다. `indexeddb|IndexeddbPersistence|y-indexeddb`를 `clients/desktop/src/renderer`와 `clients/desktop/package.json`에서 검색해 0건이었다. 이 화면의 local/sessionStorage 사용도 0건이다.
5. 서버도 Y.Doc 자체를 DB에 저장하지 않는다. `/coedit/update`는 opaque update를 `CollabCoeditService`에 넘긴다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/collab/PartnerOrderCollabController.java:198-220`). 서비스는 노드 로컬 `ConcurrentHashMap<UUID,List<String>>`에만 누적하며 재시작 시 소실된다(`shared/collab-core/src/main/java/com/samhanair/logis/collab/coedit/CollabCoeditService.java:14-21,33-59`).

### 1.2 공유 Y.Doc과 비공유 snapshot의 정확한 경계

- **공유 경계:** `doc.on('update')`에서 `REMOTE_ORIGIN`이 아닌 모든 변경을 POST queue에 넣는다(`createCoeditProvider.ts:578-583`). POST된 update는 서버 in-memory 목록에 누적되고 같은 문서 SSE에 `coedit:update`로 발행된다(`CollabCoeditService.java:40-59`); 다른 renderer는 이를 `REMOTE_ORIGIN`으로 Y.Doc에 적용한다(`createCoeditProvider.ts:599-618`). 5초 재조회도 같은 누적 update를 다시 병합한다(`createCoeditProvider.ts:604-608,639-641`).
- **현재 HEAD에는 비공유 server snapshot API가 없다.** 서버 상세를 provider에 넣는 유일한 helper `seedPartnerOrderCoeditProvider`는 일반 `setHeaderValue` + `replaceItems` 호출이다(`SalesPartnerOrderDetailPage.tsx:123-136`). 따라서 호출되면 공유 update다.
- **R10의 비공유 snapshot은 현재 HEAD가 아니라 미커밋 실패 시도였다.** S11이 인용한 `SERVER_AUTHORITY_ORIGIN`/`applyServerSnapshot`은 R11에서 제거되어 현재 grep 0건이다. 그 시도는 공유 Y.Doc 구조를 로컬 전용 transaction으로 delete/add해 피어에 없는 구조를 만들었다(S11 지시서의 검증 좌표: `createCoeditProvider.ts:580-584,606-643,756-782` at R10 staged state). 현재 파일:줄로는 존재하지 않으므로 역사 좌표이며, 현재 코드 근거로 가장할 수 없다.

## 2. 서버 권위 갱신 사건 × 초안 × query × 전파 표

표의 횟수는 **현재 HEAD에서 사건 1회당 명시적으로 호출되는 무효화 횟수**다. React Query가 동시 invalidation을 네트워크 1회로 합칠지는 timing/active 상태에 따라 달라 정적 코드만으로 확정하지 않고 `호출 N회`로 썼다. `/revisions` GET은 해당 query가 활성일 때의 유효 refetch 관점이다.

| 서버 권위 사건 | ① 로컬 초안(Y.Doc / 미저장 편집) | ② 무효화 query (호출 수·조건) | ③ 다른 세션 전파 | ④ 사건/소비 코드 위치 |
|---|---|---|---|---|
| **주문 생성** (draft confirm / estimate 변환; 화면 진입 전) | 기존 detail/Y.Doc 없음. 같은 ID 초안과의 병합 계약은 해당 없음. | 이 detail 화면에서는 0회. 목록 화면만 board SSE로 `['partner-orders']` 1회 호출(`SalesPartnerOrderListPage.tsx:156`, `useCollectionRealtime.ts:20-25`). revision CREATE는 서버에 생기지만 열린 revision panel은 아직 없음. | `CREATED` board 사건만 전파. detail 채널 사건 아님. | `PartnerOrderConfirmService.java:249-251,268-270`; `PartnerOrderFromEstimateService.java:85-87,114-116` |
| **직접 저장 — 로컬 세션** | submit 값은 Y.Doc→React mirror다(`SalesPartnerOrderDetailPage.tsx:444-448`). 성공 시 모달을 닫아 provider를 destroy하지만 서버 relay에 누적된 Y.Doc update는 지우지 않는다(`:239-247,492-498`). 저장값과 초안은 보통 같지만 “서버 commit 세대” 표시는 없다. | `['partner-order', id]` 1회(`:239-247`); **revisions 0회**. 서버는 실제 변경일 때 EDIT revision 1건 생성(`PartnerOrderUpdateService.java:91-115`). | audit의 `partner-order:edit` + board `UPDATED`. 다른 detail 세션은 collab stream에서 event를 받아 detail/list/comment를 각 1회 invalidate하지만 revisions는 0회(`PartnerOrderCollaborationPanel.tsx:167-176`). | FE `SalesPartnerOrderDetailPage.tsx:239-247`; BE `PartnerOrderUpdateService.java:84-117,178-181`; event `PartnerOrderAuditLogService.java:138-150` |
| **협업 수정완료 — 로컬 세션** | overlay React draft를 서버 patch로 보낸 뒤 editMode만 닫는다. 정식 편집 Y.Doc은 갱신/폐기/충돌표시하지 않아 서버 memo/dueDate/remark와 갈릴 수 있다(`PartnerOrderCollaborationPanel.tsx:202-246`). | panel에서 detail 1 + list 1, 부모 `onCommitted`에서 detail 1 + list 1: 같은 key별 **호출 2회**(`PartnerOrderCollaborationPanel.tsx:240-246`; `SalesPartnerOrderDetailPage.tsx:1380-1389,1395-1404`). **revisions 0회**. | 한 서버 commit이 audit `partner-order:edit`와 `suggestion.accepted` 두 사건을 낸다(`PartnerOrderAuditLogService.java:146-150`; `PartnerOrderCollabEditService.java:68-89`). 원격 detail은 둘 모두를 넓은 `isCollabEvent`로 받아 detail/list/comment invalidate를 key별 2회 호출하지만 revisions는 0회(`PartnerOrderCollaborationPanel.tsx:100-106,167-176`). | FE `PartnerOrderCollaborationPanel.tsx:202-246`; BE `PartnerOrderUpdateService.java:135-164`; `PartnerOrderCollabEditService.java:58-90` |
| **원격 직접 저장** | 열린 정식 편집에서는 detail query가 바뀌어도 form sync가 `editOpen` 때문에 중단되고 Y.Doc은 보존된다(`SalesPartnerOrderDetailPage.tsx:425-428`). 닫힌 상태에서는 상세 표시만 갱신된다. 이후 편집 진입 시 Y.Doc line 수가 같으면 seed하지 않아 서버 header/동일-line 변경보다 stale Y.Doc이 다시 화면 원천이 된다(`:470-480`). | collab event 소비가 comment/detail/list 각 1회; **revisions 0회**(`PartnerOrderCollaborationPanel.tsx:167-176`). | `partner-order:edit` 1개 + board `UPDATED`; detail은 collab 사건만 소비하고 board 채널은 구독하지 않는다. | producer `PartnerOrderAuditLogService.java:138-150`; consumer `PartnerOrderCollaborationPanel.tsx:167-176`; seed guard `SalesPartnerOrderDetailPage.tsx:470-480` |
| **원격 협업 저장** | 위와 동일하나 정식 Y.Doc과 overlay React draft 두 종류 모두 충돌표시 없이 존치할 수 있다. overlay editMode 중에는 event로 currentValues가 바뀌면 effect가 drafts를 다시 초기화할 수도 있다(`PartnerOrderCollaborationPanel.tsx:153-165`). | 두 SSE 각각 comment/detail/list를 invalidate하므로 key별 최대 호출 2회; **revisions 0회**. | `partner-order:edit` + `suggestion.accepted` 두 사건. 사건 ID/commit ID로 묶는 소비 계약 없음. | producers `PartnerOrderAuditLogService.java:146-150`, `PartnerOrderCollabEditService.java:83-89`; consumer `PartnerOrderCollaborationPanel.tsx:100-106,167-176` |
| **revision 복원 — 로컬 세션** | 서버는 header+line을 전량 복원하지만 현재 HEAD는 Y.Doc을 전혀 만지지 않는다. editOpen이면 detail→form sync도 중단된다. 닫힌 뒤 재진입해도 line 수가 같으면 stale 공유 Y.Doc이 승리한다(`SalesPartnerOrderDetailPage.tsx:425-428,470-480`). 즉 현재는 R9식 삭제가 아니라 **초안 보존 + 권위 미수렴**이다. | detail 1 + list 1 + **revisions 1**(`PartnerOrderVersionHistoryPanel.tsx:171-180`). 세 호출은 await하지 않는다. | 서버는 board collection `RESTORED`만 발행(`PartnerOrderRevisionService.java:284-294`). detail 화면은 board를 구독하지 않아 다른 detail 세션으로는 전파되지 않는다. | FE `PartnerOrderVersionHistoryPanel.tsx:165-180`; API `partnerOrderRevision.ts:115-122`; BE `PartnerOrderRevisionService.java:194-294` |
| **revision 복원 — 원격 세션에서 발생** | 현 세션의 Y.Doc/overlay draft/상세 cache 모두 그대로다. 충돌·복원 epoch·재수렴 신호 없음. | 이 detail 화면 **전부 0회**. | `RESTORED` board event는 목록만 소비한다(`PartnerOrderBoardChangePublisher.java:17-26`; `SalesPartnerOrderListPage.tsx:156`). per-order collab stream에는 restore 사건 생산자가 없다. | producer `PartnerOrderRevisionService.java:287-292`; detail subscriptions `PartnerOrderCollaborationPanel.tsx:167-176`, `PartnerOrderCollabRealtimeClient.ts:8-12` |
| **soft delete — 로컬 세션** | provider/Y.Doc을 별도로 clear하지 않고 페이지 이동으로 component/provider만 destroy한다(`SalesPartnerOrderDetailPage.tsx:257-264,492-498`). 서버 `CollabCoeditService` entry도 삭제 시 자동 회수되지 않는다(`CollabCoeditService.java:19-21`). | list 1; **detail 0, revisions 0** 후 목록 이동(`SalesPartnerOrderDetailPage.tsx:257-264`). 서버에는 DELETE revision이 생긴다(`PartnerOrderDeleteService.java:74-83`). | delete audit가 `partner-order:edit`, 별도로 board `DELETED`를 낸다. 다른 detail은 detail/list/comment만 invalidate하고 revisions는 0회; GET 404 뒤 Y.Doc conflict 처리 계약은 없다. | FE `SalesPartnerOrderDetailPage.tsx:257-264`; BE `PartnerOrderDeleteService.java:62-83`; audit `PartnerOrderAuditLogService.java:138-150` |
| **soft delete — 원격 / 목록 인라인 복원** | 원격 delete 시 열린 form/Y.Doc을 강제 종료하지 않는다. 인라인 restore도 Y.Doc entry를 reset하지 않는다. | 원격 delete/inline restore의 audit `partner-order:edit`를 받으면 detail/list/comment 각 1회; **revisions 0회**. inline restore 자체는 새 revision을 만들지 않는다(`PartnerOrderDeleteService.java:99-125`). | audit event + board `DELETED`/`RESTORED`; detail은 audit event만 소비. | `PartnerOrderDeleteService.java:74-83,99-130`; `PartnerOrderCollaborationPanel.tsx:167-176` |
| **상태 전이 — 보류/해제, 로컬** | Y.Doc/overlay draft는 그대로다. response를 detail cache에 직접 set해 상태만 바꾼다(`SalesPartnerOrderDetailPage.tsx:278-284,391-397`). 상태가 편집 잠금 집합에 들지 않는 DRAFT↔ON_HOLD라 provider도 유지 가능하다(`:94-96,420-423`). | detail은 `setQueryData` 1회, list invalidate 1회; **revisions 0회**. 서버도 STATUS revision을 만들지 않는다. 서비스 주석도 actor를 “미래 revision 훅 대비”라고 명시한다(`PartnerOrderHoldService.java:39-41,62-64`). | board `UPDATED`만 발행. 원격 detail은 board 미구독이라 상태 갱신 0회. | FE `SalesPartnerOrderDetailPage.tsx:274-298,387-411`; BE `PartnerOrderHoldService.java:35-83` |
| **부분/전량 판매전표 전환, 로컬** | 서버가 convertedQuantity/status를 바꾸지만 Y.Doc line은 그대로다. 상세 재조회 후에도 열린 edit sync는 막히고 provider seed 조건은 line 수뿐이라 같은 line 수의 전환 권위는 Y.Doc에 표현되지 않는다(`SalesPartnerOrderDetailPage.tsx:305-315,425-428,470-480`). | list 1 + detail 1; **revisions 0회**(`:305-315`). 서버도 revision capture 없음(`PartnerOrderConvertService.java:218-237`). | board `UPDATED`만 발행. 원격 detail 미구독. | FE `SalesPartnerOrderDetailPage.tsx:300-324`; API `sales.ts:530-546`; BE `PartnerOrderConvertService.java:207-237` |
| **다중 주문 병합 전환 — 다른 화면/원격** | 이 detail의 Y.Doc을 건드리지 않는다. 열린 화면은 stale convertedQuantity/status를 유지한다. | 이 detail에서 0회; **revisions 0회**. | board `UPDATED`만 발행; detail 미구독. | API `sales.ts:826-846`; BE `PartnerOrderMergeConvertService.java:241-265,305-307` |
| **외부/비동기 전표 발행 결과** (legacy outbox success / 영구실패) | Y.Doc/React draft에 아무 처리도 없다. | detail/list/revisions 모두 **0회**. | order를 저장하고 history만 기록하며 realtime publisher 호출이 없다. 따라서 다른 세션 전파도 0회. | success `SlipPublishOutboxResultWriter.java:124-145`; failure `:258-284`; domain fields `PartnerOrder.java:438-466` |

### 사건 전수 결론

- 사용자 제시 목록 밖에서 추가된 사건은 **주문 생성**, **목록 인라인 soft-delete 복원**, **부분/전량 전환**, **다중주문 병합 전환**, **비동기 outbox 결과**다.
- `coedit:update`, 댓글, presence, 단순 제안은 서버의 주문 entity/revision 권위를 갱신하지 않으므로 표의 권위 사건에서 제외했다. coedit update는 공유 초안 relay이고 서버는 내용을 해석하지 않는다(`PartnerOrderCollabController.java:198-220`; `CollabCoeditService.java:14-21`).
- 보류/해제와 전환은 서버 주문 권위를 바꾸지만 현재 revision을 만들지 않는다. 즉 `PartnerOrderRevisionType.STATUS`가 존재한다는 사실만으로 상태 사건이 revision 생산자라고 볼 수 없다. 생산자 전수 grep은 아래 다섯 호출군뿐이다.

## 3. `/revisions` 무효화 호출 지점 전수

### grep 축

다음 축을 제품 코드(`*.ts`, `*.tsx`, test/dist/out 제외)에서 각각 검색했다.

```text
1) literal key/endpoint: partner-order-revisions | /revisions
2) query operation: invalidateQueries | refetchQueries | resetQueries | removeQueries | cancelQueries
3) query definition/API: listPartnerOrderRevisions | restorePartnerOrderRevision
4) 간접 prefix 가능성: ['partner-order'] | ['partner-orders']
```

실행 형태:

```powershell
rg -n "partner-order-revisions|/revisions|listPartnerOrderRevisions|restorePartnerOrderRevision" clients/desktop/src/renderer --glob '*.ts' --glob '*.tsx' --glob '!*.test.ts' --glob '!*.test.tsx'
rg -n "invalidateQueries|refetchQueries|resetQueries|removeQueries|cancelQueries" clients/desktop/src/renderer --glob '*.ts' --glob '*.tsx' --glob '!*.test.ts' --glob '!*.test.tsx'
```

### 결과

| 종류 | 현재 HEAD 호출 지점 | 조건/횟수 |
|---|---|---|
| query 정의 | `PartnerOrderVersionHistoryPanel.tsx:165-169` | panel mount + orderId 있을 때 활성 |
| `/revisions` GET API | `clients/desktop/src/renderer/api/partnerOrderRevision.ts:76-87` | queryFn 실행 시 |
| `/revisions/{no}/restore` POST | `partnerOrderRevision.ts:106-122` | 사용자가 복원 확정 시 |
| revision query invalidate | `PartnerOrderVersionHistoryPanel.tsx:171-180` | **로컬 restore 성공 때 1회뿐** |
| refetch/reset/remove/cancel | **0건** | 해당 key에 대한 다른 query operation 없음 |

`['partner-order', ...]`와 `['partner-orders', ...]`는 `['partner-order-revisions', ...]`의 segment prefix가 아니다. 문자열 접두사가 비슷해도 React Query key segment가 다르므로 간접 무효화하지 않는다. 따라서 위 한 곳이 전수다.

### 실패 시도 계보(현재 호출 지점으로 세면 안 됨)

- R7 `9bbda8c0a`는 direct save, delete, collab local success, 넓은 collab event consumer에 revision invalidation을 추가했다. 이때 `isCollabEvent`가 `comment.*`, 모든 `suggestion.*`, 두 edit spelling, fallback `message`까지 받았다(현재도 분류 자체는 `PartnerOrderCollaborationPanel.tsx:100-106`).
- 한 협업 commit은 audit `partner-order:edit`와 `suggestion.accepted`를 둘 다 내므로 local success까지 합쳐 최대 3회가 됐다(`PartnerOrderAuditLogService.java:146-150`; `PartnerOrderCollabEditService.java:83-89`).
- R11 `fa8637fc4`가 이 프런트 변경을 제거했다. 현재는 중복이 닫힌 것이 아니라 revision invalidation이 restore 외 전부 다시 0회인 상태다.

## 4. 원격 revision 복원 이벤트와 누락 이유

원격 복원은 다음 단일 생산 경로를 탄다.

```text
POST /revisions/{no}/restore
  → header/line 전량 복원 + RESTORE revision capture
  → PartnerOrderBoardChangePublisher.publishListChanged("RESTORED")
  → /board-realtime collection SSE
  → 목록 화면의 ['partner-orders']만 invalidate
```

근거: `PartnerOrderRevisionService.java:228-294`, `PartnerOrderBoardChangePublisher.java:17-26`, `PartnerOrderBoardRealtimeClient.ts:1-12`, `SalesPartnerOrderListPage.tsx:156`, `useCollectionRealtime.ts:20-25`.

상세 화면은 `/board-realtime`을 구독하지 않고 `/collab/stream`만 구독한다(`PartnerOrderCollabRealtimeClient.ts:8-12`; `PartnerOrderCollaborationPanel.tsx:167-176`). 복원 서비스는 그 per-order broker에 어떤 restore/revision 사건도 발행하지 않는다. 그래서 원격 상세·revision query·Y.Doc 모두 갱신 0회다. 이는 event 이름 필터의 문제가 아니라 **생산 채널과 소비 채널이 다르며 연결 자체가 없는 누락**이다.

## 5. R9가 다른 세션 초안을 지운 정확한 경로

이 경로는 현재 HEAD가 아니라 역사 커밋 `ba05d4013`의 코드다. 같은 함정을 피하려고 commit 좌표를 보존한다.

```text
A가 revision restore 성공
  → PartnerOrderVersionHistoryPanel onSuccess가 onRestored 호출
    (ba05d4013:.../PartnerOrderVersionHistoryPanel.tsx:174-197)
  → SalesPartnerOrderDetailPage.handleOrderRestored가 detail refetch
    (ba05d4013:.../SalesPartnerOrderDetailPage.tsx:509-523)
  → provider가 열려 있으면 즉시, 닫혀 있으면 forceServerReseedRef로 다음 edit 진입 때
    seedPartnerOrderCoeditProvider 실행
    (동일 파일:464-466,509-522)
  → header 전체 set + items 전량 replace(delete + 새 Y.Map insert)
    (동일 파일:123-128;
     현재 동형 구현 createCoeditProvider.ts:691-697,733-753)
  → 별도 system/remote origin이 없으므로 doc.on('update')가 일반 local update로 queue
    (createCoeditProvider.ts:578-583)
  → /coedit/update POST → 서버 in-memory 누적 + coedit:update SSE
    (createCoeditProvider.ts:541-557;
     PartnerOrderCollabController.java:207-221;
     CollabCoeditService.java:40-59)
  → B Y.Doc에 REMOTE_ORIGIN으로 적용
    (createCoeditProvider.ts:610-618)
  → B provider 구독이 React form을 새 Y.Doc 값으로 mirror
    (SalesPartnerOrderDetailPage.tsx:444-448,480-482)
  → B의 미저장 memo/line이 복원값으로 조용히 대체
```

핵심 함정은 “서버 상세을 읽었다”가 아니라 **서버 snapshot을 공유 Y.Doc에 일반 local transaction으로 전량 기록했다**는 것이다. R10처럼 송신만 막고 같은 공유 Y.Doc 구조를 로컬 전용으로 delete/add하면 반대편 피어에 없는 CRDT 구조가 생겨 이후 정상 update가 영구 분기한다. 즉 공유 문서에 snapshot을 넣는 순간, `전파하면 삭제 / 안 전파하면 fork`의 양자택일이 생긴다.

## 6. 표에서 뽑힌 규칙 한 문장

> **서버 권위 커밋 하나는 고유 사건 하나로 모든 활성 세션에 전달하고, 그 사건만이 공유 Y.Doc을 직접 덮어쓰지 않은 채 각 세션의 상세·revision을 논리적으로 한 번 재검증하게 한다.**

이 문장은 D1과 D3를 동시에 설명한다.

- D1: server snapshot을 공유 Y.Doc에 쓰는 것을 금지한다. 전파하면 타 세션 초안을 삭제하고, 비공유로 쓰면 문서 구조를 fork하므로 권위 재검증과 초안 충돌/overlay 경계를 분리해야 한다.
- D3: “커밋 하나 ↔ 고유 사건 하나 ↔ 논리적 refresh 한 번”이 없어서 협업 commit은 두 SSE(+local success)로 중복되고 restore/status/전환/outbox는 상세 소비 사건이 없어 누락된다.
- “논리적으로 한 번”은 네트워크가 exactly-once라는 뜻이 아니다. 동일 commit/event identity를 중복 수신해도 소비 결과가 한 번이어야 한다는 뜻이다.

## 7. 못 채운 칸과 이유

1. **query invalidation 호출 수와 실제 GET 수의 완전한 1:1 대응:** 호출 수는 파일:줄로 확정했지만 React Query의 active/inactive 상태, 같은 tick promise 공유, SSE/HTTP 순서에 따른 실제 wire GET 수는 라이브 계측 없이는 확정할 수 없다. 이번 라운드는 라이브QA 금지이므로 표에는 호출 수를 쓰고 실제 GET은 `?`로 남긴다.
2. **R10 비공유 snapshot의 현재 파일:줄:** R10은 S11 당시 staged 미커밋 변경이고 R11에서 제거됐다. 현재 commit/ref 어디에도 해당 구현이 없어 재현 가능한 `commit:path:line`을 부여할 수 없다. S11 지시서가 보존한 당시 좌표만 역사 근거로 인용했다.
3. **외부 동기화의 모든 vendor/import 가능성:** 이 화면의 현재 자동 외부 갱신으로 확인된 것은 legacy outbox success/failure다. MIG8 admin import가 실행 중 열린 동일 주문을 update하는지, 운영에서 다른 DB writer가 있는지는 정적 호출 그래프만으로 완전 부정할 수 없어 `?`다. 다만 repository write 검색에서 이 화면 entity의 명시적 비동기 writer는 `SlipPublishOutboxResultWriter` 두 경로로 확인했다.
4. **원격 delete 뒤 열린 edit modal의 최종 UI:** query refetch가 404가 되어도 기존 data 보존 여부와 modal unmount 여부는 React Query runtime 상태에 좌우된다. 코드상 Y.Doc을 명시적으로 종료/clear하지 않는 것까지만 확정했다.

## 8. 새 파일 목록

```text
?? docs/dev-reports/2026-08-07-1110-s1-authority-event-matrix.md
```

제품 코드·테스트·설정 변경은 없다.
