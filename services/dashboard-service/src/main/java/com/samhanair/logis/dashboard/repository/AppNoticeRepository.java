package com.samhanair.logis.dashboard.repository;

import com.samhanair.logis.dashboard.domain.AppNotice;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 팝업공지 repository. */
public interface AppNoticeRepository extends JpaRepository<AppNotice, UUID> {

    /** 관리자 목록. */
    List<AppNotice> findAllByOrderByDisplayOrderAscStartAtDesc();

    /** 현재 게시기간 내 활성 공지. */
    List<AppNotice> findByActiveTrueAndStartAtLessThanEqualAndEndAtGreaterThanEqualOrderByDisplayOrderAscStartAtDesc(
            LocalDateTime startAt,
            LocalDateTime endAt);
}
