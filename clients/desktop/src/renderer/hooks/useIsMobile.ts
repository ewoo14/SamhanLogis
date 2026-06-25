import { useEffect, useState } from 'react'

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint,
  )

  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [breakpoint])

  return isMobile
}
