# Multi-Tenant Architecture Analysis - 勤怠管理システム

## Executive Summary

This codebase implements a **multi-tenant architecture** where multiple companies (tenants) can use the same application with data isolation. The system uses:
- **URL parameter-based tenant selection**: `?tenant={tenantId}`
- **Firestore hierarchical collections**: `tenants/{tenantId}/{collections}`
- **Global users collection** for cross-tenant lookups
- **Super admin role** for system-wide management
- **Global invite codes** for employee registration

---

## 1. TENANT SELECTION & SWITCHING LOGIC

### 1.1 URL Parameter Handling

**Primary File**: `/home/user/Attendance-System_moritasetsubi/js/tenant.js` (Lines 13-43)

```javascript
function getTenantFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tenant');
}

function getCurrentTenantId() {
    if (window.currentTenant) {
        return window.currentTenant.id;
    }
    return getTenantFromURL();
}
```

**Related Functions in tenant.js**:
- `initializeTenant()` (Lines 287-319) - Loads tenant from URL at startup
- `redirectWithTenant()` (Lines 279-282) - Adds tenant param to URL
- `generateSuccessUrl()` (Lines 363-382) - Creates redirect URL with tenant param

### 1.2 Tenant Selection Pages

**HTML Structure** (index.html):
- `tenant-selection-page` (Line 2355) - User tenant selection screen
- `tenant-management-page` (Line 2336) - Super admin tenant management dashboard

**Related Functions in tenant.js**:
- `showTenantSelection()` (Lines 131-172) - Displays tenant selection for regular users
- `showSuperAdminDashboard()` (Lines 177-204) - Shows tenant management for super admin
- `renderTenantList()` (Lines 209-250) - Renders tenant list UI
- `accessTenant()` (Lines 255-258) - Super admin tenant access
- `editTenant()` (Lines 271-274) - Tenant settings editor

### 1.3 Tenant ID Generation

**File**: `/home/user/Attendance-System_moritasetsubi/js/tenant.js` (Lines 22-33)

```javascript
function generateTenantId(companyName) {
    const baseId = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    
    const timestamp = Date.now().toString(36);
    return `${baseId}-${timestamp}`;
}
```

---

## 2. FIRESTORE DATA STRUCTURE

### 2.1 Collections Pattern: `tenants/{tenantId}/*`

The system stores tenant-specific data under a hierarchical structure:

```
tenants/
├── {tenantId}/
│   ├── users/ (tenant employees)
│   ├── attendance/ (work records)
│   ├── breaks/ (break records)
│   ├── expenses/ (expense records)
│   ├── expense_reports/ (expense reports)
│   ├── settings/ (tenant configuration)
│   └── invite_codes/ (employee invite codes)
│
└── {tenantId}/ (tenant master document)
    ├── id, companyName, adminEmail, status, etc.
    └── createdAt, updatedAt
```

### 2.2 Tenant-Specific Collection Access

**Main File**: `/home/user/Attendance-System_moritasetsubi/js/main.js` (Lines 2-31)

```javascript
window.getTenantCollection = function(collection) {
    const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
    const currentUser = window.currentUser;
    
    if (tenantId && currentUser && currentUser.role !== 'super_admin') {
        return `tenants/${tenantId}/${collection}`;
    }
    return collection;
};

window.getTenantFirestore = function(collection) {
    const collectionPath = getTenantCollection(collection);
    return firebase.firestore().collection(collectionPath);
};

window.getUserCollection = function() {
    const tenantId = getCurrentTenantId();
    const currentUser = window.currentUser;
    
    if (tenantId && currentUser && currentUser.role !== 'super_admin') {
        return firebase.firestore().collection(`tenants/${tenantId}/users`);
    }
    return firebase.firestore().collection('users');
};
```

### 2.3 Global Collections

**Global Users** (Not tenant-specific):
- **Path**: `global_users/{email}`
- **Purpose**: Cross-tenant user lookup, role/tenantId mapping
- **Fields**: `uid, email, displayName, tenantId, role, createdAt`
- **Access**: Line 142 in tenant.js

