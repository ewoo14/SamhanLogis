package com.samhanair.logis.slip.web.dto;
import java.util.List;
/** 거래처 복구 후 격리를 해제할 전표번호 목록. */
public record SlipPartnerRestoreRequest(List<String> slipNos) {}
