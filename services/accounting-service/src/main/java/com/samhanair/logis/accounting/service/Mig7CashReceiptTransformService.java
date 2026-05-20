package com.samhanair.logis.accounting.service;

import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-7 — 입금보고서 staging -> CashReceipt 도메인 변환. */
@Service
public class Mig7CashReceiptTransformService extends AbstractMig7CashTransformService {

    private static final UUID TRANSFORM_LOCK_NAMESPACE =
            UUID.fromString("0cb8ecaa-53ea-4ff5-95d1-b39c55f2e8f4");

    public Mig7CashReceiptTransformService(NamedParameterJdbcTemplate jdbcTemplate) {
        super(jdbcTemplate, "staging.ecount_deposit_report_raw", "cash_receipts",
                "입금보고서", "DEPOSIT_REPORT", TRANSFORM_LOCK_NAMESPACE);
    }
}
