package com.samhanair.logis.product.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.io.EcountXlsxSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-2 — 이카운트 품목/관계/계층그룹 CSV → products + product_aliases + lookup map import. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountProductImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE = UUID.fromString("4a735f0f-4448-4b63-bdd0-92f45c3a8b8b");
    // raw: docs/migration/ecount-data/raw/품목-Excel다운로드.csv
    static final String[] ITEM_HEADERS = {
            "품목코드", "품목명", "출하가", "입고단가", "싱글", "실외기(원형,스탠드)",
            "멀티(50%)", "멀티(48%)", "멀티(45%)", "단품(35%)", "품목구분", "규격명", "사용구분"
    };
    // raw: docs/migration/ecount-data/raw/품목관계-Excel다운로드.csv
    static final String[] RELATION_HEADERS = {
            "대표품목코드", "대표품목명", "대표품목단위", "연결품목코드", "연결품목명",
            "연결품목단위", "연결품목 환산수량", "대표품목 환산수량", "수량관리기준"
    };
    // raw: docs/migration/ecount-data/raw/품목계층그룹-Excel다운로드.csv
    static final String[] GROUP_HEADERS = {
            "그룹단계", "[그룹코드]그룹명", "품목코드", "품목명"
    };
    private static final Pattern PLACEHOLDER_CODE =
            Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final int REJECT_SAMPLE_MAX = 20;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountProductImportResult importCsv(InputStream itemCsv, InputStream relationCsv,
                                               InputStream groupCsv, String actorUserId) {
        byte[] itemContent = EcountCsvSupport.readRequired(itemCsv);
        String sourceFileHash = EcountCsvSupport.computeFileHash(itemContent);
        acquireImportLock(sourceFileHash);
        EcountCsvSupport.ParsedCsv itemParsed = EcountCsvSupport.parse(itemContent);
        EcountCsvSupport.validateHeader(itemParsed.header(), ITEM_HEADERS);

        RelationParseResult relationParse = parseRelations(relationCsv, actorUserId);
        Map<String, String> relationMainByAlias = relationParse.mainCodeByAlias();
        Map<String, String> groupByCode = parseGroups(groupCsv, actorUserId);

        Map<String, ItemRow> itemsByCode = new LinkedHashMap<>();
        List<ItemRow> itemRows = new ArrayList<>();
        for (int i = 0; i < itemParsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] cells = EcountCsvSupport.normalizeRow(itemParsed.dataRows().get(i), ITEM_HEADERS.length);
            ItemRow row = new ItemRow(rowNo, cells);
            itemRows.add(row);
            stagingItemUpsert(sourceFileHash, rowNo, cells, actorUserId);
            if (isNormal(row.code(), row.name())) {
                itemsByCode.putIfAbsent(row.code(), row);
            }
        }
        Map<String, List<ItemRow>> explicitMergeRowsByMainCode = buildExplicitMergeRowsByMainCode(
                itemRows, relationParse, relationMainByAlias, itemsByCode);

        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        int skippedRelationOrphan = 0;
        int aliasImported = 0;
        List<EcountProductImportResult.RejectedRow> rejectedSample = new ArrayList<>();
        Map<String, UpsertProductResult> productByMainCode = new HashMap<>();
        LinkedHashSet<String> countedMainCodes = new LinkedHashSet<>();
        Map<Integer, ProductMainCandidate> resolvedCandidates = new HashMap<>();
        for (ItemRow row : itemRows) {
            if (row.name().isBlank() || isPlaceholder(row.code())) {
                continue;
            }
            EcountCsvSupport.requireMaxLength(row.code(), 100, "product_code", row.rowNo());
            ProductMainCandidate mainCandidate = resolveMainCandidate(
                    row, relationMainByAlias.get(row.code()), relationParse.mainCodes(),
                    itemsByCode);
            if (mainCandidate != null) {
                resolvedCandidates.put(row.rowNo(), mainCandidate);
            }
        }

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
            EcountCsvSupport.requireMaxLength(row.code(), 100, "product_code", row.rowNo());

            String explicitMainCode = relationMainByAlias.get(row.code());
            ProductMainCandidate mainCandidate = resolvedCandidates.get(row.rowNo());
            if (mainCandidate == null) {
                skippedRelationOrphan++;
                updateItemStatus(sourceFileHash, row.rowNo(), "SKIPPED_RELATION_ORPHAN",
                        "대표품목코드 CSV/DB 미존재 (" + explicitMainCode + ")", null, null);
                addRejectSample(rejectedSample, row.rowNo(), "SKIPPED_RELATION_ORPHAN", row.code(), row.name());
                continue;
            }
            String mainCode = mainCandidate.mainCode();
            ItemRow mainRow = mainCandidate.rawRow();

            UpsertProductResult upsert = productByMainCode.get(mainCode);
            if (upsert == null) {
                ItemRow mergedMainRow = mainRow == null
                        ? null
                        : mergeExplicitRows(mainRow, explicitMergeRowsByMainCode.get(mainCode));
                upsert = mainRow == null
                        ? new UpsertProductResult(mainCandidate.existingProductId(), false)
                        : upsertProduct(mergedMainRow, groupByCode.get(mainCode), actorUserId);
                productByMainCode.put(mainCode, upsert);
            }
            if (mainRow != null && countedMainCodes.add(mainCode)) {
                if (upsert.isNew()) {
                    imported++;
                } else {
                    updated++;
                }
            }
            upsertAlias(row.code(), mainCode, upsert.productId(), sourceFileHash, row.rowNo());
            aliasImported++;
            updateItemStatus(sourceFileHash, row.rowNo(), upsert.isNew() ? "IMPORTED" : "UPDATED",
                    null,
                    row.code().equals(mainCode) ? upsert.productId() : null, upsert.productId());
        }

        log.info("MIG-2 product import 완료 total={} imported={} updated={} alias={} rejected={} placeholder={} orphan={} mergedGroups={} hash={}",
                itemRows.size(), imported, updated, aliasImported, rejectedNullName,
                skippedPlaceholder, skippedRelationOrphan,
                0, sourceFileHash);

        return new EcountProductImportResult(itemRows.size(), imported, updated, rejectedNullName,
                skippedPlaceholder, skippedRelationOrphan, aliasImported, sourceFileHash, rejectedSample,
                0, List.of());
    }

    /**
     * 관계 CSV가 명시한 코드 관계만 병합 대상으로 만든다.
     */
    private Map<String, List<ItemRow>> buildExplicitMergeRowsByMainCode(
            List<ItemRow> itemRows, RelationParseResult relationParse,
            Map<String, String> relationMainByAlias, Map<String, ItemRow> itemsByCode) {
        Map<String, List<ItemRow>> rowsByMainCode = new LinkedHashMap<>();
        for (ItemRow row : itemRows) {
            if (!isNormal(row.code(), row.name())) {
                continue;
            }
            String mainCode = relationMainByAlias.get(row.code());
            if (mainCode == null && relationParse.mainCodes().contains(row.code())) {
                mainCode = row.code();
            }
            if (mainCode != null) {
                rowsByMainCode.computeIfAbsent(mainCode, ignored -> new ArrayList<>()).add(row);
            }
        }
        return rowsByMainCode;
    }

    /**
     * 대표행을 기준으로 하되 업무 필드는 값이 있는 연결행에서 보완한다.
     * 숫자 0/공백은 비어 있는 값으로 보고, 양쪽이 모두 있으면 대표행을 유지한다.
     * 규격명은 병합 키·판정에 사용하지 않는다.
     */
    private ItemRow mergeExplicitRows(ItemRow representative, List<ItemRow> relatedRows) {
        if (relatedRows == null || relatedRows.size() < 2) {
            return representative;
        }
        String[] merged = representative.cells().clone();
        for (int index = 2; index <= 9; index++) {
            if (parseMoney(merged[index]).signum() != 0) {
                continue;
            }
            for (ItemRow related : relatedRows) {
                if (parseMoney(related.cells()[index]).signum() != 0) {
                    merged[index] = related.cells()[index];
                    break;
                }
            }
        }
        if (merged[10].isBlank()) {
            relatedRows.stream()
                    .map(row -> row.cells()[10])
                    .filter(value -> !value.isBlank())
                    .findFirst()
                    .ifPresent(value -> merged[10] = value);
        }
        return new ItemRow(representative.rowNo(), merged);
    }

    private RelationParseResult parseRelations(InputStream relationFile, String actorUserId) {
        if (relationFile == null) {
            return new RelationParseResult(Map.of(), Set.of());
        }
        byte[] content = EcountCsvSupport.readRequired(relationFile);
        if (!isXlsx(content)) {
            return parseRelationsCsv(new ByteArrayInputStream(content), actorUserId);
        }
        String hash = EcountCsvSupport.computeFileHash(content);
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(
                new ByteArrayInputStream(content), RELATION_HEADERS);
        Map<String, String> relation = new HashMap<>();
        Set<String> mainCodes = new HashSet<>();
        for (EcountXlsxSupport.ParsedRow row : parsed.rows()) {
            String[] c = row.cells();
            stagingRelationUpsert(hash, row.sourceRowNo(), c, actorUserId);
            String mainCode = c[0];
            String aliasCode = c[3];
            if (!mainCode.isBlank() && !aliasCode.isBlank()) {
                EcountCsvSupport.requireMaxLength(mainCode, 100, "product_code", row.sourceRowNo());
                EcountCsvSupport.requireMaxLength(aliasCode, 100, "product_code", row.sourceRowNo());
                String existingMain = relation.get(aliasCode);
                if (existingMain != null && !existingMain.equals(mainCode)) {
                    throw new BusinessException(ErrorCode.MIG2_ALIAS_DUPLICATE,
                            "동일 alias_code가 서로 다른 대표에 매핑됩니다: aliasCode="
                                    + aliasCode + ", sourceRowNo=" + row.sourceRowNo());
                }
                relation.put(aliasCode, mainCode);
                mainCodes.add(mainCode);
            }
        }
        return new RelationParseResult(relation, mainCodes);
    }

    private boolean isXlsx(byte[] content) {
        return content.length >= 2 && content[0] == 'P' && content[1] == 'K';
    }

    private RelationParseResult parseRelationsCsv(InputStream relationCsv, String actorUserId) {
        if (relationCsv == null) {
            return new RelationParseResult(Map.of(), Set.of());
        }
        byte[] content = EcountCsvSupport.readRequired(relationCsv);
        String hash = EcountCsvSupport.computeFileHash(content);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), RELATION_HEADERS);
        Map<String, String> relation = new HashMap<>();
        Set<String> mainCodes = new HashSet<>();
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), RELATION_HEADERS.length);
            stagingRelationUpsert(hash, rowNo, c, actorUserId);
            String mainCode = c[0];
            String aliasCode = c[3];
            if (!mainCode.isBlank() && !aliasCode.isBlank()) {
                EcountCsvSupport.requireMaxLength(mainCode, 100, "product_code", rowNo);
                EcountCsvSupport.requireMaxLength(aliasCode, 100, "product_code", rowNo);
                String existingMain = relation.get(aliasCode);
                if (existingMain != null && !existingMain.equals(mainCode)) {
                    throw new BusinessException(ErrorCode.MIG2_ALIAS_DUPLICATE,
                            "동일 alias_code 가 같은 파일 안에서 다른 main 에 매핑됩니다: aliasCode="
                                    + aliasCode + ", sourceRowNo=" + rowNo);
                }
                relation.put(aliasCode, mainCode);
                mainCodes.add(mainCode);
            }
        }
        return new RelationParseResult(relation, mainCodes);
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
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), GROUP_HEADERS.length);
            stagingGroupUpsert(hash, rowNo, c, actorUserId);
            if (!c[2].isBlank() && !c[1].isBlank()) {
                groups.putIfAbsent(c[2], c[1]);
            }
        }
        return groups;
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private ProductMainCandidate resolveMainCandidate(ItemRow row, String explicitMainCode, Set<String> relationMainCodes,
                                                       Map<String, ItemRow> itemsByCode) {
        if (explicitMainCode != null) {
            ItemRow explicitMainRow = itemsByCode.get(explicitMainCode);
            if (explicitMainRow != null) {
                return new ProductMainCandidate(explicitMainCode, explicitMainRow, null, true);
            }
            UUID existingMainId = findActiveProductIdByCode(explicitMainCode);
            return existingMainId == null
                    ? null
                    : new ProductMainCandidate(explicitMainCode, null, existingMainId, true);
        }
        if (relationMainCodes.contains(row.code())) {
            return new ProductMainCandidate(row.code(), row, null, true);
        }
        // 관계가 없는 행은 이름·규격·가격과 무관하게 자기 품목코드의 품목이다.
        return new ProductMainCandidate(row.code(), row, null, false);
    }

    private boolean isNormal(String code, String name) {
        return !name.isBlank() && !isPlaceholder(code);
    }

    private boolean isPlaceholder(String code) {
        return code == null || code.isBlank() || PLACEHOLDER_CODE.matcher(code).matches();
    }

    private UpsertProductResult upsertProduct(ItemRow row, String categoryGroup, String actor) {
        MapSqlParameterSource params = productParams(row, categoryGroup, actor);
        List<UUID> modelNameMerged = jdbcTemplate.queryForList(UPDATE_ACTIVE_MODEL_NAME_SQL, params, UUID.class);
        if (modelNameMerged != null && !modelNameMerged.isEmpty()) {
            return new UpsertProductResult(modelNameMerged.get(0), false);
        }
        boolean activeExists = exists("""
                SELECT COUNT(1) FROM products
                 WHERE product_code = :code AND is_deleted = FALSE
                """, new MapSqlParameterSource("code", row.code()));
        if (!activeExists) {
            UUID restoredId = restoreSoftDeletedProduct(params);
            if (restoredId != null) {
                return new UpsertProductResult(restoredId, false);
            }
        }
        UUID productId = jdbcTemplate.queryForObject(UPSERT_PRODUCT_SQL, params, UUID.class);
        return new UpsertProductResult(productId, !activeExists);
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
                .addValue("productGroup1", truncate(categoryGroup, 50))
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
              TRUE, :productGroup1, :inboundPrice, :outboundPrice, :singlePrice, :outdoorPrice,
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
              is_deleted = FALSE,
              deleted_at = NULL,
              deleted_by = NULL,
              modified_at = NOW(),
              modified_by = EXCLUDED.created_by
            RETURNING id
            """;

    /**
     * Google Sheets sync가 만든 행은 생성 시 기록한 {@code lineage=SHEET} 계보를 가진다.
     * 이카운트 품목코드가 그 model_name과 같으면 product_code가 이미 채워진 뒤에도
     * 새 행을 INSERT하지 않고 기존 행에 메타/단가만 병합한다.
     * 화면 품목명(name)은 시트 정본이므로 의도적으로 갱신하지 않는다.
     */
    private static final String UPDATE_ACTIVE_MODEL_NAME_SQL = """
            UPDATE products p
               SET model_name = :code,
                   model_code = CASE
                       WHEN NOT EXISTS (
                           SELECT 1 FROM products conflict
                            WHERE conflict.is_deleted = FALSE
                              AND conflict.id <> p.id
                              AND (conflict.product_code = :code OR conflict.model_code = :code)
                       ) THEN :code
                       ELSE p.model_code
                   END,
                   product_code = CASE
                       WHEN NOT EXISTS (
                           SELECT 1 FROM products conflict
                            WHERE conflict.is_deleted = FALSE
                              AND conflict.id <> p.id
                              AND (conflict.product_code = :code OR conflict.model_code = :code)
                       ) THEN :code
                       ELSE p.product_code
                   END,
                   specification = :spec,
                   selling_price = :sellingPrice,
                   purchase_price = :purchasePrice,
                   product_business_type = :businessType,
                   product_group1 = :productGroup1,
                   inbound_price = :inboundPrice,
                   outbound_price = :outboundPrice,
                   single_price = :singlePrice,
                   outdoor_price = :outdoorPrice,
                   multi_50_price = :multi50Price,
                   multi_48_price = :multi48Price,
                   multi_45_price = :multi45Price,
                   item_35_price = :item35Price,
                   category_group = :categoryGroup,
                   tax_type = 'TAXABLE',
                   unit_price_with_vat = :outboundPrice,
                   is_deleted = FALSE,
                   deleted_at = NULL,
                   deleted_by = NULL,
                   modified_at = NOW(),
                   modified_by = :actor
             WHERE p.model_name = :code
               AND p.lineage = 'SHEET'
                AND p.is_deleted = FALSE
            RETURNING p.id
            """;

    private UUID restoreSoftDeletedProduct(MapSqlParameterSource params) {
        List<UUID> restored = jdbcTemplate.queryForList("""
                WITH restored AS (
                    SELECT id
                      FROM products
                     WHERE product_code = :code AND is_deleted = TRUE
                     ORDER BY deleted_at DESC NULLS LAST, modified_at DESC NULLS LAST, created_at DESC
                     LIMIT 1
                     FOR UPDATE
                )
                UPDATE products p
                   SET name = :name,
                       model_name = :code,
                       model_code = :code,
                       category_id = (SELECT id FROM categories WHERE code = 'ECOUNT_MIG2' AND is_deleted = FALSE LIMIT 1),
                       selling_price = :sellingPrice,
                       purchase_price = :purchasePrice,
                       currency = 'KRW',
                       status = 'ACTIVE',
                       tags = NULL,
                       description = NULL,
                       specification = :spec,
                       unit = 'EA',
                       product_business_type = :businessType,
                       inventory_qty_mgmt = TRUE,
                       price_includes_vat = TRUE,
                       product_group1 = :productGroup1,
                       inbound_price = :inboundPrice,
                       outbound_price = :outboundPrice,
                       single_price = :singlePrice,
                       outdoor_price = :outdoorPrice,
                       multi_50_price = :multi50Price,
                       multi_48_price = :multi48Price,
                       multi_45_price = :multi45Price,
                       item_35_price = :item35Price,
                       category_group = :categoryGroup,
                       tax_type = 'TAXABLE',
                       unit_price_with_vat = :outboundPrice,
                       is_deleted = FALSE,
                       deleted_at = NULL,
                       deleted_by = NULL,
                       modified_at = NOW(),
                       modified_by = :actor
                  FROM restored
                 WHERE p.id = restored.id
                 RETURNING p.id
                """, params, UUID.class);
        return restored == null || restored.isEmpty() ? null : restored.get(0);
    }

    private void upsertAlias(String aliasCode, String mainCode, UUID mainProductId,
                             String hash, int rowNo) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("alias", aliasCode)
                .addValue("mainCode", mainCode)
                .addValue("mainId", mainProductId)
                .addValue("hash", hash)
                .addValue("rowNo", rowNo);
        int aliasRows = jdbcTemplate.update("""
                INSERT INTO product_aliases (alias_code, main_product_id, source, created_at, created_by, is_deleted)
                VALUES (:alias, :mainId, 'ECOUNT_IMPORT', NOW(), 'system', FALSE)
                ON CONFLICT (alias_code) WHERE is_deleted = FALSE DO UPDATE SET
                  main_product_id = EXCLUDED.main_product_id,
                  source = EXCLUDED.source,
                  modified_at = NOW(),
                  modified_by = 'system'
                WHERE product_aliases.main_product_id = EXCLUDED.main_product_id
                """, p);
        if (aliasRows == 0) {
            throw new BusinessException(ErrorCode.MIG2_ALIAS_DUPLICATE,
                    "동일 alias_code 가 다른 main 에 매핑됩니다: aliasCode=" + aliasCode
                            + ", sourceRowNo=" + rowNo);
        }
        int mapRows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_alias
                    (alias_code, main_item_code, main_product_uuid, source_file_hash, source_row_no, updated_at)
                VALUES (:alias, :mainCode, :mainId, :hash, :rowNo, NOW())
                ON CONFLICT (alias_code) DO UPDATE SET
                  main_item_code = EXCLUDED.main_item_code,
                  main_product_uuid = EXCLUDED.main_product_uuid,
                  source_file_hash = EXCLUDED.source_file_hash,
                  source_row_no = EXCLUDED.source_row_no,
                  updated_at = NOW()
                WHERE staging.ecount_item_alias.main_product_uuid = EXCLUDED.main_product_uuid
                """, p);
        if (mapRows == 0) {
            throw new BusinessException(ErrorCode.MIG2_ALIAS_DUPLICATE,
                    "품목 alias lookup map 이 다른 main_product_uuid 를 가리킵니다: aliasCode="
                            + aliasCode + ", sourceRowNo=" + rowNo);
        }
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private UUID findActiveProductIdByCode(String code) {
        List<UUID> productIds = jdbcTemplate.queryForList("""
                SELECT id
                  FROM products
                 WHERE product_code = :code AND is_deleted = FALSE AND status = 'ACTIVE'
                 ORDER BY created_at ASC
                 LIMIT 1
                """, new MapSqlParameterSource("code", code), UUID.class);
        return productIds == null || productIds.isEmpty() ? null : productIds.get(0);
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

    private record ProductMainCandidate(String mainCode, ItemRow rawRow, UUID existingProductId,
                                        boolean trustedIdentity) {
    }

    private record RelationParseResult(Map<String, String> mainCodeByAlias, Set<String> mainCodes) {
    }
}
