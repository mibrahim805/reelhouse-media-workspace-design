export type QualityOption = {
  value: string
  label: string
  extension: string
  filesize: number | null
  size: string
}

const HEIGHT_PATTERN = /^(\d+)(?:p)?$/i

export function normalizeQualityValue(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'best'
  if (raw === 'audio' || raw === 'audio-only' || raw === 'mp3') return 'audio'
  if (raw === 'best' || raw === 'ask') return raw

  const height = raw.match(HEIGHT_PATTERN)?.[1]
  return height ? String(Number(height)) : raw
}

function qualityHeight(value: string): number | null {
  const normalized = normalizeQualityValue(value)
  return /^\d+$/.test(normalized) ? Number(normalized) : null
}

function defaultQualityLabel(value: string): string {
  const height = qualityHeight(value)
  if (height !== null) return `${height}p`
  if (value === 'audio') return 'Audio only'
  if (value === 'best') return 'Best available'
  return value
}

export function normalizeQualityOption(raw: Partial<Record<string, unknown>>): QualityOption {
  const value = normalizeQualityValue(raw.value ?? raw.label)
  const rawLabel = String(raw.label ?? '').trim()
  const filesize = typeof raw.filesize === 'number' ? raw.filesize : null

  return {
    value,
    label: rawLabel || defaultQualityLabel(value),
    extension: String(raw.extension ?? 'mp4'),
    filesize,
    size: String(raw.size ?? raw.filesize_label ?? 'Unknown size'),
  }
}

export function normalizeQualityOptions(raw: Array<Partial<Record<string, unknown>>>): QualityOption[] {
  const byValue = new Map<string, QualityOption>()

  for (const item of raw) {
    const option = normalizeQualityOption(item)
    const existing = byValue.get(option.value)
    if (!existing || (option.filesize ?? 0) > (existing.filesize ?? 0)) {
      byValue.set(option.value, option)
    }
  }

  return [...byValue.values()].sort((a, b) => {
    const aHeight = qualityHeight(a.value)
    const bHeight = qualityHeight(b.value)
    if (aHeight !== null && bHeight !== null) return aHeight - bHeight
    if (aHeight !== null) return -1
    if (bHeight !== null) return 1
    if (a.value === 'best') return -1
    if (b.value === 'best') return 1
    if (a.value === 'audio') return 1
    if (b.value === 'audio') return -1
    return a.value.localeCompare(b.value)
  })
}

export function resolvePreferredQuality(
  available: QualityOption[],
  preferredQuality: string,
  rememberedQuality?: string | null,
): string {
  const options = normalizeQualityOptions(available)
  const videoOptions = options.filter(option => qualityHeight(option.value) !== null)
  if (!videoOptions.length) return options[0]?.value ?? 'best'

  const effectivePreference = normalizeQualityValue(rememberedQuality || preferredQuality)
  const preferredHeight = qualityHeight(effectivePreference)
  if (preferredHeight === null) return videoOptions[videoOptions.length - 1].value

  const exact = videoOptions.find(option => qualityHeight(option.value) === preferredHeight)
  if (exact) return exact.value

  const below = videoOptions.filter(option => (qualityHeight(option.value) ?? 0) < preferredHeight)
  if (below.length) return below[below.length - 1].value

  const above = videoOptions.find(option => (qualityHeight(option.value) ?? 0) > preferredHeight)
  return above?.value ?? videoOptions[videoOptions.length - 1].value
}

export function shouldInitializeQualitySelection(previousIdentity: string, nextIdentity: string): boolean {
  return previousIdentity !== nextIdentity
}
