import { useEffect } from 'react'

export function usePageTitle(title: string, meta?: string): void {
  useEffect(() => {
    document.title = meta ? `${title} [${meta}] - 아로로지스` : `${title} - 아로로지스`
  }, [title, meta])
}
