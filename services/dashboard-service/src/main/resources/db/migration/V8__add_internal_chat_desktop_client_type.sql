-- V8__add_internal_chat_desktop_client_type.sql
-- V7 적용 DB와 fresh DB 모두 INTERNAL_CHAT_DESKTOP을 허용하도록 client_type 계약을 확장한다.

ALTER TABLE app_release
    DROP CONSTRAINT IF EXISTS ck_app_release_client_type;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_app_release_client_type'
          AND conrelid = 'app_release'::regclass
    ) THEN
        ALTER TABLE app_release
            ADD CONSTRAINT ck_app_release_client_type
                CHECK (client_type IN (
                    'DESKTOP',
                    'SAMHAN_MOBILE',
                    'SAMHAN_MOBILE_STAFF',
                    'AROLOGIS_MOBILE',
                    'SAMHAN_ORDER_WEB',
                    'SAMHAN_ESTIMATE_WEB',
                    'SAMHAN_MOBILE_PUBLIC_WEB',
                    'AROLOGIS_DESKTOP',
                    'INTERNAL_CHAT_DESKTOP',
                    'WEB',
                    'MOBILE'
                ));
    END IF;
END
$$;
