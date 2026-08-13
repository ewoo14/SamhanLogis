# 감사 기록 전수 조사 보고서

- 조사일: 2026-08-10
- 조사 위치: `D:\\dev\\Samhan-Public\\.claude\\worktrees\\wmain`
- 기준: `main` / `61fcbd518` (`origin/main`과 동기화된 상태)
- 조사 범위: `services/*`, `clients/*`, `shared/*`, `infrastructure/*`, 문서 및 Git 이력
- 실행한 변경: 없음. 소스 수정·Docker 재배포·서비스 재시작·DB 쓰기·commit/add/push를 하지 않았다.
- DB 측정: 2026-08-10 12:53 KST 시작, PostgreSQL 세션 timezone `Asia/Seoul`. 병렬 트랙이 같은 DB를 사용하는 동안의 스냅샷이므로 이후 행 수는 변할 수 있다.

## 1. 결론 요약

현재 저장소와 실행 환경은 “전 서비스 모두가 같은 의미의 감사 기록을 남긴다”는 상태가 아니다.

1. PM이 제시한 `services/*/src/main/java`의 기록 흔적 파일 수 17개 서비스 값은 전부 재현됐다. 그러나 파일 수는 실행 배선이나 실제 행을 증명하지 않는다.
2. 공통 overlay 감사 테이블 11개 중 실제 행이 있는 것은 `accounting_audit_logs` 50행, `partner_order_audit_logs` 4행, `slip_audit_logs` 62행뿐이다. 나머지 8개는 0행이다.
3. `dc-config`, `notification`, `product`, `user`는 기록 서비스/레코더 흔적은 있으나 조사한 생산 호출자가 확인되지 않았고 해당 공통 감사 테이블도 0행이다. `groupware`는 감사 엔티티와 repository만 있고 기록 서비스/호출자가 없다.
4. `arologis`, `inventory`, `partner`는 레코더 호출 지점은 일부 확인됐지만 공통 감사 테이블은 0행이다. 해당 도메인 이벤트가 측정 기간에 없었을 가능성은 남지만, 전수 기록을 입증할 수 없다.
5. `logging-service`는 PostgreSQL 기록 서비스가 아니다. RabbitMQ 이벤트와 프런트 이벤트를 Elasticsearch에 저장하도록 작성돼 있다. 현재 로컬에는 컨테이너가 없고 `samhan-audit-logs` 인덱스도 없으며, 다른 백엔드 서비스가 RabbitMQ로 감사 이벤트를 발행하는 코드도 확인되지 않았다.
6. `createAuditApi`가 기대하는 필드 변경 envelope(`revisionNo`, `field`, `beforeValue`, `afterValue`, actor, changedAt)와 `logging-service` envelope(`action`, `resourceType`, `beforeData`, `afterData` 등)는 서로 다르다. 하나의 공통 row 계약으로 합쳐져 있지 않다.
7. `auth`, `dashboard`, `partner-auth`의 공통 감사 overlay 제외는 과거 Phase 12 설계 문서에 명시돼 있다. 그러나 2026-08-10의 “전 서비스 모두 기록” 지시와 충돌한다. `dashboard`와 `auth`의 기록 범위, `partner-auth`를 중앙 감사로 승격할지는 개발책임자 확인이 필요하다. 단, `partner-auth`는 별도 `partner_login_attempt`에는 실제 기록이 있다.

## 2. 조사 축과 PM 값 대조

한 가지 검색 결과로 결론을 닫지 않기 위해 아래 축을 독립적으로 조사했다.

| 축 | 조사 방법 | 얻은 사실 |
|---|---|---|
| A. Java 기록 흔적 | `AuditLog\|auditLog\|audit_log\|AuditPublisher\|recordAudit` 파일 수 | PM 값과 17개 서비스 전부 일치. 코드 표면의 크기만 측정 |
| B. DB/마이그레이션 | `V*.sql`, `information_schema`, 서비스별 PostgreSQL 테이블 | 서비스별 테이블 종류와 실제 데이터 분리 확인 |
| C. 생산 기록 지점 | `save`, `recordOverlayPatch`, `recordBatch`, revision/history writer의 호출자 추적 | 레코더 정의와 실제 호출 배선이 다름 |
| D. 조회/API | Java controller route와 `clients/**` 호출 경로 | 조회 endpoint, revision/history endpoint, mock 계약을 분리 확인 |
| E. 실행 sink/배포 | compose, Git log/blame, Docker/Elasticsearch/RabbitMQ 읽기 조회 | logging-service는 local compose/현재 컨테이너/ES index가 없음 |
| F. 실제 데이터 | 서비스 DB별 읽기 전용 `COUNT`, active count, 최신 시각 | 0행인 코드 표면과 실제 저장 여부를 확정 |

### PM 값과의 대조

- Java 기록 흔적 파일 수: PM 값과 전부 일치한다. 예: `slip 12`, `partner-order 10`, `accounting 8`, `inventory 8`, `logging 9`, `product 6`, `arologis 6`, `partner 5`, `dc-config 3`, `notification 3`, `user 3`, `groupware 2`, `auth/dashboard/partner-auth 0`, 인프라 0.
- 조회 endpoint의 서비스 분포도 PM 목록과 일치한다. 단 `logging-service`의 exact path는 `/audit-logs`가 아니라 `/logs/by-service`, `/logs/by-user`, `/logs/search`, `/logs/activity`이다. 따라서 “감사 조회 기능”으로 세면 포함되지만 문자열 `/audit-logs`만 세면 예외다.
- 현재 `docker ps -a`에는 `samhan-logging-service`가 없다. 이 부분도 PM 결과를 재현했다.

