package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.EcountRemoteImportClient;
import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import com.samhanair.logis.accounting.web.dto.EcountCardImportResult;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig10Result;
import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.ecount.EcountMig7TransformResult;
import com.samhanair.logis.common.ecount.EcountMig8TransformResult;
import com.samhanair.logis.common.ecount.EcountMig9JournalResult;
import com.samhanair.logis.common.ecount.EcountReimportResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-20 — raw 디렉토리 파일을 slice 단위로 재스캔하고 새 source_file_hash만 기존 importer로 재적재한다. */
@Slf4j
@Service
public class EcountReimportService {

    private static final int DEFAULT_BATCH_SIZE = 500;
    private static final String PRODUCT_ITEM_PREFIX = "품목-Excel다운로드";
    private static final String PRODUCT_RELATION_PREFIX = "품목관계-Excel다운로드";
    private static final String PRODUCT_GROUP_PREFIX = "품목계층그룹-Excel다운로드";
    private static final Pattern PRODUCT_DUMP_KEY_PATTERN = Pattern.compile("(\\d{6,14})");

    private final Path rawDirectory;
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final MigOpsMetricsRecorder metricsRecorder;
    private final List<FileTarget> fileTargets;
    private final List<CommandTarget> commandTargets;

    public EcountReimportService(
            @Value("${ecount.reimport.raw-dir:docs/migration/ecount-data/raw}") String rawDirectory,
            NamedParameterJdbcTemplate jdbcTemplate,
            EcountRemoteImportClient remoteImportClient,
            EcountAccountImporter accountImporter,
            EcountCardImporter cardImporter,
            EcountPurchaseSlipImporter purchaseSlipImporter,
            EcountSalesSlipImporter salesSlipImporter,
            EcountGeneralVoucherImporter generalVoucherImporter,
            EcountJournalEntryImporter journalEntryImporter,
            EcountTaxInvoiceImporter taxInvoiceImporter,
            EcountSalesSlipLineImporter salesSlipLineImporter,
            EcountSalesPurchaseSummaryImporter salesPurchaseSummaryImporter,
            EcountOrderImporter orderImporter,
            EcountExpenseVoucherImporter expenseVoucherImporter,
            EcountDepositReportImporter depositReportImporter,
            EcountBankAccountImporter bankAccountImporter,
            EcountFixedAssetTypeImporter fixedAssetTypeImporter,
            EcountSalesLedgerImporter salesLedgerImporter,
            EcountPurchaseLedgerImporter purchaseLedgerImporter,
            Mig7CashDisbursementTransformService cashDisbursementTransformService,
            Mig7CashReceiptTransformService cashReceiptTransformService,
            Mig8OrderTransformService orderTransformService,
            Mig9CashJournalService cashJournalService,
            Mig9AgingSnapshotRefreshService agingSnapshotRefreshService,
            Mig10OrderEmployeeBackfillService orderEmployeeBackfillService,
            MigOpsMetricsRecorder metricsRecorder) {
        this.rawDirectory = Path.of(rawDirectory);
        this.jdbcTemplate = jdbcTemplate;
        this.metricsRecorder = metricsRecorder;
        this.fileTargets = fileTargets(remoteImportClient, accountImporter, cardImporter,
                purchaseSlipImporter, salesSlipImporter, generalVoucherImporter, journalEntryImporter,
                taxInvoiceImporter, salesSlipLineImporter, salesPurchaseSummaryImporter, orderImporter,
                expenseVoucherImporter, depositReportImporter, bankAccountImporter, fixedAssetTypeImporter,
                salesLedgerImporter, purchaseLedgerImporter);
        this.commandTargets = commandTargets(cashDisbursementTransformService, cashReceiptTransformService,
                orderTransformService, cashJournalService, agingSnapshotRefreshService, orderEmployeeBackfillService);
    }

