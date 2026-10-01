# Feature modules

Keep domain behavior close to the feature that owns it.

Suggested module shape:

```text
features/classes/
  actions.ts
  queries.ts
  schemas.ts
  components/
```

Avoid putting business rules inside pages. Pages should compose feature APIs and UI.
