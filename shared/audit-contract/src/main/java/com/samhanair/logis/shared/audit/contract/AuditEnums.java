package com.samhanair.logis.shared.audit.contract;

public final class AuditEnums {
    private AuditEnums() {}

    public enum RetentionClass { A, B, C }
    public enum EventKind { READ, MUTATION, AUTH, BATCH, INTERNAL }
    public enum Outcome { SUCCESS, FAILURE, NO_CHANGE }
    public enum AuditAction { C_READ, A_CHANGE, B_FAILURE }
}
