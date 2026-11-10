import { expect, test } from 'claude-code/testing'

import { resultLine } from '../hooks/register'

const LIST = [
  '36 Artifacts made from the type "Design" …:',
  '- (mine) Checkout flow — mobile — https://claude.ai/artifact/ExampleAAAAAAAAAAAAAAA',
  '- (mine) Onboarding sign-in screens — https://claude.ai/artifact/ExampleBBBBBBBBBBBBBBB',
  '- (shared with the user) Pricing page [beta] — https://claude.ai/artifact/ExampleCCCCCCCCCCCCCCC',
].join('\n')
const ONBOARDING = 'https://claude.ai/artifact/ExampleBBBBBBBBBBBBBBB'

const PANE = {
  plugin: 'artifact-split',
  component: 'Pane',
  requestId: 'artifacts',
  props: {
    title: 'Artifacts',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a result line bolds the typed words and escapes the title', () => {
  expect(resultLine({ title: 'Onboarding sign-in screens', url: ONBOARDING, isMine: true }, 'onboarding'))
    .toBe(`- [**Onboarding** sign-in screens](${ONBOARDING})`)
  expect(resultLine({ title: 'Pricing [beta]', url: ONBOARDING, isMine: false }, ''))
    .toBe(`- [Pricing \\[beta\\]](${ONBOARDING}) · *shared*`)
})

test('search narrows the designs and a click opens one beside the chat', async ($, on) => {
  const tools: Array<Record<string, unknown>> = []
  const mcp: unknown[] = []
  on('command.register', () => ({ value: { command: 'designs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    tools.push(e as unknown as Record<string, unknown>)
    const action = (e as unknown as { action: string }).action
    return { result: {}, text: action === 'list' ? LIST : 'Opened the Artifact.' }
  })
  on('mcp.call', (_, e) => {
    mcp.push(e)
    return { value: { content: [{ type: 'text', text: 'Showing the artifact pane.' }], isError: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'designs', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(tools[0]).toMatchObject({ tool: 'Artifact', action: 'list', type: 'Design' })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^3 designs$/ }))?.text).toBe('3 designs')

    await ui.input({ key: 'q', text: 'onboarding', kind: 'change' })
    const results = await ui.find({ type: 'Markdown' })
    expect(results?.props).toMatchObject({ text: `- [**Onboarding** sign-in screens](${ONBOARDING})` })
    expect((await ui.find({ type: 'Text', text: /of 3/ }))?.text).toBe('1 of 3 designs')

    await ui.press({ key: 'results', link: { href: ONBOARDING } })
    expect(tools.at(-1)).toMatchObject({ tool: 'Artifact', action: 'open', url: ONBOARDING })
    expect(mcp.at(-1)).toEqual({ server: 'ccd_view', tool: 'show_pane', args: { pane: 'artifact' } })

    await ui.input({ key: 'q', text: 'nothing like it', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /No designs match/ })).toBeDefined()

    await ui.input({ key: 'q', text: '', kind: 'change' })
    await ui.unmount()
  }
})
