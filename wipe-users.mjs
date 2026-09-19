// DANGER: permanently deletes every row from the `users` table via a raw
// SQL DELETE. This bypasses Payload entirely — no access control, no
// hooks, no last-super-admin protection. Local/dev use only, never in
// production. Gated behind both an explicit flag and an environment check
// so it can't run by accident.
//
// Usage: node wipe-users.mjs --yes
import { Pool } from 'pg'

if (process.env.NODE_ENV === 'production') {
  console.error(
    'Refusing to run: NODE_ENV is "production". This script permanently deletes all users and bypasses every Payload safeguard.',
  )
  process.exit(1)
}

if (!process.argv.includes('--yes')) {
  console.error(
    'This will permanently DELETE ALL ROWS from the "users" table, bypassing Payload\'s access control, ' +
      'hooks, and the last-super-admin protection entirely. This cannot be undone.\n' +
      'Re-run with --yes to confirm: node wipe-users.mjs --yes',
  )
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to guess a connection string.')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const result = await pool.query('DELETE FROM users')
console.log(`Deleted ${result.rowCount} row(s) from users`)
await pool.end()
