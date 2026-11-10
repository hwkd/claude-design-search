import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ArtifactRow, Listing, Scope } from '../types'

const PANE = 'artifacts'

const query = atom({ plugin: 'artifact-split', key: 'query' } as const, '')
const notice = atom({ plugin: 'artifact-split', key: 'notice' } as const, '')
const listing = atom(
  { plugin: 'artifact-split', key: 'listing' } as const,
  { scope: 'design', rows: [], isLoading: false },
  { shape: 'listing-1' },
)

// One row of the Artifact tool's list: "- (mine) Title — https://claude.ai/artifact/<id> ..."
const ROW = /^- \(([^)]*)\) (.+?) — (https:\/\/claude\.ai\/artifact\/[A-Za-z0-9]+)/

export function parseRows(text: string): ArtifactRow[] {
  const rows: ArtifactRow[] = []
  for (const line of text.split('\n')) {
    const m = ROW.exec(line.trim())
    if (m) rows.push({ isMine: m[1] === 'mine', title: m[2] ?? '', url: m[3] ?? '' })
  }
  return rows
}

export function matches(rows: ArtifactRow[], q: string): ArtifactRow[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter(r => words.every(w => r.title.toLowerCase().includes(w)))
}

function errorOf(r: { deny?: string; isError?: boolean; text?: string }): string | undefined {
  if (r.deny !== undefined) return r.deny
  if (r.isError === true) return r.text ?? 'the tool failed'
  return undefined
}

async function load($: EngineInterface, scope: Scope): Promise<void> {
  await update($, listing, l => ({ ...l, scope, isLoading: true, error: undefined }))
  try {
    const input =
      scope === 'design'
        ? { tool: 'Artifact', action: 'list', type: 'Design', limit: 50 }
        : { tool: 'Artifact', action: 'list', scope: 'all', limit: 200 }
    const r = await $.tool.call(input as never)
    const error = errorOf(r)
    const rows = error === undefined ? parseRows(r.text ?? '') : []
    await update($, listing, () => ({ scope, rows, error, isLoading: false }))
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await update($, listing, () => ({ scope, rows: [], error, isLoading: false }))
  }
}