## 3. 서비스 × 감사 축 전수 표

`감사 테이블`에는 generic audit뿐 아니라 같은 서비스 안에서 실제로 감사·revision·history 성격을 가진 별도 테이블도 병기했다. `기록 지점`은 레코더 정의가 아니라 생산 코드에서 확인한 호출까지 구분했다.

| 서비스 | 감사 테이블 | 기록 지점 | 조회 endpoint | 프런트 소비처 | logging-service 연동 | 판정 |
|---|---|---|---|---|---|---|
| accounting-service | `accounting_audit_logs`, `accounting_edit_requests` | `AccountingAuditLogService`가 존재. `TaxInvoiceService`, `DepositorMappingService`, `PartnerMatchAuditRecorder`, `TaxInvoiceEmitAuditRecorder`에서 일부 `recordOverlayPatch/recordBatch` 호출 | generic `/audit-logs` 없음. 세금계산서·마감·전표 관련 generic 조회도 현재 Java route에서 확인 안 됨 | `createAuditApi`의 세금계산서/마감 계약(`TaxInvoiceFormPage`, `TaxInvoiceDetailPage`, `SalesClosingPage`, `PeriodCloseListPage`, `MonthEndClosingPage`)이 존재하나 backend route와 불일치 | 백엔드 producer 없음. 프런트의 중앙 `/logs/front`는 gateway를 거치는 별도 경로 | **부분 기록. 50행은 있으나 조회 계약이 닫히지 않음. accounting 전체 CRUD 기록은 아님** |
| api-gateway | 없음 | 없음. gateway route/proxy만 있음 | 자체 감사 endpoint 없음 | `/logs/activity`, `/logs/front`, `/api/v1/audit-logs/front`를 logging-service로 전달하는 route가 있음 | `lb://logging-service` route와 legacy route 보유. 자체 저장 없음 | **인프라. 해당 없음이지만 logging 경로의 의존 지점** |
| arologis-service | `arologis_audit_logs`, `arologis_role_change_history`, `dispatch_save_history` | `ArologisAuditLogRecorder` 존재. 조사한 생산 호출자는 `DispatchService`의 manual location overlay 한 곳. dispatch save history는 별도 writer | `/admin/arologis/dispatches/{id}/audit-logs`; save history는 `/admin/arologis/dispatches/history` 계열 | arologis desktop의 dispatch save-history 화면. 공통 `arologisDispatchAuditApi` 정의는 있으나 실제 비테스트 소비자는 확인되지 않음 | producer 없음. 자체 DB 기록 | **공통 감사 0행. 일부 호출은 있으나 생성·수정·삭제 전수 배선 불명** |
| auth-service | generic 감사 테이블 없음 | 없음. 로그인 실패 횟수/계정 상태 변경은 있으나 generic audit writer 없음 | 없음 | generic 감사 소비처 없음 | 없음 | **과거 공통 overlay 제외 설계. 현재 전 서비스 기록 지시 아래 범위 확인 필요** |
| dashboard-service | 감사/history 테이블 없음. KPI snapshot·aggregate 성격 | 없음 | 없음 | generic 감사 소비처 없음 | 없음 | **읽기·집계 서비스라 과거 broker-only 제외는 설계 의도. 접근/운영 이벤트까지 기록할지는 개발책임자 확인 필요** |
| dc-config-service | `dc_config_audit_logs`, `dc_config_edit_requests` | `DcConfigAuditLog` domain/repository/service 흔적은 있으나 생산 mutation 호출자 미확인 | generic `/audit-logs` 없음 | `SalesPartnerDcConfigPage`가 `/api/v1/dc-configs/{partnerCode}/audit-logs` 계약을 호출 | 없음 | **코드·프런트 계약은 있으나 writer 배선과 endpoint가 닫히지 않았고 0행** |
| eureka-server | 없음 | 없음 | 없음 | 없음 | 없음 | **인프라 해당 없음** |
| groupware-service | `groupware_audit_logs`, `groupware_edit_requests`, `document_template_revisions` | `GroupwareAuditLog` entity/repository만 확인. generic 기록 service/caller 없음. document template revision은 별도 writer | generic `/audit-logs` 없음. `/groupware/document-templates/{id}/revisions/{revision}` 존재 | `ApprovalDocView`, `DocumentTemplateEditorPage`가 document-template revision 소비 | 없음 | **generic 0행. revision 데이터는 111행으로 별도 기록 중. 두 의미를 합치면 안 됨** |
| inventory-service | `inventory_audit_logs`, `inventory_edit_requests`, `inventory_audits`, `inventory_audit_lines`, `dps_save_history` | `InventoryAuditLogRecorder`가 `WarehouseService`(update/delete/revert), `InventoryAuditService`(status audit)에서 호출. generic audit rows는 0 | `/inventory/audits/{id}/audit-logs`, `/inventory/warehouses/{id}/audit-logs` | `InventoryAuditDetailPage`, `EditWarehouseModal`, `createAuditApi` inventory 계약 | 없음 | **조회 표면은 2개지만 generic 감사 0행. domain 실사 데이터 9건/line 45건은 generic audit와 별도** |
| logging-service | PostgreSQL 없음. Elasticsearch index `samhan-audit-logs` 문서 | Rabbit consumer `samhan.audit.queue` → ES 저장, `/logs/front` → ES 직접 저장. 다른 서비스의 Rabbit publisher는 미확인 | `/logs/by-service/{serviceName}`, `/logs/by-user/{userId}`, `/logs/search`, `/logs/activity`; POST `/logs/front` | desktop `ActivityLogPage` GET `/logs/activity`, `AppLayout` POST `/logs/front`; estimate web 및 preload legacy POST | gateway route는 있으나 현재 container/ES index 없음. 프런트 요청은 target 부재로 실패 가능 | **설계상 중앙 sink이나 현재 실행·producer·데이터 모두 끊김** |
| notification-service | `notification_audit_logs`, `dispatch_sms_save_history` | generic audit service/domain은 있으나 생산 caller 미확인. SMS dispatch save history는 별도 writer | generic `/audit-logs` 없음. `/api/notifications/history`, dispatch SMS history는 별도 endpoint | `NotificationHistoryPage`, `MessengerPage`, `NotificationBellDropdown`, `DispatchSmsHistoryTab` | 없음 | **generic 0행. SMS history 9행은 있으나 generic 감사가 아님** |
| partner-auth-service | generic overlay 없음. `partner_login_attempt`, password_history JSONB | `PartnerAuthService`가 로그인 시도 repository에 result/IP/UA/시각 기록 | generic `/audit-logs` 없음 | generic 감사 소비처 없음 | 없음 | **공통 overlay 제외 설계지만 auth 사건 46행은 실제 기록. 중앙 감사 포함 여부 확인 필요** |
| partner-order-service | `partner_order_audit_logs`, `partner_order_revisions`, `partner_order_history`, `partner_order_front_event_log` | `PartnerOrderAuditLogService`가 update/from-estimate/delete 경로에서 호출. revision/history/front event는 별도 기록 | `/api/v1/partner-orders/{id}/audit-logs`, `/revisions`, `/history` 계열 | revision panel 및 order history. 공통 `partnerOrderAuditApi` 정의는 있으나 실제 주 소비는 revision 경로 | 없음 | **여러 기록 계층이 공존. generic 4행 대 revision 568/history 2,595행으로 의미·분모가 다름** |
| partner-service | `partner_audit_logs`, `partner_revisions`, `partner_credit_history` | `PartnerService`가 optional `AuditLogRecorder`를 받아 일부 mutation에서 호출. revision writer 별도 | generic `/audit-logs` 없음. `/api/v1/partners/{code}/revisions` 및 restore 존재 | `PartnerVersionHistoryPanel`은 revision 소비 | 없음 | **generic 0행, revision 29행. 조회 endpoint가 없다고 기록 데이터도 없는 것은 아님** |
| product-service | `product_audit_logs`, `product_edit_requests`, `price_history` | generic recorder/service/controller는 있으나 product mutation의 생산 caller 미확인 | `/products/{id}/audit-logs` | 현재 공통 audit endpoint 표면은 있으나 확인된 주요 desktop consumer 없음. 가격 이력은 별도 | 없음 | **endpoint·코드 표면은 있으나 generic 0행. price history 2,203행은 다른 의미** |
| slip-service | `slip_audit_logs`, `slip_revisions`, `estimate_revisions`, `slip_signature_audit`, `slip_publish_audit`, `slip_cleanup_save_history`, `slip_line_correction_audits` | `SlipService`, `SlipUpdateService`, `SlipDeleteService`, `SalesSlipUpdate/DeleteService`에서 create/edit/delete 관련 generic audit 호출. revision·signature·publish는 별도 | `/slips/{id}/audit-logs`, `/revisions` 계열 | desktop `SlipDetailPage`, mobile `SlipDetailScreen`, slip/estimate revision panels | 없음 | **현재 공통 audit 62행과 revision 197행. 조사 대상 중 가장 닫힌 편이나 계층이 여러 개** |
| user-service | `user_audit_logs`, `user_edit_requests`, `role_change_history`, `employee_signature_audit` | generic `UserAuditLogService` 생산 caller 미확인. role change·employee signature writer는 별도 | generic `/audit-logs` 없음 | 사용자·권한 화면은 있으나 generic audit 소비처 미확인 | 없음 | **generic 0행 및 endpoint 없음. 별도 role/signature도 0행** |

