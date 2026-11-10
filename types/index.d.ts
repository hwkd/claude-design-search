export type ArtifactRow = { title: string; url: string; isMine: boolean }
export type Scope = 'design' | 'all'
export type Listing = { scope: Scope; rows: ArtifactRow[]; error?: string; isLoading: boolean }

declare module 'claude-code' {
  interface PluginState {
    'artifact-split': { query: string; listing: Shaped<Listing>; notice: string }
  }
}
