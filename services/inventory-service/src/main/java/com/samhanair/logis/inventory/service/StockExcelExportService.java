package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.excel.ExcelColumn;
import com.samhanair.logis.common.excel.ExcelExportRequest;
import com.samhanair.logis.common.excel.ExcelExporter;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.web.dto.StockBalanceResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재고 잔량 Excel 다운로드 서비스 — P1-6.
 *
 * <p>창고(warehouseId) 또는 전체 재고 잔량을 Apache POI 기반 .xlsx 바이트 배열로 변환.
 * UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — warehouseCode / warehouseName 등
 * 비즈니스 식별자만 출력, productId / warehouseId 등 UUID 미포함.
 *
 * <p>최대 10,000 행 제한.
 */
@Service
@RequiredArgsConstructor
public class StockExcelExportService {

    private static final int MAX_ROWS = 10_000;

    private final StockBalanceRepository stockBalanceRepository;

    /** Excel 컬럼 정의 — 한국어 헤더, UUID 미포함. */
    private static final List<ExcelColumn> COLUMNS = List.of(
            ExcelColumn.text("창고코드",      "warehouseCode", 4_000),
            ExcelColumn.text("창고명",        "warehouseName", 7_000),
            ExcelColumn.numeric("가용수량",   "availableQty"),
            ExcelColumn.numeric("예약수량",   "reservedQty"),
            ExcelColumn.numeric("총수량",     "totalQty")
    );

    /**
     * 창고 필터(선택)로 재고 잔량을 조회하여 .xlsx 바이트 배열 반환.
     *
     * @param warehouseId 창고 UUID 필터 (null 이면 전체 창고)
     * @return xlsx 바이트 배열
     */
    @Transactional(readOnly = true)
    public byte[] export(UUID warehouseId) {
        Pageable pageable = PageRequest.of(0, MAX_ROWS,
                Sort.by(Sort.Direction.ASC, "warehouse.code"));

        Page<StockBalanceResponse> page;
        if (warehouseId != null) {
            page = stockBalanceRepository
                    .findAllByWarehouse_IdAndIsDeletedFalse(warehouseId, pageable)
                    .map(StockBalanceResponse::from);
        } else {
            page = stockBalanceRepository
                    .findAll(pageable)
                    .map(StockBalanceResponse::from);
        }

        List<Map<String, Object>> rows = page.getContent().stream()
                .map(StockExcelExportService::toRow)
                .toList();

        ExcelExportRequest req = new ExcelExportRequest("재고잔량", COLUMNS, rows);
        return ExcelExporter.export(req);
    }

    /** StockBalanceResponse → row Map 변환. UUID 필드 제외. */
    private static Map<String, Object> toRow(StockBalanceResponse r) {
        Map<String, Object> row = new HashMap<>();
        row.put("warehouseCode", nvl(r.warehouseCode()));
        row.put("warehouseName", nvl(r.warehouseName()));
        row.put("availableQty",  r.availableQty());
        row.put("reservedQty",   r.reservedQty());
        row.put("totalQty",      r.totalQty());
        return row;
    }

    private static String nvl(String val) {
        return val != null ? val : "";
    }
}
