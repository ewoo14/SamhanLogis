package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.Schedule;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 일정 저장소 — 소유자/참여자별 + 기간 검색. */
@Repository
public interface ScheduleRepository extends JpaRepository<Schedule, UUID> {

    /** 단건 조회 — participants 컬렉션 fetch 강제 (update path lucky pass 명시적 fix). */
    @Override
    @EntityGraph(attributePaths = "participants")
    Optional<Schedule> findById(UUID id);

    /** 호출자가 활성 대상자인 일정만 단건 조회한다. */
    @Query("select distinct s from Schedule s left join fetch s.participants "
            + "where s.id = :scheduleId "
            + "and exists (select 1 from ScheduleParticipant p "
            + "where p.schedule = s and p.participantId = :userId and p.isDeleted = false)")
    Optional<Schedule> findVisibleById(@Param("scheduleId") UUID scheduleId,
                                      @Param("userId") UUID userId);

    /**
     * 호출자가 활성 참여자인 + 기간 겹침 조회. 이벤트 [startsAt, endsAt] 가
     * [from, to] 와 겹치는 모든 row.
     *
     * <p>겹침 = !(eventEnd < windowStart || eventStart > windowEnd) → eventEnd >= from AND eventStart <= to.
     * 참여자 권한은 컬렉션 fetch join 과 분리한 exists 로 판정하여, 초대된 호출자에게도 전체 활성
     * 참여자 목록을 유지한다. {@code distinct} 는 복수 참여자 fetch 에 따른 entity 중복을 제거한다.
     */
    @Query("select distinct s from Schedule s left join fetch s.participants "
            + "where exists (select 1 from ScheduleParticipant p "
            + "where p.schedule = s and p.participantId = :userId and p.isDeleted = false) "
            + "and s.endsAt >= :from and s.startsAt <= :to "
            + "order by s.startsAt asc")
    List<Schedule> findVisibleInRange(@Param("userId") UUID userId,
                                      @Param("from") LocalDateTime from,
                                      @Param("to") LocalDateTime to);
}
