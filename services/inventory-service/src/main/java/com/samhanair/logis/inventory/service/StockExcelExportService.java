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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * product-service 조회가 실패(예: 품목 삭제로 일부 lookup 누락)해도 export 자체는 실패하지
 * 않고 해당 행만 "—" 로 남는다(가용성 우선 — export 는 F-1 회귀 울타리 대상).
 *
 * <p>최대 10,000 행 제한.
 */
@Service
@RequiredArgsConstructor
public class StockExcelExportService {

    private static final Logger log = LoggerFactory.getLogger(StockExcelExportService.class);

    private static final int MAX_ROWS = 10_000;

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
     * product-service 에 일괄 조회한다. 한 청크라도 실패(예: 삭제된 품목이 섞여 NOT_FOUND)하면
     * export 를 중단시키지 않고 해당 청크만 빈 결과로 남긴다 — 화면 다운로드는 항상 200 이어야
     * 한다(F-1 회귀 울타리).
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
        try {
            for (ProductSummary summary : productClient.lookup(chunk)) {
                resultSink.put(summary.id(), summary);
            }
        } catch (RuntimeException ex) {
            log.warn("[StockExcelExportService] product-service 품목 조회 실패 — {}건 미해석, "
                    + "해당 행은 품목코드/명 공란으로 출력. msg={}", chunk.size(), ex.getMessage());
        }
    }

    /** StockBalance + product(nullable) → row Map 변환. UUID 필드 제외. */
    private static Map<String, Object> toRow(StockBalance r, ProductSummary product) {
        Map<String, Object> row = new HashMap<>();
        row.put("productCode",   product != null ? nvl(product.productCode()) : "");
        row.put("productName",   product != null ? nvl(product.name()) : "");
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