## 4. 축별 조사 결과와 차집합

### 4.1 축 A — Java 기록 흔적 파일 수

검색식은 PM이 지정한 `AuditLog|auditLog|audit_log|AuditPublisher|recordAudit`를 그대로 사용했다. 다음은 파일 수이며, 실제 호출·행 수가 아니다.

| 서비스 | 파일 수 | 서비스 | 파일 수 |
|---|---:|---|---:|
| accounting | 8 | api-gateway | 0 |
| arologis | 6 | auth | 0 |
| dashboard | 0 | dc-config | 3 |
| eureka | 0 | groupware | 2 |
| inventory | 8 | logging | 9 |
| notification | 3 | partner-auth | 0 |
| partner-order | 10 | partner | 5 |
| product | 6 | slip | 12 |
| user | 3 |  |  |

이 축만 닫으면 `groupware`, `dc-config`, `notification`, `user`, `product` 등을 “기록이 있다”고 오판하게 된다. 이들은 각각 entity/repository/service 정의만 있거나 별도 history만 있고, generic audit row가 0인 경우가 있다.

### 4.2 축 B — 마이그레이션·테이블

| 서비스군 | 감사 관련 migration/table | 성격 |
|---|---|---|
| accounting | `V5__add_accounting_audit_logs_and_edit_requests.sql` / `accounting_audit_logs` | field diff overlay |
| arologis | `V5...arologis_audit_logs...`, `V12...dispatch_save_history`, `V14...role_change_history` | overlay + save history + role history |
| dc-config | `V3...dc_config_audit_logs...` / `dc_config_audit_logs` | field diff overlay |
| groupware | `V2...groupware_audit_logs`, `V3...edit_requests`, `V12...document_template_revisions` | overlay migration + revision snapshot |
| inventory | `V4...inventory_audit_logs...`, `V3...inventory_audit`, `V11...dps_save_history` | overlay + physical audit + save history |
| notification | `V3...notification_audit_logs`, `V4...dispatch_sms_save_history` | overlay + dispatch history |
| partner-auth | `V1...partner_login_attempt` | login attempt, overlay 아님 |
| partner | `V5...partner_audit_logs`, `V12...partner_revisions`, `V1...credit_history` | overlay + revision + credit history |
| partner-order | `V3...partner_order_audit_logs`, `V7...partner_order_revisions`, `V1...history/front_event` | overlay + revision + history/event |
| product | `V6...product_audit_logs`, `price_history` | overlay + price history |
| slip | `V18...slip_audit_logs`, `V27/V28...revisions`, `V5/V8...signature/publish`, `V25...cleanup` | overlay + multiple specialized audits |
| user | `V4...user_audit_logs`, `V3...role_change_history`, `V10...employee_signature_audit` | overlay + role/signature |
| auth/dashboard | generic 감사 migration 없음 | auth account state/password history, dashboard snapshot/aggregate |
| logging | Flyway/PostgreSQL migration 없음 | Elasticsearch `samhan-audit-logs` |

