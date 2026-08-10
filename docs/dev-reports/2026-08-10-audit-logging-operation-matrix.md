# 전 서비스 감사 기록 — **동작 단위** 전수 조사

> 개발책임자 지시 (2026-08-10): *"로그 기록은 **전 서비스 모두** 기록이 되어야 해."* / *"로그도 **모든 서비스의 동작을 전부** 기록하는 것인지도 전수조사."*

> 워크플로우 12에이전트 · 서비스군 6개 병렬 수집 → 매트릭스 합성 → 적대검증 4각도 → 슬라이스 제안


## 🚨 답 — 아니오. **580개 변경 동작 중 42개(7.2%)만 기록됩니다.**

```text
변경 동작 총계              580
  기록됨                    42   (7.2%)
  기록 안 됨                341
  기록기만 존재(호출자 없음) 144   ← 클래스는 있는데 아무도 안 부른다
  부분 기록                 52
  판정 불가                 1
```


## 서비스별 커버리지


| 서비스 | 변경 동작 | 기록됨 | 커버리지 | 판정 |
|---|---:|---:|---|---|
| slip-service | 142 | 20 | 기록됨 20/142 = 14.1% · 부분 포함 29/142 = 20.4% (안됨 113 · 기록기만 0) | 기록 계열이 6종(slip_audit_logs·slip_revisions·estimate_revisions·slip_publish_audit·slip_signature_audit·serial_compensation_failures)으로 가장 두껍지만, 상태전이 11개 중 9개가 무기록이고 배차·운송사·마감 관리 5개 디렉터리는 audit grep 0건 — 기록되는 곳과 안 되는 곳이 도메인별로 갈린다 |
| accounting-service | 100 | 7 | 기록됨 7/100 = 7.0% · 부분 포함 12/100 = 12.0% (안됨 88 · 기록기만 0) | 기록기 4개·호출자 6개 서비스가 실제로 동작하나, V5 마이그레이션이 감사 대상으로 선언한 Journal·AccountingPeriod 가 정작 0건이고 실제 기록되는 것은 선언에 없는 BankTransaction·DepositorMapping — 분개 게시·마감·세금계산서 발행/취소가 전부 무기록 |
| arologis-service | 56 | 0 | 기록됨 0/56 = 0% · 부분 포함 3/56 = 5.4% (안됨 0 · 기록기만 52 · 판정불가 1) | 🚩 52개 변경 동작 중 audit 쓰기 호출이 DispatchService.java:261 단 1곳이고 그마저 actorId=UUID(0,0)/"system" 하드코딩 + catch 로 실패 무시 + status 필드만. 금전 거래(cash-txn) 생성/수정/삭제·기사 교체·외부 벤더 webhook 상태변경 전부 무기록 |
| inventory-service | 47 | 6 | 기록됨 6/47 = 12.8% · 부분 포함 8/47 = 17.0% (안됨 39 · 기록기만 0) | 창고 update/delete/restore/revert 4건은 필드 단위로 제대로 기록. 그러나 창고 create 는 누락되고 ecount CSV 임포트는 WarehouseService 를 우회해 JDBC 직접 UPSERT — 같은 테이블인데 경로에 따라 감사 유무가 갈린다. 재고 이동·인스턴스 계열 전량 무기록 |
| product-service | 44 | 0 | 기록됨 0/44 = 0% (안됨 0 · 기록기만 44 — 전건) | 🚩 최악. ProductAuditLogService 참조가 자기 선언(:44/:63/:86)과 읽기 전용 컨트롤러(:4/:33)뿐 — 쓰기 호출자 0. GET /products/{productId}/audit-logs 는 영원히 빈 목록. 고정DC·단가·분류 변경과 5분 주기 시트 동기화가 전부 무기록 |
| auth-service | 40 | 0 | 기록됨 0/40 = 0% · 부분 포함 1/40 = 2.5% (안됨 39 · 기록기만 0) | 🚩 감사 테이블 자체가 없음(auth_db 에 flyway_schema_history 뿐). 권한 매트릭스·역할 템플릿·그룹 배속·계정 삭제/잠금해제가 전부 무기록이고 log.info/log.warn 만. updateAccountRole·deleteAccount·unlockAccount 는 actor 파라미터 자체가 없어 배선 전에 API 계약 변경이 필요 |
| partner-order-service | 29 | 5 | 기록됨 5/29 = 17.2% · 부분 포함 16/29 = 55.2% (안됨 13 · 기록기만 0) | 14개 서비스 중 기록됨 비율 최고. 필드 단위 diff 가 실제로 도는 유이한 곳(PUT /{id}, 협업 수정완료). 다만 전표 전환·병합 전환은 재고+전표+상태를 동시에 바꾸면서 감사·이력 0 |
| groupware-service | 29 | 0 | 기록됨 0/29 = 0% · 부분 포함 1/29 = 3.4% (안됨 0 · 기록기만 28) | 🚩 GroupwareAuditLogRepository 가 전 서비스 grep 에서 자기 선언줄 1건뿐. V2 마이그레이션이 스스로 "실 mutation 호출자 통합은 향후 PR" 이라 적어 둠. 결재 승인/반려가 groupware_audit_logs 0행. 결재 협업 수정완료만 approval_collab_suggestions 에 before/after 보존 |
| partner-service | 28 | 0 | 기록됨 0/28 = 0% · 부분 포함 13/28 = 46.4% (안됨 13 · 기록기만 2) | partner_revisions 스냅샷은 널리 남으나 partner_audit_logs 쓰기 호출자는 PartnerService.java:389 단 1곳이고 그마저 name/address/phone 3필드·actor 항상 "system". partners 7,314행 · partner_audit_logs 0행 실측 |
| user-service | 25 | 3 | 기록됨 3/25 = 12.0% · 부분 포함 5/25 = 20.0% (안됨 16 · 기록기만 4) | employee_signature_audit(서명 등록/무효화)만 actor 포함 정상 기록. UserAuditLogService 는 선언줄 외 참조 0 — V4 가 "법적 인사 기록 보존" 을 단언했으나 인사 마스터 변경·퇴사·계정 잠금해제 전부 무기록. user_audit_logs 0행·role_change_history 0행 실측 |
| notification-service | 15 | 0 | 기록됨 0/15 = 0% · 부분 포함 4/15 = 26.7% (안됨 0 · 기록기만 11) | 🚩 NotificationAuditLogService 가 AuditLogRecorder 를 완성 구현했는데 주입 지점 0 — dc-config 패턴 재현. 발송 계열 4건은 notification_logs 로 시도/결과가 남지만 이는 발송 로그이지 감사가 아니고 발송 지시자(actor)가 없음 |
| dashboard-service | 14 | 0 | 기록됨 0/14 = 0% (안됨 14 — 전건 · 기록기만 0) | 감사 테이블·엔티티·기록기가 아예 0(마이그레이션 V1~V7 전체에 CREATE 없음). 조회 전용 서비스가 아님 — 앱 공지 6 + 앱 릴리스 5 + MV 갱신 1 의 변경 표면이 있고, publish/unpublish 는 컨트롤러가 actor 를 서비스로 넘기지도 않음 |
| partner-auth-service | 7 | 1 | 기록됨 1/7 = 14.3% (안됨 6 · 기록기만 0) | partner_login_attempt 가 로그인 전 분기(성공/실패 6종)를 IP·UA 까지 기록 — 14개 서비스 중 인증 시도가 남는 유일한 곳(실측 46행). 반면 관리자 강제 비밀번호 초기화·승인/차단 상태 전이는 actor 파라미터조차 없이 무기록 |
| dc-config-service | 4 | 0 | 기록됨 0/4 = 0% · 부분 포함 1/4 = 25% (안됨 0 · 기록기만 3) | 🚩 PM 실측 확인 — DcConfigAuditLogService 는 존재하나 전 서비스 grep 결과 자기 선언줄 외 참조 0. dc_configs 259행 존재 · dc_config_audit_logs 0행. 할인율·정액DC 변경이 금액에 직결되는데 감사 1행도 없음 |

---

## 불일치

- 【집계 방식이 군마다 다름 — 총계 580 을 그대로 쓰면 안 되는 이유】 A·D·F 는 '상태 변경 없는 POST' 를 총계에 포함했고(A 2건 · F 4건), E 는 97 매핑에 포함하되 '실제 상태 변경 88' 로 따로 셌으며, B 는 '조회인데 상태를 바꾸는 GET' 2건을 mutation 으로 셌습니다. ⟹ 580 은 **'변경 매핑 표면' 기준**입니다. 순수 상태 변경만 세면 15건(A 2 · E 9 · F 4)을 빼 **565**, dev 시더 16건까지 빼면 **549** 입니다. 개발책임자 지시의 대상 범위를 무엇으로 잡느냐에 따라 분모가 세 가지입니다.
- 【비-HTTP 지점 포함 여부도 군마다 다름】 A 는 스케줄러 7 포함·시더 0, B 는 CommandLineRunner 1 포함·스케줄러 0(실제 0건), C 는 스케줄러 3+시더 1, D 는 스케줄러/리스너 4+시더 6, E 는 시더 3만(스케줄러 0건 — 4개 서비스에 @Scheduled 자체가 없음), F 는 스케줄러 4+시더 5. 총 비-HTTP 34건. 군별로 '무엇을 변경 동작으로 볼 것인가' 의 기준이 사전 합의되지 않은 채 각자 셌습니다.
- 【D 군 note 의 자기모순 — 실측으로 해소】 D 군 note 가 inventory 기록됨을 *"완전 기록 5건 … 포함하면 6건"* 으로 흔들립니다. operations 배열은 6건이고, 제가 코드로 재확인한 결과도 6건입니다(WarehouseService.java 의 recordAuditSafe 호출 4곳 = :180 update · :203 delete · :231 restore · :290 revert, InventoryAuditService.java 의 recordStatusAudit 호출 3곳 = :169 start · :246 complete · :294 cancel 중 complete 는 status 만이라 '부분'). ⟹ **6 으로 확정**했습니다. 덧붙여 D 군이 적은 delete :202·restore :236 은 실제 :203·:231 로 줄번호가 어긋납니다(호출 지점 개수는 일치).
- 【기록기 클래스는 있는데 호출자가 0 — 5개 서비스에서 동일 패턴】 dc-config(DcConfigAuditLogService) · product(ProductAuditLogService) · user(UserAuditLogService) · groupware(GroupwareAuditLogRepository) · notification(NotificationAuditLogService). 제가 **14개 서비스 전역**으로 grep 한 결과 뒤 네 개는 자기 선언줄 1건 외 참조가 아예 없어(cross-service 호출자도 없음) 군별 보고보다 더 강하게 확정됩니다. product 만 읽기 전용 컨트롤러 참조 2건이 추가로 있습니다. 이 5개 서비스가 '기록기만 존재' 144건 중 **139건**을 차지합니다(dc-config 3 · product 44 · user 4 · groupware 28 · notification 11 = 90, 나머지 arologis 52 + partner 2 = 54 ⟹ 합 144).
- 【호출자가 1곳뿐인 서비스 2개】 partner-service = PartnerService.java:389 하나(그마저 name/address/phone 3필드·actor 항상 "system"), arologis-service = DispatchService.java:261 하나(actorId=UUID(0,0) 하드코딩·catch 로 실패 무시·status 필드만). 즉 '기록됨' 으로 분류되지 않았을 뿐 사실상 5개 서비스와 같은 미배선 상태에 가깝습니다.
- 【마이그레이션이 선언한 감사 대상 ≠ 실제 구현 — 5개 서비스에서 어긋남】 ①accounting V5:16-17 은 TaxInvoice/Journal/AccountingPeriod 를 명시했으나 Journal 0건·AccountingPeriod 0건이고, 실제 기록되는 것은 선언에 없는 BankTransaction·BankDepositorPartnerMapping. ②dc-config V3:15,:55-58 은 '모든 DcConfig 변경에 audit overlay 적용' + 대상 필드를 열거했으나 호출 0. ③partner V5:15-16 은 BlockedPartner 를 명시했으나 호출 0. ④inventory V4:59 는 lines[idx].actualQty 까지 상정했으나 status 만. ⑤groupware V2:8 은 스스로 '호출자 통합은 향후 PR' 이라 자백. ⟹ **문서상 이미 의무로 적혀 있는데 미이행인 것**이 이만큼입니다.
- 【기록 목적지 — 14개 서비스 전부 자기 DB, logging-service 전송 경로 0】 여섯 군 전부 'logging-service'/'LoggingClient'/'AuditClient'/'ActivityLog' grep 0건을 독립적으로 보고했고 서로 일치합니다. 중앙 집계가 없어 **서비스 횡단 감사 조회가 구조적으로 불가능**합니다.
- 【감사 테이블 스키마가 서비스마다 제각각 — 14개 서비스에 최소 11가지】 slip 6종(slip_audit_logs V18 · slip_revisions V27 · estimate_revisions V28 · slip_publish_audit V8 · slip_signature_audit V5 · serial_compensation_failures V31) / accounting 1종(accounting_audit_logs V5) / dc-config 1종(dc_config_audit_logs V3, 단 entity_id 가 DcConfig·DcRule 로 한정돼 EstimateConfig 는 스키마상 대상도 아님) / partner-order 3종(partner_order_audit_logs V3 · partner_order_history V1 · partner_order_revisions V7) / product 1종(product_audit_logs V6) / inventory 1종(inventory_audit_logs V4) / partner 2종(partner_audit_logs V5 · partner_revisions V12) / user 3종(user_audit_logs V4 · role_change_history V3 · employee_signature_audit V10) / groupware 1종(groupware_audit_logs V2) / notification 1종(notification_audit_logs V3) / arologis 2종(arologis_audit_logs V5 · arologis_role_change_history) / **auth-service 0종** / partner-auth 1종(partner_login_attempt) / **dashboard 0종**. 통합 조회 스키마가 없습니다.
- 【기록 '수준' 이 최소 6층으로 갈림】 ①필드 단위 old→new diff(slip audit/overlay·협업edits, accounting deposit-mapping·bank-txn match, partner-order PUT·협업edits, inventory 창고, partner updateProfile 3필드) ②요약 문자열 1행(slip PUT/DELETE 의 SLIP_EDIT/SLIP_DELETE — summarize() 결과) ③전체 스냅샷만(slip_revisions·estimate_revisions·partner_revisions) ④이벤트 마커 1행(partner-order 의 DELETE/RESTORE/FROM_ESTIMATE) ⑤도메인 이력 테이블(partner_order_history·notification_logs·role_change_history·approval_collab_suggestions·journal_collab_suggestions) ⑥애플리케이션 log.info/log.warn 만(auth-service 권한 변경 전체). 같은 '전표 수정' 이라도 어느 endpoint 로 들어오느냐에 따라 남는 정보가 완전히 다릅니다.
- 【같은 shared 협업 컴포넌트인데 결과가 5가지】 shared/collab-core 의 동일한 CollabCommentService/CollabCoeditService 를 쓰는 '수정완료(collab/edits)' 가 서비스마다 다르게 남습니다 — slip=slip_audit_logs 다건+revisions / estimate=estimate_revisions 만 / partner-order=partner_order_audit_logs 필드단위+revisions / accounting=journal_collab_suggestions 만(accounting_audit_logs 0) / groupware=approval_collab_suggestions 만 / 배차(slip 내 dispatch)=이력 테이블 자체 없음. 공통 컴포넌트를 쓰면서 감사 계약만 제각각입니다.
- 【같은 도메인인데 진입 채널에 따라 기록 유무가 갈림 — 4건】 ①slip 웹 create(capture CREATE) ↔ mobile create(기록 0, 리포지터리 직접 save) — 같은 문서인데 rev 1 이 있기도 없기도 함. ②inventory 창고 PATCH(필드단위 기록) ↔ 창고 ecount CSV import(WarehouseService 우회 JDBC UPSERT, 기록 0). ③slip 전표 삭제(SLIP_DELETE audit) ↔ 견적 삭제(기록 0). ④accounting hometax preview/exclusions 를 신규·@Deprecated 두 컨트롤러가 공유(양쪽 다 미기록이라 결과는 같으나 표면이 2벌).
- 【actor 소실이 계통적 — 8개 서비스】 inventory 실사 audit actorId=new UUID(0,0)/"system" 하드코딩(InventoryAuditService.java:428) · arologis 유일 audit 경로도 동일(DispatchService.java:261) · accounting TaxInvoiceService systemActor UUID(0,0)(:167,:171-179) · partner updateProfile actor 항상 "system"(2-arg 오버로드가 actor 를 버림, PartnerService.java:343→:386-387) · Partner4TabService captureEdit 3곳이 (null,null)(:284 단가·할인 포함) · user RoleChangeHistory.record 시그니처에 callerId 자리 자체가 없음(:76) · auth updateAccountRole/deleteAccount/unlockAccount 는 actor 파라미터 자체 없음 · partner-auth updateStatus/resetPassword 도 actor 없음 · dashboard publish/unpublish 도 actor 미전달. ⟹ **배선만으로는 해결 안 되고 API 계약 변경이 필요한 경로가 다수**입니다.
- 【감사 실패를 catch 로 삼키는 곳 5개 — '기록됨' 판정도 런타임 누락 가능】 inventory WarehouseService.recordAuditSafe(:354-357)·InventoryAuditService.recordStatusAudit(:431-435) · partner PartnerService(:391-393) · arologis DispatchService(:262-265) · accounting TaxInvoiceEmitAuditRecorder(:74-77)·TaxInvoiceService.recordIfChanged(:218-220). 감사가 실패해도 도메인 mutation 은 커밋됩니다. ⟹ 기록됨 42건이 **런타임 보장치가 아닙니다**.
- 【읽기 API 유무도 비대칭】 조회 endpoint 가 있는 곳 = slip(GET /slips/{id}/audit-logs) · product(GET /products/{productId}/audit-logs — **영원히 빈 목록**) · inventory(실사·창고 2개) · arologis(ArologisAdminController.java:403) · user(role-history 만). 반면 partner·user 의 audit 패키지는 **컨트롤러가 아예 없어** 쓰기도 읽기도 없습니다. accounting 은 저장 대신 SSE broker publish 로 화면에만 흘립니다.
- 【DB 실측 0행이 8개 테이블 — 다만 두 가지 원인이 섞여 있음】 dc_config_audit_logs 0(dc_configs 259행 대비) · user_audit_logs 0 · role_change_history 0(employees 100행 대비) · employee_signature_audit 0 · partner_audit_logs 0(partners 7,314행 대비) · groupware_audit_logs 0 · groupware_edit_requests 0 · notification_audit_logs 0 · arologis_audit_logs 0 · arologis_edit_requests 0. **그런데 arologis_audit_logs 0 은 '미배선' 이 아니라 '표본 0'** 입니다(F 군이 스스로 명시 — 코드 경로 DispatchService.java:261 은 실재하며 이 PC 에서 정차 상태 갱신을 한 번도 밟지 않았을 뿐). 나머지는 호출자 0 이라 구조적 0 입니다. **두 0 을 같은 것으로 세면 안 됩니다.** 반대로 살아 있는 것 = partner_order_audit_logs 4행 · partner_login_attempt 46행 · price_calculation_logs 574행 · dispatch_sms_save_history 9행 · arologis_role_change_history 3행.
- 【군별 검증 깊이가 다름 — D 군만 DB 실측 없음】 C·E·F 는 실 DB 행 수를 제시했고 A 는 테이블 존재를 확인했으나, **D 군(product·inventory)은 DB 실측 수치를 제시하지 않았습니다**. product_audit_logs·inventory_audit_logs 의 실제 행 수가 이 보고서에 없습니다 — product 는 호출자 0 이라 0행이 확실하지만 inventory 는 기록 경로가 살아 있으므로 **실측이 필요합니다**(현재 미확인).
- 【AOP·Envers 우회 경로 부재는 6군 전부 일치】 여섯 군이 각각 @Aspect/@Audited/envers/@EntityListeners/@PostPersist/@EventListener/Kafka·Rabbit 리스너를 전수 검색해 모두 '감사용 없음' 으로 수렴했습니다(shared 의 @Aspect 는 DepartmentAspect·PermissionAspect 둘뿐이며 인가용). ⟹ '보이지 않는 곳에서 기록될 가능성' 은 배제되며, 이 때문에 판정 불가가 580건 중 1건뿐입니다.
- 【slip-service 의 고아 자산 2건 — 어느 군도 대응을 제안하지 않음】 ①slip_line_correction_audits 테이블(V61:3 생성, :69 일회성 INSERT)을 참조하는 엔티티·리포지터리·기록기가 src/main/java 전체에 0. ②SlipService.softDelete(service/SlipService.java:652)가 마감 가드까지 구현돼 있으나 호출자 0(죽은 코드).
- 【partner-order-service 부수 발견 — 감사 축 밖이지만 기록】 slip_publish_outbox 에 **행을 넣는 코드가 src/main 에 없습니다**(SlipPublishOutbox.create 팩토리 outbox/SlipPublishOutbox.java:111 호출자 0). 재시도 스케줄러는 기존 행만 처리합니다. 또 HistoryEventType.SLIP_RETRY_QUEUED 는 enum 에 선언돼 있으나 쓰는 코드가 없는데 DB 에는 1행 존재(레거시 잔재) — 별도 트랙 확인이 필요할 수 있습니다.

## 🚩 개발책임자 확인이 필요한 것

- 【분모를 무엇으로 할 것인가 — 이것부터 정해야 나머지가 정해집니다】 지시("전 서비스 모두 기록")의 대상이 ①변경 매핑 표면 580건 전부인가 ②상태 변경 없는 POST/미리보기 15건을 뺀 565건인가 ③dev 프로필 시더 16건까지 뺀 549건인가. 군마다 세는 기준이 달라 하나로 확정해 주셔야 커버리지 목표치를 세울 수 있습니다.
- 【인증·세션 동작을 감사 대상으로 볼 것인가】 현재 auth-service 는 로그인/로그아웃/비밀번호 변경/계정 잠금해제가 **전부 무기록이고 감사 테이블 자체가 없습니다**(auth_db 에 flyway_schema_history 뿐). 반면 partner-auth-service 는 partner_login_attempt 로 로그인 전 분기(성공·실패 6종)를 IP·UA 까지 남깁니다(실측 46행). arologis 도 admin/driver 로그인·토큰 회전 무기록. **어느 쪽을 표준으로 삼을 것인지** 확인 요망 — auth-service 를 표준에 맞추면 테이블 신설이 필요합니다.
- 【dashboard-service 를 제외할 것인가】 감사 테이블·엔티티·기록기가 0 이지만 **조회 전용 서비스가 아닙니다** — 앱 공지 6 + 앱 릴리스 5 + MV 갱신 1 = 12개 변경 endpoint 가 있고, 특히 publish/unpublish 는 사용자에게 배포되는 되돌리기 어려운 동작인데 컨트롤러가 actor 를 서비스로 넘기지도 않습니다(AppReleaseService.java:102·110 시그니처에 actor 없음). 포함/제외 판단 요망.
- 【휘발성 협업 동작(presence join/leave · coedit update/awareness)을 대상에서 뺄 것인가】 현재 총계 580 에 약 30건이 포함돼 있습니다(slip 8 · estimate 4 · dispatch 4 · accounting 4 · partner-order 4 · groupware 4 등). 이들은 ConcurrentHashMap 인메모리라 **DB 변경 자체가 없어** 기술적으로 감사 대상이 아닐 수 있습니다. 빼면 구멍 485 → 약 455 로 줄고 목표가 현실화됩니다.
- 【기록 단위 표준을 무엇으로 할 것인가】 현재 6층이 공존합니다(필드 단위 diff / 요약 문자열 1행 / 전체 스냅샷 / 이벤트 마커 1행 / 도메인 이력 테이블 / log.info 만). ①필드 단위 old→new 를 전 서비스 의무로 할 것인가 ②전체 스냅샷(revisions)으로 갈음 가능한가 ③'무엇을 했다' 1행이면 되는가. 금액·회계·권한 도메인만 필드 단위로 하고 나머지는 완화하는 안도 가능합니다.
- 【actor 표준 — API 계약 변경 승인이 필요합니다】 배선만으로 해결되지 않는 경로가 다수입니다: auth-service updateAccountRole/deleteAccount/unlockAccount · partner-auth updateStatus/resetPassword · dashboard publish/unpublish · arologis HR update/terminate · accounting notes-receivable transition/supplier-profile setPrimary · groupware document-template deactivate 는 **컨트롤러·서비스 시그니처에 actor 인자 자체가 없습니다**. 시그니처 변경(내부 API 계약 변경)을 진행해도 되는지 확인 요망.
- 【이미 하드코딩된 system actor 를 어떻게 할 것인가】 inventory 실사 audit(UUID(0,0)/"system") · arologis 유일 audit 경로 · accounting TaxInvoice update · partner updateProfile · Partner4TabService 3곳(단가·할인 포함). 이들은 '기록됨/부분' 으로 분류돼 있으나 **누가 했는지는 복구 불가**합니다. 이것을 게이트 통과로 볼 것인지, actor 없는 기록은 미달로 볼 것인지 기준이 필요합니다.
- 【저장 위치 — 자기 DB 유지 vs logging-service 중앙화】 14개 서비스 어디에도 logging-service 전송 경로가 없고 스키마가 최소 11가지로 갈라져 있습니다. 서비스 횡단 감사 조회("이 사용자가 어제 무엇을 했나")가 현재 구조로는 불가능합니다. 중앙화로 갈 것인지, 자기 DB 유지하되 **공통 스키마·공통 기록기 인터페이스로 통일**할 것인지 방향 확인 요망(후자면 shared 의 AuditLogRecorder 를 확장하는 형태가 자연스럽습니다).
- 【감사 실패 시 트랜잭션 처리 정책】 현재 5개 서비스가 catch 로 감사 실패를 삼켜 mutation 만 커밋됩니다(inventory 2곳·partner·arologis·accounting 2곳). 무결성 도메인 규칙상 "감사 실패 = 동작 실패" 로 바꿀 것인지, graceful 을 유지할 것인지 — **이것을 정하지 않으면 '기록됨' 판정이 런타임 보장이 되지 않습니다.**
- 【이미 만들어져 있으나 호출자 0 인 기록기 5종을 배선할 것인가, 재설계할 것인가】 dc-config·product·user·groupware·notification 의 기록기는 완성돼 있고 배선만 없습니다(139건이 여기 걸림 = 구멍 485건의 29%). 배선만 하면 5개 서비스가 즉시 살아나지만 스키마가 서로 달라 나중에 통합 비용이 듭니다. **선(先)배선 후(後)통합 vs 통합 스키마 확정 후 일괄 배선** 중 어느 쪽인지 판단 요망.
- 【마이그레이션이 이미 의무로 선언한 것을 1순위로 볼 것인가】 문서상 이미 적혀 있는데 미이행인 것들입니다 — accounting V5 의 Journal·AccountingPeriod(분개 게시·월마감/역마감) · partner V5 의 BlockedPartner(거래처 차단/해제) · dc-config V3 의 DcConfig 필드(할인율·정액DC) · inventory V4 의 실사 lines. 이 4건은 **'새 요구' 가 아니라 '미완 이행'** 이라 우선순위를 올릴 근거가 있습니다.
- 【이관/임포트(ecount CSV·XLSX) 계열을 대상에 넣을 것인가】 전 서비스 합계 30건 이상이 전부 무기록입니다(accounting 15 · product 1 · inventory 2 · partner 2 · user 4 · notification 1 · arologis 1 등). partners 7,314행·products 2,655행 규모를 한 번에 갱신하는 동작인데, 건별 감사가 현실적이지 않을 수 있어 **'배치 실행 1행(누가·언제·몇 건·파일 해시)' 수준으로 갈음할 것인지** 판단 요망.
- 【판정 불가 1건 — 확인 필요】 arologis PUT /admin/arologis/permissions(controller/ArologisPermissionAdminController.java:111)는 auth-service 로 저장을 위임하고 actorUserId 도 전달합니다. 그런데 **수신측 auth-service 에 감사 테이블 자체가 없으므로 사실상 무기록일 가능성이 높습니다.** 서비스군 F 범위 밖이라 확정하지 못했습니다 — auth-service 배선 시 함께 닫아야 합니다.
- 【고아 자산 처리】 slip_line_correction_audits(slip V61)는 테이블만 있고 자바 참조 0, SlipService.softDelete(:652)는 호출자 0. 폐기할 것인지 유지할 것인지 — 감사 스키마를 정리하는 김에 함께 결정하면 비용이 적습니다.
- 【inventory 감사 테이블 실측이 비어 있습니다】 D 군만 DB 행 수를 제시하지 않아 inventory_audit_logs 의 실제 행 수가 미확인입니다. 창고 기록 경로는 살아 있으므로 **'실제로 쌓이고 있는지' 를 확인해야** inventory 커버리지 12.8% 가 코드상 수치인지 실동작 수치인지 갈립니다. 다음 라운드에서 실측 예정으로 두겠습니다(PM 판단 요망).

