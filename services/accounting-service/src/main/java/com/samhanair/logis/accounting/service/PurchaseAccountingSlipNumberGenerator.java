package com.samhanair.logis.accounting.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;

/**
 * 매입 회계전표 번호를 {@code yyyy/MM/dd-NNNN} 형식으로 생성한다.
 */
@Component
public class PurchaseAccountingSlipNumberGenerator {
    /** PoC = timestamp 기반. 운영 cycle 2 에서 DB sequence generator 로 교체. */
    public String next(LocalDate date) {
        return date.format(DateTimeFormatter.ofPattern("yyyy/MM/dd"))
                + "-" + String.format("%04d", (int) (System.currentTimeMillis() % 10000));
    }
}
