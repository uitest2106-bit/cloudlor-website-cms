import React from 'react'

// Rendered via `admin.components.actions` in payload.config.ts, which
// injects custom components into the header of the admin panel (the same
// bar the account avatar sits in, top-right). Payload's default "Log out"
// link only lives inside the collapsible sidebar nav (`/admin/logout`,
// via the built-in logout.Button component) — this adds a directly visible
// one next to the account icon. Plain <a>, not next/link, since
// /admin/logout is a Payload route handler outside the admin SPA's own
// client-side routing.
const LogoutAction: React.FC = () => {
  return (
    <a
      href="/admin/logout"
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        fontSize: '13px',
        fontWeight: 500,
        marginRight: '16px',
        textDecoration: 'none',
      }}
    >
      Log out
    </a>
  )
}

export default LogoutAction
