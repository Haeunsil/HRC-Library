/**
 * 배포 시 예전 asset 파일 유지
 * dist/ 내용을 대상 폴더로 복사하되, 기존 파일을 삭제하지 않음.
 * → 캐시된 index.html이 참조하는 예전 해시의 JS/CSS가 404가 되지 않음.
 *
 * 사용: node scripts/deploy-merge.mjs <대상경로>
 * 예: node scripts/deploy-merge.mjs D:\deploy\HRClib
 *     node scripts/deploy-merge.mjs ./deploy-target
 */
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.resolve('dist')
const TARGET = path.resolve(process.argv[2] || '.')

async function copyRecursive(src, dest) {
  const entries = await readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) {
      await mkdir(d, { recursive: true })
      await copyRecursive(s, d)
    } else {
      await mkdir(path.dirname(d), { recursive: true })
      await copyFile(s, d)
    }
  }
}

await copyRecursive(DIST, TARGET)
console.log(`[deploy-merge] Copied dist to ${TARGET} (existing files preserved)`)
