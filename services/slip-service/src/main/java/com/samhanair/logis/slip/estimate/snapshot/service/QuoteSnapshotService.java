package com.samhanair.logis.slip.estimate.snapshot.service;

import com.samhanair.logis.slip.estimate.snapshot.domain.QuoteSnapshot;
import com.samhanair.logis.slip.estimate.snapshot.repository.QuoteSnapshotRepository;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.QuoteSnapshotResponse;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.SaveQuoteSnapshotRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 종합견적서(웹) 견적 저장/불러오기 서비스 — legacy Code.js saveQuoteSnapshot / getQuoteHistory
 * (노션 견적 DB) 를 우리 DB 로 1:1 대체.
 *
 * <p>저장은 UI 작업상태 base64 blob 을 그대로 보존, 불러오기는 사용자별 저장일시 범위 목록을
 * 최신순으로 반환한다(blob 포함 → 프론트가 그대로 복원).
 */
@Service
@RequiredArgsConstructor
public class QuoteSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(QuoteSnapshotService.class);

    /** 날짜 미지정 시 사용할 경계값 — PostgreSQL 파라미터 타입 추론 실패 회피(NULL 분기 제거). */
    private static final LocalDateTime FLOOR = LocalDateTime.of(1900, 1, 1, 0, 0, 0);
    private static final LocalDateTime CEIL = LocalDateTime.of(9999, 12, 31, 23, 59, 59);

    private final QuoteSnapshotRepository repository;

    /**
     * 견적 스냅샷 저장 — legacy saveQuoteSnapshot(payload).
     *
     * @param request 저장 요청 (userEmail/createdAt/data/summary/image)
     * @return 저장된 스냅샷 메타(id/created/custName)
     */
    @Transactional
    public QuoteSnapshotResponse save(SaveQuoteSnapshotRequest request) {
        LocalDateTime savedAt = parseDateTimeOrNow(request.createdAt());
        QuoteSnapshot snapshot = new QuoteSnapshot(
                request.userEmail().trim(),
                request.custNameOrNull(),
                request.data(),
                request.image(),
                savedAt);
        QuoteSnapshot saved = repository.save(snapshot);
        log.info("[quote-snapshot] saved id={} user={} cust={}",
                saved.getId(), saved.getUserEmail(), saved.getCustName());
        return QuoteSnapshotResponse.meta(saved);
    }

    /**
     * 견적 이력 조회 — legacy getQuoteHistory(startDate, endDate).
     *
     * @param userEmail 저장 담당자 이메일 (필수)
     * @param startDate 조회 시작일 (yyyy-MM-dd 또는 ISO datetime, nullable)
     * @param endDate 조회 종료일 (nullable)
     * @return 저장일시 내림차순 스냅샷 목록 (blob 포함)
     */
    @Transactional(readOnly = true)
    public List<QuoteSnapshotResponse> history(String userEmail, String startDate, String endDate) {
        LocalDateTime from = parseDayStart(startDate);
        LocalDateTime to = parseDayEnd(endDate);
        // 미지정 경계는 FLOOR/CEIL 로 — repository 가 NULL 분기 없이 BETWEEN 비교(PostgreSQL 타입추론 회피)
        return repository.findHistory(userEmail == null ? null : userEmail.trim(),
                        from != null ? from : FLOOR,
                        to != null ? to : CEIL)
                .stream()
                .map(QuoteSnapshotResponse::full)
                .toList();
    }

    /**
     * 거래처명 부분검색 이력 — legacy getQuoteHistoryByCustomer(custName) (#31).
     *
     * <p>legacy 시맨틱: 담당자 eq + 거래처명 contains + 저장일시 desc + 최근 30건.
     *
     * @param userEmail 저장 담당자 이메일 (필수)
     * @param custName 거래처명 키워드 (부분 일치, 필수)
     * @return 저장일시 내림차순 최근 30건 (blob 포함)
     */
    @Transactional(readOnly = true)
    public List<QuoteSnapshotResponse> historyByCustomer(String userEmail, String custName) {
        return repository.findByCustomer(
                        userEmail == null ? null : userEmail.trim(),
                        custName == null ? "" : custName.trim(),
                        org.springframework.data.domain.PageRequest.of(0, 30))
                .stream()
                .map(QuoteSnapshotResponse::full)
                .toList();
    }

    /** ISO-8601(offset 포함 가능) 또는 date 문자열 → LocalDateTime. 실패 시 now. */
    private LocalDateTime parseDateTimeOrNow(String value) {
        if (value == null || value.isBlank()) {
            return LocalDateTime.now();
        }
        String v = value.trim();
        try {
            // 2026-06-09T12:34:56+09:00 같은 offset 포함 ISO 우선
            return OffsetDateTime.parse(v).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // fallthrough
        }
        try {
            return LocalDateTime.parse(v);
        } catch (DateTimeParseException ignored) {
            // fallthrough
        }
        LocalDateTime dayStart = parseDayStart(v);
        return dayStart != null ? dayStart : LocalDateTime.now();
    }

    /** date(yyyy-MM-dd) → 그 날 00:00, ISO datetime → 그대로. null/blank → null(무제한). */
    private LocalDateTime parseDayStart(String value) {
        LocalDateTime dt = parseFlexible(value);
        if (dt != null) {
            return dt;
        }
        LocalDate d = parseDateOnly(value);
        return d == null ? null : d.atStartOfDay();
    }

    /** date(yyyy-MM-dd) → 그 날 23:59:59.999999999, ISO datetime → 그대로. null/blank → null. */
    private LocalDateTime parseDayEnd(String value) {
        LocalDateTime dt = parseFlexible(value);
        if (dt != null) {
            return dt;
        }
        LocalDate d = parseDateOnly(value);
        return d == null ? null : d.atTime(23, 59, 59, 999_999_999);
    }

    private LocalDateTime parseFlexible(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        try {
            return OffsetDateTime.parse(v).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // not offset ISO
        }
        try {
            return LocalDateTime.parse(v);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private LocalDate parseDateOnly(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }
}
