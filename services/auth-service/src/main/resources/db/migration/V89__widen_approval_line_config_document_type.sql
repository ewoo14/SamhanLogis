SET LOCAL lock_timeout = '5s';

ALTER TABLE approval_line_config ALTER COLUMN document_type TYPE VARCHAR(70);