**Admin Requests** (Not tenant-specific):
- **Path**: `admin_requests/{docId}`
- **Purpose**: Super admin sees and approves admin registration requests
- **Access**: Line 125 in firestore.rules

**Invite Codes** (Not tenant-specific):
- **Path**: `invite_codes/{docId}`
- **Purpose**: Employee invite codes created by tenants
- **Fields**: `code, tenantId, companyName, active, maxUses, used, expiresAt`
- **Access**: invite-system.js

**Legacy Collections** (Not tenant-specific):
- `users/{userId}` - Legacy user data
- `attendance/{docId}` - Legacy attendance data
- `breaks/{docId}` - Legacy break data

---

## 3. AUTHENTICATION & USER MANAGEMENT

### 3.1 Tenant-Specific User Collections

**File**: `/home/user/Attendance-System_moritasetsubi/js/auth.js`

**Employee Registration with Invite** (Lines 48-180):
```javascript
async function registerEmployeeWithInvite(email, password, displayName, inviteToken) {
    // Creates user in: tenants/{tenantId}/users/{uid}
    // Also adds to: global_users/{email}
    const userCollection = authenticatedFirestore
        .collection('tenants')
        .doc(tenantId)
        .collection('users');
    
    await userCollection.doc(user.uid).set({
        email, displayName, role: 'employee', tenantId,
        inviteToken, createdAt, updatedAt, siteHistory: []
    });
}
```

### 3.2 Super Admin vs Regular Admin

**Location**: tenant.js (Lines 124-126)

```javascript
function isSuperAdmin() {
    return window.currentUser && window.currentUser.role === 'super_admin';
}
```

**Role Hierarchy**:
1. **super_admin** - Manages all tenants, sees all data, views admin requests
2. **admin** - Manages single tenant, invites employees, manages settings
3. **employee** - Can clock in/out, submit expenses

**Related Logic**:
- Super admin redirect to tenant management: tenant.js Line 152-154
- Regular user redirect to their tenant: tenant.js Line 158-162
- Admin request handling: admin.js Line 71-103

### 3.3 User Tenant Determination

**File**: `/home/user/Attendance-System_moritasetsubi/js/tenant.js` (Lines 324-358)

```javascript
async function determineUserTenant(userEmail) {
    // Looks up tenant from global_users collection
    const globalUserDoc = await firebase.firestore()
        .collection('global_users')
        .doc(normalizedEmail)
        .get();
    
    if (globalUserDoc.exists) {
        const userData = globalUserDoc.data();
        return userData.tenantId; // Returns tenant ID
    }
}
```

---

## 4. UI COMPONENTS & PAGES

### 4.1 Tenant Management Page

**HTML ID**: `tenant-management-page` (index.html Line 2336)

**Functions**:
- `showSuperAdminDashboard()` - Displays page
- `renderTenantList()` - Renders list of tenants
- `accessTenant()` - Super admin accesses tenant data
- `editTenant()` - Opens tenant settings editor

### 4.2 Tenant Selection Page

**HTML ID**: `tenant-selection-page` (index.html Line 2355)

**Functions**:
- `showTenantSelection()` - Shows tenant options to user

### 4.3 Admin Request Tab

**HTML ID**: `admin-requests-tab` (index.html Line 1836)
**HTML Container**: `admin-requests-content` (index.html Line 2280)

**Functions in admin.js**:
- `initAdminRequestsManagement()` (Lines 45-60)
- `showAdminRequestsTab()` (Lines 65-103)
- `loadAdminRequests()` - Loads pending admin requests
- `approveAdminRequest()` - Super admin approves requests

### 4.4 Login Flow with Tenant Handling

**File**: `/home/user/Attendance-System_moritasetsubi/js/login.js`

