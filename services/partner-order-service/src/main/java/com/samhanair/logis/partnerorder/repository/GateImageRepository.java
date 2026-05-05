package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.GateImage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GateImageRepository extends JpaRepository<GateImage, UUID> {
    List<GateImage> findAllByOrderByDisplayOrderAsc();
}
