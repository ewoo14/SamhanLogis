SET LOCAL lock_timeout = '5s';

ALTER TABLE approval_lines ALTER COLUMN document_type TYPE VARCHAR(70);
ALTER TABLE document_templates ALTER COLUMN doc_type TYPE VARCHAR(70);

UPDATE approval_lines SET document_type = 'GROUPWARE_' || t.code
  FROM approval_templates t
 WHERE approval_lines.template_id = t.id
   AND approval_lines.document_type IS NULL
   AND length('GROUPWARE_' || t.code) BETWEEN 41 AND 70;
