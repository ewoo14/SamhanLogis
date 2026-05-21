package com.samhanair.logis.accounting.service;

import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-11 — 이카운트 매입장 XLSX staging import + DailyClosing 검증. */
@Service
public class EcountPurchaseLedgerImporter extends AbstractEcountMig11LedgerImporter {

    public static final String[] HEADERS = {
            "월/일", "거래처코드", "유형명", "전자구분", "거래처명", "적요",
            "매입공급가액", "매입부가세"
    };

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("49c1ca3c-3296-452f-a584-c442b7d0ed3d");

    public EcountPurchaseLedgerImporter(NamedParameterJdbcTemplate jdbcTemplate) {
        super(jdbcTemplate,
                "staging.ecount_purchase_ledger_raw",
                HEADERS,
                new LedgerMapping("유형명", "전자구분", "매입공급가액", "매입부가세", "",
                        0, 1, 4, 5),
                IMPORT_LOCK_NAMESPACE,
                "PURCHASE",
                "PURCHASE_LEDGER",
                false);
    }
}
