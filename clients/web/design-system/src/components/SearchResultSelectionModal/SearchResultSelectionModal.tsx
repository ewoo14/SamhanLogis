import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '../Button'
import { Modal } from '../Modal'
import styles from './SearchResultSelectionModal.module.css'

export type SearchResultSelectionMode = 'single' | 'multiple'

export interface SearchResultSelectionModalProps<T> {
  open: boolean
  mode: SearchResultSelectionMode
  title: ReactNode
  options: T[]
  getKey: (option: T) => string
  getLabel: (option: T) => string
  renderOption: (option: T) => ReactNode
  onConfirm: (options: T[]) => void
  onCancel: () => void
  initialSelectedKeys?: string[]
}

/** 검색 결과가 여러 건일 때 후보를 임시 선택하고 한 번에 확정하는 공용 모달. */
export function SearchResultSelectionModal<T>({
  open,
  mode,
  title,
  options,
  getKey,
  getLabel,
  renderOption,
  onConfirm,
  onCancel,
  initialSelectedKeys = [],
}: SearchResultSelectionModalProps<T>) {
  const initialKeySet = useMemo(() => new Set(initialSelectedKeys), [initialSelectedKeys])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(initialKeySet)

  const toggle = (option: T) => {
    const key = getKey(option)
    setSelectedKeys((current) => {
      if (mode === 'single') return new Set([key])
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const confirm = () => {
    onConfirm(options.filter((option) => selectedKeys.has(getKey(option))))
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>취소</Button>
          <Button type="button" variant="primary" onClick={confirm} disabled={selectedKeys.size === 0}>
            선택 확정
          </Button>
        </>
      }
    >
      <div className={styles['list']} role="listbox" aria-label="검색 결과 선택">
        {options.map((option) => {
          const key = getKey(option)
          const selected = selectedKeys.has(key)
          return (
            <label className={styles['option']} key={key}>
              <input
                type={mode === 'multiple' ? 'checkbox' : 'radio'}
                name="search-result-selection"
                checked={selected}
                onChange={() => toggle(option)}
                aria-label={getLabel(option)}
              />
              <span>{renderOption(option)}</span>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}

export default SearchResultSelectionModal
