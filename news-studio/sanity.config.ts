import {defineConfig} from 'sanity'
import {deskTool} from 'sanity/desk'
import {schemaTypes} from './schemas'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'lumv116w'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineConfig({
  name: 'default',
  title: 'robot.tv News CMS',
  projectId,
  dataset,
  basePath: '/',
  plugins: [deskTool()],
  schema: {
    types: schemaTypes,
  },
})
