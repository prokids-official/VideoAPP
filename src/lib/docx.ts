import mammoth from 'mammoth'

type MammothMarkdownInput = { arrayBuffer: ArrayBuffer } | { buffer: Buffer }

interface MammothMarkdown {
  convertToMarkdown(input: MammothMarkdownInput): Promise<{ value: string }>
}

const mammothMarkdown = mammoth as unknown as MammothMarkdown
const SCRIPT_LABELS = new Set([
  '旁白',
  '角色',
  '对白',
  '对话',
  '场景',
  '镜头',
  '画面',
  '动作',
  '字幕',
  '音乐',
  '音效',
  '提示词',
  'Narration',
  'Character',
  'Dialogue',
  'Scene',
  'Shot',
  'Action',
  'Prompt',
])

export async function docxToMarkdown(input: File | ArrayBuffer): Promise<string> {
  const arrayBuffer = input instanceof File ? await input.arrayBuffer() : input
  const result =
    typeof Buffer === 'undefined'
      ? await mammothMarkdown.convertToMarkdown({ arrayBuffer })
      : await mammothMarkdown.convertToMarkdown({ buffer: Buffer.from(arrayBuffer) })

  return formatDocxMarkdown(result.value)
}

export function formatDocxMarkdown(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => formatMarkdownLine(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatMarkdownLine(line: string): string {
  if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('- ') || line.startsWith('* ')) {
    return line
  }

  const match = /^([\p{Script=Han}A-Za-z ]{1,24})[：:]\s*(.+)$/u.exec(line)
  if (!match) {
    return line
  }

  const label = match[1].trim()
  const body = match[2].trim()
  if (!SCRIPT_LABELS.has(label) || !body) {
    return line
  }

  return `> **${label}**：${body}`
}
