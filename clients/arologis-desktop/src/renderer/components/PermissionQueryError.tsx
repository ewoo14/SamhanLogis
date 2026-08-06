interface PermissionQueryErrorProps {
  onRetry: () => void
  isRetrying?: boolean
}

export function PermissionQueryError({
  onRetry,
  isRetrying = false,
}: PermissionQueryErrorProps): JSX.Element {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        marginTop: 12,
        border: '1px solid var(--color-danger)',
        borderRadius: 4,
        color: 'var(--color-danger)',
      }}
    >
      <span>권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</span>
      <button type="button" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? '다시 확인 중…' : '권한 다시 확인'}
      </button>
    </div>
  )
}