**Key Functions**:
- `handleAuthStateChange()` (Line 200+) - Main auth handler
- `handleLogin()` (Lines 150-200) - Login submission
- `handleEmployeeRegister()` - Employee registration via invite
- `ensureTenantInfo()` - Ensures tenant data is loaded

---

## 5. KEY FUNCTIONS & VARIABLES

### 5.1 Global Tenant Functions (tenant.js)

| Function | Purpose | Lines |
|----------|---------|-------|
| `getTenantFromURL()` | Extract tenant ID from URL param | 13-16 |
| `generateTenantId()` | Create unique tenant ID | 22-33 |
| `getCurrentTenantId()` | Get current tenant ID | 38-43 |
| `loadTenantInfo()` | Load tenant data from Firestore | 48-70 |
| `createTenant()` | Create new tenant (admin registration) | 75-100 |
| `getTenantCollection()` | Get tenant-specific collection path | 105-111 |
| `getTenantFirestore()` | Get Firestore reference for tenant | 116-119 |
| `isSuperAdmin()` | Check if user is super admin | 124-126 |
| `showTenantSelection()` | Display tenant selection UI | 131-172 |
| `showSuperAdminDashboard()` | Display tenant management UI | 177-204 |
| `determineUserTenant()` | Look up user's tenant from global_users | 324-358 |
| `initializeTenant()` | Initialize tenant at startup | 287-319 |

### 5.2 Global Tenant Variables

```javascript
window.currentTenant = null;           // Current tenant object {id, ...}
window.currentUser = null;             // Current user object
window.currentTenant.id = tenantId;    // Tenant ID
```

### 5.3 Tenant-Aware Collection Functions (main.js)

| Function | Purpose | Lines |
|----------|---------|-------|
| `getTenantCollection(collection)` | Get path with tenant prefix | 2-11 |
| `getTenantFirestore(collection)` | Get Firestore ref for tenant | 13-16 |
| `getUserCollection()` | Get tenant-specific users collection | 24-32 |
| `getGlobalUserDoc(email)` | Get global user document | 35-37 |

### 5.4 Tenant Settings Functions (tenant-settings.js)

| Function | Purpose | Lines |
|----------|---------|-------|
| `getTenantSettings(tenantId)` | Get tenant configuration | 88-109 |
| `saveTenantSettings()` | Save tenant settings | 117-144 |
| `initializeTenantSettings()` | Initialize defaults for new tenant | 174-192 |
| `getTenantSites(tenantId)` | Get work sites | 199-207 |
| `saveTenantSites()` | Save work sites list | 215-225 |
| `getAttendanceSettings()` | Get working hours/break settings | 232-239 |

---

## 6. FILES USING TENANT LOGIC

### 6.1 Core Tenant Files

1. **`js/tenant.js`** - Main tenant management (401 lines)
2. **`js/tenant-settings.js`** - Tenant configuration (254 lines)
3. **`js/main.js`** - Tenant collection accessors
4. **`firestore.rules`** - Security rules with tenant checks

### 6.2 Authentication & User Management

1. **`js/auth.js`** - User registration in tenant collections
2. **`js/login.js`** - Tenant determination during login
3. **`js/admin-register.js`** - Admin registration (creates admin_requests)
4. **`js/invite-system.js`** - Invite code validation with tenant
5. **`js/invite-admin.js`** - Tenant-specific invite link generation

### 6.3 Features Using Tenant Data

1. **`js/employee.js`** - Attendance data per tenant
   - `getAttendanceCollection()` (Lines 9-11)
   - `getBreaksCollection()` (Lines 34-35)
   
2. **`js/admin.js`** - Admin features per tenant
   - Multiple `getTenantFirestore()` calls for attendance/breaks/sites
   - Line 35: `firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks')`
   - Admin request handling (lines 65-103)
   - Tenant-specific admin page initialization
   
3. **`js/expense.js`** - Expense tracking per tenant
   - Line 129: `window.getCurrentTenantId()`
   - Site selection from tenant settings
   - Expense collection under tenant
   
