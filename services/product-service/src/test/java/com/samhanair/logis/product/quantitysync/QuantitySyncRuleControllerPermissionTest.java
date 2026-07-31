package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.web.QuantitySyncRuleController;
import com.samhanair.logis.security.permission.RequirePermission;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

/** 전역 관리자 수량 동기화 규칙을 PARTNER self-service로 공개하지 않는 권한 경계를 검증한다. */
class QuantitySyncRuleControllerPermissionTest {

    @Test
    void listEndpointIsNotPartnerSelfServiceWithoutPartnerScope() throws Exception {
        Method list = QuantitySyncRuleController.class.getMethod("list", QuantitySyncEstimateCategory.class);
        RequirePermission permission = list.getAnnotation(RequirePermission.class);

        assertThat(permission).isNotNull();
        assertThat(permission.partnerSelfService()).isFalse();
        assertThat(permission.action().name()).isEqualTo("VIEW");
    }
}
