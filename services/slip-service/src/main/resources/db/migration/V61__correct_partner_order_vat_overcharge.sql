-- V61: 실 DB line_total(원래 사용자 총액)을 보존하는 VAT 중복 가산 정정.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE slip_line_correction_audits (
 id UUID PRIMARY KEY, slip_id UUID NOT NULL, slip_line_id UUID NOT NULL, slip_no VARCHAR(40) NOT NULL,
 correction_type VARCHAR(40) NOT NULL, before_values JSONB NOT NULL, after_values JSONB NOT NULL, reason TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL, created_by VARCHAR(50) NOT NULL, modified_at TIMESTAMP, modified_by VARCHAR(50),
 deleted_at TIMESTAMP, deleted_by VARCHAR(50), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE slip_line_correction_audits IS '과거 전표 금액 정정 이력';
CREATE INDEX ix_slip_line_correction_audits_slip ON slip_line_correction_audits (slip_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE TEMP TABLE vat_correction_targets (
 target_no INTEGER PRIMARY KEY, slip_no VARCHAR(40) NOT NULL, product_name VARCHAR(200) NOT NULL, model_name VARCHAR(100) NOT NULL,
 quantity INTEGER NOT NULL, old_unit_price NUMERIC(15,2) NOT NULL, old_unit_vat NUMERIC(15,2) NOT NULL,
 old_supply NUMERIC(17,2) NOT NULL, old_vat NUMERIC(15,2) NOT NULL, old_line_total NUMERIC(17,2) NOT NULL,
 new_unit_price NUMERIC(15,2) NOT NULL, new_unit_vat NUMERIC(15,2) NOT NULL, new_supply NUMERIC(17,2) NOT NULL,
 new_vat NUMERIC(15,2) NOT NULL, new_line_total NUMERIC(17,2) NOT NULL
) ON COMMIT DROP;
INSERT INTO vat_correction_targets VALUES
(1,'2026/05/31-1','', 'AM100BNNDEH-57',2,3000000,3300000,6000000,600000,6000000,2727272.50,3000000,5454545,545455,6000000),
(2,'2026/05/31-10','', 'AR09TXEAAWKNEU-04',1,1080000,1188000,1080000,108000,1080000,981818,1080000,981818,98182,1080000),
(3,'2026/05/31-10','', 'AR07TXEAAWKNEU-03',2,840000,924000,1680000,168000,1680000,763636.50,840000,1527273,152727,1680000),
(4,'2026/05/31-2','', 'AR05TXEAAWKNEU-01',1,750000,825000,750000,75000,750000,681818,750000,681818,68182,750000),
(5,'2026/05/31-3','', 'AR05TXEAAWKNEU-01',1,750000,825000,750000,75000,750000,681818,750000,681818,68182,750000),
(6,'2026/05/31-4','', 'AF20BX1NWAEAH-50',1,2100000,2310000,2100000,210000,2100000,1909091,2100000,1909091,190909,2100000),
(7,'2026/05/31-4','', 'AM030BNNDEH-51',2,900000,990000,1800000,180000,1800000,818182,900000,1636364,163636,1800000),
(8,'2026/05/31-5','', 'AC100CNCDEH-76',2,2400000,2640000,4800000,480000,4800000,2181818,2400000,4363636,436364,4800000),
(9,'2026/05/31-6','', 'AR11TXEAAWKNEU-05',4,1320000,1452000,5280000,528000,5280000,1200000,1320000,4800000,480000,5280000),
(10,'2026/05/31-6','', 'AC100CNCDEH-76',5,2400000,2640000,12000000,1200000,12000000,2181818,2400000,10909091,1090909,12000000),
(11,'2026/05/31-6','', 'AF20BX1NWAEAH-50',1,2100000,2310000,2100000,210000,2100000,1909091,2100000,1909091,190909,2100000),
(12,'2026/05/31-7','', 'AC100CNCDEH-76',1,2400000,2640000,2400000,240000,2400000,2181818,2400000,2181818,218182,2400000),
(13,'2026/05/31-8','', 'AR11TXEAAWKNEU-05',2,1320000,1452000,2640000,264000,2640000,1200000,1320000,2400000,240000,2640000),
(14,'2026/05/31-8','', 'AR05TXEAAWKNEU-01',1,750000,825000,750000,75000,750000,681818,750000,681818,68182,750000),
(15,'2026/05/31-8','', 'AM030BNNDEH-51',1,1080000,1188000,1080000,108000,1080000,981818,1080000,981818,98182,1080000),
(16,'2026/05/31-9','', 'AR06TXEAAWKNEU-02',1,720000,792000,720000,72000,720000,654545,720000,654545,65455,720000),
(17,'2026/05/31-9','', 'AR11TXEAAWKNEU-05',2,1320000,1452000,2640000,264000,2640000,1200000,1320000,2400000,240000,2640000),
(18,'2026/07/05-1','', 'AR13TXEAAWKNEU-06',1,1560000,1716000,1560000,156000,1560000,1418182,1560000,1418182,141818,1560000),
(19,'2026/07/05-2','', 'AR13TXEAAWKNEU-06',1,1560000,1716000,1560000,156000,1560000,1418182,1560000,1418182,141818,1560000);
UPDATE vat_correction_targets SET product_name = CASE target_no
 WHEN 1 THEN U&'\\C0BC\\C131 DVM-S 10HP' WHEN 2 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 9\\D3C9\\D615' WHEN 3 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 7\\D3C9\\D615'
 WHEN 4 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 5\\D3C9\\D615' WHEN 5 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 5\\D3C9\\D615'
 WHEN 6 THEN U&'\\C0BC\\C131 \\BE44\\C2A4\\D3EC\\D06C \\C2A4\\D0A0\\B4DC 20\\D3C9\\D615 (\\B2E8\\C885)' WHEN 7 THEN U&'\\C0BC\\C131 DVM-S 3HP'
 WHEN 8 THEN U&'\\C0BC\\C131 \\CC9C\\C7A5\\D615 3\\D1A4' WHEN 9 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 11\\D3C9\\D615' WHEN 10 THEN U&'\\C0BC\\C131 \\CC9C\\C7A5\\D615 3\\D1A4'
 WHEN 11 THEN U&'\\C0BC\\C131 \\BE44\\C2A4\\D3EC\\D06C \\C2A4\\D0A0\\B4DC 20\\D3C9\\D615 (\\B2E8\\C885)' WHEN 12 THEN U&'\\C0BC\\C131 \\CC9C\\C7A5\\D615 3\\D1A4'
 WHEN 13 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 11\\D3C9\\D615' WHEN 14 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 5\\D3C9\\D615' WHEN 15 THEN U&'\\C0BC\\C131 DVM-S 3HP'
 WHEN 16 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 6\\D3C9\\D615' WHEN 17 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 11\\D3C9\\D615'
 WHEN 18 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 13\\D3C9\\D615' WHEN 19 THEN U&'\\C0BC\\C131 \\C708\\B4DC\\D504\\B9AC 13\\D3C9\\D615' END;
UPDATE vat_correction_targets SET product_name = CASE
 WHEN target_no=1 THEN convert_from(decode('EC82BCEC84B12044564D2D532031304850','hex'),'UTF8')
 WHEN target_no=2 THEN convert_from(decode('EC82BCEC84B120EC9C88EB939CED9484EBA6AC2039ED8F89ED9895','hex'),'UTF8')
 WHEN target_no=3 THEN convert_from(decode('EC82BCEC84B120EC9C88EB939CED9484EBA6AC2037ED8F89ED9895','hex'),'UTF8')
 WHEN target_no IN (4,5,14) THEN convert_from(decode('EC82BCEC84B120EC9C88EB939CED9484EBA6AC2035ED8F89ED9895','hex'),'UTF8')
 WHEN target_no IN (6,11) THEN convert_from(decode('EC82BCEC84B120EBB984EC8AA4ED8FACED81AC20EC8AA4ED83A0EB939C203230ED8F89ED98952028EB8BA8ECA28529','hex'),'UTF8')
 WHEN target_no IN (7,15) THEN convert_from(decode('EC82BCEC84B12044564D2D5320334850','hex'),'UTF8')
 WHEN target_no IN (8,10,12) THEN convert_from(decode('EC82BCEC84B120ECB29CEC9EA5ED98952033ED86A4','hex'),'UTF8')
 WHEN target_no IN (9,13,17) THEN convert_from(decode('EC82BCEC84B120EC9C88EB939CED9484EBA6AC203131ED8F89ED9895','hex'),'UTF8')
 WHEN target_no=16 THEN convert_from(decode('EC82BCEC84B120EC9C88EB939CED9484EBA6AC2036ED8F89ED9895','hex'),'UTF8')
 WHEN target_no IN (18,19) THEN convert_from(decode('EC82BCEC84B120EC9C88EB939CED9484EBA6AC203133ED8F89ED9895','hex'),'UTF8') END;
CREATE TEMP TABLE vat_correction_matches ON COMMIT DROP AS
SELECT t.target_no,s.id AS slip_id,sl.id AS slip_line_id,
 CASE WHEN sl.unit_price=t.old_unit_price AND sl.unit_price_with_vat=t.old_unit_vat AND sl.supply_amount=t.old_supply AND sl.vat_amount=t.old_vat AND sl.line_total=t.old_line_total THEN 'OLD' ELSE 'NEW' END AS state
FROM slips s JOIN slip_lines sl ON sl.slip_id=s.id JOIN vat_correction_targets t
 ON t.slip_no=s.slip_no AND t.product_name=sl.product_name AND t.model_name=sl.model_name AND t.quantity=sl.quantity
 AND ((sl.unit_price=t.old_unit_price AND sl.unit_price_with_vat=t.old_unit_vat AND sl.supply_amount=t.old_supply AND sl.vat_amount=t.old_vat AND sl.line_total=t.old_line_total)
   OR (sl.unit_price=t.new_unit_price AND sl.unit_price_with_vat=t.new_unit_vat AND sl.supply_amount=t.new_supply AND sl.vat_amount=t.new_vat AND sl.line_total=t.new_line_total))
WHERE s.source_type='PARTNER_ORDER' AND NOT s.is_deleted AND NOT sl.is_deleted;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM vat_correction_matches GROUP BY target_no HAVING COUNT(*)>1) THEN RAISE EXCEPTION 'VAT correction target is ambiguous'; END IF; END $$;
INSERT INTO slip_line_correction_audits (id,slip_id,slip_line_id,slip_no,correction_type,before_values,after_values,reason,created_at,created_by,modified_at,modified_by,is_deleted)
SELECT gen_random_uuid(),s.id,sl.id,s.slip_no,'VAT_OVERCHARGE_CORRECTION',jsonb_build_object('unit_price',sl.unit_price,'unit_price_with_vat',sl.unit_price_with_vat,'supply_amount',sl.supply_amount,'vat_amount',sl.vat_amount,'line_total',sl.line_total),jsonb_build_object('unit_price',t.new_unit_price,'unit_price_with_vat',t.new_unit_vat,'supply_amount',t.new_supply,'vat_amount',t.new_vat,'line_total',t.new_line_total),'원천 partner order의 VAT 포함 단가와 대조해 중복 부가세 가산을 정정한다.',NOW(),'v61-vat-correction',NOW(),'v61-vat-correction',FALSE
FROM vat_correction_matches m JOIN slips s ON s.id=m.slip_id JOIN slip_lines sl ON sl.id=m.slip_line_id JOIN vat_correction_targets t ON t.target_no=m.target_no WHERE m.state='OLD';
UPDATE slip_lines sl SET unit_price=t.new_unit_price,unit_price_with_vat=t.new_unit_vat,supply_amount=t.new_supply,vat_amount=t.new_vat,line_total=t.new_line_total,modified_at=NOW(),modified_by='v61-vat-correction'
FROM vat_correction_matches m JOIN vat_correction_targets t ON t.target_no=m.target_no WHERE sl.id=m.slip_line_id AND m.state='OLD';
