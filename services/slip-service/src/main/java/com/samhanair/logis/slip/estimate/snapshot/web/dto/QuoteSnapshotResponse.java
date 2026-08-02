package com.samhanair.logis.slip.estimate.snapshot.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.slip.estimate.snapshot.domain.QuoteSnapshot;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** 종합견적서 저장·목록 응답 — UUID는 내부 키로만 사용하고 화면 식별자로 쓰지 않는다. */
public record QuoteSnapshotResponse(
        String id,
        String created,
        String authorEmail,
        List<String> participantEmails,
        String custName,
        JsonNode data,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        BigDecimal totalAmount) {

    /** 목록·재오픈용 전체 응답. */
    public static QuoteSnapshotResponse full(QuoteSnapshot s) {
        return new QuoteSnapshotResponse(s.getId().toString(),
                s.getSavedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                s.getAuthorEmail(), s.getParticipantEmails(), s.getCustName(), s.getSnapshotState(),
                s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount());
    }

    /** 저장·수정 결과 응답. */
    public static QuoteSnapshotResponse meta(QuoteSnapshot s) {
        return full(s);
    }
}