    public EcountReimportResult reimportSlice(String slice, String userId) {
        EcountSlice normalized = EcountSlice.from(slice);
        List<EcountReimportResult.SliceResult> details = new ArrayList<>();
        List<EcountReimportResult.ErrorSample> errors = new ArrayList<>();
        Totals totals = new Totals();

        List<Path> rawFiles = listRawFiles();
        for (FileTarget target : fileTargetsFor(normalized)) {
            List<Path> matched = matchingFiles(rawFiles, target);
            totals.filesScanned += matched.size();
            for (Path file : matched) {
                processFile(normalized, target, file, rawFiles, userId, totals, details, errors);
            }
        }

        for (CommandTarget target : commandTargetsFor(normalized)) {
            processCommand(target, userId, totals, details, errors);
        }

        recordMetrics(normalized, totals, errors);
        return new EcountReimportResult(
                normalized.code,
                totals.filesScanned,
                totals.filesProcessed,
                totals.filesSkipped,
                totals.totalImported,
                totals.totalRejected,
                List.copyOf(details),
                List.copyOf(errors));
    }

    private void recordMetrics(EcountSlice slice, Totals totals, List<EcountReimportResult.ErrorSample> errors) {
        metricsRecorder.recordReimportFilesScanned(slice.code, totals.filesScanned);
        if (errors.isEmpty()) {
            String status = totals.filesProcessed == 0 && totals.filesSkipped > 0 ? "SKIP" : "SUCCESS";
            metricsRecorder.recordReimportRun(slice.code, status);
        } else {
            metricsRecorder.recordReimportRun(slice.code, "FAIL");
        }
    }

    private void processFile(EcountSlice slice, FileTarget target, Path file, List<Path> rawFiles,
                             String userId, Totals totals,
                             List<EcountReimportResult.SliceResult> details,
                             List<EcountReimportResult.ErrorSample> errors) {
        String fileName = file.getFileName().toString();
        String hash = target.sourceHash(file, rawFiles);
        if (sourceHashExists(slice, target, hash)) {
            totals.filesSkipped++;
            details.add(new EcountReimportResult.SliceResult(
                    target.key, fileName, hash, "SKIPPED_HASH_EXISTS", 0, 0,
                    "이미 처리된 source_file_hash 입니다."));
            return;
        }
        try {
            CountSummary summary = target.action.importFile(file, rawFiles, userId);
            totals.filesProcessed++;
            totals.totalImported += summary.imported;
            totals.totalRejected += summary.rejected;
            recordProcessed(slice, target, fileName, hash, summary, userId);
            details.add(new EcountReimportResult.SliceResult(
                    target.key, fileName, hash, "PROCESSED",
                    summary.imported, summary.rejected, summary.message));
        } catch (BusinessException ex) {
            int rejectedRows = rejectedRowsOnFailure(file);
            totals.totalRejected += rejectedRows;
            errors.add(error(target.key, fileName, ex.getErrorCode().name(), ex.getMessage()));
            details.add(new EcountReimportResult.SliceResult(
                    target.key, fileName, hash, "FAILED", 0, rejectedRows, ex.getMessage()));
        } catch (Exception ex) {
            totals.totalRejected++;
            errors.add(error(target.key, fileName, ErrorCode.MIG20_REIMPORT_FAILED.name(), ex.getMessage()));
            details.add(new EcountReimportResult.SliceResult(
                    target.key, fileName, hash, "FAILED", 0, 1, ex.getMessage()));
        }
    }

