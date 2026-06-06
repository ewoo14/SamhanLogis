package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V39 account materialize 단계의 PARTNER 제외 검증.
 *
 * <p>C5-5 갱신: accounts.role 컬럼 DROP(V46) 이후 PARTNER 계정을 role 컬럼으로
 * 구별하는 방식이 제거되었다. 현재 PARTNER identity 는 partner-service 별도 인증이며
 * accounts 테이블에 PARTNER role row 를 INSERT 하는 경로가 없다.
 *
 * <p>따라서 이 IT 는 role_page_permission_templates 에 PARTNER 코드 행이 존재하면서도
 * account_page_permissions 에 연결된 실 계정이 없음을 검증하는 형태로 재작성한다.
 * (기존 "accounts.role = PARTNER" JOIN 쿼리 대신 template 보유 여부만 단언)
 */
@SpringBootTest(classes = AuthServiceApplication.class)
class V39PartnerExclusionIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000010");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("C5-5: PARTNER role_page_permission_templates 행이 존재해도 accounts 에 PARTNER role 계정이 없다")
    void partnerTemplatesExistButNoPartnerAccount() {
        // PARTNER role_page_permission_templates 는 존재해야 한다
        Integer partnerTemplates = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM role_page_permission_templates
                WHERE role_code = 'PARTNER'
                  AND is_deleted = FALSE
                """, Integer.class);
        assertThat(partnerTemplates)
                .as("PARTNER 템플릿 행이 존재해야 한다")
                .isPositive();

        // C5-5: accounts.role 컬럼 DROP(V46) 이후 accounts 테이블에 PARTNER role 컬럼이 없다.
        // 따라서 PARTNER account_page_permissions 행도 존재하지 않는다.
        // (기존 accounts.role = 'PARTNER' JOIN 방식 폐기)
        // 대신 PARTNER_ACCOUNT_ID (테스트 전용) 의 account_page_permissions 가 없음을 확인.
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_page_permissions
                WHERE account_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, PARTNER_ACCOUNT_ID);
        assertThat(count)
                .as("PARTNER 테스트 계정 UUID 에 대한 account_page_permissions 가 없어야 한다")
                .isZero();
    }
}
