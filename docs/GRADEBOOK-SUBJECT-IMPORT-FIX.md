# Subject-safe class grade imports

The previous import screen retained the destination subject from the Grade Book filter, even when a different linked class was chosen. The database already separates entries by Section, learner, subject and period; importing into the retained destination could therefore replace that subject's grades.

The Grade Book now displays each learner's subjects and term grades together. Subject/period selectors appear only for manual entry. Class import starts with the linked class and source term, selects a unique matching active Section subject and standard term, and displays the destination before review and confirmation. Changing the class or term discards the old preview.

Unknown or duplicate subject labels require an explicit destination choice and confirmation. Custom period layouts require a period choice; standard layouts retain an optional destination-period adjustment. The server rejects imports into a different subject when a unique matching subject exists. Existing stale-preview, manual-grade protection, ownership, roster and atomic-write checks remain in place.

No schema migration or existing grade rewrite is performed. Previously overwritten values need review and re-import from the correct source class; this change does not reconstruct lost values automatically.

Validation includes server mismatch rejection, UI destination reset, the multi-subject view, existing Grade Book database tests, and a browser regression importing two subjects sequentially and asserting the first subject's rows and timestamps remain unchanged.
