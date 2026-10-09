# Report-card subject and term connections

Matching a template row to a Section subject supplies both its label and term grades from that same Section subject ID. Grade values use the selected learner ID and the connected Section period ID. No averages or grades are invented, and missing Grade Book values remain blank; zero remains zero.

Standard period connections are proposed locally. T1 and Term 1 are equivalent; Q1 and Quarter 1 are equivalent. Generic Period 1, Period 2, etc. connect by number when the active Section periods have one unambiguous term/quarter/semester family. Position and array order are not used to infer meaning. Terms never automatically match quarters. Inactive, duplicate or mixed-family candidates require teacher review.

The main matching form displays a compact term summary. Manual choices are under **Adjust term connections**, automatically opened when a match needs attention. Existing saved selections are preserved; missing selections receive safe suggestions. Completing an older profile invalidates the old preview until the teacher confirms and saves the new connections.

**Save matches** still requires explicit teacher confirmation and existing ownership, mapping revision, source hash and profile revision validation. The server also completes safe missing period connections before validating the entire binding set. No database migration is required.

If labels appear but grades do not, check both the template's mapped term output cells and the Section's saved Grade Book entries. The form links to both places. Grades present only in an unimported class record do not become Section Grade Book entries through report-card setup.