따라서 “감사 table이 있는 서비스”와 “공통 overlay 감사 table에 실제로 기록되는 서비스”는 같은 집합이 아니다.

### 4.3 축 C — 레코더와 생산 호출자

| 분류 | 서비스 | 조사 결과 |
|---|---|---|
| writer + caller + 실제 generic 행 | accounting, partner-order, slip | 실제 generic audit 행이 각각 50, 4, 62. 다만 전체 CRUD가 아니라 선택 경로다. |
| writer + caller 확인 + generic 0행 | arologis, inventory, partner | 호출 지점은 일부 있으나 현재 DB에는 0행. 호출된 이벤트가 없었거나 저장 경로가 끊겼을 수 있어 후속 재현 테스트 필요. |
| writer/정의는 있으나 생산 caller 미확인 + 0행 | dc-config, notification, product, user | 코드 표면은 있으나 실제 기록 배선 증거가 없다. |
| entity/repository만 있고 generic writer/caller 없음 + 0행 | groupware | 별도 document revision만 111행. |
| 별도 사건 기록만 있음 | partner-auth | login attempt는 46행이나 공통 overlay가 아니다. |
| remote sink만 있음 | logging | Rabbit consumer와 front collector는 있으나 producer/실행 sink가 없다. |
| 적용 제외 | auth, dashboard | 과거 설계 문서에 명시. 새 전 서비스 지시와의 정합성은 미결. |

### 4.4 축 D — endpoint와 프런트 소비

정확한 generic `audit-logs` route는 다음 서비스에 있다.

- `arologis`: `/admin/arologis/dispatches/{id}/audit-logs`
- `inventory`: `/inventory/audits/{id}/audit-logs`, `/inventory/warehouses/{id}/audit-logs`
- `partner-order`: `/api/v1/partner-orders/{id}/audit-logs`
- `product`: `/products/{id}/audit-logs`
- `slip`: `/slips/{id}/audit-logs`

`logging-service`는 exact token이 아닌 `/logs/*` 조회 route로 운영된다. `accounting`, `dc-config`, `groupware`, `notification`, `partner`, `user`에는 generic endpoint가 없으며, 일부는 revision/history만 제공한다.

프런트 경로의 전수 분류는 다음과 같다.

| 프런트 경로 | 실제 요청 | backend 의미 | 상태 |
|---|---|---|---|
| `clients/desktop/src/renderer/api/createAuditApi.ts` | accounting tax invoice/closing, dc-config, inventory, partner-order, arologis 계약 | field-level audit row | accounting/dc-config는 현재 backend route가 없고, partner-order/arologis factory는 실제 비테스트 import가 확인되지 않음 |
| desktop `TaxInvoice*`, `SalesClosing*`, `PeriodClose*`, `MonthEnd*` | accounting audit API | field-level audit | 호출 계약은 있으나 route gap |
| `SalesPartnerDcConfigPage` | `/api/v1/dc-configs/{partnerCode}/audit-logs` | field-level audit | route gap + DB 0행 |
| `InventoryAuditDetailPage`, `EditWarehouseModal` | inventory 두 audit route | field-level audit | route 존재 + generic DB 0행 |
| `SlipDetailPage`, mobile `SlipDetailScreen` | `slipAudit.ts` | slip audit | route 존재 + 62행 |
| revision panels | slip/estimate/partner/partner-order/document-template `/revisions` | snapshot revision | generic audit와 별도. 실제 데이터는 47/29/568/111 등 |
| activity log | desktop `ActivityLogPage` GET `/logs/activity`; `AppLayout` POST `/logs/front` | Elasticsearch front activity | local logging target 없음 |
| estimate web / preload legacy | `/api/v1/audit-logs/front` | gateway rewrite → `/logs/front` | logging target 없음 |
| notification/order/history screens | notification, dispatch SMS, cleanup, Hometax, partner-order history | domain history | generic audit endpoint와 별도 |

