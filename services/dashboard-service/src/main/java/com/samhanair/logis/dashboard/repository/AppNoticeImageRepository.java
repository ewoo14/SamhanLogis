package com.samhanair.logis.dashboard.repository;

import com.samhanair.logis.dashboard.domain.AppNoticeImage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 팝업공지 이미지 repository. */
public interface AppNoticeImageRepository extends JpaRepository<AppNoticeImage, UUID> {

    /** 공지별 이미지 목록. */
    List<AppNoticeImage> findByNoticeIdOrderByDisplayOrderAsc(UUID noticeId);

    /** 여러 공지의 이미지 목록. */
    List<AppNoticeImage> findByNoticeIdInOrderByNoticeIdAscDisplayOrderAsc(List<UUID> noticeIds);
}
