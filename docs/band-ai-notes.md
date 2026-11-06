# Band AI Desktop App Notes

## Overview
Band AI (https://band.ai) was utilized by the Nexus AI engineering team during the development, orchestration, and continuous testing of Sentinel and CodeMind.

## Workflows & Use Cases
1. **Multi-Agent Orchestration & Workflow Prototyping:**
   - Used Band AI desktop app to visualize agent states, prompt traces, and token usage during Sentinel root-cause diagnosis.
   - Monitored real-time interactions between Sentinel's incident outcome capture and CodeMind's rule-learning pipeline.
2. **Context & Memory Inspection:**
   - Evaluated memory bank query performance and latency when calling Hindsight Cloud.
   - Inspected how Hindsight memories were retrieved and formatted across Sentinel and CodeMind prompts.
3. **Prompt Iteration & Delimiter Hardening:**
   - Tested anti-injection delimiter boundaries on untrusted stack traces, diffs, and pull request inputs.
   - Validated that `openai/gpt-oss-120b` and `qwen/qwen3-32b` correctly adhered to JSON schema constraints without hallucinating memory IDs.
