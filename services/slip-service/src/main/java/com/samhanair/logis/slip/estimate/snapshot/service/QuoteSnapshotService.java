package com.samhanair.logis.slip.estimate.snapshot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.snapshot.domain.QuoteSnapshot;
import com.samhanair.logis.slip.estimate.snapshot.repository.QuoteSnapshotRepository;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.QuoteSnapshotResponse;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.SaveQuoteSnapshotRequest;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 종합견적서 JSON 상태 저장·목록·작성자 소유권 수정 서비스. */
@Service
@RequiredArgsConstructor
public class QuoteSnapshotService {

    private static final LocalDateTime FLOOR = LocalDateTime.of(1900, 1, 1, 0, 0);
    private static final LocalDateTime CEIL = LocalDateTime.of(9999, 12, 31, 23, 59, 59);

    private final QuoteSnapshotRepository repository;
    private final ObjectMapper objectMapper;

    /** JSON 상태와 저장 당시 계산 합계를 DB에 저장한다. */
    @Transactional
    public QuoteSnapshotResponse save(SaveQuoteSnapshotRequest request) {
        QuoteSnapshot snapshot = new QuoteSnapshot(request.userEmail().trim(),
                request.custNameOrNull(), normalizeState(request.data()), request.supplyAmount(),
                request.vatAmount(), request.totalAmount(), parseDateTimeOrNow(request.createdAt()));
        return QuoteSnapshotResponse.meta(repository.save(snapshot));
    }

    /** 작성자 본인만 기존 견적을 수정한다. */
    @Transactional
    public QuoteSnapshotResponse update(UUID id, SaveQuoteSnapshotRequest request) {
        QuoteSnapshot snapshot = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "견적을 찾을 수 없습니다"));
        if (!snapshot.getAuthorEmail().equals(request.userEmail().trim())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "작성자 본인만 견적을 수정할 수 있습니다");
        }
        snapshot.update(request.custNameOrNull(), normalizeState(request.data()),
                request.supplyAmount(), request.vatAmount(), request.totalAmount());
        return QuoteSnapshotResponse.meta(snapshot);
    }

    /** userEmail이 없으면 전체 활성 목록, 있으면 해당 작성자 목록을 반환한다. */
    @Transactional(readOnly = true)
    public List<QuoteSnapshotResponse> history(String userEmail, String startDate, String endDate) {
        LocalDateTime from = parseDayStart(startDate) == null ? FLOOR : parseDayStart(startDate);
        LocalDateTime to = parseDayEnd(endDate) == null ? CEIL : parseDayEnd(endDate);
        return repository.findHistory(userEmail == null || userEmail.isBlank() ? null : userEmail.trim(), from, to)
                .stream().map(QuoteSnapshotResponse::full).toList();
    }

    /** 거래처명으로 전체 작성자의 견적을 조회한다. */
    @Transactional(readOnly = true)
    public List<QuoteSnapshotResponse> historyByCustomer(String userEmail, String custName) {
        return repository.findByCustomer(userEmail == null || userEmail.isBlank() ? null : userEmail.trim(),
                        custName == null ? "" : custName.trim(), org.springframework.data.domain.PageRequest.of(0, 30))
                .stream().map(QuoteSnapshotResponse::full).toList();
    }

    /** 신규 JSON 계약을 적용하고, 기존 클라이언트의 base64 입력은 DB 저장 전에 JSON으로 변환한다. */
    private JsonNode normalizeState(JsonNode data) {
        if (data == null || data.isNull()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "data(JSON 상태)는 필수입니다");
        }
        if (!data.isTextual()) {
            return data;
        }
        String value = data.asText().trim();
        try {
            return objectMapper.readTree(value);
        } catch (Exception ignored) {
            try {
                byte[] decoded = Base64.getDecoder().decode(value);
                String legacyJson = new String(decoded, StandardCharsets.UTF_8);
                JsonNode parsed = objectMapper.readTree(legacyJson);
                return parsed == null ? objectMapper.getNodeFactory().textNode(legacyJson) : parsed;
            } catch (Exception ex) {
                try {
                    byte[] decoded = Base64.getDecoder().decode(value);
                    return objectMapper.getNodeFactory().textNode(new String(decoded, StandardCharsets.UTF_8));
                } catch (IllegalArgumentException invalidBase64) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT, "data는 JSON 객체여야 합니다");
                }
            }
        }
    }

    private LocalDateTime parseDateTimeOrNow(String value) {
        if (value == null || value.isBlank()) return LocalDateTime.now();
        try { return OffsetDateTime.parse(value.trim()).toLocalDateTime(); } catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(value.trim()); } catch (DateTimeParseException ignored) { }
        LocalDate date = parseDateOnly(value);
        return date == null ? LocalDateTime.now() : date.atStartOfDay();
    }

    private LocalDateTime parseDayStart(String value) {
        if (value == null || value.isBlank()) return null;
        try { return OffsetDateTime.parse(value.trim()).toLocalDateTime(); } catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(value.trim()); } catch (DateTimeParseException ignored) { }
        LocalDate date = parseDateOnly(value);
        return date == null ? null : date.atStartOfDay();
    }

    private LocalDateTime parseDayEnd(String value) {
        if (value == null || value.isBlank()) return null;
        try { return OffsetDateTime.parse(value.trim()).toLocalDateTime(); } catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(value.trim()); } catch (DateTimeParseException ignored) { }
        LocalDate date = parseDateOnly(value);
        return date == null ? null : date.atTime(23, 59, 59, 999_999_999);
    }

    private LocalDate parseDateOnly(String value) {
        try { return LocalDate.parse(value.trim()); } catch (DateTimeParseException ignored) { return null; }
    }
}
