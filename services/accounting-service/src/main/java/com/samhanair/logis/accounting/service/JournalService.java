package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CreateJournalLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.accounting.web.dto.JournalResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 분개장 service — 신규 / 페이지 조회 / 단건 / post / reverse.
 *
 * <p>라이프사이클 표 (Layer 4 의무, Plan §2):
 * <pre>
 *   create        : (없음) → DRAFT
 *   post          : DRAFT → POSTED (라인 차/대 합계 일치 검증, postedAt/By 기입)
 *   reverse       : POSTED → REVERSED (역분개 신규 Journal 생성 + linkReversal)
 * </pre>
 *
 * <p>POSTED 이후 직접 수정 불가 (Q7 — audit safe).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class JournalService {

    private final JournalRepository journalRepository;
    private final JournalNumberService journalNumberService;
    private final AccountService accountService;
    private final MonthEndCloseService monthEndCloseService;

    /**
     * 분개 신규 생성 (DRAFT). 라인 1개 이상 + accountCode leaf 검증 + 라인별 debit/credit 도메인 가드.
     *
     * <p>마감 가드 (Phase 10 Step 8 — P2-4): {@code journalDate} 가 CLOSED 회계 기간에 속하면
     * {@link ErrorCode#CONFLICT} 로 차단. {@code AccountingPeriodGuard} interceptor 와 동일
     * 의미를 service 레이어에서도 강제 (servlet filter 의존 없이 IT/단위테스트 안전).
     *
     * @param request 헤더 + 라인 묶음
     * @return DRAFT 신규 분개 단건
     * @throws BusinessException(CONFLICT) 마감된 기간 일자 입력
     */
    public JournalDetailResponse create(CreateJournalRequest request) {
        monthEndCloseService.findClosedPeriodCovering(request.journalDate())
                .ifPresent(p -> {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "마감된 회계 기간입니다 — 해당 일자(" + request.journalDate()
                                    + ")는 변경할 수 없습니다");
                });

        String journalNo = journalNumberService.next(request.journalDate());
        Journal journal = Journal.create(journalNo, request.journalDate(), request.description(),
                JournalSourceType.MANUAL, (UUID) null);

        int lineNo = 1;
        for (CreateJournalLineRequest lineReq : request.lines()) {
            accountService.requireLeafAccount(lineReq.accountCode());
            JournalLine line = JournalLine.create(journal, lineNo++, lineReq.accountCode(),
                    lineReq.debitAmount(), lineReq.creditAmount(), lineReq.partnerId(),
                    lineReq.memo());
            journal.addLine(line);
        }

        Journal saved = journalRepository.save(journal);
        return JournalDetailResponse.of(saved);
    }

    /** 페이지 조회 — from/to 일자 범위 + status 필터 (status null 이면 전체). */
    @Transactional(readOnly = true)
    public Page<JournalResponse> list(LocalDate from, LocalDate to, JournalStatus status,
                                      Pageable pageable) {
        return journalRepository.findByDateRangeAndStatus(from, to, status, pageable)
                .map(JournalResponse::of);
    }

    /** 단건 조회 (라인 포함). */
    @Transactional(readOnly = true)
    public JournalDetailResponse getOne(UUID id) {
        Journal journal = findOrThrow(id);
        return JournalDetailResponse.of(journal);
    }

    /**
     * 게시 — DRAFT → POSTED. 도메인의 {@link Journal#post(String)} 호출 (차/대 합계 검증 포함).
     *
     * @param id 분개 UUID
     * @param actorUserId 게시자 user-id (header X-User-Id)
     * @return POSTED 분개 단건
     */
    public JournalDetailResponse post(UUID id, String actorUserId) {
        Journal journal = findOrThrow(id);
        journal.post(actorUserId);
        return JournalDetailResponse.of(journal);
    }

    /**
     * 역분개 — POSTED → REVERSED. 원분개를 REVERSED 마킹한 뒤 차/대 swap 한 신규 Journal 을
     * 같은 일자에 자동 생성하여 POST 까지 수행. 양 분개가 서로 reversedJournalId 로 연결.
     *
     * <p>부수효과 (단일 트랜잭션):
     * <ol>
     *   <li>원분개 status REVERSED + reversedJournalId = 신규 Journal UUID</li>
     *   <li>신규 Journal: 동일 journalDate / description "[역분개] {원 description}" / sourceType MANUAL /
     *       sourceRefId = 원분개 UUID / 라인 차/대 swap / status POSTED</li>
     * </ol>
     *
     * @param id 원분개 UUID
     * @param actorUserId 역분개 게시자 user-id
     * @return 신규 역분개 단건 (원분개 ID 는 reversedJournalId 로 추적)
     */
    public JournalDetailResponse reverse(UUID id, String actorUserId) {
        Journal original = findOrThrow(id);
        // 원분개 상태 검증은 markReversed 안에서.
        String reverseNo = journalNumberService.next(original.getJournalDate());
        String reverseDesc = "[역분개] "
                + (original.getDescription() == null ? original.getJournalNo() : original.getDescription());
        Journal reversal = Journal.create(reverseNo, original.getJournalDate(), reverseDesc,
                JournalSourceType.MANUAL, original.getId());

        int lineNo = 1;
        for (JournalLine origLine : original.getLines()) {
            JournalLine swapped = JournalLine.create(reversal, lineNo++, origLine.getAccountCode(),
                    origLine.getCreditAmount(),  // swap
                    origLine.getDebitAmount(),   // swap
                    origLine.getPartnerId(),
                    "[역분개] " + (origLine.getMemo() == null ? "" : origLine.getMemo()));
            reversal.addLine(swapped);
        }
        reversal.post(actorUserId);
        Journal savedReversal = journalRepository.save(reversal);

        original.markReversed();
        original.linkReversal(savedReversal.getId());

        return JournalDetailResponse.of(savedReversal);
    }

    /**
     * 자동 분개 게시 — 세금계산서 발행/마감 등 service 모듈이 호출. POSTED 상태로 즉시 저장.
     *
     * <p>호출자 책임: 라인은 사전 차/대 일치하도록 구성. accountCode 는 leaf 검증을 호출자가
     * 미리 수행 (또는 본 메서드에서 위임). sourceType / sourceRefId 는 출처 추적용 (SLIP/CLOSING).
     *
     * @param journalDate 분개 일자
     * @param description 적요
     * @param sourceType 출처 (SLIP/CLOSING/MANUAL)
     * @param sourceRefId 출처 참조 (TaxInvoice UUID 등)
     * @param actorUserId 게시자 user-id
     * @param lineSpecs 라인 spec 리스트 (accountCode, debit, credit, partnerId, memo)
     * @return POSTED 신규 Journal entity (ID 부여 완료)
     */
    public Journal postAutoJournal(java.time.LocalDate journalDate, String description,
                                   JournalSourceType sourceType, UUID sourceRefId,
                                   String actorUserId,
                                   java.util.List<AutoJournalLineSpec> lineSpecs) {
        if (lineSpecs == null || lineSpecs.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "자동 분개 라인이 1개 이상 필요합니다");
        }
        String journalNo = journalNumberService.next(journalDate);
        Journal journal = Journal.create(journalNo, journalDate, description, sourceType, sourceRefId);
        int lineNo = 1;
        for (AutoJournalLineSpec spec : lineSpecs) {
            accountService.requireLeafAccount(spec.accountCode());
            JournalLine line = JournalLine.create(journal, lineNo++, spec.accountCode(),
                    spec.debitAmount(), spec.creditAmount(), spec.partnerId(), spec.memo());
            journal.addLine(line);
        }
        journal.post(actorUserId);
        return journalRepository.save(journal);
    }

    /**
     * 자동 역분개 — 원분개를 REVERSED 마킹하고 차/대 swap 한 신규 POSTED Journal 을 자동 생성.
     * 세금계산서 cancel 등 호출. 기존 {@link #reverse} 와 동작 동일하지만 entity 반환.
     */
    public Journal autoReverse(UUID originalJournalId, String actorUserId) {
        Journal original = findOrThrow(originalJournalId);
        String reverseNo = journalNumberService.next(original.getJournalDate());
        String reverseDesc = "[역분개] "
                + (original.getDescription() == null ? original.getJournalNo() : original.getDescription());
        Journal reversal = Journal.create(reverseNo, original.getJournalDate(), reverseDesc,
                original.getSourceType(), original.getId());
        int lineNo = 1;
        for (JournalLine origLine : original.getLines()) {
            JournalLine swapped = JournalLine.create(reversal, lineNo++, origLine.getAccountCode(),
                    origLine.getCreditAmount(),
                    origLine.getDebitAmount(),
                    origLine.getPartnerId(),
                    "[역분개] " + (origLine.getMemo() == null ? "" : origLine.getMemo()));
            reversal.addLine(swapped);
        }
        reversal.post(actorUserId);
        Journal saved = journalRepository.save(reversal);
        original.markReversed();
        original.linkReversal(saved.getId());
        return saved;
    }

    /**
     * 자동 분개 라인 spec — {@link #postAutoJournal} 입력. record 로 immutable.
     */
    public record AutoJournalLineSpec(
            String accountCode,
            java.math.BigDecimal debitAmount,
            java.math.BigDecimal creditAmount,
            UUID partnerId,
            String memo) {}

    private Journal findOrThrow(UUID id) {
        return journalRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 분개입니다: " + id));
    }
}
