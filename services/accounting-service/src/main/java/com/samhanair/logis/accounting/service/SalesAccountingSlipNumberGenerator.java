package com.samhanair.logis.accounting.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;

@Component
public class SalesAccountingSlipNumberGenerator {
    /** PoC = timestamp 기반. 운영 cycle 2 에서 DB sequence generator 로 교체. */
    public String next(LocalDate date) {
        return "SAS-" + date.format(DateTimeFormatter.ofPattern("yyyy-MM"))
                + "-" + String.format("%04d", (int) (System.currentTimeMillis() % 10000));
    }
}