---

## 적대검증 4각도


### 매트릭스 총계·항목 독립 재계수 (적대검증) — 저장소 전수 grep 으로 변경 표면을 다시 세어 매트릭스 580 과 항목 단위 대조

**판정** — 빠진 것 있습니다 — "전건 나열" 이 아닙니다. 내가 센 숫자: HTTP 변경 매핑 **556**(매트릭스 함의 545, −11) · @Scheduled **20** · CommandLineRunner **20** ⟹ 실측 표면 **596** vs 매트릭스 **580**. 상태를 실제로 바꾸는데 목록에 없는 것이 최소 7건 — slip 시더 4건(SlipSeeder:72·EstimateSeeder:55·DeliveryBatchSeeder:54·SlipLockSeeder:43) · partner-order 스케줄러 2건(DraftCleanupScheduler:24 soft delete·SlipPublishOutboxScheduler:76) · inventory ship-batch 1건(StockInstanceController:151→StockInstanceService:216, audit grep 0 ⟹ '기록 안 됨 341' 은 342). 여기에 미명세 3건(inventory dps-compare·balances/batch, notification NotificationService:177)과 분모 비일관 11건(product 조회 전용 POST 를 product 에서만 배제 — 같은 기준이면 44→55, 커버리지 0/55)이 더해집니다. 반대 방향 오류도 있습니다: partner-order 는 실측보다 2건 많게 계상됐고, **기록됨 42+부분 52 = 94건이 항목으로 나열되지 않아 총계 580 을 항목 단위로 재현할 수 없습니다** — 이것이 유령 2건을 특정하지 못한 이유입니다. 축 하나가 통째로 빠졌습니다: 배포 시 실행되는 Flyway DML(auth 98개 중 84개가 DML, 그중 6개가 계정·권한 행 직접 변경 — V44__assign_accounts_to_groups.sql 이 전 활성 계정을 권한그룹에 배속하는데 auth 는 감사 테이블 자체가 없음)과 서비스 밖 운영 스크립트(scripts/cleanup-loadtest-data.ps1). 반면 10개 서비스(slip·accounting·auth·partner-auth·dc-config·groupware·partner·user·dashboard·arologis)의 HTTP 계수는 내 실측과 정확히 일치했고, 숨은 기록 경로(Java 마이그레이션·MQ 리스너·shared 매핑)가 없다는 매트릭스 결론도 내 grep 과 일치합니다.

- 【내가 직접 센 숫자】 `services/*/src/main/java` 전수, 주석·javadoc(`@code`/`@link`) 제외 엄격 계수. **HTTP 변경 매핑 556건** = slip 135 · accounting 97 · arologis 52 · product 49 · inventory 44 · auth 40 · groupware 28 · partner 26 · partner-order 25 · user 24 · notification 13 · dashboard 12 · partner-auth 7 · dc-config 4. `shared/` 에는 `@Post/@Put/@Patch/@DeleteMapping` 이 0건이라 숨은 HTTP 표면은 없습니다. 비-HTTP 실측 = **@Scheduled 20건**(주석 제외 실 어노테이션) + **CommandLineRunner 20건** + @EventListener 3건(slip 2 · product 1, 전부 readiness 계열). ⟹ 실측 총 표면 = 556 + 20 + 20 = **596** (매트릭스가 주장한 '상태 변경 GET' 3건을 더하면 599). 매트릭스 580 과 **19건 차이**.
- 【서비스별 대조표 — 실측 HTTP vs 매트릭스가 함의하는 HTTP】 매트릭스 ops 에서 그 서비스의 비-HTTP 항목과 GET 항목을 빼서 역산했습니다. 일치 10개 = slip 135/135 · accounting 97/97(GET 2 별도) · auth 40/40 · partner-auth 7/7 · dc-config 4/4 · groupware 28/28 · partner 26/26 · user 24/24 · dashboard 12/12 · arologis 52/52. **불일치 3개 = product 실측 49 vs 함의 38(−11) · inventory 실측 44 vs 함의 42(−2) · partner-order 실측 25 vs 함의 27(+2)**. 합산하면 매트릭스 HTTP 545 vs 실측 556 = **순 −11**.
- 🚩【확정 누락 ①: slip-service dev 시더 4건이 통째로 빠짐】 매트릭스 inconsistencies 는 *"A 는 스케줄러 7 포함·시더 0"* 이라 적었지만 slip-service 에는 상태를 바꾸는 CommandLineRunner 가 4개 실재합니다 — `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:72`(:235 run → :281 `slipRepository.save`) · `EstimateSeeder.java:55`(:95 run → :125 저장) · `DeliveryBatchSeeder.java:54`(:83 run → :138 `saveAndFlush`) · `SlipLockSeeder.java:43`(:58~:80 run — CONFIRMED 전표에 `slip.lock()` 을 걸어 **마감 lock 상태를 변경**하는데 무기록). 다른 9개 서비스의 시더 16건은 전부 gaps 에 `BOOT CommandLineRunner …` 로 나열돼 있으므로 slip 만 기준이 다르게 적용된 것입니다. ⟹ 비-HTTP 34 → 최소 38.
- 🚩【확정 누락 ②: partner-order-service 스케줄러 3건 미계상】 매트릭스는 `PartnerOrderEditRequestService.expirePending` 1건만 실었고 inconsistencies 는 어느 군을 *"스케줄러 0(실제 0건)"* 이라 단정했지만, 실측 @Scheduled 는 4개입니다 — `scheduler/DraftCleanupScheduler.java:24 cleanupExpired`(매일 03:00, 30일 TTL 임시저장 **soft delete**, actor 를 `"system"` 문자열로 넘김) · `scheduler/SlipPublishOutboxScheduler.java:76 retryPending`(outbox row claim+lease 점유 → 전표 발행 재시도, `:60 @PostConstruct` 불변식 검사 별도) · `config/BootstrapCacheRefreshScheduler.java:43`(캐시 evict/prefetch 전용, DB 미변경이라 제외는 정당) · expirePending :249. ⟹ **DB 를 바꾸는 무기록 스케줄러 2건이 목록에 없습니다.**
- 🚩【확정 누락 ③: inventory `POST /inventory/instances/ship-batch` — 실 상태 전이인데 목록에 아예 없음】 `services/inventory-service/.../web/StockInstanceController.java:151` → `service/StockInstanceService.java:216 shipBatch(@Transactional)` 로 RESERVED→SHIPPED 전이. 매트릭스는 형제 6개(instances :72 · batch :115 · reserve-batch :167 · release-batch :253 · recall-batch :283 · unrecall-batch :383 · resell-batch :413)를 모두 '기록안됨' 으로 실었는데 ship-batch 만 빠졌습니다. `StockInstanceService.java` 전체에 `audit` grep 0건이므로 판정은 **기록안됨**이고, 따라서 gaps 의 '기록 안 됨 341' 은 최소 342 입니다.
- 【누락 ④: inventory 미명세 2건】 `web/DpsCompareController.java:72 POST /warehouse/audit/dps-compare`(멀티파트 업로드 대사 — 같은 컨트롤러 계열의 `DpsSaveHistoryController.java:59 dps-history` 는 나열됨) · `web/StockController.java:115 POST /inventory/balances/batch`. 둘 다 매트릭스 어디에도 문자열이 없습니다. 매트릭스 inventory 함의 HTTP 가 실측보다 2 적은 것과 규모가 맞습니다(ship-batch 포함 3건 중 1건이 '부분 8' 에 숨어 있을 수 있으나 항목 명세가 없어 확정 불가).
- 【누락 ⑤: product-service 11건 — 판정은 옳으나 분모가 비일관】 실측 49 vs 매트릭스 38. 빠진 11건은 `web/ProductController.java:120 POST /products/lookup` · `web/ProductInternalController.java:92,:110,:127,:171,:190,:208,:232,:281,:323`(lookup·lookup-by-model-codes/names/model/code/label/label-bulk·fixed-discount-rate-bulk·expand) · `web/PriceHistoryInternalController.java:92 applicable-bulk`(`:93 @Transactional(readOnly = true)` 실측). 전부 조회 전용이 맞습니다. **문제는 같은 성격의 조회 전용 POST 를 다른 서비스에서는 총계에 넣었다는 점**입니다 — slip `web/SlipController.java:257 price-memory/bulk`, slip `web/SlipLookupController.java:60 expand-line`, partner `controller/PartnerInternalController.java:121,:140`, user `web/EmployeeController.java:97` 외 4건, auth `web/ApprovalLineAuthorizeController.java:34`, arologis parse-kakao·manual/preview. 매트릭스 스스로 *"A·D·F 는 상태 변경 없는 POST 를 포함(A 2건·F 4건)"* 이라 적었지만 **D(product)는 실제로는 11건을 뺐습니다** — 자기 진술과 반대입니다. 동일 기준을 적용하면 product 는 44 → **55**, 커버리지는 0/44 가 아니라 **0/55**.
- 🚩【초과 계상: partner-order +2 — 유령 2건】 gaps 의 partner-order '기록 안 됨 13건' 을 세면 HTTP 11 + 스케줄러 1 + 시더 1 이고, coverage 의 '부분 포함 16'(기록됨 5+부분 11)은 전부 HTTP 이므로 매트릭스 HTTP = 27. 그런데 실측은 25 이고, gaps 에 없는 실 endpoint 를 전수로 세면 정확히 14개뿐입니다 — edit-request 3(`editrequest/web/PartnerOrderEditRequestController.java:73,:100,:127`) · `revision/web/PartnerOrderRevisionController.java:151` · collab comments POST/DELETE/edits(`web/collab/PartnerOrderCollabController.java:101,:139,:165`) · `web/FrontEventLogController.java:38` · `web/PartnerOrderConfirmController.java:77` · `web/PartnerOrderDeleteController.java:36,:51` · `web/PartnerOrderDraftController.java:52` · `web/PartnerOrderEditController.java:40` · `web/PartnerOrderFromEstimateController.java:35`. **16 을 채울 항목이 실재하지 않습니다.**
- 🚩【구조적 결함 — 총계 580 은 항목 단위로 검증 불가능합니다】 gaps 배열은 '기록 안 됨 341 + 기록기만 144 = 485' 만 전건 나열하고, **'기록됨 42 + 부분 52 = 94건' 은 어디에도 항목으로 나열돼 있지 않습니다**. 그래서 저는 뺄셈으로만 대조할 수 있었고, 바로 위 partner-order +2 의 정체(어느 endpoint 두 개가 유령인지)를 끝내 특정하지 못했습니다. 다음 라운드에 넘길 요구사항: **기록됨·부분 94건도 같은 형식(서비스·METHOD 경로·좌표)으로 나열**해야 580 이 재현 가능합니다. 참고로 제가 실제로 줄 수를 센 세 구역(product 44 · inventory 39 · partner-order 13)은 선언된 개수와 정확히 일치했습니다 — 나열된 부분의 산수는 맞습니다.
- 【미명세: notification 스케줄러】 `services/notification-service/.../service/NotificationService.java:177 @Scheduled recoverPending` 은 30초 초과 PENDING 요청을 claim → 재발송 → complete 로 **상태를 바꾸는데** gaps 에 SCHEDULER 항목이 없습니다. 다만 총계는 13 HTTP + 시더 1 + 이 스케줄러 1 = 15 로 매트릭스와 맞으므로, '부분 4(발송 계열)' 안에 들어가 있을 가능성이 있습니다(실 발송 HTTP 는 `controller/NotificationAdminController.java:47,:84` + `controller/NotificationInternalController.java:52` = 3건뿐이라 4번째가 이 스케줄러여야 수가 맞습니다). **항목 미나열 때문에 확정 불가** — 위 항목과 같은 원인입니다.
- 🚩【축 자체가 빠짐: Flyway 마이그레이션 DML — 배포 시점의 무감사 데이터 변경】 매트릭스는 '마이그레이션이 선언한 감사 대상' 은 다뤘지만 **마이그레이션이 스스로 실행하는 데이터 변경**은 표면에 넣지 않았습니다. 실측: DML 포함 마이그레이션이 accounting 13/70 · auth **84/98** · product 9/34 · groupware 6/18 · slip 6/79 · arologis 5/25 · inventory 4/25 · user 3/12 · partner-order 2/17 · partner 1/14 · dc-config 1/5. 특히 auth-service 는 계정·권한 행을 직접 바꾸는 것이 6개 있고 그중 `db/migration/V44__assign_accounts_to_groups.sql`(헤더 원문: *"기존 활성 계정을 V43 기본 권한그룹에 1건씩 배속한다"*) 는 매트릭스가 🚩로 지목한 바로 그 축(그룹 배속 = 역할의 유일 근거)을 **전 계정 대상으로, 감사 테이블이 없는 서비스에서** 실행합니다. `V48__seed_driver_staff_dispatch_dev_accounts.sql` 도 같은 계열. product `db/migration/V31__soft_delete_test_seed_products.sql` 은 제품을 soft delete 합니다.
- 【축 자체가 빠짐: 서비스 밖 운영 스크립트】 `scripts/cleanup-loadtest-data.ps1` 이 DB 에 직접 DELETE 를 수행합니다(루트 `migration/`·`tools/` 는 DML 0건 — `migration/` 은 `decisions/` 문서뿐). 전수 범위를 `services/*/src/main/java` 로 잡아 이 경로가 빠졌습니다.
- 【제외가 정당하다고 내가 판정한 것 — 다만 근거가 매트릭스에 없음】 ①slip `publish/WarehouseMappingValidationService.java:49 @Scheduled` + `:43,:134 @EventListener` = readiness 판정·인메모리 매핑이라 slip DB 미변경 ②inventory `service/SafetyStockService.java:235 @Scheduled`(:236 `@Transactional(readOnly = true)` 실측 — 알림 발송만) ③partner-order `BootstrapCacheRefreshScheduler.java:43`(캐시). 셋 다 빼도 되지만 **매트릭스에 '세고 뺐다' 는 기록이 없어 '못 본 것' 과 구분되지 않습니다.** 다음 라운드에 '검토했으나 제외' 목록을 별도로 요구하십시오.
- 【보이지 않는 기록 경로가 없다는 매트릭스 주장은 내 실측과 일치】 Java 기반 Flyway 마이그레이션 0건(`find services -path '*db/migration*' -name '*.java'` = 0) · @KafkaListener/@RabbitListener/@SqsListener 0건 · 컨트롤러 레벨에서 `@GetMapping` 직후 쓰기 `@Transactional`(readOnly 아닌) 0건 · shared 모듈 매핑 0건. 따라서 '상태를 바꾸는 GET' 은 매트릭스가 손으로 찾은 3건(accounting 2 · inventory 1) 외에 기계적으로 더 찾을 방법이 없고, 이 축은 **잔여 위험으로 남습니다**(서비스 계층에서 저장하는 GET 은 전수 grep 으로 잡히지 않음).

### 적대검증 — "기록됨" 42건의 실제 호출 경로·트랜잭션 의미론·실 DB 행 대조 (컨트롤러→서비스→기록기 추적 + 시더/실사용 구분)

**판정** — 코드 경로 판정은 대체로 성립하나(23개 호출 지점 전수 추적 — 슬립·회계·주문·재고·서명·로그인 모두 실제 도메인 메서드 안에서 실행), **네 가지가 뒤집힙니다**. ①inventory 6건은 실 DB 0행이고 실사 9행이 전부 시더 최종상태 INSERT·창고 30행 modified 0 이라 '기록됨' 이 한 번도 실행된 적 없습니다(코드상 수치). ②partner-order 4행·slip 62행·slip_revisions 197행이 **전부 [DEV-SEED] actor** 라 '필드 단위 diff 가 실제로 돈다' 는 근거가 없고, slip 은 요약 문자열 계층만 존재합니다. ③inconsistency #13 은 방향이 반대입니다 — 기록기 5곳 전부 REQUIRED 전파에 호출자도 트랜잭션 안이라 감사 실패는 '조용한 유실' 이 아니라 **업무 mutation 동반 롤백**이며, TaxInvoiceService.java:193-200 주석이 이를 명시하는데 같은 파일 :218-220·WarehouseService.java:345·InventoryAuditService.java:430 이 정반대로 문서화돼 있습니다. ④조사에서 빠진 logging-service 가 **완성된 중앙 감사 싱크**(Rabbit→ES+DLQ+조회 API)인데 publish 하는 코드가 0건이고 로컬 compose 에 배포조차 안 돼 있어, PM 이 지적한 함정이 시스템 규모로 재현돼 있습니다. 추가로 '주입은 되지만 조건부 세터'(TaxInvoiceService.java:87-92) 와 'actor 오버로드가 도달 불가'(PartnerService.java:354 호출자 0) 라는 **grep 으로 안 잡히는 새 변종 2종**을 발견했습니다.

