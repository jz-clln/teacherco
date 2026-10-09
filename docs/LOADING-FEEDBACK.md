# Loading feedback

Use `LoadingState` for waiting screens and `LoadingState page` for route or workbook loads. Use `Button loading={pending}` for asynchronous actions, `Spinner` beside existing inline status messages, and `PendingSubmit` for server-action forms. Keep completion, empty and error messages free of loading animation.

The shared `Spinner` displays the TeacherCo logo with a gentle bob and pulse for loading screens and inline actions. Navigation uses the original circular spinner. Progress bar appearance and animation are unchanged.

All route loading boundaries use the shared animated state. Main navigation also shows a thin animated bar while the link is pending. Existing animated import, export, score and Ask indicators remain in place. Animation uses CSS transforms without timers or new dependencies; reduced-motion preferences disable movement while retaining visible status text. Progress bars are indeterminate and do not imply a completion percentage.

Keep pending controls disabled to prevent repeat submissions. End feedback when the operation succeeds or fails. These indicators communicate work in progress; they do not change the underlying processing time.

Class tabs show a circular navigation spinner while their link is pending. The class route template resets its Suspense boundary on tab changes, displaying the shared animated loading screen while the next class area loads, including when returning to Overview. Cached pages can appear immediately without an artificial delay.

Validation: 647 automated tests passed, one skipped; typecheck, lint and production build passed. Browser checks cover a delayed compatibility request, active CSS animation, reduced motion, and removing the spinner when the request completes.

Logo update validation: both focused loading tests, typecheck, lint, production build, and production browser regression passed. Browser checks confirm the logo asset, CSS animation, reduced motion, and removal after completion.
