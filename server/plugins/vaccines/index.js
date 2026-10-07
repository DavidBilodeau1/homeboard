import express from 'express'
import { firstError, isOptionalString } from '../../checks.js'
import { checkClicSante, checkQuebec, seasonLabel, seasonStartYear } from './sources.js'
import { createCampaignWatch } from './watch.js'

/** MOCK_VACCINES=open|closed|failing serves a fixed status instead of asking Clic Santé and Québec.ca. */
const DEMO = process.env.MOCK_VACCINES

const demoWatch = (mode) => ({
  status: async () => ({
    season: seasonLabel(seasonStartYear(new Date())),
    open: mode === 'open',
    failing: mode === 'failing' ? ['quebec'] : [],
    sources: {},
    checkedAt: new Date().toISOString(),
  }),
})

function vaccinesRouter() {
  const watch = DEMO ? demoWatch(DEMO) : createCampaignWatch({ sources: { clicSante: checkClicSante, quebec: checkQuebec } })
  const router = express.Router()
  router.get('/status', async (_req, res) => res.json(await watch.status()))
  return router
}

export default {
  id: 'vaccines',
  validate: (settings) => firstError([
    [isOptionalString(settings.dismissedSeason), 'dismissedSeason must be a season like "2026-2027"'],
  ]),
  router: () => vaccinesRouter(),
}
