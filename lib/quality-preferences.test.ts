import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeQualityOptions,
  normalizeQualityValue,
  resolvePreferredQuality,
  shouldInitializeQualitySelection,
  type QualityOption,
} from './quality-preferences'

function options(values: string[]): QualityOption[] {
  return values.map(value => ({
    value,
    label: `${value}p`,
    extension: 'mp4',
    filesize: null,
    size: 'Unknown size',
  }))
}

test('normalizes height values and sorts video formats numerically', () => {
  assert.equal(normalizeQualityValue('720p'), '720')
  assert.deepEqual(
    normalizeQualityOptions([
      { value: '720p', label: '720p' },
      { value: 144, label: '144p' },
      { value: '1080', label: '1080p' },
      { value: 'audio', label: 'Audio only' },
    ]).map(option => option.value),
    ['144', '720', '1080', 'audio'],
  )
})

test('selects an exact preferred quality when available', () => {
  assert.equal(resolvePreferredQuality(options(['144', '360', '480', '720', '1080']), '720'), '720')
})

test('falls back to the highest quality below the preference', () => {
  assert.equal(resolvePreferredQuality(options(['360', '480', '720']), '1080'), '720')
})

test('falls back to the lowest quality above the preference when no lower option exists', () => {
  assert.equal(resolvePreferredQuality(options(['1080']), '720'), '1080')
})

test('does not depend on backend format order', () => {
  assert.equal(resolvePreferredQuality(options(['720', '144', '1080', '360', '480']), '720'), '720')
  assert.equal(resolvePreferredQuality(options(['720', '144', '1080', '360', '480']), '900'), '720')
})

test('remembered quality is used only when remember previous quality is enabled', () => {
  const available = options(['480', '720', '1080'])
  assert.equal(resolvePreferredQuality(available, '720', null), '720')
  assert.equal(resolvePreferredQuality(available, '720', '1080'), '1080')
})

test('selection initialization is stable for rerenders and reinitializes for a new video', () => {
  assert.equal(shouldInitializeQualitySelection('video-a', 'video-a'), false)
  assert.equal(shouldInitializeQualitySelection('video-a', 'video-b'), true)
})
