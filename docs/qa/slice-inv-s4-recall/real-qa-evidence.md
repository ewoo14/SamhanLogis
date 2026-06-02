# 시리얼 인스턴스 회수연동 S4 — Docker 실 QA 증빙

> 2026-06-03 자율 세션. 실 게이트웨이(:8080) + 실 JWT(dev_master/MASTER) + 실 inventory-service + 실 Postgres(inventory_db). **합성·mock 없음 — 실 API 응답 + 실 psql 출력만** ([[no-fake-data-ever]]).

## 환경

- 컨테이너: inventory/slip/product-service 를 본 브랜치(feat/serial-instance-s4-recall, HEAD e939de90)로 **`--no-cache` 재빌드 + force-recreate**. 3서비스 healthy.
- Flyway: inventory_db **V18 적용 확인** (`SELECT version FROM flyway_schema_history` → 18/17). V18 recall_slip_no 컬럼/멱등 인덱스 정상 반영.
- 빌드 격리: `GRADLE_USER_HOME=.gradle-codex` + `--no-daemon`.

## 시나리오 — INBOUND 반품/회차 인스턴스 회수 (게이트웨이 경유)

준비: productCode `010001` AVAILABLE → reserve-batch(S4Q-OUT-1) + ship-batch(partnerCode CUST-S4Q) → SHIPPED 생성(HTTP 200/200).

### ① 회수 (recall) — POST /api/v1/inventory/instances/recall-batch
요청: `{partnerCode:CUST-S4Q, productCode:010001, quantity:1, recallSlipNo:S4Q-RET-1}`
응답: `200 "인스턴스 회수 완료" count=1 status=RECALLED recallSlipNo=S4Q-RET-1`
psql: `SELECT status, recall_slip_no WHERE recall_slip_no='S4Q-RET-1'` → `RECALLED | S4Q-RET-1`
→ **SHIPPED→RECALLED + recall_slip_no(회수전표) 기록** 실증.

### ② 회수 대상 부족 사전차단 — recall-batch (quantity 2 > 가용 SHIPPED 0)
응답: **HTTP 409** → 회수 0건. (후보 크기 단일 판정, S3 D-SER-11 패턴)

### ③ 멱등 — recall-batch (S4Q-RET-1 재호출, quantity 1)
응답: `count=1` (기존 RECALLED 반환, 추가 회수 0). recallSlipNo 마커 기준 멱등 실증.

### ④ 역-FIFO 회수 — recall-batch (CUST-S3 SHIPPED 2건 중 1)
요청: `{partnerCode:CUST-S3, productCode:010001, quantity:1, recallSlipNo:S4Q-RET-2}`
응답: `회수 1건 RECALLED`. outbound_at DESC 역-FIFO 최근 출고분 회수.

### 최종 psql
```
  status  | outbound_partner_code | recall_slip_no
 SHIPPED  | CUST-S3               |
 RECALLED | CUST-S3               | S4Q-RET-2
 RECALLED | CUST-S4Q              | S4Q-RET-1
```

## 판정

- **회수 4종(recall/부족 409/멱등/역-FIFO) 실 게이트웨이 end-to-end PASS, skip·error 0.**
- slip INBOUND RETURN/RETURN_TRIP complete→recall 연동은 **SlipInboundInstanceIT(실 Testcontainers Postgres)** 로 실증 — CI 20 job green.
- 코드 무결성: inventory 408 / slip 781 skipped=0·fail0·err0.

## ⚠️ 후속 (Codex cross-check P1 — 개발책임자 결정 대기)

- **completeRecallInbound 보상 인프라**: 혼합전표 serial recall 성공 후 batch inbound 실패 시 un-recall(RECALLED→SHIPPED) 보상 부재. S3 accept 보상과 달리 recall 역전이 인프라 신규 필요.
- **recallBatch 동시성**: 다른 recallSlipNo 동시 회수 시 같은 SHIPPED 후보 중복 선택(advisory lock key recallSlipNo|productCode, row lock/@Version 없음). **S3 reserveBatch 공통 구조**.
- → "시리얼 동시성·보상 강화" 후속 슬라이스로 분리 권장(S3 포함). happy-path 무결, 발생 조건(혼합전표 batch 실패 / 동일 거래처·품목 동시 2전표) 제한적.
