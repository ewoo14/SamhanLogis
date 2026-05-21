package com.samhanair.logis.accounting.service;

import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-11 — 이카운트 매출장 XLSX staging import + DailyClosing 검증. */
@Service
public class EcountSalesLedgerImporter extends AbstractEcountMig11LedgerImporter {

    public static final String[] HEADERS = {
            "월/일", "유형명", "전자구분", "거래처코드", "거래처명", "적요",
            "매출공급가액", "매출부가세", "매출합계"
    };

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("e3ef57c7-98a0-41a2-bc92-4a6b985bb321");

    public EcountSalesLedgerImporter(NamedParameterJdbcTemplate jdbcTemplate) {
        super(jdbcTemplate,
                "staging.ecount_sales_ledger_raw",
                HEADERS,
                new LedgerMapping("유형명", "전자구분", "매출공급가액", "매출부가세", "매출합계",
                        0, 3, 4, 5),
                IMPORT_LOCK_NAMESPACE,
                "SALES",
                "SALES_LEDGER",
                true);
    }
}
