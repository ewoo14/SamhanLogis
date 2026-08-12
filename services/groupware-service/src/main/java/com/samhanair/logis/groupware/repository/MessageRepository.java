package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.MessageStatus;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 메신저 저장소 — 수신함 + 미열람 카운트. */
@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {

    /** 수신자 inbox — 발송 시각 역순. */
    Page<Message> findAllByRecipientIdOrderBySentAtDesc(UUID recipientId, Pageable pageable);

    /** 미열람 카운트 — 알림 배지 / Internal API 조회. */
    long countByRecipientIdAndStatus(UUID recipientId, MessageStatus status);

    /** 읽음 최초 시각 보존을 위해 동시 markRead 시 행을 직렬화한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Message m where m.id = :messageId")
    java.util.Optional<Message> findByIdForUpdate(@Param("messageId") UUID messageId);

    /** 원자성 검증용 — 같은 batchId를 공유하는 행 전체 조회 (테스트 전용 소비). */
    List<Message> findAllByBatchId(UUID batchId);

    @Query("select coalesce(max(m.sequence), 0) from Message m where m.roomId = :roomId")
    long findMaxSequence(@Param("roomId") UUID roomId);

    List<Message> findTop50ByRoomIdAndSequenceLessThanOrderBySequenceDesc(UUID roomId, long beforeSequence);
    List<Message> findTop50ByRoomIdOrderBySequenceDesc(UUID roomId);
    List<Message> findAllByRoomIdAndRecipientIdAndSequenceLessThanEqual(UUID roomId, UUID recipientId, long sequence);
}
