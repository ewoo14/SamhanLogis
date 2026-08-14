package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-3 — 이카운트 출고전표 I CSV → sales_accounting_slips import. */
@Service
public class EcountSalesSlipImporter extends AbstractEcountSlipImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("f33fe672-c8f4-4ab6-8c56-5dc1faeb0442");
    static final String[] HEADERS = {"전표번호", "거래유형", "금액", "거래처명", "적요명"};

    public EcountSalesSlipImporter(NamedParameterJdbcTemplate jdbcTemplate,
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
        return "staging.ecount_sales_slip_raw";
    }

    @Override protected String slipTable() {
        return "sales_accounting_slips";
    }

    @Override protected String lineTable() {
        return "sales_accounting_slip_lines";
    }

    @Override protected String lineFkColumn() {
        return "slip_id";
    }

    @Override protected String importKind() {
        return "MIG3_SALES";
    }
}
