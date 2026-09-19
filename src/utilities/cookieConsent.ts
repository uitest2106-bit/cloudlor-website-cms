export type CookieConsent = {
  necessary: true
  preferences: boolean
  statistics: boolean
  marketing: boolean
}

const CONSENT_COOKIE_NAME = 'cookie-consent'

export const defaultCookieConsent: CookieConsent = {
  necessary: true,
  preferences: false,
  statistics: false,
  marketing: false,
}

export const getCookieConsent = (): CookieConsent => {
  if (typeof document === 'undefined') {
    return defaultCookieConsent
  }

  const cookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`))

  if (!cookie) {
    return defaultCookieConsent
  }

  try {
    const value = cookie.split('=')[1]

    const consent = JSON.parse(decodeURIComponent(value))

    return {
      necessary: true,
      preferences: Boolean(consent.preferences),
      statistics: Boolean(consent.statistics),
      marketing: Boolean(consent.marketing),
    }
  } catch {
    return defaultCookieConsent
  }
}

export const saveCookieConsent = (consent: Omit<CookieConsent, 'necessary'>): void => {
  if (typeof document === 'undefined') {
    return
  }

  const value: CookieConsent = {
    necessary: true,
    preferences: consent.preferences,
    statistics: consent.statistics,
    marketing: consent.marketing,
  }

  const maxAge = 60 * 60 * 24 * 365

  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify(value),
  )}; path=/; max-age=${maxAge}; SameSite=Lax`
}
export const allowAllCookies = (): void => {
  saveCookieConsent({
    preferences: true,
    statistics: true,
    marketing: true,
  })
}

export const denyCookies = (): void => {
  saveCookieConsent({
    preferences: false,
    statistics: false,
    marketing: false,
  })
}

export const saveCookieSelection = (selection: Omit<CookieConsent, 'necessary'>): void => {
  saveCookieConsent(selection)
}
