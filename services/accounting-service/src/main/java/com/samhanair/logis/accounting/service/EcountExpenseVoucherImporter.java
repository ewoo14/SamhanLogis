package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-5 — 이카운트 지출결의서 CSV staging import + Partner aging 검증. */
@Service
public class EcountExpenseVoucherImporter extends AbstractEcountMig5CashImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("1df5f9ad-df76-4a1f-9dcf-38fbbe0f9271");

    public EcountExpenseVoucherImporter(NamedParameterJdbcTemplate jdbcTemplate,
                                        PartnerLookupClient partnerLookupClient) {
        super(jdbcTemplate, partnerLookupClient, "staging.ecount_expense_voucher_raw",
                "지출결의서", IMPORT_LOCK_NAMESPACE, "2519", false);
    }
}
