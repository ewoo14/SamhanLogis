package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** 분개 단건 상세 — 라인 포함. */
public record JournalDetailResponse(
        UUID id,
        String journalNo,
        LocalDate journalDate,
        String description,
        JournalSourceType sourceType,
        JournalStatus status,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        LocalDateTime postedAt,
        String postedBy,
        UUID reversedJournalId,
        Long version,
        List<JournalLineResponse> lines
) {
    public static JournalDetailResponse of(Journal journal) {
        List<JournalLineResponse> lineResponses = journal.getLines().stream()
                .map(JournalLineResponse::of)
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
                journal.getVersion(),
                lineResponses
        );
    }
}
