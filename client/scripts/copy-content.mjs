/**
 * public/content → dist/content 만 복사 (Vite 재실행 없이 공지·Update JSON 반영)
 * 사용: npm run copy-content
 * 배포 서버에서는 dist/content/*.json 파일만 직접 교체해도 동일 효과.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'public', 'content');
const distDir = path.join(root, 'dist', 'content');

if (!fs.existsSync(srcDir)) {
    console.error('[copy-content] 없음:', srcDir);
    process.exit(1);
}

if (!fs.existsSync(path.join(root, 'dist'))) {
    console.error('[copy-content] dist 폴더가 없습니다. 먼저 npm run build 를 한 번 실행하세요.');
    process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
    console.warn('[copy-content] 복사할 .json 이 public/content 에 없습니다.');
    process.exit(0);
}

for (const f of files) {
    fs.copyFileSync(path.join(srcDir, f), path.join(distDir, f));
    console.log('[copy-content]', f, '→ dist/content/');
}
console.log('[copy-content] 완료. IIS/정적 서버에 dist 만 반영하면 됩니다.');
