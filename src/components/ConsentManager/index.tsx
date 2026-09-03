'use client'

import Script from 'next/script'
import React, { useRef } from 'react'

import './consent-manager.css'

const CONSENT_VERSION = process.env.NEXT_PUBLIC_CONSENT_VERSION || '1.0.0'
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || ''
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || ''

const logConsent = async (preferences: Record<string, boolean>) => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || ''
    if (!baseUrl) return
    await fetch(`${baseUrl}/api/consent-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferences,
        consentVersion: CONSENT_VERSION,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    })
  } catch (error) {
    console.error('Failed to log consent:', error)
  }
}

const initConsentManager = () => {
  if (typeof window === 'undefined' || !window.silktideConsentManager) return

  window.silktideConsentManager.init({
    consentTypes: [
      {
        name: 'essential',
        id: 'essential',
        label: 'Essential',
        description:
          'Essential cookies are required for the website to function properly. These cookies enable core functionality such as security, network management, and accessibility. You may disable these by changing your browser settings, but the site may not function properly.',
        required: true,
        defaultValue: true,
      },
      {
        name: 'analytics',
        id: 'analytics',
        label: 'Analytics',
        description:
          'Analytics cookies help us understand how visitors interact with our website by collecting anonymous information. This helps us improve our website and services.',
        required: false,
        defaultValue: false,
      },
      {
        name: 'marketing',
        id: 'marketing',
        label: 'Marketing',
        description:
          'Marketing cookies are used to deliver relevant advertisements and track the effectiveness of advertising campaigns. These cookies may be set by our advertising partners.',
        required: false,
        defaultValue: false,
      },
    ],
    gtag: {
      analytics: ['analytics_storage'],
      marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
    },
    text: {
      prompt: {
        description:
          '<p>We use cookies on our site to enhance your user experience, provide personalized content, and analyze our traffic. By clicking “Accept all”, you agree to our use of cookies.</p>',
        acceptAllButtonText: 'Accept all',
        rejectNonEssentialButtonText: 'Reject non-essential',
        preferencesButtonText: 'Preferences',
      },
      preferences: {
        title: 'Customize your cookie preferences',
        description:
          '<p>We respect your right to privacy. You can choose not to allow some types of cookies. Your cookie preferences will apply across our website.</p>',
        saveButtonText: 'Save and close',
      },
    },
    eventName: 'stcm_consent_update',
    onAcceptAll: (preferences: Record<string, boolean>) => {
      window.gtag?.('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
      })
      loadAnalytics()
      logConsent(preferences)
    },
    onRejectAll: (preferences: Record<string, boolean>) => {
      window.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })
      logConsent(preferences)
    },
    onConsentChange: (preferences: Record<string, boolean>) => {
      window.gtag?.('consent', 'update', {
        analytics_storage: preferences.analytics ? 'granted' : 'denied',
        ad_storage: preferences.marketing ? 'granted' : 'denied',
        ad_user_data: preferences.marketing ? 'granted' : 'denied',
        ad_personalization: preferences.marketing ? 'granted' : 'denied',
      })
      if (preferences.analytics || preferences.marketing) {
        loadAnalytics()
      }
      logConsent(preferences)
    },
  })
}

const loadAnalytics = () => {
  if (typeof window === 'undefined') return
  if (window.__analyticsLoaded) return

  // If GTM ID is configured, load GTM
  if (GTM_ID) {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' })
    const firstScript = document.getElementsByTagName('script')[0]
    const gtmScript = document.createElement('script')
    gtmScript.async = true
    gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
    if (firstScript?.parentNode) firstScript.parentNode.insertBefore(gtmScript, firstScript)
  }

  // If GA4 Measurement ID is configured, load GA4 via gtag
  if (GA_MEASUREMENT_ID) {
    const gaScript = document.createElement('script')
    gaScript.async = true
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    document.head.appendChild(gaScript)
    window.gtag?.('config', GA_MEASUREMENT_ID)
  }

  window.__analyticsLoaded = true
}

export const ConsentManager: React.FC = () => {
  const initialized = useRef(false)

  const handleSilktideLoad = () => {
    if (!initialized.current) {
      initialized.current = true
      initConsentManager()
    }
  }

  return (
    <>
      {/* Google Consent Mode v2 defaults - prior opt-in blocking */}
      <Script
        id="google-consent-mode-defaults"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              analytics_storage: 'denied',
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              functionality_storage: 'denied',
              personalization_storage: 'denied',
              security_storage: 'granted',
              wait_for_update: 500
            });
          `,
        }}
      />

      {/* Cloudlor Consent Manager CSS Theme */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/silktide/consent-manager@main/silktide-consent-manager.css"
      />

      {/* Silktide Consent Manager JS */}
      <Script
        id="silktide-consent-manager"
        src="https://cdn.jsdelivr.net/gh/silktide/consent-manager@main/silktide-consent-manager.js"
        strategy="afterInteractive"
        onLoad={handleSilktideLoad}
      />
    </>
  )
}
