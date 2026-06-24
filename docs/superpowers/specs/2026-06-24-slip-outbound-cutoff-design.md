# 출고전표 컷오프(마감) 시간 설정 — 인사 메뉴 설계 spec

> 작성일: 2026-06-24 · 작성: PM(Opus) brainstorming(superpowers) + 코드 정찰 · 상태: **개발책임자 결정 확정 → spec 박제 → 사용자 리뷰 게이트 → writing-plans**
>
> 관련 메모리: [[feedback_canonical_workflow]] · [[project_dispatch_on_inspect_epic]](external_carrier/V66 4-table seed·account-mode 패턴) · [[feedback_fe_canaccess_pagecode_be_match]] · [[uuid-no-user-visibility]] · [[project_kst_timezone_standard]] · [[feedback_migration_fresh_postgres_probe]] · [[restclient-contract-test-false-green]]

---

## 0. 목표
출고전표의 **배송 태그(DeliveryTag)별 컷오프(마감) 시각**을 인사 메뉴에서 동적으로 설정하고, **당일 출고전표 생성 시 마감 시각을 초과하면 생성을 차단(409)**한다. 운영자는 "익일 출고"로 다시 생성한다. 견적서·주문서는 무관(명시 제외).

## 1. 확정 결정 (개발책임자 2026-06-24)
| # | 항목 | 확정 |
|---|---|---|
| D1 | 적용 대상 | **출고전표(OUTBOUND)만**. 견적/주문 무관. |
| D2 | 태그 | 기존 **`DeliveryTag` enum**(slip-service)의 OUTBOUND 태그. '지방'=REGION·'야적'=STACK·'경동'=GYEONGDONG_PARCEL(경동택배)+GYEONGDONG_FREIGHT(경동화물). |
| D3 | 기본 시드(4행) | REGION **12:00** · STACK **14:00** · GYEONGDONG_PARCEL **15:00** · GYEONGDONG_FREIGHT **15:00**. (12시=정오, 2/3시=오후 14/15시.) |
| D4 | 마감 동작 | **생성 차단(409)** — slipDate=오늘 + 해당 태그 활성 컷오프 + 현재시각(KST) > cutoff → BusinessException(CONFLICT). 메시지 "{태그라벨} 당일 마감({HH:mm}) 초과 — 익일 출고로 생성하세요". |
| D5 | 설정 범위 | **OUTBOUND DeliveryTag 전체 동적 CRUD**(태그 선택 + 시각 + 활성). 기본 3종(4행) 시드 + 다른 OUTBOUND 태그 추가/수정/삭제. |
| D6 | 게이트 범위 | **모든 출고전표 생성 경로** — 수동 작성 + 견적→출고 발행 + 주문→출고 발행. |
| D7 | 권한/메뉴 | 인사 카테고리 신규 page-code **`hr.slip-cutoff`**("출고 마감시간 설정"), 권한 **MASTER/MANAGER**(account-mode), 권한 관리 매트릭스 노출. |
| **D8** | **게이트 발동시점**(2026-06-24 추가결정 — Option B) | **생성 + 배송태그 확정(SlipForm/editHeader) 양쪽**. 정찰 결과 6개 출고 생성경로 중 5개(견적변환·모바일·견적발행·주문발행·주문병합)는 DRAFT를 **태그 null**로 생성하고 이후 **SlipForm(editHeader)에서 영업/현장이 배송태그+창고 확정**(코드 주석 확인). 수동작성만 생성 즉시 태그 보유. ⇒ 게이트=**생성 6경로(`createOutbound` 직후) + editHeader 2경로(태그 신규/변경 시)** = 8지점. "출고전표에 배송태그가 붙는 순간 마감 적용"(개발책임자). editHeader 태그 미변경(memo/driver만 수정)은 비차단. |

## 2. 아키텍처
slip-service에 **컷오프 마스터**(태그별 시각 CRUD) + **출고 생성 게이트**. external_carrier 마스터(슬2)·V66 4-table 권한 시드·account-mode 패턴 재사용.

```
[인사 메뉴 > 출고 마감시간 설정]  ── CRUD ──▶  slip_outbound_cutoff (태그 → cutoff_time)
                                                      │ (조회)
[출고전표 생성: 수동작성 / 견적발행 / 주문발행]  ──▶  CutoffGuard
   slipDate=today(KST) AND 태그 활성 컷오프 AND now(KST)>cutoff  →  409
   (그 외: 통과 — slipDate 미래·미설정 태그·비활성)
```

## 3. 데이터 모델 (slip-service, Flyway 신규 V51)
`slip_outbound_cutoff`:
- `id`(UUID PK), `delivery_tag`(VARCHAR(40) NOT NULL — DeliveryTag enum name), `cutoff_time`(TIME NOT NULL), `active`(BOOLEAN NOT NULL DEFAULT true), + BaseEntity 7 audit(created_at/by·modified_at/by·deleted_at/by·is_deleted).
- 활성 태그 부분 unique: `CREATE UNIQUE INDEX ... ON slip_outbound_cutoff(delivery_tag) WHERE is_deleted=false`(태그당 활성 1행).
- **기본 시드(V51 내 INSERT)**: REGION 12:00:00 · STACK 14:00:00 · GYEONGDONG_PARCEL 15:00:00 · GYEONGDONG_FREIGHT 15:00:00 (active=true). 적용 마이그 불변([[feedback_applied_migration_immutable]]) · fresh probe([[feedback_migration_fresh_postgres_probe]]).
- enum 값 추가 없음(DeliveryTag 기존). delivery_tag는 VARCHAR라 CHECK 제약은 OUTBOUND 태그 화이트리스트 선택(서비스 검증 + 선택적 DB CHECK).

