export function basename(filePath: string): string {
  return filePath.replace(/^.*[\\/]/, '')
}
