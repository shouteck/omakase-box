# Source grounding

The primary product source is the included `research/source.pdf`, Private engineering delegation, 2 October 2026, 35 pages and 45 references. Pages 5-7 describe private planning, PM discovery and task contracts; pages 13-16 cover technical checks, transfer, readiness and acceptance; pages 24-29 state the two hypotheses, breadth, intent, contract derivation, feedback and research limits. This packet makes implementation decisions beyond the research report; they are proposed MVP choices, not research findings.

Official implementation/workflow references consulted 2 October 2026:

- [OpenAI: execution plans](https://developers.openai.com/cookbook/articles/codex_exec_plans): persistent outcome-focused plans can guide multi-step work. This packet uses its own task/state protocol and is not a built-in automatic scheduler.
- [OpenAI: multi-agent](https://developers.openai.com/api/docs/guides/agents-api/multi-agent): available agent runtimes can coordinate independent subagents; shared-file edits need coordination. Runtime availability is not guaranteed by Markdown files.
- [Node release schedule](https://github.com/nodejs/Release): basis for Node 24 LTS default; resolve compatible patch versions at implementation.
- [React: build from scratch](https://react.dev/learn/build-a-react-app-from-scratch): basis for the Vite SPA choice.
- [Fastify validation/serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/): schema/response validation; application-owned schemas only. Never compile worker/model-supplied schemas as route code.
- [Ollama chat API](https://docs.ollama.com/api/chat) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs): local typed proposal adapter; validate returned JSON independently.
- [Docker Engine security](https://docs.docker.com/engine/security/) and [none network](https://docs.docker.com/engine/network/drivers/none/): container controls and runtime trust. Dedicated disposable VM isolation is an explicit project requirement beyond a basic Docker setup.

Security and execution reviewers independently challenged this packet's proposed boundaries before delivery. Their recommendations were incorporated into the specification; this is a plan review, not a review of working product code.
