package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.repository.CollectionPlanRepository;
import com.samhanair.logis.accounting.repository.CollectionPlanRepository.CollectionPlanExposureTotal;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountMovement;
import com.samhanair.logis.accounting.repository.NotesReceivableRepository;
import com.samhanair.logis.accounting.repository.NotesReceivableRepository.NoteExposureTotal;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 채권채무 현황 보고서 Service.
 *
 * <p>신규 쓰기 도메인/Flyway 없이 기존 POSTED+REVERSED(보상쌍 상쇄) 분개 라인, 받을어음, 수금계획을
 * 읽기전용으로 집계한다. 분개는 계정+거래처+분개일자 GROUP BY 로 가져온 뒤
 * service 레이어에서 FIFO 상계하여 남은 잔액을 발생월 aging 버킷에 배분한다.
 *
 * <p>JPA 컬렉션 JOIN FETCH 를 사용하지 않고 거래처별 Map merge 로 병합하여
 * 다중 라인 전표의 카르테시안 중복을 피한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReceivablesPayablesService {

    private static final List<String> RECEIVABLE_ACCOUNTS = List.of("1089", "1209");
    private static final List<String> PAYABLE_ACCOUNTS = List.of("2519", "2539");
    private static final List<String> ALL_ACCOUNTS = List.of("1089", "1209", "2519", "2539");

    private static final String UNRESOLVED_PARTNER_CODE = "미등록";
    private static final String UNRESOLVED_PARTNER_NAME = "(미조회)";

    private final JournalLineRepository journalLineRepository;
    private final NotesReceivableRepository notesReceivableRepository;
    private final CollectionPlanRepository collectionPlanRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 채권채무 현황을 조회한다.
     *
     * @param asOfDate 기준일
     * @param direction 채권/채무/전체
     * @return 거래처별 채권채무 현황
     */
    public ReceivablesPayablesResponse find(LocalDate asOfDate, ReceivablesPayablesDirection direction) {
        if (asOfDate == null) {
            throw new IllegalArgumentException("asOfDate 는 필수입니다");
        }
        ReceivablesPayablesDirection safeDirection =
                direction == null ? ReceivablesPayablesDirection.ALL : direction;

        Map<PartnerBucketKey, List<Movement>> movements = loadMovements(asOfDate, safeDirection);
        Map<UUID, ReceivablesPayablesAgingBuckets> receivableBuckets = computeBuckets(movements, true, asOfDate);
        Map<UUID, ReceivablesPayablesAgingBuckets> payableBuckets = computeBuckets(movements, false, asOfDate);
        Map<UUID, NoteTotals> noteTotals = loadNoteTotals(asOfDate);
        Map<UUID, PlanTotals> planTotals = loadPlanTotals();

        LinkedHashSet<UUID> partnerIds = new LinkedHashSet<>();
        partnerIds.addAll(receivableBuckets.keySet());
        partnerIds.addAll(payableBuckets.keySet());
        if (safeDirection != ReceivablesPayablesDirection.PAYABLE) {
            partnerIds.addAll(noteTotals.keySet());
            partnerIds.addAll(planTotals.keySet());
        }
        Map<UUID, PartnerSummary> partners = resolvePartners(partnerIds);

        List<ReceivablesPayablesLine> lines = new ArrayList<>();
        for (UUID partnerId : partnerIds) {
            ReceivablesPayablesAgingBuckets receivable = receivableBuckets.getOrDefault(
                    partnerId, ReceivablesPayablesAgingBuckets.zero());
            ReceivablesPayablesAgingBuckets payable = payableBuckets.getOrDefault(
                    partnerId, ReceivablesPayablesAgingBuckets.zero());

            BigDecimal receivableBalance = includeReceivable(safeDirection) ? receivable.total() : BigDecimal.ZERO;
            BigDecimal payableBalance = includePayable(safeDirection) ? payable.total() : BigDecimal.ZERO;
            NoteTotals note = safeDirection == ReceivablesPayablesDirection.PAYABLE
                    ? NoteTotals.zero()
                    : noteTotals.getOrDefault(partnerId, NoteTotals.zero());
            PlanTotals plan = safeDirection == ReceivablesPayablesDirection.PAYABLE
                    ? PlanTotals.zero()
                    : planTotals.getOrDefault(partnerId, PlanTotals.zero());

            if (receivableBalance.signum() <= 0
                    && payableBalance.signum() <= 0
                    && note.heldAmount().signum() <= 0
                    && plan.totalAmount().signum() <= 0) {
                continue;
            }

            PartnerSummary partner = partners.get(partnerId);
            BigDecimal netBalance = receivableBalance.subtract(payableBalance);
            lines.add(new ReceivablesPayablesLine(
                    bizNoDigits(partner),
                    partnerCode(partner),
                    partnerName(partner),
                    receivableBalance,
                    payableBalance,
                    netBalance,
                    mergeBuckets(receivable, payable, safeDirection),
                    creditLimit(partner),
                    creditUsageRate(partner, receivableBalance),
                    note.heldAmount(),
                    note.maturingSoonAmount(),
                    plan.plannedAmount(),
                    plan.overdueAmount(),
                    plan.totalAmount()
            ));
        }

        lines.sort(Comparator
                .comparing(ReceivablesPayablesLine::netBalance, Comparator.reverseOrder())
                .thenComparing(ReceivablesPayablesLine::partnerName));

        BigDecimal receivableTotal = lines.stream()
                .map(ReceivablesPayablesLine::receivableBalance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal payableTotal = lines.stream()
                .map(ReceivablesPayablesLine::payableBalance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal netTotal = receivableTotal.subtract(payableTotal);

        return new ReceivablesPayablesResponse(
                asOfDate,
                safeDirection,
                receivableTotal,
                payableTotal,
                netTotal,
                lines.size(),
                lines,
                LocalDateTime.now()
        );
    }

    private Map<PartnerBucketKey, List<Movement>> loadMovements(LocalDate asOfDate,
                                                                ReceivablesPayablesDirection direction) {
        List<String> accountCodes = switch (direction) {
            case RECEIVABLE -> RECEIVABLE_ACCOUNTS;
            case PAYABLE -> PAYABLE_ACCOUNTS;
            case ALL -> ALL_ACCOUNTS;
        };
        return journalLineRepository.aggregateAgingMovementsByAccounts(accountCodes, asOfDate).stream()
                .filter(row -> row.getPartnerId() != null)
                .collect(Collectors.groupingBy(
                        row -> new PartnerBucketKey(row.getPartnerId(), isReceivableAccount(row.getAccountCode())),
                        LinkedHashMap::new,
                        Collectors.mapping(this::movementOf, Collectors.toCollection(ArrayList::new))
                ));
    }

    private Movement movementOf(PartnerAccountMovement row) {
        boolean receivable = isReceivableAccount(row.getAccountCode());
        BigDecimal signed = receivable
                ? row.getDebitTotal().subtract(row.getCreditTotal())
                : row.getCreditTotal().subtract(row.getDebitTotal());
        return new Movement(row.getJournalDate(), signed);
    }

    private Map<UUID, ReceivablesPayablesAgingBuckets> computeBuckets(
            Map<PartnerBucketKey, List<Movement>> movements,
            boolean receivable,
            LocalDate asOfDate) {
        return movements.entrySet().stream()
                .filter(entry -> entry.getKey().receivable() == receivable)
                .collect(Collectors.toMap(
                        entry -> entry.getKey().partnerId(),
                        entry -> allocateOpenBuckets(entry.getValue(), asOfDate),
                        this::addBuckets,
                        LinkedHashMap::new
                ));
    }

    /**
     * 미상계 잔액을 달력월(발생월) 기준으로 연령분류한다.
     *
     * <p>경과일 수가 아니라 기준월({@code asOfDate}의 YearMonth) 대비 발생월
     * ({@code journalDate}의 YearMonth) 차이를 사용한다. 예: 2026-05-31 발생분은
     * 기준일이 2026-06-01이면 경과 1일이어도 전월 발생분이므로 1개월 버킷이다.
     */
    private ReceivablesPayablesAgingBuckets allocateOpenBuckets(List<Movement> movements, LocalDate asOfDate) {
        List<Movement> sorted = movements.stream()
                .sorted(Comparator.comparing(Movement::journalDate))
                .toList();
        ArrayDeque<OpenItem> openItems = new ArrayDeque<>();
        BigDecimal unappliedReduction = BigDecimal.ZERO;

        for (Movement movement : sorted) {
            BigDecimal amount = movement.amount();
            if (amount.signum() > 0) {
                if (unappliedReduction.signum() > 0) {
                    BigDecimal applied = amount.min(unappliedReduction);
                    amount = amount.subtract(applied);
                    unappliedReduction = unappliedReduction.subtract(applied);
                }
                if (amount.signum() > 0) {
                    openItems.addLast(new OpenItem(movement.journalDate(), amount));
                }
                continue;
            }

            BigDecimal reduction = amount.abs();
            while (reduction.signum() > 0 && !openItems.isEmpty()) {
                OpenItem first = openItems.removeFirst();
                BigDecimal applied = first.amount().min(reduction);
                BigDecimal remaining = first.amount().subtract(applied);
                reduction = reduction.subtract(applied);
                if (remaining.signum() > 0) {
                    openItems.addFirst(new OpenItem(first.journalDate(), remaining));
                }
            }
            if (reduction.signum() > 0) {
                unappliedReduction = unappliedReduction.add(reduction);
            }
        }

        BigDecimal current = BigDecimal.ZERO;
        BigDecimal oneMonth = BigDecimal.ZERO;
        BigDecimal twoMonths = BigDecimal.ZERO;
        BigDecimal threeOver = BigDecimal.ZERO;
        YearMonth asOfMonth = YearMonth.from(asOfDate);
        for (OpenItem item : openItems) {
            long elapsedMonths = java.time.temporal.ChronoUnit.MONTHS.between(
                    YearMonth.from(item.journalDate()), asOfMonth);
            if (elapsedMonths <= 0) {
                current = current.add(item.amount());
            } else if (elapsedMonths == 1) {
                oneMonth = oneMonth.add(item.amount());
            } else if (elapsedMonths == 2) {
                twoMonths = twoMonths.add(item.amount());
            } else {
                threeOver = threeOver.add(item.amount());
            }
        }
        return new ReceivablesPayablesAgingBuckets(current, oneMonth, twoMonths, threeOver);
    }

    private Map<UUID, NoteTotals> loadNoteTotals(LocalDate asOfDate) {
        LocalDate maturityUntil = asOfDate.plusDays(30);
        return notesReceivableRepository.aggregateOpenExposureByPartner(asOfDate, maturityUntil).stream()
                .filter(row -> row.getPartnerId() != null)
                .collect(Collectors.toMap(
                        NoteExposureTotal::getPartnerId,
                        row -> new NoteTotals(nullToZero(row.getHeldAmount()), nullToZero(row.getMaturingSoonAmount())),
                        this::addNotes,
                        LinkedHashMap::new
                ));
    }

    private Map<UUID, PlanTotals> loadPlanTotals() {
        return collectionPlanRepository.aggregateOpenExposureByPartner().stream()
                .filter(row -> row.getPartnerId() != null)
                .collect(Collectors.toMap(
                        CollectionPlanExposureTotal::getPartnerId,
                        row -> new PlanTotals(nullToZero(row.getPlannedAmount()), nullToZero(row.getOverdueAmount())),
                        this::addPlans,
                        LinkedHashMap::new
                ));
    }

    private Map<UUID, PartnerSummary> resolvePartners(LinkedHashSet<UUID> partnerIds) {
        if (partnerIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved =
                partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(partnerIds));
        return resolved == null ? Map.of() : resolved;
    }

    private ReceivablesPayablesAgingBuckets mergeBuckets(ReceivablesPayablesAgingBuckets receivable,
                                                         ReceivablesPayablesAgingBuckets payable,
                                                         ReceivablesPayablesDirection direction) {
        return switch (direction) {
            case RECEIVABLE -> receivable;
            case PAYABLE -> negate(payable);
            case ALL -> addBuckets(receivable, negate(payable));
        };
    }

    private ReceivablesPayablesAgingBuckets addBuckets(ReceivablesPayablesAgingBuckets left,
                                                       ReceivablesPayablesAgingBuckets right) {
        return new ReceivablesPayablesAgingBuckets(
                left.currentMonth().add(right.currentMonth()),
                left.oneMonthElapsed().add(right.oneMonthElapsed()),
                left.twoMonthsElapsed().add(right.twoMonthsElapsed()),
                left.threeMonthsOver().add(right.threeMonthsOver())
        );
    }

    private ReceivablesPayablesAgingBuckets negate(ReceivablesPayablesAgingBuckets buckets) {
        return new ReceivablesPayablesAgingBuckets(
                buckets.currentMonth().negate(),
                buckets.oneMonthElapsed().negate(),
                buckets.twoMonthsElapsed().negate(),
                buckets.threeMonthsOver().negate()
        );
    }

    private NoteTotals addNotes(NoteTotals left, NoteTotals right) {
        return new NoteTotals(
                left.heldAmount().add(right.heldAmount()),
                left.maturingSoonAmount().add(right.maturingSoonAmount())
        );
    }

    private PlanTotals addPlans(PlanTotals left, PlanTotals right) {
        return new PlanTotals(
                left.plannedAmount().add(right.plannedAmount()),
                left.overdueAmount().add(right.overdueAmount())
        );
    }

    private boolean includeReceivable(ReceivablesPayablesDirection direction) {
        return direction == ReceivablesPayablesDirection.RECEIVABLE
                || direction == ReceivablesPayablesDirection.ALL;
    }

    private boolean includePayable(ReceivablesPayablesDirection direction) {
        return direction == ReceivablesPayablesDirection.PAYABLE
                || direction == ReceivablesPayablesDirection.ALL;
    }

    private boolean isReceivableAccount(String accountCode) {
        return RECEIVABLE_ACCOUNTS.contains(accountCode);
    }

    private BigDecimal nullToZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String bizNoDigits(PartnerSummary summary) {
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    private String partnerCode(PartnerSummary summary) {
        return summary != null && summary.partnerCode() != null && !summary.partnerCode().isBlank()
                ? summary.partnerCode()
                : UNRESOLVED_PARTNER_CODE;
    }

    private String partnerName(PartnerSummary summary) {
        return summary != null && summary.name() != null && !summary.name().isBlank()
                ? summary.name()
                : UNRESOLVED_PARTNER_NAME;
    }

    private BigDecimal creditLimit(PartnerSummary summary) {
        return summary == null ? null : summary.creditLimit();
    }

    private BigDecimal creditUsageRate(PartnerSummary summary, BigDecimal receivableBalance) {
        BigDecimal limit = creditLimit(summary);
        if (limit == null || limit.signum() <= 0) {
            return null;
        }
        return receivableBalance
                .multiply(new BigDecimal("100"))
                .divide(limit, 2, RoundingMode.HALF_UP);
    }

    private record PartnerBucketKey(UUID partnerId, boolean receivable) {
    }

    private record Movement(LocalDate journalDate, BigDecimal amount) {
        private Movement {
            Objects.requireNonNull(journalDate, "journalDate");
            amount = amount == null ? BigDecimal.ZERO : amount;
        }
    }

    private record OpenItem(LocalDate journalDate, BigDecimal amount) {
    }

    private record NoteTotals(BigDecimal heldAmount, BigDecimal maturingSoonAmount) {
        static NoteTotals zero() {
            return new NoteTotals(BigDecimal.ZERO, BigDecimal.ZERO);
        }
    }

    private record PlanTotals(BigDecimal plannedAmount, BigDecimal overdueAmount) {
        static PlanTotals zero() {
            return new PlanTotals(BigDecimal.ZERO, BigDecimal.ZERO);
        }

        BigDecimal totalAmount() {
            return plannedAmount.add(overdueAmount);
        }
    }
}
