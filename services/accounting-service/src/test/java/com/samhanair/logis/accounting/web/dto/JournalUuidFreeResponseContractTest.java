package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** 분개 목록·상세 응답 전체와 중첩 라인에 원시 UUID가 섞이지 않는 계약을 고정한다. */
class JournalUuidFreeResponseContractTest {

    private static final UUID JOURNAL_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID REVERSED_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID SOURCE_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID LINE_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final UUID CASH_RECEIPT_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");

    @Test
    void listAndDetailResponseBodies_areUuidFreeAcrossNestedLines() throws Exception {
        JournalResponse listRow = new JournalResponse(
                JOURNAL_ID, "20260813-1", LocalDate.of(2026, 8, 13), "적요",
                null, null, BigDecimal.TEN, BigDecimal.TEN, null, null, REVERSED_ID);
        JournalDetailResponse detail = new JournalDetailResponse(
                JOURNAL_ID, "20260813-1", LocalDate.of(2026, 8, 13), "적요",
                null, null, BigDecimal.TEN, BigDecimal.TEN, LocalDateTime.now(), "담당자",
                REVERSED_ID, SOURCE_ID, CASH_RECEIPT_ID, "20260813-입금",
                List.of(new JournalLineResponse(LINE_ID, 1, "110", "현금", BigDecimal.TEN,
                        BigDecimal.ZERO, "거래처", "메모")));

        String responseBody = new ObjectMapper().findAndRegisterModules().writeValueAsString(Map.of(
                "list", Map.of("content", List.of(listRow)),
                "detail", detail));

        Matcher matcher = Pattern.compile(
                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
                .matcher(responseBody);
        List<String> uuidMatches = new java.util.ArrayList<>();
        while (matcher.find()) {
            uuidMatches.add(matcher.start() + ":" + matcher.group());
        }
        assertThat(uuidMatches).as("분개 목록·상세 응답 전체 UUID scan — 위치:개수=%s:%d",
                uuidMatches, uuidMatches.size()).isEmpty();
    }

    @Test
    void opaqueIdentifier_isStableAndResolvesDetailTarget() {
        String token = OpaqueUuidSerializer.encode(JOURNAL_ID);

        assertThat(token).doesNotContain("-");
        assertThat(OpaqueUuidSerializer.encode(JOURNAL_ID)).isEqualTo(token);
        assertThat(OpaqueUuidDeserializer.decode(token)).isEqualTo(JOURNAL_ID);
    }

}
