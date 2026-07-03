# Submission Copy

## 1) Submission title

CatchDrift: Deployment-Aware Campaign Protection for Silent Tracking Failures

## 2) One-sentence summary

CatchDrift detects tracking-integrity failures while paid campaigns are still spending, surfaces evidence and estimated exposure, and guides safe recovery without handing campaign control to an unreliable black box.

## 3) 15-second pitch

CatchDrift protects active ad spend from silent tracking failures. In this demo, spend stays at $900/hour while attribution degrades after deployment v42, and CatchDrift deterministically detects the issue, estimates exposure, and verifies recovery.

## 4) 60-second pitch

CatchDrift is a deployment-aware campaign protection system built for lean media-buying teams. It continuously evaluates spend, click/session integrity, submissions, attribution, revenue, and deployment events. When persistent degradation happens while spend is still active, it creates a deterministic incident with immutable evidence, estimates financial exposure, and highlights the strongest correlated operational change. In this replay, a deployment changes tracking behavior, attribution falls while spend remains active, and CatchDrift surfaces roughly $230-$310/hour in estimated exposure. Recovery is also deterministic: metrics must return to expected ranges before incident status changes to recovered. AI is optional and bounded; it only summarizes persisted evidence for investigation and cannot create incidents, alter exposure, or make campaign-control decisions.

## 5) Five-minute demo script

1. Open homepage and state objective.
   - "I will show a full healthy-to-recovery flow in under 90 seconds."
2. Highlight financial framing before clicking.
   - Spend rate, exposure range, and explicit 90-minute assumption.
3. Click "Run the 90-second protection demo."
   - Narrate sequence: healthy baseline -> deployment v42 -> degradation persistence -> incident detection.
4. Show incident header.
   - Money-first summary, campaign context, severity/confidence, and strongest correlated change.
5. Show comparison table and trigger explanation.
   - Baseline vs degraded metrics and exact rule thresholds/persistence gates.
6. Show deployment correlation section.
   - Correlation score and "not confirmed causation" qualification.
7. Show financial impact framing.
   - Current exposure rate, observed duration, cumulative exposure, and assumed additional exposure if discovered later.
8. Show deterministic checklist.
   - Explain this is generated from incident type, not free-form AI.
9. Optionally generate investigation brief.
   - Emphasize: label is AI-generated only when model output succeeds; otherwise deterministic brief from persisted evidence.
10. Show recovery status.
   - Corrective deployment v43, recovery intervals, recovered vs resolved distinction.
11. Click Replay Demo.
   - Confirm reset-to-recovery remains reproducible.

## 6) Final interview close

I built CatchDrift to solve one financially meaningful problem well: silent tracking failures during active spend. The detection, exposure, lifecycle, and recovery logic are deterministic and test-covered. AI is additive but constrained to evidence summarization, never control. If I join It's Today Media full-time, I would run operator discovery, integrate read-only production signals, calibrate against historical incidents, and measure pilot outcomes such as time-to-detect, time-to-acknowledge, and potential avoided exposure.
