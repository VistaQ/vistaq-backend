INSERT INTO point_activity_types (
  name, category, label, subject_type
)
VALUES
  (
    'prospect_created', 'prospect', 'Added Prospect',
    'prospect'
  ),
  (
    'appointment_set', 'prospect', 'Appointment Set',
    'prospect'
  ),
  (
    'sales_meeting', 'prospect', 'Sales Meeting Completed',
    'prospect'
  ),
  (
    'sale_closed', 'prospect', 'Sale: Successful',
    'prospect'
  ),
  (
    'coaching_individual_attended',
    'coaching', 'Individual Coaching Attended',
    'coaching_session'
  ),
  (
    'coaching_group_attended', 'coaching',
    'Group Coaching Attended', 'coaching_session'
  ),
  (
    'coaching_peer_circles_attended',
    'coaching', 'Peer Circles Attended',
    'coaching_session'
  ),
  (
    'coaching_2_full_days_attended',
    'coaching', '2 Full Days Seminar Attended',
    'coaching_session'
  ),
  (
    'coaching_2_hours_online_attended',
    'coaching', '2 Hours Online Seminar Attended',
    'coaching_session'
  );