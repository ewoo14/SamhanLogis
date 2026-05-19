package com.samhanair.logis.product.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-2 — 이카운트 품목/관계/계층그룹 CSV → products + product_aliases + lookup map import. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountProductImporter {

    private static final String[] ITEM_HEADERS = {
            "품목코드", "품목명", "출하가", "입고단가", "싱글", "실외기(원형,스탠드)",
            "멀티(50%)", "멀티(48%)", "멀티(45%)", "단품(35%)", "품목구분", "규격명", "사용구분"
    };
    private static final String[] RELATION_HEADERS = {
            "대표품목코드", "대표품목명", "대표품목단위", "연결품목코드", "연결품목명",
            "연결품목단위", "연결품목 환산수량", "대표품목 환산수량", "수량관리기준"
    };
    private static final String[] GROUP_HEADERS = {
            "그룹단계", "[그룹코드]그룹명", "품목코드", "품목명"
    };
    private static final Pattern PLACEHOLDER_CODE =
            Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final int REJECT_SAMPLE_MAX = 20;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public EcountProductImportResult importCsv(InputStream itemCsv, InputStream relationCsv,
                                               InputStream groupCsv, String actorUserId) {
        byte[] itemContent = EcountCsvSupport.readRequired(itemCsv);
        String sourceFileHash = EcountCsvSupport.computeFileHash(itemContent);
        EcountCsvSupport.ParsedCsv itemParsed = EcountCsvSupport.parse(itemContent);
        EcountCsvSupport.validateHeader(itemParsed.header(), ITEM_HEADERS);

        Map<String, String> relationMainByAlias = parseRelations(relationCsv, actorUserId);
        Map<String, String> groupByCode = parseGroups(groupCsv, actorUserId);

        Map<String, ItemRow> itemsByCode = new LinkedHashMap<>();
        Map<String, String> mainCodeByName = new HashMap<>();
        List<ItemRow> itemRows = new ArrayList<>();
        for (int i = 0; i < itemParsed.dataRows().size(); i++) {
            int rowNo = itemParsed.headerIndex() + 2 + i;
            String[] cells = EcountCsvSupport.normalizeRow(itemParsed.dataRows().get(i), ITEM_HEADERS.length);
            ItemRow row = new ItemRow(rowNo, cells);
            itemRows.add(row);
            stagingItemUpsert(sourceFileHash, rowNo, cells, actorUserId);
            if (isNormal(row.code(), row.name())) {
                itemsByCode.putIfAbsent(row.code(), row);
                mainCodeByName.putIfAbsent(row.name(), row.code());
            }
        }

        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        int skippedRelationOrphan = 0;
        int aliasImported = 0;
        List<EcountProductImportResult.RejectedRow> rejectedSample = new ArrayList<>();
        Map<String, UpsertProductResult> productByMainCode = new HashMap<>();
        LinkedHashSet<String> countedMainCodes = new LinkedHashSet<>();

        for (ItemRow row : itemRows) {
            if (row.name().isBlank()) {
                rejectedNullName++;
                updateItemStatus(sourceFileHash, row.rowNo(), "REJECT_NAME_NULL", "품목명 빈값", null, null);
                addRejectSample(rejectedSample, row.rowNo(), "REJECT_NAME_NULL", row.code(), row.name());
                continue;
            }
            if (isPlaceholder(row.code())) {
                skippedPlaceholder++;
                updateItemStatus(sourceFileHash, row.rowNo(), "SKIPPED_PLACEHOLDER",
                        "품목코드 placeholder (" + row.code() + ")", null, null);
                addRejectSample(rejectedSample, row.rowNo(), "SKIPPED_PLACEHOLDER", row.code(), row.name());
                continue;
            }

            String mainCode = relationMainByAlias.getOrDefault(row.code(),
                    mainCodeByName.getOrDefault(row.name(), row.code()));
            ItemRow mainRow = itemsByCode.get(mainCode);
            if (mainRow == null) {
                skippedRelationOrphan++;
                updateItemStatus(sourceFileHash, row.rowNo(), "SKIPPED_RELATION_ORPHAN",
                        "대표품목코드 raw 미존재 (" + mainCode + ")", null, null);
                addRejectSample(rejectedSample, row.rowNo(), "SKIPPED_RELATION_ORPHAN", row.code(), row.name());
                continue;
            }

            UpsertProductResult upsert = productByMainCode.computeIfAbsent(mainCode,
                    code -> upsertProduct(mainRow, groupByCode.get(mainCode), actorUserId));
            if (countedMainCodes.add(mainCode)) {
                if (upsert.isNew()) {
                    imported++;
                } else {
                    updated++;
                }
            }
            upsertAlias(row.code(), mainCode, upsert.productId(), sourceFileHash, row.rowNo());
            aliasImported++;
            updateItemStatus(sourceFileHash, row.rowNo(), upsert.isNew() ? "IMPORTED" : "UPDATED",
                    null, row.code().equals(mainCode) ? upsert.productId() : null, upsert.productId());
        }

        log.info("MIG-2 product import 완료 total={} imported={} updated={} alias={} rejected={} placeholder={} orphan={} hash={}",
                itemRows.size(), imported, updated, aliasImported, rejectedNullName,
                skippedPlaceholder, skippedRelationOrphan, sourceFileHash);

        return new EcountProductImportResult(itemRows.size(), imported, updated, rejectedNullName,
                skippedPlaceholder, skippedRelationOrphan, aliasImported, sourceFileHash, rejectedSample);
    }

    private Map<String, String> parseRelations(InputStream relationCsv, String actorUserId) {
        if (relationCsv == null) {
            return Map.of();
        }
        byte[] content = EcountCsvSupport.readRequired(relationCsv);
        String hash = EcountCsvSupport.computeFileHash(content);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), RELATION_HEADERS);
        Map<String, String> relation = new HashMap<>();
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = parsed.headerIndex() + 2 + i;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), RELATION_HEADERS.length);
            stagingRelationUpsert(hash, rowNo, c, actorUserId);
            String mainCode = c[0];
            String aliasCode = c[3];
            if (!mainCode.isBlank() && !aliasCode.isBlank()) {
                relation.put(aliasCode, mainCode);
            }
        }
        return relation;
    }

    private Map<String, String> parseGroups(InputStream groupCsv, String actorUserId) {
        if (groupCsv == null) {
            return Map.of();
        }
        byte[] content = EcountCsvSupport.readRequired(groupCsv);
        String hash = EcountCsvSupport.computeFileHash(content);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), GROUP_HEADERS);
        Map<String, String> groups = new HashMap<>();
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = parsed.headerIndex() + 2 + i;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), GROUP_HEADERS.length);
            stagingGroupUpsert(hash, rowNo, c, actorUserId);
            if (!c[2].isBlank() && !c[1].isBlank()) {
                groups.putIfAbsent(c[2], c[1]);
            }
        }
        return groups;
    }

    private boolean isNormal(String code, String name) {
        return !name.isBlank() && !isPlaceholder(code);
    }

    private boolean isPlaceholder(String code) {
        return code == null || code.isBlank() || PLACEHOLDER_CODE.matcher(code).matches();
    }

    private UpsertProductResult upsertProduct(ItemRow row, String categoryGroup, String actor) {
        boolean exists = exists("""
                SELECT COUNT(1) FROM products
                 WHERE product_code = :code AND is_deleted = FALSE
                """, new MapSqlParameterSource("code", row.code()));
        UUID productId = jdbcTemplate.queryForObject(UPSERT_PRODUCT_SQL, productParams(row, categoryGroup, actor), UUID.class);
        return new UpsertProductResult(productId, !exists);
    }

    private MapSqlParameterSource productParams(ItemRow row, String categoryGroup, String actor) {
        BigDecimal outbound = parseMoney(row.cells()[2]);
        BigDecimal inbound = parseMoney(row.cells()[3]);
        return new MapSqlParameterSource()
                .addValue("code", truncate(row.code(), 100))
                .addValue("name", truncate(row.name(), 150))
                .addValue("spec", truncate(row.cells()[11], 255))
                .addValue("businessType", normalizeItemType(row.cells()[10]))
                .addValue("categoryGroup", truncate(categoryGroup, 100))
                .addValue("sellingPrice", outbound)
                .addValue("purchasePrice", inbound)
                .addValue("outboundPrice", outbound)
                .addValue("inboundPrice", inbound)
                .addValue("singlePrice", parseMoney(row.cells()[4]))
                .addValue("outdoorPrice", parseMoney(row.cells()[5]))
                .addValue("multi50Price", parseMoney(row.cells()[6]))
                .addValue("multi48Price", parseMoney(row.cells()[7]))
                .addValue("multi45Price", parseMoney(row.cells()[8]))
                .addValue("item35Price", parseMoney(row.cells()[9]))
                .addValue("actor", actor == null || actor.isBlank() ? "system" : actor);
    }

    private static final String UPSERT_PRODUCT_SQL = """
            INSERT INTO products (
              id, name, model_name, model_code, category_id, selling_price, purchase_price, currency, status,
              tags, description, product_code, specification, unit, product_business_type, inventory_qty_mgmt,
              price_includes_vat, product_group1, inbound_price, outbound_price, single_price, outdoor_price,
              multi_50_price, multi_48_price, multi_45_price, item_35_price, category_group, tax_type,
              unit_price_with_vat, created_at, created_by, is_deleted
            ) VALUES (
              gen_random_uuid(), :name, :code, :code,
              (SELECT id FROM categories WHERE code = 'ECOUNT_MIG2' AND is_deleted = FALSE LIMIT 1),
              :sellingPrice, :purchasePrice, 'KRW', 'ACTIVE',
              NULL, NULL, :code, :spec, 'EA', :businessType, TRUE,
              TRUE, :categoryGroup, :inboundPrice, :outboundPrice, :singlePrice, :outdoorPrice,
              :multi50Price, :multi48Price, :multi45Price, :item35Price, :categoryGroup, 'TAXABLE',
              :outboundPrice, NOW(), :actor, FALSE
            )
            ON CONFLICT (product_code) WHERE is_deleted = FALSE DO UPDATE SET
              name = EXCLUDED.name,
              model_name = EXCLUDED.model_name,
              model_code = EXCLUDED.model_code,
              specification = EXCLUDED.specification,
              selling_price = EXCLUDED.selling_price,
              purchase_price = EXCLUDED.purchase_price,
              product_business_type = EXCLUDED.product_business_type,
              product_group1 = EXCLUDED.product_group1,
              inbound_price = EXCLUDED.inbound_price,
              outbound_price = EXCLUDED.outbound_price,
              single_price = EXCLUDED.single_price,
              outdoor_price = EXCLUDED.outdoor_price,
              multi_50_price = EXCLUDED.multi_50_price,
              multi_48_price = EXCLUDED.multi_48_price,
              multi_45_price = EXCLUDED.multi_45_price,
              item_35_price = EXCLUDED.item_35_price,
              category_group = EXCLUDED.category_group,
              tax_type = EXCLUDED.tax_type,
              unit_price_with_vat = EXCLUDED.unit_price_with_vat,
              modified_at = NOW(),
              modified_by = EXCLUDED.created_by
            RETURNING id
            """;

    private void upsertAlias(String aliasCode, String mainCode, UUID mainProductId,
                             String hash, int rowNo) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("alias", aliasCode)
                .addValue("mainCode", mainCode)
                .addValue("mainId", mainProductId)
                .addValue("hash", hash)
                .addValue("rowNo", rowNo);
        if (exists("""
                SELECT COUNT(1) FROM product_aliases
                 WHERE alias_code = :alias AND main_product_id <> :mainId AND is_deleted = FALSE
                """, p)) {
            throw new BusinessException(ErrorCode.MIG2_ALIAS_DUPLICATE,
                    "동일 alias_code 가 다른 main 에 매핑됩니다: " + aliasCode);
        }
        jdbcTemplate.update("""
                INSERT INTO product_aliases (alias_code, main_product_id, source, created_at, created_by, is_deleted)
                VALUES (:alias, :mainId, 'ECOUNT_IMPORT', NOW(), 'system', FALSE)
                ON CONFLICT (alias_code) WHERE is_deleted = FALSE DO UPDATE SET
                  main_product_id = EXCLUDED.main_product_id,
                  source = EXCLUDED.source,
                  modified_at = NOW(),
                  modified_by = 'system'
                """, p);
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_alias
                    (alias_code, main_item_code, main_product_uuid, source_file_hash, source_row_no, updated_at)
                VALUES (:alias, :mainCode, :mainId, :hash, :rowNo, NOW())
                ON CONFLICT (alias_code) DO UPDATE SET
                  main_item_code = EXCLUDED.main_item_code,
                  main_product_uuid = EXCLUDED.main_product_uuid,
                  source_file_hash = EXCLUDED.source_file_hash,
                  source_row_no = EXCLUDED.source_row_no,
                  updated_at = NOW()
                """, p);
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private void stagingItemUpsert(String hash, int rowNo, String[] c, String actor) {
        MapSqlParameterSource p = baseParams(hash, rowNo, actor);
        for (int i = 0; i < ITEM_HEADERS.length; i++) {
            p.addValue("c" + i, EcountCsvSupport.nullIfBlank(c[i]));
        }
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_raw (
                  source_file_hash, source_row_no, raw_item_code, raw_item_name, raw_outbound_price,
                  raw_inbound_price, raw_single_price, raw_outdoor_price, raw_multi_50_price,
                  raw_multi_48_price, raw_multi_45_price, raw_item_35_price, raw_item_type,
                  raw_specification, raw_usage_flag, transform_status, imported_by
                ) VALUES (
                  :hash, :row, :c0, :c1, :c2, :c3, :c4, :c5, :c6, :c7, :c8, :c9, :c10, :c11, :c12,
                  'PENDING', :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_item_code = EXCLUDED.raw_item_code,
                  raw_item_name = EXCLUDED.raw_item_name,
                  raw_outbound_price = EXCLUDED.raw_outbound_price,
                  raw_inbound_price = EXCLUDED.raw_inbound_price,
                  raw_single_price = EXCLUDED.raw_single_price,
                  raw_outdoor_price = EXCLUDED.raw_outdoor_price,
                  raw_multi_50_price = EXCLUDED.raw_multi_50_price,
                  raw_multi_48_price = EXCLUDED.raw_multi_48_price,
                  raw_multi_45_price = EXCLUDED.raw_multi_45_price,
                  raw_item_35_price = EXCLUDED.raw_item_35_price,
                  raw_item_type = EXCLUDED.raw_item_type,
                  raw_specification = EXCLUDED.raw_specification,
                  raw_usage_flag = EXCLUDED.raw_usage_flag,
                  transform_status = 'PENDING',
                  target_product_id = NULL,
                  target_main_product_id = NULL,
                  reject_reason = NULL,
                  imported_at = NOW(),
                  imported_by = EXCLUDED.imported_by
                """, p);
    }

    private void stagingRelationUpsert(String hash, int rowNo, String[] c, String actor) {
        MapSqlParameterSource p = baseParams(hash, rowNo, actor);
        for (int i = 0; i < RELATION_HEADERS.length; i++) {
            p.addValue("c" + i, EcountCsvSupport.nullIfBlank(c[i]));
        }
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_relation_raw (
                  source_file_hash, source_row_no, raw_main_item_code, raw_main_item_name,
                  raw_main_item_unit, raw_linked_item_code, raw_linked_item_name,
                  raw_linked_item_unit, raw_linked_conversion_qty, raw_main_conversion_qty,
                  raw_quantity_basis, imported_by
                ) VALUES (:hash, :row, :c0, :c1, :c2, :c3, :c4, :c5, :c6, :c7, :c8, :actor)
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_main_item_code = EXCLUDED.raw_main_item_code,
                  raw_main_item_name = EXCLUDED.raw_main_item_name,
                  raw_main_item_unit = EXCLUDED.raw_main_item_unit,
                  raw_linked_item_code = EXCLUDED.raw_linked_item_code,
                  raw_linked_item_name = EXCLUDED.raw_linked_item_name,
                  raw_linked_item_unit = EXCLUDED.raw_linked_item_unit,
                  raw_linked_conversion_qty = EXCLUDED.raw_linked_conversion_qty,
                  raw_main_conversion_qty = EXCLUDED.raw_main_conversion_qty,
                  raw_quantity_basis = EXCLUDED.raw_quantity_basis,
                  imported_at = NOW(),
                  imported_by = EXCLUDED.imported_by
                """, p);
    }

    private void stagingGroupUpsert(String hash, int rowNo, String[] c, String actor) {
        MapSqlParameterSource p = baseParams(hash, rowNo, actor);
        for (int i = 0; i < GROUP_HEADERS.length; i++) {
            p.addValue("c" + i, EcountCsvSupport.nullIfBlank(c[i]));
        }
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_group_raw (
                  source_file_hash, source_row_no, raw_group_level, raw_group_name,
                  raw_item_code, raw_item_name, imported_by
                ) VALUES (:hash, :row, :c0, :c1, :c2, :c3, :actor)
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_group_level = EXCLUDED.raw_group_level,
                  raw_group_name = EXCLUDED.raw_group_name,
                  raw_item_code = EXCLUDED.raw_item_code,
                  raw_item_name = EXCLUDED.raw_item_name,
                  imported_at = NOW(),
                  imported_by = EXCLUDED.imported_by
                """, p);
    }

    private void updateItemStatus(String hash, int rowNo, String status, String reason,
                                  UUID targetProductId, UUID targetMainProductId) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_item_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_product_id = :targetProductId,
                       target_main_product_id = :targetMainProductId
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("targetProductId", targetProductId)
                        .addValue("targetMainProductId", targetMainProductId)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    private MapSqlParameterSource baseParams(String hash, int rowNo, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("actor", actor == null || actor.isBlank() ? "system" : actor);
    }

    private static BigDecimal parseMoney(String raw) {
        if (raw == null || raw.isBlank() || "-".equals(raw)) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(raw.replace(",", "").replace(" ", ""));
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }

    private static String normalizeItemType(String raw) {
        if (raw == null || raw.isBlank()) {
            return "상품";
        }
        return truncate(raw.replace("[", "").replace("]", ""), 20);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static void addRejectSample(List<EcountProductImportResult.RejectedRow> sample,
                                        int rowNo, String reason, String code, String name) {
        if (sample.size() < REJECT_SAMPLE_MAX) {
            sample.add(new EcountProductImportResult.RejectedRow(rowNo, reason, code, name));
        }
    }

    private record ItemRow(int rowNo, String[] cells) {
        String code() {
            return cells[0];
        }

        String name() {
            return cells[1];
        }
    }

    private record UpsertProductResult(UUID productId, boolean isNew) {
    }
}
