package com.samhanair.logis.slip.web.dto;
import java.util.List;
/** 격리 처리 결과. */
public record SlipPartnerQuarantineResponse(long quarantinedCount, List<String> quarantinedSlipNos) {}