## 4. 생성 게이트 (핵심)
- 신규 `OutboundCutoffGuard`(또는 SlipService 내 메서드): `assertWithinCutoff(deliveryTag, slipDate)`:
  - slipDate가 오늘(LocalDate.now(Asia/Seoul))이 아니면 통과(미래 출고 미리 생성 허용).
  - deliveryTag에 활성 컷오프 없으면 통과(opt-in).
  - `LocalTime.now(Asia/Seoul) > cutoff_time` 이면 `BusinessException(ErrorCode.CONFLICT, "...")`.
- 적용 지점(D6+D8 — 8지점, plan 정찰 grep 확정):
  - **생성 6경로**(`Slip.createOutbound` 직후, `assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate())`): SlipService:218(수동)·EstimateToSlipConverter:56(견적변환)·MobilePartnerOrderService:107(모바일)·SlipPublishService:137(견적발행)/:206(주문발행)/:294(주문병합). 수동만 생성 시 태그 보유→실차단, 나머지는 태그 null→통과(태그 확정 시 아래 editHeader가 잡음).
  - **태그확정 2경로**(D8 — `editHeader` 태그 신규/변경 시): SlipService:314(editHeader 엔드포인트=SlipForm 저장)·:~385(배치 헤더수정). editHeader 적용 전 `incoming != null && incoming != slip.getDeliveryTag()` 면 `assertWithinCutoff(incoming, slip.getSlipDate())`. 태그 미변경(memo/driver)·null 보존은 비차단(당일 전표 일반 수정 차단 방지).
  - **SlipSeeder 제외**(과거일자 시드).
- KST 표준([[project_kst_timezone_standard]]) — Clock 주입(테스트 고정시각 가능).

## 5. 권한 / 메뉴 (D7)
- page-code **`hr.slip-cutoff`** — PageCode enum 등록(인사/admin 섹션) + auth V70 V66 4-table seed(role_page_permissions + templates + group + account; MASTER/MANAGER view+create+update+delete). group_id MASTER=…100/MANAGER=…101. 권한 관리 매트릭스(PermissionMatrixPage) 노출.
- 컨트롤러 `@RequirePermission(page="hr.slip-cutoff", action=VIEW/CREATE/UPDATE/DELETE)`. account-mode. @RequireDepartment 미사용(MASTER/MANAGER 권한으로 충분).
- 게이트 위치(slip 생성)는 별도 권한 아님(생성 권한자가 마감 적용 받음).

## 6. FE (clients/desktop)
- 인사 SidebarCategory에 SidebarLink "출고 마감시간 설정"(dynamicCanAccess('hr.slip-cutoff','view')).
- `routes/admin/SlipCutoffConfigPage.tsx`(external_carrier 페이지 패턴): DataTable(태그 라벨/마감시각/활성/액션) + 등록/수정 Modal(태그 select=OUTBOUND DeliveryTag 미설정분 + 시각 input type=time + 활성) + soft-delete. canAccess('hr.slip-cutoff','create')로 관리 노출. 태그 라벨은 한국어(getKoreanLabel). UUID 비노출(testid=태그 enum/라벨).
- `api/slipCutoff.ts` + routes PermissionGuard + mock + vitest + PermissionMatrixPage 등록.
- gateway 라우트: `/admin/slip-cutoffs` 신규(slip-dispatch-admin-noprefix 패턴 또는 신규 no-strip 라우트).

## 7. 슬라이싱
단일 슬라이스(슬2 external_carrier 규모). canonical workflow([[feedback_canonical_workflow]]): Opus 기획+조기PR → Codex 개발 → (Opus 5-agent ↔ Codex 5-agent) 0수렴 → PM 종합 → CI green → 머지. 각 라운드 Docker 라이브 QA(마감 전/후 생성 200/409 + 인사 설정 화면 CRUD) 단계별 스샷.

## 8. 테스트 / QA
- BE: 컷오프 CRUD IT + **게이트 IT**(Clock 고정 — 마감 전 200·마감 후 409·미설정 태그 통과·slipDate 미래 통과, 세 생성 경로 각각). Flyway V51 fresh probe. account-mode 권한 IT(MASTER/MANAGER 200·타 role 403).
- FE: vitest(CRUD·canAccess 가드·태그 select). 라이브 QA(인사 메뉴 진입→태그별 시각 설정→마감 후 출고 생성 409 실증).
- 권한 V70: fresh probe + 권한 관리 매트릭스 노출 확인.

## 9. 비목표 (YAGNI)
- 견적서·주문서 컷오프 / 입고전표 / 컷오프 자동 익일전환(차단만, 자동조정 X) / 컷오프 알림 / 태그별 휴일·요일 예외(추후).

## 10. 미해결 — 착수 시 확인(plan 정찰)
- 출고전표 생성 공통 진입점(SlipService.createOutbound + publish-from-estimate/from-partner-order)에 게이트 1회 적용 위치.
- 출고전표의 deliveryTag·slipDate 필드 접근(생성 요청 DTO 기준).
- gateway /admin/slip-cutoffs 라우트 추가 위치(기존 slip admin no-strip).
- 인사 SidebarCategory page-code 게이트 패턴(기존 인사 메뉴 dynamicCanAccess).
