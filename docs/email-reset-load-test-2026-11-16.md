# Email and password-reset concurrent load test

Run: **16 November 2026**, 16/11/2026, 5:11:37 pm–16/11/2026, 5:32:05 pm IST. Application source under test: `cff52a8` (the current website code; subsequent repository changes were documentation only).

## Overall result

- **Simulated burst: Pass.** All **900 notification messages** and **5 simultaneous password-reset requests** completed without unexpected errors. The delivery-service batch completed in **4.89 s**. It offered 900 concurrent notification tasks, with **86 capture requests active at peak**; it did not establish 900 simultaneous SMTP connections.
- **Normal worker: Pass, with a substantial backlog delay.** All 900 queued messages drained in **19m 54.01s**, using the real worker job handler, one worker and its one-second pause. Reset requests alongside the queue had p95 **0.13 s**.
- **Real email delivery sample: Pass.** Exactly **5 emails** were sent concurrently through the live WordPress mail transport to subscriptions@compactummedia.com. The transport accepted 5/5, and the recipient confirmed **all 5 received**. No production reset keys, passwords, invitations or submissions were changed.
- **Operational concern:** injected failures left **3 deliveries requiring review**, although all 100 associated jobs displayed complete. Monitoring must inspect email delivery states as well as jobs.

The high-volume test used an isolated SQL database and a private capture transport. **900-message production SMTP capacity remains unverified.** The five real samples validate only that small concurrent sample. No response-time SLA was supplied, so latency is reported rather than certified against an SLA.

## Test environment and boundaries

| Setting | Value |
| --- | --- |
| Generator / application service process | v24.13.0, win32 10.0.26300 |
| Test computer | 12th Gen Intel(R) Core(TM) i3-1215U; 8 logical CPUs; 7876.74 MiB RAM |
| SQL | Fresh, separate PostgreSQL 18.4 cluster, loopback only; pg.Pool maximum **3**, matching the app default |
| Pool topology | Notification tasks and reset HTTP share one test process/pool; the deployed web and background worker process topology is not fully replicated |
| Isolation | New database containing synthetic records; no production database connection or SMTP credentials used by the simulator |
| Notification engine | Submitted fixture records are seeded; actual enqueueFormNotifications, deliverFormNotifications and runJob implementations are exercised |
| Reset HTTP | Private HTTP adapter calling the actual createAuth participant-recovery action and database rate limiter |
| WordPress provider boundary | Simulated in the bulk test; actual WordPress/PHP/wp_mail used only for the 5 approved live samples |
| Message payload | Approximately 1 KiB HTML, one notification per submitted fixture, no attachments |
| Capture transport | Loopback HTTP, 100 ms configured acceptance delay, maximum 128 connections |
| Queue scheduler | One runJob call at a time, 1,000 ms pause between jobs, real reconciliation every 3 seconds; signature updater not run |
| Excluded bulk costs | PHP/WordPress bootstrap and native template planning, remote Supabase latency, external SMTP quotas/filtering, attachments/scans, Next.js HTTP overhead |

All 905 burst tasks were released behind one barrier; their task-start spread was **40.16 ms**. The capture-only control accepted **900/900** in **1.91 s**, with no connection errors. The primary run therefore passed the test-transport control before application results were interpreted.

The test ran on a shared Windows desktop, not dedicated production hardware. Node memory/CPU figures below include the local capture server and exclude PostgreSQL processes. The local database uses a real three-connection pool, but its loopback latency differs from production Supabase.

## Response times

Percentiles use nearest rank. For the five-request samples, p95 and p99 equal the maximum; these are small samples, not statistical delivery guarantees.

| Operation | Samples | Median | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reset HTTP, no bulk load | 5 | 0.36 s | 0.36 s | 0.36 s | 0.36 s |
| Reset HTTP during 900-task burst | 5 | 2.28 s | 2.28 s | 2.28 s | 2.28 s |
| Notification service during burst | 900 | 4.77 s | 4.84 s | 4.85 s | 4.85 s |
| Reset HTTP alongside normal worker | 5 | 0.13 s | 0.13 s | 0.13 s | 0.13 s |
| Normal worker: backlog-ready to capture acceptance | 900 | 599.58 s | 1126.55 s | 1175.42 s | 1192.35 s |
| Live PHP/mail bridge sample | 5 | 4.99 s | 5.27 s | 5.27 s | 5.27 s |

