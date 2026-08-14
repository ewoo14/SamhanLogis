package com.samhanair.logis.slip.web.dto;
import java.util.List;
/** backfill 미해소 목록에서 격리할 전표번호와 감사 사유. */
public record SlipPartnerQuarantineRequest(List<String> slipNos, String reason) {}
