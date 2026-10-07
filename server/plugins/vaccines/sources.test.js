import { describe, expect, it } from 'vitest'
import { bookingBox, campaignFlagName, flagId, lastUpdated, mainScriptUrl, readQuebecPage, seasonStartYear } from './sources.js'

// Trimmed from the real Québec.ca page as archived before and after booking opened.
const page = (box, updated) => `<main><h1>Vaccination saisonnière contre les virus respiratoires</h1>
<div id="c232000" class=" frame frame-default frame-type-textmedia frame-layout-0"><h2 class=""> Prise de rendez-vous </h2><div class="ce-textpic ce-left ce-above"><div class="ce-bodytext">${box}</div></div></div> <!-- Tous les autres frames -->
<div id="c232001" class="frame frame-default"><h2>Immunisation contre le virus respiratoire syncytial (VRS)</h2><p><a href="https://www.quebec.ca/sante/vrs">VRS</a></p></div>
<p class="dateMiseAJour"> Dernière mise à jour : ${updated} </p></main>`

const BEFORE_2024 = page('<p>Il sera possible de prendre rendez-vous pour la vaccination contre la COVID-19 et contre la grippe sous peu, cet automne. Un lien sera alors ajouté dans cette page.</p>', '27 septembre 2024')
const OPEN_2025 = page('<p>Il est possible de prendre rendez-vous pour la vaccination contre la COVID-19 et contre la grippe.</p><p><a href="https://portal3.clicsante.ca/services/vaccination-covid-grippe" target="_blank" class="button-base primary" rel="noreferrer" data-external-link="true">Prendre un rendez-vous</a></p><p>Il est aussi possible de prendre rendez-vous en téléphonant au <a href="tel:+18776444545">1&nbsp;877&nbsp;644-4545</a>&nbsp;:</p>', '6 octobre 2025')
const BEFORE_2026 = page('<p>Il sera possible de prendre rendez-vous pour les vaccins contre la COVID-19 et la grippe au début de l’automne. Un lien sera alors ajouté dans cette page.</p>', '28 septembre 2026')

describe('readQuebecPage', () => {
  it('is closed while the box only promises a link', () => {
    expect(readQuebecPage(BEFORE_2024, 2024).state).toBe('closed')
    expect(readQuebecPage(BEFORE_2026, 2026).state).toBe('closed')
  })

  it('is open once the box links to the booking site', () => {
    expect(readQuebecPage(OPEN_2025, 2025)).toEqual({ state: 'open', link: 'https://portal3.clicsante.ca/services/vaccination-covid-grippe' })
  })

  it('ignores a box left open from the previous season', () => {
    expect(readQuebecPage(OPEN_2025, 2026).state).toBe('closed')
  })

  it('ignores links in the following sections', () => {
    expect(bookingBox(BEFORE_2026)).not.toContain('vrs')
  })

  it('fails loudly when the box is gone', () => {
    expect(() => readQuebecPage('<main><h2>Autre chose</h2></main>', 2026)).toThrow('booking box not found')
  })
})

describe('lastUpdated', () => {
  it('reads French dates, including the first of the month', () => {
    expect(lastUpdated('Dernière mise à jour : 29 août 2025')).toEqual(new Date(2025, 7, 29))
    expect(lastUpdated('Dernière mise à jour : 1er octobre 2026')).toEqual(new Date(2026, 9, 1))
    expect(lastUpdated('no date here')).toBeNull()
  })
})

describe('Clic Santé flag lookup', () => {
  const script = 'const Et={ENABLE_FLU_COVID_CAMPAIGN:223,ENABLE_RECAPTCHA_V3:224,ENABLE_FLU_COVID_CAMPAIGN_2026:242,HOME_NEWS_ARTICLES:247}'

  it('finds the main script on the portal page', () => {
    const html = '<script type="module" crossorigin src="/assets/index-d5f22c9c-6c1826fb.js"></script><script src="/js/polyfills.js"></script>'
    expect(mainScriptUrl(html)).toBe('https://portal3.clicsante.ca/assets/index-d5f22c9c-6c1826fb.js')
  })

  it('finds this season’s flag by name, not last season’s', () => {
    expect(flagId(script, campaignFlagName(2026))).toBe(242)
    expect(flagId(script, campaignFlagName(2027))).toBeNull()
  })

  it('names the flag after the season’s first year', () => {
    expect(campaignFlagName(seasonStartYear(new Date(2027, 0, 15)))).toBe('ENABLE_FLU_COVID_CAMPAIGN_2026')
    expect(campaignFlagName(seasonStartYear(new Date(2027, 8, 1)))).toBe('ENABLE_FLU_COVID_CAMPAIGN_2027')
  })
})
