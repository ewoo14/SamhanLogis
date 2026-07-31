package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.web.QuantitySyncRuleController;
import com.samhanair.logis.security.permission.RequirePermission;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

/** PARTNER가 관측용 자기범위 목록만 읽을 수 있는 권한 경계를 검증한다. */
class QuantitySyncRuleControllerPermissionTest {

    @Test
    void listEndpointIsPartnerSelfServiceForShadowObservation() throws Exception {
        Method list = QuantitySyncRuleController.class.getMethod("list", QuantitySyncEstimateCategory.class,
                String.class);
        RequirePermission permission = list.getAnnotation(RequirePermission.class);

        assertThat(permission).isNotNull();
        assertThat(permission.partnerSelfService()).isTrue();
        assertThat(permission.action().name()).isEqualTo("VIEW");
    }
}
