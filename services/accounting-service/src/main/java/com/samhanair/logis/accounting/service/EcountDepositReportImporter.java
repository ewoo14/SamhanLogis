package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-5 — 이카운트 입금보고서 CSV staging import + Partner aging 검증. */
@Service
public class EcountDepositReportImporter extends AbstractEcountMig5CashImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("2ad8db4e-6de7-4d4c-a52d-5a8d37697d7c");

    public EcountDepositReportImporter(NamedParameterJdbcTemplate jdbcTemplate,
                                       PartnerLookupClient partnerLookupClient) {
        super(jdbcTemplate, partnerLookupClient, "staging.ecount_deposit_report_raw",
                "입금보고서", IMPORT_LOCK_NAMESPACE, "1089", true);
    }
}
