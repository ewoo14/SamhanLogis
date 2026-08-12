package com.samhanair.logis.shared.audit.contract;

import static com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction;

public final class AuditTopology {
    public static final String EXCHANGE = "samhan.audit.exchange";
    public static final String ROUTING_PREFIX = "audit.";
    private AuditTopology() {}

    public static String routingKey(AuditAction action, String serviceName) {
        String lane = switch (action) {
            case A_CHANGE -> "change";
            case B_FAILURE -> "failure";
            case C_READ -> "read";
        };
        return ROUTING_PREFIX + lane + "." + serviceName;
    }
}
