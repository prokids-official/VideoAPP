import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import * as XLSX from 'xlsx'

const outDir = path.dirname(fileURLToPath(import.meta.url))

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: '侏儒怪 第一集', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('旁白：很久很久以前，有一座磨坊。'),
        new Paragraph('角色：磨坊主的女儿。'),
      ],
    },
  ],
})

await fs.writeFile(path.join(outDir, 'script.docx'), await Packer.toBuffer(doc))

const workbook = XLSX.utils.book_new()
const sheet = XLSX.utils.aoa_to_sheet([
  ['镜号', '画面', '提示词'],
  ['001', '磨坊外景', 'moonlit mill, storybook style'],
  ['002', '室内纺线', 'girl spinning straw into gold'],
])
XLSX.utils.book_append_sheet(workbook, sheet, 'shots')
XLSX.writeFile(workbook, path.join(outDir, 'shot-list.xlsx'))
