# UI tests (headless, jsdom)

Dev-only tool. **Not part of the app** — the app stays offline vanilla JS with no build.

These tests load the real `js/*.js` modules into a [jsdom](https://github.com/jsdom/jsdom)
window, inject a project via `App.state.setProject(...)`, bind the real handlers with
`App.dragDrop.refresh()`, dispatch real DOM events (e.g. a `drop` with a fake `dataTransfer`),
and assert on `App.state`. No browser, no network, fully offline after `npm install`.

This is the reliable way to test interaction logic (drag-and-drop, handlers) that the
in-browser `tests.html` unit tests (pure calc/validation) don't cover, and that the
`qa/` puppeteer scripts (which need a local Chrome) can't run headlessly here.

## Run

```
cd ui-tests
npm install          # jsdom
node dnd.test.js     # dashboard drag-and-drop behaviors
```

Exit code is non-zero if any assertion fails.

## Adding a test

Reuse `loadApp()` + `makeProject()` from `dnd.test.js`: build a scenario, call
`App.dragDrop.refresh()`, dispatch an event, assert on `App.state.getActiveScenario()`.
Keep fixtures phase-complete (every office/remote has a `phase`) — `normalizeProject`
guarantees that in the real app.
```
