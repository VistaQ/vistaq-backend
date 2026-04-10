/**
 * Create Admin User Script
 *
 * Creates a user in Supabase Auth and inserts a corresponding row in the
 * public.users table with the admin role.
 *
 * Usage:
 *   node scripts/create-admin.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Config — edit these before running
// ---------------------------------------------------------------------------

const EMAIL = 'jeremy.nathan1@gmail.com';
const PASSWORD = 'password';
const NAME = 'Jeremy Admin';
const TENANT_ID = '00000000-0000-0000-0000-000000000001'; // paste your tenant UUID here

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!TENANT_ID) {
  console.error('❌ TENANT_ID is empty — paste your tenant UUID into the script before running');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function createAdminUser() {
  // 1. Create auth user
  console.log(`Creating auth user for ${EMAIL}...`);
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    console.error('❌ Failed to create auth user:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`✅ Auth user created — UID: ${userId}`);

  // 2. Insert row in users table
  console.log('Inserting user row...');
  const { error: dbError } = await adminClient.from('users').insert({
    id: userId,
    tenant_id: TENANT_ID,
    email: EMAIL,
    name: NAME,
    role: 'admin',
    status: 'active',
  });

  if (dbError) {
    console.error('❌ Failed to insert user row:', dbError.message);
    console.log('⚠️  Auth user was created but DB insert failed. Clean up manually if needed.');
    console.log(`   Auth UID to delete: ${userId}`);
    process.exit(1);
  }

  console.log('✅ User row inserted');
  console.log('');
  console.log('--- Admin user created successfully ---');
  console.log(`UID:       ${userId}`);
  console.log(`Email:     ${EMAIL}`);
  console.log(`Role:      admin`);
  console.log(`Tenant ID: ${TENANT_ID}`);
}

createAdminUser().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
