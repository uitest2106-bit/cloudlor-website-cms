'use client'

import { useHeaderTheme } from '@/providers/HeaderTheme'
import React, { useEffect } from 'react'
import CookieConsentTest from '@/components/CookieConsentTest'

const PageClient: React.FC = () => {
  const { setHeaderTheme } = useHeaderTheme()

  useEffect(() => {
    setHeaderTheme('light')
  }, [setHeaderTheme])

  return (
    <>
      <CookieConsentTest />
    </>
  )
}

export default PageClient
