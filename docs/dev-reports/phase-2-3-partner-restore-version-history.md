# dev-report — 거래처(Partner) RESTORE 버전이력 + point-in-time 복원 (Phase 2.3)

> RESTORE 도메인 확장 4번째 적용(slip 2.1 / inventory 보류 D-RST-04 / estimate 2.2 / **partner 본 슬라이스**). slip·estimate 패턴(D-RST-01~03/05) 이식 + 거래처 4탭 이종 자식 구조에 맞춘 service-layer 조립. DECISIONS **D-RST-06**.
> estimate dev-report `docs/dev-reports/phase-2-2-estimate-restore-version-history.md` 미러.

## 1. 목적
거래처(기본정보 헤더 + 단가/할인·배송지·담당자 3종 자식의 4탭 마스터)의 각 시점 상태를 full-snapshot 으로 보관하고, 편집 가능 상태(ACTIVE/SUSPENDED)에서 특정 시점으로 통째 복원. slip·estimate 와 동형이되, 자식이 **단일 `@OneToMany` 컬렉션이 아닌 4탭 이종 자식**이라 스냅샷 조립/복원을 service 계층이 직접 담당하는 점이 핵심 차이.

## 2. 데이터 모델
- 신규 `partner_revisions` (partner-service, **Flyway V12** — partner-service 첫 JSONB): JSONB `snapshot`(헤더 40+ 필드 + 단가/할인 1:1 + 배송지 1:N + 담당자 1:N) + `revision_no` + `revision_type`(CREATE/EDIT/RESTORE) + `source_revision_no` + `partner_code` + `actor_*` + BaseEntity 7. partial unique `(partner_id, revision_no) WHERE is_deleted=FALSE`. `@JdbcTypeCode(SqlTypes.JSON)`(SlipRevision/EstimateRevision 선례).
- `PartnerSnapshot`(record): 헤더 40+필드 + `PriceDiscount`(1:1, null 허용) + `List<ShippingAddress>` + `List<Contact>`. 자식 식별자 = 배송지 `alias` / 담당자 `contactName`(스냅샷에 자식 UUID 미보관 — UUID 비공개 + 복원 시 신규 재발급).

## 3. 캡처 흐름
`PartnerRevisionService.captureFor(partnerId, type, sourceRev, actor*)` — 같은 TX 내에서 `assembleFrom(partner)`가 거래처 헤더 + 4탭 자식 repository(`@SQLRestriction is_deleted=false`)를 join 해 갱신본을 조립한 뒤 1건 캡처. estimate 가 `Estimate#toSnapshot()` 도메인에 위임하는 것과 달리, 4탭 이종 자식이라 **조립이 service 책임**.

content-mutation 훅 전수(누락 0, D-RST-03 캡처 완전성 교훈 계승):
- `PartnerService.create`(CREATE) / `update`(EDIT)
- `Partner4TabService.registerFull`(CREATE) / `updateFull`(EDIT) / `upsertPriceDiscountTab` / `addShippingAddress` / `deleteShippingAddress` / `addContact` / `deleteContact`(모두 EDIT)

채번 = `maxRevisionNo+1` `saveAndFlush` + `DataIntegrityViolation` 1회 재시도 → CONFLICT(409)(estimate 동형). actor = X-User-Id/Name/Color(UUID 비공개 — UUID 파싱 실패 시 system UUID(0,0) 폴백). changeSummary = 인접 스냅샷 diff: 헤더 40+필드 변경수(BigDecimal 은 compareTo scale 무시) + 자식 +/-/~(배송지 alias·담당자 contactName 식별자 매칭).

