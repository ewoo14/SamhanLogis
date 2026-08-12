package com.samhanair.logis.shared.audit.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction;
import com.samhanair.logis.shared.audit.contract.AuditEnums.EventKind;
import com.samhanair.logis.shared.audit.contract.AuditEnums.Outcome;
import com.samhanair.logis.shared.audit.contract.AuditEnums.RetentionClass;

class AuditEventContractTest {
    @Test
    void v2_defaultsStableIdAndTimestampAndRoutesMutation() {
        AuditEventV2 event = new AuditEventV2(null, null, "dc-config-service", RetentionClass.A,
                EventKind.MUTATION, Outcome.SUCCESS, AuditAction.A_CHANGE, null, null, null,
                "PATCH", "/partners/{partnerCode}", 200, 5L, null, "개발자", null,
                "DC_CONFIG", "P-001", "uuid", "변경", null, null, null, null, null, null, null, null, null, Instant.now());

        assertThat(event.id()).isNotBlank();
        assertThat(event.occurredAt()).isNotNull();
        assertThat(event.routingKey()).isEqualTo("audit.change.dc-config-service");
        AuditEventValidator.validate(event);
    }

    @Test
    void routingRetentionMismatchIsRejected() {
        AuditEventV2 event = new AuditEventV2("v2", "e-1", "x", RetentionClass.C,
                EventKind.MUTATION, Outcome.SUCCESS, AuditAction.A_CHANGE, null, null, null,
                "PATCH", "/x", 200, 1L, null, null, null, "X", "x", null, "x", null, null,
                null, null, null, null, null, null, null, Instant.now());
        assertThatThrownBy(() -> AuditEventValidator.validate(event))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
