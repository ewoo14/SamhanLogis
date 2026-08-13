package com.samhanair.logis.accounting.service;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.KftcDepositRecord;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.PartnerMatchSource;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * KFTC 오픈뱅킹 입금 조회 + 거래처/세금계산서 자동 매칭 + 자동 분개 draft 생성 서비스 (SP-09-4).
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>submitMethod → effectiveMethod 단일 결정 (null/blank 시 "DRY_RUN" fallback) — 단일 source of truth</li>
 *   <li>{@link KftcClient#fetchDeposits} 로 입금 거래 목록 조회 (effectiveMethod 전달)</li>
 *   <li>입금자명으로 {@link PartnerLookupClient#findByPartnerCode} 거래처 매칭 시도</li>
 *   <li>매칭 성공 + 금액 일치 시 {@link TaxInvoiceRepository} 에서 미수금 세금계산서 조회</li>
 *   <li>분개 DRAFT 생성 (차변/대변 계정은 {@link CashReceipt} 기본 입금 계정과 동일)</li>
 *   <li>매칭 실패 건은 {@link DepositMatchStatus#UNMATCHED} 분류</li>
 * </ol>
 *
 * <p>입금 기본 계정 코드는 {@link CashReceipt#DEFAULT_DEBIT_ACCOUNT_CODE},
 * {@link CashReceipt#DEFAULT_CREDIT_ACCOUNT_CODE} 를 단일 source 로 사용한다.
 *
 * <p>계정과목 코드 (project_korean_accounting.md):
 * <ul>
 *   <li>보통예금: 1039 (현금및현금성자산, V101 이카운트 계정과목 통일 target)</li>
 *   <li>외상매출금: 1089 (매출채권, V101 이카운트 계정과목 통일 target)</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 * journalDraftId(UUID) 는 {@link DepositMatchResult} 에만 존재하며 외부 응답 DTO 로 변환 시 제외.
 *
 * <p>SP-D2 동적 권한 검증:
 * 기존 역할 가드에 더해 {@link DynamicPermissionClient} 를 통해
 * auth-service 의 동적 override 권한도 확인한다.
 * override row 미존재 또는 auth-service 장애 시에는 기존 role guard 만 적용.
 * 명시적 canEdit=false (view-only override) 시 403 반환.
 */
@Slf4j
@Service
public class DepositMatchService {

    /** SP-D2 — 입금 매칭 페이지 코드. */
    static final String PAGE_CODE = "accounting.deposit-match";

    private final KftcClient kftcClient;
    private final PartnerLookupClient partnerLookupClient;
    private final DepositorMappingService depositorMappingService;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final JournalRepository journalRepository;
    private final JournalNumberService journalNumberService;
    private final DepositMatchAuditRecorder auditRecorder;
    private final DynamicPermissionClient dynamicPermissionClient;

    /** production Spring context가 사용하는 전체 의존성 생성자. */
    @Autowired
    public DepositMatchService(KftcClient kftcClient, PartnerLookupClient partnerLookupClient,
                               DepositorMappingService depositorMappingService,
                               TaxInvoiceRepository taxInvoiceRepository, JournalRepository journalRepository,
                               JournalNumberService journalNumberService,
                               DepositMatchAuditRecorder auditRecorder,
                               DynamicPermissionClient dynamicPermissionClient) {
        this.kftcClient = kftcClient;
        this.partnerLookupClient = partnerLookupClient;
        this.depositorMappingService = depositorMappingService;
        this.taxInvoiceRepository = taxInvoiceRepository;
        this.journalRepository = journalRepository;
        this.journalNumberService = journalNumberService;
        this.auditRecorder = auditRecorder;
        this.dynamicPermissionClient = dynamicPermissionClient;
    }

    /** 기존 단위 테스트·수동 생성 호출 호환용 생성자. production은 resolver bean을 주입한다. */
    public DepositMatchService(KftcClient kftcClient, PartnerLookupClient partnerLookupClient,
                               TaxInvoiceRepository taxInvoiceRepository, JournalRepository journalRepository,
                               JournalNumberService journalNumberService,
                               DepositMatchAuditRecorder auditRecorder,
                               DynamicPermissionClient dynamicPermissionClient) {
        this(kftcClient, partnerLookupClient, null, taxInvoiceRepository, journalRepository,
                journalNumberService, auditRecorder, dynamicPermissionClient);
    }

    /**
     * 입금 거래 조회 + 자동 매칭 + 분개 draft 생성.
     *
     * <p>from &gt; to 이면 {@code DEPOSIT_DATE_RANGE_INVALID} (422) 반환.
     * accountFinNo 가 blank 이면 {@code INVALID_INPUT} (400) 반환.
     *
     * <p>SP-D2 동적 권한: actorRole not-null 이면 canEdit 검증.
     * override row 없으면 기존 role guard 통과로 충분.
     * canView=true + canEdit=false 이면 명시적 deny → 403.
     *
     * @param from         조회 시작 일자 (필수)
     * @param to           조회 종료 일자 (필수)
     * @param accountFinNo 계좌 금융기관 코드 (필수, blank 불허)
     * @param submitMethod 전송 방식 ("DRY_RUN" | "KFTC", null/blank 이면 "DRY_RUN" fallback — effectiveMethod 단일 계산)
     * @param actorId      실행자 UUID (X-User-Id 헤더에서 파싱)
     * @param actorRole    요청자 role (X-User-Role 헤더) — 동적 권한 검증에 사용
     * @return 단건 매칭 결과 리스트
     * @throws BusinessException(DEPOSIT_DATE_RANGE_INVALID) from > to 시
     * @throws BusinessException(INVALID_INPUT) accountFinNo blank 시
     * @throws BusinessException(KFTC_SUBMIT_FAILED) KFTC 모드 API 오류 시
     * @throws BusinessException(FORBIDDEN) 동적 권한 차단 시
     */
    @Transactional
    public List<DepositMatchResult> fetchAndMatch(LocalDate from, LocalDate to,
                                                   String accountFinNo, String submitMethod,
                                                   UUID actorId, String actorRole) {
        // SP-D2 동적 권한 검증 (기존 role guard 이후 추가 레이어)
        checkEditPermission(actorRole, actorId != null ? actorId.toString() : null);

        // 1. 날짜 범위 유효성 검증
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.DEPOSIT_DATE_RANGE_INVALID,
                    "from(" + from + ")이 to(" + to + ")보다 늦습니다.");
        }
        // 2. accountFinNo blank 검증
        if (accountFinNo == null || accountFinNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "accountFinNo 는 필수입니다.");
        }

        // 3. 유효 전송 방식 단일 결정 — KftcClient 와 audit 모두 동일 값 사용 (단일 source of truth)
        String effectiveMethod = (submitMethod != null && !submitMethod.isBlank())
                ? submitMethod : "DRY_RUN";

        // 4. KFTC 입금 거래 조회 — effectiveMethod 전달로 client 내 이중 계산 방지
        List<KftcDepositRecord> deposits = kftcClient.fetchDeposits(from, to, accountFinNo, effectiveMethod);
        log.info("[SP-09-4] fetchAndMatch — effectiveMethod={} from={} to={} 조회건수={}",
                effectiveMethod, from, to, deposits.size());

        // 5. 건별 매칭 + 분개 draft 생성
        List<DepositMatchResult> results = new ArrayList<>(deposits.size());
        for (KftcDepositRecord deposit : deposits) {
            DepositMatchResult result = matchAndCreateJournal(deposit, actorId);
            results.add(result);
        }

        // 6. audit 기록 — REQUIRES_NEW 별도 트랜잭션
        long matchedCount = results.stream()
                .filter(r -> r.status() == DepositMatchStatus.MATCHED)
                .count();
        try {
            auditRecorder.recordFetchAndMatch(actorId, effectiveMethod,
                    results.size(), (int) matchedCount, (int) (results.size() - matchedCount));
        } catch (Exception e) {
            log.warn("[SP-09-4] audit 기록 실패 — main 트랜잭션에 영향 없음. error={}", e.getMessage());
        }

        return results;
    }

    /**
     * 입금 거래 단건 매칭 처리 + 분개 draft 생성.
     *
     * <p>매칭 전략:
     * <ol>
     *   <li>입금자명을 partnerCode 로 간주하여 {@link PartnerLookupClient#findByPartnerCode} 시도</li>
     *   <li>매칭 성공 시 해당 거래처의 ISSUED 상태 세금계산서 중 금액 일치 건 조회</li>
     *   <li>세금계산서 매칭 성공 시 분개 DRAFT 생성 (차: 보통예금 / 대: 외상매출금)</li>
     *   <li>어느 단계든 실패 시 UNMATCHED 반환</li>
     * </ol>
     *
     * @param deposit 입금 거래 레코드
     * @param actorId 분개 생성 담당자 UUID
     * @return 단건 매칭 결과
     */
    private DepositMatchResult matchAndCreateJournal(KftcDepositRecord deposit, UUID actorId) {
        // 거래처 매칭 시도 (입금자명 → partnerCode)
        DepositorMappingService.MappingResolution mappingResolution = depositorMappingService == null
                ? DepositorMappingService.MappingResolution.none()
                : depositorMappingService.resolveDeposit(
                        deposit.depositorName(), com.samhanair.logis.accounting.domain.BankTxnType.DEPOSIT,
                        com.samhanair.logis.accounting.domain.BankTxnSource.KFTC);
        Optional<PartnerSummary> partnerOpt;
        PartnerMatchSource matchSource = null;
        // #810 R3-CODEX (S1-M1): 조회 일시 장애(UNAVAILABLE)는 "정상 미존재"와 구분해 단건 결과에
        // 보존한다 — 응답의 unavailableSkippedCount 집계 근거. KFTC 경로는 기존 bank_transaction
        // 매칭이라 거래 생성이 없으므로(유실 대상 없음) 매칭만 보류되고 재실행 시 재시도된다.
        boolean lookupUnavailable = false;
        String mappingRawName = mappingResolution.mapping() == null
                ? null : mappingResolution.mapping().getRawName();
        String mappingNormalizedName = mappingResolution.mapping() == null
                ? null : mappingResolution.mapping().getNormalizedName();
        if (mappingResolution.isMatched()) {
            partnerOpt = Optional.of(mappingResolution.partner());
            matchSource = PartnerMatchSource.DEPOSITOR_MAPPING;
        } else if (mappingResolution.isStale()) {
            partnerOpt = Optional.empty();
        } else if (mappingResolution.isUnavailable()) {
            // #810 적대검증 R3 (L2-M1): 조회 일시 장애 행은 배치를 중단하지 않고 UNMATCHED 로
            // 격리한다(행격리 — poison-pill 해소). 정확일치 폴백도 하지 않아 오배정을 막고,
            // UNMATCHED 는 아무것도 저장하지 않으므로 fetch-and-match 재실행 시 재시도된다.
            log.warn("[SP-09-4] 거래처 조회 일시 장애 — depositorName={} 행 UNMATCHED 격리(재시도 대상)",
                    deposit.depositorName());
            partnerOpt = Optional.empty();
            lookupUnavailable = true;
        } else {
            ExactPartnerLookup exact = resolveExactPartnerForCounterparty(deposit.depositorName());
            partnerOpt = exact.partner();
            lookupUnavailable = exact.unavailable();
            if (partnerOpt.isPresent()) {
                matchSource = PartnerMatchSource.PARTNER_CODE_EXACT;
            }
        }

        if (partnerOpt.isEmpty()) {
            log.debug("[SP-09-4] 거래처 미매칭 — depositorName={}", deposit.depositorName());
            return new DepositMatchResult(
                    deposit.depositorName(), deposit.amount(), deposit.transactionDate(),
                    null, null, null, DepositMatchStatus.UNMATCHED,
                    null, mappingRawName, mappingNormalizedName, lookupUnavailable);
        }

        PartnerSummary partner = partnerOpt.get();

        // 세금계산서 매칭 시도 (거래처 + 금액 기준)
        Optional<TaxInvoice> invoiceOpt = findMatchingInvoice(partner.partnerId(), deposit.amount());

        if (invoiceOpt.isEmpty()) {
            log.debug("[SP-09-4] 세금계산서 미매칭 — partnerCode={} amount={}",
                    partner.partnerCode(), deposit.amount());
            return new DepositMatchResult(
                    deposit.depositorName(), deposit.amount(), deposit.transactionDate(),
                    partner.partnerCode(), null, null, DepositMatchStatus.UNMATCHED,
                    matchSource, mappingRawName, mappingNormalizedName);
        }

        TaxInvoice invoice = invoiceOpt.get();

        // 분개 DRAFT 생성 (차: 보통예금 1039 / 대: 외상매출금 1089)
        UUID journalDraftId = createJournalDraft(deposit, partner, invoice, actorId);

        log.info("[SP-09-4] 자동 매칭 성공 — depositorName={} partnerCode={} taxInvoiceNo={}",
                deposit.depositorName(), partner.partnerCode(), invoice.getTaxInvoiceNo());

        return new DepositMatchResult(
                deposit.depositorName(),
                deposit.amount(),
                deposit.transactionDate(),
                partner.partnerCode(),
                invoice.getTaxInvoiceNo(),
                journalDraftId,
                DepositMatchStatus.MATCHED,
                matchSource, mappingRawName, mappingNormalizedName
        );
    }

    /**
     * 거래처 + 금액 기준 세금계산서 매칭 — ISSUED 상태, 공급총액(supplyAmount + vatAmount) 일치.
     *
     * @param partnerId 거래처 UUID
     * @param amount    입금액
     * @return 매칭 세금계산서 (첫 번째 hit, 없으면 empty)
     */
    private Optional<TaxInvoice> findMatchingInvoice(UUID partnerId, BigDecimal amount) {
        if (partnerId == null || amount == null) {
            return Optional.empty();
        }
        // 최신 발행 ISSUED 세금계산서 중 금액 일치 조회 (첫 1건 — 중복 방지)
        var page = taxInvoiceRepository.findByFiltersWithType(
                TaxInvoiceStatus.ISSUED, null,
                null, null, partnerId,
                PageRequest.of(0, 20, Sort.by("supplyDate").descending())
        );
        return page.getContent().stream()
                .filter(inv -> {
                    BigDecimal totalAmount = inv.getSupplyAmount().add(inv.getVatAmount());
                    return totalAmount.compareTo(amount) == 0;
                })
                .findFirst();
    }

    // #810 적대검증 R1 (L4-L1): 호출자 0건 + DEPOSIT/KFTC 하드코딩으로 카드 경로 재사용 함정이던
    // resolvePartnerForCounterparty(public)는 제거했다. 경로별 resolver는 각 서비스가
    // DepositorMappingService.resolveDeposit(txnType/source 인자)을 직접 사용한다.

    /**
     * KFTC 입금자명의 legacy partnerCode 정확일치 폴백.
     *
     * <p>#810 적대검증 R3 (L2-M1): 조회 일시 장애(UNAVAILABLE)는 throw 하지 않고 empty 로
     * 반환해 해당 행만 UNMATCHED 격리한다 — 배치는 계속되고 재실행 시 재시도된다.
     *
     * <p>#810 R3-CODEX (S1-M1): 격리 시 disposition 을 함께 반환해 호출부가 "정상 미존재"와
     * "조회 장애"를 구분·집계할 수 있게 한다.
     */
    private ExactPartnerLookup resolveExactPartnerForCounterparty(String counterpartyName) {
        if (counterpartyName == null || counterpartyName.isBlank()) {
            return new ExactPartnerLookup(Optional.empty(), false);
        }
        PartnerLookupClient.LookupResult result = partnerLookupClient.findByPartnerCodeResult(counterpartyName.trim());
        if (result == null) {
            return new ExactPartnerLookup(partnerLookupClient.findByPartnerCode(counterpartyName.trim())
                    .filter(PartnerSummary::isActiveStatus), false);
        }
        if (result.isUnavailable()) {
            log.warn("[SP-09-4] 거래처 코드 조회 일시 장애 — counterparty={} 행 UNMATCHED 격리(재시도 대상)",
                    counterpartyName.trim());
            return new ExactPartnerLookup(Optional.empty(), true);
        }
        return new ExactPartnerLookup(result.isFound() && result.partner().isActiveStatus()
                ? Optional.of(result.partner()) : Optional.empty(), false);
    }

    /** 정확일치 폴백 결과와 조회 장애 disposition 을 함께 전달하는 내부 모델 — #810 R3-CODEX (S1-M1). */
    private record ExactPartnerLookup(Optional<PartnerSummary> partner, boolean unavailable) {
    }

    /**
     * 분개 DRAFT 생성 — 차변/대변은 입금보고서 기본 계정과 동일하게 사용한다.
     *
     * <p>한국 일반기업회계기준 표준 계정과목:
     * <ul>
     *   <li>차변: {@link CashReceipt#DEFAULT_DEBIT_ACCOUNT_CODE} (입금 금액 debit)</li>
     *   <li>대변: {@link CashReceipt#DEFAULT_CREDIT_ACCOUNT_CODE} (입금 금액 credit)</li>
     * </ul>
     *
     * @param deposit  입금 거래 레코드
     * @param partner  매칭된 거래처
     * @param invoice  매칭된 세금계산서
     * @param actorId  분개 생성 담당자
     * @return 생성된 분개 DRAFT UUID
     */
    private UUID createJournalDraft(KftcDepositRecord deposit, PartnerSummary partner,
                                    TaxInvoice invoice, UUID actorId) {
        String journalNo = journalNumberService.next(deposit.transactionDate());
        String description = "KFTC 입금 매칭 — " + partner.partnerCode()
                + " / 세금계산서 " + invoice.getTaxInvoiceNo();

        Journal journal = Journal.create(
                journalNo,
                deposit.transactionDate(),
                description,
                JournalSourceType.KFTC_DEPOSIT,
                invoice.getId()
        );

        // 차변 라인: 입금보고서 기본 차변 계정
        JournalLine debitLine = JournalLine.create(
                journal, 1, CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE,
                deposit.amount(), BigDecimal.ZERO,
                partner.partnerId(),
                "KFTC 입금 — " + deposit.depositorName()
        );
        journal.addLine(debitLine);

        // 대변 라인: 입금보고서 기본 대변 계정
        JournalLine creditLine = JournalLine.create(
                journal, 2, CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE,
                BigDecimal.ZERO, deposit.amount(),
                partner.partnerId(),
                "외상매출금 회수 — " + invoice.getTaxInvoiceNo()
        );
        journal.addLine(creditLine);

        Journal saved = journalRepository.save(journal);
        return saved.getId();
    }

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D2 동적 EDIT 권한 검증.
     *
     * <p>actorRole null/blank 이면 건너뜀.
     * canEdit=false + canView=true 이면 명시적 deny → 403.
     * canEdit=false + canView=false 이면 override row 없음(fallback) → 통과.
     *
     * @param actorRole   요청자 role
     * @param actorUserId 요청자 user-id (로그용)
     */
    private void checkEditPermission(String actorRole, String actorUserId) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
            if (canView) {
                log.warn("[SP-D2] 동적 권한 차단 (view-only override) — roleCode={} pageCode={} actorUserId={}",
                        actorRole, PAGE_CODE, actorUserId);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 입금 매칭 편집 권한이 차단되었습니다.");
            }
            log.debug("[SP-D2] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={} actorUserId={}",
                    actorRole, PAGE_CODE, actorUserId);
        }
    }
}
