type Theme = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'theme' as const

export const getTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return (stored === 'light' || stored === 'dark' || stored === 'system')
      ? stored
      : 'system'
  } catch {
    return 'system'
  }
}

export const setTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)

    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else if (theme === 'light') {
      html.classList.remove('dark')
    } else {
      // system: check actual preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        html.classList.add('dark')
      } else {
        html.classList.remove('dark')
      }
    }
  } catch {
    // Silent fail if localStorage is not available
  }
}

export const getEffectiveTheme = (): 'light' | 'dark' => {
  const theme = getTheme()
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export const initTheme = (): void => {
  setTheme(getTheme())
}
