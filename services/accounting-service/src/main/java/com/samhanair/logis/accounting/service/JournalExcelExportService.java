package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.web.dto.JournalResponse;
import com.samhanair.logis.common.excel.ExcelColumn;
import com.samhanair.logis.common.excel.ExcelExportRequest;
import com.samhanair.logis.common.excel.ExcelExporter;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 분개 목록 Excel 다운로드 서비스 — P1-6.
 *
 * <p>기간 + 상태 필터로 조회한 분개 목록을 Apache POI 기반 .xlsx 바이트 배열로 변환.
 * UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — journalNo / journalDate /
 * accountCode 등 비즈니스 식별자만 출력, 내부 UUID 미포함.
 *
 * <p>최대 10,000 행 제한.
 */
@Service
@RequiredArgsConstructor
public class JournalExcelExportService {

    private static final int MAX_ROWS = 10_000;

    private final JournalService journalService;

    /** Excel 컬럼 정의 — 한국어 헤더, UUID 미포함. */
    private static final List<ExcelColumn> COLUMNS = List.of(
            ExcelColumn.text("분개번호",    "journalNo",   5_000),
            ExcelColumn.text("분개일자",    "journalDate", 4_000),
            ExcelColumn.text("적요",        "description", 12_000),
            ExcelColumn.text("출처",        "sourceType",  3_500),
            ExcelColumn.text("상태",        "status",      3_500),
            ExcelColumn.numeric("차변합계", "totalDebit"),
            ExcelColumn.numeric("대변합계", "totalCredit"),
            ExcelColumn.text("게시일시",    "postedAt",    5_500),
            ExcelColumn.text("게시자",      "postedBy",    4_000)
    );

    /**
     * 기간 + 상태 필터로 분개 목록을 조회하여 .xlsx 바이트 배열 반환.
     *
     * @param from   분개일자 시작 (필수)
     * @param to     분개일자 종료 (필수, inclusive)
     * @param status 상태 필터 (null 이면 전체)
     * @return xlsx 바이트 배열
     */
    @Transactional(readOnly = true)
    public byte[] export(LocalDate from, LocalDate to, JournalStatus status) {
        Pageable pageable = PageRequest.of(0, MAX_ROWS, Sort.by(Sort.Direction.DESC, "journalDate"));
        Page<JournalResponse> page = journalService.list(from, to, status, pageable);

        List<Map<String, Object>> rows = page.getContent().stream()
                .map(JournalExcelExportService::toRow)
                .toList();

        ExcelExportRequest req = new ExcelExportRequest("분개목록", COLUMNS, rows);
        return ExcelExporter.export(req);
    }

    /** JournalResponse → row Map 변환. UUID 필드 제외. */
    private static Map<String, Object> toRow(JournalResponse j) {
        Map<String, Object> row = new HashMap<>();
        row.put("journalNo",   j.journalNo());
        row.put("journalDate", j.journalDate());
        row.put("description", nvl(j.description()));
        row.put("sourceType",  j.sourceType() != null ? sourceTypeLabel(j.sourceType()) : "");
        row.put("status",      j.status() != null ? statusLabel(j.status()) : "");
        row.put("totalDebit",  j.totalDebit());
        row.put("totalCredit", j.totalCredit());
        row.put("postedAt",    j.postedAt());
        row.put("postedBy",    nvl(j.postedBy()));
        return row;
    }

    private static String nvl(String val) {
        return val != null ? val : "";
    }

    private static String statusLabel(JournalStatus status) {
        return switch (status) {
            case DRAFT    -> "작성중";
            case POSTED   -> "게시완료";
            case REVERSED -> "역분개완료";
        };
    }

    private static String sourceTypeLabel(
            com.samhanair.logis.accounting.domain.JournalSourceType type) {
        return switch (type) {
            case SLIP    -> "슬립자동";
            case MANUAL  -> "수동입력";
            case CLOSING -> "결산분개";
        };
    }
}
