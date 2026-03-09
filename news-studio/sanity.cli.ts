import {defineCliConfig} from 'sanity/cli'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'lumv116w'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
const studioHost = process.env.SANITY_STUDIO_HOSTNAME || 'robottv'

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  project: {
    studioHost,
  },
})
