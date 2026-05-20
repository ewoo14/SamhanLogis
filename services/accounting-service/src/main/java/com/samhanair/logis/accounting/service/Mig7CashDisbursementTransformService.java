package com.samhanair.logis.accounting.service;

import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-7 — 지출결의서 staging -> CashDisbursement 도메인 변환. */
@Service
public class Mig7CashDisbursementTransformService extends AbstractMig7CashTransformService {

    private static final UUID TRANSFORM_LOCK_NAMESPACE =
            UUID.fromString("4837a8c3-0c5e-4386-8b3f-6468c68a95f1");

    public Mig7CashDisbursementTransformService(NamedParameterJdbcTemplate jdbcTemplate) {
        super(jdbcTemplate, "staging.ecount_expense_voucher_raw", "cash_disbursements",
                "지출결의서", "EXPENSE_VOUCHER", TRANSFORM_LOCK_NAMESPACE);
    }
}
