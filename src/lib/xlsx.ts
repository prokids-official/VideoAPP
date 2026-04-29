import * as XLSX from 'xlsx'

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

export async function xlsxToMarkdown(input: File | ArrayBuffer): Promise<string> {
  const arrayBuffer = input instanceof File ? await input.arrayBuffer() : input
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return ''
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
  })

  if (rows.length === 0) {
    return ''
  }

  const width = Math.max(...rows.map((row) => row.length))
  const normalizedRows = rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeMarkdownCell(row[index])),
  )
  const [headerRow, ...bodyRows] = normalizedRows
  const dividerRow = Array.from({ length: width }, () => '---')

  return [
    `| ${headerRow.join(' | ')} |`,
    `| ${dividerRow.join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}
