# Multi-Tenant Architecture - Quick Reference

## Key Files Overview

### Core Tenant Management (Remove/Disable for Single-Tenant)
- **js/tenant.js** (401 lines) - Tenant selection, URL params, super admin dashboard
- **js/admin-register.js** (183 lines) - Admin registration requests
- **admin-register.html** - Admin self-registration page
- **index.html** - Remove: `tenant-management-page`, `tenant-selection-page`, `admin-requests-tab`

### Collection Access (Replace with Direct Paths)
- **js/main.js** - Lines 2-31: getTenantCollection(), getTenantFirestore(), getUserCollection()
- **js/employee.js** - Lines 9-15: getAttendanceCollection(), getBreaksCollection()
- **js/utils.js** - Lines 28-29, 57-58: getTenantFirestore() calls
- **js/admin.js** - Multiple getTenantFirestore() calls

### Feature Files (Update Collection Paths)
- **js/admin.js** - Admin page, attendance/breaks management, admin requests
- **js/employee.js** - Attendance tracking
- **js/expense.js** - Expense management
- **js/expense-report.js** - Expense reports
- **js/auth.js** - User registration in tenant collections

### Authentication (Simplify Roles)
- **js/login.js** - Remove tenant determination, super admin checks
- **js/auth.js** - Lines 48-180: Remove tenantId assignment, tenant-specific user creation

### Utilities (Remove Tenant Awareness)
- **js/missing-functions.js** - Remove fallback getCurrentTenantId()
- **js/invite-system.js** - Remove tenant-specific invite validation
- **js/invite-admin.js** - Remove tenant ID detection logic

### Security Rules (Flatten Structure)
- **firestore.rules** - Remove tenant path matching, simplify to root collections

---

## Collection Paths Conversion

### Before (Multi-Tenant)
```
tenants/{tenantId}/users
tenants/{tenantId}/attendance
tenants/{tenantId}/breaks
tenants/{tenantId}/expenses
tenants/{tenantId}/expense_reports
tenants/{tenantId}/settings
tenants/{tenantId}/ (tenant master)
global_users/{email}
admin_requests/{docId}
invite_codes/{docId}
```

### After (Single-Tenant - Option 1: Flat)
```
users
attendance
breaks
expenses
expense_reports
settings
(remove global_users)
(remove admin_requests, no super admin)
(simplify invite_codes)
```

### After (Single-Tenant - Option 2: Namespaced)
```
moritasetsubi/users
moritasetsubi/attendance
moritasetsubi/breaks
moritasetsubi/expenses
moritasetsubi/expense_reports
moritasetsubi/settings
```

---

## Function Replacements

### getCurrentTenantId()
**Before**: Reads from URL param or window.currentTenant
**After**: Return hardcoded value or remove calls entirely
```javascript
// Replace:
const tenantId = getCurrentTenantId();

// With:
const tenantId = 'moritasetsubi'; // or just remove if not needed
```

### getTenantFirestore()
**Before**: Returns path with tenant prefix
**After**: Direct collection reference
```javascript
// Replace:
const coll = window.getTenantFirestore('attendance');

// With:
const coll = firebase.firestore().collection('attendance');
```

### getTenantCollection()
**Before**: Returns string path with tenant
**After**: Just return collection name
```javascript
// Replace:
const path = getTenantCollection('users');

// With:
const path = 'users'; // or 'moritasetsubi/users'
```

### getUserCollection()
**Before**: Returns tenant-specific users collection
**After**: Return root users collection
```javascript
// Replace:
const users = window.getUserCollection();

// With:
const users = firebase.firestore().collection('users');
```

### isSuperAdmin()
**Before**: Checks role === 'super_admin'
**After**: Remove all checks (no super admin needed) or always false
```javascript
// Simply remove all isSuperAdmin() checks
```

---

## HTML Pages to Remove or Modify

| Page ID | Action | Reason |
|---------|--------|--------|
| `tenant-management-page` | Remove | Super admin only feature |
| `tenant-selection-page` | Remove | Not needed for single tenant |
| `admin-requests-tab` | Remove | Super admin approval process |
| `admin-requests-content` | Remove | Container for admin requests |

---

## Firestore Rules Simplification

### Remove These Rules (Tenant-Specific)
```
match /tenants/{tenantId} { ... }
match /tenants/{tenantId}/{subcollection}/{docId} { ... }
match /admin_requests/{docId} { ... }
match /global_users/{email} { ... }
```

### Add These Rules (Direct Collections)
```
match /users/{userId} { allow read, write: if request.auth.uid == userId; }
match /attendance/{docId} { allow read, write: if isAdmin() || isOwner(); }
match /breaks/{docId} { allow read, write: if isAdmin() || isOwner(); }
match /expenses/{docId} { allow read, write: if isAdmin() || isOwner(); }
```

---

## Role Simplification

### Before (Multi-Tenant)
- **super_admin** - Manages all tenants, approves admin requests
- **admin** - Manages own tenant, invites employees
- **employee** - Can clock in/out, submit expenses

### After (Single-Tenant)
- **admin** - Manages the company, invites/manages employees
- **employee** - Can clock in/out, submit expenses

Remove all `role === 'super_admin'` checks

---

## Critical Search & Replace Patterns

### Pattern 1: URL Tenant Parameters
```regex
Search: \?tenant=[^&]+
Action: Remove all ?tenant= parameters
```

### Pattern 2: getTenantFirestore Calls
```regex
Search: getTenantFirestore\('([^']+)'\)
Replace: firebase.firestore().collection('$1')
```

### Pattern 3: getTenantCollection Calls
```regex
Search: getTenantCollection\('([^']+)'\)
Replace: '$1'
```

### Pattern 4: Super Admin Checks
```regex
Search: (isSuperAdmin\(\)|role === 'super_admin')
Action: Remove entire conditional block or comment out
```

### Pattern 5: Global Users References
```regex
Search: global_users
Action: Remove or replace with direct users collection
```

---

## Testing Checklist for Single-Tenant Conversion

- [ ] Remove all URL `?tenant=` parameters
- [ ] Verify collection paths work without tenant prefix
- [ ] Test user login (no tenant selection screen)
- [ ] Test employee attendance recording
- [ ] Test admin functions (no admin requests)
- [ ] Test expense management
- [ ] Test user invitation (no global invite codes)
- [ ] Verify Firestore rules allow data access
- [ ] Check browser console for undefined function errors
- [ ] Verify employee/admin pages display correctly

---

## Data Migration Checklist

- [ ] Backup Firestore data
- [ ] Export data from `tenants/{tenantId}/*`
- [ ] Import data to root collections
- [ ] Remove `tenantId` field from user documents
- [ ] Update invite codes (delete or convert)
- [ ] Verify record counts match after migration
- [ ] Test queries on migrated data

