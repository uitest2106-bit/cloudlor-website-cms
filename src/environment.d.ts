declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URL: string
      NEXT_PUBLIC_SERVER_URL: string
      VERCEL_PROJECT_PRODUCTION_URL: string
    }
  }

  // Third-party globals injected by the Silktide consent manager script and
  // Google Consent Mode / GTM (see src/components/ConsentManager). Declared
  // here (rather than `any`) so ConsentManager type-checks without unsafe
  // casts.
  interface Window {
    silktideConsentManager?: {
      init: (config: Record<string, unknown>) => void
    }
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
    __analyticsLoaded?: boolean
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
