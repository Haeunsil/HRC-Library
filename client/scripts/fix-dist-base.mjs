import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * 실서버 배포 경로가 /HRClib/dist/ 인데도
 * 빌드 결과 index.html이 /assets/... 를 참조하는 케이스를 방지하기 위한 후처리 스크립트.
 *
 * - /assets/...  -> /HRClib/dist/assets/...
 * - /favicon.png -> /HRClib/dist/favicon.png (필요 시)
 * - version.json 생성 (배포 버전 검사용)
 * - asset URL에 ?v=BUILD_TIME 추가 (캐시 무효화)
 */
const DIST_DIR = path.resolve('dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const BASE = '/HRClib/dist/'
const BUILD_VERSION = Date.now().toString()

const html = await readFile(DIST_INDEX, 'utf8')

let replaced = html
  .replaceAll(' src="/assets/', ` src="${BASE}assets/`)
  .replaceAll(' href="/assets/', ` href="${BASE}assets/`)
  .replaceAll(' href="/favicon.png"', ` href="${BASE}favicon.png"`)

// asset URL에 캐시 무효화 쿼리 추가 (./assets/xxx, /HRClib/dist/assets/xxx)
replaced = replaced
  .replace(/(src|href)="([^"]*\/assets\/[^"]+\.(js|css))"/g, (_, attr, url) => {
    const sep = url.includes('?') ? '&' : '?'
    return `${attr}="${url}${sep}v=${BUILD_VERSION}"`
  })

// build-version 메타 태그 주입 (</head> 직전) - meta 태그가 없을 때만 추가
if (!replaced.includes('meta name="build-version"')) {
  replaced = replaced.replace('</head>', `<meta name="build-version" content="${BUILD_VERSION}" />\n</head>`)
} else {
  // 이미 있으면 버전만 갱신
  replaced = replaced.replace(/<meta name="build-version" content="\d+" \/>/, `<meta name="build-version" content="${BUILD_VERSION}" />`)
}

await writeFile(DIST_INDEX, replaced, 'utf8')

// version.json 생성
await writeFile(path.join(DIST_DIR, 'version.json'), JSON.stringify({ v: BUILD_VERSION }), 'utf8')

console.log(`[fix-dist-base] Updated ${DIST_INDEX} (base=${BASE}, version=${BUILD_VERSION})`)

