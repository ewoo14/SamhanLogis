-- partner_code 는 서버가 biz_no 숫자에서 파생하므로 active row 안에서 유일해야 한다.
-- soft-delete 된 과거 row 는 재가입을 막지 않도록 partial unique index 로 제한한다.
CREATE UNIQUE INDEX ux_partner_auth_partner_code_active
    ON partner_auth (partner_code)
    WHERE is_deleted = FALSE AND partner_code IS NOT NULL;