The simultaneous burst increased reset p95 by **6.31×**, from 0.36 s to 2.28 s. All five still returned HTTP 200. Burst notification service throughput was **184.23 messages/second** in this model.

Notification service latency includes SQL planning/claim/state confirmation and simulated transport. The live sample timing includes actual PHP/WordPress bootstrap and mail handoff. Inbox arrival timestamps were not available, so mailbox delivery latency is not inferred from either measurement.

## Normal-worker backlog

| Measurement | Result |
| --- | ---: |
| Queued notification messages | 900 |
| Messages accepted by capture | 900 |
| Fixture creation and durable enqueue, before drain timer | 1.21 s |
| Durable enqueue call p95 in the 900-call setup burst | 1.12 s |
| Total drain time | 19m 54.01s |
| Notification throughput | 0.75 messages/second |
| Median backlog-start to capture acceptance | 9m 59.58s |
| p95 backlog-start to capture acceptance | 18m 46.55s |
| Maximum backlog-start to capture acceptance | 19m 52.35s |
| Median worker job service time, excluding poll pause | 135.21 ms |
| p95 worker job service time, excluding poll pause | 1021.36 ms |
| Reset requests during queue drain | 5/5 HTTP 200 |
| Unique captures including those resets | 905/905 |
| Unexpected errors | 0 |

Message wait values start when all 900 jobs are durably queued, immediately before the first worker call. Individual enqueue timestamps were not used; setup time is reported separately above. The one-second pause alone creates a lower bound of about 15 minutes for 900 separate jobs, before processing time. The simulated 100 ms transport is much faster than the observed live sample calls (4.72 s–5.27 s). Consequently, this simulated drain time is **not a production delivery-time estimate**.

## Resource measurements

| Measurement | 900-task burst | Normal worker |
| --- | ---: | ---: |
| Peak Node process RSS | 223.73 MiB | 117.19 MiB |
| Peak Node JS heap | 136.59 MiB | 100.85 MiB |
| CPU time, user + system | 5125.00 ms | 35719.00 ms |
| Average CPU relative to one logical core | 104.91% | 2.99% |
| Event-loop delay p99 | 32.64 ms | 41.12 ms |
| Peak observed SQL pool waiting requests, sampled every 100 ms | 902 | 0 |
| SQL call p95, including pool wait | 1283.77 ms | 31.51 ms |
| Peak active capture requests | 86 | 6 |

CPU can exceed 100% of one core because the process uses multiple threads. The live five-message sample separately observed **877.66 MiB combined PHP RSS** across five PHP processes. This sum can count shared pages more than once and is not unique physical RAM or the hosting plan limit. It nevertheless shows why PHP process concurrency needs a measured memory budget.

## Error handling, delivery and replay checks

| Scenario | Result | Status |
| --- | --- | --- |
| 900 notifications + 5 resets | 900 delivered-state notifications, 5 HTTP 200 resets, 905 unique captures; unexpected errors 0/905 (0%) | Pass |
| Replay queued burst jobs | No additional messages sent | Pass |
| Normal worker, 900 notifications + 5 resets | All accepted; no missing or duplicate captures; unexpected errors 0/905 (0%) | Pass |
| Six simultaneous resets for one contact | Five HTTP 200, one HTTP 429; exactly five reset messages captured | Pass: expected rate limit |
| Five resets with injected provider refusal | Five HTTP 503, zero accepted mail; provider failure surfaced | Pass: expected fault |
| 100 notifications: two refusals + one lost acknowledgement | 97 delivered-state, 3 review-state; 98 captured because the lost-ack message was accepted before confirmation failed | Manual review required |
| Replay those 100 notifications | No automatic resend and no extra capture | Pass: duplicate prevention |
| Job status for those 100 fault-test notifications | All 100 complete despite 3 deliveries requiring review | Operational monitoring gap |
| Actual live sample | 5/5 transport accepted, 5/5 recipient-confirmed; observed loss 0/5 | Pass for this sample |
| Public availability after live samples | 12/12 HTTP 200 across home, login, judge login and form configuration; p95 1.08 s | Pass: low-rate check |
| Production preservation | Nine business-table counts and fingerprints unchanged across the live sample | Pass |

