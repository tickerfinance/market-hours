# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/tickerfinance/market-hours/security/advisories/new)
rather than opening a public issue.

We will acknowledge within five working days and keep you updated until it is resolved.

## Scope

This package has **zero runtime dependencies** and makes **no network calls**, reads no files and
touches no environment variables. Its attack surface is small by construction.

Things that are in scope:

- Denial of service through a crafted input — an instant string, a date, or a venue definition
  passed to `defineMarket`.
- Prototype pollution or unexpected mutation of a caller's objects.
- Anything in the published tarball that should not be there.

## A wrong date is not a vulnerability

If the package reports a market open when it was closed, that is a bug and matters — but it is a
correctness issue, not a security one. Please
[open a calendar correction](https://github.com/tickerfinance/market-hours/issues/new?template=calendar_correction.yml)
in public so others can see it.

## Supply chain

Releases are published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), so every published
version can be traced to the workflow run and commit that built it.
