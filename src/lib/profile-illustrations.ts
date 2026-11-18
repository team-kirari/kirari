import { createIllustrationLibrary } from './profile-images'
export type { IllustrationVersion, ProfileIllustration } from './profile-images'
export const versionLabels = { old: '구일러스트', new: '신일러스트' }

// Only explicitly published raster assets in these four folders enter the bundle.
const files = import.meta.glob<string>('@private-assets/profiles/{kenji,kiyo}/{old,new}/*.{png,jpg,jpeg,webp,gif,PNG,JPG,JPEG,WEBP,GIF}', { eager: true, query: '?url', import: 'default' })
// Alias glob keys can be absolute when the checkout is outside the project.
// Normalize only this fixed, approved glob to the library's canonical paths.
export const profileIllustrations = createIllustrationLibrary(Object.fromEntries(Object.entries(files).map(([path, url]) => {
  const start = path.lastIndexOf('/profiles/')
  return [start < 0 ? path : `../assets${path.slice(start)}`, url]
})))