    private void processCommand(CommandTarget target, String userId, Totals totals,
                                 List<EcountReimportResult.SliceResult> details,
                                 List<EcountReimportResult.ErrorSample> errors) {
        try {
            CountSummary summary = target.action.run(userId);
            totals.filesProcessed++;
            totals.totalImported += summary.imported;
            totals.totalRejected += summary.rejected;
            errors.addAll(summary.errors);
            String status = summary.rejected > 0 ? "PROCESSED_WITH_REJECTIONS" : "PROCESSED";
            String message = summary.message != null
                    ? summary.message
                    : summary.rejected > 0 ? "거부 " + summary.rejected + "건 — errors 상세를 확인하십시오." : null;
            details.add(new EcountReimportResult.SliceResult(
                    target.key, null, null, status,
                    summary.imported, summary.rejected, message));
        } catch (BusinessException ex) {
            totals.totalRejected++;
            errors.add(error(target.key, null, ex.getErrorCode().name(), ex.getMessage()));
            details.add(new EcountReimportResult.SliceResult(
                    target.key, null, null, "FAILED", 0, 1, ex.getMessage()));
        } catch (Exception ex) {
            totals.totalRejected++;
            errors.add(error(target.key, null, ErrorCode.MIG20_REIMPORT_FAILED.name(), ex.getMessage()));
            details.add(new EcountReimportResult.SliceResult(
                    target.key, null, null, "FAILED", 0, 1, ex.getMessage()));
        }
    }

