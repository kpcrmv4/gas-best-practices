# AGENTS.md — gas-best-practices

> Universal entry point for any AI coding assistant.
> Read this file first when working with Google Apps Script code.

## Trigger conditions

Apply these rules when you detect any of:
- Files with `.gs` extension
- `appsscript.json` in project root
- `.clasp.json` in project root
- User mentions "Google Apps Script", "GAS", or "clasp"
- Code uses `SpreadsheetApp`, `DriveApp`, `HtmlService`, `UrlFetchApp`, or other GAS services
- `google.script.run` calls in HTML files

## How to use

When working on GAS code, consult `rules/<topic>.md` based on the task:

| Task | Read |
|---|---|
| New project setup, file organization | `rules/project-structure.md` |
| Read/write Sheet, batch operations, merged cells | `rules/spreadsheet-ops.md` |
| Web app with `google.script.run` | `rules/web-app-rpc.md` |
| HTML head, viewport, partial includes | `rules/htmlservice-frontend.md` |
| External frontend (GitHub Pages) + GAS API | `rules/external-frontend.md` |
| PDF generation from template | `rules/pdf-generation.md` |
| Drive folders, file sharing, image preview | `rules/drive-ops.md` |
| Concurrent operations | `rules/lock-service.md` |
| Caching queries | `rules/cache-service.md` |
| Year/month/enum dropdowns | `rules/dynamic-dropdowns.md` |
| Auth, role check, OAuth scopes | `rules/security.md` |
| Adding tables/columns to live system | `rules/schema-migrations.md` |
| Error handling, Thai user messages | `rules/error-handling.md` |
| Custom Sheet menus | `rules/onopen-menu.md` |
| Debug, log, execution history | `rules/testing-debugging.md` |
| Log at RPC boundaries (client + server) | `rules/logging-boundaries.md` |

## Core principles (cross-cutting)

1. **Every server function callable from client returns a `Result<T>` envelope** — never throw to client
2. **Read sheets once with `getDataRange().getValues()`** — but **write cell-by-cell** if the sheet may have merged cells
3. **Lazy resource creation** — folder IDs, sheets, columns auto-create on startup, store in Config sheet
4. **Cache user lookups + computed results** via `CacheService.getScriptCache()` with explicit invalidation
5. **Wrap concurrent mutations in `LockService.getScriptLock()`** with `try/finally { releaseLock() }`
6. **Store folder IDs in Config sheet** — not in script properties — for easy admin override
7. **Thai user-facing error messages** + English `Logger.log` for developers
8. **Log every RPC boundary** — `console.log` in client, `Logger.log` in server (entry + exit)
9. **Force text format for numeric fields with leading zeros** — phone, ID card, postal code (`setNumberFormat('@')` + apostrophe prefix)
10. **Recompute critical values server-side** — never trust client-calculated percentages/totals

## Output format for the AI

When suggesting GAS code:
- Reference the rule number/file (e.g., "per `rules/spreadsheet-ops.md` Rule #2")
- Show `✗ Bad` and `✓ Good` patterns when correcting common mistakes
- Use Thai for user-facing error messages, English for log messages
- Default to `let`/`const`, ES6+ (V8 runtime is standard now)
- Suggest `LockService` for any function that mutates shared state
