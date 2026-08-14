package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.CollectionPlan;
import com.samhanair.logis.accounting.domain.CollectionPlanNumberSequence;
import com.samhanair.logis.accounting.domain.NotesReceivable;
import com.samhanair.logis.accounting.domain.PlanBasis;
import com.samhanair.logis.accounting.domain.PlanStatus;
import com.samhanair.logis.accounting.repository.CollectionPlanNumberSequenceRepository;
import com.samhanair.logis.accounting.repository.CollectionPlanRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.repository.NotesReceivableRepository;
import com.samhanair.logis.accounting.web.dto.CollectionPlanForecastResponse;
import com.samhanair.logis.accounting.web.dto.CollectionPlanForecastResponse.MonthlyBucket;
import com.samhanair.logis.accounting.web.dto.CollectionPlanResponse;
import com.samhanair.logis.accounting.web.dto.CollectionPlanResponse.PartnerDisplay;
import com.samhanair.logis.accounting.web.dto.CollectionPlanSuggestionResponse;
import com.samhanair.logis.accounting.web.dto.CreateCollectionPlanRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 수금계획 CRUD/제안/예측 서비스.
 *
 * <p>쓰기 요청은 partnerCode/bizNo/partnerName 중 하나로 거래처를 resolve 한 뒤 내부 partnerId 만
 * 저장한다. 응답은 PartnerLookupClient 로 표시 식별자만 채워 UUID 노출을 차단한다.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CollectionPlanService {

    private static final String ACCOUNT_RECEIVABLE = "1089";
    private static final DateTimeFormatter PLAN_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    private static final List<PlanStatus> OPEN_STATUSES = List.of(PlanStatus.PLANNED, PlanStatus.OVERDUE);

    private final CollectionPlanRepository repository;
    private final CollectionPlanNumberSequenceRepository sequenceRepository;
    private final NotesReceivableRepository notesReceivableRepository;
    private final JournalLineRepository journalLineRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 수금계획을 등록한다.
     *
     * @param request 등록 요청
     * @return 등록된 수금계획 응답
     */
    public CollectionPlanResponse register(CreateCollectionPlanRequest request) {
        PartnerSummary partner = resolvePartner(
                request.partnerCode(), request.bizNo(), request.partnerName());
        String sourceReference = normalizeSourceReference(request.sourceReference());
        rejectDuplicateSource(partner.partnerId(), request.basis(), sourceReference);
        CollectionPlan plan = CollectionPlan.register(
                nextPlanNo(request.plannedDate()),
                partner.partnerId(),
                request.plannedDate(),
                request.plannedAmount(),
                request.basis(),
                request.memo(),
                sourceReference
        );
        CollectionPlan saved = repository.save(plan);
        return CollectionPlanResponse.of(saved, displayOf(partner));
    }

    /**
     * 수금계획 목록을 조회한다. 기본 정렬은 예정 수금일 오름차순이다.
     *
     * @param status 상태 필터
     * @param partnerCode 거래처 관리코드 필터
     * @param bizNo 거래처코드(사업자번호) 필터
     * @param partnerName 거래처명 필터
     * @return 수금계획 목록
     */
    @Transactional(readOnly = true)
    public List<CollectionPlanResponse> list(PlanStatus status, String partnerCode, String bizNo,
                                             String partnerName) {
        PartnerSummary filterPartner = hasText(partnerCode) || hasText(bizNo) || hasText(partnerName)
                ? resolvePartner(partnerCode, bizNo, partnerName)
                : null;
        List<CollectionPlan> plans = repository.search(status,
                filterPartner == null ? null : filterPartner.partnerId());
        Map<UUID, PartnerSummary> partners = resolveDisplays(plans);
        return plans.stream()
                .map(plan -> CollectionPlanResponse.of(plan,
                        displayOf(partners.get(plan.getPartnerId()))))
                .toList();
    }

    /**
     * 수금계획 상태를 전이한다.
     *
     * @param planNo 업무 식별자
     * @param status 목표 상태
     * @return 갱신된 수금계획 응답
     */
    public CollectionPlanResponse transition(String planNo, PlanStatus status) {
        CollectionPlan plan = findByPlanNo(planNo);
        if (status == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "status 는 필수입니다.");
        }
        switch (status) {
            case PLANNED -> throw new BusinessException(ErrorCode.CONFLICT,
                    PlanStatus.PLANNED.getDisplayName() + " 상태는 등록 시에만 지정할 수 있습니다.");
            case COLLECTED -> plan.markCollected();
            case OVERDUE -> plan.markOverdue();
        }
        CollectionPlan saved = repository.save(plan);
        PartnerSummary partner = partnerLookupClient.findByPartnerId(saved.getPartnerId()).orElse(null);
        return CollectionPlanResponse.of(saved, displayOf(partner));
    }

    /**
     * 미수 잔액과 받을어음 만기를 기반으로 수금계획 후보를 만든다.
     *
     * @param partnerCode 거래처 관리코드
     * @return 자동 제안 목록
     */
    @Transactional(readOnly = true)
    public List<CollectionPlanSuggestionResponse> suggestions(String partnerCode) {
        PartnerSummary partner = resolvePartner(partnerCode, null, null);
        LocalDate today = LocalDate.now();
        PartnerDisplay display = displayOf(partner);
        List<CollectionPlanSuggestionResponse> suggestions = new ArrayList<>();

        receivableBalance(partner.partnerId(), today)
                .filter(amount -> amount.signum() > 0)
                .ifPresent(amount -> suggestions.add(new CollectionPlanSuggestionResponse(
                        display.partnerCode(),
                        display.bizNo(),
                        display.partnerName(),
                        today,
                        amount,
                        PlanBasis.RECEIVABLE_BALANCE,
                        ACCOUNT_RECEIVABLE,
                        "외상매출금 잔액 기준 자동 제안"
                )));

        for (NotesReceivable note : notesReceivableRepository
                .findCollectionSuggestionCandidates(partner.partnerId())) {
            LocalDate plannedDate = note.getMaturityDate().isBefore(today) ? today : note.getMaturityDate();
            suggestions.add(new CollectionPlanSuggestionResponse(
                    display.partnerCode(),
                    display.bizNo(),
                    display.partnerName(),
                    plannedDate,
                    note.getAmount(),
                    PlanBasis.NOTE_MATURITY,
                    note.getNoteNo(),
                    "받을어음 만기 기준 자동 제안"
            ));
        }

        suggestions.sort(Comparator
                .comparing(CollectionPlanSuggestionResponse::plannedDate)
                .thenComparing(CollectionPlanSuggestionResponse::basis)
                .thenComparing(s -> valueOrDefault(s.sourceReference(), "")));
        return suggestions;
    }

    /**
     * 예정 수금일 기준 월별 수금 예상액을 집계한다.
     *
     * <p>수금완료(COLLECTED)는 현금흐름 예측에서 제외하고 PLANNED/OVERDUE 만 합산한다.
     *
     * @param from 집계 시작일
     * @param to 집계 종료일
     * @return 월 버킷별 예상 수금액
     */
    @Transactional(readOnly = true)
    public CollectionPlanForecastResponse forecast(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from, to 는 필수입니다.");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "to 는 from 이후여야 합니다.");
        }

        Map<YearMonth, BigDecimal> buckets = new LinkedHashMap<>();
        YearMonth cursor = YearMonth.from(from);
        YearMonth end = YearMonth.from(to);
        while (!cursor.isAfter(end)) {
            buckets.put(cursor, BigDecimal.ZERO);
            cursor = cursor.plusMonths(1);
        }

        for (CollectionPlan plan : repository.findOpenForecastRows(from, to)) {
            YearMonth month = YearMonth.from(plan.getPlannedDate());
            buckets.computeIfPresent(month, (key, amount) -> amount.add(plan.getPlannedAmount()));
        }

        List<MonthlyBucket> months = buckets.entrySet().stream()
                .map(entry -> new MonthlyBucket(entry.getKey().toString(), entry.getValue()))
                .toList();
        BigDecimal total = months.stream()
                .map(MonthlyBucket::plannedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CollectionPlanForecastResponse(from, to, total, months);
    }

    private CollectionPlan findByPlanNo(String planNo) {
        if (!hasText(planNo)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "planNo 는 필수입니다.");
        }
        return repository.findByPlanNoAndIsDeletedFalse(planNo.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수금계획을 찾을 수 없습니다: " + planNo));
    }

    private void rejectDuplicateSource(UUID partnerId, PlanBasis basis, String sourceReference) {
        if (!hasText(sourceReference)) {
            return;
        }
        PlanBasis normalizedBasis = basis == null ? PlanBasis.MANUAL : basis;
        if (repository.existsByPartnerIdAndBasisAndSourceReferenceAndStatusInAndIsDeletedFalse(
                partnerId, normalizedBasis, sourceReference, OPEN_STATUSES)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 등록된 자동제안 출처입니다: " + sourceReference);
        }
    }

    private static String normalizeSourceReference(String sourceReference) {
        return hasText(sourceReference) ? sourceReference.trim() : null;
    }

    private java.util.Optional<BigDecimal> receivableBalance(UUID partnerId, LocalDate asOfDate) {
        return journalLineRepository.aggregateAgingByAccount(ACCOUNT_RECEIVABLE, asOfDate)
                .stream()
                .filter(row -> partnerId.equals(row.getPartnerId()))
                .findFirst()
                .map(row -> row.getDebitTotal().subtract(row.getCreditTotal()));
    }

    private String nextPlanNo(LocalDate plannedDate) {
        LocalDate planDate = plannedDate == null ? LocalDate.now() : plannedDate;
        CollectionPlanNumberSequence sequence = loadOrCreateLockedSequence(planDate);
        return planDate.format(PLAN_NO_DATE) + "-" + sequence.next();
    }

    private CollectionPlanNumberSequence loadOrCreateLockedSequence(LocalDate plannedDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), plannedDate);
        return sequenceRepository.findLockedByPlannedDate(plannedDate)
                .orElseThrow(() -> new IllegalStateException("수금계획 번호 시퀀스 생성 실패"));
    }

    private PartnerSummary resolvePartner(String partnerCode, String bizNo, String partnerName) {
        if (hasText(partnerCode)) {
            PartnerSummary partner = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode.trim()),
                    "거래처코드로 거래처를 찾을 수 없습니다: " + partnerCode);
            if (partner.partnerId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                        "거래처코드 조회 결과에 내부 거래처 ID가 없습니다: " + partnerCode);
            }
            return partner;
        }
        if (hasText(bizNo)) {
            return resolveByDirectorySingle(bizNo.trim(), "사업자번호");
        }
        if (hasText(partnerName)) {
            PartnerSummary partner = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byName(partnerLookupClient, partnerName.trim()),
                    "거래처명으로 거래처를 찾을 수 없습니다: " + partnerName);
            if (partner.partnerId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                        "거래처명 조회 결과에 내부 거래처 ID가 없습니다: " + partnerName);
            }
            return partner;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "partnerCode, bizNo, partnerName 중 하나는 필수입니다.");
    }

    private PartnerSummary resolveByDirectorySingle(String query, String label) {
        List<PartnerSummary> matches = PartnerLookupSupport.availableDirectory(
                PartnerLookupSupport.directory(partnerLookupClient, query, 2));
        if (matches.isEmpty()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + "로 거래처를 찾을 수 없습니다: " + query);
        }
        if (matches.size() > 1) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + " 조회 결과가 2건 이상입니다. 거래처코드로 다시 선택하세요: " + query);
        }
        PartnerSummary partner = matches.get(0);
        if (partner.partnerId() == null) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + " 조회 결과에 내부 거래처 ID가 없습니다: " + query);
        }
        return partner;
    }

    private Map<UUID, PartnerSummary> resolveDisplays(List<CollectionPlan> plans) {
        List<UUID> ids = plans.stream()
                .map(CollectionPlan::getPartnerId)
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
            return new PartnerDisplay("미등록", "", "(미조회)");
        }
        return new PartnerDisplay(
                valueOrDefault(partner.partnerCode(), "미등록"),
                digitsOnly(partner.bizNo()),
                valueOrDefault(partner.name(), "(미조회)")
        );
    }

    private static String valueOrDefault(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
