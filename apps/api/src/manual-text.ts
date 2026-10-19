import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** Isolate parsers from the API process; bound input, text output, heap and wall time. */
export function extractManualText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === 'application/msword')
    return Promise.reject(
      new Error(
        '旧版 DOC 暂不支持提取，请转换为 PDF 或 DOCX，或手工补充商品信息。',
      ),
    );
  if (buffer.length > 15 * 1024 * 1024)
    return Promise.reject(new Error('说明书超过解析限制'));
  const script = `
    const chunks=[];
    process.stdin.on('data',chunk=>chunks.push(chunk));
    process.stdin.on('end',async()=>{
      try {
        const buffer=Buffer.concat(chunks);
        let text;
        if(process.argv[1]==='application/pdf') {
          const {PDFParse}=require(process.argv[2]);
          const parser=new PDFParse({data:new Uint8Array(buffer),isEvalSupported:false,disableFontFace:true,verbosity:0});
          try {text=(await parser.getText({first:20})).text;} finally {await parser.destroy();}
        } else {text=(await require(process.argv[3]).extractRawText({buffer})).value;}
        process.stdout.write(String(text).split(String.fromCharCode(0)).join('').slice(0,30000));
      } catch {process.exitCode=1;}
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=128',
        '-e',
        script,
        mimeType,
        require.resolve('pdf-parse'),
        require.resolve('mammoth'),
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('说明书解析超时，请手工补充。'));
    }, 8000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 200000) {
        child.kill('SIGKILL');
        reject(new Error('说明书解析结果超限'));
      } else chunks.push(chunk);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('说明书解析失败，请手工补充。'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
      else reject(new Error('说明书解析失败或资源超限，请手工补充。'));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(buffer);
  });
}