Rate-limited requests and deliberately injected failures are reported separately from unexpected workload errors. The same-contact limit is five requests per 15 minutes; these five are individually admitted, with no coalescing demonstrated. The simulation does not validate live password-reset-link lifecycle or concurrent changes to a real account.

## Bottlenecks and recommended work

1. **Shared test-pool contention affects reset latency.** The burst queued 902 SQL operations behind three connections; SQL call p95 was 1.28 s. Keep bulk work on the existing background queue. Deployed web and worker processes can own separate pools, so budget their combined database connections and validate account latency in that topology before tuning. These shared-pool burst timings do not prove the same contention occurs in production. [Database pool](https://github.com/SubscriptionsCM/Youth-Eco-Summit/blob/cff52a8bf44f7265bd8da1d1c852c945cd27e5bd/src/server/db.ts).
2. **The single worker and pause cap bulk throughput.** Queueing preserves work but raises delivery wait times. Account for real PHP/SMTP costs when setting delivery targets. Sleeping only when idle, batching, or bounded workers could improve backlog processing after provider-limit and resource tests. File verification and email jobs share this worker, so long verification work can add further delay; that mixed workload was not measured here. [Worker](https://github.com/SubscriptionsCM/Youth-Eco-Summit/blob/cff52a8bf44f7265bd8da1d1c852c945cd27e5bd/scripts/worker.ts), [job dispatcher](https://github.com/SubscriptionsCM/Youth-Eco-Summit/blob/cff52a8bf44f7265bd8da1d1c852c945cd27e5bd/src/server/jobs.ts).
3. **WordPress bridge resource cost matters.** The five live calls took roughly five seconds each under five-way concurrency and used substantial combined RSS. The bridge has a 15-second timeout; source recovery also uses an eight-second per-user lock. Avoid unbounded PHP/send concurrency. Benchmark staged concurrency levels against memory and provider limits before increasing worker count. [Bridge](https://github.com/SubscriptionsCM/Youth-Eco-Summit/blob/cff52a8bf44f7265bd8da1d1c852c945cd27e5bd/src/server/wordpress-auth.ts), [recovery adapter](https://github.com/SubscriptionsCM/Youth-Eco-Summit/blob/cff52a8bf44f7265bd8da1d1c852c945cd27e5bd/wordpress/yes-next-account-bridge/recovery.php).
4. **Alert on delivery review states.** A completed job can contain refused or uncertain mail. Expose delivered/review/pending counts and queue age in monitoring. Current behavior intentionally prevents blind resends; provider idempotency and acknowledgement tracking would be needed for safe automated recovery. [Notification delivery](https://github.com/SubscriptionsCM/Youth-Eco-Summit/blob/cff52a8bf44f7265bd8da1d1c852c945cd27e5bd/src/server/form-notifications.ts).
5. **Track actual delivery separately from acceptance.** The recipient confirmed the five samples, but 900 external deliveries, bounce rates, spam placement and provider quotas were not tested. Add provider delivery/bounce events for stronger ongoing evidence.

No production source, pool, worker count, rate limit, deadline or password was changed during this audit. The next capacity-verification step is a production-like staging run with matching Linux/Node/PHP, remote database latency, templates, provider sandbox limits and agreed response-time/delivery targets. No paid resources were provisioned.

## Rig diagnostics and reproducibility

An initial unbounded loopback capture control accepted only **232/900** and failed **668/900**, independently of the application. That diagnostic used PGlite and cannot establish application capacity. Its incomplete normal-worker run is excluded from the primary measurements. The final run used real PostgreSQL, a bounded capture agent and a successful 900-message control. The initial diagnostic artifacts are retained rather than treated as an application failure or hidden.

Private evidence: `.local/load-20261116/results.json`, `run.log`, `load.test.ts`, `real-delivery.cjs.result.log`, `inbox-confirmation.json`, `public-health.json`, and the diagnostic files. The application-load harness SHA-256 is `314d4f32cea6390f5bae99fc45b5f72eada51b15efac45bb320f966dfd26a136`.

The primary harness completed all assertions, including 1,900 notification jobs across burst, fault and queued scenarios. Exactly five additional real emails were sent. All simulated messages used private capture and synthetic recipients. Production business records and existing accounts were preserved.
