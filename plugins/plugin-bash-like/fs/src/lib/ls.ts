/*
 * Copyright 2018-19 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  i18n,
  Arguments,
  ParsedOptions,
  MixedResponse,
  Registrar,
  Table,
  TableStyle,
  withLanguage
} from '@kui-shell/core'

import { FStat } from './fstat'
import { GlobStats } from './glob'
import { localFilepath } from './usage-helpers'

const strings = i18n('plugin-bash-like')

/**
 * If the given filepath is a directory, then ls it, otherwise cat it
 *
 */
const lsOrOpen = async ({ argvNoOptions, REPL }: Arguments) => {
  const filepath = argvNoOptions[argvNoOptions.indexOf('lsOrOpen') + 1]

  const stats = (await REPL.rexec<FStat>(`fstat ${REPL.encodeComponent(filepath)}`)).content

  const filepathForRepl = REPL.encodeComponent(filepath)

  if (stats.isDirectory) {
    return REPL.pexec(`ls ${filepathForRepl}`)
  } else {
    return REPL.pexec(`${stats.viewer} ${filepathForRepl}`)
  }
}

/**
 * Mimic ls -lh
 *
 */
function prettyBytes(size: number): string {
  if (size < 1024) {
    return `${size}B`
  } else if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}K`
  } else if (size < 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}M`
  } else if (size < 1024 * 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(1)}G`
  } else {
    return `${(size / 1024 / 1024 / 1024 / 1024).toFixed(1)}T`
  }
}

/**
 * Mimic ls -l for date
 *
 */
function prettyTime(ms: number, language: string): string {
  const date = new Date(ms)

  const datePart = date.toLocaleDateString(language, {
    month: 'short',
    day: '2-digit'
  })

  const timePart = date.toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  return `${datePart} ${timePart}`.replace(/(\s)0/g, '$1 ')
}

interface LsOptions extends ParsedOptions {
  l: boolean // wide output
  a: boolean // list with dots except for . and ..
  A: boolean // list with dots
  // s: boolean     //
  S: boolean // sort by size
  r: boolean // reverse sort order
  t: boolean // sort by last modified time
  d: boolean // don't traverse directories
}

/** sort by size */
const bySize = (rev: -1 | 1) => (a: GlobStats, b: GlobStats): number => {
  return rev * (b.stats.size - a.stats.size)
}

/** sort by last modification time */
const byTime = (rev: -1 | 1) => (a: GlobStats, b: GlobStats): number => {
  return rev * (b.stats.mtimeMs - a.stats.mtimeMs)
}

/** sort lexicographically by name */
const byLex = (rev: -1 | 1) => (a: GlobStats, b: GlobStats): number => {
  return rev * a.nameForDisplay.localeCompare(b.nameForDisplay)
}

/**
 * Decorate an entry according to its nature
 *
 */
function cssOf(glob: GlobStats): string {
  const { isDirectory, isSymbolicLink, isExecutable, isSpecial } = glob.dirent

  return isDirectory
    ? 'dir-listing-is-directory'
    : isSymbolicLink
    ? 'dir-listing-is-link'
    : isExecutable
    ? 'dir-listing-is-executable'
    : isSpecial
    ? 'dir-listing-is-other-special'
    : ''
}

/**
 * Decorate the name according to its nature
 *
 */
function nameOf(glob: GlobStats): string {
  return `${glob.nameForDisplay}${
    glob.dirent.isDirectory
      ? !glob.nameForDisplay.endsWith('/')
        ? '/'
        : ''
      : glob.dirent.isSymbolicLink
      ? '@'
      : glob.dirent.isExecutable
      ? '*'
      : ''
  }`
}

const outerCSSSecondary = 'hide-with-sidecar'
const cssSecondary = 'slightly-deemphasize'

function formatPermissions({ dirent }: GlobStats) {
  return dirent.permissions
}

function formatUid(entry: GlobStats) {
  return entry.dirent.username || entry.stats.uid.toString()
}
function formatGid(entry: GlobStats) {
  return entry.stats.gid.toString()
}

function attrs(entry: GlobStats, args: Arguments<LsOptions>) {
  const language = withLanguage(args.execOptions).language

  const wide = args.parsedOptions.l
  const perms = wide ? [{ value: formatPermissions(entry), outerCSS: outerCSSSecondary }] : []
  const uid = wide ? [{ value: formatUid(entry), outerCSS: '', css: cssSecondary }] : []
  const gid = wide ? [{ value: formatGid(entry), outerCSS: '', css: cssSecondary }] : []
  const size = [
    { value: prettyBytes(entry.stats.size).replace(/\s/g, ''), outerCSS: `${outerCSSSecondary} text-right` }
  ]
  const lastMod = [
    { value: prettyTime(entry.stats.mtimeMs, language), outerCSS: 'badge-width', css: `${cssSecondary} pre-wrap` }
  ]

  return perms
    .concat(uid)
    .concat(gid)
    .concat(size)
    .concat(lastMod)
}

/**
 * Turn an array of glob results into a Kui Table
 *
 */
function toTable(entries: GlobStats[], args: Arguments<LsOptions>): Table {
  const rev = args.parsedOptions.r ? -1 : 1
  const sorter = args.parsedOptions.S ? bySize(rev) : args.parsedOptions.t ? byTime(rev) : byLex(rev)

  const body = entries.sort(sorter).map(_ => ({
    name: nameOf(_),
    css: cssOf(_),
    onclickExec: 'qexec' as const,
    onclick: `lsOrOpen ${args.REPL.encodeComponent(_.path)}`,
    attributes: attrs(_, args)
  }))

  const wide = args.parsedOptions.l
  const perms = wide ? [{ value: 'PERMISSIONS', outerCSS: outerCSSSecondary }] : []
  const uid = wide ? [{ value: 'USER', outerCSS: '' }] : []
  const gid = wide ? [{ value: 'GROUP', outerCSS: '' }] : []
  const size = [{ value: 'SIZE', outerCSS: `${outerCSSSecondary} text-right` }]
  const lastMod = [{ value: 'LAST MODIFIED', outerCSS: 'badge-width' }]

  const header = {
    name: 'NAME',
    attributes: perms
      .concat(uid)
      .concat(gid)
      .concat(size)
      .concat(lastMod)
  }

  return {
    header,
    body,
    noSort: true,
    noEntityColors: true,
    style: TableStyle.Light
  }
}

/**
 * ls command handler
 *
 */
const doLs = (cmd: string) => async (opts: Arguments<LsOptions>): Promise<MixedResponse | Table | true> => {
  const semi = await opts.REPL.semicolonInvoke(opts)
  if (semi) {
    return semi
  }

  const entries = (
    await opts.REPL.rexec<GlobStats[]>(
      `kuiglob ${opts.argvNoOptions
        .slice(opts.argvNoOptions.indexOf(cmd) + 1)
        .map(_ => opts.REPL.encodeComponent(_))
        .join(' ')} ${opts.parsedOptions.l ? '-l' : ''} ${
        opts.parsedOptions.a || opts.parsedOptions.all || opts.parsedOptions.A ? '-a' : ''
      } ${opts.parsedOptions.d ? '-d' : ''}`
    )
  ).content
  return toTable(entries, opts)
}

const usage = (command: string) => ({
  command,
  title: strings('lsUsageTitle'),
  header: strings('lsUsageHeader'),
  noHelpAlias: true,
  optional: localFilepath.concat([
    { name: '-A', boolean: true, docs: strings('lsDashAUsageDocs') },
    {
      name: '-a',
      boolean: true,
      docs: strings('lsDashaUsageDocs')
    },
    { name: '-d', boolean: true, docs: strings('lsDashdUsageDocs') },
    {
      name: '-c',
      boolean: true,
      docs: strings('lsDashcUsageDocs')
    },
    { name: '-l', boolean: true, hidden: true },
    { name: '-h', boolean: true, hidden: true },
    {
      name: '-t',
      boolean: true,
      docs: strings('lsDashtUsageDocs')
    },
    { name: '-r', boolean: true, docs: strings('lsDashrUsageDocs') },
    { name: '-s', boolean: true, hidden: true }, // "show size", which we always do; so hidden: true
    { name: '-S', boolean: true, docs: strings('lsDashSUsageDocs') }
  ])
})

/**
 * Register command handlers
 *
 */
export default (commandTree: Registrar) => {
  commandTree.listen('/lsOrOpen', lsOrOpen, {
    hidden: true,
    inBrowserOk: true
  })
  const ls = commandTree.listen('/ls', doLs('ls'), {
    usage: usage('ls'),
    requiresLocal: true,
    inBrowserOk: true,
    flags: {
      boolean: usage('ls')
        .optional.filter(_ => _.boolean)
        .map(_ => _.name.replace(/^-(-)?/, ''))
    }
  })
  commandTree.synonym('/lls', doLs('lls'), ls, {
    usage: usage('lls'),
    requiresLocal: true,
    inBrowserOk: true
  })
}
