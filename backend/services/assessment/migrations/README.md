

`000028_exam_version_content` adds `assessment.get_exam_version_content`,
behind `GET .../exam-versions/{id}/content`: sections, items with their pinned
titles, and assignment rules with candidate counts, under the exam_versions
read capability.

`000029_question_pools` adds `exam_sections.draw_count` and question pools
(ADR-0034): `item_drawn` picks each student's items by hash, both snapshot
builders apply it, a nine-argument `add_exam_section` takes the draw count,
publication checks pools, and `get_exam_version_content` returns it. Rollback
restores the 000026 to 000028 functions and drops the column.

`000030_mcq_items` adds multiple-choice exam items (ADR-0035): the item kind,
options, key and multiple flag with a constraint per kind,
`add_exam_mcq_item`, and both snapshot builders carrying them. Rollback
refuses while mcq items exist and restores the 000029 builders.
