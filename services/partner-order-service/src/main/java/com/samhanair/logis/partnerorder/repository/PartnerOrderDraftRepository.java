package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PartnerOrderDraftRepository extends JpaRepository<PartnerOrderDraft, UUID> {

    /** 거래처별 draft 페이지 (legacy getDraftList — 본인 거래처만). */
    Page<PartnerOrderDraft> findAllByPartnerCodeOrderByCreatedAtDesc(String partnerCode, Pageable pageable);

    /** 거래처별 draft 페이지 날짜 필터 (legacy getOrderSnapshotHistory(safeBizNo, sDate, eDate)). */
    Page<PartnerOrderDraft> findAllByPartnerCodeAndCreatedAtBetweenOrderByCreatedAtDesc(
            String partnerCode,
            LocalDateTime from,
            LocalDateTime to,
            Pageable pageable);

    /** 거래처별 draft 페이지 시작일 필터. */
    Page<PartnerOrderDraft> findAllByPartnerCodeAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
            String partnerCode,
            LocalDateTime from,
            Pageable pageable);

    /** 거래처별 draft 페이지 종료일 필터. */
    Page<PartnerOrderDraft> findAllByPartnerCodeAndCreatedAtLessThanEqualOrderByCreatedAtDesc(
            String partnerCode,
            LocalDateTime to,
            Pageable pageable);

    /** 거래처별 다음 draftSeq 산출용 (MAX+1). */
    @Query("SELECT COALESCE(MAX(d.draftSeq), 0) FROM PartnerOrderDraft d "
            + "WHERE d.partnerCode = :partnerCode")
    long findMaxDraftSeqByPartnerCode(@Param("partnerCode") String partnerCode);

    Optional<PartnerOrderDraft> findByPartnerCodeAndDraftSeq(String partnerCode, long draftSeq);

    /** 동일 거래처의 같은 자동전송 snapshot은 기존 draft를 재사용해 confirm 멱등키를 보존한다. */
    Optional<PartnerOrderDraft> findFirstByPartnerCodeAndLabelAndPayloadJsonOrderByCreatedAtDesc(
            String partnerCode, String label, String payloadJson);

    /** 30일 TTL cleanup batch — expiresAt &lt; cutoff. */
    List<PartnerOrderDraft> findAllByExpiresAtBefore(LocalDateTime cutoff);
}
