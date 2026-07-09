export type FileKind = 'image' | 'text' | 'unsupported'

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.ico',
  '.avif'
])

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.xml',
  '.json',
  '.jsonc',
  '.md',
  '.markdown',
  '.yaml',
  '.yml',
  '.csv',
  '.tsv',
  '.log',
  '.ini',
  '.cfg',
  '.conf',
  '.config',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.env',
  '.toml',
  '.properties',
  '.svg',
  '.vue',
  '.svelte',
  '.graphql',
  '.gql',
  '.lua',
  '.php',
  '.swift',
  '.dart',
  '.r',
  '.dockerfile'
])

const TEXT_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'license',
  'readme',
  'changelog',
  '.gitignore',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc'
])

export function getFileKind(fileName: string): FileKind {
  const lower = fileName.toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : ''

  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (TEXT_FILENAMES.has(lower) || TEXT_FILENAMES.has(lower.replace(/^\./, ''))) return 'text'

  return 'unsupported'
}
