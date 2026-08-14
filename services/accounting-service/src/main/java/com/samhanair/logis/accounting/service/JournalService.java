package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CreateJournalLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.accounting.web.dto.JournalResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.ArrayList;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

    private static final EnumSet<JournalStatus> COLLAB_LOCKED = EnumSet.of(JournalStatus.REVERSED);
    private static final Pattern LINE_MEMO_PATH = Pattern.compile("^line\\.(\\d+)\\.memo$");
    private static final String APPROVAL_DOCUMENT_TYPE = "ACCOUNTING_JOURNAL";
    private static final String APPROVAL_ACTION_KEY = "JOURNAL_POST";

    private final JournalRepository journalRepository;
    private final JournalNumberService journalNumberService;
    private final AccountService accountService;
    private final MonthEndCloseService monthEndCloseService;
    private final ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    private final PartnerLookupClient partnerLookupClient;
    private final ChartOfAccountRepository chartOfAccountRepository;
    private final CashReceiptRepository cashReceiptRepository;

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
        return create(request, false);
    }

    /** 내부 재고실사 조정 — 공개 분개와 달리 개발책임자 결정의 1462를 허용한다. */
    public JournalDetailResponse createInventoryAuditAdjustment(CreateJournalRequest request) {
        return create(request, true);
    }

    private JournalDetailResponse create(CreateJournalRequest request, boolean inventoryAudit) {
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
            if (inventoryAudit) {
                accountService.requireInventoryAuditAccount(lineReq.accountCode());
            } else {
                accountService.requireLeafAccount(lineReq.accountCode());
            }
            JournalLine line = JournalLine.create(journal, lineNo++, lineReq.accountCode(),
                    lineReq.debitAmount(), lineReq.creditAmount(), lineReq.partnerId(),
                    lineReq.memo());
            journal.addLine(line);
        }

        Journal saved = journalRepository.save(journal);
        return toDetailResponse(saved);
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
        return toDetailResponse(journal);
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
        return toDetailResponse(journal);
    }

    /**
     * 역분개 — POSTED → REVERSED. 원분개를 REVERSED 마킹한 뒤 차/대 swap 한 신규 Journal 을
     * 같은 일자에 자동 생성하여 POST 까지 수행. 양 분개가 서로 reversedJournalId 로 연결.
     *
     * <p>부수효과 (단일 트랜잭션):
     * <ol>
     *   <li>원분개 status REVERSED + reversedJournalId = 신규 Journal UUID</li>
     *   <li>신규 Journal: 동일 journalDate / description "[역분개] {원 전표번호} {원 description}" / sourceType MANUAL /
     *       sourceRefId = 원분개 UUID / 라인 차/대 swap / status POSTED</li>
     * </ol>
     *
     * @param id 원분개 UUID
     * @param actorUserId 역분개 게시자 user-id
     * @return 신규 역분개 단건 (원분개 ID 는 reversedJournalId 로 추적)
     * @throws BusinessException(CONFLICT) 입금보고서 자동 분개(CASH_RECEIPT)를 직접 역분개 시도
     * @throws BusinessException(CONFLICT) 원분개 일자가 마감된 회계 기간에 속할 때
     */
    public JournalDetailResponse reverse(UUID id, String actorUserId) {
        Journal original = findOrThrow(id);
        // 입금보고서 분개를 원장에서 직접 역분개하면 CashReceipt 는 CONFIRMED 로 남은 채
        // cancel/수정의 autoReverse 가 영구 409 (REVERSED 재역분개 불가) — 원천 문서 경유를 강제한다.
        if (original.getSourceType() == JournalSourceType.CASH_RECEIPT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "입금보고서 자동 분개는 원장에서 직접 역분개할 수 없습니다 — 입금보고서 취소/수정으로 처리하세요");
        }
        requireOriginalJournalDateOpenForReversal(original);
        // 원분개 상태 검증은 markReversed 안에서.
        String reverseNo = journalNumberService.next(original.getJournalDate());
        String reverseDesc = reversalDescription(original);
        Journal reversal = Journal.create(reverseNo, original.getJournalDate(), reverseDesc,
                JournalSourceType.MANUAL, original.getId());

        int lineNo = 1;
        for (JournalLine origLine : original.getLines()) {
            JournalLine swapped = JournalLine.create(reversal, lineNo++, origLine.getAccountCode(),
                    origLine.getCreditAmount(),  // swap
                    origLine.getDebitAmount(),   // swap
                    origLine.getPartnerId(),
                    clampReversalMemo(origLine.getMemo()));
            reversal.addLine(swapped);
        }
        reversal.post(actorUserId);
        Journal savedReversal = journalRepository.save(reversal);

        original.markReversed();
        original.linkReversal(savedReversal.getId());

        return toDetailResponse(savedReversal);
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
        if (sourceType == JournalSourceType.CASH_RECEIPT) {
            // CASH_RECEIPT 는 sourceRefId 자체가 CashReceipt UUID — 전용 링크에도 동일하게 채운다.
            journal.linkCashReceipt(sourceRefId);
        }
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
     *
     * <p>원분개 일자가 CLOSED 회계 기간이면 원분개 상태 전이와 역분개 생성 모두
     * {@link ErrorCode#CONFLICT} 로 차단한다. 마감 해제 후 취소/정정을 재시도해야 한다.
     *
     * @throws BusinessException(CONFLICT) 원분개 일자가 마감된 회계 기간에 속할 때
     */
    public Journal autoReverse(UUID originalJournalId, String actorUserId) {
        Journal original = findOrThrow(originalJournalId);
        requireOriginalJournalDateOpenForReversal(original);
        String reverseNo = journalNumberService.next(original.getJournalDate());
        String reverseDesc = reversalDescription(original);
        Journal reversal = Journal.create(reverseNo, original.getJournalDate(), reverseDesc,
                original.getSourceType(), original.getId());
        // source_ref_id 는 위에서 원분개 UUID 로 채워 이중 의미를 유지하지만(클래스 주석 참고),
        // CashReceipt 전용 링크는 원분개의 값을 그대로 승계해 원/역분개 모두 동일 CashReceipt 를
        // 가리키게 한다. CASH_RECEIPT 이외 출처(TaxInvoice 취소 등)는 원분개 값이 이미 null 이므로
        // 그대로 null 이 전파된다.
        reversal.linkCashReceipt(original.getCashReceiptId());
        int lineNo = 1;
        for (JournalLine origLine : original.getLines()) {
            JournalLine swapped = JournalLine.create(reversal, lineNo++, origLine.getAccountCode(),
                    origLine.getCreditAmount(),
                    origLine.getDebitAmount(),
                    origLine.getPartnerId(),
                    clampReversalMemo(origLine.getMemo()));
            reversal.addLine(swapped);
        }
        reversal.post(actorUserId);
        Journal saved = journalRepository.save(reversal);
        original.markReversed();
        original.linkReversal(saved.getId());
        return saved;
    }

    /**
     * 원분개 일자 기준 역분개 가능 여부 선검증 — {@link #requireOriginalJournalDateOpenForReversal}
     * 로의 ID 기반 브릿지.
     *
     * <p>입금보고서 취소/CONFIRMED 수정처럼 도메인 상태를 먼저 바꾸는 호출자는 본 메서드로
     * 같은 409를 상태 변경 전에 표면화한다. 실제 역분개 생성 직전에는 {@link #autoReverse}
     * / {@link #reverse} 내부에서 동일 가드를 다시 실행해 기간 마감 race 를 방지한다.
     *
     * <p>public — 클래스 레벨 {@code @Transactional} 이 일관 적용되는 공개 API 로 승격
     * (#719 fix 라운드, 호출부 변경 없음).
     *
     * @throws BusinessException(CONFLICT) 원분개 일자가 마감된 회계 기간에 속할 때
     */
    public void requireOriginalJournalOpenForReversal(UUID originalJournalId) {
        requireOriginalJournalDateOpenForReversal(findOrThrow(originalJournalId));
    }

    /**
     * 원분개 일자가 마감된 회계 기간에 속하면 CONFLICT 로 차단하는 근본 가드.
     *
     * <p>{@link #reverse}(수동) / {@link #autoReverse}(자동) 가 역분개 생성 직전에 공통으로
     * 호출한다 — 입금보고서(CashReceipt) 뿐 아니라 세금계산서(TaxInvoice) 등
     * {@link #autoReverse} 를 경유하는 모든 자동 역분개 경로에 동일하게 적용된다.
     *
     * <p><b>#719 개발책임자 결정(2026-07-04)</b> — {@code AccountingPeriodGuard} 에 있던
     * "TaxInvoice.cancel 은 발행 분개의 supplyDate 가 마감되어 있어도 역분개 자체는 허용"
     * 문서화 예외(D-E3-05 계열)는 철회되었다. 세금계산서 취소도 입금보고서와 동일하게
     * 마감된 원분개는 역분개를 차단한다 (월마감 무결성 일관 적용, 예외 없음).
     *
     * <p>public — 클래스 레벨 {@code @Transactional} 이 일관 적용되는 공개 API 로 승격
     * (#719 fix 라운드, 호출부 변경 없음).
     *
     * @throws BusinessException(CONFLICT) 원분개 일자가 마감된 회계 기간에 속할 때
     */
    public void requireOriginalJournalDateOpenForReversal(Journal original) {
        monthEndCloseService.findClosedPeriodCovering(original.getJournalDate())
                .ifPresent(p -> {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "마감된 회계 기간의 분개는 역분개할 수 없습니다 — 해당 일자("
                                    + original.getJournalDate() + ")는 마감 해제 후 다시 시도하세요");
                });
    }

    /**
     * 역분개 라인 memo — "[역분개] " prefix 6자를 더해도 {@link JournalLine} 의 500자 한도를
     * 넘지 않게 클램프. 원 memo 가 495자 이상이면 prefix 때문에 역분개 생성이
     * IllegalArgumentException 으로 막혀 원천 문서(입금보고서 등)가 영구 취소불능이 되는 것을 방지.
     */
    private static String clampReversalMemo(String originalMemo) {
        String memo = "[역분개] " + (originalMemo == null ? "" : originalMemo);
        return memo.length() > 500 ? memo.substring(0, 500) : memo;
    }

    private static String reversalDescription(Journal original) {
        String description = "[역분개] " + original.getJournalNo()
                + (original.getDescription() == null ? "" : " " + original.getDescription());
        return description.length() > 500 ? description.substring(0, 500) : description;
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
        return toDetailResponse(journal);
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

    private String toNullableString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /**
     * 분개 상세 응답 enrich — 라인 전체의 거래처명/계정명을 배치 조회한다.
     *
     * <p>partnerId 는 내부 FK 이므로 응답 DTO 에 싣지 않고, partnerName 만 제공한다. 계정명은
     * accounting-service 의 ChartOfAccount 마스터를 한 번에 조회한다.
     *
     * <p>{@code create}/{@code post}/{@code reverse}/{@code getOne} 등 저널 write/detail 경로가
     * 모두 이 메서드를 거친다. partner-service 장애(UNAVAILABLE) 시에도 저널 자체는 이미 확정된
     * 오퍼레이션이므로 {@link PartnerLookupSupport#batchOrEmpty} 로 표시명만 공란 처리하고
     * 롤백하지 않는다 (#924 개발책임자 결정 — write/detail은 표시명이 부수 정보).
     */
    private JournalDetailResponse toDetailResponse(Journal journal) {
        LinkedHashSet<UUID> partnerIds = new LinkedHashSet<>();
        LinkedHashSet<String> accountCodes = new LinkedHashSet<>();
        for (JournalLine line : journal.getLines()) {
            if (line.getPartnerId() != null) {
                partnerIds.add(line.getPartnerId());
            }
            if (line.getAccountCode() != null && !line.getAccountCode().isBlank()) {
                accountCodes.add(line.getAccountCode());
            }
        }

        Map<UUID, String> partnerNamesById = partnerIds.isEmpty()
                ? Map.of()
                : PartnerLookupSupport.batchOrEmpty(partnerLookupClient, new ArrayList<>(partnerIds)).entrySet().stream()
                        .filter(entry -> entry.getValue() != null && entry.getValue().name() != null)
                        .collect(java.util.stream.Collectors.toMap(
                                Map.Entry::getKey,
                                entry -> entry.getValue().name(),
                                (left, right) -> left,
                                java.util.LinkedHashMap::new));

        Map<String, String> accountNamesByCode = accountCodes.isEmpty()
                ? Map.of()
                : chartOfAccountRepository.findAllById(accountCodes).stream()
                        .collect(java.util.stream.Collectors.toMap(
                                account -> account.getCode(),
                                account -> account.getName(),
                                (left, right) -> left,
                                java.util.LinkedHashMap::new));

        return JournalDetailResponse.of(journal, accountNamesByCode, partnerNamesById,
                resolveCashReceiptSlipNo(journal));
    }

    private String resolveCashReceiptSlipNo(Journal journal) {
        if (journal.getSourceType() != JournalSourceType.CASH_RECEIPT || journal.getCashReceiptId() == null) {
            return null;
        }
        return cashReceiptRepository.findByIdAndIsDeletedFalse(journal.getCashReceiptId())
                .map(com.samhanair.logis.accounting.domain.CashReceipt::getSlipNo)
                .orElse(null);
    }

    private Journal findOrThrow(UUID id) {
        return journalRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 분개입니다: " + id));
    }
}
