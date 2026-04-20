/**
 * RAG 매뉴얼 단일 원본(client/docs/rag/*.md) → server/rag_docs/ 복사
 * 배포·서버만 올릴 때 client 폴더가 없어도 동일 문서를 쓰기 위함.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '..');
const srcDir = path.join(clientRoot, 'docs', 'rag');
const destDir = path.resolve(clientRoot, '..', 'server', 'rag_docs');

if (!fs.existsSync(srcDir)) {
  console.warn('[sync-rag-docs] 건너뜀: 없음', srcDir);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
const files = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.md'));
if (files.length === 0) {
  console.warn('[sync-rag-docs] client/docs/rag 에 .md 없음');
  process.exit(0);
}

for (const f of files) {
  const from = path.join(srcDir, f);
  const to = path.join(destDir, f);
  fs.copyFileSync(from, to);
  console.log('[sync-rag-docs]', f, '→', to);
}
