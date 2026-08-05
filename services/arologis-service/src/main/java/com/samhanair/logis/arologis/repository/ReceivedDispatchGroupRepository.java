package com.samhanair.logis.arologis.repository;
import com.samhanair.logis.arologis.domain.ReceivedDispatchGroup;
import java.time.LocalDate; import java.util.*; import org.springframework.data.jpa.repository.JpaRepository;
public interface ReceivedDispatchGroupRepository extends JpaRepository<ReceivedDispatchGroup,UUID>{Optional<ReceivedDispatchGroup> findByGroupNoAndIsDeletedFalse(String groupNo);List<ReceivedDispatchGroup> findAllByDispatchDateAndIsDeletedFalseOrderByGroupNoAsc(LocalDate date);}
