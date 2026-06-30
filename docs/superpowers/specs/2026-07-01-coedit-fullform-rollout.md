# 협업 full-form coedit — 5문서 롤아웃 + slip 하드닝 (설계)

> 2026-07-01 개발책임자 정정. 원 지시=전표 폼 전체 동시편집(판매전표처럼). slip=이미 full-form ✅(S2a #674), 5문서(주문·견적·회계·결재·배차 #681~#685)만 메모→롤아웃. 결정: 병행(트랙B 롤아웃+트랙A slip 하드닝)/저장충돌=후속. 정찰 a9f160dc(주문)·a24d2ed9(slip).

## 공유 자산 (도메인무관·재사용)
- BE: `CollabCoeditService`(byte-agnostic relay) + 각 문서 `{Doc}CollabController` coedit 3엔드포인트(이미 존재). **BE 변경 0**(롤아웃).
- FE: `createDocCoeditProvider`(Y.Map header + Y.Array<Y.Map> items, basePath 기반) + `CollaborativeSlipInput`(fieldPath header.X / items.N.cell, Input 전용). **무수정 재사용**.

## 트랙 B — 5문서 full-form 롤아웃 (slip SlipDetailPage 패턴 이식)
문서별: 상세/수정 모달을 coedit화 — createDocCoeditProvider 생성 effect(모달 open 시) + seed(헤더+`replaceItems(lines)`) + 헤더/라인 셀 `CollaborativeSlipInput` 교체 + `coeditLinesToEditLines` 역동기화 + 기존 저장 mutation(PUT) 재사용. status 게이트(COLLAB_LOCKED). 순서: **주문 → 견적 → 회계 → 결재 → 배차**.

### 슬1 = 주문(partner-order) full-form (본 PR, FE 전용·BE 0)
파일: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`(기존 editOpen 모달 L1282~).
- createDocCoeditProvider({documentId: orderId, basePath: `/partner-orders/{enc(orderId)}`, headerTextFields: `['memo']`}) — 모달 open 시 생성, close 시 파괴(slip L914~983 동형). 실패 시 provider=null 평문 폴백.
- seed: `{partnerCode, dueDate, memo}` + `replaceItems(toEditLines(order))`(품목 라인).
- 헤더 3필드(partnerCode/dueDate/memo) + 라인 셀(productName/modelCode/quantity/deliveryPrice/remark)을 `CollaborativeSlipInput`(fieldPath header.X / items.N.cell)으로 교체. **categoryKey=Select라 슬1은 평문 유지**(CollaborativeSlipInput Input 전용).
- char-CRDT: `PARTNER_ORDER_HEADER_TEXT_FIELDS = ['memo']`(요청사항 장문). partnerCode/dueDate=LWW.
- 저장: 기존 `updateMutation`→`updatePartnerOrder` PUT(낙관락 updatedAt·409 conflict reload 완비) 재사용. 제출 버튼 coeditPending 동안 disabled.
- status 게이트: full-form 진입을 `canCollabEdit`(=!COLLAB_LOCKED{CANCELED,CONVERTED,CONFIRMING})로(BE 409 정합).
- ⚠️ 기존 '협업 메모'(CollaborativeTextField top-level Y.Text) vs full-form header.memo = 별개 노드(slip 검증된 패턴, 충돌 없음) — 묶지 말 것.
- QA: **2세션 동시편집 실증**(두 창 헤더/라인 셀 동시 편집 반영·저장).

## 트랙 A — slip 하드닝 (공유 provider, 순차 직후)
- 슬A1 라인 CRDT: lineId 안정키(서버 SlipLineDetail.id seed+randomUUID)·Y.Array insert/delete(`Y.Array.move 부재`→fractional order-key)·모달 라인추가+dnd-kit·removeItem(replaceItems 대체). **fieldPath index→lineId 전환은 backward-compat 유지**(주문 등 index 소비 무손상). createCoeditProvider.ts+CollaborativeSlipInput+SlipDetailPage.
- 슬A2 char-CRDT: 라인 텍스트 4종(productName/modelName/specification/note) Y.Text 승격 + `setYTextValue` nuke-reinsert→**applyDelta**(헤더 4종 동시 개선).

## 후속(이번 범위 외)
- 저장 충돌 정합(낙관락↔라이브 동시편집 영속 모델) = 별도 슬라이스(개발책임자 결정).
- 라인 add/remove/정렬 UI 5문서 확산(트랙A 라인 CRDT 머지 후).
- categoryKey 등 Select 협업 컴포넌트.

## 절대규칙
스코프 임의축소/부분완료 종결선언 금지([[feedback_epic_scope_no_narrowing]]). 라운드마다 2세션 동시편집 라이브QA. 5문서 full-form 충족까지 에픽 미완.