- 【추적한 표본 — 23개 호출 지점, 기록됨 42건의 코드 경로는 대부분 성립】 slip: SlipService.java:423(editHeader memo)·:558(applyOverlayPatch)·:634(협업 batch) / SlipUpdateService.java:142 / SalesSlipUpdateService.java:134 / SlipDeleteService.java:79 / SalesSlipDeleteService.java:83 / SlipSignatureService.java:126·:174·:314·:322·:397 / SlipPublishService.java:193·:287·:391 / slipRevisionService.capture 13곳. accounting: BankTransactionService.java:169·:298·:345 / CodefImportService.java:287 / DepositMatchService.java:168 / DepositorMappingService.java:528 / TaxInvoiceEmitService.java:181 / TaxInvoiceService.java:188·:216. partner-order: PartnerOrderDeleteService.java:84·:138 / PartnerOrderFromEstimateService.java:81 / PartnerOrderUpdateService.java:110·:159. inventory: WarehouseService.java:180·:203·:231·:290(→:353) / InventoryAuditService.java:169·:246·:294(→:428). user: EmployeeSignatureService.java:89·:117 / EmployeeProvisioningService.java:141. partner: PartnerService.java:389. partner-auth: PartnerAuthService.java:202·:217·:222·:227·:232·:243·:255. arologis: DispatchService.java:261. ⟹ 모두 실제 도메인 메서드 안에서 실행되며 '기록기만 선언' 유형은 아니다.
- 【🚩뒤집힘 1 — inventory 6건 '기록됨' 은 실동작 증거가 0이다】 매트릭스 openQuestion #15 가 미확인으로 남긴 값을 실측했습니다: inventory_audit_logs = **0행**. 원인은 코드 결함이 아니라 표본 0 — inventory_audits 9행이 전부 created_by='system', created_at='2026-05-12 09:00' 동일 타임스탬프(seed/InventoryAuditSeeder.java:78 산물)이고 COMPLETED 3·IN_PROGRESS 2·CANCELLED 1 이 **최종 status 로 직접 INSERT** 되어 start(:169)/complete(:246)/cancel(:294) 서비스 메서드를 지나지 않았습니다. 창고 쪽도 warehouses 30행 중 modified_at > created_at 인 행이 **0** — update/delete/restore/revert(:180/:203/:231/:290) 경로가 한 번도 밟히지 않았습니다. ⟹ inventory 커버리지 12.8% 는 **코드상 수치이며 실행으로 확인된 바 없음**으로 표기해야 합니다.
- 【🚩뒤집힘 2 — partner-order '필드 단위 diff 가 실제로 도는 유이한 곳' 이 DB 로 뒷받침되지 않는다】 partner_order_audit_logs 4행 실측 분포: field_name='DELETE' 2행 · 'RESTORE' 2행, actor_name 은 4행 모두 '[DEV-SEED] 개발마스터'. 즉 존재하는 행은 전부 **이벤트 마커이자 시더 산물**이고, 매트릭스가 근거로 든 PUT /{id}(PartnerOrderUpdateService.java:110)·협업 수정완료(:159)의 **필드 단위 old→new 행은 0행**입니다. '14개 서비스 중 기록됨 비율 최고(17.2%)' 라는 verdict 는 코드 판정일 뿐 실측이 아닙니다.
- 【🚩뒤집힘 3 — slip-service 의 audit 는 '요약 문자열 1행' 계층만 실재한다】 slip_audit_logs 62행 실측: field_name = SLIP_EDIT 53 · SLIP_DELETE 9, **62행 전부** actor_name='[DEV-SEED] 개발매니저'(changed_at 07-15~07-27). 매트릭스 inconsistency #10 이 '①필드 단위 old→new diff' 의 첫 예시로 든 slip audit/overlay(SlipService.java:423 memo · :558 overlay 필드 · :634 협업)의 행은 **0행**입니다. 같은 DB 에서 slip_revisions 197행도 전부 '[DEV-SEED]'(개발매니저 196·개발마스터 1), slip_publish_audit **0행**, slip_signature_audit **0행**. ⟹ '기록 계열이 6종으로 가장 두껍다' 는 verdict 중 실제 행이 존재하는 계열은 2종뿐이고 그마저 전량 시더입니다.
- 【🚩뒤집힘 4 — inconsistency #13 '감사 실패를 catch 로 삼켜 mutation 만 커밋된다' 는 구조적으로 반대다】 지목된 기록기 5곳이 전부 **REQUIRED 전파**입니다: InventoryAuditLogRecorder.java:50/:68 · PartnerAuditLogService.java:48/:67 · ArologisAuditLogRecorder.java:44/:55 · AccountingAuditLogService.java:54/:84 · PartnerOrderAuditLogService.java:77/:107 (모두 옵션 없는 @Transactional). 호출자도 전부 트랜잭션 안입니다 — WarehouseService.java:34(클래스) · InventoryAuditService.java:74(클래스) · TaxInvoiceService.java:66(클래스) · PartnerService.java:354(메서드). 참여 트랜잭션에서 RuntimeException 이 나면 스프링이 rollback-only 로 마킹하므로 호출자가 catch 해도 **커밋 시점 UnexpectedRollbackException 으로 도메인 mutation 까지 함께 롤백**됩니다. 코드 자신이 이를 명시합니다 — TaxInvoiceService.java:193-200 주석: *"audit 기록은 같은 트랜잭션(REQUIRED)이라 recordOverlayPatch 실패 시 tx 가 오염돼 커밋 시점에 거래처 교체까지 동반 롤백된다 … 즉 best-effort(감사만 누락·mutation 성공)가 아니다"*. 그런데 **같은 파일 :218-220** 의 recordIfChanged catch 주석은 정반대(*"graceful — audit 실패가 비즈니스 mutation 차단하지 않음"*)이고, WarehouseService.java:345 Javadoc(*"audit 실패는 graceful fallback (도메인 진행)"*)·InventoryAuditService.java:430(*"graceful fallback"*)도 같은 오해를 문서화합니다. ⟹ 실제 위험은 '감사만 조용히 유실' 이 아니라 **감사 실패가 정상 업무를 500 으로 되돌리면서 log.warn 만 남아 성공처럼 보이는 것**이며, openQuestion #9 의 선택지(원자 vs graceful)는 **이미 원자**라는 전제로 다시 써야 합니다.
- 【🚩누락 1 — 조사에서 빠진 15번째 서비스가 바로 중앙 감사 싱크다】 logging-service 가 14개 대상에 없는데, 그것이 완성된 중앙 sink 입니다: AuditLogConsumer.java:30 `@RabbitListener(queues="samhan.audit.queue")` → Elasticsearch `@Document(indexName="samhan-audit-logs")`(AuditLog.java:34), DLX/DLQ 배선(RabbitConfig.java:29-32), 조회 API 4종(AuditLogController.java — /logs/by-service, /logs/by-user, /logs/search, /logs/activity). ⟹ openQuestion #8('중앙화로 갈 것인가')은 선택지가 아니라 **이미 만들어 두고 아무도 안 쓰는 상태**이며, PM 이 지적한 '기록기 클래스는 있는데 호출자가 없다' 함정의 **시스템 규모 재현**입니다.
- 【🚩누락 2 — 그 싱크로 publish 하는 코드가 레포 전체에 0건이고, 로컬엔 배포조차 안 돼 있다】 `samhan.audit.exchange` 문자열이 logging-service 자기 RabbitConfig.java:29 밖에 없습니다(레포 전역 grep). 유일하게 살아 있는 producer 는 프런트입니다 — clients/desktop/src/renderer/components/AppLayout.tsx:413 → api/activityLog.ts:61 recordMenuAccess() → POST /logs/front → ActivityLogService.java:45-67 repository.save(). 그러나 이는 **MENU_ACCESS 화면 이동 기록**일 뿐 도메인 변경이 아닙니다. 게다가 infrastructure/docker-compose.local-all.yml 은 14 서비스+eureka+gateway 를 정의하면서 'logging' 문자열이 **0건**이고, 실행 컨테이너 목록에도 samhan-logging-service 가 **없습니다**(ES·RabbitMQ 는 기동 중). 반면 api-gateway/src/main/resources/application.yml:137-163 은 /api/logs/**, /logs/activity, /logs/front, /api/v1/audit-logs/front 를 lb://logging-service 로 라우팅합니다. ⟹ 개발 환경에서 프런트 감사 이벤트는 전량 유실되고 활동 로그 화면도 뜨지 않습니다(prod compose 에는 존재 — docker-compose.prod.yml:234).
- 【🚩PM 함정의 새 변종 A — 생성자 주입이 아니라 조건부 세터 주입】 TaxInvoiceService.auditRecorder 는 필드 주입이 아니라 `@Autowired(required=false)` **세터**(TaxInvoiceService.java:87-92)이고 모든 기록이 `if (auditRecorder != null)`(:165) 안에 있습니다. accounting-service 에 AuditLogRecorder 구현이 AccountingAuditLogService 하나뿐이라 실제로는 주입되며(실측: accounting_audit_logs 에 taxInvoice.description 2행, actor 00000000-...-0000) 판정 자체는 유지됩니다. 다만 **배선이 bean 존재 여부에 조건부**라 구현 클래스가 빠지거나 프로파일에서 제외되면 예외 없이 조용히 무기록으로 떨어집니다. PartnerService.java:62 도 동일 패턴이며, 이 유형은 grep 으로 '호출자 있음' 으로 보여 기존 조사 방식으로 잡히지 않습니다.
- 【🚩PM 함정의 새 변종 B — actor 를 받는 오버로드가 도달 불가 코드】 매트릭스는 partner-service 를 *"2-arg 오버로드가 actor 를 버림(PartnerService.java:343→:386-387)"* 이라 적었으나, 실제로는 **actor 를 받는 4-arg 오버로드(PartnerService.java:354)를 부르는 프로덕션 호출자가 0** 입니다. 유일한 컨트롤러 PartnerAdminController.java:203 이 2-arg(:343)를 호출하고 그것이 :344 에서 `updateProfile(partnerCode, req, null, null)` 로 넘깁니다. 결론('actor 항상 system')은 같지만 원인이 다르고, **컨트롤러 한 줄 변경으로 닫히는 최저비용 항목**입니다(API 계약 변경 불요 — openQuestion #6 의 대상이 아님).
- 【🚩actor 소실 목록에서 빠진 곳 — partner-order 협업 수정완료】 PartnerOrderUpdateService.java:157 이 `String actorName = "협업 수정완료";` 로 **하드코딩**합니다. actorId 는 parseActorId(actorUserId) 로 실제 UUID 가 들어가지만 UUID 화면 노출 금지 규칙상 사용자에게 보이는 값은 액션 라벨이라 **누가 했는지 화면에서 복구 불가**합니다. 매트릭스 inconsistency #12(actor 소실 8개 서비스)에 partner-order 가 빠져 있고, 하필 이 서비스가 '기록됨 비율 최고' 로 제시된 곳입니다.
- 【수치 정정 — accounting 은 '선언에 없는 것만 기록' 이 아니다】 accounting_audit_logs 50행 실측 분포: mapping.partnerCode 7·mapping.reason 7+3·partnerMatch.partner/source/reason 각 6·mapping.rawName 5+1·mapping.normalizedName 3+1·**taxInvoice.description 2**·action 1·matchSummary 1. TaxInvoice 는 V5 가 선언한 대상이므로 verdict 의 *"실제 기록되는 것은 선언에 없는 BankTransaction·DepositorMapping"* 은 불완전합니다 — 정확히는 **선언 3종 중 TaxInvoice 만 살아 있고 Journal·AccountingPeriod 가 0** 입니다. actor 분포는 a0000000-...-0001 이 48행, 00000000-...-0000(system sentinel)이 2행.
- 【통합 스키마 논의의 실제 제약 — accounting_audit_logs 에 entity_type 컬럼이 없다】 실측 컬럼: id, entity_id, revision_no, actor_id, actor_name, actor_color, field_name, old_value, new_value, changed_at + BaseEntity 7(created_at/by, modified_at/by, deleted_at/by, is_deleted). 도메인 구분이 **field_name 접두 문자열 관례**(`mapping.` · `partnerMatch.` · `taxInvoice.`)에만 의존합니다. openQuestion #8(공통 스키마 통일)을 논할 때 '엔티티 종류를 식별할 컬럼이 아예 없는 서비스가 있다' 는 사실이 전제로 들어가야 합니다.
- 【표본 0 vs 구조적 0 — 매트릭스는 arologis 하나만 분리했으나 실제로는 7개다】 **구조적 0(쓰기 호출자 0)** = dc_config_audit_logs · product_audit_logs · groupware_audit_logs · notification_audit_logs · user_audit_logs (전부 실측 0행, main 소스 전역 grep 재확인: NotificationAuditLogService·DcConfigAuditLogService·UserAuditLogService 는 자기 파일 밖 참조 0건, GroupwareAuditLog* 는 자기 패키지 내부뿐, ProductAuditLogService 는 읽기 전용 ProductAuditLogController.java:4/:33 뿐). **표본 0(경로 실재)** = inventory_audit_logs · slip_publish_audit · slip_signature_audit · employee_signature_audit · partner_audit_logs · arologis_audit_logs · **role_change_history**(EmployeeProvisioningService.java:141 에 쓰기 호출자 실재 — 매트릭스 서술에서 구조적 0 처럼 읽힘). 두 0 을 섞으면 배선 작업량이 과대 추정됩니다.
- 【유지되는 판정 — 반증 못 찾음】 ①auth_db 테이블 12개(account_groups, account_page_permissions, account_permission_overrides, accounts, approval_line_approver, approval_line_config, flyway_schema_history, group_page_permissions, password_reset_tokens, permission_groups, role_page_permission_templates, role_page_permissions)에 audit/history 계열 **없음** 재확인. ②arologis 쓰기 호출은 DispatchService.java:261 **1곳뿐**이고 ArologisAdminController.java:403 은 listByEntity 읽기임을 재확인. ③slip 상태전이 ship/deliver/confirm/cancel(SlipService.java:1377·1389·1397·1462)에 audit·revision capture 모두 없음 재확인(ship(id) 1-arg 오버로드는 callerId=null 까지 전달). ④partner-auth 로그인 시도 기록은 **견고함** — 실패 6분기가 예외를 던지지 않고 return 하므로(PartnerAuthService.java:202~238) @Transactional(:56) 커밋이 보장되어 실패 이력이 롤백되지 않습니다. 14개 서비스 중 유일하게 설계가 온전한 감사 경로입니다.

### 데이터 대조 (적대검증) — 매트릭스의 코드 기반 판정을 실 DB 행·발화 조건·호출 경로로 재현 검증. 측정 시각 2026-08-10 13:28~13:39 KST (samhan-postgres). 병렬 트랙 주의: 조사 시작 40초 전 samhan-product-service 재시작됨, auth_db 권한행 최종 수정이 같은 날 11:36.

**판정** — 매트릭스의 큰 골격은 데이터로 지지되나, 분자('기록됨 42')와 분모(485 구멍) 양쪽에 정정이 필요합니다. ■지지되는 것: 감사 테이블 16개 중 13개 0행 · logging_db 테이블 0개(중앙집계 부재 확정) · accounting 이 journals 2,571건을 두고 감사 0건인 반면 선언에 없는 depositor_map/bank_txn 만 기록 · 기록기만 존재 4종(product·user·notification·groupware)은 인터페이스 타입 주입까지 뒤져도 호출자 0 으로 확정 · 마이그레이션 선언≠구현. ■정정 1(과대): '기록됨 42' 는 실동작 근거가 없습니다. inventory 6건은 창고 30건 전건 modified_at NULL·실사 9건 전건 시더 직접 INSERT 로 **미발화**, user 3건은 서명 보유 직원 0명으로 **미발화**, partner-order 의 '필드 단위 diff 유이한 곳' 은 4행 전부 DELETE/RESTORE 마커에 EDIT revision 0건으로 **미입증**, slip 은 field_name 이 SLIP_EDIT/SLIP_DELETE 둘뿐이라 **필드 단위 diff 가 아예 없음**. 살아 있는 116행의 actor 는 사실상 전량 [DEV-SEED]·QA 라운드 태그(T8 live QA·codex-r4-985)입니다. ■정정 2(과소): groupware 는 0% 가 아닙니다 — DocumentTemplateService:78/:105/:122/:133 이 revision 을 실제로 남기고 document_template_revisions 에 111행이 실재하며, 이 테이블은 매트릭스 스키마 목록에서 누락됐습니다. ■정정 3(축 자체): 'actor 파라미터가 없어 API 계약 변경 필요'(openQuestion #6)는 상당수 과대입니다. shared/common JpaAuditingConfig 가 SecurityContext 로 전 BaseEntity 의 created_by/modified_by 를 자동 기입하며, dc_configs.modified_by 에 실명 kimmiseon 이 감사 배선 없이 남은 것이 증거입니다 — 실제 결손은 actor 가 아니라 **old value** 입니다. ■가장 중요한 신규 발견: **dc-config 가 485건 중 유일하게 확정된 배선 끊김**입니다. dc_configs 14행이 실제 수정됐고(12행 사용자 UUID, 2행 실명 kimmiseon, 2026-06-18) 그 필드가 home/commercial 할인율과 정액DC 40,000~50,000원인데 감사 0행 — 나머지 0행 대부분이 '표본 0' 인 것과 질이 다릅니다. 우선순위 1번은 여기여야 합니다. ■게이트 관점: 표본 0 은 '결함 0' 이 아니라 '판정 불가' 이므로, 485 를 그대로 목표 분모로 쓰면 안 됩니다. 또 @Autowired(required=false)+null 가드(PartnerService:58/:365, TaxInvoiceService:87/:165)는 bean 미등록 시 예외도 로그도 없이 감사를 건너뛰므로, 배선 후에도 '기록됨' 이 런타임 보장이 되려면 이 두 곳의 조용한 스킵을 먼저 닫아야 합니다.

- 【DB 실측 총괄 — 감사 테이블 16개 중 13개가 0행】 살아 있는 것은 3개뿐: accounting_audit_logs 50행(최종 2026-07-27 16:15) · slip_audit_logs 62행(최종 2026-07-27 12:43) · partner_order_audit_logs 4행(최종 2026-07-07 15:41). 합계 116행. 0행 = arologis_audit_logs · dc_config_audit_logs · groupware_audit_logs · inventory_audit_logs · notification_audit_logs · partner_audit_logs · product_audit_logs · user_audit_logs · role_change_history · employee_signature_audit · slip_publish_audit · slip_signature_audit · slip_line_correction_audits. 🚩3개 테이블 전부 최종 기록이 2026-07-27 이전 — 14일간 전 시스템 신규 감사 0행.
- 【확인 ✅ 중앙 집계 부재 — 매트릭스 주장보다 강하게 확정】 logging_db 는 존재하지만 public 스키마에 **테이블이 0개**(flyway_schema_history 조차 없음). 매트릭스의 '14개 서비스 전부 자기 DB, logging-service 전송 경로 0' 이 DB 측에서도 확정됩니다.
- 【확인 ✅ accounting — V5 선언 대상이 실제로 0건】 accounting_audit_logs 50행의 entity_id 를 실제 테이블에 조인한 결과: journals=0 · accounting_periods=0 · bank_depositor_partner_mapping=28 · bank_transaction=18 · tax_invoices=2. 반면 업무 볼륨은 journals 2,571행 · journal_lines 7,275행. ⟹ 분개 2,571건이 존재하는데 감사 0건으로, 매트릭스의 '선언 대상 Journal 0건, 실제 기록은 선언에 없는 BankTransaction·DepositorMapping' 이 데이터로 정확히 재현됩니다. 추가 발견: accounting_audit_logs 에는 **entity_type 컬럼 자체가 없어**(information_schema 전수: id·entity_id·revision_no·actor_id·actor_name·actor_color·field_name·old_value·new_value·changed_at + BaseEntity 7) 엔티티 종류는 field_name 접두(mapping./partnerMatch./taxInvoice.)로만 암묵 구분됩니다 — 타입 판별이 스키마가 아닌 문자열 관례에 의존.
- 【확인 ✅ 기록기만 존재 4종 — 인터페이스 타입 주입까지 확인해도 호출자 0】 전 서비스 grep(테스트 제외) 결과 ProductAuditLogService=선언 :44 + 읽기전용 컨트롤러 :4/:33 뿐 · NotificationAuditLogService=선언 :34 단 1건 · UserAuditLogService=선언 :37 단 1건 · GroupwareAuditLogRepository=선언 :13 단 1건. 🔑구상 클래스명 grep 이 놓칠 수 있는 **AuditLogRecorder 인터페이스 타입 주입**도 전수 확인했으나 주입 지점은 accounting TaxInvoiceService.java:87 과 partner PartnerService.java:58 **둘뿐**이라 위 4종은 미배선이 확정입니다. DB 도 전부 0행으로 일치.
- 🚩【신규 — 매트릭스 미발견 · 유일하게 확정된 '배선 끊김' 이며 금액 도메인】 dc_configs 259행 중 **14행이 실제로 수정되었는데** dc_config_audit_logs 는 0행입니다. 12행은 사용자 UUID 5ba352f4-77af-489e-aedd-2953a5c2d0dd 가 2026-06-18 01:06 에, **2행은 실명 계정 kimmiseon 이 2026-06-18 03:07** 에 수정(modified_at > created_at). 수정된 행이 보유한 값은 home_discount_rate 0.45~0.47 · commercial_discount_rate 0.45~0.48 · discount_360_amount 40,000~50,000원 — 전부 금액 직결 필드. ⟹ 다른 서비스의 0행과 달리 **표본 0 이 아니라 발화했는데 안 남은 것**이므로, 485건 중 우선순위 1번 근거는 dc-config 입니다.
- 🚩【신규 — 매트릭스 판정 반박: groupware 는 0% 가 아님】 매트릭스는 groupware 를 '기록됨 0/29 = 0%' 로 두고 문서양식 4개 동작을 '기록기만존재' 로 판정했으나, D:/dev/Samhan-Public/.claude/worktrees/wmain/services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentTemplateService.java 가 :78(create) · :105(update) · :122/:133(activate) 에서 `revisionService.ensureCurrentRevision(...)` 을 실제 호출하고, **document_template_revisions 에 111행이 실재**합니다(2026-07-21 3 · 07-22 7 · 07-23 30 · 07-28 71). 이 테이블은 매트릭스 inconsistency #9 의 '최소 11가지' 스키마 목록에도 누락돼 있습니다. groupware_audit_logs 가 0인 것은 맞지만 '문서양식 변경이 무기록' 은 데이터로 반박됩니다.
- 🚩【신규 — 매트릭스 판정 반박: slip_audit_logs 에 필드 단위 diff 가 없음】 매트릭스 inconsistency #10 은 기록 수준 ①층(필드 단위 old→new diff)의 예시로 'slip audit/overlay' 를 들었으나, slip_audit_logs 의 **distinct field_name 은 `SLIP_EDIT` 와 `SLIP_DELETE` 단 둘**이며 old_value/new_value 는 `slipNo=2026/07/27-8|slipType=OUTBOUND|status=...` 형태의 파이프 구분 요약 blob 입니다. 즉 slip_audit_logs 는 전량 ②층(요약 문자열 1행)이고 ①층 사례가 아닙니다. 실제 ①층은 accounting(mapping./partnerMatch. 접두로 필드 경로 보유)에서만 확인됩니다.
- 🚩【신규 — 매트릭스의 '최고 서비스' 판정 미입증】 매트릭스는 partner-order-service 를 '14개 서비스 중 기록됨 비율 최고 · 필드 단위 diff 가 실제로 도는 유이한 곳(PUT /{id}, 협업 수정완료)' 이라 했으나, partner_order_audit_logs 4행 전부가 field_name=`DELETE`/`RESTORE` **이벤트 마커**이고 동일한 단일 seed 주문(aa757a01-0000-4000-8000-000000009001)에 2026-07-07 하루치이며 actor 는 `[DEV-SEED] 개발마스터`. partner_order_revisions 도 CREATE 566 · DELETE 2 뿐으로 **EDIT revision 이 0건**입니다(partner_orders 599행 대비). ⟹ 필드 단위 diff 경로가 이 DB 에서 한 번도 산출물을 남긴 적이 없어, 해당 판정은 코드 독해이고 실동작 근거가 없습니다.
- 🚩【신규 — actor 결손이 계통적으로 과대 계상됨】 매트릭스는 'actor 파라미터 자체가 없어 배선 전에 API 계약 변경이 필요' 를 8개 서비스에 걸쳐 올렸고 openQuestion #6 으로 승인까지 요청했으나, D:/dev/Samhan-Public/.claude/worktrees/wmain/shared/common/src/main/java/com/samhanair/logis/common/audit/JpaAuditingConfig.java 의 `auditorProvider()` 가 SecurityContext 에서 principal 을 읽어 **전 서비스 모든 BaseEntity 의 created_by/modified_by 를 자동 기입**합니다(미인증 시 "system" 폴백). 데이터 증명: dc_configs.modified_by 에 실명 `kimmiseon` 과 사용자 UUID 가 감사 배선 없이도 남아 있고, price_history.created_by=00000000-0000-0000-0000-000000000001 도 동일. DocumentTemplateService 의 Javadoc(:66-67)도 *"created_by/modified_by 감사 필드는 JPA AuditorAware(SecurityContext) 가 채우므로 별도 actor 인자를 받지 않는다"* 라고 명시합니다. ⟹ 다수 항목에서 실제 결손은 'actor 가 없다' 가 아니라 **'변경 전 값(old value)이 없다'** 이며, API 계약 변경 없이도 닫을 수 있는 경로가 상당수입니다.
- 🚩【신규 — catch 삼킴보다 앞단의 실패 모드: null recorder 조용한 스킵】 매트릭스는 '감사 실패를 catch 로 삼키는 곳 5개' 를 지적했으나, 그보다 앞에 **`@Autowired(required = false)` + `if (auditRecorder != null)` 가드**가 있습니다 — PartnerService.java:58(필드)/:62(setter)/:365(가드), TaxInvoiceService.java:87/:90/:165. bean 이 등록되지 않으면 **예외도 로그도 없이 감사를 건너뛰고 도메인 mutation 만 커밋**되며, 주석이 스스로 *"단위 테스트(AuditLogRecorder bean 미등록 환경) 회귀 0 보장"* 이라 적어 테스트는 의도적으로 bean 없이 돕니다. ⟹ 이 두 경로는 테스트 green 과 무관하게 런타임 무기록이 가능하며, '기록됨' 판정의 런타임 보장 부재가 매트릭스 지적보다 한 층 더 깊습니다.
- ⚠️【매트릭스 openQuestion #15 에 대한 답 — inventory 는 '구멍' 이 아니라 '판정 불가'】 요청하신 미측정 항목을 실측했습니다: **inventory_audit_logs = 0행**. 그러나 발화 조건도 0입니다 — warehouses 30행이 **전건 modified_at NULL · is_deleted 전건 false**(전부 2026-05-22 07:51:55.435175 동일 타임스탬프의 벌크 임포트 산물)이라 update/delete/restore/revert 가 한 번도 실행된 적 없고, inventory_audits 9건은 **전부 시더가 2026-05-12 09:00:03~04 에 종단 상태(COMPLETED 3·PLANNED 3·IN_PROGRESS 2·CANCELLED 1)로 직접 INSERT**(created_by=system, modified_at == created_at 동일값)라 상태 전이가 서비스를 경유한 적이 없습니다. ⟹ 매트릭스의 inventory 12.8%(기록됨 6건)는 **코드 수치이며 실동작은 미검증**입니다. 부수 확인: 창고 30건이 전부 modified_at NULL 이라는 사실 자체가 '전량 ecount JDBC 우회 경로로 유입' 이라는 매트릭스의 비대칭 지적을 뒷받침합니다.
- ⚠️【표본 0 을 '구멍' 으로 세면 안 되는 곳 4개 — 매트릭스 분자·분모 양쪽 오염】 ①user employee_signature_audit=0 이지만 employees 100명 중 **signature_png 보유 0명 · signed_at 보유 0명** ⟹ user-service 의 유일한 '기록됨 3건' 주장은 확인 불가. ②slip_publish_audit=0 · slip_signature_audit=0 이지만 **delivery_batches=0행** ⟹ 공개 서명 경로 미발화. ③dashboard 14건 전건 — **app_release=0행 · app_notice=0행** ⟹ 변경 동작이 한 번도 없었음(매트릭스 openQuestion #3 의 포함/제외 판단 근거). ④auth 39건 — auth_db 는 12개 테이블에 감사 테이블이 정말 없지만(확정), 권한행 278건 수정의 modified_by 가 **전부 Flyway 마이그레이션 태그**(v88-partner-search-accountant 135 · migration:V92 10 · v97-accounting-slip-grant 6 등, 최종 2026-08-10 11:36) 이고 **사용자 주도 권한 변경은 0건** ⟹ 관리자 권한 API 미발화. 참고로 account_permission_overrides 는 0행입니다.
- ⚠️【살아 있는 116행의 출처가 거의 전부 시더·QA 산물】 slip_audit_logs 62행의 actor_name 은 **100% `[DEV-SEED] 개발매니저`**(actor_id a0000000-0000-0000-0000-000000000003 단일). slip_revisions(CREATE 137·EDIT 56·RESTORE 4)·estimate_revisions(47) 도 전량 `[DEV-SEED]`. partner_order_revisions CREATE 566행은 전건 2026-07-29 하루에 몰려 있고 actor_name 이 `T8 live QA` · `T8 R2 sweep` · `T8 R2 fixed DC priority` · `codex-r4-985` · `PM-verify` · `T1-recon-retry` — **QA 라운드 잔재**(feedback_qa_rounds_pollute_shared_data.md 패턴). accounting 50행 중 2행은 `[DEV-SEED]`/`SOL-947-...` 문자열 보유. ⟹ 실사용자 기인 감사행은 accounting 의 mapping/partnerMatch 46행(actor `사용자`·`SYSTEM MASTER`)이 사실상 전부이며, '기록됨 42건' 은 **실사용자 트래픽으로 검증된 바 없습니다**.
- 【참고 — 매트릭스 수치 중 대조 결과】 확인된 것: dc_configs 259행 ✅ · partners 7,314행 ✅ · partner_login_attempt 46행 ✅(2026-06-18~07-30) · price_calculation_logs 574행 ✅ · dispatch_sms_save_history 9행 ✅ · arologis_role_change_history 3행 ✅ · arologis_audit_logs 0행 ✅(dispatches 27건 존재하나 정차 상태 갱신 미발화이므로 매트릭스의 '표본 0' 단서가 옳음) · partner_order_audit_logs 4행 ✅. 어긋난 것: **products 는 2,655행이 아니라 3,063행**(2026-08-10 13:28 측정 — 조사 시작 40초 전 samhan-product-service 가 재시작돼 병렬 트랙 영향 가능, 측정 시각과 함께 읽어야 함). 또 매트릭스 스키마 목록(11종)에 누락된 실재 테이블: document_template_revisions(111행) · partner_credit_history(0행) · partner_order_front_event_log(173행) · dps_save_history(0행) · slip_cleanup_save_history(1행) · quote_snapshots(0행) · 각종 *_collab_suggestions.
- 【참고 — partner_audit_logs 0행은 단정 불가】 partner_revisions 에 EDIT 14행이 존재(최종 2026-05-30)하는데 partner_audit_logs 는 0입니다. 다만 PartnerService.java:365-371 의 감사 경로는 **name/address/phone 3필드만** 대상이고 값이 같으면 recordIfChanged 가 조기 return 하므로(:380-382), 그 14건이 다른 필드만 바꿨다면 0행이 정상입니다. ⟹ dc-config 와 달리 **배선 끊김인지 조건 미충족인지 데이터만으로 가릴 수 없어** 라이브 1회 실행이 필요합니다(실 경로로 거래처 이름을 바꿔 1행이 생기는지).

### logging-service 실태 적대검증 — compose·git 이력·의존성 그래프·실행 중 브로커/ES/Eureka 실측으로 "감사 기록이 logging-service 로 유실되고 있는가" 를 판정하고, POST /logs/front 호출 지점을 전수 확인

**판정** — 🚩 PM 가설 '기록됨 42건 중 일부가 실제로는 유실' 은 **기각**입니다 — 백엔드 14개 서비스는 logging-service 로 보낸 적이 없고, 보낼 수도 없습니다(`spring-boot-starter-amqp` 가 `services/logging-service/build.gradle:31` 단 한 곳, 루트 전역 선언 없음 ⟹ AMQP 가 다른 서비스 classpath 에 부재). 실행 중 RabbitMQ 에 `samhan.audit.exchange`/`samhan.audit.queue` 가 존재하지 않고, ES 인덱스는 0개이며 `samhan-audit-logs` 는 404 인데 `AuditLog.java:34` 가 `createIndex=true` 이므로 **이 서비스는 이 ES 에 한 번도 붙은 적이 없음**이 확정됩니다. compose 이력상 logging-service 는 **제거된 것이 아니라 로컬에 처음부터 없었고**(local-all 최초 커밋 `5ac044579` 2026-05-22 부터 부재, 헤더가 스스로 '14 Spring services' 라 명시), `docker-compose.prod.yml:232-265` 에만 2026-06-29(`579835efc`) 추가돼 로컬 기동 이력이 0입니다. 대신 **실제로 지금 유실되고 있는 것은 프런트 활동 로그 전량**입니다: 데스크톱 MENU_ACCESS 15개 메뉴(`AppLayout.tsx:413`, 실패는 `:420` console.warn 으로 삼킴) · 데스크톱 preload legacy(`samhanApi.ts:232`) · estimate-app(`code.js:2761`, 실패는 `:2771` Logger.log 로 삼킴) — 세 계열 모두 gateway `lb://logging-service` 미해결로 503 이며 **2026-05-05부터 97일간 단 한 건도 저장된 적이 없습니다**(호출자는 05-05부터, endpoint·route 는 06-28 신설이라 그 이전은 404). 도달 가능한 결함 1건 — 마스터·개발자 권한 보유자가 사이드바 '로그'(`/admin/activity-logs`)로 도달하는 화면이 영구 불능이며 에러 문구가 원인을 권한 문제로 오도합니다(auth_db 실측: 마스터·개발자 그룹 can_view=true + 계정 개별 부여 1건). 이 구멍의 직접 원인은 DEV-3 기획 문서의 '재사용 자산(**확인 완료**)' 절에 있던 **검증되지 않은 전제 2건**입니다 — *'각 서비스가 발행'*(발행자 0) 과 *'POST /logs/front 기존'*(같은 PR 에서 신설, `git show ce53292e1^` 로 확정). mock 이 두 endpoint 를 완전 구현(`mock.ts:2408,2436`)하고 CI 가 logging-service 테스트를 돌려(`ci.yml:63`) **코드·테스트·CI 어느 게이트도 미배포를 잡지 못합니다**. 부수로 `README.md:850`·`ROADMAP.md:856` 의 '운영' 표기, `README.md:850` 의 `logging_db` 표기, `README.md:148` 의 '월별 인덱스 롤링' 표기 3건이 코드·인프라 정의와 어긋나 정정이 필요합니다.

- 【핵심 답 · 🚩 유실 아님 — 애초에 보낸 적이 없다】 매트릭스의 '기록됨 42건 중 일부가 실제로는 유실' 가설은 **기각**합니다. `spring-boot-starter-amqp` 는 전 repo 에서 `services/logging-service/build.gradle:31` **단 한 곳**이고 루트 `build.gradle` 에 amqp/rabbit 전역 선언이 없습니다 ⟹ 나머지 13개 서비스는 AMQP 클래스가 classpath 에 **아예 없어 발행이 물리적으로 불가능**합니다. 전 repo `samhan.audit` grep = logging-service 자기 파일 + 문서뿐, `AuditLogEvent` 참조 = logging-service 내부 4곳뿐, `services/` 전체 `RabbitTemplate|convertAndSend` = 0건(Redis `convertAndSend` 는 `shared/realtime-abstraction/.../RedisRealtimeBroker.java:95` 의 realtime broker 로 감사와 무관). ⟹ 42건은 전부 각 서비스 자기 PostgreSQL 기록이며 logging-service 부재로 유실되는 것은 **0건**입니다. 매트릭스의 'logging-service 전송 경로 0' 은 참이고, 저는 이를 grep 부재가 아니라 **의존성 그래프 + 실행 중 브로커 상태**로 재확인했습니다.
- 【언제부터 없었는가 · 정답 = 제거된 적 없음, 로컬에는 처음부터 없었다】 `infrastructure/docker-compose.yml` 의 서비스 키는 postgres/redis/rabbitmq/elasticsearch/minio/prometheus/grafana/nginx 8개(앱 서비스 0). 로컬 풀스택 overlay `infrastructure/docker-compose.local-all.yml` 은 eureka+gateway+14 = 16개이고 logging-service 없음 — 파일 헤더 `:6` 이 스스로 *"adds Eureka, gateway, and the **14** Spring services"* 라 적었습니다. 최초 커밋 `5ac044579`(2026-05-22) 시점 파일도 `git show 5ac044579:infrastructure/docker-compose.local-all.yml` 로 확인한 결과 동일 16개이고 `logging` 문자열은 `LOGGING_FILE_PATH` 뿐입니다. `git log --all -S "logging-service" -- "*.yml"` = 5커밋이며 그중 compose 파일은 `579835efc`(2026-06-29 Phase 11 AWS 준비)가 **prod compose 에만** 추가한 1건. ⟹ `infrastructure/docker-compose.prod.yml:232-265` 에만 정의(container_name `samhan-logging-service`, 8082, ES/Rabbit/Eureka depends_on)되어 있고 **로컬에서 기동된 적이 한 번도 없습니다.**
- 【실행 상태 실측 — 4가지 독립 증거가 모두 '한 번도 붙은 적 없음' 으로 수렴】 ①`docker ps -a` = 14 service + gateway + eureka + infra, `samhan-logging-service` 0건(PM 실측 재현). ②Eureka `GET /eureka/apps` = **15개 등록**, LOGGING-SERVICE 없음 → gateway 의 `lb://logging-service` 가 인스턴스를 못 찾음. ③Elasticsearch `_cat/indices` = **인덱스 0개**, `GET /samhan-audit-logs` → **404**. `AuditLog.java:34` 가 `@Document(indexName="samhan-audit-logs", createIndex = true)` 이므로 서비스가 한 번이라도 이 ES 에 붙었으면 인덱스가 생성됐을 것 ⟹ **이 ES 에 붙은 적 없음**이 확정됩니다. ④RabbitMQ `rabbitmqctl list_queues` = 0건, `list_exchanges` = `amq.direct/topic/headers/fanout/rabbitmq.trace/match` 기본 6개뿐 ⟹ **`samhan.audit.exchange`·`samhan.audit.queue` 가 존재하지 않습니다**(선언 주체가 `RabbitConfig.java:29-32` 의 logging-service 뿐이므로 당연). 미인증 `POST /logs/front` 는 401(gateway JwtAuthentication 선행), 인증 후 503 — 원문은 `docs/qa/1075-s27-real-qa/user-spec.json:180` 의 `{"path":"/logs/front","status":503,"error":"Service Unavailable"}`.
- 【POST /logs/front 호출 지점 전수 — 3계열 + 조회 1계열】 ①`clients/desktop/src/renderer/api/activityLog.ts:62` `recordMenuAccess` → `POST /logs/front`. 유일 호출자는 `clients/desktop/src/renderer/components/AppLayout.tsx:413` 으로, 라우트 변경 시 1초 디바운스(`:178 MENU_ACCESS_DEBOUNCE_MS`) 후 발행하며 대상은 `ROUTE_PAGE_CODES`(`:179-194`) 14개 prefix + `pageCodeForPath:198` 의 `/`(dashboard.admin) = **메뉴 진입 15종 전량**. 실패는 `:420` `console.warn('[activity-log] 메뉴 접근 기록 실패')` 로 **조용히 삼킵니다**. ②`clients/desktop/src/preload/samhanApi.ts:232` `logFrontEvent` → `POST /api/v1/audit-logs/front` → gateway route `logging-front-legacy-v1`(`services/api-gateway/src/main/resources/application.yml:156-163`, `SetPath=/logs/front`). ③`clients/web/estimate-app/lib/code.js:2761` `logFrontEvent` → `AUDIT_LOG_URL`(`:70` = `${BASE_URL}/api/v1/audit-logs/front`) → 같은 경로, 호출 지점은 `clients/web/estimate-app/views/index.ejs:14598`, 실패는 `:2771` `Logger.log('[logFrontEvent] audit-log 전송 실패 (무시)')` 로 삼킴. ④(조회) `clients/desktop/src/renderer/api/activityLog.ts:55` `fetchActivityLogs` → `GET /logs/activity`, 소비처 `clients/desktop/src/renderer/routes/admin/ActivityLogPage.tsx:80-83`. ⚠️**오인 주의**: `clients/web/order-app/src/samhanApi.ts:324` 의 동명 `logFrontEvent` 는 logging-service 가 아니라 `/partner-orders/log`(`services/partner-order-service/.../FrontEventLogController.java:25`)로 가며 **정상 동작 중**입니다 — `partner_order_front_event_log` **173행 실측(2026-06-18~2026-07-30)**.
- 【🚩 도달 가능한 결함 — '로그' 메뉴 화면이 영구 불능】 사이드바 항목은 `AppLayout.tsx:1467-1473`(`/admin/activity-logs`, `data-testid="sidebar-dev-activity-log"`)이고 노출 조건은 `:580` `dynamicCanAccess('dev.activity-log','view')` 입니다. auth_db 실측 결과 `group_page_permissions` 에서 **마스터·개발자** 두 그룹이 `dev.activity-log` can_view=true, `account_page_permissions` 에 개별 부여 1건 ⟹ **실 사용자가 실제로 도달 가능한 화면**입니다. 도달하면 `ActivityLogPage.tsx:88-90` 이 `'활동 로그를 불러오지 못했습니다(권한 또는 서버 오류).'` 를 띄우는데, 실제 원인은 권한도 서버 오류도 아닌 **서비스 미배포**라 운영자를 권한 문제로 오도합니다. product-service 의 `GET /products/{id}/audit-logs` 가 '영원히 빈 목록' 인 것과 같은 계열이되, 이쪽은 빈 목록조차 아니고 **에러 화면**입니다.
- 【🚩 증거 무결성 — DEV-3 기획 문서의 '확인 완료' 전제 2건이 거짓이었고 그것이 이 구멍의 직접 원인】 `docs/dev-reports/2026-06-28-dev-menu-dev3-logs.md` 의 `## 재사용 자산 (확인 완료)` 절에서, ①`:11` *"RabbitMQ samhan.audit.exchange + AuditLogEvent 와이어 포맷 — **각 서비스가 발행**, logging-service 소비→ES"* → 발행자는 처음부터 0이고 amqp 의존성이 logging-service 에만 있어 **발행 자체가 불가능**했습니다. ②`:12` *"POST /logs/front — FE 프론트 이벤트 수집 엔드포인트(**기존**) → MENU_ACCESS 발행 재사용"* → **기존이 아닙니다**. `git show ce53292e1^:services/logging-service/.../AuditLogController.java` 에는 `@GetMapping` 3개(`/by-service/{serviceName}`·`/by-user/{userId}`·`/search`)뿐이고 POST `/front` 는 없습니다. `git log -S "collectFrontEvent"` 와 `-S "logging-activity-dev-menu"`, `-S "logging-front-legacy-v1"` 이 **모두 ce53292e1(2026-06-28) 단독** ⟹ endpoint·gateway route 2종이 그 PR 에서 **신설**됐습니다. ③`:4` *"신규 인프라 0 — logging-service 자산 재사용"* — 재사용하려던 자산이 **배포된 적 없는 서비스**였습니다. 같은 문서 `:43` 은 *"Docker 라이브 QA(mock OFF)"* 를 계획에 넣었으나 `docs/qa/dev-menu-dev3/` 에는 스크린샷 3장(png)만 있고 **보고서 md 가 없습니다**(mock OFF 여부 확인 불가).
- 【🚩 2026-05-05부터 오늘까지 97일, legacy 프런트 감사 로그는 단 한 건도 저장된 적이 없다】 `/api/v1/audit-logs/front` 호출자(`clients/desktop/src/preload/samhanApi.ts`, `clients/web/estimate-app/lib/code.js`)는 `git log -S "audit-logs/front"` 기준 `98e7ecf75`·`040e52e8b`(**2026-05-05**)부터 존재합니다. 그런데 그 경로의 gateway route 와 백엔드 handler 는 **2026-06-28(ce53292e1)** 에야 생겼습니다. ⟹ 2026-05-05~06-28 = route·handler 부재로 404, 2026-06-28~오늘 = 인스턴스 부재로 503. **양 구간 모두 catch 로 삼켜** 사용자·운영자에게 한 번도 표면화되지 않았습니다.
- 【mock 이 실태를 덮고 CI 도 green — 메모리 feedback_mock_gate_leaks_to_real_api 계열】 `clients/desktop/src/renderer/api/mock.ts:2408` 이 `GET /logs/activity` 를 필터·페이징까지 완전 구현하고, `:2436` 이 `POST /logs/front` 및 `/api/v1/audit-logs/front` 를 받아 `MOCK_ACTIVITY_LOGS` 에 적재합니다. `clients/desktop/src/renderer/api/client.ts:63-70` 은 `VITE_MOCK_MODE=1` 일 때만 mock 어댑터를 거치므로 **mock 모드 테스트·Playwright 는 green, 실서버는 503**. 여기에 `.github/workflows/ci.yml:63` 이 `:services:logging-service:test` 를 정상 실행하므로 **CI 도 green** — 코드·테스트·CI 어느 게이트도 '배포 안 됨' 을 잡지 못합니다.
- 【문서 상태 표기 3건이 사실과 다름 — 증거 무결성 축】 ①`README.md:850` `| logging-service | 8082 | logging_db | RabbitMQ → Elasticsearch | Phase 1 (운영) |` — `logging_db` 는 오류입니다. `services/logging-service/src/main/resources/application.yml:16-22` 가 DataSource/HibernateJpa/JpaRepositories autoconfig 를 **명시 exclude** 하고, `infrastructure/terraform/templates/init-rds.sql:6` 이 *"logging-service: ES + RabbitMQ 전용(PostgreSQL 미사용) → logging_db 제외"* 라 적었습니다(로컬 `infrastructure/postgres/init/01-create-databases.sql:12` 은 여전히 logging_db 를 만들지만 아무도 쓰지 않습니다). `운영` 도 오류 — 로컬 미배포·ES 인덱스 0·producer 0. ②`ROADMAP.md:856` `| services/logging-service | 1 | 운영 |` 동일 오류. ③`README.md:148` *"감사로그(@Document, **월별 인덱스 롤링**)"* — `AuditLog.java:20-26` 이 스스로 *"SpEL 월별 인덱스명은 Spring Data ES 5.x 가 깔끔히 지원하지 않으므로 고정 인덱스 samhan-audit-logs 를 쓰고 월별 롤링은 **나중에** ILM/alias 로 처리"* 라 적었습니다 ⟹ **미구현 기능을 구현된 것으로 표기**.
- 【매트릭스 분모 보정 필요 — 유일하게 실제로 유실 중인 감사 표면이 580 에도 485 에도 없다】 매트릭스는 14개 업무 서비스만 세었고 logging-service 자체 표면은 세지 않았습니다. 그러나 **실제로 지금 데이터가 사라지고 있는 유일한 경로가 바로 여기**입니다: `POST /logs/front`(호출 계열 3종) · `GET /logs/activity` · gateway `/api/logs/**`(`application.yml:136-147`, MASTER/MANAGER 전용 — 다만 clients 전수 grep 결과 이 경로를 부르는 프런트 지점은 **0건**이라 사용자 영향 없음) · `GET /logs/by-service|/by-user|/search`. openQuestions 의 '분모를 무엇으로 할 것인가' 에 **프런트 활동 로그 표면**을 항목으로 추가하시기를 권합니다. 아울러 openQuestions 의 '저장 위치 — 자기 DB vs logging-service 중앙화' 논의는 **중앙화 선택지가 사실상 신규 구축**임을 전제로 해야 합니다(기록기·소비자·ES 매핑은 완성돼 있으나 **발행자 0 · 로컬 배포 0 · 인덱스 0**).
- 【조용히 실패하는 것 정리】 (a) 유실 중 — 데스크톱 MENU_ACCESS 15개 메뉴, 데스크톱 preload legacy logFrontEvent, estimate-app logFrontEvent. **셋 다 catch 로 삼켜** 알림이 없습니다. (b) 불능 — '로그' 메뉴 화면(마스터·개발자 도달 가능, 오도성 에러 메시지). (c) **영향 없음** — 백엔드 14개 서비스의 자기 DB 감사 기록 42건은 logging-service 와 배선 자체가 없어 무관합니다. (d) 부수 관찰 — `partner_order_front_event_log` 의 최신 행이 2026-07-30 으로 11일째 멈춰 있습니다. order-app 미사용일 가능성이 높아 결함으로 세지 않았으나, 이 경로를 살아 있는 대조군으로 쓰려면 발화 조건 카운트가 필요합니다.
- 【검증 범위의 한계 — 정직 보고】 제가 실측한 것은 **이 PC 의 로컬 스택 + 저장소 코드/이력**입니다. 프로덕션(AWS) 배포 상태는 여기서 확인할 수 없습니다. 다만 **발행자 부재(F: amqp 의존성이 logging-service 에만 존재)는 환경 독립적인 코드 수준 결론**이므로, 설령 프로덕션에서 logging-service 가 기동 중이더라도 **백엔드 감사 이벤트는 어느 환경에서도 그곳에 도달하지 않습니다**. 프런트 `/logs/front` 만이 환경에 따라 성공할 여지가 있습니다.

---

# 감사 로그 전수조사 — 개발책임자 보고서 및 슬라이스 제안

> 조사 범위: 14개 업무 서비스 + logging-service · 매트릭스(6군) + 적대검증 4각도 + PM 재검증
> PM 재검증 실측 시각: **2026-08-10 (본 세션, `docker exec samhan-postgres psql` 직접 조회 · 워크트리 `D:/dev/Samhan-Public/.claude/worktrees/wmain` origin/main 기준)**
> 병렬 트랙 주의: 같은 DB 를 다른 트랙이 쓰고 있습니다. 아래 행 수는 **측정 시각과 함께** 읽으십시오.

---

## 1. 한 줄 결론

**성립하지 않습니다. 그리고 "얼마나 성립하는가" 라는 질문 자체가 아직 답할 수 없는 상태입니다.**

- 코드 기준으로 변경 동작 **약 580~599건 중 기록되는 것은 42건(7%)** 이고, 그중에서도 **실사용자 트래픽으로 기록이 남은 것이 확인된 서비스는 accounting 하나뿐**입니다(46행).
- 나머지 "기록됨" 판정 대부분은 **DB 실측 0행**이며, 원인이 두 가지로 갈립니다 — **배선이 없어서 0**(구조적 0)과 **그 동작을 아무도 안 밟아서 0**(표본 0). **표본 0 은 "결함 0" 이 아니라 "판정 불가"** 입니다.
- 485건(기록 안 됨 341 + 기록기만 존재 144)이라는 구멍 숫자는 **그대로 목표 분모로 쓰면 안 됩니다.** 적대검증에서 최소 7건 누락 · 2건 유령 · 11건 분모 비일관 · 축 2개(Flyway DML · 프런트 활동로그) 통째 누락이 확인됐습니다.
- 🚨 **가장 중요한 것**: 지금 배선을 늘리면 **업무 동작이 깨질 수 있습니다.** 현행 기록기 5곳이 전부 `REQUIRED` 전파라 감사 실패가 업무 mutation 을 **동반 롤백**시킵니다. 이 의미론을 먼저 확정하지 않고 485건을 배선하면 **485개의 새 장애 표면**이 생깁니다.

---

## 2. 🚨 적대검증이 뒤집은 것 (매트릭스 판정 정정)

매트릭스 원문보다 **적대검증 결과를 우선**합니다. PM 이 직접 재확인한 것은 ✅ 로 표시합니다.

### 2-1. 뒤집힘 — 확정

| # | 매트릭스 주장 | 실제 | PM 재확인 |
|---|---|---|---|
| **T1** | inventory "기록됨 6/47 = 12.8%" | **실동작 증거 0.** `inventory_audit_logs` **0행** · `warehouses` 30행 전건 `modified_at` NULL(=update/delete/restore/revert 미발화) · `inventory_audits` 9건 전부 시더가 종단 상태로 직접 INSERT | ✅ 실측: `count(*)=0`, warehouses `total 30 / has_modified 0 / deleted 0` |
| **T2** | slip audit 이 "필드 단위 old→new diff" 계층의 예시 | **아님.** `slip_audit_logs` 의 distinct `field_name` 은 **`SLIP_EDIT` 53 · `SLIP_DELETE` 9 둘뿐**이고 값은 파이프 구분 요약 blob. 즉 전량 "요약 문자열 1행" 계층 | ✅ 실측: 62행 · field_name 2종 · **actor_name 100% `[DEV-SEED] 개발매니저`** · 최종 2026-07-27 12:43:37 |
| **T3** | partner-order "기록됨 비율 최고 · 필드 단위 diff 가 실제로 도는 유이한 곳" | **미입증.** `partner_order_audit_logs` 4행이 전부 `DELETE`/`RESTORE` 이벤트 마커 + `[DEV-SEED] 개발마스터` · `partner_order_revisions` 는 CREATE 566 · DELETE 2 로 **EDIT revision 0건**(partner_orders 599행 대비) | 두 각도 독립 일치 |
| **T4** | groupware "기록됨 0/29 = 0%" | **0% 아님.** `DocumentTemplateService.java:78/:105/:122/:133` 이 `revisionService.ensureCurrentRevision(...)` 를 실제 호출하고 **`document_template_revisions` 111행 실재**. 이 테이블은 매트릭스 스키마 목록(11종)에서도 누락 | ✅ 실측: `document_template_revisions=111`, `groupware_audit_logs=0` |
| **T5** | inconsistency #13 "감사 실패를 catch 로 삼켜 mutation 만 커밋" | **방향이 반대.** 기록기 5곳(`InventoryAuditLogRecorder:50/:68`·`PartnerAuditLogService:48/:67`·`ArologisAuditLogRecorder:44/:55`·`AccountingAuditLogService:54/:84`·`PartnerOrderAuditLogService:77/:107`)이 전부 옵션 없는 `@Transactional`(REQUIRED)이고 호출자도 트랜잭션 안 ⟹ 참여 트랜잭션 예외는 rollback-only 마킹 → 커밋 시점 `UnexpectedRollbackException` 으로 **업무 mutation 동반 롤백** | ✅ 원문 확인 — `TaxInvoiceService.java:192-200` 주석: *"audit 기록은 같은 트랜잭션(REQUIRED)이라 … 커밋 시점에 거래처 교체까지 동반 롤백된다 … 즉 best-effort 가 아니다"* |
| **T6** | (PM 가설) "기록됨 42건 중 일부가 logging-service 로 유실" | **기각.** `spring-boot-starter-amqp` 는 `services/logging-service/build.gradle:31` **단 한 곳**이고 루트 전역 선언 없음 ⟹ 다른 13개 서비스는 AMQP 가 classpath 에 없어 **발행이 물리적으로 불가능**. 유실 0건 | ✅ 실측: repo 전체 `build.gradle` grep 결과 amqp 선언 1건 |

### 2-2. 뒤집힘 — 문서가 자기모순이라 "재판정 필요"로 남김

**T5 의 확정 범위 주의.** 같은 파일 안에 정반대 주석이 공존합니다:

- `TaxInvoiceService.java:192-200` → *"원자 처리 … best-effort 가 아니다"*
- `TaxInvoiceService.java:218-220` → *"graceful — audit 실패가 비즈니스 mutation 차단하지 않음"* ✅ PM 원문 확인
- `WarehouseService.java:345` Javadoc → *"audit 실패는 graceful fallback (도메인 진행)"*
- `InventoryAuditService.java:430` → *"graceful fallback"*

⟹ **코드 의미론은 원자(rollback)일 가능성이 높으나, 예외 발생 지점(프록시 진입 전/후)에 따라 갈립니다.** 이것은 **RED 테스트로 고정해야 확정**되는 항목이며, 지금 "graceful 이다/원자다" 중 어느 쪽으로도 단정하지 않습니다. → 슬라이스 **S-D**.

### 2-3. 과대 계상 — 축소 필요

| # | 매트릭스 | 정정 |
|---|---|---|
| **T7** | openQuestion #6 "actor 파라미터가 없어 **API 계약 변경 필요**" (8개 서비스) | **상당수 과대.** `shared/common/.../audit/JpaAuditingConfig.java` 의 `auditorProvider()` 가 SecurityContext 로 전 BaseEntity 의 `created_by`/`modified_by` 를 자동 기입. 증거: `dc_configs.modified_by` 에 **실명 `kimmiseon`** 이 감사 배선 없이 남아 있음(✅ PM 실측). `DocumentTemplateService.java:66-67` Javadoc 도 이를 명시. ⟹ 실제 결손은 actor 가 아니라 **old value** 인 경로가 다수 |
| **T8** | partner-service "2-arg 오버로드가 actor 를 버림(:343→:386-387)" | 결론은 같으나 **원인이 다름**: actor 를 받는 4-arg 오버로드(`PartnerService.java:354`)를 부르는 **프로덕션 호출자가 0**. 유일 컨트롤러 `PartnerAdminController.java:203` 이 2-arg 를 호출하고 `:344` 가 `(partnerCode, req, null, null)` 로 넘김 ⟹ **컨트롤러 한 줄로 닫힘, API 계약 변경 불요** | ✅ PM 재확인 (grep 원문 위 참조) |

### 2-4. 과소 계상 — 목록에 없는 것

| # | 누락 | 좌표 |
|---|---|---|
| **T9** | slip-service **dev 시더 4건**(매트릭스는 "slip 시더 0" 이라 적음). `SlipLockSeeder` 는 CONFIRMED 전표에 `slip.lock()` 을 걸어 **마감 lock 상태를 변경** | `seed/SlipSeeder.java:72` · `EstimateSeeder.java:55` · `DeliveryBatchSeeder.java:54` · `SlipLockSeeder.java:43` ✅ PM 확인(디렉터리 전수: 6파일 중 시더 4) |
| **T10** | partner-order **DB 변경 스케줄러 2건**. `DraftCleanupScheduler` 는 30일 TTL 임시저장 **soft delete** | `scheduler/DraftCleanupScheduler.java:24` · `scheduler/SlipPublishOutboxScheduler.java:76` |
| **T11** | inventory `POST /inventory/instances/ship-batch` — RESERVED→SHIPPED 실 상태 전이인데 **목록에 아예 없음**. 형제 6개는 전부 나열됨 | `web/StockInstanceController.java:151` → `service/StockInstanceService.java:216`. ✅ PM 확인: **`StockInstanceService.java` 전체 `audit` grep 0건** ⟹ 판정 = 기록 안 됨 ⟹ **341 → 최소 342** |
| **T12** | inventory 미명세 2건 · notification 스케줄러 1건 | `web/DpsCompareController.java:72` · `web/StockController.java:115` · `NotificationService.java:177 @Scheduled recoverPending` |
| **T13** | **축 자체 누락 ① — Flyway DML.** 배포 시점에 마이그레이션이 직접 데이터를 바꿉니다. auth-service 는 **98개 중 84개가 DML** 이고 그중 6개가 계정·권한 행 직접 변경 | `services/auth-service/.../db/migration/V44__assign_accounts_to_groups.sql`(전 활성 계정을 권한그룹에 배속 — 매트릭스가 🚩로 지목한 바로 그 축) · `V48__seed_driver_staff_dispatch_dev_accounts.sql` · product `V31__soft_delete_test_seed_products.sql` |
| **T14** | **축 자체 누락 ② — 프런트 활동 로그 표면.** 매트릭스 580 에도 485 에도 없는데, **실제로 지금 데이터가 사라지고 있는 유일한 경로** | 아래 2-5 |
| **T15** | 서비스 밖 운영 스크립트 | `scripts/cleanup-loadtest-data.ps1` (DB 직접 DELETE) |

### 2-5. 🚩 실제로 지금 유실 중인 것 — logging-service (매트릭스 범위 밖)

백엔드 42건은 유실이 **아닙니다**(T6). 대신:

- **`POST /logs/front` 호출 3계열이 전부 503 으로 사라지고 있습니다.**
  - `clients/desktop/src/renderer/api/activityLog.ts:62` ← `components/AppLayout.tsx:413` (메뉴 진입 **15종 전량** MENU_ACCESS). 실패는 `:420` `console.warn` 으로 **조용히 삼킴**
  - `clients/desktop/src/preload/samhanApi.ts:232` → `/api/v1/audit-logs/front`
  - `clients/web/estimate-app/lib/code.js:2761` (`views/index.ejs:14598`). 실패는 `:2771` `Logger.log('… 전송 실패 (무시)')` 로 삼킴
- **기간: 2026-05-05 ~ 오늘 = 97일간 단 한 건도 저장된 적 없음.** 호출자는 05-05(`98e7ecf75`)부터, endpoint·gateway route 는 **06-28(`ce53292e1`)에야 신설** ⟹ 그 이전 404, 이후 503.
- **실행 상태 4중 확인**: `docker ps -a` 에 `samhan-logging-service` **0건**(✅ PM 재확인) · Eureka 15개 등록 중 LOGGING-SERVICE 없음 · ES 인덱스 **0개**(`AuditLog.java:34` 가 `createIndex=true` 이므로 **한 번도 붙은 적 없음**이 확정) · RabbitMQ 에 `samhan.audit.exchange`/`.queue` **부재**.
- **제거된 것이 아니라 로컬에 처음부터 없었습니다** — `infrastructure/docker-compose.local-all.yml:6` 헤더가 스스로 *"the **14** Spring services"* 라 적었고, 최초 커밋 `5ac044579`(2026-05-22)부터 동일. `docker-compose.prod.yml:232-265` 에만 2026-06-29(`579835efc`) 추가.
- 🚩 **도달 가능한 결함 1건**: 사이드바 '로그'(`AppLayout.tsx:1467-1473`, `/admin/activity-logs`)가 `dev.activity-log:view` 로 노출되고 **auth_db 실측상 마스터·개발자 그룹 can_view=true + 계정 개별 부여 1건** ⟹ 실사용자 도달 가능. 도달하면 `ActivityLogPage.tsx:88-90` 이 *"활동 로그를 불러오지 못했습니다(권한 또는 서버 오류)."* 를 띄우는데 실제 원인은 **서비스 미배포**라 운영자를 권한 문제로 오도합니다.
- **원인 = 기획 문서의 미검증 전제 2건**: `docs/dev-reports/2026-06-28-dev-menu-dev3-logs.md` 의 `## 재사용 자산 (확인 완료)` 절 — `:11` *"각 서비스가 발행"*(발행자 0, 물리적 불가) · `:12` *"POST /logs/front — 기존"*(같은 PR 에서 신설, `git show ce53292e1^` 로 확정).
- **mock 과 CI 가 이를 덮습니다**: `renderer/api/mock.ts:2408/:2436` 이 두 endpoint 를 완전 구현 · `.github/workflows/ci.yml:63` 이 logging-service 테스트를 정상 실행 ⟹ **코드·테스트·CI 어느 게이트도 미배포를 잡지 못함**.

⚠️ **정직 고지**: 위는 **이 PC 로컬 스택 + 저장소 이력** 실측입니다. 프로덕션(AWS) 배포 상태는 확인 불가. 다만 **발행자 부재는 환경 독립적인 코드 수준 결론**이므로, 프로덕션에서 logging-service 가 떠 있어도 **백엔드 감사 이벤트는 어느 환경에서도 도달하지 않습니다.**

### 2-6. 🚩 유일하게 확정된 "배선 끊김" — dc-config

다른 0행은 대부분 표본 0이지만, **dc-config 는 발화했는데 안 남았습니다.**

```
✅ PM 재실측 (2026-08-10, dc_config_db)
dc_config_audit_logs                                   =   0 행
dc_configs 총                                          = 259 행
dc_configs 중 실제 수정(modified_at <> created_at)     =  14 행
  ├ 5ba352f4-77af-489e-aedd-2953a5c2d0dd  12행  2026-06-18 01:06:29 ~ 01:06:30
  └ kimmiseon (실명 계정)                  2행  2026-06-18 03:07:09
```

수정된 행이 보유한 값은 `home_discount_rate` 0.45~0.47 · `commercial_discount_rate` 0.45~0.48 · `discount_360_amount` 40,000~50,000원 — **전부 금액 직결**. 기록기(`audit/service/DcConfigAuditLogService.java:31`)는 완성돼 있고 전 서비스 grep 결과 **자기 선언줄 외 참조 0**. ⟹ **우선순위 1번 근거는 여기입니다.**

### 2-7. grep 으로 안 잡히는 새 변종 2종

| 변종 | 내용 | 좌표 |
|---|---|---|
| **A. 조건부 세터 주입 + null 가드** | `@Autowired(required=false)` **세터** + `if (recorder != null)` ⟹ bean 미등록 시 **예외도 로그도 없이 감사만 건너뛰고 mutation 커밋**. 주석이 스스로 *"단위 테스트(AuditLogRecorder bean 미등록 환경) 회귀 0 보장"* 이라 적어 **테스트는 의도적으로 bean 없이 돕니다** | `TaxInvoiceService.java:87-92/:165` · `PartnerService.java:58/:62/:365` |
| **B. actor 오버로드가 도달 불가 코드** | grep 상 "호출자 있음" 으로 보이지만 프로덕션 경로가 안 지남 | `PartnerService.java:354` (호출자 0) ✅ PM 재확인 |

⟹ **PM 이 제시한 "기록기 클래스가 있다 ≠ 기록된다" 함정의 상위 버전**입니다. 다음 라운드부터 판정 기준을 **"호출자 존재"** 가 아니라 **"프로덕션 경로에서 도달 + bean 실제 주입 + DB 행 발생"** 3단으로 올려야 합니다.

---

## 3. 서비스별 커버리지 표

⚠️ **분모 주의**: 매트릭스 ops 는 "변경 매핑 표면" 기준이고 군마다 세는 기준이 달랐습니다. 적대검증 실측 HTTP 는 별도 열로 둡니다.

| 서비스 | ops(매트릭스) | 실측 HTTP(적대검증) | 기록됨 | 부분 | 기록기만 | 코드 커버리지 | **DB 실측 행수** | 판정 |
|---|---:|---:|---:|---:|---:|---|---|---|
| slip-service | 142 | 135 ✅일치 | 20 | 9 | 0 | 14.1% | `slip_audit_logs` **62**(전량 `[DEV-SEED]`) · `slip_revisions` 197(전량 DEV-SEED) · `slip_publish_audit` **0** · `slip_signature_audit` **0** | ⚠️ **요약 1행 계층만 실재** · 시더 4건 목록 누락(T9) |
| accounting-service | 100 | 97 ✅일치 | 7 | 5 | 0 | 7.0% | `accounting_audit_logs` **50** (mapping 28 · bank_txn 18 · **taxInvoice 2** · journals **0** · periods **0**) | ✅ **유일하게 실사용자 기인 기록 확인**(46행) · V5 선언 3종 중 2종 0건 |
| partner-order-service | 29 | 25 (**−2 유령**) | 5 | 11 | 0 | 17.2% | `partner_order_audit_logs` **4**(전부 DELETE/RESTORE 마커·DEV-SEED) · `revisions` CREATE 566/DELETE 2, **EDIT 0** | 🚩 **T3 뒤집힘 — "최고" 판정 미입증** |
| product-service | 44 | **49** (동일 기준이면 55) | 0 | 0 | **44 전건** | **0%** | `product_audit_logs` **0** | 🚩 **최악 · 구조적 0 확정**(호출자 0 ✅ PM 재확인) |
| inventory-service | 47 | 44 (+ship-batch 등 3 누락) | 6 | 2 | 0 | 12.8% | `inventory_audit_logs` **0** · warehouses 30 전건 `modified_at` NULL | 🚩 **T1 뒤집힘 — 표본 0, 판정 불가** |
| partner-service | 28 | 26 ✅일치 | 0 | 13 | 2 | 0% | `partner_audit_logs` **0** · `partner_revisions` EDIT 14 | ⚠️ **판정 불가**(3필드 대상이라 14건이 다른 필드면 0이 정상) · T8 = 1줄 수정 |
| user-service | 25 | 24 ✅일치 | 3 | 2 | 4 | 12.0% | `user_audit_logs` **0** · `role_change_history` **0**(호출자는 실재) · `employee_signature_audit` **0**(서명 보유 직원 **0명**) | ⚠️ 구조적 0 + 표본 0 혼재 |
| auth-service | 40 | 40 ✅일치 | 0 | 1 | 0 | **0%** | **감사 테이블 자체 0종**(auth_db 12테이블) · 권한행 278건 modified_by 가 **전부 Flyway 태그** | 🚩 **테이블 신설 필요** · 사용자 주도 권한 변경 0건(표본 0) |
| partner-auth-service | 7 | 7 ✅일치 | 1 | 0 | 0 | 14.3% | `partner_login_attempt` **46**(2026-06-18~07-30) | ✅ **설계가 온전한 유일 경로**(실패 6분기가 예외 대신 return → 커밋 보장) |
| groupware-service | 29 | 28 ✅일치 | 0 | 1 | 28 | 0% → **정정** | `groupware_audit_logs` **0** · **`document_template_revisions` 111** | 🚩 **T4 뒤집힘 — 0% 아님** |
| notification-service | 15 | 13 ✅일치 | 0 | 4 | 11 | 0% | `notification_audit_logs` **0** | 구조적 0 확정 · 스케줄러 1건 미명세(T12) |
| dashboard-service | 14 | 12 ✅일치 | 0 | 0 | 14 전건 | 0% | 감사 테이블 **0종** · `app_release` **0행** · `app_notice` **0행** | ⚠️ **변경 동작 자체가 한 번도 없었음** |
| arologis-service | 56 | 52 ✅일치 | 0 | 3 | 52 | 0% | `arologis_audit_logs` **0**(표본 0 — 경로 실재) · `arologis_role_change_history` 3 | 🚩 호출자 1곳(`DispatchService.java:261`, actorId `UUID(0,0)` 하드코딩) |
| dc-config-service | 4 | 4 ✅일치 | 0 | 1 | 3 | **0%** | `dc_config_audit_logs` **0** / `dc_configs` 259 중 **14행 실제 수정** | 🚩🚩 **유일하게 확정된 배선 끊김 · 금액 도메인** |
| **(범위 밖) logging-service** | — | 5(front 1 + 조회 4) | — | — | — | — | `logging_db` **테이블 0개** · ES 인덱스 0 · Rabbit 큐 0 | 🚩 **97일간 프런트 활동로그 전량 유실 · 도달 가능 결함 1건** |

**총계 대조**

| 기준 | 값 | 출처 |
|---|---:|---|
| 매트릭스 총계 | **580** | 6군 집계 (42+341+144+52+1) |
| 상태변경 없는 POST 15건 제외 | 565 | 매트릭스 자기 진술 |
| dev 시더 16건까지 제외 | 549 | 매트릭스 자기 진술 |
| 적대검증 실측(HTTP 556 + @Scheduled 20 + CommandLineRunner 20) | **596** | 각도 A 전수 grep |
| + 상태변경 GET 3건 | 599 | 각도 A |
| + 프런트 활동로그 표면 | 599 + α | 각도 D |
| + Flyway DML | 미계수 | 각도 A (auth 84/98 등) |

🚩 **총계 580 은 항목 단위로 재현 불가능합니다.** gaps 배열은 485건만 나열하고 **기록됨 42 + 부분 52 = 94건이 어디에도 항목으로 없습니다.** 이것이 partner-order 유령 2건의 정체를 특정하지 못한 이유입니다. (나열된 구역 3곳 — product 44 · inventory 39 · partner-order 13 — 은 선언 개수와 정확히 일치했습니다. **나열된 부분의 산수는 맞습니다.**)

---

## 4. 구멍 전수 — 3분류

전체 목록은 매트릭스 `gaps` 배열 485건 원문을 정본으로 삼되(정정 사항 반영), **성격별로 다음 3+1 분류로 다시 나눕니다.** 배선 작업량 추정이 완전히 다르기 때문입니다.

### 4-1. 구조적 0 — 기록기가 있는데 호출자가 0 (배선만 하면 즉시 살아남)

| 서비스 | 건수 | 기록기 좌표 | 전 서비스 grep 결과 | DB |
|---|---:|---|---|---|
| product-service | 44 (동일기준 55) | `audit/service/ProductAuditLogService.java:44` (`recordOverlayPatch:63`/`recordBatch:86`) | 자기 선언 + 읽기전용 컨트롤러 `:4`/`:33` 뿐 ✅PM재확인 | 0행 |
| groupware-service | 28 | `audit/repository/GroupwareAuditLogRepository.java:13` | 자기 선언 1건 | 0행 |
| notification-service | 11 | `audit/service/NotificationAuditLogService.java:34` (`implements AuditLogRecorder` 완성) | 자기 선언 1건 | 0행 |
| user-service | 4 | `audit/service/UserAuditLogService.java:37` | 자기 선언 1건 | 0행 |
| dc-config-service | 3 | `audit/service/DcConfigAuditLogService.java:31` | 자기 선언 1건 | 0행 · **단 14행이 실제 수정됨** |
| **소계** | **90** | | 🔑 `AuditLogRecorder` **인터페이스 타입 주입**까지 전수 확인해도 주입 지점은 `TaxInvoiceService.java:87` · `PartnerService.java:58` **둘뿐** | |

### 4-2. 사실상 미배선 — 호출자가 1곳뿐

| 서비스 | 유일 호출자 | 결손 |
|---|---|---|
| partner-service | `PartnerService.java:389` | name/address/phone **3필드만** · actor 항상 `"system"`(T8 — 컨트롤러 1줄로 닫힘) |
| arologis-service | `DispatchService.java:261` | actorId `UUID(0,0)`/`"system"` 하드코딩 · catch · **status 필드만** |
| **소계** | 54건(arologis 52 + partner 2) | |

### 4-3. 기록 안 됨 — 기록기·테이블 자체가 없거나 호출이 없음 (342건, ship-batch 포함)

주요 🚩 항목만 발췌 (전건은 매트릭스 gaps 원문):

**금액·회계 무결성 직결**
- `POST /accounting/journals/{id}/post` 분개 게시 · `/reverse` 역분개 — `service/JournalService.java:124`/`:148` (journals **2,571행 · journal_lines 7,275행** 존재하는데 감사 0)
- `POST /accounting/closings` 월마감 · `/{id}/reverse` 역마감 — `service/MonthEndCloseService.java:103`/`:138` (✅ PM 선행 실측: `AuditLogRecorder` 주입·호출 없음)
- `PATCH /accounting/daily-closings/{date}/lock` **마감 해제** — `service/DailyClosingService.java:292`
- `POST /accounting/tax-invoices/{id}/issue` (DRAFT→ISSUED + 채번 + 자동 분개 게시) · `/cancel` (자동 역분개) — `TaxInvoiceService.java:228`/`:349`
- `PATCH /api/v1/products/{modelCode}/fixed-discount` 고정DC율 인라인 자동저장 · `/classification`(고정DC 동시 변경) — `ProductService.java:761`/`:747`
- `PATCH /products/{id}/price` — `ProductService.java:654` (**audit 도 price_history 도 안 씀**)
- `PATCH /api/v1/partner-dc-configs/{partnerCode}` — `DcConfigService.java:89` (**V3 가 감사 의무를 명문화한 바로 그 필드**)

**권한 — auth-service 39건 전건 무기록 + 테이블 0종**
- `PUT /auth/admin/permissions/templates/{roleCode}` **전 계정 파급** — `AccountPermissionService.java:340`
- `POST/DELETE /auth/admin/accounts/{accountId}/groups` — `AccountGroupService.java:79`/`:113` (**역할이 그룹 배속으로만 표현 = 로그인 role 산출의 유일 근거**)
- `PUT /auth/admin/permission-groups/{id}/delegations` MASTER 위임 — `GroupPermissionService.java:150`
- `PUT /auth/admin/permissions/account/{accountId}` — `AccountPermissionService.java:207` (**actorId 를 인자로 받고도 본문에서 한 번도 안 씀**)
- `PUT /auth/internal/permissions/role-grant` — `PermissionInternalController.java:179` (**코드가 스스로 "감사 로깅" 이라 부르나 실체는 `log.warn` 한 줄**)
- `POST /auth/login` / `logout` / `password/change` / `accounts/{id}/unlock` / `DELETE accounts/{id}` — actor 파라미터 자체 없음

**상태 전이 · 재고**
- slip 상태전이 9개 — `SlipService.java:885 save`/`:897 send`/`:962 process`/`:982 inspect`/`:1377 ship`/`:1389 deliver`/`:1397 confirm`/`:1462 cancel` + `SlipRestoreService.java:73`
- `POST /inventory/adjust` 실사 조정(수량 직접 가감) — `StockService.java:407`
- `POST /inventory/inbound-inspections/{slipId}/complete` (StockLot 생성 + Movement + Balance) — `InboundInspectionService.java:223`
- 🆕 `POST /inventory/instances/ship-batch` — `StockInstanceController.java:151` → `StockInstanceService.java:216` (**매트릭스 미수록** · `StockInstanceService.java` 전체 audit grep **0건** ✅PM확인)
- `POST /api/v1/partner-orders/{id}/convert-to-slip` (재고 예약 + 전표 발행 + 상태 전이 동시) — `PartnerOrderConvertService.java:106`

**배차·운송사 — audit grep 0건 디렉터리 5개** (slip `service/dispatch/*` · `service/dispatchgroup/*` · `service/external/*` · `service/cutoff/*` · `service/closing/*`)

**임포트 — 30건 이상 전량 무기록** (accounting 15 · user 4 · inventory 2 · partner 2 · product 1 …). `partners` **7,314행** · `products` **3,063행**(2026-08-10 13:28 측정 — 40초 전 samhan-product-service 재시작됨, 병렬 트랙 영향 가능) 규모를 한 번에 갱신.

### 4-4. ⚠️ 판정 불가 — 코드는 있는데 데이터가 0 (표본 0)

**🚨 이것을 "구멍" 으로 세면 배선 작업량이 과대 추정됩니다.**

| 테이블 | DB | 발화 조건 실측 | 판정 |
|---|---|---|---|
| `inventory_audit_logs` | 0 | warehouses 30 전건 `modified_at` NULL · audits 9 전건 시더 종단상태 INSERT | **판정 불가** ✅PM실측 |
| `employee_signature_audit` | 0 | employees 100명 중 `signature_png` 보유 **0명** | **판정 불가** |
| `slip_publish_audit` · `slip_signature_audit` | 0 · 0 | `delivery_batches` **0행** | **판정 불가** |
| `arologis_audit_logs` | 0 | dispatches 27건 존재하나 정차 상태 갱신 미발화 | **판정 불가**(F군 스스로 명시) |
| `partner_audit_logs` | 0 | `partner_revisions` EDIT 14행 존재하나 감사 대상은 name/address/phone 3필드뿐 + 동일값이면 조기 return(`:380-382`) | **판정 불가 — 라이브 1회 필요** |
| `role_change_history` | 0 | 쓰기 호출자 실재(`EmployeeProvisioningService.java:141`) | **판정 불가**(매트릭스 서술은 구조적 0처럼 읽힘) |
| auth 권한 39건 | 테이블 없음 | 권한행 278건 modified_by 가 **전부 Flyway 태그**(최종 2026-08-10 11:36), 사용자 주도 변경 0건 | 테이블 부재는 **확정**, 발화는 **미확인** |
| dashboard 14건 | 테이블 없음 | `app_release` 0행 · `app_notice` 0행 | 테이블 부재 **확정**, 발화 **0** |

**반대 — 확정 배선 끊김(발화했는데 무기록)**: `dc_configs` 14행 수정 vs `dc_config_audit_logs` 0행. **485건 중 유일합니다.**

### 4-5. 살아 있는 116행의 출처 — 실사용자 트래픽은 46행뿐

| 테이블 | 행 | actor 분포 |
|---|---:|---|
| `accounting_audit_logs` | 50 | `사용자`·`SYSTEM MASTER` 46 + `[DEV-SEED]`/`SOL-947-…` 2 + system sentinel 2 |
| `slip_audit_logs` | 62 | **100% `[DEV-SEED] 개발매니저`** ✅PM실측 |
| `partner_order_audit_logs` | 4 | **100% `[DEV-SEED] 개발마스터`** |
| `partner_order_revisions` | 566 | `T8 live QA` · `T8 R2 sweep` · `codex-r4-985` · `PM-verify` · `T1-recon-retry` = **QA 라운드 잔재** |

🚩 **3개 테이블 전부 최종 기록이 2026-07-27 이전 — 14일간 전 시스템 신규 감사 0행.**

---

## 5. 불일치 — 서비스 간 기록 수준·스키마·저장 위치

### 5-1. 기록 "수준" 이 최소 6층 (T2 정정 반영)

| 층 | 내용 | 실재 확인된 곳 |
|---|---|---|
| ① 필드 단위 old→new diff | `field_name`·`old_value`·`new_value` | **accounting 만**(`mapping.`·`partnerMatch.`·`taxInvoice.` 접두). ~~slip audit/overlay~~ **T2 로 삭제** |
| ② 요약 문자열 1행 | `slipNo=…\|slipType=…\|status=…` blob | **slip_audit_logs 전량**(SLIP_EDIT/SLIP_DELETE) ✅PM실측 |
| ③ 전체 스냅샷 | revisions | slip 197 · estimate 47 · partner EDIT 14 · **document_template 111**(T4 신규) |
| ④ 이벤트 마커 1행 | DELETE/RESTORE/FROM_ESTIMATE | partner_order 4행 |
| ⑤ 도메인 이력 테이블 | partner_order_history · notification_logs · role_change_history · *_collab_suggestions | |
| ⑥ `log.info`/`log.warn` 만 | | **auth-service 권한 변경 전체** |

### 5-2. 스키마가 최소 11종 + 매트릭스 누락 7종

매트릭스 목록 11종 외 **실재 확인**: `document_template_revisions`(111행) · `partner_order_front_event_log`(173행) · `partner_credit_history`(0) · `dps_save_history`(0) · `slip_cleanup_save_history`(1) · `quote_snapshots`(0) · 각종 `*_collab_suggestions`.

🚩 **통합의 실제 제약**: `accounting_audit_logs` 에 **`entity_type` 컬럼이 없습니다.** 실측 컬럼 = `id, entity_id, revision_no, actor_id, actor_name, actor_color, field_name, old_value, new_value, changed_at` + BaseEntity 7. 도메인 구분이 **`field_name` 접두 문자열 관례에만 의존**합니다.

### 5-3. 같은 shared 컴포넌트인데 결과가 6가지

`shared/collab-core` 의 동일한 `CollabCommentService`/`CollabCoeditService` 를 쓰는 "수정완료(collab/edits)":
slip = `slip_audit_logs` 다건 + revisions / estimate = `estimate_revisions` 만 / partner-order = audit 필드단위 + revisions / accounting = `journal_collab_suggestions` 만(audit 0) / groupware = `approval_collab_suggestions` 만 / 배차 = **이력 테이블 자체 없음**.

### 5-4. 같은 도메인인데 진입 채널에 따라 기록 유무가 갈림

| 갈림 | 기록되는 쪽 | 안 되는 쪽 |
|---|---|---|
| 전표 생성 | 웹 create (CREATE 스냅샷) | **mobile create**(`MobileQuotationService.java:204`·`MobilePartnerOrderService.java:186`) — 같은 문서인데 rev 1 이 있기도 없기도 |
| 창고 | PATCH (필드단위) | **ecount CSV import**(`EcountWarehouseImporter.java:39` JDBC 직접 UPSERT) — ✅ warehouses 30건 전건 `modified_at` NULL 이 "전량 우회 경로 유입" 을 뒷받침 |
| 삭제 | 전표 삭제 (SLIP_DELETE) | **견적 삭제**(`EstimateService.java:396`) |

### 5-5. 저장 위치 — 중앙 집계 0, 그리고 "중앙화" 는 선택이 아니라 신규 구축

- 14개 서비스 전부 자기 DB. `logging_db` 는 **테이블 0개**(flyway_schema_history 조차 없음).
- logging-service 는 **소비 측이 완성**돼 있습니다 — `AuditLogConsumer.java:30 @RabbitListener` → ES `@Document(indexName="samhan-audit-logs")`(`AuditLog.java:34`) + DLX/DLQ(`RabbitConfig.java:29-32`) + 조회 API 4종.
- 그러나 **발행자 0 · 로컬 배포 0 · ES 인덱스 0 · Rabbit 큐 0**. ⟹ **"중앙화로 갈 것인가" 는 스위치를 켜는 일이 아니라 발행 계층을 새로 만드는 일**입니다.

### 5-6. 문서 표기 3건이 코드·인프라와 어긋남 (증거 무결성)

| 문서 | 표기 | 실제 |
|---|---|---|
| `README.md:850` | `logging-service \| 8082 \| logging_db \| … \| Phase 1 (운영)` | `application.yml:16-22` 가 DataSource/JPA autoconfig **명시 exclude** · `infrastructure/terraform/templates/init-rds.sql:6` *"PostgreSQL 미사용 → logging_db 제외"*. **"운영" 도 오류**(로컬 미배포·인덱스 0·producer 0) |
| `ROADMAP.md:856` | `services/logging-service \| 1 \| 운영` | 동일 |
| `README.md:148` | *"감사로그(@Document, **월별 인덱스 롤링**)"* | `AuditLog.java:20-26` 이 스스로 *"고정 인덱스 samhan-audit-logs 를 쓰고 월별 롤링은 **나중에** ILM/alias 로"* ⟹ **미구현을 구현으로 표기** |

### 5-7. 고아 자산 2건

- `slip_line_correction_audits` — `V61:3` 생성, `:69` 일회성 INSERT. 참조 엔티티·리포지터리·기록기가 `src/main/java` 전체에 **0** (✅ DB 0행)
- `SlipService.softDelete`(`service/SlipService.java:652`) — 마감 가드까지 구현돼 있으나 **호출자 0**

---

## 6. 슬라이스 제안

🚨 **원칙**: 한 번에 전 서비스 금지 · 가장 값싸고 즉시 닫히는 것 먼저 · **S-0 과 S-1 을 통과하기 전에는 배선 슬라이스를 열지 않습니다.**

### 🚨 S-0 (선행 · 코드 변경 0) — 매트릭스 재현 가능화 + 분모 확정

| 항목 | 내용 |
|---|---|
| **무엇** | ① 기록됨 42 + 부분 52 = **94건을 gaps 와 같은 형식으로 항목 나열**(서비스·METHOD·경로·좌표) ② "검토했으나 제외" 목록 별도 산출(readiness 스케줄러·캐시 스케줄러·readOnly 조회 POST) ③ Flyway DML 표면 계수 ④ 프런트 활동로그 표면 계수 ⑤ 개발책임자 분모 결정 반영 |
| **왜 그 경계** | 지금은 580 을 항목 단위로 재현할 수 없어 **커버리지 목표치를 세울 수 없습니다.** partner-order 유령 2건의 정체도 이것 없이는 특정 불가. 나열 없이 진행하면 "범위 밖" 을 "결함 0" 으로 세는 기존 실패 패턴 재현 |
| **회귀 위험** | 없음(조사 라운드) |
| **선행** | 개발책임자 §7-①(분모) 결정 |
| **비용** | 낮음 · 1라운드 |

### 🚨 S-1 (선행 · 정책 + 소규모 코드) — 감사 실패 트랜잭션 의미론 확정

| 항목 | 내용 |
|---|---|
| **무엇** | ① 현행 의미론을 **양방향 RED 로 고정** — RED-A: 감사 기록기가 예외를 던질 때 업무 mutation 이 어떻게 되는가 / RED-B: 정상 경로가 계속 동작하는가 ② `TaxInvoiceService.java:192-200` ↔ `:218-220`, `WarehouseService.java:345`, `InventoryAuditService.java:430` 의 **상반된 주석 정정** ③ `@Autowired(required=false)` + null 가드 2곳(`TaxInvoiceService.java:87/:165`·`PartnerService.java:58/:365`)의 **조용한 스킵**을 fail-fast 또는 기동 시 경고로 전환 |
| **왜 그 경계** | 🚨 **이것이 모든 배선 슬라이스의 선행입니다.** 현행이 원자(REQUIRED 롤백)라면 485건을 배선하는 순간 **485개의 새 업무 장애 표면**이 생깁니다. 반대로 best-effort 로 가면 "기록됨" 이 런타임 보장이 아니게 됩니다. **어느 쪽인지 모르는 채로 배선하면 안 됩니다.** |
| **회귀 위험** | ⚠️ **높음** — 정책을 원자로 확정하면 기존 42건 경로에서 지금까지 조용히 넘어가던 실패가 500 으로 표면화될 수 있음. `REQUIRES_NEW` 로 가면 트랜잭션 격리·커넥션 풀 영향 |
| **선행** | 개발책임자 §7-⑦ 결정 |
| **비용** | 중 · 1~2라운드 |

### S-2 (최저비용 · 1줄) — partner-service actor 배선

| 항목 | 내용 |
|---|---|
| **무엇** | `PartnerAdminController.java:203` 이 2-arg `updateProfile` 대신 **actor 를 받는 4-arg 오버로드(`PartnerService.java:354`)** 를 호출하도록 변경 |
| **왜 그 경계** | 오버로드가 **이미 존재하는데 도달 불가 코드**(T8). API 계약 변경 불요. 전 조사에서 **가장 값싼 항목** |
| **회귀 위험** | 낮음. 단 ⚠️ S-1 미결 상태에서 켜면 audit 실패 시 거래처 수정이 롤백될 수 있음 ⟹ **S-1 이후** |
| **선행** | S-1 · `partner_audit_logs` 라이브 1회(실 경로로 거래처 이름 변경 → 1행 생기는지) — 현재 **판정 불가** 상태 해소 필요 |
| **비용** | 매우 낮음 |

### S-3 (값싸고 사용자 도달) — logging-service 실태 정리 + '로그' 메뉴 결함

| 항목 | 내용 |
|---|---|
| **무엇** | ① `/admin/activity-logs` 도달 결함 처리 — (a) 로컬 compose 에 logging-service 추가 배포 (b) 메뉴 게이트 (c) 에러 문구를 원인에 맞게 정정 중 택1 ② 문서 표기 3건 정정(`README.md:850`·`:148`, `ROADMAP.md:856`) ③ `AppLayout.tsx:420`·`code.js:2771` 의 **조용한 삼킴**을 관측 가능하게 |
| **왜 그 경계** | **유일하게 확인된 사용자 도달 결함**(마스터·개발자 권한 보유자, auth_db 실측). 감사 배선과 독립이라 병렬 가능. 문서 정정은 증거 무결성 축(도달성 0이어도 항상 보고·정정) |
| **회귀 위험** | (a) 선택 시 **로컬 스택에 컨테이너 추가 = 전 트랙 공유 자원 변경** ⟹ 다른 워크트리 5개가 도는 지금은 **(c)+(b) 권장**, 배포는 별도 조율 |
| **선행** | 없음 (문서 정정은 즉시) |
| **비용** | 낮음 |

### S-4 (금액 도메인 · 유일 확정 결함) — dc-config 배선

| 항목 | 내용 |
|---|---|
| **무엇** | `DcConfigService.java:89`(partner-dc-configs PATCH) · `DcConfigImportService.java:101` · `EstimateConfigService.java:25` 3곳에 `DcConfigAuditLogService` 배선. **불변식**: 할인율·정액DC 변경은 old→new 를 남긴다 |
| **왜 그 경계** | 🚩 **485건 중 유일하게 "발화했는데 안 남은" 것**(dc_configs 14행 수정 vs audit 0행, 그중 2행은 실명 `kimmiseon`). 값이 `home/commercial_discount_rate` 와 `discount_360_amount` 40,000~50,000원 = **금액 직결**. 게다가 `V3:15,:55-58` 이 이미 의무를 명문화 ⟹ **새 요구가 아니라 미완 이행** |
| **회귀 위험** | ⚠️ `EstimateConfig` 는 `dc_config_audit_logs.entity_id` 가 `DcConfig`·`DcRule` 로 한정돼 **스키마상 대상이 아님** ⟹ 스키마 확장 필요 여부 선판단. 🚨 마이그레이션 번호는 **3중 계수**(그 서비스 최고 · 그 DB 적용 최고 · 열린 PR 예약분) |
| **선행** | S-1 |
| **비용** | 낮~중 · 서비스 1개 · 4개 동작 |

### S-5 (미완 이행 묶음) — 마이그레이션이 이미 선언한 감사 대상

| 항목 | 내용 |
|---|---|
| **무엇** | ① accounting `V5:16-17` 의 **Journal**(`JournalService.java:77 create`/`:124 post`/`:148 reverse`) 과 **AccountingPeriod**(`MonthEndCloseService.java:103`/`:138`) ② partner `V5:15-16` 의 **BlockedPartner**(`PartnerBlockService.java:66`/`:108`) ③ inventory `V4:59` 의 **실사 lines actualQty**(`InventoryAuditService.java:184`/`:208`) |
| **왜 그 경계** | **"새 요구" 가 아니라 "미완 이행"** 이라 우선순위 근거가 문서에 이미 있습니다. accounting 은 **journals 2,571행 · journal_lines 7,275행이 실재하는데 감사 0건** — 표본 0 이 아닌 실 볼륨. 무결성 도메인 |
| **회귀 위험** | ⚠️ 높음 — 분개 게시/월마감은 회계 확정 경로. S-1 이 원자로 결론나면 **감사 실패 = 마감 실패**. 🚨 accounting 은 열린 PR 과 마이그레이션 번호 충돌 전례 있음(`V96` ↔ `#1061`) |
| **선행** | S-1 · S-0 · 개발책임자 §7-⑤(기록 단위) |
| **비용** | 중~높음 · **accounting / partner / inventory 를 각각 별도 슬라이스로 쪼갤 것** |

### S-6 (최대 표면 단일 서비스) — product-service 배선

| 항목 | 내용 |
|---|---|
| **무엇** | `ProductAuditLogService`(`:44`/`:63`/`:86`) 배선. **1차 범위 = 금액 직결 6개만** — `/fixed-discount`(`:761`) · `/classification`(`:747`) · `/price`(`:654`) · `/variable-discount`(`:731`/`:780`) · `PATCH /products/{id}`(`:588`). 나머지 38건은 후속 |
| **왜 그 경계** | 44~55건 전건 무기록이라 통째로 열면 넓은 변경 실패 패턴 재현. **`GET /products/{productId}/audit-logs` 가 영원히 빈 목록**인 사용자 도달 결함도 이 6건만 배선해도 해소 시작 |
| **회귀 위험** | ⚠️ `ProductSheetSyncScheduler.scheduledSync`(5분 주기, `scheduler/ProductSheetSyncScheduler.java:75`)가 **최대 변경원** — 배선하면 5분마다 대량 audit 행 유입. **스케줄러는 1차 범위에서 제외**하고 배치 1행 정책 결정 후 별도 |
| **선행** | S-1 · §7-⑨(임포트/스케줄러 배치 갈음) |
| **비용** | 중 |

### S-7 (기록기 완성분 소진) — user · notification · groupware 배선

| 항목 | 내용 |
|---|---|
| **무엇** | 서비스 **하나씩** 별도 슬라이스. user 4건(`EmployeeProvisioningService.java:205`/`:264`/`:52`/`:87`) → notification 11건 → groupware 28건(`V2:8` 이 스스로 *"실 mutation 호출자 통합은 향후 PR"* 이라 자백) |
| **왜 그 경계** | 기록기가 완성돼 배선만 하면 살아남. 43건 = 구조적 0 의 절반 |
| **회귀 위험** | groupware 는 이미 `document_template_revisions` 로 ③층이 도는 곳이 있어(**T4**) **중복 기록** 주의. user `V4:9-10` 이 *"법적 인사 기록 보존"* 을 단언 ⟹ 무결성 도메인 |
| **선행** | S-1 · §7-⑤ · §7-⑩(선배선 vs 통합후배선) |
| **비용** | 중 |

### S-8 (상태 전이 · 대량) — slip-service 상태전이 9개 + 배차/운송사

| 항목 | 내용 |
|---|---|
| **무엇** | 1차 = 상태전이 9개(`SlipService.java:885/897/962/982/1377/1389/1397/1462` + `SlipRestoreService.java:73`). 2차 = 배차/운송사/마감 5개 디렉터리(audit grep 0) |
| **왜 그 경계** | slip 은 기록 계열 6종으로 가장 두꺼운데 **상태전이 11개 중 9개가 무기록** — 계열 내 비대칭이 가장 큼. 배차 계열은 표면이 커서 반드시 분리 |
| **회귀 위험** | 🚩 **T2 반영 필요** — 현행 `slip_audit_logs` 는 요약 문자열 1행 계층이므로, 여기에 필드 diff 를 섞으면 `field_name` 관례가 3종류가 됩니다. **기록 단위 표준(§7-⑤) 확정 후** |
| **선행** | S-1 · §7-⑤ |
| **비용** | 높음 |

### S-9 (계약 변경 필요) — auth-service 감사 테이블 신설

| 항목 | 내용 |
|---|---|
| **무엇** | ① `auth_db` 에 감사 테이블 신설(현재 12테이블에 0종) ② 1차 범위 = **권한 축 5개**(`AccountGroupService.java:79`/`:113` 그룹 배속·회수 · `AccountPermissionService.java:340` 템플릿 전 계정 파급 · `:207` **actorId 받고도 미사용** · `GroupPermissionService.java:150` MASTER 위임) ③ 로그인/세션은 별도 |
| **왜 그 경계** | 감사가 가장 필요한 축(권한)인데 **테이블조차 없습니다.** 다만 `updateAccountRole`/`deleteAccount`/`unlockAccount` 는 **actor 파라미터 자체가 없어 내부 API 계약 변경 필요** ⟹ 승인 선행 |
| **회귀 위험** | ⚠️ **최고.** auth-service 는 전 트랙 공유. 마이그레이션 98개 중 84개가 DML 인 서비스라 번호 충돌·부팅 차단 위험. `V44__assign_accounts_to_groups.sql` 같은 배포시 DML 이 신설 감사 테이블과 상호작용할 수 있음 |
| **선행** | S-1 · §7-②(인증 표준) · §7-⑥(계약 변경 승인) · 마이그레이션 번호 3중 계수 |
| **비용** | 높음 |

### S-10 (후순위) — arologis · inventory 잔여 · dashboard · 고아 자산

- arologis 52건 — 호출자 1곳(`DispatchService.java:261`, `UUID(0,0)` 하드코딩·catch·status 만). **표본 0** 이라 배선 전 발화 조건 생성 필요
- inventory — 창고 create 누락(`WarehouseService.java:111`, update/delete/restore/revert 는 기록되는데 create 만) · ecount JDBC 우회 비대칭(`EcountWarehouseImporter.java:39`) · **ship-batch(T11 신규)**
- dashboard 14건 — §7-③ 포함/제외 결정 대기. `app_release`·`app_notice` **0행**이라 발화 자체가 없음
- 고아 자산 — `slip_line_correction_audits`(자바 참조 0) · `SlipService.softDelete:652`(호출자 0) 폐기 여부

### 슬라이스 의존 관계

```
S-0 (분모·나열)  ──┐
                   ├──► S-2 ─► S-4 ─► S-5 ─► S-6 ─► S-7 ─► S-8 ─► S-9 ─► S-10
S-1 (tx 의미론) ──┘

S-3 (logging/문서) ── 독립 · 즉시 착수 가능
```

---

## 7. 개발책임자 확인 항목 (선택지와 대가)

| # | 질문 | 선택지 | 대가 |
|---|---|---|---|
| **①** | **분모를 무엇으로 할 것인가** (이것부터 정해야 나머지가 정해집니다) | (a) 매트릭스 580 (b) 상태변경 없는 POST 제외 565 (c) dev 시더까지 제외 549 (d) 적대검증 실측 596~599 (e) + 프런트 활동로그·Flyway DML 표면 | (a)~(c)는 **재현 불가**(94건 미나열·7건 누락·2건 유령). (d)가 검증 가능하나 S-0 1라운드 필요. (e)는 표면이 더 늘어남 |
| **②** | **인증·세션 동작을 감사 대상으로 볼 것인가** | (a) partner-auth 표준(`partner_login_attempt` 46행 — 성공/실패 6분기 + IP·UA) 으로 통일 (b) auth 는 로그인 제외, 권한 변경만 (c) 현행 유지 | (a) = auth 테이블 신설 + 로그인 경로 성능 영향. (b) = **로그인 실패 추적 불가 유지**(계정 탈취 표면). (c) = 인증 감사 영구 부재 |
| **③** | **dashboard-service 를 제외할 것인가** | (a) 포함 (b) 제외 | 조회 전용이 **아닙니다** — 공지 6 + 릴리스 5 + MV 1. 특히 `publish`/`unpublish`(`AppReleaseService.java:102`/`:110`)는 사용자 배포되는 되돌리기 어려운 동작인데 **컨트롤러가 actor 를 넘기지도 않음**. 단 `app_release` **0행**이라 현재 발화 0 |
| **④** | **휘발성 협업(presence join/leave · coedit update/awareness) 제외** | (a) 제외 (b) 포함 | 약 30건. `ConcurrentHashMap` 인메모리라 **DB 변경 자체가 없음** ⟹ (a) 시 구멍 485 → 약 455 로 줄고 목표가 현실화 |
| **⑤** | **기록 단위 표준** | (a) 필드 단위 old→new 전면 의무 (b) 스냅샷(revisions) 갈음 허용 (c) "무엇을 했다" 1행 (d) **도메인별 차등** — 금액·회계·권한만 필드 단위 | 현재 **6층 공존**. (a)는 slip 62행·partner-order 4행을 전부 재설계. (d)가 현실적이나 "금액에 닿는가" 판별선을 문서화해야 함 |
| **⑥** | **actor — API 계약 변경 승인** ⚠️**T7 로 범위 축소됨** | (a) 전면 계약 변경 (b) BaseEntity `modified_by` 로 갈음 + old value 만 보강 (c) 혼합 | `JpaAuditingConfig.auditorProvider()` 가 이미 전 BaseEntity 의 `created_by`/`modified_by` 를 채웁니다(증거: `dc_configs.modified_by` = 실명 `kimmiseon`). ⟹ **실제 결손은 actor 가 아니라 old value**. 다만 **행 자체를 안 바꾸는 동작**(auth 계정 삭제·권한 회수 등)은 BaseEntity 로 못 덮으므로 (c) 권장. `PartnerService.java:354` 는 **계약 변경 없이 컨트롤러 1줄** |
| **⑦** | 🚨 **감사 실패 시 트랜잭션 정책** (**모든 배선의 선행**) | (a) 원자 — 감사 실패 = 동작 실패 (b) best-effort — `REQUIRES_NEW` 로 격리 (c) 도메인별 차등 | 현행은 **원자일 가능성이 높으나 문서가 자기모순**(T5, `TaxInvoiceService.java:192-200` ↔ `:218-220`) ⟹ **재판정 필요, 확정 아님**. (a) = 485건 배선 시 **485개 새 장애 표면**. (b) = "기록됨" 이 런타임 보장이 아님 + 커넥션 풀 영향. 어느 쪽이든 **RED 로 고정 후 배선** |
| **⑧** | **저장 위치 — 자기 DB vs logging-service** | (a) 자기 DB 유지 + 공통 스키마·공통 `AuditLogRecorder` 인터페이스로 통일 (b) logging-service 중앙화 | ⚠️ **(b)는 "선택" 이 아니라 신규 구축**입니다 — 소비자·ES 매핑·DLQ·조회 API 는 완성이나 **발행자 0(amqp 의존성이 logging-service 에만) · 로컬 배포 0 · ES 인덱스 0 · Rabbit 큐 0**. (a) 는 `accounting_audit_logs` 에 **`entity_type` 컬럼이 없다**는 제약을 먼저 해소해야 함. 어느 쪽이든 **현재 서비스 횡단 감사 조회("이 사용자가 어제 무엇을 했나")는 불가능** |
| **⑨** | **이관/임포트(ecount CSV·XLSX) 계열** | (a) 건별 감사 (b) **배치 1행**(누가·언제·몇 건·파일 해시) (c) 제외 | 30건 이상 전량 무기록. `partners` 7,314행 · `products` 3,063행 규모를 한 번에 갱신 ⟹ (a)는 감사 테이블 폭증. **product 5분 주기 시트 동기화 스케줄러도 같은 판단이 필요**(최대 변경원) |
| **⑩** | **완성된 기록기 5종 — 선배선 vs 통합후배선** | (a) 선배선 후통합 (b) 통합 스키마 확정 후 일괄 | 90건이 여기 걸림(구멍의 약 19%). (a) = 5개 서비스가 즉시 살아나나 스키마가 달라 나중 통합 비용. (b) = 즉시 효과 0이 길어짐. **PM 권장: dc-config(S-4)만 (a)로 먼저 닫고 나머지는 §7-⑧ 결정 후** |
| **⑪** | **Flyway DML 을 감사 표면으로 볼 것인가** (신규 축) | (a) 포함 (b) 제외 | auth **98개 중 84개가 DML**, 그중 `V44__assign_accounts_to_groups.sql` 은 **전 활성 계정을 권한그룹에 배속**(= 매트릭스가 🚩로 지목한 축)하는데 그 서비스엔 감사 테이블이 없음. 실측상 auth 권한행 278건의 `modified_by` 가 **전부 Flyway 태그** ⟹ **현재 권한 변경의 100%가 배포 시점 DML** |
| **⑫** | **고아 자산 처리** | (a) 폐기 (b) 유지 | `slip_line_correction_audits`(자바 참조 0·DB 0행) · `SlipService.softDelete:652`(호출자 0). 감사 스키마 정리 시 함께 하면 비용 적음 |

---

## 8. 판정 불가 · 미확정으로 남기는 것 (확정하지 마십시오)

1. **inventory 커버리지 12.8%** — 코드상 수치. 실동작 미검증(표본 0). ✅ PM 실측으로 원인 확정: warehouses 30 전건 `modified_at` NULL
2. **partner_audit_logs 0행의 원인** — 배선 끊김인지 조건 미충족인지 **데이터만으로 가릴 수 없음**. 라이브 1회(실 경로로 거래처 이름 변경) 필요
3. **감사 실패 트랜잭션 의미론** — 각도 B 는 "원자(롤백)" 로 판정했으나 같은 파일 안에 상반된 주석이 공존하고 예외 발생 지점에 따라 갈림. **RED 고정 전까지 미확정**
4. **partner-order 유령 2건** — 매트릭스 HTTP 27 vs 실측 25. **기록됨·부분 94건이 미나열이라 어느 endpoint 인지 특정 불가**
5. **notification 스케줄러 1건**(`NotificationService.java:177`) 이 "부분 4" 안에 들어 있는지 — 항목 미나열로 확정 불가
6. **arologis 판정불가 1건** — `PUT /admin/arologis/permissions`(`ArologisPermissionAdminController.java:111`)는 auth-service 로 위임하고 `actorUserId` 도 전달하나, **수신측에 감사 테이블이 없어 사실상 무기록일 가능성이 높음**. auth 배선(S-9) 시 함께 닫아야 함
7. **프로덕션(AWS) logging-service 배포 상태** — 이 PC 에서 확인 불가. 단 **발행자 부재는 환경 독립적 코드 결론**
8. **상태를 바꾸는 GET** — 매트릭스가 손으로 찾은 3건(accounting 2 · inventory 1) 외에 **기계적으로 더 찾을 방법이 없음**(서비스 계층 저장은 전수 grep 으로 안 잡힘). **잔여 위험으로 남김**
9. **`products` 행 수** — 매트릭스 2,655 vs 실측 3,063(2026-08-10 13:28, 측정 40초 전 `samhan-product-service` 재시작). **병렬 트랙 영향 가능** — 측정 시각과 함께 읽을 것

---

## 9. PM 재검증 기록 (릴레이 아님 — 직접 실행)

본 세션에서 코드/DB 로 직접 재확인한 항목:

| 주장 | 재확인 방법 | 결과 |
|---|---|---|
| dc_config 배선 끊김 | `psql dc_config_db` | `dc_config_audit_logs=0` · `dc_configs total 259 / modified 14` · `kimmiseon 2행 @2026-06-18 03:07` · `5ba352f4… 12행 @01:06` ✅ |
| inventory 표본 0 | `psql inventory_db` | `inventory_audit_logs=0` · `warehouses total 30 / has_modified 0 / deleted 0` ✅ |
| slip 필드 diff 부재(T2) | `psql slip_db` | `field_name` = `SLIP_EDIT 53` · `SLIP_DELETE 9` **2종뿐** · actor 100% `[DEV-SEED] 개발매니저` ✅ |
| groupware 0% 아님(T4) | `psql groupware_db` | `document_template_revisions=111` · `groupware_audit_logs=0` ✅ |
| logging 발행자 0(T6) | repo 전체 `build.gradle` grep | `spring-boot-starter-amqp` = `services/logging-service/build.gradle:31` **1건** ✅ |
| logging 미배포 | `docker ps -a` | `samhan-logging-service` **0건** ✅ |
| tx 의미론 자기모순(T5) | `TaxInvoiceService.java:185-225` 원문 | `:192-200` *"원자 … best-effort 가 아니다"* ↔ `:218-220` *"graceful"* **동일 파일 공존 확인** ✅ |
| partner actor 도달불가(T8) | `grep updateProfile services/partner-service` | `PartnerAdminController.java:203` → 2-arg `:343` → `:344` `(…, null, null)`. 4-arg `:354` **프로덕션 호출자 0** ✅ |
| product 호출자 0 | `grep ProductAuditLogService services/*/src/main/java` | 선언 `:44` + 읽기전용 컨트롤러 `:4`/`:33` **3건뿐** ✅ |
| ship-batch 누락(T11) | `StockInstanceController.java:151` + `StockInstanceService.java` audit grep | 매핑 실재 · **audit grep 0건** ⟹ 기록 안 됨 확정 ✅ |
| slip 시더 4건(T9) | `ls services/slip-service/.../seed/` | `SlipSeeder` · `EstimateSeeder` · `DeliveryBatchSeeder` · `SlipLockSeeder` **4개 실재** ✅ |

---

## 부록 — 구멍 전건 (기록 안 됨 341 + 기록기만 144 = 485건)

```text
【이 목록의 크기】 기록 안 됨 341 + 기록기만 존재(호출자 없음) 144 = 총 485건. 아래에 전건 나열합니다. 표기 = 서비스 · METHOD 경로 · 판정 · 좌표