4. **`js/expense-report.js`** - Expense reports per tenant
   - Tenant-specific report generation

### 6.4 Utility & Helper Files

1. **`js/utils.js`** - Generic tenant awareness
   - Lines 28-29: `getTenantFirestore('attendance')`
   - Lines 57-58: `getTenantFirestore('breaks')`
   - Lines 87-88: `getUserCollection()`

2. **`js/missing-functions.js`** - Fallback tenant functions
   - Line 140-158: `getCurrentTenantId()` with fallbacks

3. **`js/error-handler.js`** - Error handling

4. **`js/logger.js`** - Logging utility

---

## 7. FIRESTORE SECURITY RULES

**File**: `/home/user/Attendance-System_moritasetsubi/firestore.rules`

### Key Rules:

1. **Tenant Documents** (Lines 21-28)
   ```
   match /tenants/{tenantId}
   - Read: super_admin OR user's tenantId matches
   - Write: super_admin OR tenant admin
   ```

2. **Tenant Subcollections** (Lines 31-40)
   ```
   match /tenants/{tenantId}/{subcollection}/{docId}
   - Read/Write: super_admin OR user's tenantId matches
   - Create: Special rules for employee user registration
   ```

3. **Global Users** (Lines 6-13)
   - Read/Write: User's own document
   - Write: super_admin can write any user

4. **Invite Codes** (Lines 49-66)
   - Tenant-specific creation by admin
   - Usage tracked globally

5. **Admin Requests** (Lines 43-46)
   - Only super_admin can read/write
   - Anyone can create (unauth access)

---

## 8. ADMIN REGISTRATION FLOW

### Step 1: Admin Request Creation (admin-register.html)
- **File**: `js/admin-register.js`
- Creates document in `admin_requests` collection
- Stores: email, password, company name, department, phone

### Step 2: Super Admin Approval (admin.js)
- Super admin sees admin requests tab
- Approves/rejects requests
- Line 71: `isSuperAdmin()` check
- Line 196: `showSuperAdminDashboard()` loads requests

### Step 3: Tenant Creation (tenant.js)
- `createTenant()` (Lines 75-100)
- Creates `tenants/{tenantId}` document
- Generates tenant ID from company name

### Step 4: Admin User Creation
- Creates admin user in `global_users/{email}`
- Also in `tenants/{tenantId}/users/{uid}`
- Sets `role: 'admin'` and `tenantId`

---

## 9. CONVERSION REQUIREMENTS FOR SINGLE-TENANT

To convert to single-tenant (dedicated to 森田設備), the following changes are needed:

### 9.1 Remove/Disable Files & Functions
- **Disable**: `js/tenant.js` - All tenant selection/switching
- **Disable**: `js/tenant-settings.js` - Keep settings, just hardcode tenantId
- **Remove**: `tenant-management-page`, `tenant-selection-page` from HTML
- **Remove**: `admin-requests` functionality - No super admin needed
- **Remove**: Admin registration pages (`admin-register.html`)
- **Remove**: Global `admin_requests` collection handling

### 9.2 Replace Tenant Access Functions
Replace all `getTenantCollection()`, `getTenantFirestore()`, `getCurrentTenantId()` calls:

**Current**:
```javascript
firebase.firestore().collection(getTenantCollection('attendance'))
```

**New**:
```javascript
firebase.firestore().collection('attendance')  // or 'moritasetsubi/attendance'
```

### 9.3 Update URL Parameter Handling
- Remove `?tenant=` URL parameter
- Remove all `getTenantFromURL()` calls
- Hardcode tenant ID instead

### 9.4 Simplify User Management
- Keep `global_users` collection for authentication
- Remove `role === 'super_admin'` checks
- Remove `role === 'admin'` logic (everyone is admin for one tenant)
- Simplify to just 'employee' and 'admin' roles

### 9.5 Update Firestore Rules
Replace:
```
match /tenants/{tenantId}/{subcollection}/{docId}
```

With:
```
match /attendance/{docId}
match /breaks/{docId}
match /users/{docId}
```

