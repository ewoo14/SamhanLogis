-- V122: OUTBOUND 배송태그 재구성
--
-- DAY는 SALE로 개명하고, 기존 null 출고전표는 SALE로 명시한다.
-- 변경 대상은 감사 테이블에 원래 값을 남겨 식별·검토·보상 복구가 가능하다.
-- INBOUND는 V121에서 이미 PURCHASE로 정규화했으므로 이 migration에서 건드리지 않는다.

CREATE TABLE IF NOT EXISTS slip_delivery_tag_v122_audit (
    slip_id UUID PRIMARY KEY,
    slip_no VARCHAR(30) NOT NULL,
    previous_delivery_tag VARCHAR(30),
    new_delivery_tag VARCHAR(30) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(100) NOT NULL
);

INSERT INTO slip_delivery_tag_v122_audit
    (slip_id, slip_no, previous_delivery_tag, new_delivery_tag, reason)
SELECT id, slip_no, delivery_tag, 'SALE',
       CASE WHEN delivery_tag IS NULL THEN 'OUTBOUND_NULL_TO_SALE'
            ELSE 'OUTBOUND_DAY_TO_SALE'
       END
  FROM slips
 WHERE slip_type = 'OUTBOUND'
   AND deleted_at IS NULL
   AND (delivery_tag IS NULL OR delivery_tag = 'DAY')
ON CONFLICT (slip_id) DO NOTHING;

UPDATE slips
   SET delivery_tag = 'SALE'
 WHERE slip_type = 'OUTBOUND'
   AND deleted_at IS NULL
   AND (delivery_tag IS NULL OR delivery_tag = 'DAY');

-- V51의 4개 업무 마감만 남긴다. DAY/LOGEN의 00:01 행과
-- 혹시 선행 환경에서 수동 생성된 SALE 행은 soft-delete하여 판매에 마감이 붙지 않게 한다.
CREATE TABLE IF NOT EXISTS slip_outbound_cutoff_v122_audit (
    cutoff_id UUID PRIMARY KEY,
    delivery_tag VARCHAR(40) NOT NULL,
    cutoff_time TIME NOT NULL,
    active BOOLEAN NOT NULL,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(100) NOT NULL
);

INSERT INTO slip_outbound_cutoff_v122_audit
    (cutoff_id, delivery_tag, cutoff_time, active, deleted_at, deleted_by, reason)
SELECT id, delivery_tag, cutoff_time, active, deleted_at, deleted_by,
       'REMOVE_LEGACY_DAY_LOGEN_OR_SALE_CUTOFF'
  FROM slip_outbound_cutoff
 WHERE is_deleted = FALSE
   AND delivery_tag IN ('DAY', 'LOGEN', 'SALE')
ON CONFLICT (cutoff_id) DO NOTHING;

UPDATE slip_outbound_cutoff
   SET is_deleted = TRUE,
       deleted_at = CURRENT_TIMESTAMP,
       deleted_by = 'v122-cutoff-cleanup',
       modified_at = CURRENT_TIMESTAMP,
       modified_by = 'v122-cutoff-cleanup'
 WHERE is_deleted = FALSE
   AND delivery_tag IN ('DAY', 'LOGEN', 'SALE');

-- 조용한 유실을 방지한다. 활성 출고전표는 새 11종에만 남아야 하며,
-- 활성 마감도 결정된 4종 외에는 남아 있으면 안 된다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM slips
         WHERE slip_type = 'OUTBOUND'
           AND deleted_at IS NULL
           AND delivery_tag NOT IN (
               'SALE', 'RENTAL', 'BORROW_RETURN', 'DEFECT_RETURN',
               'DIRECT_DELIVERY', 'PREEMPTIVE_ACTION', 'LOGEN',
               'GYEONGDONG_PARCEL', 'GYEONGDONG_FREIGHT', 'STACK', 'REGION'
           )
    ) THEN
        RAISE EXCEPTION 'V122: unknown active OUTBOUND delivery_tag remains';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM slip_outbound_cutoff
         WHERE is_deleted = FALSE
           AND delivery_tag NOT IN ('REGION', 'STACK', 'GYEONGDONG_PARCEL', 'GYEONGDONG_FREIGHT')
    ) THEN
        RAISE EXCEPTION 'V122: unexpected active outbound cutoff remains';
    END IF;
END $$;
