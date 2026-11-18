import { buildStoryIndex, validIndex } from './story-store.mjs'
import { LOG_METADATA_VERSION, metadataFromLog, validLogMetadata } from '../src/lib/trpg-log-summary.ts'

export const buildLogIndex = items => buildStoryIndex(items).map((item, index) => ({ ...item, ...metadataFromLog(items[index].body), logMetadataVersion: LOG_METADATA_VERSION }))
export const validLogIndex = items => Array.isArray(items)
  && items.every(item => item && (item.logDate === undefined && item.preview === undefined || validLogMetadata(item)))
  && items.every(item => item.logMetadataVersion === undefined || item.logMetadataVersion === LOG_METADATA_VERSION)
  && validIndex(items.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'logDate' && key !== 'preview' && key !== 'logMetadataVersion'))), Infinity)