===== slip-service — 기록 안 됨 113건 =====
slip-service · POST /slips/price-memory/bulk · 기록안됨(단 조회전용, 상태변경 없음) · web/SlipController.java:257
slip-service · POST /slips/{id}/save · 기록안됨 · service/SlipService.java:885
slip-service · POST /slips/{id}/send · 기록안됨 · service/SlipService.java:897
slip-service · POST /slips/{id}/process · 기록안됨 · service/SlipService.java:962
slip-service · POST /slips/{id}/inspect · 기록안됨 · service/SlipService.java:982
slip-service · POST /slips/{id}/ship · 기록안됨 · service/SlipService.java:1377
slip-service · POST /slips/{id}/deliver · 기록안됨 · service/SlipService.java:1389
slip-service · POST /slips/{id}/confirm · 기록안됨 · service/SlipService.java:1397
slip-service · POST /slips/{id}/cancel · 기록안됨 · service/SlipService.java:1462
slip-service · POST /slips/{id}/restore · 기록안됨 · service/SlipRestoreService.java:73
slip-service · POST /slips/{slipId}/comments · 기록안됨 · comment/service/SlipCommentService.java:66
slip-service · POST /slips/{slipId}/edit-request · 기록안됨 · editrequest/service/SlipEditRequestService.java:109
slip-service · POST /slips/{slipId}/edit-request/{requestId}/approve · 기록안됨 · editrequest/service/SlipEditRequestService.java:154
slip-service · POST /slips/{slipId}/edit-request/{requestId}/reject · 기록안됨 · editrequest/service/SlipEditRequestService.java:184
slip-service · POST /internal/slips/backfill-committed-partners · 기록안됨(다건 partner 컬럼 일괄 갱신) · service/SlipPartnerBackfillService.java:43
slip-service · POST /internal/slips/{slipId}/attachments · 기록안됨 · attachment/service/SlipAttachmentService.java:79
slip-service · POST /internal/slips/lock-by-period · 기록안됨(기간 내 전표 다건 lock) · service/SlipService.java:1771
slip-service · POST /slips/expand-line · 기록안됨(조회/계산 전용, 상태변경 없음) · web/SlipLookupController.java:60
slip-service · POST /slips/cleanup/history · 기록안됨 · service/SlipCleanupSaveHistoryService.java:52
slip-service · PATCH /slips/compensation-failures/{id}/resolve · 기록안됨(감사행 해소인데 해소자 미기록) · service/CompensationRecoveryService.java:48
slip-service · POST /slips/{slipId}/attachments · 기록안됨 · attachment/service/SlipAttachmentService.java:79
slip-service · DELETE /slips/{slipId}/attachments/{attachmentId} · 기록안됨 · attachment/service/SlipAttachmentService.java:177
slip-service · POST /slips/{slipId}/delivery-attachments · 기록안됨 · attachment/web/DeliveryAttachmentController.java:96
slip-service · POST /public/batches/{token}/slips/{slipNo}/attachments · 기록안됨(무인증 공개 업로드) · attachment/web/PublicSlipAttachmentController.java:65
slip-service · POST /delivery-batches/auto-group · 기록안됨 · delivery/service/DeliveryBatchService.java:61
slip-service · POST /delivery-batches/{id}/send-sms · 기록안됨 · delivery/service/DeliveryBatchService.java:131
slip-service · POST /delivery-batches/{id}/slips · 기록안됨 · delivery/service/DeliveryBatchService.java:157
slip-service · DELETE /delivery-batches/{id}/slips/{slipId} · 기록안됨 · delivery/service/DeliveryBatchService.java:174
slip-service · POST /delivery-batches/{id}/regenerate-token · 기록안됨(공개 서명링크 토큰 재발급) · delivery/service/DeliveryBatchService.java:187
slip-service · POST /slips/estimates/{id}/send · 기록안됨 · estimate/service/EstimateService.java:306
slip-service · POST /slips/estimates/{id}/accept · 기록안됨 · estimate/service/EstimateService.java:314
slip-service · POST /slips/estimates/{id}/reject · 기록안됨 · estimate/service/EstimateService.java:322
slip-service · POST /slips/estimates/{id}/convert · 기록안됨 · estimate/service/EstimateService.java:341
slip-service · DELETE /slips/estimates/{id} · 기록안됨(전표 삭제와 비대칭) · estimate/service/EstimateService.java:396
slip-service · POST /slips/estimates/{id}/restore · 기록안됨 · estimate/service/EstimateService.java:408
slip-service · POST /slips/estimates/assigned/{id}/restore · 기록안됨 · estimate/service/EstimateService.java:458
slip-service · PATCH /slips/estimates/{id}/owner · 기록안됨(담당자 변경 이력 없음) · estimate/service/EstimateService.java:555
slip-service · POST /internal/estimates/snapshots · 기록안됨 · estimate/snapshot/service/QuoteSnapshotService.java:36
slip-service · PUT /internal/estimates/snapshots/{id} · 기록안됨(덮어쓰기, 이전값 소실) · estimate/snapshot/service/QuoteSnapshotService.java:45
slip-service · POST /slips/{slipId}/collab/comments · 기록안됨 · web/collab/SlipCollabController.java:109
slip-service · DELETE /slips/{slipId}/collab/comments/{commentId} · 기록안됨 · web/collab/SlipCollabController.java:147
slip-service · POST /slips/{slipId}/collab/comments/{commentId}/resolve · 기록안됨 · web/collab/SlipCollabController.java:160
slip-service · POST /slips/{slipId}/collab/presence/join · 기록안됨(휘발성) · web/collab/SlipCollabController.java:211
slip-service · POST /slips/{slipId}/collab/presence/leave · 기록안됨(휘발성) · web/collab/SlipCollabController.java:227
slip-service · POST /slips/{slipId}/collab/coedit/update · 기록안됨 · web/collab/SlipCollabController.java:259
slip-service · POST /slips/{slipId}/collab/coedit/awareness · 기록안됨(ephemeral) · web/collab/SlipCollabController.java:271
slip-service · POST /slips/estimates/{estimateId}/collab/comments · 기록안됨 · estimate/web/collab/EstimateCollabController.java:98
slip-service · DELETE /slips/estimates/{estimateId}/collab/comments/{commentId} · 기록안됨 · estimate/web/collab/EstimateCollabController.java:136
slip-service · POST /slips/estimates/{estimateId}/collab/comments/{commentId}/resolve · 기록안됨 · estimate/web/collab/EstimateCollabController.java:150
slip-service · POST /slips/estimates/{estimateId}/collab/coedit/update · 기록안됨 · estimate/web/collab/EstimateCollabController.java:207
slip-service · POST /slips/estimates/{estimateId}/collab/coedit/awareness · 기록안됨(ephemeral) · estimate/web/collab/EstimateCollabController.java:219
slip-service · POST /slips/estimates/{estimateId}/collab/presence/join · 기록안됨(휘발성) · estimate/web/collab/EstimateCollabController.java:246
slip-service · POST /slips/estimates/{estimateId}/collab/presence/leave · 기록안됨(휘발성) · estimate/web/collab/EstimateCollabController.java:267
slip-service · POST /mobile/sales/quotations · 기록안됨(웹 EstimateService.create 우회, CREATE 스냅샷 없음) · mobile/service/MobileQuotationService.java:204
slip-service · POST /mobile/sales/partner-orders · 기록안됨(웹 SlipService.create 우회) · mobile/service/MobilePartnerOrderService.java:186
slip-service · POST /admin/slip-closing-baselines · 기록안됨(마감 기준일 정책) · service/closing/SlipClosingBaselineAdminService.java:30
slip-service · DELETE /admin/slip-closing-baselines/{id} · 기록안됨 · service/closing/SlipClosingBaselineAdminService.java:44
slip-service · POST /admin/slip-cutoffs · 기록안됨 · service/cutoff/SlipOutboundCutoffService.java:58
slip-service · PATCH /admin/slip-cutoffs/{id} · 기록안됨 · service/cutoff/SlipOutboundCutoffService.java:85
slip-service · DELETE /admin/slip-cutoffs/{id} · 기록안됨(callerId 받고도 미기록) · service/cutoff/SlipOutboundCutoffService.java:98
slip-service · POST /admin/dispatch-tasks · 기록안됨 · service/dispatch/DispatchTaskService.java:64
slip-service · POST /admin/dispatch-tasks/today-draft · 기록안됨 · service/dispatch/DispatchTaskService.java:79
slip-service · POST /admin/dispatch-tasks/{taskId}/vehicle-groups · 기록안됨 · service/dispatch/DispatchTaskService.java:88
slip-service · DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId} · 기록안됨 · service/dispatch/DispatchTaskService.java:124
slip-service · POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/restore · 기록안됨 · service/dispatch/DispatchTaskService.java:246
slip-service · POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips · 기록안됨 · service/dispatch/DispatchTaskService.java:148
slip-service · PUT /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/order · 기록안됨 · service/dispatch/DispatchTaskService.java:185
slip-service · DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/{slipId} · 기록안됨 · service/dispatch/DispatchTaskService.java:210
slip-service · POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/{slipId}/restore · 기록안됨 · service/dispatch/DispatchTaskService.java:322
slip-service · PUT /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver · 기록안됨 · service/dispatch/DispatchMatchedDriverManualService.java:51
slip-service · POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/manual-dispatch-complete · 기록안됨 · service/dispatch/DispatchMatchedDriverManualService.java:97
slip-service · POST /admin/dispatch-tasks/{taskId}/dispatch · 기록안됨 · service/dispatch/DispatchTaskCompletionService.java:71
slip-service · POST /admin/dispatch-tasks/{taskId}/start-redispatch · 기록안됨 · service/dispatch/DispatchTaskRedispatchService.java:48
slip-service · POST /admin/dispatch-tasks/{taskId}/modification-request · 기록안됨 · service/dispatch/DispatchTaskModificationRequestService.java:52
slip-service · POST /admin/dispatch-tasks/{taskId}/cancellation-request · 기록안됨 · service/dispatch/DispatchTaskCancellationRequestService.java:49
slip-service · POST /internal/slip/dispatch-tasks/{taskId}/confirm · 기록안됨(아로로지스 내부 API) · service/dispatch/DispatchTaskConfirmService.java:60
slip-service · POST /internal/slip/dispatch-tasks/{taskId}/unavailable · 기록안됨 · service/dispatch/DispatchTaskUnavailableService.java:53
slip-service · POST /internal/slip/dispatch-tasks/{taskId}/modification-accepted · 기록안됨(actor 가 상수 AROLOGIS_ACTOR) · service/dispatch/DispatchTaskModificationDecisionService.java:38
slip-service · POST /internal/slip/dispatch-tasks/{taskId}/modification-rejected · 기록안됨 · service/dispatch/DispatchTaskModificationDecisionService.java:63
slip-service · POST /internal/slip/dispatch-tasks/{taskId}/cancellation-accepted · 기록안됨 · service/dispatch/DispatchTaskCancellationDecisionService.java:53
slip-service · POST /internal/slip/dispatch-tasks/{taskId}/cancellation-rejected · 기록안됨 · service/dispatch/DispatchTaskCancellationDecisionService.java:84
slip-service · POST /admin/dispatch-tasks/{taskId}/comments · 기록안됨 · web/dispatch/DispatchCollabCommentController.java:105
slip-service · DELETE /admin/dispatch-tasks/{taskId}/comments/{commentId} · 기록안됨 · web/dispatch/DispatchCollabCommentController.java:147
slip-service · POST /admin/dispatch-tasks/{taskId}/comments/{commentId}/resolve · 기록안됨 · web/dispatch/DispatchCollabCommentController.java:161
slip-service · POST /admin/dispatch-tasks/{taskId}/edits · 기록안됨(전표/견적 협업과 달리 이력 테이블 없음) · dispatch/collab/DispatchCollabEditService.java:31
slip-service · POST /admin/dispatch-tasks/{taskId}/collab/coedit/update · 기록안됨 · web/dispatch/DispatchCollabCommentController.java:216
slip-service · POST /admin/dispatch-tasks/{taskId}/collab/coedit/awareness · 기록안됨(ephemeral) · web/dispatch/DispatchCollabCommentController.java:228
slip-service · POST /admin/dispatch-tasks/{taskId}/collab/presence/join · 기록안됨(휘발성) · web/dispatch/DispatchCollabCommentController.java:293
slip-service · POST /admin/dispatch-tasks/{taskId}/collab/presence/leave · 기록안됨(휘발성) · web/dispatch/DispatchCollabCommentController.java:313
slip-service · POST /admin/carriers · 기록안됨 · service/dispatchgroup/CarrierService.java:28
slip-service · PATCH /admin/carriers/{code} · 기록안됨 · service/dispatchgroup/CarrierService.java:35
slip-service · DELETE /admin/carriers/{code} · 기록안됨(actor 받고도 미기록) · service/dispatchgroup/CarrierService.java:52
slip-service · POST /admin/dispatch-groups · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:46
slip-service · PUT /admin/dispatch-groups/{groupNo} · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:55
slip-service · DELETE /admin/dispatch-groups/{groupNo} · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:62
slip-service · PUT /admin/dispatch-groups/{groupNo}/carrier/{carrierCode} · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:71
slip-service · DELETE /admin/dispatch-groups/{groupNo}/carrier · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:79
slip-service · POST /admin/dispatch-groups/{groupNo}/slips · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:82
slip-service · DELETE /admin/dispatch-groups/{groupNo}/slips/{slipNo} · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:96
slip-service · PUT /admin/dispatch-groups/{groupNo}/slips/order · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:105
slip-service · POST /admin/dispatch-groups/{groupNo}/transfer · 기록안됨(외부 아로로지스 전송) · service/dispatchgroup/DispatchGroupService.java:119
slip-service · POST /admin/external-carriers · 기록안됨 · service/external/ExternalCarrierService.java:41
slip-service · PATCH /admin/external-carriers/{id} · 기록안됨 · service/external/ExternalCarrierService.java:65
slip-service · DELETE /admin/external-carriers/{id} · 기록안됨(callerId 받고도 미기록) · service/external/ExternalCarrierService.java:87
slip-service · POST /admin/external-carriers/{id}/restore · 기록안됨 · service/external/ExternalCarrierService.java:93
slip-service · POST /admin/external-dispatches · 기록안됨(외부 발주+SMS 발송) · service/external/ExternalDispatchService.java:58
slip-service · SCHEDULER SlipCollabNotificationOutboxService.drainPending · 기록안됨 · collab/SlipCollabNotificationOutboxService.java:47
slip-service · SCHEDULER SlipEditRequestService.expirePending · 기록안됨 · editrequest/service/SlipEditRequestService.java:262
slip-service · SCHEDULER CompensationPurgeService.purgePhysically · 기록안됨(감사행 물리삭제인데 삭제 사실 미기록) · service/CompensationPurgeScheduler.java:42
slip-service · SCHEDULER CompensationRetentionService.purge · 기록안됨 · service/CompensationRetentionScheduler.java:41
slip-service · SCHEDULER CompensationRetryService.retryEligible · 기록안됨(log.info 만) · service/CompensationRetryScheduler.java:39
slip-service · SCHEDULER DispatchGroupService.retryPendingTransfers · 기록안됨 · service/dispatchgroup/DispatchGroupService.java:165
slip-service · SCHEDULER WarehouseCodeSnapshotService.retryPendingSnapshots · 기록안됨(slips.source_warehouse_code 직접 UPDATE) · service/WarehouseCodeSnapshotService.java:71

