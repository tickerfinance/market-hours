# Compatibility

Every claim in the README's compatibility table, and the job that proves it.

| Claim                                  | Proven by                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Node 20, 22, 24                        | `ci.yml` → `test-matrix`, the full suite on each                                      |
| Node 18                                | `ci.yml` → `consume`, installing the packed tarball and importing it both ways        |
| Eight host time zones                  | `ci.yml` → `test-matrix` sets `TZ`; `npm run test:tz` locally                         |
| ESM and CommonJS                       | `ci.yml` → `package`, importing and requiring the packed tarball from a clean project |
| Cloudflare Workers                     | `runtimes.yml` → `workerd`, the unit suite inside miniflare                           |
| Bun, Deno                              | `runtimes.yml`, installing the packed tarball and using it                            |
| Chromium, Firefox, WebKit              | `runtimes.yml` → `browsers`                                                           |
| TypeScript 4.8 → 7                     | `ci.yml` → `typecheck-consumers`                                                      |
| Bundler resolution                     | `publint --strict` and `@arethetypeswrong/cli --pack`                                 |
| Degrades safely without time-zone data | `runtimes.yml` → `no-time-zone-data`                                                  |

## Node

Node 18 is the floor: `engines` says `>=18`. Emitted JavaScript targets ES2019, which is well
below anything in the support matrix but keeps the output readable.

The suite runs on 20, 22 and 24 under both `UTC` and `Europe/London`, plus six exotic zones on
Node 22.

Node 18 is covered differently, and deliberately. Vitest 4 requires Node 20, so the suite cannot
run there — but that is a constraint on the _test runner_, not on the package. The `consume` job
therefore installs the packed tarball on Node 18 and exercises it through both `import` and
`require`, which is exactly what a consumer on Node 18 does. Claiming the full suite ran on Node 18
would have been untrue.

## Host time zones

The package must give identical answers regardless of the machine's own zone. Each zone in the
matrix breaks a specific assumption:

| Zone                  | Breaks                                                 |
| --------------------- | ------------------------------------------------------ |
| `UTC`                 | The happy path — and the only one most CI ever tests   |
| `Europe/London`       | Host zone equal to venue zone, which hides offset bugs |
| `America/New_York`    | Negative whole-hour offset                             |
| `America/St_Johns`    | Negative half-hour offset, −03:30                      |
| `Asia/Kolkata`        | Positive half-hour offset, +05:30, no DST              |
| `Pacific/Chatham`     | 45-minute offset, +12:45 / +13:45                      |
| `Australia/Lord_Howe` | DST step of 30 minutes rather than an hour             |
| `Pacific/Kiritimati`  | +14, always a day ahead of UTC                         |

The date-line zone is what catches "the civil date is a day out". The 45-minute and 30-minute-DST
zones catch offset arithmetic that assumes whole hours.

## Module formats

Two `tsc` invocations produce `dist/esm` and `dist/cjs`; a three-line script drops a
`{"type":"commonjs"}` marker into the CommonJS directory. No bundler.

Dual output is not optional. Consumers include Jest with `ts-jest`, `module: commonjs` and classic
`moduleResolution: node` — which ignores the `exports` map entirely and falls back to top-level
`main` and `types` — alongside workerd and Next.js, which need real ESM. Both are declared and both
are exercised against the packed tarball.

`isMarketHoursError` exists because of this: a bundle can legitimately contain both copies of the
error class, and `instanceof` fails across that boundary.

## TypeScript

Four consumer shapes are typechecked in `test/typecheck/`, each on the TypeScript versions where
its own configuration is legal — TypeScript 7 removed `target: es5` and `moduleResolution: node10`,
and `verbatimModuleSyntax` did not exist before 5.0, so a flat matrix would only be testing the
compiler's deprecations:

| Fixture            | Represents                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `ts48`             | `module: commonjs`, classic `node` resolution, no `exports` map support                                 |
| `cjs-node16`       | CommonJS resolving through the `require` condition                                                      |
| `verbatim-bundler` | `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `bundler` resolution  |
| `es5-target`       | `target: es5`, `lib: es5`, `skipLibCheck: false` — the shipped `.d.ts` may not depend on any modern lib |

| Fixture            | TypeScript versions |
| ------------------ | ------------------- |
| `ts48`             | 4.8, 5.0, 5.5, 5.9  |
| `es5-target`       | 4.8, 5.9            |
| `cjs-node16`       | 4.8, 5.5, latest    |
| `verbatim-bundler` | 5.0, 5.5, latest    |

The public surface therefore avoids `const` type parameters, `satisfies`, runtime `enum`s, and any
`Promise` or `Intl` type — the last of which is why `formatter-cache.ts` declares its own structural
`ZoneFormatter` rather than returning an `Intl.DateTimeFormat`. Each fixture also sets
`"types": []`, so the shipped declarations have to stand on their own without any ambient `@types`.

## Cloudflare Workers

`vitest.workers.config.ts` runs the suite inside workerd through miniflare, with **no**
`nodejs_compat` flag. If a Node built-in, `process`, `Buffer` or filesystem call had crept in,
nothing would import.

Specs are excluded by capability, not by directory. Only `packlist.test.ts` and
`fixtures.test.ts` are skipped, because they shell out to npm and read the repository — properties
of the harness rather than the package. Everything else runs, which matters most for the
differential suite: a different ICU build is precisely where a time-zone implementation diverges,
so checking ~325k instants against an independent oracle is worth more inside workerd and three
browser engines than it is on a developer's machine.

## React Native and Hermes

**Supported only where the engine provides `Intl` with IANA time-zone data.** This is not tested on
a device, and the README says so.

Some builds ship `Intl` without time-zone data. Worse, some accept a zone name and then silently
format in UTC — which would make every London answer an hour wrong for seven months a year without
raising anything.

So capability is established with a known-answer probe rather than a feature check, and the package
**throws `TIME_ZONE_UNAVAILABLE` rather than returning a wrong answer**. All three failure modes are
asserted against the built output in `test/consumer/refuses-without-timezone-data.mjs`, each in its own process.

```ts
import { getTimeZoneSupport } from 'market-hours';

const support = getTimeZoneSupport('Europe/London');
if (!support.supported) {
  // 'no-intl' | 'no-time-zone-support' | 'incorrect-offsets'
  console.warn(support.reason, support.detail);
}
```

## AWS Lambda

Supported, because it is Node — but not separately tested, and the README says that too.