// The desktop's own view tool: shows the session's Artifact pane beside the chat.
async function showArtifactPane($: EngineInterface): Promise<string | undefined> {
  try {
    const r = await $.mcp.call('ccd_view', 'show_pane', { pane: 'artifact' })
    const text = r.content.map(b => b.text ?? '').join(' ')
    if (r.isError === true) return text || 'the desktop refused'
    if (/isn't open in any window|not on screen/i.test(text)) return 'this session is not on screen'
    return undefined
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

async function openArtifact($: EngineInterface, row: ArtifactRow): Promise<string> {
  const r = await $.tool.call({ tool: 'Artifact', action: 'open', url: row.url } as never)
  const error = errorOf(r)
  if (error !== undefined) return `Couldn't open ${row.title}: ${error.slice(0, 160)}`
  const paneError = await showArtifactPane($)
  return paneError === undefined ? `Opened ${row.title}.` : `Opened ${row.title}, but the pane: ${paneError}`
}

// Markdown's own punctuation, escaped so a title draws as written.
function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}\[\]()<>#+!|~]/g, ch => `\\${ch}`)
}

// One result: the title as a link, the typed words bold, a quiet "shared" after.
export function resultLine(row: ArtifactRow, q: string): string {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  let title = ''
  let i = 0
  const lower = row.title.toLowerCase()
  while (i < row.title.length) {
    const hit = words.find(w => lower.startsWith(w, i))
    if (hit !== undefined) {
      title += `**${escapeMd(row.title.slice(i, i + hit.length))}**`
      i += hit.length
    } else {
      title += escapeMd(row.title.charAt(i))
      i += 1
    }
  }
  return `- [${title}](${row.url})${row.isMine ? '' : ' · *shared*'}`
}

async function say($: EngineInterface, text: string): Promise<void> {
  await update($, notice, () => text)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'designs',
      description: 'Search your design artifacts and open them in the Artifact pane beside the chat',
      argumentHint: '[search words]',
    })
    return next(e)
  })

  on('command.run', { command: 'designs' }, async ($, e) => {
    const words = typeof e.args === 'string' ? e.args.trim() : ''
    if (words !== '') await update($, query, () => words)
    await say($, '')
    await $.ui.open({ id: PANE, title: 'Artifacts', focus: true })
    const l = await read($, listing)
    if (l.rows.length === 0 && !l.isLoading) await load($, l.scope)
    return { text: 'Opened the Artifacts panel.' }
  }).catch(($, e, next) => (next.called ? next(e) : { text: "Couldn't open the Artifacts panel." }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Markdown, Select, Text } = $.ui.resolve(e)
    const l = await read($, listing)
    const q = await read($, query)
    const said = await read($, notice)
    const found = matches(l.rows, q)
    // Each result is one markdown line; keep a few rows for the header.
    const room = Math.max(6, e.props.scroll.bodyRows - 7)
    const shown = found.slice(0, room)
    const noun = l.scope === 'design' ? 'designs' : 'artifacts'
    const count = l.isLoading
      ? 'Loading…'
      : q.trim() === ''
        ? `${l.rows.length} ${noun}`
        : `${found.length} of ${l.rows.length} ${noun}`

    const open = async (url: string) => {
      const row = l.rows.find(r => r.url === url)
      if (row !== undefined) await say($, await openArtifact($, row))
    }

    return (
      // paddingTop keeps the search field's focus outline clear of the pane's top edge.
      <Box flexDirection="column" gap="sm" paddingTop="xs">
        <Input
          key="q"
          autoFocus
          placeholder={l.scope === 'design' ? 'Search designs' : 'Search all artifacts'}
          value={q}
          submitLabel="Open first"
          onInput={value => update($, query, () => value)}
          onSubmit={async value => {
            await update($, query, () => value)
            const first = matches(l.rows, value)[0]
            if (first !== undefined) await say($, await openArtifact($, first))
          }}
        />

        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="sm">
          <Box flexDirection="row" alignItems="center" gap="sm">
            <Select
              key="scope"
              options={[
                { value: 'design', label: 'Designs' },
                { value: 'all', label: 'All artifacts' },
              ]}
              value={l.scope}
              onSelect={value => load($, value === 'all' ? 'all' : 'design')}
            />
            <Text size="footnote" dimColor tabular>{count}</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap="sm">
            <Button key="refresh" plain dimColor label="Refresh" onPress={() => load($, l.scope)} />
            <Button
              key="show-pane"
              variant="secondary"
              label="Show Artifact pane"
              onPress={async () => {
                const err = await showArtifactPane($)
                await say($, err === undefined ? '' : `Artifact pane: ${err}`)
              }}
            />
          </Box>
        </Box>

        {l.error !== undefined && (
          <Text size="footnote" color="error">Couldn't list {noun}: {l.error.slice(0, 200)}</Text>
        )}
        {said !== '' && <Text size="footnote" dimColor>{said}</Text>}

        {!l.isLoading && l.error === undefined && shown.length === 0 && (
          <Text dimColor>{l.rows.length === 0 ? `No ${noun} yet.` : `No ${noun} match “${q.trim()}”.`}</Text>
        )}
        {shown.length > 0 && (
          <Markdown
            key="results"
            text={shown.map(row => resultLine(row, q)).join('\n')}
            pressableLinks={shown.map(row => row.url)}
            onLinkPress={link => open(link.href)}
          />
        )}
        {found.length > shown.length && (
          <Text size="footnote" dimColor>{found.length - shown.length} more — keep typing to narrow</Text>
        )}
      </Box>
    )
  })
}
