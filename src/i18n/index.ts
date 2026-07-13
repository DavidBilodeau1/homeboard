import en from './en.json'
import fr from './fr.json'

const DICTS: Record<string, Record<string, string>> = { en, fr }

export type Translate = (key: string, vars?: Record<string, string | number>) => string

/**
 * Minimal translator: flat key lookup with `{var}` interpolation.
 * When `vars.count` is present, `key_one` / `key_other` take precedence
 * over `key`, giving simple pluralization.
 */
export const makeT = (lang: string): Translate => {
  const dict = DICTS[lang] ?? DICTS.en
  const lookup = (key: string) => dict[key] ?? DICTS.en[key]
  return (key, vars) => {
    let s: string | undefined
    if (vars && typeof vars.count === 'number') {
      s = lookup(`${key}_${vars.count === 1 ? 'one' : 'other'}`)
    }
    s ??= lookup(key) ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s!.replace(`{${k}}`, String(v))
    return s!
  }
}

/** config.language > config.locale prefix > browser language; falls back to en. */
export const resolveLanguage = (language?: string, locale?: string): string => {
  const cand = (language || locale || navigator.language || 'en').slice(0, 2).toLowerCase()
  return DICTS[cand] ? cand : 'en'
}

export const availableLanguages = Object.keys(DICTS)
