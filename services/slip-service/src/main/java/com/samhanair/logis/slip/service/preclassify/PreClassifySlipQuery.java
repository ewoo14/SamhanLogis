package com.samhanair.logis.slip.service.preclassify;

import java.time.LocalDate;
import java.util.List;

public interface PreClassifySlipQuery {
    List<PreClassifySlip> find(LocalDate from, LocalDate to);
}
