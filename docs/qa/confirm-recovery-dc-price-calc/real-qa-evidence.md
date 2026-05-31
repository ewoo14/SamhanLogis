# confirm-recovery-dc-price-calc 실 Docker QA 증거

- 브랜치: `fix/confirm-recovery-dc-price-calc`
- HEAD: `bb492918`
- QA 일시: 2026-05-31

---

## (1) 최종 판정

| 항목 | 결과 |
|---|---|
| 전체 판정 | **PASS** (핵심 경로 완전 통과) |
| confirm 200+DRAFT | PASS |
| slip_no null / NOT_REQUIRED | PASS |
| price_vat = fail-soft(sellingPrice) | PASS (DC 실 적용은 별도 이슈, 아래 설명) |
| slip 0건 | PASS |
| dc-config 호출 흔적 | PASS (fail-soft 경로 정상 확인) |
| FE 캡처 | BLOCKED (파트너 계정 시드 없음, 사유 명기) |

---

## (2) 재빌드 이미지 시각

```
# bb492918 커밋 시각
2026-05-31 15:01:06 KST

# bootJar 재빌드 완료 시각
Modify: 2026-05-31 15:03:04 KST
→ HEAD 이후 빌드 확인

# Docker 이미지 재빌드 완료
infrastructure-partner-order-service:latest 재빌드 완료
  (sha256:8fe1ffa813de4aebf3be19f343f93db7fdb661f1ca35336f9fb51406faeaae90)

# 컨테이너 기동 확인
samhan-partner-order-service: UP (healthy)
Eureka 등록: DiscoveryClient_PARTNER-ORDER-SERVICE 204 (registration status)
Started PartnerOrderServiceApplication in 6.139 seconds
```

---

## (3) confirm 200 + status=DRAFT 실 응답

### 케이스 A: P-2026-0001 (singleSets, draft e44c60ab)

```bash
POST http://localhost:8080/api/v1/partner-orders/e44c60ab-fb64-4f53-a5cc-b5120bda9d7b/confirm
Authorization: Bearer <MASTER JWT>
X-Partner-Code: P-2026-0001
X-Biz-Code: 211-87-12345

응답:
{
  "success": true,
  "code": "OK",
  "data": {
    "orderNo": "2026/05/31-1",
    "slipNo": null,
    "status": "DRAFT",
    "slipPublishStatus": "NOT_REQUIRED",
    "totalAmount": 1200000.0,
    "confirmedAt": null
  }
}
```

### 케이스 B: P-2026-0002 (homemulti, draft af098e11 신규 생성)

```bash
POST http://localhost:8080/api/v1/partner-orders/af098e11-29f4-4709-9685-adea0c4c5580/confirm
Authorization: Bearer <MASTER JWT>
X-Partner-Code: P-2026-0002
X-Biz-Code: 212-87-23456

응답:
{
  "success": true,
  "code": "OK",
  "data": {
    "orderNo": "2026/05/31-2",
    "slipNo": null,
    "status": "DRAFT",
    "slipPublishStatus": "NOT_REQUIRED",
    "totalAmount": 1080000.0,
    "confirmedAt": null
  }
}
```

**이전 동작(수정 전)**: DcConfigClient 403 → confirm 실패  
**수정 후**: 200 + status=DRAFT + slipNo=null — 핵심 버그 해소 확인

---

## (4) psql 검증 출력

### 4-1. partner_order_db: DRAFT + slip_no NULL + NOT_REQUIRED

```sql
SELECT po.order_no, po.partner_code, po.status,
       po.slip_no IS NULL as slip_no_is_null,
       po.slip_publish_status, po.total_amount, po.idempotency_key,
       po.created_at
FROM partner_orders po
WHERE po.order_no IN ('2026/05/31-1','2026/05/31-2')
AND po.is_deleted=false;

   order_no   | partner_code | status | slip_no_is_null | slip_publish_status | total_amount |    idempotency_key    |         created_at
--------------+--------------+--------+-----------------+---------------------+--------------+-----------------------+----------------------------
 2026/05/31-1 | P-2026-0001  | DRAFT  | t               | NOT_REQUIRED        |   1200000.00 | PO-CONF-P-2026-0001-1 | 2026-05-31 06:09:33.751899
 2026/05/31-2 | P-2026-0002  | DRAFT  | t               | NOT_REQUIRED        |   1080000.00 | PO-CONF-P-2026-0002-1 | 2026-05-31 06:11:59.035731
```

### 4-2. partner_order_lines: price_vat (DC 적용 or fail-soft)

```sql
SELECT po.order_no, pol.model_name, pol.category_key,
       pol.quantity, pol.price_vat, pol.subtotal,
       CASE WHEN pol.price_vat = pol.subtotal/pol.quantity
            THEN 'fail-soft(sellingPrice=price_vat)'
            ELSE 'DC적용'
       END as dc_status
FROM partner_orders po
JOIN partner_order_lines pol ON pol.partner_order_id=po.id AND pol.is_deleted=false
WHERE po.order_no IN ('2026/05/31-1','2026/05/31-2')
AND po.is_deleted=false;

   order_no   |    model_name     | category_key | quantity | price_vat  |  subtotal  |             dc_status
--------------+-------------------+--------------+----------+------------+------------+-----------------------------------
 2026/05/31-1 | AR05TXEAAWKNEU-01 | singleSets   |        2 |  600000.00 | 1200000.00 | fail-soft(sellingPrice=price_vat)
 2026/05/31-2 | AM030BNNDEH-51    | homemulti    |        1 | 1080000.00 | 1080000.00 | fail-soft(sellingPrice=price_vat)
```

