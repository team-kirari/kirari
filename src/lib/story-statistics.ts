import { storyBlocks } from './stories.ts'

const characters = new Intl.Segmenter('ko', { granularity: 'grapheme' })
const words = new Intl.Segmenter('ko', { granularity: 'word' })
const sentences = new Intl.Segmenter('ko', { granularity: 'sentence' })

export function storyStatistics(body: string) {
  const text = body.replace(/\r\n?/g, '\n')
  let withSpaces = 0, withoutSpaces = 0, wordCount = 0, paragraphCount = 0, sentenceCount = 0
  for (const { segment } of characters.segment(text)) {
    withSpaces++
    if (/\S/u.test(segment)) withoutSpaces++
  }
  for (const block of storyBlocks(text)) {
    if (block.kind !== 'paragraph') continue
    paragraphCount++
    for (const word of words.segment(block.text)) if (word.isWordLike) wordCount++
    for (const { segment } of sentences.segment(block.text)) {
      if (/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(segment)) sentenceCount++
    }
  }
  return { withSpaces, withoutSpaces, words: wordCount, paragraphs: paragraphCount, sentences: sentenceCount }
}
