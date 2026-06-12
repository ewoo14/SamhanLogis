package com.samhanair.logis.slip.repository.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import java.time.LocalDate;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link DispatchTask} 레포지토리 — Samhan Public Phase A.
 */
public interface DispatchTaskRepository extends JpaRepository<DispatchTask, UUID> {

    Optional<DispatchTask> findByTaskCodeAndIsDeletedFalse(String taskCode);

    Optional<DispatchTask> findByArologisDispatchIdAndIsDeletedFalse(UUID arologisDispatchId);

    Optional<DispatchTask> findFirstByDispatchDateAndStatusAndIsDeletedFalseOrderByCreatedAtDesc(
            LocalDate dispatchDate, DispatchTaskStatus status);

    Page<DispatchTask> findByDispatchDateBetweenAndStatusInAndIsDeletedFalse(
            LocalDate from, LocalDate to, Set<DispatchTaskStatus> statuses, Pageable pageable);

    boolean existsByTaskCodeAndIsDeletedFalse(String taskCode);

    boolean existsByIdAndIsDeletedFalse(UUID id);
}
