\set ON_ERROR_STOP on

\connect slip_db

INSERT INTO slips
SELECT (
  jsonb_populate_record(
    NULL::slips,
    to_jsonb(source_slip) || jsonb_build_object(
      'id', '84500000-0000-4000-8000-000000000001',
      'slip_no', '2026/08/12-845',
      'slip_date', '2026-08-12',
      'seq_no', 845,
      'partner_name', 'PR #1158 한글 보존 48라인 QA',
      'requester_id', 'dev_master',
      'created_at', clock_timestamp(),
      'created_by', 'reconv2-845',
      'modified_at', null,
      'modified_by', null
    )
  )
).*
FROM slips source_slip
WHERE source_slip.id = 'fe0a9968-0a0f-4fef-b0fd-f5671d261434';

INSERT INTO slip_lines
SELECT (
  jsonb_populate_record(
    NULL::slip_lines,
    to_jsonb(source_line) || jsonb_build_object(
      'id', md5(source_line.id::text || '-' || series.n::text)::uuid,
      'slip_id', '84500000-0000-4000-8000-000000000001',
      'product_name', source_line.product_name || ' QA-' || series.n,
      'model_name', coalesce(source_line.model_name, '-') || '-QA' || series.n,
      'created_at', source_line.created_at + make_interval(secs => series.n),
      'created_by', 'reconv2-845',
      'modified_at', null,
      'modified_by', null
    )
  )
).*
FROM slip_lines source_line
CROSS JOIN generate_series(1, 4) AS series(n)
WHERE source_line.slip_id = 'fe0a9968-0a0f-4fef-b0fd-f5671d261434'
  AND source_line.is_deleted = false;

SELECT 'fixture_slip' AS kind, s.slip_no, s.partner_name, count(sl.id) AS active_lines
FROM slips s
JOIN slip_lines sl ON sl.slip_id = s.id AND sl.is_deleted = false
WHERE s.id = '84500000-0000-4000-8000-000000000001'
GROUP BY s.slip_no, s.partner_name;

\connect groupware_db

UPDATE approval_attachments
SET ref_doc_no = '2026/08/07-20', modified_at = clock_timestamp(), modified_by = 'reconv2-845'
WHERE approval_id = '77554976-81f7-4756-bb94-303f65d32e8f'
  AND attachment_type = 'SLIP_REF';

UPDATE approval_attachments
SET ref_doc_no = '2026/08/12-845', modified_at = clock_timestamp(), modified_by = 'reconv2-845'
WHERE approval_id = '27d08fba-fc64-492a-9360-f3e75c62b83c'
  AND attachment_type = 'SLIP_REF';

SELECT 'attachment' AS kind, approval_id::text, ref_doc_no
FROM approval_attachments
WHERE approval_id IN (
  '77554976-81f7-4756-bb94-303f65d32e8f',
  '27d08fba-fc64-492a-9360-f3e75c62b83c'
)
ORDER BY approval_id;