## 4. 복원 흐름
`POST /api/v1/partners/{partnerCode}/revisions/{revisionNo}/restore`:
- 대상 revision 스냅샷 로드(없으면 404) → 거래처 로드(없으면 404) → **`Partner#requireEditable()` 가드**(TERMINATED 면 CONFLICT 409 — slip 마감 lock / estimate requireEditable 사상 계승, **거래종료 거래처 부활 방지**).
- `applyHeaderSnapshot` — 도메인 update 메서드로 헤더 통째 역적용. **복원 제외**: `creditLimit`/`outstandingBalance`(신용 도메인 `PartnerCreditHistory` 누적과 일관 보존 — 잔액은 거래 누적이라 시점 복원 부적합), `partnerCode`/`bizNo`(불변 식별자). null currency/shipmentTarget 은 호출 스킵(KRW 강제채움 정합 보존).
- `applyChildrenSnapshot` — 4탭 자식을 Request DTO 로 변환해 `Partner4TabService#replaceChildrenFromFull`(4탭 수정과 공유, `@Lazy` 순환의존 차단)로 **전량교체**. 배송지/담당자는 스냅샷이 비어도 non-null 빈 리스트로 전달해 현 자식 전량 비움(point-in-time 정합). 단가/할인은 스냅샷 없으면 null(미변경 — 1:1 정책 "미설정" 보존).
- 복원을 신규 RESTORE revision(`source_revision_no = targetRevisionNo`)으로 캡처(정방향 누적 → 복원 이력도 되돌릴 수 있음). **SSE `partner:edit` 발행**(estimate 와 달리 partner realtime broker 존재 → 복원도 구독 협업자 화면 실시간 갱신, `PartnerAuditLogService` 와 동일 채널 재사용).

## 5. API + FE
- `GET /api/v1/partners/{partnerCode}/revisions`(VIEW, changeSummary 포함) + `POST .../{n}/restore`(RESTORE). controller 가 partnerCode → partnerId(UUID) 해석(service 는 UUID 만 다룸). `PartnerRevisionResponse`(actorId 미노출).
- FE: `PartnerVersionHistoryPanel`(react-query `['partnerRevisions', partnerCode]`, 목록·배지·changeSummary·복원 confirm·invalidate(partner full + admin partners + revisions)·토스트, **TERMINATED 면 복원 버튼 비활성+안내**, UUID 비노출) + `api/partnerRevision.ts`. `PartnerDetailDialog` 5번째 "버전 이력" 탭으로 통합(status 는 조회 데이터 `basic.status` 에서 파생).

## 6. 권한 / 가드
- `partners.4tab.edit` page 에 **RESTORE action 추가**(신규 page code 미생성, D-RST-03 정합 — 권한 매트릭스 행 억제). 목록=VIEW / 복원=RESTORE. PARTNER deny(내부 page), MASTER bypass. 도메인 가드 = TERMINATED 차단(신설).

## 7. 검증
- BE: `PartnerRevisionServiceTest`(capture 채번/race, summarize 헤더+3자식 diff) + `PartnerRevisionSnapshotTest` 단위 GREEN. `PartnerRevisionRestoreIT`(Testcontainers — 캡처/복원 헤더+자식/자식삭제 복원/TERMINATED 차단 409/RESTORE deny+MASTER bypass) — 로컬 Docker npipe 한계 시 **Linux CI 위임**([[feedback_testcontainers_windows_docker]]).
- FE: `npm run typecheck` PASS. Playwright `partner-version-history.spec.ts` 2 케이스 PASS(mock-mode fixture, PLAYWRIGHT_SKIP_WEB_SERVER): (1) 버전이력 2건 렌더 + 최신 복원버튼 미노출 + 과거 복원 confirm → 성공 toast, (2) TERMINATED 거래처 복원버튼 비활성 + 안내 문구. mock(`mock.ts`)에 partner revisions GET(결정적 2건) + restore POST fixture 추가(estimate 패턴 미러 — most-specific path 우선, `buildMockPartnerFull` 이 row status 반영해 TERMINATED 분기). Docker 실서버 QA 스크린샷은 PM 별도 처리.

## 8. 범위
- IN: 거래처 full-snapshot(헤더 + 4탭 자식) 버전이력 + 편집가능-상태 point-in-time 복원 + TERMINATED 가드 + SSE 재사용.
- OUT(설계상 제외): `creditLimit`/`outstandingBalance` 복원(신용 도메인 누적 일관) / `partnerCode`·`bizNo` 복원(불변 식별자) / un-delete / shared revision 추출(slip·estimate·partner 3형태차로 D-RST-02/05대로 보류, 인프라성 공통부만 후보).
