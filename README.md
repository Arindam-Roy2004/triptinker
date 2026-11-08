# TripTinker

Describe a trip in a sentence or two and get a day-by-day itinerary you can actually work with: open a stop, drag it to a new time, move it to another day, delete it, ask the AI to tweak the plan, and save it for later.

Live: https://triptinker.royarindam.page

This is my submission for the Frontend Internship Assignment (trip planner). It is not a chatbot. The model never writes prose at the user. It returns JSON, the app checks that JSON against a schema, and the UI is built from the checked data.

## Run it

You need Node 20.11 or newer.

```bash
npm install
npm start
```

Then open http://localhost:4317.

That works with no setup at all. Without an API key you can still click **View sample** to try the full editing experience, and the footer has a **Test mode** panel that fakes a misbehaving model (more on that below).

To plan real trips, copy the example env file and add a key:

```bash
cp .env.example .env
# put your key in LLM_API_KEY
```

Any OpenAI-compatible endpoint works. `.env.example` has ready-made base URLs for OpenRouter (the default), OpenAI, Groq, Gemini and a local Ollama. The key lives only on the server and never reaches the browser.

Optional extras, all off unless configured:

- `TAVILY_API_KEY` grounds new plans in a quick web search and shows the sources it read.
- Voice input (the mic button) reuses the same key and base URL.

Other commands:

```bash
npm test            # unit and API tests (vitest)
npm run test:e2e    # browser tests (run `npx playwright install chromium` once first)
npm run typecheck
npm run lint
```

## What you can do

- Write a brief, pick the number of days and the pace, or tap one of the example chips. You can also dictate it.
- Watch the plan appear as it is written. The loader shows what the model is doing, the sources it found, and a live preview of the itinerary building up, with the raw JSON one tab away.
- Open any stop to see its details and a Maps link. Reorder stops by dragging or with the keyboard, move a stop to another day, or remove it (with undo).
- Ask for a change in plain language ("slow down day one", "add vegetarian dinners"). The AI proposes an edit, you see a diff of what would change, and nothing applies until you accept.
- Save trips, reopen them later, and export as PDF, text, or something you can paste into notes.
- Undo and redo, dark mode, and a layout that works on a phone.

## How it handles bad AI output

This is the part I cared about most, so here is what actually happens.

**One contract for both sides.** The request and response shapes live in `packages/contracts` as zod schemas. The browser validates input before sending, the server validates it again, and the server validates what the model sends back. Nothing reaches the UI without passing a schema.

**The pipeline** (`apps/backend/src/pipeline.ts`, `normalize.ts`):

1. The model streams text. The server pulls the JSON out (it copes with code fences and chatter around it) and normalises it.
2. If the output is malformed, the wrong shape, empty, or cut off, the server makes **one** corrective attempt, sending the model its own bad answer plus what was wrong with it.
3. Small damage is salvaged instead of thrown away. A single broken stop is dropped with a warning in the UI rather than failing the whole plan. If too much is dropped, the response is rejected.
4. If the repair fails too, the user gets a plain-language message and a retry button, never a crash and never a half-rendered plan.

**Slow and stuck models.** There are three separate timers: time to first token, silence between chunks, and a hard ceiling per attempt. A stalled stream is cut and reported instead of spinning forever.

**Stale responses can't win.** Every generation gets an id, starting a new one aborts the previous request, and every state update first checks that its id is still the current one (`use-generation.ts`). Pressing Stop, retrying, or loading a saved trip mid-run can't be overwritten by a late answer. Edits also stay locked while a proposed change is under review.

**Specific errors.** Provider outages, rate limits, auth failures, filtered content, lost connections and timeouts each map to their own message and next step (`problem-copy.ts`). Asking for something that isn't a trip gets guidance instead of an error.

**Test mode.** In development the footer has a panel that routes requests to a simulated model that fails on purpose: bad JSON once, bad JSON twice, wrong shape, empty answer, cut off mid-answer, partly broken stops, a stalled stream, a 503, rate limiting, and a brief that isn't a trip. It is switched off in production. The browser tests use it to check each of these paths without spending API credits.

Saved trips are read back through the same schema, so a corrupt or outdated entry in localStorage is discarded instead of breaking the app.

## How it is put together

```
apps/frontend    React 19 + Vite + Tailwind
apps/backend     Express 5: validation, model call, repair, streaming over SSE
packages/contracts   shared zod schemas, limits, the sample trip
tests/e2e        Playwright, desktop and mobile
```

- The backend is the only thing that talks to the model, which keeps the key off the browser.
- Results stream to the browser over server-sent events. A small partial-JSON parser (`partial-json.ts`) turns the half-written text into the live preview.
- Itinerary edits are plain functions in `operations.ts` and go through one store with undo and redo, so dragging, moving, removing and AI-proposed changes all behave the same way.
- Packages used for the harder UI bits: `@dnd-kit` for drag and keyboard reordering, `motion` for animation, Radix for menus and dialogs.
- In production the same Node process serves the built frontend, so there is one thing to run. `vercel.json` is included if you would rather host it on Vercel.

## Tests

- 141 unit and API tests cover the contracts, the JSON extraction and salvage logic, the repair pipeline, search, speech and the HTTP layer, including the failure cases above.
- 13 browser tests run on a desktop and a phone-sized viewport: sample editing and persistence, the failure scenarios, stop and retry, refinement review, and saved trips.

## AI usage

I used AI throughout, and I want to be upfront about how much.

- **Claude Code** wrote or helped write a large share of the code, including the UI polish, the loading panel, tests, and the deployment setup. I directed the work, reviewed it, and made the product decisions, but a lot of the typing was the assistant's.
- The model inside the app (`qwen/qwen3.8-flash` through OpenRouter by default) generates the itineraries at runtime.
- I also used AI to research how other component libraries handle loading and agent states. I took ideas, not code.

I can walk through the generation hook, the partial-JSON parser and the repair pipeline, which are the core of the project.

## Known limitations

- **Plan quality depends on the model.** It can suggest places that are closed, moved, or not where it says. The app tells people to check hours and bookings, and it does not verify anything against a live source. Web search helps but is not a guarantee.
- **One repair attempt.** If the model is wrong twice in a row, the user has to retry by hand.
- **Saved trips live in one browser.** There are no accounts, so clearing site data or switching devices loses them. Export is the backup.
- **Rate limiting is in memory** and per server process (20 plans a minute per visitor by default), which is fine for one instance but would need a shared store to scale out.
- **Plans are capped at 10 days** and briefs at 1,500 characters, to keep output inside the model's token budget.
- **Voice input** needs microphone permission and sends a short audio clip to the model provider for transcription.
- **No real maps.** Stops link out to Google Maps rather than showing an embedded map.
- **Drag on touch screens** uses the drag handle on each row, and the stop's Move earlier and Move later buttons are the fallback.

## Time spent

TODO: fill in honestly before submitting.

## What I would do next

- Return different block types from the model (a map, a budget chart, a packing checklist) and render each one appropriately.
- Share a trip by link.
- Move saved trips and rate limiting to a small database so they survive across devices and instances.
- Check suggested places against a places API before showing them.
