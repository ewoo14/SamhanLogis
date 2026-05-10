package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.excel.ExcelColumn;
import com.samhanair.logis.common.excel.ExcelExportRequest;
import com.samhanair.logis.common.excel.ExcelExporter;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.web.dto.SlipResponse;
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
 * 전표 목록 Excel 다운로드 서비스 — P1-6.
 *
 * <p>복합 필터 (slipType / status / from / to / partnerCode) 로 조회한 전표 목록을
 * Apache POI 기반 .xlsx 바이트 배열로 변환.
 * UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — slipNo / partnerName 등
 * 비즈니스 식별자만 출력, partnerId / sourceWarehouseId 등 UUID 미포함.
 *
 * <p>최대 10,000 행 제한.
 */
@Service
@RequiredArgsConstructor
public class SlipExcelExportService {

    private static final int MAX_ROWS = 10_000;

    private final SlipService slipService;

    /** Excel 컬럼 정의 — 한국어 헤더, UUID 미포함. */
    private static final List<ExcelColumn> COLUMNS = List.of(
            ExcelColumn.text("전표번호",   "slipNo",      5_000),
            ExcelColumn.text("전표일자",   "slipDate",    4_000),
            ExcelColumn.text("전표유형",   "slipType",    3_500),
            ExcelColumn.text("상태",       "status",      3_500),
            ExcelColumn.text("거래처명",   "partnerName", 8_000),
            ExcelColumn.text("배송태그",   "deliveryTag", 3_500),
            ExcelColumn.text("요청자",     "requesterId", 4_000),
            ExcelColumn.text("수락자",     "acceptedBy",  4_000),
            ExcelColumn.text("수락일시",   "acceptedAt",  5_000),
            ExcelColumn.text("완료일시",   "completedAt", 5_000),
            ExcelColumn.text("확정일시",   "confirmedAt", 5_000)
    );

    /**
     * 복합 필터로 전표 목록을 조회하여 .xlsx 바이트 배열 반환.
     *
     * @param slipType    전표 유형 필터 (null 이면 전체)
     * @param status      상태 필터 (null 이면 전체)
     * @param from        전표일자 시작 (null 이면 하한 없음)
     * @param to          전표일자 종료 (null 이면 상한 없음)
     * @param partnerCode 거래처코드 필터 (null 이면 전체)
     * @return xlsx 바이트 배열
     */
    @Transactional(readOnly = true)
    public byte[] export(SlipType slipType, SlipStatus status,
                         LocalDate from, LocalDate to, String partnerCode) {
        Pageable pageable = PageRequest.of(0, MAX_ROWS, Sort.by(Sort.Direction.DESC, "slipDate"));
        Page<SlipResponse> page = slipService.list(
                slipType, status, from, to, partnerCode, null, null, pageable);

        List<Map<String, Object>> rows = page.getContent().stream()
                .map(SlipExcelExportService::toRow)
                .toList();

        ExcelExportRequest req = new ExcelExportRequest("전표목록", COLUMNS, rows);
        return ExcelExporter.export(req);
    }

    /** SlipResponse → row Map 변환. UUID 필드 제외, 비즈니스 식별자만 포함. */
    private static Map<String, Object> toRow(SlipResponse s) {
        Map<String, Object> row = new HashMap<>();
        row.put("slipNo",      s.slipNo());
        row.put("slipDate",    s.slipDate());
        row.put("slipType",    s.slipType() != null ? slipTypeLabel(s.slipType()) : "");
        row.put("status",      s.status() != null ? statusLabel(s.status()) : "");
        row.put("partnerName", nvl(s.partnerName()));
        row.put("deliveryTag", s.deliveryTag() != null ? s.deliveryTag().name() : "");
        row.put("requesterId", nvl(s.requesterId()));
        row.put("acceptedBy",  nvl(s.acceptedBy()));
        row.put("acceptedAt",  s.acceptedAt());
        row.put("completedAt", s.completedAt());
        row.put("confirmedAt", s.confirmedAt());
        return row;
    }

    private static String nvl(String val) {
        return val != null ? val : "";
    }

    private static String slipTypeLabel(SlipType type) {
        return switch (type) {
            case OUTBOUND -> "출고";
            case INBOUND  -> "입고";
        };
    }

    private static String statusLabel(SlipStatus status) {
        return switch (status) {
            case DRAFT      -> "작성중";
            case SAVED      -> "저장완료";
            case SENT       -> "전송완료";
            case ACCEPTED   -> "수락";
            case PROCESSING -> "처리중";
            case INSPECTING -> "검수중";
            case COMPLETED  -> "처리완료";
            case SHIPPING   -> "배송중";
            case DELIVERED  -> "배송완료";
            case CONFIRMED  -> "확정";
            case REJECTED   -> "반려";
            case CANCELED   -> "취소";
        };
    }
}
