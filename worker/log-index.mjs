import { buildStoryIndex, validIndex } from './story-store.mjs'
import { Buffer } from 'node:buffer'
import { LOG_METADATA_VERSION, metadataFromLog, validLogMetadata } from '../src/lib/trpg-log-summary.ts'

export const decodeLogBase64 = encoded => Buffer.from(encoded, 'base64')
export const buildLogIndex = items => buildStoryIndex(items).map((item, index) => ({ ...item, ...metadataFromLog(items[index].body, decodeLogBase64), logMetadataVersion: LOG_METADATA_VERSION }))
export const validLogIndex = items => Array.isArray(items)
  && items.every(item => item && (item.logDate === undefined && item.preview === undefined || validLogMetadata(item)))
  && items.every(item => item.logMetadataVersion === undefined || item.logMetadataVersion === LOG_METADATA_VERSION)
  && items.every(item => item.storage === undefined || item.storage === 'file' || item.storage === 'archive')
  && items.every(item => item.logMetadataVersion !== LOG_METADATA_VERSION || validLogMetadata(item))
  && items.every(item => item.storage !== 'file' || item.logMetadataVersion === LOG_METADATA_VERSION && item.protected === true)
  && validIndex(items.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => !['logDate', 'preview', 'logMetadataVersion', 'storage'].includes(key)))), Infinity)
