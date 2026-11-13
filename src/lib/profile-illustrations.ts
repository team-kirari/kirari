import { createIllustrationLibrary } from './profile-images'
export type { IllustrationVersion, ProfileIllustration } from './profile-images'
export const versionLabels = { old: '구일러스트', new: '신일러스트' }

// Only explicitly published raster assets in these four folders enter the bundle.
const files = import.meta.glob<string>('../../.local/kirari-private/assets/profiles/{kenji,kiyo}/{old,new}/*.{png,jpg,jpeg,webp,gif,PNG,JPG,JPEG,WEBP,GIF}', { eager: true, query: '?url', import: 'default' })
export const profileIllustrations = createIllustrationLibrary(files)