차집합의 핵심은 `프런트 계약 있음 ≠ backend endpoint 있음`, `backend endpoint 있음 ≠ 실제 row 있음`, `revision/history 있음 ≠ generic audit 있음`이다.

## 5. 실제 데이터 측정 — 읽기 전용 SQL

실행 형식은 서비스별 database에 대해 다음과 같았다.

```powershell
docker exec samhan-postgres psql -U samhan -d <db> -P pager=off -Atc "SELECT ..."
```

모든 query는 `COUNT`, `MAX` 및 `information_schema` 조회만 수행했다. `is_deleted`가 없는 특수 history 테이블은 active를 전체와 동일하게 표시하지 않고, 해당 테이블의 soft-delete column이 있을 때만 `is_deleted=false`를 별도로 계산했다.

### 5.1 generic audit 및 관련 기록 행

`최근 시각`은 표에 표시한 기록의 시간 column에서 `MAX`한 값이다. overlay는 `changed_at`, revision/history는 `created_at` 또는 도메인별 `occurred_at/logged_at/attempted_at`를 사용했다.

| DB | 테이블 | 전체 행 | active 행 | 최근 기록 시각 (KST) |
|---|---|---:|---:|---|
| accounting_db | `accounting_audit_logs` | 50 | 50 | 2026-07-27 16:15:36.156740 |
| arologis_db | `arologis_audit_logs` | 0 | 0 | NULL |
| arologis_db | `arologis_role_change_history` | 3 | 3 | 2026-06-09 01:02:09.701876 |
| arologis_db | `dispatch_save_history` | 11 | 2 | 2026-08-03 15:04:33.155926 |
| auth_db | audit/history 명명 테이블 | 없음 | - | - |
| dashboard_db | audit/history 명명 테이블 | 없음 | - | - |
| dc_config_db | `dc_config_audit_logs` | 0 | 0 | NULL |
| groupware_db | `groupware_audit_logs` | 0 | 0 | NULL |
| groupware_db | `document_template_revisions` | 111 | 111 | 2026-07-28 17:15:11.933977 |
| inventory_db | `inventory_audit_logs` | 0 | 0 | NULL |
| inventory_db | `inventory_audits` | 9 | 9 | 2026-05-12 09:00:04.053790 |
| inventory_db | `inventory_audit_lines` | 45 | 45 | 2026-05-12 09:00:04.037769 |
| inventory_db | `inventory_audit_number_sequences` | 8 | 8 | 2026-07-21 11:21:14.645739 |
| inventory_db | `dps_save_history` | 0 | 0 | NULL |
| notification_db | `notification_audit_logs` | 0 | 0 | NULL |
| notification_db | `dispatch_sms_save_history` | 9 | 1 | 2026-08-03 16:38:10.231992 |
| partner_auth_db | `partner_login_attempt` | 46 | 28 | 2026-07-30 16:50:13.759586 |
| partner_db | `partner_audit_logs` | 0 | 0 | NULL |
| partner_db | `partner_revisions` | 29 | 28 | 2026-07-30 16:25:10.517554 |
| partner_db | `partner_credit_history` | 0 | 0 | NULL |
| partner_order_db | `partner_order_audit_logs` | 4 | 4 | 2026-07-07 15:41:33.743067 |
| partner_order_db | `partner_order_revisions` | 568 | 568 | 2026-07-29 16:17:58.018429 |
| partner_order_db | `partner_order_history` | 2,595 | 2,595 | 2026-07-29 16:17:59.835599 |
| partner_order_db | `partner_order_front_event_log` | 173 | 105 | 2026-07-30 16:50:43.172350 |
| product_db | `product_audit_logs` | 0 | 0 | NULL |
| product_db | `price_history` | 2,203 | 2,203 | 2026-07-29 09:10:10.155918 |
| slip_db | `slip_audit_logs` | 62 | 62 | 2026-07-27 12:43:37.690218 |
| slip_db | `slip_revisions` | 197 | 197 | 2026-08-06 17:26:12.030244 |
| slip_db | `estimate_revisions` | 47 | 47 | 2026-07-16 15:58:58.093498 |
| slip_db | `slip_cleanup_save_history` | 1 | 1 | 2026-07-14 14:28:57.919284 |
| slip_db | `slip_line_correction_audits` | 0 | 0 | NULL |
| slip_db | `slip_publish_audit` | 0 | 0 | NULL |
| slip_db | `slip_signature_audit` | 0 | 0 | NULL |
| user_db | `user_audit_logs` | 0 | 0 | NULL |
| user_db | `role_change_history` | 0 | 0 | NULL |
| user_db | `employee_signature_audit` | 0 | 0 | NULL |

### 5.2 데이터 판정