    private List<Path> listRawFiles() {
        if (!Files.exists(rawDirectory)) {
            throw new BusinessException(ErrorCode.MIG20_RAW_DIR_NOT_FOUND,
                    "MIG-20 raw 디렉토리를 찾을 수 없습니다: " + rawDirectory.toAbsolutePath());
        }
        try (Stream<Path> paths = Files.list(rawDirectory)) {
            return paths.filter(Files::isRegularFile)
                    .filter(path -> !path.getFileName().toString().equals(".gitkeep"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.MIG20_RAW_DIR_NOT_FOUND,
                    "MIG-20 raw 디렉토리 목록 조회 실패: " + rawDirectory.toAbsolutePath(), ex);
        }
    }

    private List<Path> matchingFiles(List<Path> rawFiles, FileTarget target) {
        return rawFiles.stream()
                .filter(path -> target.matches(path.getFileName().toString()))
                .toList();
    }

    private boolean sourceHashExists(EcountSlice slice, FileTarget target, String hash) {
        if (runRecorded(slice, target.key, hash)) {
            return true;
        }
        for (String table : target.sourceHashTables) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM " + table + " WHERE source_file_hash = :hash",
                    new MapSqlParameterSource("hash", hash),
                    Integer.class);
            if (count != null && count > 0) {
                return true;
            }
        }
        return false;
    }

    private boolean runRecorded(EcountSlice slice, String targetKey, String hash) {
        try {
            Integer count = jdbcTemplate.queryForObject("""
                    SELECT COUNT(1)
                      FROM staging.ecount_reimport_file_runs
                     WHERE slice_code = :slice
                       AND target_key = :target
                       AND source_file_hash = :hash
                    """,
                    new MapSqlParameterSource()
                            .addValue("slice", slice.code)
                            .addValue("target", targetKey)
                            .addValue("hash", hash),
                    Integer.class);
            return count != null && count > 0;
        } catch (DataAccessException ex) {
            log.debug("[MIG-20] reimport run registry 조회 생략: {}", ex.getMessage());
            return false;
        }
    }

    private void recordProcessed(EcountSlice slice, FileTarget target, String fileName,
                                 String hash, CountSummary summary, String userId) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_reimport_file_runs
                    (slice_code, target_key, source_file_hash, file_name,
                     imported_count, rejected_count, processed_by)
                VALUES
                    (:slice, :target, :hash, :fileName, :imported, :rejected, :userId)
                ON CONFLICT (slice_code, target_key, source_file_hash) DO UPDATE SET
                    file_name = EXCLUDED.file_name,
                    imported_count = EXCLUDED.imported_count,
                    rejected_count = EXCLUDED.rejected_count,
                    processed_at = NOW(),
                    processed_by = EXCLUDED.processed_by
                """,
                new MapSqlParameterSource()
                        .addValue("slice", slice.code)
                        .addValue("target", target.key)
                        .addValue("hash", hash)
                        .addValue("fileName", fileName)
                        .addValue("imported", summary.imported)
                        .addValue("rejected", summary.rejected)
                        .addValue("userId", normalizeUser(userId)));
    }

    private static String sourceFileHash(Path file) {
        try (InputStream input = Files.newInputStream(file)) {
            return EcountCsvSupport.computeFileHash(input.readAllBytes());
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                    "raw 파일 hash 계산 실패: " + file.getFileName(), ex);
        }
    }

    private static String sourceFileHash(Path file, List<Path> ignored) {
        return sourceFileHash(file);
    }

    private static int rejectedRowsOnFailure(Path file) {
        String fileName = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!fileName.endsWith(".csv")) {
            return 1;
        }
        try (InputStream input = Files.newInputStream(file)) {
            return Math.max(1, EcountCsvSupport.parse(input.readAllBytes()).dataRows().size());
        } catch (Exception ignored) {
            return 1;
        }
    }

    private List<FileTarget> fileTargetsFor(EcountSlice slice) {
        return fileTargets.stream().filter(target -> target.slice == slice).toList();
    }

    private List<CommandTarget> commandTargetsFor(EcountSlice slice) {
        return commandTargets.stream().filter(target -> target.slice == slice).toList();
    }

    private static EcountReimportResult.ErrorSample error(
            String target, String fileName, String errorCode, String message) {
        return new EcountReimportResult.ErrorSample(target, fileName, errorCode, message);
    }

    private static List<FileTarget> fileTargets(
            EcountRemoteImportClient remoteImportClient,
            EcountAccountImporter accountImporter,
            EcountCardImporter cardImporter,
            EcountPurchaseSlipImporter purchaseSlipImporter,
            EcountSalesSlipImporter salesSlipImporter,
            EcountGeneralVoucherImporter generalVoucherImporter,
            EcountJournalEntryImporter journalEntryImporter,
            EcountTaxInvoiceImporter taxInvoiceImporter,
            EcountSalesSlipLineImporter salesSlipLineImporter,
            EcountSalesPurchaseSummaryImporter salesPurchaseSummaryImporter,
            EcountOrderImporter orderImporter,
            EcountExpenseVoucherImporter expenseVoucherImporter,
            EcountDepositReportImporter depositReportImporter,
            EcountBankAccountImporter bankAccountImporter,
            EcountFixedAssetTypeImporter fixedAssetTypeImporter,
            EcountSalesLedgerImporter salesLedgerImporter,
            EcountPurchaseLedgerImporter purchaseLedgerImporter) {
        List<FileTarget> targets = new ArrayList<>();
        targets.add(remote(EcountSlice.MIG_1, "partner", "거래처-Excel다운로드", Set.of(".csv"),
                "partner-service", "/admin/partners/imports/ecount", "file", remoteImportClient));
        targets.add(remoteProduct(remoteImportClient));
        targets.add(local(EcountSlice.MIG_2, "account", "계정상세내역-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(accountImporter.importCsv(input, user))),
                "staging.ecount_account_raw"));
        targets.add(local(EcountSlice.MIG_2, "card", "카드-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(cardImporter.importCsv(input, user))),
                "staging.ecount_card_raw"));
        targets.add(remote(EcountSlice.MIG_2, "department", "부서코드-Excel다운로드", Set.of(".csv"),
                "user-service", "/admin/departments/imports/ecount", "file", remoteImportClient));
        targets.add(remote(EcountSlice.MIG_2, "warehouse", "창고-Excel다운로드", Set.of(".csv"),
                "inventory-service", "/admin/warehouses/imports/ecount", "file", remoteImportClient));
        targets.add(local(EcountSlice.MIG_3, "purchase-slip", "매입전표I-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(purchaseSlipImporter.importCsv(input, user))),
                "staging.ecount_purchase_slip_raw"));
        targets.add(local(EcountSlice.MIG_3, "sales-slip", "매출전표I-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(salesSlipImporter.importCsv(input, user))),
                "staging.ecount_sales_slip_raw"));
        targets.add(local(EcountSlice.MIG_3, "general-voucher", "일반전표-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(generalVoucherImporter.importCsv(input, user))),
                "staging.ecount_general_voucher_raw"));
        targets.add(local(EcountSlice.MIG_3, "journal-entry", "회계전표분개-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(journalEntryImporter.importCsv(input, user))),
                "staging.ecount_journal_entry_raw"));
        targets.add(local(EcountSlice.MIG_4, "tax-invoice", "세금계산서용 판매전표-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(taxInvoiceImporter.importCsv(input, user))),
                "staging.ecount_tax_invoice_raw"));
        targets.add(local(EcountSlice.MIG_4, "sales-slip-line", "판매전표-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(salesSlipLineImporter.importCsv(input, user))),
                "staging.ecount_sales_slip_line_raw"));
        targets.add(local(EcountSlice.MIG_4, "summary", "매출매입내역-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(salesPurchaseSummaryImporter.importCsv(input, user))),
                "staging.ecount_sales_purchase_summary_raw"));
        targets.add(local(EcountSlice.MIG_4, "order", "주문서-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(orderImporter.importCsv(input, user))),
                "staging.ecount_order_raw"));
        targets.add(remote(EcountSlice.MIG_5, "stock-transfer", "창고이동-Excel다운로드", Set.of(".csv"),
                "inventory-service", "/admin/inventory/stock-transfers/imports/ecount", "file", remoteImportClient));
        targets.add(local(EcountSlice.MIG_5, "expense-voucher", "지출결의서-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(expenseVoucherImporter.importCsv(input, user))),
                "staging.ecount_expense_voucher_raw"));
        targets.add(local(EcountSlice.MIG_5, "deposit-report", "입금보고서-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(depositReportImporter.importCsv(input, user))),
                "staging.ecount_deposit_report_raw"));
        targets.add(local(EcountSlice.MIG_6, "bank-account", "통장계좌-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(bankAccountImporter.importCsv(input, user))),
                "staging.ecount_bank_account_raw"));
        targets.add(remote(EcountSlice.MIG_6, "employee", "사원-Excel다운로드", Set.of(".csv"),
                "user-service", "/admin/user/employees/imports/ecount", "file", remoteImportClient));
        targets.add(remote(EcountSlice.MIG_6, "employee-card", "인사카드등록-Excel다운로드", Set.of(".csv"),
                "user-service", "/admin/user/employee-cards/imports/ecount", "file", remoteImportClient));
        targets.add(remote(EcountSlice.MIG_6, "payroll-employee", "급여관리사원-Excel다운로드", Set.of(".csv"),
                "user-service", "/admin/user/payroll-employees/imports/ecount", "file", remoteImportClient));
        targets.add(local(EcountSlice.MIG_6, "fixed-asset-type", "고정자산유형-Excel다운로드", Set.of(".csv"),
                (file, user) -> withInput(file, input -> summarize(fixedAssetTypeImporter.importCsv(input, user))),
                "staging.ecount_fixed_asset_type_raw"));
        targets.add(local(EcountSlice.MIG_11, "sales-ledger", "매출장", Set.of(".xlsx"),
                (file, user) -> withInput(file, input -> summarize(salesLedgerImporter.importXlsx(input, user))),
                "staging.ecount_sales_ledger_raw"));
        targets.add(local(EcountSlice.MIG_11, "purchase-ledger", "매입장", Set.of(".xlsx"),
                (file, user) -> withInput(file, input -> summarize(purchaseLedgerImporter.importXlsx(input, user))),
                "staging.ecount_purchase_ledger_raw"));
        return List.copyOf(targets);
    }

    private static List<CommandTarget> commandTargets(
            Mig7CashDisbursementTransformService cashDisbursementTransformService,
            Mig7CashReceiptTransformService cashReceiptTransformService,
            Mig8OrderTransformService orderTransformService,
            Mig9CashJournalService cashJournalService,
            Mig9AgingSnapshotRefreshService agingSnapshotRefreshService,
            Mig10OrderEmployeeBackfillService orderEmployeeBackfillService) {
        return List.of(
                new CommandTarget(EcountSlice.MIG_7, "cash-disbursement-transform",
                        user -> summarize(cashDisbursementTransformService.transformFromStaging(DEFAULT_BATCH_SIZE, user))),
                new CommandTarget(EcountSlice.MIG_7, "cash-receipt-transform",
                        user -> summarize(cashReceiptTransformService.transformFromStaging(DEFAULT_BATCH_SIZE, user))),
                new CommandTarget(EcountSlice.MIG_8, "order-transform",
                        user -> summarize(orderTransformService.transformFromStaging(DEFAULT_BATCH_SIZE, user))),
                new CommandTarget(EcountSlice.MIG_9, "cash-disbursement-journal",
                        user -> summarize(cashJournalService.generateFromDisbursements(DEFAULT_BATCH_SIZE, user))),
                new CommandTarget(EcountSlice.MIG_9, "cash-receipt-journal",
                        user -> summarize(cashJournalService.generateFromReceipts(DEFAULT_BATCH_SIZE, user))),
                new CommandTarget(EcountSlice.MIG_9, "aging-snapshot-refresh",
                        user -> {
                            agingSnapshotRefreshService.refresh();
                            return new CountSummary(1, 0, "AgingSnapshot refreshed");
                        }),
                new CommandTarget(EcountSlice.MIG_10, "order-employee-backfill",
                        user -> summarize(orderEmployeeBackfillService.backfill(DEFAULT_BATCH_SIZE, user))));
    }

    private static FileTarget remoteProduct(EcountRemoteImportClient remoteImportClient) {
        return new FileTarget(EcountSlice.MIG_2, "product", PRODUCT_ITEM_PREFIX, Set.of(".csv"),
                List.of(), EcountReimportService::productCombinedHash, (file, rawFiles, userId) -> {
            ProductFileGroup group = productFileGroup(file, rawFiles);
            Map<String, Path> parts = new LinkedHashMap<>();
            parts.put("itemFile", group.itemFile);
            group.relationFile.ifPresent(path -> parts.put("relationFile", path));
            group.groupFile.ifPresent(path -> parts.put("groupFile", path));
            return summarize(remoteImportClient.importFile("product-service",
                    "/admin/products/imports/ecount", parts, userId));
        });
    }

    private static FileTarget remote(EcountSlice slice, String key, String prefix, Set<String> extensions,
                                     String serviceName, String endpoint, String partName,
                                     EcountRemoteImportClient remoteImportClient) {
        return new FileTarget(slice, key, prefix, extensions, List.of(),
                EcountReimportService::sourceFileHash,
                (file, rawFiles, userId) -> summarize(remoteImportClient.importFile(
                        serviceName, endpoint, Map.of(partName, file), userId)));
    }

    private static FileTarget local(EcountSlice slice, String key, String prefix, Set<String> extensions,
                                    SimpleFileAction action, String... sourceHashTables) {
        return new FileTarget(slice, key, prefix, extensions, List.of(sourceHashTables),
                EcountReimportService::sourceFileHash,
                (file, rawFiles, userId) -> action.importFile(file, normalizeUser(userId)));
    }

    private static ProductFileGroup productFileGroup(Path itemFile, List<Path> rawFiles) {
        Optional<String> dumpKey = productDumpKey(itemFile);
        return new ProductFileGroup(
                itemFile,
                productCompanion(rawFiles, PRODUCT_RELATION_PREFIX, dumpKey, itemFile),
                productCompanion(rawFiles, PRODUCT_GROUP_PREFIX, dumpKey, itemFile));
    }

    private static Optional<Path> productCompanion(
            List<Path> rawFiles, String prefix, Optional<String> dumpKey, Path itemFile) {
        List<Path> candidates = rawFiles.stream()
                .filter(path -> startsWith(path.getFileName().toString(), prefix))
                .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".csv"))
                .toList();
        if (candidates.isEmpty()) {
            return Optional.empty();
        }
        if (dumpKey.isPresent()) {
            List<Path> matched = candidates.stream()
                    .filter(path -> productDumpKey(path).filter(dumpKey.get()::equals).isPresent())
                    .toList();
            if (matched.isEmpty()) {
                log.warn("[MIG-20] product companion file skip — itemFile={} prefix={} dumpKey={}",
                        itemFile.getFileName(), prefix, dumpKey.get());
                return Optional.empty();
            }
            if (matched.size() > 1) {
                log.warn("[MIG-20] product companion file duplicated — itemFile={} prefix={} dumpKey={} count={}",
                        itemFile.getFileName(), prefix, dumpKey.get(), matched.size());
            }
            return Optional.of(matched.get(0));
        }
        if (candidates.size() > 1) {
            log.warn("[MIG-20] product companion file skip — itemFile={} prefix={} reason=timestamp_missing",
                    itemFile.getFileName(), prefix);
            return Optional.empty();
        }
        return Optional.of(candidates.get(0));
    }

    private static Optional<String> productDumpKey(Path file) {
        Matcher matcher = PRODUCT_DUMP_KEY_PATTERN.matcher(file.getFileName().toString());
        List<String> groups = new ArrayList<>();
        while (matcher.find()) {
            groups.add(matcher.group(1));
        }
        return groups.isEmpty() ? Optional.empty() : Optional.of(String.join("_", groups));
    }

    private static String productCombinedHash(Path itemFile, List<Path> rawFiles) {
        ProductFileGroup group = productFileGroup(itemFile, rawFiles);
        String material = "itemFile=" + sourceFileHash(group.itemFile) + "\n"
                + "relationFile=" + group.relationFile.map(EcountReimportService::sourceFileHash).orElse("") + "\n"
                + "groupFile=" + group.groupFile.map(EcountReimportService::sourceFileHash).orElse("") + "\n";
        return EcountCsvSupport.computeFileHash(material.getBytes(StandardCharsets.UTF_8));
    }

    private static CountSummary withInput(Path file, InputStreamAction action) throws Exception {
        try (InputStream input = Files.newInputStream(file)) {
            return action.importFile(input);
        }
    }

    private static CountSummary summarize(EcountRemoteImportClient.RemoteImportResult result) {
        return new CountSummary(result.imported(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountAccountImportResult result) {
        return new CountSummary(result.imported() + result.updated(),
                result.rejectedNullName(), null);
    }

    private static CountSummary summarize(EcountCardImportResult result) {
        return new CountSummary(result.imported() + result.updated(),
                result.rejectedNullName(), null);
    }

    private static CountSummary summarize(EcountVoucherImportResult result) {
        return new CountSummary(result.imported() + result.updated(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountMig4ImportResult result) {
        return new CountSummary(result.imported() + result.updated(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountMig5ImportResult result) {
        return new CountSummary(result.imported() + result.updated() + result.lineAdded(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountMig6ImportResult result) {
        return new CountSummary(result.imported() + result.updated(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountMig7TransformResult result) {
        return new CountSummary(result.imported() + result.updated(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountMig8TransformResult result) {
        List<EcountReimportResult.ErrorSample> errors = result.samples().stream()
                .filter(sample -> "ERROR".equals(sample.level()))
                .map(sample -> error("order-transform", null, sample.code(), sampleDetail(sample)))
                .toList();
        return new CountSummary(result.imported() + result.updated(), result.rejected(), null, errors);
    }

    private static String sampleDetail(EcountMig8TransformResult.Sample sample) {
        return "sourceRowNo=" + sample.rowNumber()
                + ", businessKey='" + sample.businessKey()
                + "', rawValue='" + sample.rawValue() + "': " + sample.message();
    }

    private static CountSummary summarize(EcountMig9JournalResult result) {
        return new CountSummary(result.cashDisbursementJournalsCreated()
                + result.cashReceiptJournalsCreated(), result.rejected(), null);
    }

    private static CountSummary summarize(EcountMig10Result result) {
        return new CountSummary(result.backfilled(),
                result.lookupMissCount() + result.ambiguousCount(), null);
    }

    private static CountSummary summarize(EcountMig11Result result) {
        return new CountSummary(result.imported(), result.rejected(), null);
    }

    private static boolean startsWith(String fileName, String prefix) {
        return fileName.toLowerCase(Locale.ROOT).startsWith(prefix.toLowerCase(Locale.ROOT));
    }

    private static String normalizeUser(String userId) {
        return userId == null || userId.isBlank() ? "system" : userId;
    }

    enum EcountSlice {
        MIG_1("mig-1"),
        MIG_2("mig-2"),
        MIG_3("mig-3"),
        MIG_4("mig-4"),
        MIG_5("mig-5"),
        MIG_6("mig-6"),
        MIG_7("mig-7"),
        MIG_8("mig-8"),
        MIG_9("mig-9"),
        MIG_10("mig-10"),
        MIG_11("mig-11");

        private final String code;

        EcountSlice(String code) {
            this.code = code;
        }

        static EcountSlice from(String raw) {
            if (raw == null || raw.isBlank()) {
                throw unknown(raw);
            }
            String normalized = raw.trim().toLowerCase(Locale.ROOT).replace('_', '-');
            for (EcountSlice slice : values()) {
                if (slice.code.equals(normalized)) {
                    return slice;
                }
            }
            throw unknown(raw);
        }

        private static BusinessException unknown(String raw) {
            return new BusinessException(ErrorCode.MIG20_SLICE_UNKNOWN,
                    "MIG-20 허용되지 않는 slice 입니다: " + raw);
        }
    }

    private record FileTarget(EcountSlice slice, String key, String prefix,
                              Set<String> extensions, List<String> sourceHashTables,
                              SourceHashAction sourceHashAction, FileAction action) {
        boolean matches(String fileName) {
            String lower = fileName.toLowerCase(Locale.ROOT);
            return startsWith(fileName, prefix) && extensions.stream().anyMatch(lower::endsWith);
        }

        String sourceHash(Path file, List<Path> rawFiles) {
            return sourceHashAction.hash(file, rawFiles);
        }
    }

    private record ProductFileGroup(Path itemFile, Optional<Path> relationFile, Optional<Path> groupFile) {
    }

    private record CommandTarget(EcountSlice slice, String key, CommandAction action) {
    }

    private record CountSummary(int imported, int rejected, String message,
                                List<EcountReimportResult.ErrorSample> errors) {
        private CountSummary(int imported, int rejected, String message) {
            this(imported, rejected, message, List.of());
        }
    }

    private static final class Totals {
        private int filesScanned;
        private int filesProcessed;
        private int filesSkipped;
        private int totalImported;
        private int totalRejected;
    }

    @FunctionalInterface
    private interface FileAction {
        CountSummary importFile(Path file, List<Path> rawFiles, String userId) throws Exception;
    }

    @FunctionalInterface
    private interface SourceHashAction {
        String hash(Path file, List<Path> rawFiles);
    }

    @FunctionalInterface
    private interface SimpleFileAction {
        CountSummary importFile(Path file, String userId) throws Exception;
    }

    @FunctionalInterface
    private interface InputStreamAction {
        CountSummary importFile(InputStream input) throws Exception;
    }

    @FunctionalInterface
    private interface CommandAction {
        CountSummary run(String userId) throws Exception;
    }
}
