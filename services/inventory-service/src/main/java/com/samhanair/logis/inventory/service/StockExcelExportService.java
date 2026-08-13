package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.excel.ExcelColumn;
import com.samhanair.logis.common.excel.ExcelExportRequest;
import com.samhanair.logis.common.excel.ExcelExporter;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — warehouseCode / warehouseName /
 * productCode / productName 등 비즈니스 식별자만 출력, productId / warehouseId 등 UUID 미포함.
 *
 * <h2>#907 재수렴 R — 품목 식별자 추가</h2>
 * <p>기존 컬럼(창고코드/창고명/가용/예약/총수량)만으로는 200행이 어느 품목의 재고인지
 * 구분할 수 없었다. {@link ProductClient}(product-service internal
 * batch lookup, 안전재고 알림 화면 등에서 기존 사용 중인 client)로 productId → productCode/명을
 * 해석한다. 응답 DTO에는 UUID를 넣지 않고, export 내부에서만 원천 엔티티의 UUID를 사용한다.
 * 삭제 등으로 product-service 응답에서 빠진 품목은 행과 실제 수량을 보존한 채
 * "참조 끊김" / "제품 마스터 없음"으로 표시한다. product-service 4xx/5xx/연결 실패는
 * 데이터 누락으로 오인하지 않도록 {@link ProductClient}의 업무 예외를 그대로 전파한다.
 *
 * <p>최대 10,000 행 제한.
 */
@Service
@RequiredArgsConstructor
public class StockExcelExportService {

    private static final int MAX_ROWS = 10_000;

    private static final String MISSING_PRODUCT_CODE = "참조 끊김";
    private static final String MISSING_PRODUCT_NAME = "제품 마스터 없음";

    /** ProductClient.lookup() 1회 호출당 최대 productId 개수(product-service internal 계약). */
    private static final int PRODUCT_LOOKUP_BATCH_SIZE = 100;

    private final StockBalanceRepository stockBalanceRepository;
    private final ProductClient productClient;

    /** Excel 컬럼 정의 — 한국어 헤더, UUID 미포함. 품목코드/품목명을 창고 앞에 배치(행의 1차 식별자). */
    private static final List<ExcelColumn> COLUMNS = List.of(
            ExcelColumn.text("품목코드",      "productCode",   4_500),
            ExcelColumn.text("품목명",        "productName",   8_000),
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

        Page<StockBalance> page;
        if (warehouseId != null) {
            page = stockBalanceRepository
                    .findAllByWarehouse_IdAndIsDeletedFalse(warehouseId, pageable);
        } else {
            page = stockBalanceRepository
                    .findAll(pageable);
        }

        List<StockBalance> content = page.getContent();
        Map<UUID, ProductSummary> productsById = resolveProducts(content);

        List<Map<String, Object>> rows = content.stream()
                .map(r -> toRow(r, productsById.get(r.getProductId())))
                .toList();

        ExcelExportRequest req = new ExcelExportRequest("재고잔량", COLUMNS, rows);
        return ExcelExporter.export(req);
    }

    /**
     * 잔량 행에 등장하는 distinct productId 를 {@value #PRODUCT_LOOKUP_BATCH_SIZE}건씩 청크로
     * product-service 에 관용 조회한다. 응답에서 빠진 ID만 누락 표시 대상으로 남기고,
     * 4xx/5xx/연결 실패는 {@link ProductClient}가 구분한 예외를 그대로 전파한다.
     */
    private Map<UUID, ProductSummary> resolveProducts(List<StockBalance> balances) {
        Set<UUID> distinctIds = new LinkedHashSet<>();
        for (StockBalance r : balances) {
            if (r.getProductId() != null) {
                distinctIds.add(r.getProductId());
            }
        }
        Map<UUID, ProductSummary> result = new HashMap<>();
        List<UUID> chunk = new ArrayList<>(PRODUCT_LOOKUP_BATCH_SIZE);
        for (UUID id : distinctIds) {
            chunk.add(id);
            if (chunk.size() == PRODUCT_LOOKUP_BATCH_SIZE) {
                lookupChunk(chunk, result);
                chunk.clear();
            }
        }
        if (!chunk.isEmpty()) {
            lookupChunk(chunk, result);
        }
        return result;
    }

    private void lookupChunk(List<UUID> chunk, Map<UUID, ProductSummary> resultSink) {
        for (ProductSummary summary : productClient.lookupAllowMissing(chunk)) {
            resultSink.put(summary.id(), summary);
        }
    }

    /** StockBalance + product(nullable) → row Map 변환. UUID 필드 제외. */
    private static Map<String, Object> toRow(StockBalance r, ProductSummary product) {
        Map<String, Object> row = new HashMap<>();
        row.put("productCode",   product != null ? nvl(product.productCode()) : MISSING_PRODUCT_CODE);
        row.put("productName",   product != null ? nvl(product.name()) : MISSING_PRODUCT_NAME);
        row.put("warehouseCode", nvl(r.getWarehouse().getCode()));
        row.put("warehouseName", nvl(r.getWarehouse().getName()));
        row.put("availableQty",  r.getAvailableQty());
        row.put("reservedQty",   r.getReservedQty());
        row.put("totalQty",      r.getTotalQty());
        return row;
    }

    private static String nvl(String val) {
        return val != null ? val : "";
    }
}