===== accounting-service — 기록 안 됨 88건 =====
accounting-service · POST /accounting/entities/{entityId}/edit-request · 기록안됨 · editrequest/service/AccountingEditRequestService.java:77
accounting-service · POST /accounting/edit-requests/{requestId}/approve · 기록안됨 · editrequest/service/AccountingEditRequestService.java:112
accounting-service · POST /accounting/edit-requests/{requestId}/reject · 기록안됨 · editrequest/service/AccountingEditRequestService.java:137
accounting-service · POST /internal/accounting/journals · 기록안됨(🚩V5 가 감사대상으로 선언한 Journal) · service/JournalService.java:77
accounting-service · POST /accounting/journals/ledger-snapshots · 기록안됨 · service/LedgerSnapshotService.java:54
accounting-service · POST /accounting/journals/ledger-history/{batchNo}/copy · 기록안됨 · service/LedgerSnapshotService.java:89
accounting-service · POST /accounting/hometax-export/preview · 기록안됨(이름은 preview 지만 batch 행 저장) · service/HometaxExportService.java:269
accounting-service · POST /accounting/hometax-export/exclusions · 기록안됨 · service/HometaxExportService.java:397
accounting-service · DELETE /accounting/hometax-export/exclusions/{partnerCode} · 기록안됨 · service/HometaxExportService.java:416
accounting-service · GET(상태변경) /accounting/hometax-export/{batchId}/split · 기록안됨(다운로드 마킹 저장) · service/HometaxExportService.java:344
accounting-service · PUT /accounting/bank-transactions/filter-preferences · 기록안됨 · service/UserBankTxnFilterService.java:32
accounting-service · POST /accounting/cash-receipts · 기록안됨 · service/CashReceiptService.java:65
accounting-service · POST /accounting/cash-receipts/from-bank-transactions · 기록안됨 · service/BankDepositReceiptService.java:53
accounting-service · PATCH /accounting/cash-receipts/{id} · 기록안됨 · service/CashReceiptService.java:131
accounting-service · POST /accounting/cash-receipts/{id}/confirm · 기록안됨(분개 확정/회계 반영) · service/CashReceiptService.java:177
accounting-service · POST /accounting/cash-receipts/{id}/cancel · 기록안됨 · service/CashReceiptService.java:202
accounting-service · DELETE /accounting/cash-receipts/{id} · 기록안됨 · service/CashReceiptService.java:222
accounting-service · POST /accounting/codef/connection/institutions · 기록안됨 · service/CodefConnectionService.java:47
accounting-service · PATCH /accounting/codef/connection/institutions/unregister · 기록안됨 · service/CodefConnectionService.java:115
accounting-service · PUT /accounting/codef/scopes · 기록안됨 · service/UserCodefImportScopeService.java:37
accounting-service · POST /accounting/collection-plans · 기록안됨 · service/CollectionPlanService.java:68
accounting-service · PATCH /accounting/collection-plans/{planNo}/status · 기록안됨(상태전이) · service/CollectionPlanService.java:117
accounting-service · POST /accounting/daily-closings · 기록안됨(일마감 실행) · service/DailyClosingService.java:106
accounting-service · PATCH /accounting/daily-closings/{closingDate}/lock · 기록안됨(🚩마감 해제 = 무결성 도메인) · service/DailyClosingService.java:292
accounting-service · POST /admin/accounts/imports/ecount · 기록안됨 · service/EcountAccountImporter.java:50
accounting-service · POST /admin/accounting/bank-accounts/imports/ecount · 기록안됨 · service/EcountBankAccountImporter.java:42
accounting-service · POST /admin/cards/imports/ecount · 기록안됨 · service/EcountCardImporter.java:43
accounting-service · POST /admin/accounting/deposit-reports/imports/ecount · 기록안됨 · service/AbstractEcountMig5CashImporter.java:57
accounting-service · POST /admin/accounting/expense-vouchers/imports/ecount · 기록안됨 · service/AbstractEcountMig5CashImporter.java:57
accounting-service · POST /admin/accounting/fixed-asset-types/imports/ecount · 기록안됨 · service/EcountFixedAssetTypeImporter.java:36
accounting-service · POST /admin/accounting/general-vouchers/imports/ecount · 기록안됨 · service/EcountGeneralVoucherImporter.java:38
accounting-service · POST /admin/accounting/journal-entries/imports/ecount · 기록안됨 · service/EcountJournalEntryImporter.java:41
accounting-service · POST /admin/accounting/orders/imports/ecount · 기록안됨 · service/EcountOrderImporter.java:39
accounting-service · POST /admin/accounting/purchase-slips/imports/ecount · 기록안됨 · service/AbstractEcountSlipImporter.java:42
accounting-service · POST /admin/ecount/reimport/{slice} · 기록안됨(집계 스냅샷까지 갱신) · service/EcountReimportService.java:98
accounting-service · POST /admin/accounting/sales-purchase-summary/imports/ecount · 기록안됨 · service/EcountSalesPurchaseSummaryImporter.java:50
accounting-service · POST /admin/accounting/sales-slips/imports/ecount · 기록안됨 · service/AbstractEcountSlipImporter.java:42
accounting-service · POST /admin/accounting/sales-slips/imports/ecount-line · 기록안됨 · service/EcountSalesSlipLineImporter.java:43
accounting-service · POST /admin/accounting/tax-invoices/imports/ecount · 기록안됨 · service/EcountTaxInvoiceImporter.java:45
accounting-service · POST /accounting/journals · 기록안됨(🚩V5 선언 대상) · service/JournalService.java:77
accounting-service · POST /accounting/journals/{id}/post · 기록안됨(🚩분개 게시=회계 확정) · service/JournalService.java:124
accounting-service · POST /accounting/journals/{id}/reverse · 기록안됨(역분개) · service/JournalService.java:148
accounting-service · POST /admin/accounting/orders/backfill-employee-cross-link · 기록안됨 · service/Mig10OrderEmployeeBackfillService.java:37
accounting-service · POST /admin/accounting/purchase-ledger/imports/ecount · 기록안됨 · service/AbstractEcountMig11LedgerImporter.java:60
accounting-service · POST /admin/accounting/sales-ledger/imports/ecount · 기록안됨 · service/AbstractEcountMig11LedgerImporter.java:60
accounting-service · POST /admin/accounting/cash-disbursements/transform-from-staging · 기록안됨 · service/AbstractMig7CashTransformService.java:58
accounting-service · POST /admin/accounting/cash-receipts/transform-from-staging · 기록안됨 · service/AbstractMig7CashTransformService.java:58
accounting-service · POST /admin/accounting/orders/transform-from-staging · 기록안됨 · service/Mig8OrderTransformService.java:51
accounting-service · POST /admin/accounting/cash-journals/generate-from-disbursements · 기록안됨(분개 대량 생성) · service/Mig9CashJournalService.java:44
accounting-service · POST /admin/accounting/cash-journals/generate-from-receipts · 기록안됨 · service/Mig9CashJournalService.java:61
accounting-service · POST /accounting/closings · 기록안됨(🚩월마감 — PM 실측 확인, V5 선언 대상 AccountingPeriod) · service/MonthEndCloseService.java:103
accounting-service · POST /accounting/closings/{id}/reverse · 기록안됨(🚩역마감) · service/MonthEndCloseService.java:138
accounting-service · POST /accounting/notes-receivable · 기록안됨 · service/NotesReceivableService.java:45
accounting-service · PATCH /accounting/notes-receivable/{noteNo}/status · 기록안됨(actor 인자 자체 없음) · service/NotesReceivableService.java:108
accounting-service · POST /admin/purchase-slips · 기록안됨 · service/PurchaseAccountingSlipService.java:49
accounting-service · POST /admin/purchase-slips/{slipNo}/post · 기록안됨 · service/PurchaseAccountingSlipService.java:78
accounting-service · POST /admin/sales-slips · 기록안됨 · service/SalesAccountingSlipService.java:49
accounting-service · POST /admin/sales-slips/{slipNo}/post · 기록안됨 · service/SalesAccountingSlipService.java:78
accounting-service · POST /accounting/supplier-profiles · 기록안됨 · service/SupplierProfileService.java:199
accounting-service · PUT /accounting/supplier-profiles/{id} · 기록안됨 · service/SupplierProfileService.java:253
accounting-service · PATCH /accounting/supplier-profiles/{id}/primary · 기록안됨(actor 인자 없음) · service/SupplierProfileService.java:316
accounting-service · PUT /accounting/supplier-profiles/{id}/stamp · 기록안됨(인감 등록/교체) · service/SupplierProfileService.java:372
accounting-service · DELETE /accounting/supplier-profiles/{id}/stamp · 기록안됨 · service/SupplierProfileService.java:385
accounting-service · PUT /accounting/supplier-profiles/{id}/logo · 기록안됨 · service/SupplierProfileService.java:415
accounting-service · DELETE /accounting/supplier-profiles/{id}/logo · 기록안됨 · service/SupplierProfileService.java:428
accounting-service · DELETE /accounting/supplier-profiles/{id} · 기록안됨 · service/SupplierProfileService.java:342
accounting-service · POST /admin/tax-invoices/batch-from-sales-slips · 기록안됨(세금계산서 일괄 생성) · service/TaxInvoiceBatchFromSalesSlipsService.java:73
accounting-service · POST /accounting/tax-invoices/batch/preview · 기록안됨(deprecated 경로, batch 행 저장) · service/HometaxExportService.java:269
accounting-service · POST /accounting/tax-invoices/batch/exclusions · 기록안됨 · service/HometaxExportService.java:397
accounting-service · DELETE /accounting/tax-invoices/batch/exclusions/{partnerCode} · 기록안됨 · service/HometaxExportService.java:416
accounting-service · GET(상태변경) /accounting/tax-invoices/batch/{batchId}/excel · 기록안됨(다운로드 마킹) · service/HometaxExportService.java:344
accounting-service · POST /accounting/tax-invoices · 기록안됨 · service/TaxInvoiceService.java:100
accounting-service · POST /accounting/tax-invoices/{id}/issue · 기록안됨(🚩DRAFT→ISSUED + 발행번호 채번 + 자동 분개 게시) · service/TaxInvoiceService.java:228
accounting-service · POST /accounting/tax-invoices/{id}/cancel · 기록안됨(🚩ISSUED→CANCELLED + 자동 역분개) · service/TaxInvoiceService.java:349
accounting-service · POST /accounting/tax-invoices/issue-request · 기록안됨 · service/TaxInvoiceService.java:300
accounting-service · POST /admin/tax-invoices/inbound · 기록안됨 · service/TaxInvoiceInboundService.java:59
accounting-service · POST /admin/tax-invoices/inbound/{id}/attachments · 기록안됨 · service/InboundTaxInvoiceAttachmentService.java:36
accounting-service · POST /accounting/cash-receipts/{receiptId}/collab/coedit/update · 기록안됨 · shared/collab-core CollabCoeditService.java:41
accounting-service · POST /accounting/cash-receipts/{receiptId}/collab/coedit/awareness · 기록안됨(ephemeral) · shared/collab-core CollabCoeditService.java:63
accounting-service · POST /accounting/journals/{journalId}/collab/comments · 기록안됨 · shared/collab-core CollabCommentService.java:55
accounting-service · DELETE /accounting/journals/{journalId}/collab/comments/{commentId} · 기록안됨 · shared/collab-core CollabCommentService.java:88
accounting-service · POST /accounting/journals/{journalId}/collab/comments/{commentId}/resolve · 기록안됨 · shared/collab-core CollabCommentService.java:75
accounting-service · POST /accounting/journals/{journalId}/collab/edits · 기록안됨(🚩분개 본문 실제 변경, journal_collab_suggestions 에만) · collab/JournalCollabEditService.java:59
accounting-service · POST /accounting/journals/{journalId}/collab/coedit/update · 기록안됨 · shared/collab-core CollabCoeditService.java:41
accounting-service · POST /accounting/journals/{journalId}/collab/coedit/awareness · 기록안됨 · shared/collab-core CollabCoeditService.java:63
accounting-service · POST /accounting/journals/{journalId}/collab/presence/join · 기록안됨(인메모리) · web/collab/JournalCollabController.java:240
accounting-service · POST /accounting/journals/{journalId}/collab/presence/leave · 기록안됨(인메모리) · web/collab/JournalCollabController.java:260
accounting-service · BOOT CommandLineRunner JournalSeeder(@Profile dev) · 기록안됨(분개 50건 직접 INSERT) · seed/JournalSeeder.java:103

