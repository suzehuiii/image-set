import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractManualText } from './manual-text.js';
describe('manual text extraction', () => {
  it('extracts DOCX body text without rendering HTML', async () => {
    const buffer = Buffer.from(
      zipSync({
        '[Content_Types].xml': strToU8(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        'word/document.xml': strToU8(
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Capacity: 500 ml</w:t></w:r></w:p></w:body></w:document>',
        ),
      }),
    );
    expect(
      await extractManualText(
        buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toContain('500 ml');
  });
  it('extracts a valid PDF in an isolated parser process', async () => {
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    const content = 'BT /F1 16 Tf 40 150 Td (Capacity: 500 ml) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    for (const [i, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    expect(
      await extractManualText(Buffer.from(pdf), 'application/pdf'),
    ).toContain('500 ml');
  });
  it('rejects unsupported DOC and malformed PDFs with recoverable messages', async () => {
    await expect(
      extractManualText(Buffer.from('doc'), 'application/msword'),
    ).rejects.toThrow('DOC');
    await expect(
      extractManualText(Buffer.from('not a pdf'), 'application/pdf'),
    ).rejects.toThrow('解析失败');
  });
});
