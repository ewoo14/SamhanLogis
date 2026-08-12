package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

/**
 * 분개 헤더 응답 (페이지 조회용 — 라인 미포함). 비즈니스 식별자는 journalNo, 사용자 표시는
 * 분개번호+일자+금액 위주. id 는 mutation 용 (FE 에서 숨김 권장).
 */
public record JournalResponse(
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
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID reversedJournalId
) {
    public static JournalResponse of(Journal journal) {
        return new JournalResponse(
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
                journal.getReversedJournalId()
        );
    }
}
