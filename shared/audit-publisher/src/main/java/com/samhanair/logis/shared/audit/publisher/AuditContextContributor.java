package com.samhanair.logis.shared.audit.publisher;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;

@FunctionalInterface
public interface AuditContextContributor {
    AuditEventV2 contribute(AuditEventV2 event);
}