===== partner-order-service — 기록 안 됨 13건 =====
partner-order-service · POST /admin/partner-orders/mig8-import · 기록안됨(JdbcTemplate 원시 INSERT 대량) · mig8/service/Mig8OrderImportService.java:52
partner-order-service · POST /api/v1/partner-orders/{orderId}/collab/comments/{commentId}/resolve · 기록안됨(해결자 actor 를 받지도 저장하지도 않음) · shared/collab-core CollabCommentService.java:75
partner-order-service · POST /api/v1/partner-orders/{orderId}/collab/coedit/update · 기록안됨(노드-로컬 메모리) · shared/collab-core CollabCoeditService.java:41
partner-order-service · POST /api/v1/partner-orders/{orderId}/collab/coedit/awareness · 기록안됨(ephemeral) · shared/collab-core CollabCoeditService.java:63
partner-order-service · POST /api/v1/partner-orders/{orderId}/collab/presence/join · 기록안됨(인메모리) · shared/realtime-abstraction PresenceService.java:54
partner-order-service · POST /api/v1/partner-orders/{orderId}/collab/presence/leave · 기록안됨 · shared/realtime-abstraction PresenceService.java:87
partner-order-service · POST /api/v1/partner-orders/{id}/convert-to-slip · 기록안됨(🚩재고 예약+전표 발행+상태 전이 동시, 감사·이력 0) · service/PartnerOrderConvertService.java:106
partner-order-service · POST /api/v1/partner-orders/convert-to-slip-merge · 기록안됨(🚩N건 병합 전환) · service/PartnerOrderMergeConvertService.java:104
partner-order-service · POST /api/v1/partner-orders/{id}/hold · 기록안됨(actorId/actorName 받고도 본문에서 미사용) · service/PartnerOrderHoldService.java:48
partner-order-service · POST /api/v1/partner-orders/{id}/release · 기록안됨(actor 인자 미사용) · service/PartnerOrderHoldService.java:71
partner-order-service · PATCH /api/v1/auth/partner-tutorial · 기록안됨(저위험) · service/TutorialStateService.java:48
partner-order-service · SCHEDULER PartnerOrderEditRequestService.expirePending(1h) · 기록안됨(PENDING→EXPIRED 일괄) · editrequest/service/PartnerOrderEditRequestService.java:251
partner-order-service · BOOT CommandLineRunner PartnerOrderSeeder(@Profile dev) · 기록안됨(주문 30건 직접 INSERT) · seed/PartnerOrderSeeder.java:142

