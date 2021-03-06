/*
 * Copyright 2019 IBM Corporation
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

import { Common, CLI, ReplExpect, Selectors } from '@kui-shell/test'

/*
 * Report on export testcases
 * yes: export FOO=bar; echo $FOO -> bar
 * no: export FOO=(3 4); echo $FOO => 3
 * yes: export FOO="bar baz"; echo $FOO -> bar baz
 * no: export FOO=bar=baz; echo $FOO -> bar=baz
 * no: export FOO=bar" "baz; echo $FOO -> bar baz
 * yes: export FOO=bar\ baz; echo $FOO -> bar baz
 */

const value1 = 'nnnnnn'
const value2 = 'bar baz'
const value3 = 'mmmmmm'

describe('export command', function(this: Common.ISuite) {
  before(Common.before(this))
  after(Common.after(this))

  Common.pit(`should fail with export without args`, () =>
    CLI.command(`export`, this.app)
      .then(ReplExpect.error(497))
      .catch(Common.oops(this, true))
  )

  Common.pit(`should export foo=${value1}`, () =>
    CLI.command(`export foo=${value1}`, this.app)
      .then(ReplExpect.justOK)
      .then(() => CLI.command('printenv foo', this.app).then(ReplExpect.okWithString(value1)))
      .catch(Common.oops(this))
  )

  Common.pit('should export foo bar baz with space in string', () =>
    CLI.command(`export foo="${value2}"`, this.app)
      .then(ReplExpect.justOK)
      .then(() => CLI.command('printenv foo', this.app).then(ReplExpect.okWithString(value2)))
      .catch(Common.oops(this))
  )

  Common.pit('should open new tab', () =>
    CLI.command('tab new', this.app)
      .then(() => CLI.waitForSession(this))
      .catch(Common.oops(this))
  )

  Common.pit('should show no value for foo in the new tab', () =>
    CLI.command('printenv foo', this.app)
      .then(ReplExpect.blank)
      .catch(Common.oops(this))
  )

  Common.pit(`should export foo ${value3}`, () =>
    CLI.command(`export foo=${value3}`, this.app)
      .then(ReplExpect.justOK)
      .catch(Common.oops(this))
  )

  Common.pit('should printenv the new value for foo in the second tab', () =>
    CLI.command('printenv foo', this.app)
      .then(ReplExpect.okWithString(value3))
      .catch(Common.oops(this))
  )

  Common.pit('should switch back to the first tab', () =>
    CLI.command('tab switch 1', this.app)
      .then(() => this.app.client.waitForVisible(Selectors.TAB_SELECTED_N(1)))
      .catch(Common.oops(this))
  )

  Common.pit('should show the first-tab value for foo in the first tab', () =>
    CLI.command('printenv foo', this.app)
      .then(ReplExpect.okWithString(value2))
      .catch(Common.oops(this))
  )

  Common.pit('should switch back to the second tab', () =>
    CLI.command('tab switch 2', this.app)
      .then(() => this.app.client.waitForVisible(Selectors.TAB_SELECTED_N(2)))
      .catch(Common.oops(this))
  )

  Common.pit('should show the second-tab value for foo in the second tab', () =>
    CLI.command('printenv foo', this.app)
      .then(ReplExpect.okWithString(value3))
      .catch(Common.oops(this))
  )
})
