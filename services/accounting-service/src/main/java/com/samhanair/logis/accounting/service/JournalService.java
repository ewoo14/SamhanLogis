package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CreateJournalLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.accounting.web.dto.JournalResponse;
import com.samhanair.logis.accounting.web.dto.UpdateJournalRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.OptimisticLockException;
import java.util.ArrayList;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.dao.OptimisticLockingFailureException;
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

    private static final EnumSet<JournalStatus> COLLAB_LOCKED = EnumSet.of(JournalStatus.REVERSED);
    private static final Pattern LINE_MEMO_PATH = Pattern.compile("^line\\.(\\d+)\\.memo$");
    private static final String APPROVAL_DOCUMENT_TYPE = "ACCOUNTING_JOURNAL";
    private static final String APPROVAL_ACTION_KEY = "JOURNAL_POST";

    private final JournalRepository journalRepository;
    private final JournalNumberService journalNumberService;
    private final AccountService accountService;
    private final MonthEndCloseService monthEndCloseService;
    private final ApprovalLineAuthorizeClient approvalLineAuthorizeClient;

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
     * DRAFT 분개의 헤더와 라인을 전체 교체한다.
     *
     * <p>{@code expectedVersion} 은 Journal 의 {@code @Version} 값과 비교한다. POSTED/REVERSED
     * 분개는 감사 안전 원칙에 따라 수정하지 않고 409 로 차단한다. 차/대변 합계 일치 여부는
     * 게시({@link #post(UUID, String)}) 시점에만 검증하므로 DRAFT 임시저장은 불균형을 허용한다.
     *
     * <p>마감 가드 (full-form coedit DRAFT PUT 결함 수정): {@link #create(CreateJournalRequest)}
     * 와 동일하게 {@code journalDate} 가 CLOSED 회계 기간에 속하면 차단한다.
     *
     * <p>기존 라인은 {@link Journal#clearLinesForReplacement(String)} 이 물리 삭제 대신
     * markDeleted 처리하므로, 수정 이력은 감사 목적으로 DB 에 보존되고 조회에서만 제외된다.
     *
     * @param id 분개 UUID
     * @param request 수정 요청
     * @param actorUserId 처리자 user-id (라인 markDeleted 기록용, X-User-Id 헤더)
     * @return 수정 후 분개 단건
     * @throws BusinessException(CONFLICT) DRAFT 가 아니거나, 마감된 기간이거나, version 이 불일치할 때
     */
    public JournalDetailResponse update(UUID id, UpdateJournalRequest request, String actorUserId) {
        Journal journal = findOrThrow(id);
        if (journal.getStatus() != JournalStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 상태의 분개만 수정할 수 있습니다 (현재: " + journal.getStatus() + ")");
        }
        monthEndCloseService.findClosedPeriodCovering(request.journalDate())
                .ifPresent(p -> {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "마감된 회계 기간입니다 — 해당 일자(" + request.journalDate()
                                    + ")는 변경할 수 없습니다");
                });
        verifyVersion(journal, request.expectedVersion());

        List<JournalLine> replacementLines = new ArrayList<>();
        int lineNo = 1;
        for (UpdateJournalRequest.LineRequest lineReq : request.lines()) {
            accountService.requireLeafAccount(lineReq.accountCode());
            replacementLines.add(JournalLine.create(journal, lineNo++, lineReq.accountCode(),
                    lineReq.debit(), lineReq.credit(), lineReq.partnerId(), lineReq.partnerName(),
                    lineReq.memo()));
        }

        try {
            journal.updateDraftHeader(request.journalDate(), request.description())
                    .clearLinesForReplacement(actorUserId);
            journalRepository.saveAndFlush(journal);
            replacementLines.forEach(journal::addLine);
            return JournalDetailResponse.of(journalRepository.saveAndFlush(journal));
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
        }
    }

    /**
     * 게시 — DRAFT → POSTED. 도메인의 {@link Journal#post(String)} 호출 (차/대 합계 검증 포함).
     *
     * @param id 분개 UUID
     * @param actorUserId 게시자 user-id (header X-User-Id)
     * @return POSTED 분개 단건
     */
    public JournalDetailResponse post(UUID id, String actorUserId) {
        enforceApprovalLine(parseRealUserId(actorUserId));
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
     * 협업 수정완료 overlay batch 적용.
     *
     * <p>허용 필드는 {@code description}, {@code line.{lineNo}.memo} 뿐이다. 계정코드, 차대변 금액,
     * 일자, 전표번호 등 원장 필드는 400으로 거부한다. REVERSED 회계전표는 물리 종결 상태이므로
     * 409로 차단하고, DRAFT/POSTED 는 overlay 편집을 허용한다.
     *
     * @param journalId 분개 UUID
     * @param beforeAfterPatches path → after 또는 path → {before, after}
     * @param actorUserId 수정자 user-id 문자열
     * @return 변경 후 분개 상세
     */
    public JournalDetailResponse applyOverlayPatchBatch(UUID journalId,
                                                        Map<String, Object> beforeAfterPatches,
                                                        String actorUserId) {
        if (beforeAfterPatches == null || beforeAfterPatches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "적용할 회계전표 변경 내역이 없습니다");
        }
        Journal journal = findOrThrow(journalId);
        guardCollabModifiable(journal);
        for (Map.Entry<String, Object> entry : beforeAfterPatches.entrySet()) {
            String path = normalizeOverlayPath(entry.getKey());
            Object after = extractAfter(entry.getValue());
            if ("description".equals(path)) {
                journal.updateOverlayDescription(toNullableString(after));
                continue;
            }
            Matcher matcher = LINE_MEMO_PATH.matcher(path);
            if (matcher.matches()) {
                int lineNo = Integer.parseInt(matcher.group(1));
                journal.requireLineByLineNo(lineNo)
                        .updateMemo(toNullableString(after));
                continue;
            }
            throw unsupportedOverlayPath(path);
        }
        return JournalDetailResponse.of(journal);
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

    private void guardCollabModifiable(Journal journal) {
        if (COLLAB_LOCKED.contains(journal.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "역분개 처리된 회계전표는 협업 수정완료를 적용할 수 없습니다");
        }
    }

    private void enforceApprovalLine(UUID actorId) {
        if (actorId == null) {
            return;
        }
        ApprovalLineAuthorizeResult result = approvalLineAuthorizeClient.authorize(
                APPROVAL_DOCUMENT_TYPE, APPROVAL_ACTION_KEY, actorId);
        if (result.configured() && !result.allowed()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "결재라인 결재자만 회계전표를 게시할 수 있습니다.");
        }
    }

    private UUID parseRealUserId(String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank() || "system".equals(actorUserId)) {
            return null;
        }
        try {
            return UUID.fromString(actorUserId);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private Object extractAfter(Object rawValue) {
        if (rawValue instanceof Map<?, ?> map && map.containsKey("after")) {
            return map.get("after");
        }
        if (rawValue instanceof JsonNode node && node.isObject() && node.has("after")) {
            JsonNode after = node.get("after");
            if (after == null || after.isNull()) {
                return null;
            }
            return after.isValueNode() ? after.asText() : after.toString();
        }
        return rawValue;
    }

    private String normalizeOverlayPath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet path 는 필수입니다");
        }
        String normalized = rawPath.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        normalized = normalized.replace("/", ".");
        if ("description".equals(normalized)) {
            return normalized;
        }
        Matcher lineMemoMatcher = LINE_MEMO_PATH.matcher(normalized);
        if (lineMemoMatcher.matches()) {
            int lineNo = Integer.parseInt(lineMemoMatcher.group(1));
            if (lineNo < 1) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "lineNo 는 1 이상이어야 합니다: " + rawPath);
            }
            return normalized;
        }
        throw unsupportedOverlayPath(normalized);
    }

    private BusinessException unsupportedOverlayPath(String path) {
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "원장 필드는 협업 수정완료로 변경할 수 없습니다: " + path);
    }

    private void verifyVersion(Journal journal, Long expectedVersion) {
        if (expectedVersion == null || !expectedVersion.equals(journal.getVersion())) {
            throw optimisticLockConflict();
        }
    }

    private BusinessException optimisticLockConflict() {
        return new BusinessException(ErrorCode.CONFLICT,
                "다른 사용자가 먼저 수정했습니다. 최신 분개를 다시 불러온 뒤 저장하세요.");
    }

    private String toNullableString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Journal findOrThrow(UUID id) {
        return journalRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 분개입니다"));
    }
}
