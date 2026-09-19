'use client'

import {
  allowAllCookies,
  denyCookies,
  getCookieConsent,
  saveCookieSelection,
} from '@/utilities/cookieConsent'

export default function CookieConsentTest() {
  const handleAllowAll = () => {
    allowAllCookies()
    console.log('Consent:', getCookieConsent())
  }

  const handleDeny = () => {
    denyCookies()
    console.log('Consent:', getCookieConsent())
  }

  const handleSelection = () => {
    saveCookieSelection({
      preferences: true,
      statistics: false,
      marketing: false,
    })

    console.log('Consent:', getCookieConsent())
  }

  return (
    <div style={{ padding: '40px' }}>
      <h1>Cookie Consent Test</h1>

      <button onClick={handleAllowAll}>
        Allow all
      </button>

      <button onClick={handleDeny} style={{ marginLeft: '10px' }}>
        Deny
      </button>

      <button onClick={handleSelection} style={{ marginLeft: '10px' }}>
        Allow selection
      </button>
    </div>
  )
}
