-- QA 시드: PR #590 슬1 배차 발송 대기 검수 완료 게이트
-- A = 검수완료 (COMPLETED + inspector NOT NULL) → 미배차 목록에 표시되어야 함
-- B = 미검수 (PROCESSING + inspector NULL) → 미배차 목록에 표시되면 안 됨 (게이트)
-- 검수자 = dev_warehouse(개발창고) a0000000-0000-0000-0000-000000000006 (user_db employees 실재)

BEGIN;

-- 이전 QA 시드 정리 (재실행 idempotent)
DELETE FROM slips WHERE id IN (
  'dddddddd-0000-0000-0000-000000000a01',
  'dddddddd-0000-0000-0000-000000000b02'
);

-- (A) 검수완료 OUTBOUND 전표 — 게이트 통과(표시)
INSERT INTO slips (
  id, slip_type, slip_no, slip_date, seq_no, status,
  partner_id, partner_name, partner_code,
  requester_id, version, created_at, created_by, is_deleted,
  source_type, signature_source, driver_signature_source, lock_flag,
  dispatch_status, revision_count,
  inspector_user_id, inspector_signed_at,
  delivery_address, recipient_phone, customer_representative
) VALUES (
  'dddddddd-0000-0000-0000-000000000a01',
  'OUTBOUND', '2026/06/24-901', '2026-06-24', 901, 'COMPLETED',
  NULL, '대구공조(검수완료)', 'QA-GATE-A',
  'a0000000-0000-0000-0000-000000000001', 0, '2026-06-24 09:00:00', 'dev_master', false,
  'MANUAL', 'LINK', 'LINK', false,
  'UNDISPATCHED', 0,
  'a0000000-0000-0000-0000-000000000006', '2026-06-24 10:30:00',
  '대구광역시 동구 공항로 100 대구공조 물류창고', '010-1234-5678', '김인수'
);

-- (B) 미검수 OUTBOUND 전표 — 게이트 차단(미표시): status=PROCESSING, inspector NULL
INSERT INTO slips (
  id, slip_type, slip_no, slip_date, seq_no, status,
  partner_id, partner_name, partner_code,
  requester_id, version, created_at, created_by, is_deleted,
  source_type, signature_source, driver_signature_source, lock_flag,
  dispatch_status, revision_count,
  inspector_user_id, inspector_signed_at,
  delivery_address, recipient_phone, customer_representative
) VALUES (
  'dddddddd-0000-0000-0000-000000000b02',
  'OUTBOUND', '2026/06/24-902', '2026-06-24', 902, 'PROCESSING',
  NULL, '부산냉동(미검수)', 'QA-GATE-B',
  'a0000000-0000-0000-0000-000000000001', 0, '2026-06-24 09:05:00', 'dev_master', false,
  'MANUAL', 'LINK', 'LINK', false,
  'UNDISPATCHED', 0,
  NULL, NULL,
  '부산광역시 강서구 녹산산단 부산냉동 창고', '010-9876-5432', '박수령'
);

COMMIT;

-- 확인 출력
SELECT slip_no, status, dispatch_status, partner_name,
       inspector_user_id, inspector_signed_at,
       delivery_address, recipient_phone
FROM slips
WHERE id IN (
  'dddddddd-0000-0000-0000-000000000a01',
  'dddddddd-0000-0000-0000-000000000b02'
)
ORDER BY slip_no;
