# E2 롤아웃 — 거래처(partner) 목록 라이브 동기화 + 취소선 삭제/복원

> E2 전역 라이브 동기화 에픽. 배차(dispatch) 파일럿(PR #699 라이브 컬렉션 동기화, PR #700 취소선 삭제+복원)을 **거래처 목록**에 이식.
> 개발책임자 E2 확정: 전 메뉴 데이터 실시간 반영 + 삭제=하드삭제 금지·취소선+삭제자 추적·복원.

## 목표
거래처 목록(`admin/PartnersPage.tsx`, 현재 30초 폴링)을 **실시간 SSE 반영**으로 전환하고, 삭제 거래처를 **취소선 + "삭제: {이름}" 배지 + 복원 버튼**으로 노출.

## 구현 표면 (정찰 기반)
### BE (partner-service) — 기둥1 라이브 발화
- 신규 `realtime/PartnerListRealtime.java` — `CHANNEL_ID = UUID.nameUUIDFromBytes("partner:list:changed")` + `EVENT_CHANGED` (배차 `DispatchBoardRealtime` 미러).
- 신규 `realtime/PartnerListRealtimeController.java` — `GET /admin/partners/list-realtime` SSE, `@RequirePermission(page="partners.search", VIEW)`, 기존 broker 재사용.
- `PartnerService` 에 `CollectionRealtimePublisher` 주입 + `publishListChanged(changeType)` 헬퍼 → mutating 6종(`register`/`updateProfile`×2/`delete`/`suspend`/`activate`/`terminate`) 각 커밋 뒤 발화(CREATED/UPDATED/DELETED). 신용변경·4탭·수정요청 승인도 board-visible이면 UPDATED sweep.

### BE — 기둥2 취소선 삭제/복원
- **V13** `partner_deleted_by_name.sql` — `partners ADD COLUMN deleted_by_name VARCHAR(100)` (nullable additive, 배차 V55 미러).
- `PartnerRepository.searchAdminIncludingDeleted(...)` native 쿼리(@SQLRestriction 우회, 삭제행 포함).
- `PartnerSummaryResponse`(+list response)에 `isDeleted`/`deletedAt`/`deletedByName` 추가 + `resolveActorName`(UUID 비노출·100자 truncate).
- 복원: `PartnerService.restore(partnerCode)` → native `findByCodeIncludingDeleted` 로드 + `markRestored()` + RESTORED 발화 + 엔드포인트 `POST /admin/partners/{code}/restore` (`@RequirePermission(partners.delete, RESTORE)`).
- auth-service 권한 시드: partners RESTORE additive(배차 V78 미러, ON CONFLICT 멱등).
- `delete()` 시 `deleted_by`=userId(감사) + `deleted_by_name`=표시명(X-User-Name) 분리 저장.

### FE (clients/desktop)
- 신규 `realtime/PartnerListRealtimeClient.ts` (createRealtimeClient, `/admin/partners/list-realtime`).
- `admin/PartnersPage.tsx`: `useCollectionRealtime(PartnerListRealtimeClient, 'list', [['admin','partners']])` — **coarse 무효화 키**(필터/페이지 tuple 미포함, 안정 참조. 필터+페이지 tuple 을 넘기면 다른 캐시 페이지가 stale 처리조차 안 됨). 30초 폴링 제거·인디케이터 문구 교체. 삭제행 취소선(neutral-600 WCAG AA)+배지+권한게이트 복원버튼.

> ⚠️ **후순위 defer (개발책임자 결정 — pre-existing)**: search 엔드포인트의 상태 필터 파라미터명은 `type`(PartnerStatus 타입)인데 FE `listAdminPartners` 는 `status`+`type` 를 함께 전송 → FE status 필터가 BE 에 미도달, FE type(거래처유형) 필터는 BE 미지원. E2 범위 밖 계약 불일치이므로 이 슬라이스에서 수정하지 않고 별도 정리(필터 계약 설계 결정 필요).
- `api/adminApi.ts`: `PartnerSummary` 삭제메타 3필드 + `restorePartner()`.
- 신규 `admin/partnerDeletedRow.ts` 유틸(배차 `dispatchDeletedRow.ts` 미러).

### 모바일 · 재사용
- mobile-staff 거래처 마스터 목록 화면 부재 → 불요.
- 재사용: `CollectionRealtimePublisher`(빈 자동)·`useCollectionRealtime`·`BaseEntity` soft-delete·partner `@SQLRestriction`·`delete()` soft-delete.

## ⚠️ 후순위 defer (개발책임자 결정 — 자율 안 함)
- "활성 거래/미수금 있는 거래처 삭제 차단" 참조가드 신설 여부. → **현행(무가드 soft-delete) 보존**하고 구현. 이 정책엣지는 아침 보고. (E2는 삭제정책 변경이 아니라 표시/복원 도입이므로 게이트 아님.)

## 수용 기준
- 2세션 목록 열기 → 한쪽 생성/수정/삭제 → 반대편 무새로고침 SSE 반영(실캡처).
- 삭제행 취소선+배지+복원버튼(권한게이트), 복원 시 목록 원복.
- 권한 deny(비권한 사용자 RESTORE 403), UUID 비노출.
- BE 모듈 전체 test 0 fail·FE typecheck/vitest 0·CI green.
