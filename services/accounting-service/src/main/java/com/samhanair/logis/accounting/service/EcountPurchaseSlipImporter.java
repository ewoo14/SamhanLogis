package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-3 — 이카운트 입고전표 I CSV → purchase_accounting_slips import. */
@Service
public class EcountPurchaseSlipImporter extends AbstractEcountSlipImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("bc857bf0-f302-420f-a7b8-c9aa1354520a");
    static final String[] HEADERS = {"전표번호", "거래유형", "금액", "거래처명", "적요명"};

    public EcountPurchaseSlipImporter(NamedParameterJdbcTemplate jdbcTemplate,
                                      PartnerLookupClient partnerLookupClient) {
        super(jdbcTemplate, partnerLookupClient);
    }

    @Override protected UUID namespace() {
        return IMPORT_LOCK_NAMESPACE;
    }

    @Override protected String[] headers() {
        return HEADERS;
    }

    @Override protected String stagingTable() {
        return "staging.ecount_purchase_slip_raw";
    }

    @Override protected String slipTable() {
        return "purchase_accounting_slips";
    }

    @Override protected String lineTable() {
        return "purchase_accounting_slip_lines";
    }

    @Override protected String lineFkColumn() {
        return "slip_id";
    }

    @Override protected String importKind() {
        return "MIG3_PURCHASE";
    }
}
