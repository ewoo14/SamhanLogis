-- V26: 사용자 노출 serial_key와 재고상황과 독립된 quality 축.
-- 기존 행의 다른 값은 건드리지 않고, 비어 있는 serial_key만 소급 발급한다.
ALTER TABLE stock_instances
    ADD COLUMN serial_key VARCHAR(9),
    ADD COLUMN quality VARCHAR(20) DEFAULT 'NORMAL';

DO $$
DECLARE
    instance_row RECORD;
    candidate VARCHAR(9);
    suffix VARCHAR(6);
    i INTEGER;
BEGIN
    FOR instance_row IN
        SELECT id
        FROM stock_instances
        WHERE serial_key IS NULL OR btrim(serial_key) = ''
        ORDER BY id
    LOOP
        LOOP
            suffix := '';
            FOR i IN 0..5 LOOP
                suffix := suffix || substr(
                    '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
                    (get_byte(decode(md5(instance_row.id::text || clock_timestamp()::text || random()::text), 'hex'), i) % 30) + 1,
                    1);
            END LOOP;
            candidate := 'SI-' || suffix;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM stock_instances WHERE serial_key = candidate
            );
        END LOOP;
        UPDATE stock_instances
        SET serial_key = candidate
        WHERE id = instance_row.id
          AND (serial_key IS NULL OR btrim(serial_key) = '');
    END LOOP;
END $$;

UPDATE stock_instances
SET quality = 'NORMAL'
WHERE quality IS NULL;

ALTER TABLE stock_instances
    ALTER COLUMN serial_key SET NOT NULL,
    ALTER COLUMN quality SET NOT NULL;

CREATE UNIQUE INDEX ux_stock_instances_serial_key ON stock_instances(serial_key);
COMMENT ON COLUMN stock_instances.serial_key IS '사용자 노출 시리얼키 — SI- + 창고 방식 6자 혼동방지 코드';
COMMENT ON COLUMN stock_instances.quality IS '품질 축 — NORMAL/USED/DAMAGED/REPACKAGED/BOX_DEFECT';
