package com.samhanair.logis.accounting.service;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.web.dto.LedgerResponse;
import com.samhanair.logis.accounting.web.dto.LedgerResponse.LedgerLine;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 원장 조회 service (SP-08-6-5).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" 의 기간별 + 거래처별 통합 원장 view.
 * {@link LedgerImageService} 가 단일 거래처 + 단톡방 정보를 반환하는 반면,
 * 본 service 는 다중 거래처(전체 또는 단일) + 잔액 합계 요약을 제공한다.
 *
 * <p>데이터 소스: {@code journal_lines} (POSTED 분개 라인) — 별도 ledger_entries 테이블 없음.
 * POSTED 분개만 집계 ({@link com.samhanair.logis.accounting.domain.JournalStatus#POSTED}).
 *
 * <p>외부 client {@link PartnerLookupClient} 의존 (partnerCode lookup) — IT 에서
 * {@code @MockBean} 격리 의무 ({@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>read-only service — 도메인 mutation 없음.
 *
 * <p>SP-D2 동적 권한 검증:
 * VIEW 액션 — 기존 @PreAuthorize 이후 추가 레이어.
 * override row 없음(fallback) 시 기존 @PreAuthorize 통과로 충분.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LedgerService {

    /** SP-D2 — 원장 페이지 코드. */
    static final String PAGE_CODE = "accounting.general-ledger";

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * 기간별 + 거래처별 원장 조회.
     *
     * <p>partnerCode 가 null 이면 전체 거래처 통합 조회 (모든 라인 반환).
     * 잔액은 차변잔액 normal (debit - credit) 로 누적.
     *
     * <p>SP-D2 동적 권한: VIEW 검증 (점진 마이그레이션 — canView=false fallback 시 통과).
     *
     * @param from        조회 시작 날짜 (필수)
     * @param to          조회 종료 날짜 (필수)
     * @param partnerCode 거래처코드 필터 (선택 — null 이면 전체)
     * @param actorRole   요청자 role (X-User-Role 헤더)
     * @return 기간 원장 (라인 목록 + 합계 요약)
     * @throws BusinessException(NOT_FOUND) partnerCode 지정 시 미존재
     * @throws IllegalArgumentException     from/to null 또는 to < from
     */
    public LedgerResponse getLedger(LocalDate from, LocalDate to, String partnerCode,
                                    String actorRole) {
        checkViewPermission(actorRole);
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }

        // partnerCode → partnerId 도출
        UUID filterPartnerId = null;
        String resolvedPartnerCode = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            PartnerSummary summary = partnerLookupClient.findByPartnerCode(partnerCode)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "존재하지 않는 거래처입니다: " + partnerCode));
            filterPartnerId = summary.partnerId();
            resolvedPartnerCode = summary.partnerCode();
        }

        // 분개 라인 조회 — partnerId 필터 적용
        List<JournalLine> lines;
        if (filterPartnerId != null) {
            lines = journalLineRepository.findPartnerLinesInRange(filterPartnerId, from, to);
        } else {
            lines = journalLineRepository.findAllPostedLinesInRange(from, to);
        }

        // N+1 방지 (partnerId): 라인의 모든 partnerId 를 일괄 수집 후 단건 lookup 캐시 구성
        Set<UUID> partnerIdSet = lines.stream()
                .map(JournalLine::getPartnerId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, String> partnerCodeCache = new HashMap<>();
        for (UUID pid : partnerIdSet) {
            String code = partnerLookupClient.findByPartnerId(pid)
                    .map(PartnerSummary::partnerCode)
                    .orElse(null);
            partnerCodeCache.put(pid, code);
        }

        // N+1 방지 (accountCode): 라인의 모든 accountCode 를 일괄 수집 후 ChartOfAccount 캐시 구성
        // SP-08-FU2 P2-4 — accountName 매핑용 인메모리 캐시 (DB round-trip 최소화)
        Set<String> accountCodes = lines.stream()
                .map(JournalLine::getAccountCode)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, String> accountNameCache = chartOfAccountRepository.findAllById(accountCodes)
                .stream()
                .collect(Collectors.toMap(ChartOfAccount::getCode, ChartOfAccount::getName));

        // 원장 라인 변환 + 누적 잔액 계산
        BigDecimal balance = BigDecimal.ZERO;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        List<LedgerLine> ledgerLines = new ArrayList<>(lines.size());

        for (JournalLine l : lines) {
            BigDecimal debit = l.getDebitAmount();
            BigDecimal credit = l.getCreditAmount();
            balance = balance.add(debit).subtract(credit);
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // 캐시에서 거래처코드 조회 (HTTP 추가 호출 없음)
            String linePartnerCode = l.getPartnerId() != null
                    ? partnerCodeCache.get(l.getPartnerId())
                    : null;

            // SP-08-FU2 P2-4 — 계정명 캐시 조회
            String accountName = l.getAccountCode() != null
                    ? accountNameCache.get(l.getAccountCode())
                    : null;

            ledgerLines.add(new LedgerLine(
                    l.getJournal().getJournalDate(),
                    l.getJournal().getJournalNo(),
                    l.getAccountCode(),
                    accountName,
                    linePartnerCode,
                    l.getMemo() != null ? l.getMemo() : l.getJournal().getDescription(),
                    debit,
                    credit,
                    balance));
        }

        return new LedgerResponse(
                from,
                to,
                resolvedPartnerCode,
                totalDebit,
                totalCredit,
                balance,
                ledgerLines);
    }

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D2 동적 VIEW 권한 검증.
     *
     * <p>actorRole null/blank 이면 건너뜀.
     * canView=false: fallback(row 없음) 또는 명시적 deny 구분 불가
     * → 점진 마이그레이션 정책으로 통과 (기존 @PreAuthorize 가 이미 검증).
     *
     * @param actorRole 요청자 role
     */
    private void checkViewPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
        if (!canView) {
            log.debug("[SP-D2] VIEW 동적 권한 false (fallback 또는 deny) — roleCode={} pageCode={}",
                    actorRole, PAGE_CODE);
        }
    }

}
