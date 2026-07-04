package com.samhanair.logis.accounting.service;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.domain.MatchStatus;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.web.dto.BankTransactionImportMapping;
import com.samhanair.logis.accounting.web.dto.BankTransactionImportResult;
import com.samhanair.logis.accounting.web.dto.BankTransactionFilterLabelsResponse;
import com.samhanair.logis.accounting.web.dto.BankTransactionMatchPartnerClearRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionMatchPartnerRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionResponse;
import com.samhanair.logis.accounting.web.dto.BankTransactionResponse.PartnerDisplay;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.apache.commons.io.input.BOMInputStream;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** 통장 입출금 거래 import/조회 서비스. */
@Service
@RequiredArgsConstructor
@Transactional
public class BankTransactionService {

    private static final Charset MS949 = Charset.forName("MS949");
    private static final DateTimeFormatter[] DATE_TIME_FORMATTERS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
            DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm"),
            DateTimeFormatter.ofPattern("yyyyMMdd HHmmss"),
            DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
    };

    /** 계좌 필터가 적용되는 소스(계좌 label 조회 대상 findDistinctAccountLabels 와 일치). */
    private static final List<BankTxnSource> ACCOUNT_SOURCES =
            List.of(BankTxnSource.CSV_IMPORT, BankTxnSource.CODEF_BANK);
    /** 카드 필터가 적용되는 소스(findDistinctCardLabels 와 일치). */
    private static final List<BankTxnSource> CARD_SOURCES = List.of(BankTxnSource.CODEF_CARD);
    /** label 필터 대상 소스 전체. 이 목록 밖 소스(대출/KFTC)는 필터에서 면제해 항상 포함한다. */
    private static final List<BankTxnSource> FILTERABLE_SOURCES =
            List.of(BankTxnSource.CSV_IMPORT, BankTxnSource.CODEF_BANK, BankTxnSource.CODEF_CARD);
    private static final DateTimeFormatter[] DATE_FORMATTERS = {
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("yyyy.MM.dd"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.BASIC_ISO_DATE
    };

    private final BankTransactionRepository repository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 범용 CSV 컬럼 매핑으로 통장 거래를 import 한다.
     *
     * @param file CSV 파일
     * @param bankAccountLabel 우리 측 은행계좌 표시명
     * @param mapping 컬럼 매핑
     * @return import/중복 skip 결과
     */
    public BankTransactionImportResult importCsv(MultipartFile file, String bankAccountLabel,
                                                 BankTransactionImportMapping mapping) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        if (!hasText(bankAccountLabel)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bankAccountLabel 은 필수입니다.");
        }
        requireColumn(mapping.dateColumn(), "dateColumn");
        requireColumn(mapping.descriptionColumn(), "descriptionColumn");
        if (!hasText(mapping.depositColumn()) && !hasText(mapping.withdrawalColumn())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "depositColumn 또는 withdrawalColumn 중 하나는 필수입니다.");
        }

        List<String[]> rows = parseCsv(file);
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어 있습니다");
        }

        String[] header = mapping.headerRow() ? rows.get(0) : null;
        List<String[]> dataRows = mapping.headerRow() ? rows.subList(1, rows.size()) : rows;
        ColumnResolver resolver = new ColumnResolver(header);

        int imported = 0;
        int duplicateSkipped = 0;
        for (String[] row : dataRows) {
            if (isAllBlank(row)) {
                continue;
            }
            BankTransaction transaction = toTransaction(row, resolver, bankAccountLabel.trim(), mapping);
            if (isDuplicate(transaction)) {
                duplicateSkipped++;
                continue;
            }
            repository.save(transaction);
            imported++;
        }
        return new BankTransactionImportResult(dataRows.size(), imported, duplicateSkipped);
    }

    /**
     * 통장 거래 목록을 조회한다.
     *
     * @param matchStatus 매칭 상태 탭 필터
     * @param from 거래일 시작일
     * @param to 거래일 종료일
     * @param bankAccountLabel 은행계좌 표시명
     * @return 거래일 역순 목록
     */
    @Transactional(readOnly = true)
    public List<BankTransactionResponse> list(MatchStatus matchStatus, LocalDate from, LocalDate to,
                                              String bankAccountLabel) {
        // 하위호환: 단일 label 은 계좌 필터로 간주한다.
        return list(matchStatus, from, to,
                bankAccountLabel == null ? List.of() : List.of(bankAccountLabel),
                List.of());
    }

    /**
     * 통장 거래 목록을 소스 인식 필터로 조회한다.
     *
     * <p>계좌 label 은 계좌 소스행(CSV/CODEF_BANK)에만, 카드 label 은 카드 소스행(CODEF_CARD)에만 적용하고,
     * 필터 UI 가 없는 소스(대출/KFTC)는 항상 포함한다. 빈 목록은 해당 소스 전체 선택을 의미한다.
     *
     * @param matchStatus 매칭 상태 탭 필터
     * @param from 거래일 시작일
     * @param to 거래일 종료일
     * @param accountLabels 계좌 표시명 다중 선택(빈 목록=계좌 전체)
     * @param cardLabels 카드 표시명 다중 선택(빈 목록=카드 전체)
     * @return 거래일 역순 목록
     */
    @Transactional(readOnly = true)
    public List<BankTransactionResponse> list(MatchStatus matchStatus, LocalDate from, LocalDate to,
                                              List<String> accountLabels, List<String> cardLabels) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "to 는 from 이후여야 합니다.");
        }
        Specification<BankTransaction> spec = bankTransactionSpec(
                matchStatus,
                from,
                to,
                normalizeLabels(null, accountLabels),
                normalizeLabels(null, cardLabels));
        List<BankTransaction> rows = repository.findAll(
                spec,
                Sort.by(Sort.Order.desc("transactedAt"), Sort.Order.desc("createdAt")));
        Map<UUID, PartnerSummary> partners = resolveDisplays(rows);
        Map<UUID, String> cashReceiptSlipNos = resolveCashReceiptSlipNos(rows);
        return rows.stream()
                .map(row -> BankTransactionResponse.of(
                        row,
                        displayOfPartner(row, partners),
                        cashReceiptSlipNos.get(row.getId())))
                .toList();
    }

    /** 필터 모달에 표시할 계좌/카드 label 목록을 조회한다. */
    @Transactional(readOnly = true)
    public BankTransactionFilterLabelsResponse filterLabels() {
        return new BankTransactionFilterLabelsResponse(
                normalizeLabels(null, repository.findDistinctAccountLabels()),
                normalizeLabels(null, repository.findDistinctCardLabels()));
    }

    /**
     * 미반영 통장 거래에 거래처를 수동 지정한다.
     *
     * <p>요청/응답 모두 UUID 를 노출하지 않고,
     * {@code bankAccountLabel + transactedAt + amount + externalRef} 자연키와 {@code partnerCode} 만 사용한다.
     */
    public BankTransactionResponse matchPartner(BankTransactionMatchPartnerRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다.");
        }
        if (!hasText(request.partnerCode())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 는 필수입니다.");
        }

        BankTransaction transaction = findUniqueByNaturalKey(request.bankAccountLabel(),
                request.transactedAt(), request.amount(), request.externalRef());
        PartnerSummary partner = partnerLookupClient.findByPartnerCode(request.partnerCode().trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "등록된 거래처를 찾을 수 없습니다: " + request.partnerCode().trim()));
        if (partner.partnerId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래처 내부 식별자를 해석할 수 없습니다: " + request.partnerCode().trim());
        }

        transaction.matchPartner(partner.partnerId());
        return BankTransactionResponse.of(transaction, displayOf(partner), null);
    }

    /**
     * 미반영 통장 거래의 거래처 수동지정을 해제한다.
     *
     * <p>회계반영/강제 상태는 도메인 가드에서 거부하고 409 로 변환한다.
     */
    public BankTransactionResponse clearPartner(BankTransactionMatchPartnerClearRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다.");
        }
        BankTransaction transaction = findUniqueByNaturalKey(request.bankAccountLabel(),
                request.transactedAt(), request.amount(), request.externalRef());
        transaction.clearPartner();
        return BankTransactionResponse.of(transaction, null, null);
    }

    private PartnerDisplay displayOfPartner(BankTransaction row, Map<UUID, PartnerSummary> partners) {
        UUID partnerId = row.getMatchedPartnerId();
        return partnerId == null ? null : displayOf(partners.get(partnerId));
    }

    /**
     * V43 unique index 4-key(bankAccountLabel + transactedAt + amount + externalRef)로 단건 식별.
     *
     * <p>2-key(label+externalRef)는 같은 계좌에서 같은 externalRef 가 다른 일시/금액으로 공존하면
     * 다건이 되어 정당한 매칭을 거부하므로(BLOCKING 회귀), unique index 전체 키를 사용해 단건 보장.
     */
    public BankTransaction findUniqueByNaturalKey(String bankAccountLabel, LocalDateTime transactedAt,
                                                  BigDecimal amount, String externalRef) {
        if (!hasText(bankAccountLabel)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bankAccountLabel 은 필수입니다.");
        }
        if (transactedAt == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "transactedAt 은 필수입니다.");
        }
        if (amount == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "amount 는 필수입니다.");
        }
        if (!hasText(externalRef)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "externalRef 는 필수입니다.");
        }
        return repository.findByBankAccountLabelAndTransactedAtAndAmountAndExternalRefAndIsDeletedFalse(
                        bankAccountLabel.trim(), transactedAt, amount, externalRef.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "통장 거래를 찾을 수 없습니다: " + bankAccountLabel.trim() + " / " + externalRef.trim()));
    }

    private Map<UUID, String> resolveCashReceiptSlipNos(List<BankTransaction> rows) {
        List<UUID> ids = rows.stream()
                .filter(row -> row.getCashReceiptId() != null)
                .map(BankTransaction::getId)
                .filter(Objects::nonNull)
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return repository.findCashReceiptSlipNos(ids).stream()
                .collect(Collectors.toMap(
                        BankTransactionRepository.CashReceiptSlipProjection::getTransactionId,
                        BankTransactionRepository.CashReceiptSlipProjection::getCashReceiptSlipNo,
                        (left, right) -> left,
                        LinkedHashMap::new));
    }

    private Specification<BankTransaction> bankTransactionSpec(MatchStatus matchStatus, LocalDate from, LocalDate to,
                                                               List<String> accountLabels, List<String> cardLabels) {
        return (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (matchStatus != null) {
                predicates.add(cb.equal(root.get("matchStatus"), matchStatus));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("transactedAt"), from.atStartOfDay()));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.get("transactedAt"), to.plusDays(1).atStartOfDay()));
            }
            if (!accountLabels.isEmpty() || !cardLabels.isEmpty()) {
                // 소스 인식 필터: 계좌 label 은 계좌 소스행에만, 카드 label 은 카드 소스행에만 적용하고,
                // 필터 UI 가 없는 소스(대출/KFTC)는 항상 포함해 부분선택 시 소실되지 않게 한다.
                List<jakarta.persistence.criteria.Predicate> sourceScoped = new ArrayList<>();
                jakarta.persistence.criteria.Predicate accountSource = root.get("source").in(ACCOUNT_SOURCES);
                sourceScoped.add(accountLabels.isEmpty()
                        ? accountSource
                        : cb.and(accountSource, root.get("bankAccountLabel").in(accountLabels)));
                jakarta.persistence.criteria.Predicate cardSource = root.get("source").in(CARD_SOURCES);
                sourceScoped.add(cardLabels.isEmpty()
                        ? cardSource
                        : cb.and(cardSource, root.get("bankAccountLabel").in(cardLabels)));
                sourceScoped.add(cb.not(root.get("source").in(FILTERABLE_SOURCES)));
                predicates.add(cb.or(sourceScoped.toArray(jakarta.persistence.criteria.Predicate[]::new)));
            }
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    private static List<String> normalizeLabels(String singleLabel, List<String> labels) {
        java.util.LinkedHashSet<String> normalized = new java.util.LinkedHashSet<>();
        if (hasText(singleLabel)) {
            normalized.add(singleLabel.trim());
        }
        if (labels != null) {
            for (String label : labels) {
                if (hasText(label)) {
                    normalized.add(label.trim());
                }
            }
        }
        return List.copyOf(normalized);
    }

    private BankTransaction toTransaction(String[] row, ColumnResolver resolver, String bankAccountLabel,
                                          BankTransactionImportMapping mapping) {
        LocalDateTime transactedAt = parseTransactedAt(cell(row, resolver.resolve(mapping.dateColumn())));
        BigDecimal deposit = parseAmount(cell(row, resolver.resolveOptional(mapping.depositColumn())));
        BigDecimal withdrawal = parseAmount(cell(row, resolver.resolveOptional(mapping.withdrawalColumn())));
        if (deposit.signum() > 0 && withdrawal.signum() > 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "입금/출금 금액이 동시에 존재합니다: " + transactedAt);
        }
        if (deposit.signum() <= 0 && withdrawal.signum() <= 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "입금/출금 금액 중 하나는 0보다 커야 합니다: " + transactedAt);
        }

        BankTxnType type = deposit.signum() > 0 ? BankTxnType.DEPOSIT : BankTxnType.WITHDRAWAL;
        BigDecimal amount = type == BankTxnType.DEPOSIT ? deposit : withdrawal;
        BigDecimal balanceAfter = nullIfZero(parseAmount(cell(row, resolver.resolveOptional(mapping.balanceColumn()))));
        String description = cell(row, resolver.resolve(mapping.descriptionColumn()));
        String counterpartyName = cell(row, resolver.resolveOptional(mapping.counterpartyColumn()));
        String counterpartyAccount = cell(row, resolver.resolveOptional(mapping.counterpartyAccountColumn()));
        String explicitRef = cell(row, resolver.resolveOptional(mapping.externalRefColumn()));
        String externalRef = hasText(explicitRef)
                ? explicitRef.trim()
                : generatedExternalRef(bankAccountLabel, transactedAt, type, amount, balanceAfter, description,
                        counterpartyName, counterpartyAccount);

        return BankTransaction.importRow(
                transactedAt,
                type,
                amount,
                balanceAfter,
                description,
                counterpartyName,
                counterpartyAccount,
                bankAccountLabel,
                BankTxnSource.CSV_IMPORT,
                externalRef);
    }

    private boolean isDuplicate(BankTransaction transaction) {
        return repository.existsByBankAccountLabelAndTransactedAtAndAmountAndExternalRefAndIsDeletedFalse(
                transaction.getBankAccountLabel(),
                transaction.getTransactedAt(),
                transaction.getAmount(),
                transaction.getExternalRef());
    }

    private List<String[]> parseCsv(MultipartFile file) {
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 읽기 실패: " + ex.getMessage(), ex);
        }
        if (content.length == 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어 있습니다");
        }
        List<String[]> utf8Rows = parseCsvWithCharset(content, StandardCharsets.UTF_8);
        if (utf8Rows != null) {
            return utf8Rows;
        }
        List<String[]> ms949Rows = parseCsvWithCharset(content, MS949);
        if (ms949Rows != null) {
            return ms949Rows;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 인코딩을 판독할 수 없습니다.");
    }

    private List<String[]> parseCsvWithCharset(byte[] content, Charset charset) {
        try (BOMInputStream bomFree = BOMInputStream.builder()
                .setInputStream(new ByteArrayInputStream(content)).get();
             InputStreamReader isr = new InputStreamReader(bomFree, charset.newDecoder()
                     .onMalformedInput(CodingErrorAction.REPORT)
                     .onUnmappableCharacter(CodingErrorAction.REPORT));
             BufferedReader br = new BufferedReader(isr);
             CSVReader reader = new CSVReader(br)) {
            List<String[]> rows = new ArrayList<>();
            String[] row;
            while ((row = reader.readNext()) != null) {
                rows.add(row);
            }
            return rows;
        } catch (CharacterCodingException ex) {
            return null;
        } catch (IOException | CsvValidationException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    private static LocalDateTime parseTransactedAt(String raw) {
        if (!hasText(raw)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "거래일시 값이 비어 있습니다.");
        }
        String normalized = raw.trim();
        for (DateTimeFormatter formatter : DATE_TIME_FORMATTERS) {
            try {
                return LocalDateTime.parse(normalized, formatter);
            } catch (DateTimeParseException ignored) {
                // next
            }
        }
        for (DateTimeFormatter formatter : DATE_FORMATTERS) {
            try {
                return LocalDate.parse(normalized, formatter).atStartOfDay();
            } catch (DateTimeParseException ignored) {
                // next
            }
        }
        if (normalized.matches("\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\.\\d+")) {
            return LocalDateTime.parse(normalized.replace(' ', 'T'));
        }
        if (normalized.matches("\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}")) {
            return LocalDateTime.of(LocalDate.parse(normalized.substring(0, 10)),
                    LocalTime.parse(normalized.substring(11)));
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT, "거래일시 형식이 올바르지 않습니다: " + raw);
    }

    private static BigDecimal parseAmount(String raw) {
        if (!hasText(raw)) {
            return BigDecimal.ZERO;
        }
        String normalized = raw.trim()
                .replace(",", "")
                .replace("원", "")
                .replace("₩", "")
                .replace(" ", "");
        if (normalized.isBlank() || normalized.equals("-")) {
            return BigDecimal.ZERO;
        }
        boolean negativeByParen = normalized.startsWith("(") && normalized.endsWith(")");
        if (negativeByParen) {
            normalized = "-" + normalized.substring(1, normalized.length() - 1);
        }
        try {
            return new BigDecimal(normalized).abs();
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "금액 형식이 올바르지 않습니다: " + raw, ex);
        }
    }

    private static BigDecimal nullIfZero(BigDecimal value) {
        return value == null || value.signum() == 0 ? null : value;
    }

    private static String generatedExternalRef(String bankAccountLabel, LocalDateTime transactedAt, BankTxnType type,
                                               BigDecimal amount, BigDecimal balanceAfter, String description,
                                               String counterpartyName, String counterpartyAccount) {
        return sha256(String.join("|",
                bankAccountLabel,
                transactedAt.toString(),
                type.name(),
                amount.stripTrailingZeros().toPlainString(),
                balanceAfter == null ? "" : balanceAfter.stripTrailingZeros().toPlainString(),
                valueOrEmpty(description),
                valueOrEmpty(counterpartyName),
                valueOrEmpty(counterpartyAccount)));
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                sb.append(String.format(Locale.ROOT, "%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "externalRef 생성 실패", ex);
        }
    }

    private Map<UUID, PartnerSummary> resolveDisplays(List<BankTransaction> rows) {
        List<UUID> ids = rows.stream()
                .map(BankTransaction::getMatchedPartnerId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(ids);
        if (resolved == null || resolved.isEmpty()) {
            return Map.of();
        }
        return resolved.values().stream()
                .filter(p -> p.partnerId() != null)
                .collect(Collectors.toMap(
                        PartnerSummary::partnerId,
                        Function.identity(),
                        (left, right) -> left,
                        LinkedHashMap::new));
    }

    private static PartnerDisplay displayOf(PartnerSummary partner) {
        if (partner == null) {
            return new PartnerDisplay(null, "", null);
        }
        return new PartnerDisplay(
                hasText(partner.partnerCode()) ? partner.partnerCode().trim() : null,
                digitsOnly(partner.bizNo()),
                hasText(partner.name()) ? partner.name().trim() : null
        );
    }

    private static void requireColumn(String value, String name) {
        if (!hasText(value)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, name + " 은 필수입니다.");
        }
    }

    private static String cell(String[] row, Integer index) {
        if (index == null) {
            return "";
        }
        if (index < 0 || index >= row.length) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "컬럼 인덱스가 CSV 행 범위를 벗어났습니다: " + index);
        }
        String value = row[index];
        return value == null ? "" : value.replace("\t", "").trim();
    }

    private static boolean isAllBlank(String[] row) {
        for (String cell : row) {
            if (hasText(cell)) {
                return false;
            }
        }
        return true;
    }

    private static String valueOrEmpty(String value) {
        return hasText(value) ? value.trim() : "";
    }

    private static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static final class ColumnResolver {
        private final String[] header;
        private final Map<String, Integer> headerIndex;

        private ColumnResolver(String[] header) {
            this.header = header;
            this.headerIndex = new LinkedHashMap<>();
            if (header != null) {
                for (int i = 0; i < header.length; i++) {
                    String key = normalizeHeader(header[i]);
                    if (!key.isBlank()) {
                        headerIndex.putIfAbsent(key, i);
                    }
                }
            }
        }

        private int resolve(String spec) {
            Integer index = resolveOptional(spec);
            if (index == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "컬럼 매핑을 찾을 수 없습니다: " + spec);
            }
            return index;
        }

        private Integer resolveOptional(String spec) {
            if (!hasText(spec)) {
                return null;
            }
            String trimmed = spec.trim();
            if (trimmed.matches("[+-]?\\d+")) {
                int index = parseColumnIndex(trimmed);
                if (header != null && index >= header.length) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "컬럼 인덱스가 헤더 범위를 벗어났습니다: " + trimmed);
                }
                return index;
            }
            if (header == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "헤더명 매핑은 headerRow=true 일 때만 사용할 수 있습니다: " + spec);
            }
            return headerIndex.get(normalizeHeader(trimmed));
        }

        private static int parseColumnIndex(String raw) {
            try {
                int index = Integer.parseInt(raw);
                if (index < 0) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "컬럼 인덱스는 0 이상이어야 합니다: " + raw);
                }
                return index;
            } catch (NumberFormatException ex) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "컬럼 인덱스는 0-based 정수여야 합니다: " + raw, ex);
            }
        }

        private static String normalizeHeader(String value) {
            return value == null ? "" : value.replace("\uFEFF", "").replace(" ", "").trim().toLowerCase(Locale.ROOT);
        }
    }
}
