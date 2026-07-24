package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.JournalRepository.JournalPartnerRow;
import com.samhanair.logis.accounting.repository.JournalRepository.JournalStatusPartnerReportRow;
import com.samhanair.logis.accounting.repository.JournalRepository.JournalStatusReportRow;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표현황 보고서 Service.
 *
 * <p>상태 필터 기준 분개를 전표 단위로 조회하고 sourceType 다중 필터, 거래처코드 필터,
 * grouping(일자/출처/거래처)을 적용한다. 거래처 UUID 는 {@link PartnerLookupClient} 로
 * 내부 해석한 뒤 필터와 lookup 에만 사용하고 응답에는 거래처명만 포함한다.
 *
 * <p>PARTNER grouping 은 복합전표를 대표거래처로 몰지 않고 라인 거래처별로 fan-out 한다.
 * 즉 한 전표가 A/B 거래처 라인을 동시에 가지면 A 그룹에는 A 라인의 차/대 부분합만,
 * B 그룹에는 B 라인의 차/대 부분합만 등재한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JournalStatusReportService {

    private static final String ETC_PARTNER_NAME = "기타";
    private static final String UNRESOLVED_PARTNER_NAME = "(미조회)";
    private static final String MULTI_PARTNER_SEPARATOR = " / ";

    private final JournalRepository journalRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 전표현황 조회.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param sourceTypes 출처 필터. null/empty 면 전체
     * @param partnerCode 거래처코드 필터. null/blank 이면 전체
     * @param groupBy grouping 기준
     * @param status 상태 필터. null 이면 POSTED
     * @return 전표현황 그룹 응답
     */
    public JournalStatusReportResponse findStatus(LocalDate from,
                                                  LocalDate to,
                                                  Set<JournalSourceType> sourceTypes,
                                                  String partnerCode,
                                                  JournalStatusGroupBy groupBy,
                                                  JournalStatus status) {
        validateRange(from, to);
        JournalStatus resolvedStatus = status == null ? JournalStatus.POSTED : status;
        JournalStatusGroupBy resolvedGroupBy = groupBy == null ? JournalStatusGroupBy.DATE : groupBy;
        EnumSet<JournalSourceType> resolvedSourceTypes = sourceTypes == null || sourceTypes.isEmpty()
                ? EnumSet.allOf(JournalSourceType.class)
                : EnumSet.copyOf(sourceTypes);
        boolean allSourceTypes = resolvedSourceTypes.size() == JournalSourceType.values().length;
        UUID partnerId = resolvePartnerId(partnerCode);
        if (hasText(partnerCode) && partnerId == null) {
            return emptyResponse(from, to, resolvedStatus, resolvedSourceTypes, resolvedGroupBy);
        }

        if (resolvedGroupBy == JournalStatusGroupBy.PARTNER) {
            return findStatusByPartnerGroup(
                    from, to, resolvedStatus, resolvedSourceTypes, allSourceTypes, partnerId, resolvedGroupBy);
        }

        List<JournalStatusReportRow> rows = journalRepository.findJournalStatusReportRows(
                from, to, resolvedStatus, resolvedSourceTypes, allSourceTypes, partnerId);
        Map<UUID, List<UUID>> partnerIdsByJournal = partnerIdsByJournal(rows);
        Map<UUID, PartnerSummary> partners = resolvePartners(partnerIdsByJournal);

        List<JournalStatusReportResponse.Line> lines = rows.stream()
                .map(row -> toLine(row, partnerIdsByJournal.getOrDefault(row.getJournalId(), List.of()), partners))
                .toList();

        LinkedHashMap<GroupKey, List<JournalStatusReportResponse.Line>> grouped = new LinkedHashMap<>();
        for (JournalStatusReportResponse.Line line : lines) {
            GroupKey key = groupKey(line, resolvedGroupBy);
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(line);
        }

        List<JournalStatusReportResponse.Group> groups = grouped.entrySet().stream()
                .map(entry -> new JournalStatusReportResponse.Group(
                        entry.getKey().key(),
                        entry.getKey().label(),
                        entry.getValue(),
                        summarize(entry.getValue())))
                .toList();

        JournalStatusReportResponse.Summary total = groups.stream()
                .map(JournalStatusReportResponse.Group::subtotal)
                .reduce(JournalStatusReportResponse.Summary.zero(), JournalStatusReportResponse.Summary::plus);

        return new JournalStatusReportResponse(
                from,
                to,
                resolvedStatus,
                resolvedSourceTypes.stream().sorted(Comparator.comparing(Enum::name)).toList(),
                resolvedGroupBy,
                groups,
                total,
                LocalDateTime.now()
        );
    }

    /** 거래유형 한글 라벨. */
    public static String sourceTypeDisplayName(JournalSourceType sourceType) {
        return switch (sourceType) {
            case SLIP -> "전표";
            case MANUAL -> "수기";
            case CLOSING -> "결산";
            case KFTC_DEPOSIT -> "계좌입금";
            case CASH_DISBURSEMENT -> "지출결의서";
            case CASH_RECEIPT -> "입금보고서";
        };
    }

    private JournalStatusReportResponse findStatusByPartnerGroup(LocalDate from,
                                                                 LocalDate to,
                                                                 JournalStatus status,
                                                                 EnumSet<JournalSourceType> sourceTypes,
                                                                 boolean allSourceTypes,
                                                                 UUID partnerId,
                                                                 JournalStatusGroupBy groupBy) {
        List<JournalStatusPartnerReportRow> rows = journalRepository.findJournalStatusPartnerReportRows(
                from, to, status, sourceTypes, allSourceTypes, partnerId);
        Map<UUID, PartnerSummary> partners = resolvePartnersFromPartnerRows(rows);
        List<JournalStatusReportResponse.Line> lines = rows.stream()
                .map(row -> toPartnerLine(row, partners))
                .toList();

        LinkedHashMap<GroupKey, List<JournalStatusReportResponse.Line>> grouped = new LinkedHashMap<>();
        for (JournalStatusReportResponse.Line line : lines) {
            GroupKey key = groupKey(line, groupBy);
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(line);
        }

        List<JournalStatusReportResponse.Group> groups = grouped.entrySet().stream()
                .map(entry -> new JournalStatusReportResponse.Group(
                        entry.getKey().key(),
                        entry.getKey().label(),
                        entry.getValue(),
                        summarize(entry.getValue())))
                .toList();

        JournalStatusReportResponse.Summary total = groups.stream()
                .map(JournalStatusReportResponse.Group::subtotal)
                .reduce(JournalStatusReportResponse.Summary.zero(), JournalStatusReportResponse.Summary::plus);

        return new JournalStatusReportResponse(
                from,
                to,
                status,
                sourceTypes.stream().sorted(Comparator.comparing(Enum::name)).toList(),
                groupBy,
                groups,
                total,
                LocalDateTime.now()
        );
    }

    private UUID resolvePartnerId(String partnerCode) {
        if (!hasText(partnerCode)) {
            return null;
        }
        PartnerSummary partner = PartnerLookupSupport.foundOrNull(
                PartnerLookupSupport.byCode(partnerLookupClient, partnerCode.trim()));
        return partner == null ? null : partner.partnerId();
    }

    private JournalStatusReportResponse emptyResponse(LocalDate from,
                                                      LocalDate to,
                                                      JournalStatus status,
                                                      EnumSet<JournalSourceType> sourceTypes,
                                                      JournalStatusGroupBy groupBy) {
        return new JournalStatusReportResponse(
                from,
                to,
                status,
                sourceTypes.stream().sorted(Comparator.comparing(Enum::name)).toList(),
                groupBy,
                List.of(),
                JournalStatusReportResponse.Summary.zero(),
                LocalDateTime.now()
        );
    }

    private Map<UUID, List<UUID>> partnerIdsByJournal(List<JournalStatusReportRow> rows) {
        if (rows.isEmpty()) {
            return Map.of();
        }
        List<UUID> journalIds = rows.stream()
                .map(JournalStatusReportRow::getJournalId)
                .toList();
        List<JournalPartnerRow> partnerRows = journalRepository.findPartnerRowsByJournalIds(journalIds);
        Map<UUID, List<UUID>> map = new LinkedHashMap<>();
        for (JournalPartnerRow row : partnerRows) {
            map.computeIfAbsent(row.getJournalId(), ignored -> new ArrayList<>())
                    .add(row.getPartnerId());
        }
        return map;
    }

    private Map<UUID, PartnerSummary> resolvePartners(Map<UUID, List<UUID>> partnerIdsByJournal) {
        LinkedHashSet<UUID> ids = partnerIdsByJournal.values().stream()
                .flatMap(List::stream)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return Map.of();
        }
        return safePartnerMap(partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(ids)));
    }

    private Map<UUID, PartnerSummary> resolvePartnersFromPartnerRows(List<JournalStatusPartnerReportRow> rows) {
        LinkedHashSet<UUID> ids = rows.stream()
                .map(JournalStatusPartnerReportRow::getPartnerId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return Map.of();
        }
        return safePartnerMap(partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(ids)));
    }

    private Map<UUID, PartnerSummary> safePartnerMap(Map<UUID, PartnerSummary> resolved) {
        if (resolved == null || resolved.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> partners = new LinkedHashMap<>();
        resolved.forEach((id, summary) -> {
            if (id != null && summary != null) {
                partners.put(id, summary);
            }
        });
        return partners;
    }

    private JournalStatusReportResponse.Line toLine(JournalStatusReportRow row,
                                                    List<UUID> partnerIds,
                                                    Map<UUID, PartnerSummary> partners) {
        return new JournalStatusReportResponse.Line(
                row.getJournalNo(),
                row.getJournalDate(),
                row.getSourceType(),
                sourceTypeDisplayName(row.getSourceType()),
                partnerBizNoDigits(partnerIds, partners),
                partnerDisplayName(partnerIds, partners),
                row.getDescription(),
                row.getTotalDebit(),
                row.getTotalCredit()
        );
    }

    private JournalStatusReportResponse.Line toPartnerLine(JournalStatusPartnerReportRow row,
                                                           Map<UUID, PartnerSummary> partners) {
        return new JournalStatusReportResponse.Line(
                row.getJournalNo(),
                row.getJournalDate(),
                row.getSourceType(),
                sourceTypeDisplayName(row.getSourceType()),
                partnerBizNoDigits(row.getPartnerId(), partners),
                partnerDisplayName(row.getPartnerId(), partners),
                row.getDescription(),
                row.getTotalDebit(),
                row.getTotalCredit()
        );
    }

    private String partnerDisplayName(List<UUID> partnerIds, Map<UUID, PartnerSummary> partners) {
        if (partnerIds == null || partnerIds.isEmpty()) {
            return ETC_PARTNER_NAME;
        }
        return sortedPartnerIds(partnerIds, partners).stream()
                .map(id -> {
                    PartnerSummary summary = partners.get(id);
                    String name = summary == null ? null : summary.name();
                    return name == null || name.isBlank() ? UNRESOLVED_PARTNER_NAME : name;
                })
                .collect(Collectors.joining(MULTI_PARTNER_SEPARATOR));
    }

    private String partnerDisplayName(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        if (partnerId == null) {
            return ETC_PARTNER_NAME;
        }
        PartnerSummary summary = partners.get(partnerId);
        String name = summary == null ? null : summary.name();
        return name == null || name.isBlank() ? UNRESOLVED_PARTNER_NAME : name;
    }

    private String partnerBizNoDigits(List<UUID> partnerIds, Map<UUID, PartnerSummary> partners) {
        if (partnerIds == null || partnerIds.isEmpty()) {
            return "";
        }
        return sortedPartnerIds(partnerIds, partners).stream()
                .map(id -> partnerBizNoDigits(id, partners))
                .filter(value -> !value.isBlank())
                .collect(Collectors.joining(MULTI_PARTNER_SEPARATOR));
    }

    private List<UUID> sortedPartnerIds(List<UUID> partnerIds, Map<UUID, PartnerSummary> partners) {
        return partnerIds.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new))
                .stream()
                .sorted(Comparator
                        .comparing((UUID id) -> partnerSortName(id, partners))
                        .thenComparing(id -> partnerSortCode(id, partners))
                        .thenComparing(UUID::toString))
                .toList();
    }

    private String partnerSortName(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        PartnerSummary summary = partners.get(partnerId);
        String name = summary == null ? null : summary.name();
        return name == null || name.isBlank() ? UNRESOLVED_PARTNER_NAME : name;
    }

    private String partnerSortCode(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        PartnerSummary summary = partners.get(partnerId);
        String partnerCode = summary == null ? null : summary.partnerCode();
        return partnerCode == null ? "" : partnerCode;
    }

    private String partnerBizNoDigits(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        if (partnerId == null) {
            return "";
        }
        PartnerSummary summary = partners.get(partnerId);
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    private GroupKey groupKey(JournalStatusReportResponse.Line line, JournalStatusGroupBy groupBy) {
        return switch (groupBy) {
            case DATE -> new GroupKey(line.journalDate().toString(), line.journalDate().toString());
            case SOURCE_TYPE -> new GroupKey(line.sourceType().name(), line.sourceTypeDisplayName());
            case PARTNER -> new GroupKey(line.partnerName(), line.partnerName());
        };
    }

    private JournalStatusReportResponse.Summary summarize(List<JournalStatusReportResponse.Line> lines) {
        JournalStatusReportResponse.Summary summary = JournalStatusReportResponse.Summary.zero();
        for (JournalStatusReportResponse.Line line : lines) {
            summary = summary.plus(line);
        }
        return summary;
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 날짜는 필수입니다");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("from 은 to 보다 늦을 수 없습니다");
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record GroupKey(String key, String label) {
    }
}