===== dc-config-service — 기록기만 존재(호출자 없음) 3건 =====
dc-config-service · POST /api/v1/dc-config/admin/import · 기록기만존재 · service/DcConfigImportService.java:101 (기록기 audit/service/DcConfigAuditLogService.java:31 — 전 서비스 grep 결과 자기 선언줄 외 참조 0)
dc-config-service · PUT /api/v1/estimate-config · 기록기만존재(VAT율·카드수수료율·할인율 등 전역 20개 파라미터) · service/EstimateConfigService.java:25
dc-config-service · PATCH /api/v1/partner-dc-configs/{partnerCode} · 기록기만존재(🚩V3 가 감사 의무를 명문화한 바로 그 필드들) · service/DcConfigService.java:89

===== product-service — 기록기만 존재(호출자 없음) 44건 — 전건 =====
product-service · 공통근거: ProductAuditLogService(audit/service/ProductAuditLogService.java:44, recordOverlayPatch:63 / recordBatch:86) 의 쓰기 호출자가 전 서비스 grep 에서 0건. 참조는 자기 선언과 읽기 전용 ProductAuditLogController.java:4,:33 뿐 ⟹ GET /products/{productId}/audit-logs 는 영원히 빈 목록
product-service · POST /products/{productId}/edit-request · 기록기만존재 · editrequest/service/ProductEditRequestService.java:91
product-service · POST /products/{productId}/edit-request/{requestId}/approve · 기록기만존재 · editrequest/service/ProductEditRequestService.java:116
product-service · POST /products/{productId}/edit-request/{requestId}/reject · 기록기만존재 · editrequest/service/ProductEditRequestService.java:129
product-service · SCHEDULER ProductEditRequestService.expirePending(1h) · 기록기만존재 · editrequest/service/ProductEditRequestService.java:175
product-service · POST /products/categories · 기록기만존재 · service/CategoryService.java:38
product-service · PATCH /products/categories/{id} · 기록기만존재 · service/CategoryService.java:51
product-service · DELETE /products/categories/{id} · 기록기만존재 · service/CategoryService.java:72
product-service · POST /api/v1/classifications · 기록기만존재 · service/ClassificationService.java:42
product-service · PATCH /api/v1/classifications/{id} · 기록기만존재 · service/ClassificationService.java:59
product-service · DELETE /api/v1/classifications/{id} · 기록기만존재 · service/ClassificationService.java:81
product-service · POST /admin/products/imports/ecount · 기록기만존재(products 대량 upsert) · service/EcountProductImporter.java:59
product-service · PUT /api/v1/products/admin/price-change-schedule/{category} · 기록기만존재(컨트롤러가 엔티티 직접 update) · web/PriceChangeScheduleAdminController.java:105
product-service · POST /api/v1/products/admin/sync · 기록기만존재(insert/update/softDelete 대량) · web/ProductAdminController.java:66
product-service · PATCH /api/v1/products/{modelCode}/usage · 기록기만존재 · service/ProductService.java:703
product-service · DELETE /api/v1/products/{modelCode}/usage · 기록기만존재 · service/ProductService.java:767
product-service · PATCH /api/v1/products/{modelCode}/variable-discount · 기록기만존재 · service/ProductService.java:731
product-service · PATCH /api/v1/products/{modelCode}/goods-type · 기록기만존재 · service/ProductService.java:738
product-service · PATCH /api/v1/products/{modelCode}/classification · 기록기만존재(🚩고정DC 까지 동시 변경 — 금액 영향) · service/ProductService.java:747
product-service · PATCH /api/v1/products/{modelCode}/fixed-discount · 기록기만존재(🚩고정DC율 인라인 자동저장) · service/ProductService.java:761
product-service · DELETE /api/v1/products/{modelCode}/variable-discount · 기록기만존재 · service/ProductService.java:780
product-service · POST /api/v1/products/{modelCode}/specs · 기록기만존재 · service/ProductSpecService.java:65
product-service · PATCH /api/v1/products/{modelCode}/specs/{specId} · 기록기만존재 · service/ProductSpecService.java:77
product-service · DELETE /api/v1/products/{modelCode}/specs/{specId} · 기록기만존재 · service/ProductSpecService.java:90
product-service · PATCH /api/v1/products/{modelCode}/specs/reorder · 기록기만존재 · service/ProductSpecService.java:106
product-service · POST /api/v1/spec-key-templates/{templateId}/apply-to-existing · 기록기만존재(다수 제품 일괄 생성) · service/ProductSpecService.java:124
product-service · PUT /api/v1/products/{modelCode}/components · 기록기만존재(구성품 replace-all) · service/BundleComponentService.java:224
product-service · PUT /api/v1/products/display-orders · 기록기만존재 · service/BundleComponentService.java:609
product-service · POST /products · 기록기만존재 · service/ProductService.java:540
product-service · PATCH /products/{id} · 기록기만존재(제품 마스터 필드별 수정) · service/ProductService.java:588
product-service · PATCH /products/{id}/price · 기록기만존재(🚩audit 도 price_history 도 안 씀) · service/ProductService.java:654
product-service · PUT /products/{id}/tags · 기록기만존재(태그 전량 교체) · service/ProductService.java:672
product-service · POST /products/{id}/discontinue · 기록기만존재(상태 전이) · service/ProductService.java:678
product-service · POST /products/{id}/reactivate · 기록기만존재 · service/ProductService.java:685
product-service · DELETE /products/{id} · 기록기만존재 · service/ProductService.java:794
product-service · POST /products/internal/resolve-ecount-aliases · 기록기만존재(INSERT ON CONFLICT DO UPDATE) · service/EcountAliasReservationService.java:24
product-service · POST /products/internal/release-ecount-alias-reservations · 기록기만존재(DELETE) · service/EcountAliasReservationService.java:85
product-service · POST /api/v1/quantity-sync-rules · 기록기만존재 · service/QuantitySyncRuleService.java:282
product-service · PUT /api/v1/quantity-sync-rules/{ruleKey} · 기록기만존재 · service/QuantitySyncRuleService.java:306
product-service · DELETE /api/v1/quantity-sync-rules/{ruleKey} · 기록기만존재 · service/QuantitySyncRuleService.java:331
product-service · SCHEDULER ProductSheetSyncScheduler.scheduledSync(5분 주기) · 기록기만존재(🚩최대 변경원) · scheduler/ProductSheetSyncScheduler.java:75
product-service · EVENTLISTENER ProductSheetSyncScheduler.onApplicationReady · 기록기만존재 · scheduler/ProductSheetSyncScheduler.java:121
product-service · BOOT CommandLineRunner HvacProductSeeder · 기록기만존재 · seed/HvacProductSeeder.java:113
product-service · BOOT CommandLineRunner PriceHistorySeeder · 기록기만존재 · seed/PriceHistorySeeder.java:71
product-service · BOOT CommandLineRunner ProductSeedRunner · 기록기만존재 · seed/ProductSeedRunner.java:58

===== inventory-service — 기록 안 됨 39건 =====
inventory-service · POST /inventory/inspections/{slipId}/attachments · 기록안됨 · attachment/service/InspectionAttachmentService.java:79
inventory-service · DELETE /inventory/inspections/{slipId}/attachments/{attachmentId} · 기록안됨 · attachment/service/InspectionAttachmentService.java:165
inventory-service · POST /warehouse/audit/dps-history · 기록안됨 · service/DpsSaveHistoryService.java:48
inventory-service · POST /admin/inventory/stock-transfers/imports/ecount · 기록안됨 · service/EcountStockTransferImporter.java:39
inventory-service · POST /admin/warehouses/imports/ecount · 기록안됨(🚩WarehouseService 우회 JDBC 직접 UPSERT — PATCH 경로는 기록되는데 비대칭) · service/EcountWarehouseImporter.java:39
inventory-service · GET(상태변경) /inventory/inbound-inspections/{slipId} · 기록안됨(미존재 시 행 생성) · service/InboundInspectionService.java:121
inventory-service · POST /inventory/inbound-inspections/{slipId}/inspect · 기록안됨 · service/InboundInspectionService.java:171
inventory-service · POST /inventory/inbound-inspections/{slipId}/complete · 기록안됨(🚩StockLot 생성+StockMovement+StockBalance 실 재고 변동) · service/InboundInspectionService.java:223
inventory-service · POST /inventory/audits · 기록안됨(실사 생성) · service/InventoryAuditService.java:110
inventory-service · POST /inventory/audits/{id}/lines · 기록안됨(V4 는 lines[idx].actualQty 기록 상정) · service/InventoryAuditService.java:184
inventory-service · PUT /inventory/audits/{id}/lines/{lineId} · 기록안됨 · service/InventoryAuditService.java:208
inventory-service · POST /inventory/audits/{id}/edit-requests · 기록안됨 · realtime/service/InventoryEditRequestService.java:76
inventory-service · POST /inventory/audits/edit-requests/{requestId}/approve · 기록안됨(잠금 해제 권한 결정) · realtime/service/InventoryEditRequestService.java:107
inventory-service · POST /inventory/audits/edit-requests/{requestId}/reject · 기록안됨 · realtime/service/InventoryEditRequestService.java:119
inventory-service · POST /inventory/products/{productId}/safety-stock · 기록안됨 · service/SafetyStockService.java:79
inventory-service · POST /inventory/lots/inbound · 기록안됨(stock_movements 만) · service/StockService.java:186
inventory-service · POST /inventory/reserve · 기록안됨(stock_movements 만) · service/StockService.java:240
inventory-service · POST /inventory/release · 기록안됨 · service/StockService.java:292
inventory-service · POST /inventory/deduct · 기록안됨 · service/StockService.java:344
inventory-service · POST /inventory/adjust · 기록안됨(🚩실사 조정 = 수량 직접 가감) · service/StockService.java:407
inventory-service · POST /inventory/instances · 기록안됨 · service/StockInstanceService.java:72
inventory-service · POST /inventory/instances/batch · 기록안됨 · service/StockInstanceService.java:115
inventory-service · POST /inventory/instances/reserve-batch · 기록안됨 · service/StockInstanceService.java:167
inventory-service · POST /inventory/instances/release-batch · 기록안됨 · service/StockInstanceService.java:253
inventory-service · POST /inventory/instances/recall-batch · 기록안됨 · service/StockInstanceService.java:283
inventory-service · POST /inventory/instances/unrecall-batch · 기록안됨 · service/StockInstanceService.java:383
inventory-service · POST /inventory/instances/resell-batch · 기록안됨 · service/StockInstanceService.java:413
inventory-service · POST /inventory/transfers · 기록안됨 · service/StockTransferService.java:52
inventory-service · POST /inventory/transfers/{id}/approve · 기록안됨 · service/StockTransferService.java:88
inventory-service · POST /inventory/transfers/{id}/reject · 기록안됨 · service/StockTransferService.java:104
inventory-service · POST /inventory/transfers/{id}/ship · 기록안됨 · service/StockTransferService.java:118
inventory-service · POST /inventory/transfers/{id}/receive · 기록안됨 · service/StockTransferService.java:132
inventory-service · POST /inventory/transfers/{id}/confirm · 기록안됨 · service/StockTransferService.java:147
inventory-service · POST /inventory/transfers/{id}/cancel · 기록안됨 · service/StockTransferService.java:162
inventory-service · POST /inventory/warehouses · 기록안됨(🚩update/delete/restore/revert 는 기록되는데 create 만 누락) · service/WarehouseService.java:111
inventory-service · SCHEDULER InventoryEditRequestService.expirePending(1h) · 기록안됨 · realtime/service/InventoryEditRequestService.java:175
inventory-service · BOOT CommandLineRunner InventoryAuditSeeder · 기록안됨 · seed/InventoryAuditSeeder.java:78
inventory-service · BOOT CommandLineRunner StockBalanceSeeder · 기록안됨 · seed/StockBalanceSeeder.java:141
inventory-service · BOOT CommandLineRunner StockInstanceSeeder · 기록안됨 · seed/StockInstanceSeeder.java:93

===== partner-service — 기록 안 됨 13건 =====
partner-service · POST /admin/partners/imports/ecount · 기록안됨(partners 7,314행 규모 갱신) · service/EcountPartnerImporter.java importCsv
partner-service · POST /admin/partners/imports/ecount-xlsx · 기록안됨 · service/EcountPartnerImporter.java importXlsx
partner-service · DELETE /admin/partners/{partnerCode} · 기록안됨(삭제가 감사에도 버전이력에도 없음) · service/PartnerService.java:406
partner-service · POST /admin/partners/{partnerCode}/restore · 기록안됨 · service/PartnerService.java:440
partner-service · POST /api/v1/partners/admin/blocks/import · 기록안됨 · service/PartnerBlockImportService.java
partner-service · POST /internal/partners/find-by-codes · 기록안됨(조회 전용, 상태변경 없음) · controller/PartnerInternalController.java:121
partner-service · POST /internal/partners/lookup-by-ids · 기록안됨(조회 전용) · controller/PartnerInternalController.java:140
partner-service · POST /admin/partners/{partnerCode}/visit-attachments · 기록안됨 · service/PartnerAttachmentService.java:71
partner-service · DELETE /admin/partners/{partnerCode}/visit-attachments/{attachmentId} · 기록안됨(Javadoc 은 "감사 추적 위해 보존" 이라 적었으나 감사행 없음) · service/PartnerAttachmentService.java:139
partner-service · POST /api/v1/partners/{partnerId}/attachments · 기록안됨 · service/PartnerAttachmentService.java:71
partner-service · DELETE /api/v1/partners/attachments/{attachmentId} · 기록안됨 · service/PartnerAttachmentService.java:139
partner-service · BOOT CommandLineRunner PartnerSeeder(@Profile dev + 프로퍼티 이중가드) · 기록안됨 · seed/PartnerSeeder.java:119
partner-service · BOOT CommandLineRunner PartnerAttachmentSeeder(이중가드) · 기록안됨 · seed/PartnerAttachmentSeeder.java:77

