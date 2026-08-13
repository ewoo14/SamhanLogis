package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * KFTC 입금 매칭 audit 로그 기록 — REQUIRES_NEW 별도 트랜잭션 (SP-09-4).
 *
 * <p>SP-09-1/SP-09-3 패턴 일관: main 트랜잭션 실패 시에도 audit 이 커밋된다.
 * 단, audit 실패가 main 트랜잭션에 영향을 주지 않도록 caller 에서 try-catch 처리.
 *
 * <p>기록 대상:
 * <ul>
 *   <li>fetch-and-match 실행 이벤트 (actorId / 건수 / submitMethod)</li>
 *   <li>자동 매칭 성공 건별 journal draft ID (내부 추적)</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility): audit 기록의 newValue 에
 * journalDraftId(UUID) 를 포함하지 않는다. 비즈니스 식별자(matchedPartnerCode / depositorName) 만 기록.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DepositMatchAuditRecorder {

    private final AccountingAuditLogRepository auditLogRepository;

    /**
     * 입금 조회 + 자동 매칭 실행 audit 기록 — REQUIRES_NEW 별도 트랜잭션.
     *
     * <p>main 트랜잭션 롤백 시에도 audit 이 커밋된다 (REQUIRES_NEW propagation).
     *
     * @param actorId        실행자 UUID (X-User-Id 헤더에서 파싱)
     * @param submitMethod   사용된 전송 방식 ("DRY_RUN" | "KFTC")
     * @param totalCount     조회된 입금 거래 건수
     * @param matchedCount   자동 매칭 성공 건수
     * @param unmatchedCount 매칭 실패 건수
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFetchAndMatch(UUID actorId, String submitMethod,
                                    int totalCount, int matchedCount, int unmatchedCount) {
        // audit entityId: 단일 entity 가 아닌 배치 이벤트이므로 actorId 를 식별자로 사용.
        // (실제 운영 시 별도 DepositMatchLog entity 추가 예정 — Phase 11)
        UUID auditEntityId = actorId != null ? actorId : UUID.randomUUID();

        AccountingAuditLog actionLog = AccountingAuditLog.record(
                auditEntityId,
                1,
                actorId,
                actorId == null ? "system" : ActorDisplayName.UNKNOWN,
                null,
                "action",
                null,
                "KFTC_DEPOSIT_FETCH_AND_MATCH"
        );
        auditLogRepository.save(actionLog);

        AccountingAuditLog countLog = AccountingAuditLog.record(
                auditEntityId,
                2,
                actorId,
                actorId == null ? "system" : ActorDisplayName.UNKNOWN,
                null,
                "matchSummary",
                null,
                "submitMethod=" + submitMethod
                        + " total=" + totalCount
                        + " matched=" + matchedCount
                        + " unmatched=" + unmatchedCount
        );
        auditLogRepository.save(countLog);

        log.debug("[SP-09-4] DepositMatchAuditRecorder — actorId={} submitMethod={} total={} matched={}",
                actorId, submitMethod, totalCount, matchedCount);
    }
}
