# Herbal-Ai: Frontend and Backend Defence Reviewers

Prepared: 12 October 2026. Implementation reference: `b74cae4602431f817a5f579c8ede994a8710c7bb`.

These are separate technical study guides, based on the repository's implementation rather than a generic capstone template. They explain how the system works, how to demonstrate it, and how to answer common panel questions. There is no project-manager reviewer in this folder.

## Choose your reviewer

- [Frontend reviewer](FRONTEND_REVIEWER.md): pages, components, state, forms, authentication UI, live updates, accessibility, browser diagnostics, and presentation questions.
- [Backend reviewer](BACKEND_REVIEWER.md): API processing, authentication, database relationships, RAG, moderation, email, messaging, concurrency, credit safeguards, and presentation questions.

## Understand the whole system first

Herbal-Ai is an educational repository of Philippine medicinal-plant information. Visitors explore reviewed records. Contributors can sign in, submit plant information, use Dr. Ai, and participate in community discussions and direct messages. Administrators review submissions and maintain published records and source-grounded knowledge-base facts.

```text
User action in the browser
        |
        v
Next.js / React frontend on Vercel
        |
        | /api requests over HTTPS, forwarded to the backend
        v
Express / TypeScript backend on Railway
        |
        +-- PostgreSQL / pgvector on Neon: persistent records and embeddings
        +-- Gemini: embeddings and answer generation
        +-- Cloudinary: uploaded image storage
        +-- Email provider: verification, recovery and review messages
        +-- Socket.IO: real-time events to connected browsers
```

Dr. Ai answer streaming uses an HTTP server-sent event response. Community, messenger and notification live updates use Socket.IO. These are different mechanisms.

**A short introduction you can say:**

> Herbal-Ai organizes Philippine medicinal-plant records with sources, preparation information and safety notes. The frontend presents the workflows, while the backend validates requests, protects accounts, manages the database and retrieves source material for Dr. Ai. It is an educational capstone, not a diagnostic or prescribing service.

## How to study

1. Read the quick explanation in your assigned reviewer.
2. Understand one complete workflow from click to response.
3. Review the source map and open the relevant files when a term is unfamiliar.
4. Practice the panel questions in your own words, not by memorizing claims you cannot explain.
5. Rehearse only necessary demo actions. Do not publish synthetic herbs or run database stress tests during the defence.

## Important boundaries

- Administrator-reviewed is not the same as clinically proven. A DOH/PITAHC listing is not institutional endorsement of this website.
- RAG reduces unsupported answers but does not guarantee that every generated sentence is correct.
- The current credit/payment implementation supports `off` and `test` modes. Do not describe it as a production real-money checkout.
- Installing the PWA does not make protected workflows or AI work offline.
- A passing test suite is evidence for tested cases, not proof of unlimited capacity or zero bugs.
- Counts and hosted settings can change. The reviewers describe the referenced implementation; do not memorize the live herb/user totals as permanent facts.
- The technical guides contain no credentials, recovery tokens, personal inbox addresses or private account examples.

## Verification reference

Before these documents were prepared, the application release passed [full CI](https://github.com/ultrakevin143/HerbalAiCapstoneProject/actions/runs/38224119392), the [isolated preparation/concurrency gate](https://github.com/ultrakevin143/HerbalAiCapstoneProject/actions/runs/38224119415), and [live-branch CI](https://github.com/ultrakevin143/HerbalAiCapstoneProject/actions/runs/38224422439). Both hosting deployments succeeded. The live public/admin inspection included console, network and browser Issues checks.

Database acceptance fixtures ran against isolated CI PostgreSQL, not the production Neon database. These reviewers are documentation; publishing this folder does not change the live application's layout or behaviour.
