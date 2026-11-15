# TripTinker

Describe a trip in a sentence or two and get a day-by-day itinerary you can actually work with: open a stop, drag it to a new time, move it to another day, delete it, ask the AI to tweak the plan, and save it for later.

Live: https://triptinker.royarindam.page

## Demo video

https://github.com/user-attachments/assets/972debad-3591-4f55-b045-34d9f903d04c

About 2.5 minutes. It shows a real plan being generated, editing stops, asking the AI for a change, saving, and Test mode faking a bad model response. While the model is working the video is sped up, and a badge on screen says so. A full-quality copy is in [demo/triptinker-demo.mp4](demo/triptinker-demo.mp4).

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

The contracts bound text by Unicode character count, require integer counts and durations within explicit ranges, reject unknown fields in app-owned objects, and check nested IDs for uniqueness. A trip can contain at most 100 stops across 10 days; moving existing stops into one day and deleting every stop from a day remain valid. Source links must use HTTPS without credentials and match their displayed domain. Stream metadata, error details, transcripts and saved trips have limits too, including consistent repair attempts and timestamps. The limits live in `packages/contracts/src/limits.ts`; search relevance scores remain fractional values between 0 and 1.

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
- Place names in the trip box are highlighted as you type, with no model call: `apps/frontend/public/data/places.txt` (every city of 15,000+ people, every region and country) is built from [GeoNames](https://www.geonames.org) data (CC BY 4.0) by `scripts/build-places.mjs`, and loads in the background when the browser is idle.

## Tests

- 224 unit and API tests cover the contracts and their boundaries, saved-trip validation and clean-up of older saved trips, scene image loading, place and month highlighting in the trip box, JSON extraction and salvage, the repair pipeline, search, speech and the HTTP layer, including the failure cases above.
- 19 browser tests run on a desktop and a phone-sized viewport (two are desktop-only): sample editing and persistence, moving stops with undo and redo, scene preloading, transitions and arrow-key browsing, the failure scenarios, stop and retry, refinement review, and saved trips.

## AI usage

I used AI and I want to be upfront about how much.

- **Command Code** (in the terminal) with the **DeepSeek V4.1 Flash** model (`deepseek/deepseek-v4.1-flash-fast`) helped me build the first version: the project structure, schemas, server and main planner screens, and I iterated on that to create the current version. It also helped me write the README and this section.

I can walk through the generation hook, the partial-JSON parser and the repair pipeline, which are the core of the project.

## Known limitations

- **Plan quality depends on the model.** It can suggest places that are closed, moved, or not where it says. The app tells people to check hours and bookings, and it does not verify anything against a live source. Web search helps but is not a guarantee.
- **One repair attempt.** If the model is wrong twice in a row, the user has to retry by hand.
- **Saved trips live in one browser.** There are no accounts, so clearing site data or switching devices loses them. Export is the backup.
- **Rate limiting is in memory** and per server process (20 plans a minute per visitor by default), which is fine for one instance but would need a shared store to scale out.
- **Plans are capped at 10 days** and briefs at 1,500 characters, to keep output inside the model's token budget.
- **Voice input** needs microphone permission and sends a short audio clip to the model provider for transcription.
- **No real maps.** Stops link out to Google Maps rather than showing an embedded map.
- **No drag on phones.** Dragging needs the row handle, which is hidden on small screens. There you reorder with the Move earlier and Move later buttons on each stop.

## Time spent

For the initial version I spent about 8 hours, then I improved the frontend and all security and error handling after that. All commits and changes are in the git history.

## What I would do next

- Return different block types from the model (a map, a budget chart, a packing checklist) and render each one appropriately.
- Share a trip by link.
- Move saved trips and rate limiting to a small database so they survive across devices and instances.
- Check suggested places against a places API before showing them.