- **실제 generic overlay 데이터 있음:** accounting 50, partner-order 4, slip 62.
- **generic overlay table은 있으나 0행:** arologis, dc-config, groupware, inventory, notification, partner, product, user.
- **별도 기록은 있으나 generic overlay가 아님:** arologis role/save history, groupware document revisions, inventory physical audit, notification SMS history, partner-auth login attempts, partner revisions, partner-order revisions/history/front events, product price history, slip revisions/특수 audit.
- **logging-service:** PostgreSQL은 사용하지 않으며, Elasticsearch `_cat/indices`에는 당시 index가 없었다. `samhan-audit-logs/_count`도 index-not-found 응답이었다.
- `logging_db`라는 PostgreSQL catalog 항목은 보이지만, logging-service 설정과 `infrastructure/terraform/templates/init-rds.sql` 주석이 PostgreSQL/JPA를 제외한다. 따라서 이 DB를 logging-service의 저장소로 세면 안 된다.

0행 자체만으로 “해당 행위를 반드시 수행했는데 저장 실패”라고 단정할 수는 없다. 그러나 생산 caller가 없거나, endpoint가 없거나, sink 자체가 없는 사례에서는 0행이 배선 단절의 강한 증거다.

## 6. “기록”의 정의가 서비스마다 같은가

### 6.1 자기 DB 기록과 logging-service 원격 기록

대부분의 업무 서비스는 자기 PostgreSQL의 `{service}_audit_logs`에 `AuditLogEntry` 형태의 field diff를 기록한다. `logging-service`는 예외로 Elasticsearch sink이며, RabbitMQ consumer 또는 프런트 POST를 받는 별도 중앙 활동 로그다. 조사한 백엔드 서비스 Java 코드에서 다른 서비스가 `RabbitTemplate`/`AuditLogEvent`를 발행하는 생산자 코드는 확인되지 않았다.

즉, 현재는 다음처럼 두 체계가 병렬로 존재한다.

```text
업무 mutation ──(일부 서비스만)──> 자기 DB *_audit_logs
프런트 활동  ──gateway──> logging-service ──> Elasticsearch
백엔드 이벤트 ──(producer 미확인)──> RabbitMQ ──> logging-service ──> Elasticsearch
```

두 체계 사이에 공통 transaction, 전달 보장, 재시도 완료, 중앙 조회 통합은 확인되지 않았다.

### 6.2 생성·수정·삭제의 수준

공통 overlay schema는 필드별 변경을 표현할 수 있지만, 서비스별 호출 범위가 다르다.

| 서비스/계층 | 생성 | 수정 | 삭제 | 조사된 수준 |
|---|---|---|---|---|
| slip | SlipService create 및 mutation 경로 일부 | `SlipUpdateService`, sales update | `SlipDeleteService`, sales delete | generic field diff 호출이 가장 폭넓게 확인됨. revision도 별도 존재 |
| partner-order | estimate에서 생성 경로 | update | delete | 세 경로 writer 확인. generic 4행이라 모든 사건 기록을 입증하지 못함 |
| accounting | 일반 CRUD 전체가 아니라 tax invoice/매칭/emit 등 선택 흐름 | 선택 patch/batch | universal delete caller 미확인 | 업무별 recorder 분산 |
| inventory | generic 전체 생성 caller 미확인 | warehouse update, inventory status 일부 | warehouse delete/revert 일부 | domain physical audit와 generic overlay가 별도 |
| arologis | dispatch 전체 생성 caller 미확인 | manual location 한 곳 확인 | dispatch 전체 삭제 caller 미확인 | save history와 generic audit 혼재 |
| partner | 일부 PartnerService mutation | 일부 setter/patch | universal delete 미확인 | generic 0행, revision 별도 |
| dc/product/groupware/notification/user | 확인된 generic caller 없음 | 확인된 generic caller 없음 | 확인된 generic caller 없음 | 정의·migration과 실행이 분리됨 |
| auth/partner-auth/dashboard | shared CRUD overlay 아님 | auth/account 상태 또는 login attempt 등 별도 | shared CRUD overlay 아님 | 사건 정의 자체가 개발책임자 결정 대상 |

따라서 “AuditLog 클래스가 있다”는 사실만으로 생성·수정·삭제가 동일 수준으로 남는다고 말할 수 없다. 현재 증거상 서비스마다 다음이 다르다.

- 어떤 서비스는 field-level before/after를 남긴다.
- 어떤 서비스는 full JSON snapshot revision을 남긴다.
- 어떤 서비스는 SMS/dispatch/save/login attempt 같은 사건 history만 남긴다.
- 어떤 서비스는 migration과 service class만 있고 생산 호출자 또는 실제 row가 없다.
- 삭제는 특히 별도 delete writer가 있는 slip/partner-order와 그렇지 않은 서비스가 갈린다.

### 6.3 schema가 동일한가

공통 overlay table들은 대체로 `shared/realtime-abstraction`의 `AuditLogEntry`와 같은 구조다.

