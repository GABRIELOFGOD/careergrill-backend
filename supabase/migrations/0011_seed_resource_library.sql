insert into public.resources (
  title, slug, excerpt, body, category, tags, status, data, published_at
)
values
  (
    'What does the scholarship actually cover?',
    'check-scholarship-funding',
    'Separate the award’s funding from the costs you will still need to cover.',
    E'## List the costs\n\nCheck the official award information for tuition, living costs, travel, insurance and arrival costs. Record what the award pays for and which expenses remain your responsibility.\n\n## Confirm how funding is paid\n\nCheck whether payments go directly to the institution, are paid to you or require reimbursement. Note any conditions, limits or timing that affect your budget.\n\n## Keep a source record\n\nSave the official funding page and the date you checked it. Confirm current terms with the provider before making financial commitments.',
    'Scholarships',
    array['checklist', 'scholarships', 'funding'],
    'published',
    '{"format":"Checklist"}'::jsonb,
    now()
  ),
  (
    'Plan an application backwards from the deadline',
    'plan-application-backwards-from-deadline',
    'Give documents, referees and final checks their own dates in your plan.',
    E'## Work backwards from submission\n\nRecord the official deadline, time zone and submission method. Add a buffer before the deadline for technical issues and final checks.\n\n## Set milestones\n\nList each required document, who needs to provide it and when you will request or complete it. Set a review date before submission and confirm that every document follows the current instructions.\n\n## Recheck the official source\n\nDeadlines and requirements can change. Check the provider’s current page and save the date you confirmed the details.',
    'Graduate admissions',
    array['worksheet', 'planning', 'deadlines'],
    'published',
    '{"format":"Worksheet"}'::jsonb,
    now()
  ),
  (
    'Plan your scholarship motivation letter',
    'plan-scholarship-motivation-letter',
    'Map your study goal and experience to the scholarship’s actual questions.',
    E'## Start with the prompt\n\nCopy the exact question and note the word limit and selection criteria. For each criterion, write one example you can explain.\n\n## Connect your evidence\n\nRecord what happened, your own contribution and what changed. Then note how the scholarship supports a realistic next step in your study or work.\n\n## Check before drafting\n\nConfirm the award details and eligibility on the official provider page. Draft in your own words and check that every paragraph responds to the prompt.',
    'Scholarships',
    array['template', 'scholarships', 'motivation letter'],
    'published',
    '{"format":"Template"}'::jsonb,
    now()
  ),
  (
    'Match your experience to a fellowship’s criteria',
    'match-experience-fellowship-criteria',
    'Build examples around the criteria before you start writing the application.',
    E'## Choose a criterion\n\nCopy one selection criterion from the current fellowship instructions. Note what the panel is asking applicants to demonstrate.\n\n## Find a relevant example\n\nDescribe the situation, your responsibility, the decision or action you took, and what followed. Include limits or setbacks where they help explain the outcome.\n\n## Connect the example to the fellowship\n\nExplain what you learned and how it prepares you for the fellowship’s actual activities. Check the official instructions before submitting.',
    'Fellowships',
    array['worksheet', 'fellowships', 'selection criteria'],
    'published',
    '{"format":"Worksheet"}'::jsonb,
    now()
  ),
  (
    'Build an MBA story bank',
    'build-mba-story-bank',
    'Collect examples of leadership, judgement and learning before drafting essays.',
    E'## Capture useful experiences\n\nChoose examples from work, study or community activities where you had a clear responsibility. For each one, write the context, your decision, the people affected and what changed.\n\n## Record what you learned\n\nNote what you would repeat or do differently. Keep the detail specific and verifiable rather than relying on broad claims.\n\n## Connect stories to the application\n\nReview the current MBA essay prompts and map each story to a question it can answer. Adapt the example to the prompt instead of reusing the same essay.',
    'MBA applications',
    array['worksheet', 'MBA', 'leadership'],
    'published',
    '{"format":"Worksheet"}'::jsonb,
    now()
  ),
  (
    'Prepare a useful brief for your referee',
    'prepare-brief-for-referee',
    'Give your referee the context, evidence and submission details they need.',
    E'## Share the essentials\n\nSend the official programme or award link, the deadline and submission instructions. Confirm that your referee is available and understands how the reference will be submitted.\n\n## Provide relevant context\n\nInclude your current CV, the application prompt and a short note about the work or study you have done together. Suggest examples they may remember without scripting their response.\n\n## Follow up thoughtfully\n\nAgree a reminder date and thank your referee after submission. Do not share their reference without permission.',
    'Graduate admissions',
    array['template', 'referees', 'planning'],
    'published',
    '{"format":"Template"}'::jsonb,
    now()
  ),
  (
    'Check your preparation for a PhD application',
    'phd-application-preparation-checklist',
    'Connect your research question to supervision, methods and funding requirements.',
    E'## Clarify your research direction\n\nSummarise the question you want to investigate and why it matters. Identify the methods or preparation the project may require.\n\n## Check the programme\n\nReview current entry requirements, supervision arrangements, application materials and funding routes on the university’s official pages. Confirm whether prospective supervisors should be contacted and what information they request.\n\n## Plan your next steps\n\nList the evidence or skills you still need, the documents to prepare and the dates for each action. Recheck the programme details before applying.',
    'Graduate admissions',
    array['checklist', 'PhD', 'research'],
    'published',
    '{"format":"Checklist"}'::jsonb,
    now()
  )
on conflict (slug) do nothing;
