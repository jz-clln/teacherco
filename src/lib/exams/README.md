# Assessment engine boundary

Objective scoring should be deterministic.

Expected pipeline:

```text
image -> preprocessing -> answer-region detection -> extracted answer
      -> uncertain-answer review -> teacher-final answer -> score
```

Never let an LLM be the authoritative calculator for multiple-choice or True/False scores.
