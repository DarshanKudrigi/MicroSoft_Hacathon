# Nexus AI: 60-Second Demo Script

## Hook (0:00 - 0:10)
"Every software team has had this nightmare: production goes down, the on-call engineer spends two hours digging through logs, finally finds a leaked connection pool, fixes it, and goes to sleep. Two weeks later, a new developer opens a pull request with the exact same mistake—and merges it. Tribal knowledge was lost."

## The Solution: Meet Nexus AI (0:10 - 0:25)
"Nexus AI connects two intelligent agents through a single, shared Hindsight memory bank.
1. Sentinel: Diagnoses production incidents from logs in real time.
2. CodeMind: Reviews PR diffs using lessons learned from past production outages.
Watch what happens when they learn from each other."

## The Live Demo (0:25 - 0:50)
"Step 1: Paste a production log with connection pool exhaustion into Sentinel.
With Memory OFF, we get a generic guess.
Turn Memory ON: Sentinel immediately recalls Incident #12 from Hindsight, pins the exact root cause with high confidence, and gives a step-by-step fix.
Step 2: Click 'Worked'. Sentinel updates the resolution time and automatically creates a review rule in Hindsight: 'Flag unreleased DB connections in payment endpoints'.
Step 3: Switch to CodeMind. A developer submits a PR diff with default pool settings and missing release blocks. CodeMind flags the exact line, citing Incident #12. The bug never reaches staging."

## Impact & Close (0:50 - 1:00)
"In the Knowledge Graph, you see incidents, rules, PRs, and services connected.
In Team Learning Analytics, MTTR drops by 40% and repeat incidents trend to zero.
Nexus AI: where every incident makes your entire engineering team permanently smarter."
