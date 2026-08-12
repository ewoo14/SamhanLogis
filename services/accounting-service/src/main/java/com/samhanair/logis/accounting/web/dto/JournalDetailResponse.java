package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

/** 분개 단건 상세 — 라인 포함. */
public record JournalDetailResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        String journalNo,
        LocalDate journalDate,
        String description,
        JournalSourceType sourceType,
        JournalStatus status,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        LocalDateTime postedAt,
        String postedBy,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID reversedJournalId,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID sourceRefId,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID cashReceiptId,
        String cashReceiptSlipNo,
        List<JournalLineResponse> lines
) {
    public static JournalDetailResponse of(Journal journal) {
        return of(journal, Map.of(), Map.of(), null);
    }

    public static JournalDetailResponse of(Journal journal,
                                           Map<String, String> accountNamesByCode,
                                           Map<UUID, String> partnerNamesById) {
        return of(journal, accountNamesByCode, partnerNamesById, null);
    }

    public static JournalDetailResponse of(Journal journal,
                                           Map<String, String> accountNamesByCode,
                                           Map<UUID, String> partnerNamesById,
                                           String cashReceiptSlipNo) {
        List<JournalLineResponse> lineResponses = journal.getLines().stream()
                .map(line -> JournalLineResponse.of(
                        line,
                        accountNamesByCode.get(line.getAccountCode()),
                        line.getPartnerId() == null ? null : partnerNamesById.get(line.getPartnerId())))
                .toList();
        return new JournalDetailResponse(
                journal.getId(),
                journal.getJournalNo(),
                journal.getJournalDate(),
                journal.getDescription(),
                journal.getSourceType(),
                journal.getStatus(),
                journal.totalDebit(),
                journal.totalCredit(),
                journal.getPostedAt(),
                journal.getPostedBy(),
                journal.getReversedJournalId(),
                journal.getSourceRefId(),
                journal.getCashReceiptId(),
                cashReceiptSlipNo,
                lineResponses
        );
    }
}
