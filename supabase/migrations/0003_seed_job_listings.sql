insert into public.content_items (
  type,
  title,
  slug,
  excerpt,
  body,
  category,
  tags,
  status,
  expires_at,
  source_url,
  data,
  published_at
)
values
  (
    'job',
    'Community Associate: Lagos',
    'community-associate-lagos',
    'Coordinate community programmes, events and learner engagement at the Lagos hub.',
    'Coordinate community programmes, events and learner engagement at the Lagos hub.',
    'Jobs',
    array['Experienced professional', 'Full-time', 'Lagos', 'Community programmes'],
    'published',
    null,
    null,
    jsonb_build_object(
      'employer', 'ALX Africa',
      'logo_initials', 'AA',
      'location', 'Lagos, Nigeria',
      'experience_level', 'Experienced professional',
      'employment_type', 'Full-time',
      'work_arrangement', 'Not stated',
      'salary', 'Salary not disclosed',
      'closing_date', 'Not stated by employer',
      'application_page_available', true,
      'source_checked_at', '15 Oct 2026',
      'featured', true
    ),
    '2026-10-15T00:00:00Z'
  ),
  (
    'job',
    'Software Engineer – Python – Ubuntu Pro client (graduate level)',
    'software-engineer-python-ubuntu-pro-client-graduate',
    'Develop and test the Python command-line client used to manage Ubuntu Pro services.',
    'Develop and test the Python command-line client used to manage Ubuntu Pro services.',
    'Jobs',
    array['Graduate programme', 'Not stated', 'Remote', 'Python', 'Software engineering'],
    'published',
    null,
    null,
    jsonb_build_object(
      'employer', 'Canonical',
      'logo_initials', 'C',
      'location', 'Home based – Africa / Lagos',
      'experience_level', 'Graduate programme',
      'employment_type', 'Not stated',
      'work_arrangement', 'Remote',
      'salary', 'Salary not disclosed',
      'closing_date', 'Not stated by employer',
      'application_page_available', true,
      'source_checked_at', '15 Oct 2026',
      'featured', true
    ),
    '2026-10-15T00:00:00Z'
  ),
  (
    'job',
    'Economic Recovery Officer – Katsina',
    'economic-recovery-officer-katsina',
    'Support cash assistance, food security activities and field monitoring in Katsina.',
    'Support cash assistance, food security activities and field monitoring in Katsina.',
    'Jobs',
    array['Experienced professional', 'Fixed-term / contract', 'Katsina', 'Economic recovery'],
    'published',
    '2026-10-28T23:59:59Z',
    null,
    jsonb_build_object(
      'employer', 'Danish Refugee Council',
      'logo_initials', 'DR',
      'location', 'Katsina, Nigeria',
      'experience_level', 'Experienced professional',
      'employment_type', 'Fixed-term / contract',
      'work_arrangement', 'On-site / field-based',
      'salary', 'Salary not disclosed',
      'closing_date', '2026-10-28',
      'application_page_available', true,
      'source_checked_at', '15 Oct 2026',
      'featured', true
    ),
    '2026-10-15T00:00:00Z'
  )
on conflict (slug) do nothing;
