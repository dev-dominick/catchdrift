# Submission Copy

## 1) Submission title

CatchDrift: AI-Assisted Tracking Failure Detection for Active Campaign Spend

## 2) One-sentence summary

CatchDrift protects active ad spend from silent tracking failures by opening deterministic incidents, estimating exposure, verifying recovery, and using constrained AI to summarize persisted evidence for investigation.

## 3) 15-second pitch

CatchDrift protects active ad spend from silent tracking failures. In this replay, spend stays at $900/hour while attribution degrades after a landing-page deployment. CatchDrift detects the issue after roughly 15 minutes, estimates exposure, generates an AI-assisted investigation brief from persisted evidence, and verifies recovery with deterministic controls.

## 4) 60-second pitch

CatchDrift is an AI-assisted campaign protection system for lean media-buying teams. The business problem is simple: campaigns can keep spending while tracking breaks, and delayed reporting makes it hard to connect money at risk to the operational change that caused the symptoms.

In this replay, spend stays at $900/hour after deployment v42 removes click_id forwarding. Attribution falls while spend remains active, CatchDrift waits for three degraded five-minute windows, then opens a deterministic incident with immutable evidence and roughly $230-$310/hour in estimated exposure. The incident shows exposure before detection, hypothetical 90-minute exposure, and potential full-day projection from one canonical rate. AI then summarizes the persisted evidence into an investigation brief, but AI never creates incidents, changes exposure, claims causation, verifies recovery, or controls spend. Recovery is deterministic: metrics must return to expected ranges before incident status changes to recovered.

## 5) Five-minute demo script

1. Open homepage and state objective.
   - "I will show a full healthy-to-recovery flow in under 90 seconds."
2. Highlight financial framing before clicking.
   - Spend rate, exposure before detection (rate x approximately 15 deployment-to-detection minutes), full-day projection, and explicit 90-minute assumption.
3. Click "Run the AI-assisted tracking failure replay".
   - Narrate sequence: healthy baseline -> landing-page deployment -> degradation persistence -> incident detection.
4. Show incident header.
   - Money-first summary, campaign context, severity/confidence, and strongest correlated change.
5. Generate the AI investigation brief.
   - Emphasize: AI summarizes persisted evidence; it never creates incidents, changes exposure, verifies recovery, claims causation, or controls campaign spend.
6. Show financial impact framing.
   - Estimated hourly exposure, exposure before detection, hypothetical 90-minute exposure, and potential full-day exposure projection (all formula-derived from the same canonical rate).
7. Show comparison table and trigger explanation.
   - Baseline vs degraded metrics and exact rule thresholds/persistence gates.
8. Show deployment correlation section.
   - Correlation score and "not confirmed causation" qualification using the deployment shown on-screen.
9. Show deterministic checklist.
   - Explain this is generated from incident type, not free-form AI.
10. Show recovery status.
   - Corrective deployment shown in incident evidence, recovery intervals, recovered vs resolved distinction.
11. Click "Run the AI-assisted tracking failure replay" again.
   - Confirm reset-to-recovery remains reproducible.

## 6) Final interview close

I built CatchDrift to solve one financially meaningful problem well: silent tracking failures during active spend. The product value is earlier detection, clearer exposure, faster investigation, and verified recovery. The detection, exposure, lifecycle, and recovery logic are deterministic and test-covered. AI is visible in the workflow but constrained to investigation support, never control. If I join It's Today Media full-time, I would calibrate thresholds against campaign volume and reporting latency, integrate read-only production signals, and measure pilot outcomes such as time-to-detect, time-to-acknowledge, and potential exposure surfaced earlier.
