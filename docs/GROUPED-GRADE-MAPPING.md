# Grouped report-card grade mapping

The mapping sidebar has one scrollbar for its entire contents, including fullscreen. The mapped-fields section no longer creates a small independent scrolling area.

Choose **Map grade table**, then **Find term / quarter columns**. Clear T1–T3 and Q1–Q4 headers are recognized locally, including when subject rows are blank. Multiple candidate tables require teacher selection. Unclear headers can use the existing cost-first template-analysis pipeline; proposals never save automatically.

Set the grade columns once and enter subject names in worksheet order, starting at the first subject row. Existing mapped subject names are prefilled. For gaps or category rows, use explicit lines such as `30, Calculus` and `32, Language`. These are output locations for the reusable template, not student grade values. Section compatibility still determines which Section subject and period supplies each value.

**Review grade mappings** validates the entire draft on the server, including ownership, revision, source hash, merged cells, bounds and overlapping assignments. Review shows subject/output locations. **Apply to mapping** changes the local draft; **Save mapping** persists it. Matching subjects reuse their IDs and replace only the requested period locations. Other fields, final grades, remarks and unrelated subjects remain intact. Equivalent period labels such as T1 and Term 1 share a slot; quarters and terms stay distinct. Blank subject names are never invented.

The viewer remains read-only. Workbook bytes and learner grades are unchanged by setup and review.

For templates with blank learning-area labels, set the optional subject-name column once as well. The resulting report cards can then fill each subject name alongside its grades. Leaving this field empty preserves existing label mappings.