===== partner-service — 기록기만 존재(호출자 없음) 2건 =====
partner-service · POST /api/v1/partners/admin/blocks · 기록기만존재(🚩V5:15-16 과 PartnerAuditLogService:25-26 이 BlockedPartner 를 감사대상으로 명시했으나 호출 0) · service/PartnerBlockService.java:66
partner-service · DELETE /api/v1/partners/admin/blocks/{id} · 기록기만존재 · service/PartnerBlockService.java:108

===== user-service — 기록 안 됨 16건 =====
user-service · POST /api/v1/admin/users/{id}/disable · 기록안됨(퇴사 soft-delete + 계정 비활성화) · service/EmployeeProvisioningService.java:299
user-service · POST /api/v1/admin/users/{id}/unlock · 기록안됨(🚩계정 잠금 해제가 어느 DB 에도 안 남음 — auth-service 수신측도 무기록) · service/EmployeeProvisioningService.java:318
user-service · POST /api/v1/admin/users/{id}/signature/handoff-token · 기록안됨(토큰 발급·기존 토큰 무효화) · service/EmployeeSignatureHandoffService.java:52
user-service · POST /admin/departments/imports/ecount · 기록안됨 · service/EcountDepartmentImporter.java
user-service · POST /admin/user/employee-cards/imports/ecount · 기록안됨 · service/EcountEmployeeCardImporter.java
user-service · POST /admin/user/employees/imports/ecount · 기록안됨(🚩인사 마스터 대량 갱신, V4:9-10 의 법적 보존 의무와 상충) · service/EcountEmployeeImporter.java
user-service · POST /admin/user/payroll-employees/imports/ecount · 기록안됨 · service/EcountPayrollEmployeeImporter.java
user-service · POST /admin/user/employee-account-links/preview · 기록안됨(이름은 preview 지만 계획행 saveAll) · service/EmployeeAccountLinkReconciliationService.java:47
user-service · POST /admin/user/employee-account-links/{planKey}/apply · 기록안됨(직원↔계정 신원 매핑 변경) · service/EmployeeAccountLinkReconciliationService.java:88
user-service · POST /users/employees/lookup · 기록안됨(조회 전용) · web/EmployeeController.java:97
user-service · POST /users/employees/{id}/terminate · 기록안됨(퇴사 처리) · service/EmployeeProvisioningService.java:145
user-service · POST /internal/users/verify-bulk · 기록안됨(조회 전용) · web/InternalUserController.java:187
user-service · POST /internal/users/verify-active-bulk · 기록안됨(조회 전용) · web/InternalUserController.java:208
user-service · POST /internal/users/display-names · 기록안됨(조회 전용) · web/InternalUserController.java:230
user-service · POST /internal/users/signatures · 기록안됨(조회 전용) · web/InternalUserController.java:259
user-service · BOOT CommandLineRunner OrgChartSeeder · 기록안됨(⚠️@Profile 가드 없이 프로퍼티 가드만 — partner 시더와 다름) · seed/OrgChartSeeder.java:57

===== user-service — 기록기만 존재(호출자 없음) 4건 =====
user-service · POST /api/v1/admin/users · 기록기만존재(기록기 audit/service/UserAuditLogService.java:37 — 전 서비스 grep 결과 자기 선언줄 외 참조 0) · service/EmployeeProvisioningService.java:205
user-service · PATCH /api/v1/admin/users/{id} · 기록기만존재(이름·이메일·전화·부서 변경이 log.info 만) · service/EmployeeProvisioningService.java:264
user-service · POST /users/employees · 기록기만존재 · service/EmployeeProvisioningService.java:52
user-service · PATCH /users/employees/{id} · 기록기만존재 · service/EmployeeProvisioningService.java:87

===== auth-service — 기록 안 됨 39건 (감사 테이블 자체가 없음) =====
auth-service · 공통근거: auth_db 에 audit/history/log 계열 테이블이 flyway_schema_history 뿐. src/main/java 에 감사 entity/repository 0(도메인 13개 전수 확인)
auth-service · POST /auth/internal/approval-line/authorize · 기록안됨(권한 판정 조회, 상태변경 없음) · web/ApprovalLineAuthorizeController.java:34
auth-service · POST /auth/admin/approval-line-configs · 기록안됨(결재선 단계 추가) · service/ApprovalLineConfigService.java:105
auth-service · DELETE /auth/admin/approval-line-configs/{id} · 기록안됨 · service/ApprovalLineConfigService.java:125
auth-service · PUT /auth/admin/approval-line-configs/{id} · 기록안됨 · service/ApprovalLineConfigService.java:140
auth-service · POST /auth/admin/approval-line-configs/{roleId}/approvers · 기록안됨(결재자 추가 = 권한성 변경) · service/ApprovalLineApproverService.java:36
auth-service · DELETE /auth/admin/approval-line-configs/{roleId}/approvers/{approverId} · 기록안됨 · service/ApprovalLineApproverService.java:56
auth-service · PUT /auth/admin/approval-line-configs/{id}/label · 기록안됨 · service/ApprovalLineConfigService.java:170
auth-service · PUT /auth/admin/approval-line-configs/reorder · 기록안됨 · service/ApprovalLineConfigService.java:201
auth-service · POST /auth/login · 기록안됨(🚩로그인 시도 이력 테이블 없음 — 성공은 markLogin, 실패는 카운터 증가만) · service/AuthService.java:77
auth-service · POST /auth/logout · 기록안됨(쿠키 만료 헤더만, 토큰 무효화·세션 폐기 없음) · web/AuthController.java:69
auth-service · POST /auth/register · 기록안됨(계정 생성) · service/AuthService.java:137
auth-service · POST /auth/internal/accounts · 기록안됨(internal 토큰 경로 계정 생성) · service/AuthService.java:168
auth-service · PATCH /auth/internal/accounts/{id}/role · 기록안됨(🚩actor 파라미터 자체 없음) · service/AuthService.java:214
auth-service · PATCH /auth/internal/accounts/{id}/display-name · 기록안됨 · service/AuthService.java:298
auth-service · PATCH /auth/internal/accounts/{id}/disable · 기록안됨(operatorId 가 실사용자 아닌 InternalTokenFilter.INTERNAL_PRINCIPAL 상수) · service/AuthService.java:319
auth-service · DELETE /auth/internal/accounts/{id} · 기록안됨(🚩계정 삭제에 actor 파라미터 없음) · service/AuthService.java:326
auth-service · POST /auth/internal/accounts/{id}/unlock · 기록안됨(🚩actor 파라미터 없음) · service/AuthService.java:341
auth-service · PATCH /auth/internal/accounts/{id}/department-name · 기록안됨(JWT departmentName claim → 인가에 사용) · service/AuthService.java:313
auth-service · POST /auth/password/reset/request · 기록안됨 · service/PasswordResetService.java:57
auth-service · POST /auth/password/reset/confirm · 기록안됨(비밀번호 교체) · service/PasswordResetService.java:87
auth-service · POST /auth/password/change · 기록안됨 · service/PasswordResetService.java:114
auth-service · PATCH /auth/admin/accounts/{id}/unlock · 기록안됨(관리자 잠금 해제인데 actor 미전달) · service/PasswordResetService.java:138
auth-service · POST /auth/password-reset/request · 기록안됨(PasswordController 와 중복 표면) · web/PasswordResetController.java:55
auth-service · POST /auth/password-reset/confirm · 기록안됨 · web/PasswordResetController.java:77
auth-service · PUT /auth/admin/permissions/account/{accountId} · 기록안됨(🚩actorId 를 인자로 받고도 본문에서 한 번도 안 씀) · service/AccountPermissionService.java:207
auth-service · POST /auth/admin/permissions/account/{accountId}/apply-template · 기록안됨 · service/AccountPermissionService.java:255
auth-service · POST /auth/admin/permissions/account/{accountId}/copy-from · 기록안됨(타 계정 권한 복제) · service/AccountPermissionService.java:287
auth-service · PUT /auth/admin/permissions/templates/{roleCode} · 기록안됨(🚩전 계정 파급) · service/AccountPermissionService.java:340
auth-service · POST /auth/admin/permissions/bulk · 기록안됨(대량 권한 일괄 적용) · service/AccountPermissionService.java:384
auth-service · PUT /auth/admin/permissions · 기록안됨(log.info 만) · service/DynamicPermissionService.java:248
auth-service · POST /auth/admin/permissions/batch · 기록안됨(log.info 만) · service/DynamicPermissionService.java:311
auth-service · POST /auth/admin/permission-groups · 기록안됨(actor 파라미터 없음) · service/PermissionGroupService.java:55
auth-service · PUT /auth/admin/permission-groups/{id} · 기록안됨(actor 미수신) · service/PermissionGroupService.java:75
auth-service · DELETE /auth/admin/permission-groups/{id} · 기록안됨(actor 미수신) · service/PermissionGroupService.java:94
auth-service · PUT /auth/admin/permission-groups/{id}/permissions · 기록안됨(그룹 권한 매트릭스, actor 미수신) · service/GroupPermissionService.java:85
auth-service · PUT /auth/admin/permission-groups/{id}/delegations · 기록안됨(🚩MASTER 위임 축) · service/GroupPermissionService.java:150
auth-service · POST /auth/admin/accounts/{accountId}/groups · 기록안됨(🚩역할이 그룹 배속으로만 표현됨 — 로그인 role 산출의 유일 근거) · service/AccountGroupService.java:79
auth-service · DELETE /auth/admin/accounts/{accountId}/groups/{groupId} · 기록안됨(🚩권한 회수) · service/AccountGroupService.java:113
auth-service · PUT /auth/internal/permissions/role-grant · 기록안됨(코드가 스스로 "감사 로깅"이라 부르나 실체는 log.warn 한 줄) · web/PermissionInternalController.java:179

===== partner-auth-service — 기록 안 됨 6건 =====
partner-auth-service · PATCH /api/v1/partner-approvals/{partnerCode}/status · 기록안됨(🚩승인·차단·잠금해제 전이인데 actor 파라미터 자체 없음) · service/PartnerApprovalService.java:114
partner-auth-service · POST /api/v1/partner-approvals/{partnerCode}/reset-password · 기록안됨(🚩관리자가 남의 비밀번호를 강제 초기화하는데 누가 했는지 안 남음) · service/PartnerApprovalService.java:141
partner-auth-service · POST /api/v1/auth/partner-register · 기록안됨 · service/PartnerAuthService.java:139
partner-auth-service · PATCH /api/v1/auth/partner-password · 기록안됨(비밀번호 설정·변경) · service/PartnerAuthService.java:153
partner-auth-service · POST /api/v1/auth/partner-temp-password · 기록안됨(임시 비밀번호 SMS 발송 = 계정 탈취 표면, rate limit 만) · service/PartnerAuthService.java:282
partner-auth-service · PATCH /api/v1/auth/partner-tutorial · 기록안됨(저위험) · service/PartnerAuthService.java:387

===== groupware-service — 기록기만 존재(호출자 없음) 28건 =====
groupware-service · 공통근거: GroupwareAuditLog(audit/domain/GroupwareAuditLog.java:39) + GroupwareAuditLogRepository(audit/repository/GroupwareAuditLogRepository.java:13) 존재하나 전 서비스 grep 에서 자기 선언줄 1건뿐 — 주입 지점 0. V2__add_groupware_audit_logs.sql:8 이 스스로 "실 mutation 호출자 통합은 향후 PR" 이라 명시. groupware_audit_logs 0행·groupware_edit_requests 0행 실측
groupware-service · POST /admin/groupware/approvals · 기록기만존재 · service/ApprovalLineService.java:85
groupware-service · PUT /admin/groupware/approvals/{approvalId}/approve · 기록기만존재(🚩결재 승인) · service/ApprovalLineService.java:288
groupware-service · PUT /admin/groupware/approvals/{approvalId}/reject · 기록기만존재(🚩결재 반려) · service/ApprovalLineService.java:329
groupware-service · POST /admin/groupware/messages · 기록기만존재 · service/MessageService.java:45
groupware-service · POST /admin/groupware/messages/bulk · 기록기만존재 · service/MessageService.java:80
groupware-service · PUT /admin/groupware/messages/{messageId}/read · 기록기만존재 · service/MessageService.java:184
groupware-service · POST /admin/groupware/schedules · 기록기만존재 · service/ScheduleService.java:33
groupware-service · PUT /admin/groupware/schedules/{scheduleId} · 기록기만존재 · service/ScheduleService.java:84
groupware-service · DELETE /admin/groupware/schedules/{scheduleId} · 기록기만존재 · service/ScheduleService.java:130
groupware-service · POST /admin/groupware/approvals/{approvalId}/attachments · 기록기만존재 · service/ApprovalAttachmentService.java:52
groupware-service · POST /admin/groupware/approvals/{approvalId}/attachments/file · 기록기만존재 · service/ApprovalAttachmentService.java:93
groupware-service · DELETE /admin/groupware/approvals/{approvalId}/attachments/{attachmentId} · 기록기만존재 · service/ApprovalAttachmentService.java:131
groupware-service · POST /admin/groupware/approvals/{approvalId}/collab/comments · 기록기만존재 · controller/GroupwareApprovalCollabController.java:102
groupware-service · DELETE /admin/groupware/approvals/{approvalId}/collab/comments/{commentId} · 기록기만존재 · controller/GroupwareApprovalCollabController.java:140
groupware-service · POST /admin/groupware/approvals/{approvalId}/collab/comments/{commentId}/resolve · 기록기만존재 · controller/GroupwareApprovalCollabController.java:154
groupware-service · POST /admin/groupware/approvals/{approvalId}/collab/coedit/update · 기록기만존재(인메모리, DB 미변경) · shared/collab-core CollabCoeditService.java:41
groupware-service · POST /admin/groupware/approvals/{approvalId}/collab/coedit/awareness · 기록기만존재(SSE 전용) · shared/collab-core CollabCoeditService.java:63
groupware-service · POST /admin/groupware/approvals/{approvalId}/collab/presence/join · 기록기만존재(인메모리) · shared/realtime-abstraction PresenceService.java:26
groupware-service · POST /admin/groupware/approvals/{approvalId}/collab/presence/leave · 기록기만존재(인메모리) · controller/GroupwareApprovalCollabController.java:258
groupware-service · POST /admin/groupware/approval-templates · 기록기만존재 · service/ApprovalTemplateService.java:69
groupware-service · PUT /admin/groupware/approval-templates/{templateId} · 기록기만존재 · service/ApprovalTemplateService.java:82
groupware-service · DELETE /admin/groupware/approval-templates/{templateId} · 기록기만존재 · service/ApprovalTemplateService.java:102
groupware-service · POST /admin/groupware/document-templates · 기록기만존재 · service/DocumentTemplateService.java:70
groupware-service · PUT /admin/groupware/document-templates/{id} · 기록기만존재 · service/DocumentTemplateService.java:93
groupware-service · DELETE /admin/groupware/document-templates/{id} · 기록기만존재 · service/DocumentTemplateService.java:150
groupware-service · POST /admin/groupware/document-templates/{id}/activate · 기록기만존재(DRAFT→ACTIVE 상태 전이) · service/DocumentTemplateService.java:114
groupware-service · POST /admin/groupware/document-templates/{id}/deactivate · 기록기만존재(actor 인자조차 없음) · service/DocumentTemplateService.java:142
groupware-service · BOOT CommandLineRunner GroupwareSeeder(이중가드) · 기록기만존재 · seed/GroupwareSeeder.java:171

===== notification-service — 기록기만 존재(호출자 없음) 11건 =====
notification-service · 공통근거: NotificationAuditLogService(audit/service/NotificationAuditLogService.java:34, implements AuditLogRecorder) 완성돼 있으나 전 서비스 grep 에서 자기 선언줄 외 참조 0 — 주입 지점 없음. notification_audit_logs 0행 실측
notification-service · POST /admin/notification/aligo/address-book/sync · 기록기만존재 · service/AligoAddressBookSyncService.java:58
notification-service · POST /api/v1/notification/admin/chat-rooms · 기록기만존재 · service/ChatRoomMappingService.java:88
notification-service · POST /api/v1/notification/admin/chat-rooms/import · 기록기만존재(CSV 일괄 갱신) · service/ChatRoomImportService.java:103
notification-service · DELETE /api/v1/notification/admin/chat-rooms/{id} · 기록기만존재 · service/ChatRoomMappingService.java:105
notification-service · POST /admin/notifications/dispatch-batch/preview · 기록기만존재(dryRun, 상태변경 없음) · service/DispatchBatchPreviewService.java:76
notification-service · POST /admin/notifications/dispatch-sms/history · 기록기만존재 · service/DispatchSmsSaveHistoryService.java:52
notification-service · POST /api/v1/push-tokens · 기록기만존재 · service/PushDeviceTokenService.java:35
notification-service · DELETE /api/v1/push-tokens/{token} · 기록기만존재 · service/PushDeviceTokenService.java:65
notification-service · POST /notifications/{id}/acknowledge · 기록기만존재 · service/NotificationCenterService.java:64
notification-service · POST /internal/notifications · 기록기만존재 · service/NotificationCenterService.java:34
notification-service · BOOT CommandLineRunner NotificationHistorySeeder(이중가드) · 기록기만존재 · seed/NotificationHistorySeeder.java:87

===== dashboard-service — 기록 안 됨 14건 — 전건 (감사 테이블·클래스 0) =====
dashboard-service · 공통근거: 마이그레이션 V1~V7 전체에 audit 테이블 CREATE 없음. dashboard_db 실제 테이블 8개(app_notice/app_notice_image/app_release/kpi_snapshots/realtime_stocks/sales_aggregates/shedlock/flyway_schema_history). 남는 것은 BaseEntity 7 뿐
dashboard-service · POST /app/notices · 기록안됨 · service/AppNoticeService.java:76
dashboard-service · PUT /app/notices/{id} · 기록안됨(변경 전/후 값 미보존) · service/AppNoticeService.java:88
dashboard-service · DELETE /app/notices/{id} · 기록안됨 · service/AppNoticeService.java:101
dashboard-service · POST /app/notices/{id}/images · 기록안됨 · service/AppNoticeService.java:110
dashboard-service · PUT /app/notices/{id}/images/order · 기록안됨 · service/AppNoticeService.java:135
dashboard-service · DELETE /app/notices/{noticeId}/images/{imageId} · 기록안됨 · service/AppNoticeService.java:152
dashboard-service · POST /app/releases · 기록안됨 · service/AppReleaseService.java:55
dashboard-service · PUT /app/releases/{id} · 기록안됨 · service/AppReleaseService.java:75
dashboard-service · POST /app/releases/{id}/publish · 기록안됨(🚩배포 게시 — 되돌리기 어려운 동작인데 actor 인자조차 없음) · service/AppReleaseService.java:102
dashboard-service · POST /app/releases/{id}/unpublish · 기록안됨(🚩actor 인자 없음) · service/AppReleaseService.java:110
dashboard-service · DELETE /app/releases/{id} · 기록안됨 · service/AppReleaseService.java:96
dashboard-service · POST /admin/dashboard/refresh · 기록안됨(집계 MV 재계산) · controller/DashboardAdminController.java:123
dashboard-service · SCHEDULER MaterializedViewRefreshConfig.scheduledRefresh(5분) · 기록안됨 · config/MaterializedViewRefreshConfig.java:47
dashboard-service · BOOT CommandLineRunner DashboardSnapshotSeeder(이중가드) · 기록안됨 · seed/DashboardSnapshotSeeder.java:88

===== arologis-service — 기록기만 존재(호출자 없음) 52건 =====
arologis-service · 공통근거: ArologisAuditLogRecorder(realtime/service/ArologisAuditLogRecorder.java:35) 존재하나 쓰기 호출은 service/DispatchService.java:261 단 1곳. arologis_audit_logs 0행(⚠️표본 0 — 코드 경로는 실재하므로 '미동작' 이 아니라 '미발화')
arologis-service · PUT /admin/arologis/accounting/accounts/{code}/active · 기록기만존재 · service/ArologisAccountingService.java:162
arologis-service · POST /admin/arologis/accounting/cash-txns · 기록기만존재(🚩금전 거래 생성) · service/ArologisAccountingService.java:45
arologis-service · PUT /admin/arologis/accounting/cash-txns/{id} · 기록기만존재(🚩금액 변경 전/후 미보존) · service/ArologisAccountingService.java:64
arologis-service · DELETE /admin/arologis/accounting/cash-txns/{id} · 기록기만존재 · service/ArologisAccountingService.java:79
arologis-service · POST /admin/arologis/dispatches/parse-kakao · 기록기만존재(파싱 미리보기, 상태변경 없음) · controller/ArologisAdminController.java:109
arologis-service · POST /admin/arologis/dispatches · 기록기만존재(recorder 주입돼 있으나 create 본문서 미호출) · service/DispatchService.java:70
arologis-service · POST /admin/arologis/dispatches/manual · 기록기만존재 · service/DispatchManualService.java:65
arologis-service · POST /admin/arologis/dispatches/manual/preview · 기록기만존재(미리보기, 상태변경 없음) · service/DispatchManualService.java:116
arologis-service · POST /admin/arologis/dispatches/{id}/auto-match · 기록기만존재(기사 배정) · service/DispatchService.java:132
arologis-service · POST /admin/arologis/dispatches/{id}/vehicles/{seq}/match-external · 기록기만존재 · controller/ArologisAdminController.java:236
arologis-service · POST /admin/arologis/dispatches/{id}/vehicles/{seq}/assign-driver · 기록기만존재(log.info 만 — 바로 아래 updateStopStatus 는 기록하는데 대비) · service/DispatchService.java:207
arologis-service · POST /admin/arologis/dispatches/{id}/vehicles/{seq}/manual-location · 기록기만존재 · service/DispatchService.java:231
arologis-service · PUT /admin/arologis/dispatches/{id}/delete · 기록기만존재(X-User-Id 없으면 "system" 대체) · service/DispatchService.java:273
arologis-service · POST /admin/arologis/dispatches/{id}/edit-requests · 기록기만존재 · realtime/service/ArologisEditRequestService.java:64
arologis-service · POST /admin/arologis/edit-requests/{requestId}/approve · 기록기만존재 · realtime/service/ArologisEditRequestService.java:91
arologis-service · POST /admin/arologis/edit-requests/{requestId}/reject · 기록기만존재 · realtime/service/ArologisEditRequestService.java:102
arologis-service · POST /auth/admin/login · 기록기만존재(로그인 성공/실패 감사 없음) · service/auth/AdminLoginService.java:42
arologis-service · POST /auth/driver/login · 기록기만존재 · service/auth/DriverLoginService.java:38
arologis-service · POST /auth/refresh · 기록기만존재(토큰 회전) · service/auth/RefreshTokenService.java:47
arologis-service · POST /auth/logout · 기록기만존재(토큰 폐기) · service/auth/RefreshTokenService.java:97
arologis-service · POST /driver-app/arologis/locations · 기록기만존재(컨트롤러가 repository 직접 저장) · controller/ArologisDriverAppController.java:154
arologis-service · POST /driver-app/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign · 기록기만존재(🚩전자서명 등록) · controller/ArologisDriverAppController.java:234
arologis-service · POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy · 기록기만존재(서명 INSERT + 인수증 생성) · service/copy/SignAndSendCopyService.java:61
arologis-service · POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType} · 기록기만존재(slip-service 로 저장 위임) · controller/ArologisDriverAppController.java:343
arologis-service · POST /driver-app/arologis/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy · 기록기만존재(레거시 UUID 경로) · service/copy/SignAndSendCopyService.java:61
arologis-service · PUT /admin/arologis/hr/employees/{loginId} · 기록기만존재(컨트롤러가 actor 미전달) · service/ArologisEmployeeService.java:85
arologis-service · PUT /admin/arologis/hr/employees/{loginId}/terminate · 기록기만존재(🚩퇴직=계정 회수인데 role history 도 audit 도 없음) · service/ArologisEmployeeService.java:120
arologis-service · POST /admin/arologis/hr/departments · 기록기만존재 · service/ArologisDepartmentService.java:31
arologis-service · PUT /admin/arologis/hr/departments/{code} · 기록기만존재 · service/ArologisDepartmentService.java:41
arologis-service · PUT /admin/arologis/hr/departments/{code}/delete · 기록기만존재 · service/ArologisDepartmentService.java:48
arologis-service · POST /internal/arologis/dispatches/sync · 기록기만존재(W10-1 ack only 스텁, DB 접근 없음) · controller/ArologisInternalController.java:100
arologis-service · POST /internal/arologis/dispatches · 기록기만존재(Dispatch+Vehicle+VehicleStop 생성) · service/dispatch/DispatchReceiveService.java:72
arologis-service · POST /internal/arologis/dispatches/{arologisDispatchId}/modification-request · 기록기만존재 · service/dispatch/ModificationRequestReceiveService.java:48
arologis-service · POST /internal/arologis/dispatches/{arologisDispatchId}/cancellation-request · 기록기만존재 · service/dispatch/ModificationRequestReceiveService.java:71
arologis-service · POST /internal/arologis/dispatches/{arologisDispatchId}/cancel · 기록기만존재(재배차용 soft delete) · service/dispatch/ModificationRequestReceiveService.java:97
arologis-service · POST /internal/arologis/insung/match-result · 기록기만존재(🚩외부 벤더 webhook 이 배차 상태 변경) · service/insung/InsungWebhookService.java:72
arologis-service · POST /internal/arologis/insung/status-update · 기록기만존재(🚩외부에서 정차 상태 변경 — 유일 audit 경로 updateStopStatus 를 경유하지 않음) · service/insung/InsungWebhookService.java:142
arologis-service · POST /internal/arologis/insung/delivered · 기록기만존재 · service/insung/InsungWebhookService.java:201
arologis-service · POST /api/v1/arologis/admin/dispatches/auto-match · 기록기만존재 · service/DispatchService.java:132
arologis-service · POST /api/v1/arologis/admin/dispatches/{id}/manual-assign · 기록기만존재 · service/DispatchAdminService.java:110
arologis-service · PATCH /api/v1/arologis/admin/dispatches/{id}/driver · 기록기만존재(🚩기사 교체 before/after 없음) · service/DispatchAdminService.java:132
arologis-service · POST /admin/arologis/dispatch/reconcile · 기록기만존재(파일 업로드 기반 대사) · service/DispatchReconcileService.java:78
arologis-service · POST /admin/arologis/regions · 기록기만존재 · service/RegionService.java:51
arologis-service · POST /admin/arologis/regions/import · 기록기만존재(CSV 일괄 반영) · service/RegionImportService.java:52
arologis-service · PUT /admin/arologis/regions/{id} · 기록기만존재(keywords 변경 전/후 미보존) · service/RegionService.java:64
arologis-service · DELETE /admin/arologis/regions/{id} · 기록기만존재 · service/RegionService.java:78
arologis-service · POST /admin/arologis/dispatches/history · 기록기만존재 · service/DispatchSaveHistoryService.java:52
arologis-service · POST /internal/arologis/dispatch-groups · 기록기만존재(replaceSnapshot 이 이전 snapshot 덮어써 소실) · service/dispatch/ReceivedDispatchGroupService.java:3
arologis-service · SCHEDULER DriverLocationCleanupScheduler.cleanupOldLocations(cron 0 0 3 * * *) · 기록기만존재(🚩물리 삭제, log.info 만) · service/DriverLocationCleanupScheduler.java:44
arologis-service · SCHEDULER ArologisEditRequestService.expirePending(1h) · 기록기만존재 · realtime/service/ArologisEditRequestService.java:164
arologis-service · BOOT CommandLineRunner DispatchSeeder(이중가드) · 기록기만존재 · seed/DispatchSeeder.java:117
arologis-service · BOOT CommandLineRunner DriverSeeder(이중가드) · 기록기만존재 · seed/DriverSeeder.java:73
```