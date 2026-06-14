package com.samhanair.logis.accounting.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;

/**
 * 매출 회계전표 번호를 {@code yyyy/MM/dd-N} 형식으로 생성한다.
 */
@Component
public class SalesAccountingSlipNumberGenerator {
    /** PoC = timestamp 기반. 운영 cycle 2 에서 DB sequence generator 로 교체. */
    public String next(LocalDate date) {
        return format(date, (int) (System.currentTimeMillis() % 10000));
    }

    static String format(LocalDate date, int sequence) {
        return date.format(DateTimeFormatter.ofPattern("yyyy/MM/dd"))
                + "-" + String.format("%d", sequence);
    }
}