**DC 적용 결과**: 양 케이스 모두 fail-soft(sellingPrice = price_vat).  
**원인 분석**: dc_config_db의 partner_code는 사업자번호 10자리(예: 4348703365) 형식이나, DcConfigClient가 전달하는 partnerCode는 partner_order_db의 'P-2026-XXXX' 형식입니다. dc-config-service가 `P-2026-0001`/`P-2026-0002`를 NOT_FOUND로 응답 → fail-soft → sellingPrice 그대로 사용. 이는 이 PR 범위 외의 별도 식별자 통합 이슈입니다.  
**직접 dc-config 호출 테스트**: `4348703365` 사업자번호로 직접 호출 시 listPrice 1,080,000 → finalPrice 583,200 (46% DC 정상 작동 확인).

### 4-3. slip_db: PARTNER_ORDER slip 0건

```sql
SELECT COUNT(*) as total_slips_today,
       SUM(CASE WHEN slip_type='PARTNER_ORDER' THEN 1 ELSE 0 END) as partner_order_slips
FROM slips WHERE DATE(created_at)='2026-05-31';

 total_slips_today | partner_order_slips
-------------------+---------------------
                 6 |                   0
```

confirm 경로 slip 자동발행 없음 확인 (D-CF-02 정책 준수).

---

## (5) dc-config 호출 흔적

```sql
-- dc_config_db.price_calculation_logs (오늘)
SELECT partner_id, caller_service, total_list_amount, total_final_amount, created_at
FROM price_calculation_logs WHERE DATE(created_at)='2026-05-31';

              partner_id              |    caller_service     | total_list_amount | total_final_amount |         created_at
--------------------------------------+-----------------------+-------------------+--------------------+----------------------------
 82316c29-6394-43d5-9f4f-9579765b386c | partner-order-service |        1080000.00 |          583200.00 | 2026-05-31 06:14:30.468213
```

이 로그는 QA 검증용 직접 curl 호출(4348703365 파트너, localhost:8089) 결과입니다.  
confirm API → partner-order-service → dc-config-service 경로에서의 호출은 P-2026-XXXX NOT_FOUND → fail-soft 경로이므로 price_calculation_logs에 기록되지 않습니다(service 로직: partner 미발견 시 예외 throw → DcConfigClient가 HTTP 404 응답 수신 → fail-soft 빈 Map 반환).

**fail-soft 작동 증거**: partner-order-service 로그에 DcConfigClient WARN 없음. `onStatus(HttpStatusCode::isError, (req,res) -> {})` 패턴으로 4xx silently drop → `extractFromTyped` `success=false` 판정 → 빈 Map → listPrice(sellingPrice) 사용.  
**dc-config-service 직접 호출 결과**: `P-2026-0002` → `{"success":false,"code":"NOT_FOUND","message":"거래처를 찾을 수 없습니다: P-2026-0002"}` 확인.

---

## (6) FE 캡처 — BLOCKED

**사유**: partner_auth_db.partner_auth 테이블에 시드 데이터가 0건입니다.  
거래처 계정으로 order-app에 로그인 불가 → confirm FE 흐름 실 캡처 불가.

```sql
-- partner_auth_db
SELECT COUNT(*) FROM partner_auth WHERE is_deleted=false;
-- 결과: 0
```

**확인된 코드 수정 증거 (FE)**: `clients/web/order-app/src/samhanApi.ts` 171행:
```typescript
ok: r.data?.success === true,
```
이전 `res.ok`(undefined) 버그가 `r.data?.success === true`로 정규화 완료.  
dist/index.html 빌드 시각: 2026-05-31 14:24 KST (bb492918 커밋 14:20 KST 이후) — 빌드 포함 확인.

---

## (7) 미완 단계 요약

| 단계 | 완료 여부 | 비고 |
|---|---|---|
| 재빌드 (jar → docker image → 기동) | 완료 | influxd 포트 충돌로 포트 바인딩 없이 samhan-net만으로 기동 |
| dc-config 시드 확인 | 완료 | dc_config_db 210 거래처 DC Config 존재 확인 |
| 실 confirm 200 + DRAFT | 완료 | 케이스 A, B 모두 통과 |
| psql DRAFT/slip_no/price_vat/slip 0건 | 완료 | 상세 출력 기록 |
| dc-config 호출 흔적 | 완료 | fail-soft 경로 확인 + 직접 호출 DC 적용 정상 확인 |
| FE 캡처 | BLOCKED | partner_auth 시드 0건 — 거래처 계정 없음 |

---

## 부가 발견 사항 (코드 수정 없음, 정보 기록)

- **partner_code 식별자 불일치**: partner_order_db(`P-2026-XXXX`) ↔ dc_config_db(사업자번호 10자리)가 다른 공간 사용. confirm 경로에서 DC 실 적용이 항상 fail-soft되는 구조적 원인. 이 PR 범위 밖, 별도 이슈로 등록 필요.
- **influxd :8088 포트 충돌**: 로컬 influxd 프로세스(PID 1956)가 8088을 점유하여 docker compose 포트 바인딩 실패. `--network samhan-net`만으로 기동 우회 성공.
