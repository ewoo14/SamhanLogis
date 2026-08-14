package com.samhanair.logis.slip.web.dto;
import java.util.List;
/** 복원 처리 결과. */
public record SlipPartnerRestoreResponse(long restoredCount, List<String> restoredSlipNos) {}