- 공통 field diff: `entity_id`, `revision_no`, `actor_id`, `actor_name`, `actor_color`, `field_name`, `old_value`, `new_value`, `changed_at`.
- 공통 `BaseEntity` audit 7개: created/modified/deleted의 by·at와 `is_deleted`.
- `slip_audit_logs`는 `entity_id` 대신 `slip_id`를 사용해 공통 template과 이미 차이가 있다.
- revision table은 `revision_type`과 JSONB snapshot을 중심으로 하며 field diff row가 아니다.
- logging-service ES `AuditLogEvent`는 `serviceName`, `userId`, `action`, `resourceType`, `resourceId`, `description`, `beforeData`, `afterData`, `ipAddress`, `userAgent`, `occurredAt`를 사용한다. `revisionNo`, `field`, `oldValue`, `newValue`, `changedAt`가 없다.

결론적으로 `createAuditApi`가 단일 field-diff envelope을 가정하는 것은 자기 DB overlay 일부에만 맞는다. logging-service envelope, revision/history, login attempt를 같은 row로 취급할 수 없다.

## 7. logging-service 위치·이력·실패 경로

### 7.1 compose 정의

- `infrastructure/docker-compose.yml`, `docker-compose.local-all.yml`, `docker-compose.no-host-ports.yml`, `docker-compose.slip-port-override.yml`에는 logging-service가 없다.
- `infrastructure/docker-compose.prod.yml`에만 `logging-service`가 정의되어 있다. `container_name: samhan-logging-service`, port 8082, Elasticsearch/RabbitMQ/Eureka 의존성, healthcheck가 있다.
- production compose의 해당 block은 Git commit `579835efc` (`2026-06-29`, `[CHORE] Phase 11 AWS 이식 준비 — IaC 17서비스 현행화 + cutover 런북 (#660)`)에서 처음 추가됐다.
- local compose들에 `logging-service:` 추가 이력은 `git log --all -S'logging-service:'`로 확인되지 않았다. 따라서 “local compose에서 언제 제거됐나”가 아니라, 확인 가능한 저장소 이력상 local compose에는 처음부터 없고 2026-06-29에 production compose에만 추가된 상태다.
- logging-service 코드와 build/application 설정의 초기 흔적은 `3914fdfba` (`2026-05-10`)에서 확인된다. 프런트 activity endpoint 사용은 `ce53292e1` (`2026-06-28`)에서 확인된다.

### 7.2 서비스 의존과 현재 실패

- gateway의 `/api/logs/**` route는 `lb://logging-service`로 전달한다.
- `/logs/activity`, `/logs/front` route와 legacy `/api/v1/audit-logs/front` → `/logs/front` rewrite도 logging-service를 target으로 한다.
- 현재 `docker ps -a`에 `samhan-logging-service`가 없다.
- 현재 Elasticsearch에는 index가 없고 `samhan-audit-logs/_count`는 index-not-found였다.
- RabbitMQ에서 감사 exchange/binding/producer를 확인하지 못했다. logging-service consumer가 기동해도 백엔드 감사 event가 들어오는 경로는 코드상 확인되지 않았다.

따라서 프런트의 `POST /logs/front`는 gateway에서 대상 service를 찾지 못해 503 또는 동등한 upstream failure가 될 수 있다. desktop mock의 성공 응답은 실제 배포 상태를 증명하지 않는다.

### 7.3 POST `/logs/front` 프런트 호출 전수

1. `clients/desktop/src/renderer/api/activityLog.ts` — `recordMenuAccess`가 `POST /logs/front`로 `MENU_ACCESS`를 보낸다. 호출자는 `clients/desktop/src/renderer/components/AppLayout.tsx`다.
2. `clients/desktop/src/preload/samhanApi.ts` — legacy `POST /api/v1/audit-logs/front` 계약을 노출한다. gateway에서 `/logs/front`로 rewrite된다.
3. `clients/web/estimate-app/lib/code.js` — `AUDIT_LOG_URL`을 사용해 `logFrontEvent`에서 POST한다. `.env.example` 기본값은 `http://localhost:8085/api/v1/audit-logs/front`다.
4. desktop mock handler에도 두 path가 있으나 이는 테스트/mock 응답이며 실행 중인 logging-service의 증거가 아니다.

## 8. auth·dashboard·partner-auth 판단

`docs/devops/phase12-redis-multi-service.md`와 `docs/uiux/phase12/H4b-be-rollout-checklist.md`에는 공통 realtime/audit rollout 대상에서 `dashboard`/`notification`을 broker-only로 두고, `auth`/`partner-auth`/`logging` 등을 적용 제외한 기록이 있다.

| 서비스 | 과거 설계 근거 | 현재 실제 기록 | 이번 지시 기준 판단 |
|---|---|---|---|
| auth | 공통 audit/realtime 적용 제외 | generic audit/history table 없음. 계정 상태와 password history는 보안 내부 상태 | 과거 제외 의도는 확인된다. 그러나 로그인 성공/실패·권한·비밀번호 사건을 “전 서비스 기록”에 포함할지는 개발책임자 확인 필요 |
| dashboard | KPI snapshot/cache/aggregate, broker-only 설명 | generic audit table/writer 없음 | CRUD 감사 대상이 없다는 설계는 자연스럽다. 다만 조회/운영/집계 refresh 이벤트까지 기록할지는 개발책임자 확인 필요 |
| partner-auth | 공통 overlay 적용 제외 | `partner_login_attempt` 46행, active 28행. result/IP/UA/attempted_at 기록 | 공통 AuditLog가 없는 것은 과거 설계상 의도. 하지만 auth 사건을 중앙 감사에 포함할지는 개발책임자 확인 필요 |

