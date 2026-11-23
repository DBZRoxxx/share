export interface LatestRelease {
  version: string
  downloadUrl: string
  sizeMb: number | null
  publishedAt: string | null
}

export const GITHUB_REPO = process.env.GITHUB_REPO ?? 'DBZRoxxx/share'
export const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`

interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
}

/** Latest Windows installer from GitHub Releases, cached for 10 minutes. */
export async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'share-web' },
      next: { revalidate: 600 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      tag_name: string
      published_at?: string
      assets: GitHubAsset[]
    }
    const installer =
      data.assets.find((a) => /setup.*\.exe$/i.test(a.name)) ??
      data.assets.find((a) => a.name.endsWith('.exe'))
    if (!installer) return null
    return {
      version: data.tag_name.replace(/^v/, ''),
      downloadUrl: installer.browser_download_url,
      sizeMb: Math.round(installer.size / 1024 / 1024),
      publishedAt: data.published_at ?? null,
    }
  } catch {
    return null
  }
}
