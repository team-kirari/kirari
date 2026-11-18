import test from 'node:test'
import assert from 'node:assert/strict'
import { storyStatistics } from '../src/lib/story-statistics.ts'

test('empty input and whitespace do not create words, paragraphs or sentences', () => {
  assert.deepEqual(storyStatistics(''), { withSpaces: 0, withoutSpaces: 0, words: 0, paragraphs: 0, sentences: 0 })
  assert.deepEqual(storyStatistics(' \t\n\n'), { withSpaces: 4, withoutSpaces: 0, words: 0, paragraphs: 0, sentences: 0 })
})

test('Korean prose counts blank-line paragraphs and sentences including the last unfinished sentence', () => {
  assert.deepEqual(storyStatistics('안녕 세상. 반가워요!\n\n다음 문단입니다.'), { withSpaces: 23, withoutSpaces: 18, words: 5, paragraphs: 2, sentences: 3 })
  assert.equal(storyStatistics('첫 줄\n다음 줄').paragraphs, 1)
  assert.equal(storyStatistics('첫 문단\n \t\n다음 문단').paragraphs, 2)
  assert.equal(storyStatistics('끝나지 않은 문장').sentences, 1)
})

test('visible Unicode characters, CRLF, punctuation and scene breaks have consistent counts', () => {
  assert.deepEqual(storyStatistics('e\u0301 👨‍👩‍👧‍👦\t가\n'), { withSpaces: 6, withoutSpaces: 3, words: 2, paragraphs: 1, sentences: 1 })
  assert.deepEqual(storyStatistics('가\r\n\r\n나'), storyStatistics('가\n\n나'))
  assert.deepEqual(storyStatistics('***\n\n***'), { withSpaces: 8, withoutSpaces: 6, words: 0, paragraphs: 0, sentences: 0 })
  assert.equal(storyStatistics('... ! ?').sentences, 0)
  assert.deepEqual(storyStatistics('Hello,world! How are you?\n\nFinal fragment'), { withSpaces: 41, withoutSpaces: 35, words: 7, paragraphs: 2, sentences: 3 })
})