따라서 이 세 서비스를 모두 “누락”이라고 단정하지 않는다. 다만 새 상위 지시가 기존 제외 설계를 덮으므로 다음 라운드 구현 전에 기록 사건의 범위를 결정해야 한다.

## 9. endpoint가 없는 6개 서비스와 데이터 존재 여부

PM이 지목한 `accounting`, `dc-config`, `groupware`, `notification`, `partner`, `user`를 generic `audit-logs` 기준으로 확인했다.

| 서비스 | generic audit data | 다른 history/revision data | endpoint 판단 |
|---|---:|---:|---|
| accounting | `accounting_audit_logs` 50행 | 별도 업무 history도 있음 | 데이터는 이미 있다. generic 조회 endpoint가 없어 프런트 계약을 충족하지 못함 |
| dc-config | 0행 | 확인된 대체 audit data 없음 | endpoint와 기록 배선 모두 미완 |
| groupware | 0행 | `document_template_revisions` 111행 | generic endpoint는 없지만 revision endpoint와 데이터는 있다 |
| notification | 0행 | `dispatch_sms_save_history` 9행(활성 1) 및 notification history | generic endpoint는 없고, 별도 history는 있다 |
| partner | 0행 | `partner_revisions` 29행(활성 28) | generic endpoint는 없지만 revision endpoint와 데이터는 있다 |
| user | 0행 | role/signature audit 모두 0행 | generic endpoint·generic data·대체 데이터 모두 확인되지 않음 |

“조회 endpoint 없음”을 “데이터 없음”으로 닫을 수 있는 서비스는 이 6개 중 `dc-config`, `user`의 generic 기준 정도다. `accounting`, `groupware`, `notification`, `partner`는 endpoint가 없어도 데이터가 다른 table에 존재한다.

## 10. 근거 파일 색인

- 공통 schema/template: `shared/realtime-abstraction/src/main/java/.../audit/AuditLogEntry.java`, `shared/realtime-abstraction/src/main/resources/db/template/audit_log_template.sql`
- 프런트 field-diff 계약: `clients/desktop/src/renderer/api/createAuditApi.ts`
- logging ES model/consumer/controller: `services/logging-service/src/main/java/.../AuditLog.java`, `AuditLogEvent.java`, `AuditLogConsumer.java`, `AuditLogController.java`, `ActivityLogService.java`
- logging 설정: `services/logging-service/src/main/resources/application.yml`
- gateway route: `services/api-gateway/src/main/resources/application.yml`
- compose: `infrastructure/docker-compose.prod.yml` 및 local compose 4종
- 제외 설계 문서: `docs/devops/phase12-redis-multi-service.md`, `docs/uiux/phase12/H4b-be-rollout-checklist.md`
- 업무별 migration: 각 `services/*/src/main/resources/db/migration/V*.sql`

## 11. PM 절단용 슬라이스 제안

### 작고 즉시 닫히는 것

1. **logging 실행 경로 복구 조사/구현 슬라이스**: local compose에 없는 service, gateway target, ES/Rabbit topology를 하나의 DevOps 범위로 닫는다. 현재 실패 원인이 컨테이너·index 부재로 명확하고, `/logs/front`의 실제 동작 여부를 독립적으로 검증할 수 있다.
2. **기존 데이터가 있는 조회 endpoint 우선 슬라이스**: accounting의 50행 audit 및 groupware/partner revision처럼 데이터와 read model이 이미 있는 대상을 먼저 API 계약으로 닫는다. 단 generic audit와 revision schema를 같은 응답으로 섞을지 결정해야 한다.

### 개발책임자 판단이 필요한 것

3. **auth·dashboard·partner-auth의 기록 대상 결정**: 로그인 성공/실패, 계정·비밀번호·권한 상태, dashboard 접근/refresh, partner login attempt를 중앙 감사에 포함할지 결정해야 한다. 기존 문서의 “제외”만으로 새 지시를 거부할 수 없다.
4. **canonical schema 결정**: 자기 DB field diff, revision snapshot, logging ES activity envelope 중 어느 것을 감사의 원본으로 볼지 결정해야 한다. `createAuditApi`의 단일 envelope을 logging-service까지 확장하는 것은 현재 schema상 안전하지 않다.

### 큰 슬라이스

5. **전 서비스 사건 분류표와 CRUD coverage 닫기**: 서비스별 생성·수정·삭제·복구·권한·로그인 사건을 목록화하고, 모든 생산 mutation에 writer를 배선하며, 실패 재시도/transaction 경계를 정의해야 한다. 현재는 5개 계열만 generic 행이 있고 나머지는 정의·별도 history·0행이 혼재한다.
6. **조회 표면 통합**: generic audit endpoint가 없는 6개 서비스에 endpoint를 추가하고, revision/history/central activity를 UI에서 구분 표시해야 한다. endpoint 수만 늘리는 작업이 아니라 row schema, UUID 사용자 비공개, actor 표시, restore 권한, soft-delete 정책까지 포함한다.

이번 조사에서 가장 빠른 후속 순서는 `logging 실행 경로`와 `실제 데이터가 있는 조회 표면`을 먼저 고정하고, 그 다음 개발책임자가 auth/dashboard/partner-auth와 canonical schema를 결정한 뒤, 전 서비스 CRUD coverage를 큰 통합 슬라이스로 자르는 것이다.