### 9.6 Update Collection Paths
- `tenants/{tenantId}/users` → `users`
- `tenants/{tenantId}/attendance` → `attendance`
- `tenants/{tenantId}/breaks` → `breaks`
- `tenants/{tenantId}/expenses` → `expenses`
- `tenants/{tenantId}/settings` → `settings`

---

## 10. FILES REQUIRING MODIFICATION

### Critical (Core Tenant Logic)
1. **`js/tenant.js`** - Remove/stub all functions
2. **`js/tenant-settings.js`** - Hardcode tenant ID
3. **`js/main.js`** - Remove tenant collection accessors
4. **`js/auth.js`** - Remove tenant ID assignment in registration
5. **`index.html`** - Remove tenant-related pages and initialization

### High Priority (Feature Updates)
6. **`js/login.js`** - Remove tenant determination, super admin checks
7. **`js/admin.js`** - Remove tenant-specific collection paths, admin requests
8. **`js/employee.js`** - Update collection paths
9. **`js/expense.js`** - Update collection paths
10. **`js/expense-report.js`** - Update collection paths

### Medium Priority (Utilities)
11. **`js/utils.js`** - Remove tenant awareness
12. **`js/missing-functions.js`** - Remove tenant fallbacks
13. **`js/invite-system.js`** - Remove tenant-specific invite handling
14. **`js/invite-admin.js`** - Remove tenant ID detection
15. **`js/error-handler.js`** - Review for tenant-specific errors

### Low Priority (Config)
16. **`firestore.rules`** - Simplify security rules
17. **`js/config.js`** - No changes needed
18. **`js/firebase.js`** - No changes needed

### Files to Remove
1. **`admin-register.html`** - Admin registration page
2. **`js/admin-register.js`** - Admin registration handler

---

## 11. DATA MIGRATION CONSIDERATIONS

### Current Data Structure
```
collection('global_users') {
  email: {
    uid, email, displayName, tenantId, role, createdAt
  }
}

collection('tenants') {
  {tenantId}: {
    id, companyName, adminEmail, createdAt, ...
  }
}

collection('tenants/{tenantId}/users') {
  {uid}: {
    email, displayName, role, tenantId, createdAt, ...
  }
}

collection('tenants/{tenantId}/attendance') {
  {docId}: attendance records
}
```

### Single-Tenant Structure
```
collection('users') {
  {uid}: {
    email, displayName, role, createdAt, ...
    (no tenantId needed)
  }
}

collection('global_users') {
  (can be removed or repurposed)
}

collection('attendance') {
  {docId}: attendance records
}
```

### Migration Steps
1. Create backup of Firestore data
2. Copy data from `tenants/{tenantId}/*` to root collections
3. Remove `tenantId` field from user documents
4. Remove `global_users` references
5. Update invite codes (remove or convert)

---

## APPENDIX: Code Examples

### Example: Convert Collection Access

**Before (Multi-tenant)**:
```javascript
const attendanceCollection = window.getTenantFirestore('attendance');
const docs = await attendanceCollection.where('userId', '==', uid).get();
```

**After (Single-tenant)**:
```javascript
const attendanceCollection = firebase.firestore().collection('attendance');
const docs = await attendanceCollection.where('userId', '==', uid).get();
```

### Example: Remove Tenant Parameter from URL

**Before**:
```javascript
const tenantUrl = `${window.location.origin}${window.location.pathname}?tenant=${tenantId}`;
window.location.href = tenantUrl;
```

**After**:
```javascript
window.location.href = window.location.origin + window.location.pathname;
```

### Example: Simplify User Role Check

**Before**:
```javascript
if (userData.role === 'super_admin') {
    await showSuperAdminDashboard();
} else if (userData.role === 'admin') {
    showPage('admin');
} else {
    showPage('employee');
}
```

**After**:
```javascript
if (userData.role === 'admin') {
    showPage('admin');
} else {
    showPage('employee');
}
```

