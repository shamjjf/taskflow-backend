# TaskFlow — Complete User Guide

> A practical walk-through of what each role can do in TaskFlow and how
> to use every feature. Built for JJF India and shared across all
> tenant organizations.

---

## Table of contents

1. [What is TaskFlow](#what-is-taskflow)
2. [Roles at a glance](#roles-at-a-glance)
3. [Logging in](#logging-in)
4. [Super Admin guide](#super-admin-guide)
5. [Sub-Admin (Admin) guide](#sub-admin-admin-guide)
6. [Team Leader guide](#team-leader-guide)
7. [Employee guide](#employee-guide)
8. [Common workflows (step-by-step)](#common-workflows-step-by-step)
9. [Notifications & real-time updates](#notifications--real-time-updates)
10. [Reports — daily & weekly](#reports--daily--weekly)
11. [Chat](#chat)
12. [Profile & password](#profile--password)
13. [FAQ & troubleshooting](#faq--troubleshooting)

---

## What is TaskFlow

TaskFlow is a **multi-department task management system** for organizations.
Every member of the organization gets one of four roles. Each role sees
exactly the slice of the system they need — nothing more.

The app has two panels:

- **Admin panel** (taskflow-super-admin) — for Super Admin and Sub-Admin
- **Employee panel** (taskflow-employee) — for Team Leaders and Employees

Both panels run on the same backend and share data in real time over
WebSocket — when something changes (a task is assigned, a comment is
posted, a report is approved), every connected user sees the update
without refreshing.

---

## Roles at a glance

| Role | Who it's for | Top-level access |
| --- | --- | --- |
| **Super Admin** | Owner of the organization | Everything — users, departments, tasks, reports, settings, billing-style controls |
| **Sub-Admin** (a.k.a. Admin) | Trusted operator under the Super Admin | Manages departments and users; cannot touch other Sub-Admins or the Super Admin |
| **Team Leader** | Department head | Assigns and reviews tasks for their own department only |
| **Employee** | Individual contributor | Works on tasks assigned to them; submits daily / weekly reports |

**Hierarchy of authority:**

```
Super Admin
   └─ Sub-Admin(s)
        └─ Team Leader(s) ── (one per department)
             └─ Employee(s) — multiple per department
```

A user belongs to **exactly one organization** and (for Team Leaders /
Employees) **exactly one department**.

---

## Logging in

1. Open the panel URL given to you (admin panel for Super/Sub-Admin,
   employee panel for Team Leader / Employee).
2. Pick your **Organization** from the dropdown (e.g. JJF India, 1XL).
3. (Admin panel only) Pick the **role tab**: Super Admin or Sub-Admin.
   (Employee panel: Employee or Team Leader.)
4. Enter the email and password your Super Admin gave you.
5. Click **Sign in →**.

If the credentials are wrong, the screen shows "Invalid email or
password" — same message whether the email exists or not, so attackers
can't guess account names.

If your account is deactivated (or your organization is paused), the
backend returns a 403 immediately and your existing session ends.

### Forgot password?

There's no self-serve reset today. Contact your Super Admin and ask
them to reset your password from the Users page.

---

## Super Admin guide

The Super Admin is the founding account for an organization. There is
typically one Super Admin per company. Created via the seed script
(see `prisma/seed.organization.ts`).

### What the Super Admin can do

| Area | Capability |
| --- | --- |
| Users | Create, edit, delete, activate/deactivate any user (including Sub-Admins). Set passwords. |
| Departments | Create, edit, delete departments. Assign or change the Team Leader. |
| Tasks | View and edit any task across all departments. Override status on closed tasks if needed. |
| Reports | View all daily/weekly reports submitted by anyone. Approve / reject. |
| Settings | Edit Organization name, timezone, and the recipient list for daily/weekly report emails. |
| Chat | See every conversation including department auto-groups. Manage group members. |
| Notifications | Full visibility into the system's task/report/chat events. |
| Activity log | View the audit trail of sensitive actions. |
| Analytics | Cross-department dashboards: task completion rate, top performers, etc. |

### Step-by-step: creating a new user

1. Left sidebar → **Users**.
2. Top-right → **+ Add User**.
3. Fill in name, email, role, department (required for Team Leader /
   Employee), designation (optional), initial password.
4. Click **Create**.
5. Share the password with the user out-of-band (chat, email) and tell
   them to change it on first login from Profile → Change Password.

### Step-by-step: creating a new department

1. Sidebar → **Departments**.
2. **+ Add Department**.
3. Enter name (e.g. "Marketing") and description.
4. Optionally pick an existing user as the Team Leader (you can do
   this later too).
5. The auto group chat for this department is created in the
   background — every member you add later will be auto-enrolled.

### Step-by-step: assigning a Team Leader

1. Departments → click the department → **Edit**.
2. Pick a user from the Team Leader dropdown.
3. Save. The user's role is automatically bumped to `team_leader` and
   their department is set to this one.

> Note: a Sub-Admin or another Super Admin can NOT be assigned as a
> Team Leader — they'd be silently demoted, which TaskFlow blocks.

### Step-by-step: changing report recipients

1. Sidebar → **Settings**.
2. Under **Report Recipients**, **+ Add** an email.
3. That email will now receive the daily and weekly XLSX report emails
   along with the org's admin tier.

### Step-by-step: tracking an issue (audit log)

1. Sidebar → **Activity Log**.
2. Filter by action, user, or date range.
3. Useful when someone reports "my task was deleted" or "who changed
   this user's role."

---

## Sub-Admin (Admin) guide

The Sub-Admin is an Admin tier role — the right hand of the Super
Admin. Created by the Super Admin from Users → + Add User → role
"Sub-Admin".

### What the Sub-Admin CAN do

- Create, edit, deactivate **Team Leaders** and **Employees**.
- Create, edit, delete **Departments** and assign Team Leaders (but not
  to Sub-Admins or the Super Admin).
- Create, edit, delete **Tasks** across any department.
- View **all reports** and approve/reject them.
- See all **dashboard analytics**.
- Chat in any auto-department group; start DMs.
- Manage their **own profile** (name, phone, avatar, password).

### What the Sub-Admin CANNOT do

- Edit or delete **other Sub-Admins or the Super Admin**.
- View the Super Admin's profile page directly.
- Edit **Organization Settings** (company name, timezone, report
  recipients) — Super Admin only.
- Promote anyone to Sub-Admin / Super Admin — only the Super Admin can
  do that.

Sub-Admin is great when you trust someone to run day-to-day operations
but want to keep core controls with the Super Admin.

---

## Team Leader guide

A Team Leader runs one department. Their world is bounded by that
department — they cannot see or touch data from other departments.

### What the Team Leader can do

| Area | Capability |
| --- | --- |
| Department members | View the members of their own department. Add employees and reset their passwords. |
| Tasks (assign) | Create tasks and assign them to one OR multiple employees in the department. |
| Tasks (review) | When an employee marks a task as complete, the task moves to "In Review" in the TL's queue. Approve (→ Completed) or Send Back (→ In Progress) with a reason. |
| Tasks (extend) | Push the deadline forward for an active task. |
| Tasks (delete) | Delete tasks in their own department only. |
| Tasks (work) | Start and complete tasks assigned to themselves. |
| Reports | Receive daily/weekly reports submitted by their team members. Approve or reject. Submit their own daily/weekly report (visible to Super Admin / Sub-Admin). |
| Chat | Department auto-group chat (everyone in the dept is a member). 1:1 DM with anyone in the org. |
| Analytics | View completion rate and trends for their department. |

### Step-by-step: assigning a task to the team

1. Sidebar → **Team Tasks**.
2. **+ Assign Task** (top right).
3. Fill in title, description, priority (low/medium/high), deadline
   (date + time).
4. **Assign To** is a multi-select — pick one or more team members.
5. **Assign Task**. Every selected employee gets a notification.

### Step-by-step: reviewing a completed task

1. When an employee marks a task complete, you'll see a bell
   notification "Task submitted for review" and the task moves to
   **In Review** in Team Tasks.
2. Click the task to open details. Check the work / attachments /
   comments.
3. Click **Approve** to mark Completed, **OR** click **Send Back** and
   give a written reason — the task goes back to In Progress and the
   employee is notified.

### Step-by-step: extending a deadline

1. Team Tasks → click the task → **Extend Deadline**.
2. Pick the new date + time.
3. Save. The assignees see the new deadline and get a notification.

---

## Employee guide

The Employee is the doer. They see only the tasks assigned to them and
the members of their own department.

### What the Employee can do

| Area | Capability |
| --- | --- |
| My Tasks | View all tasks assigned to them. Filter by status (Assigned / In Progress / In Review / Completed / Overdue). |
| Task actions | Start a task (Assigned → In Progress). Submit for review when done (In Progress → In Review). Wait for TL approval. |
| Comments | Post comments and file attachments on tasks they're assigned to. |
| Daily / Weekly reports | Submit a daily or weekly report. Choose whether it links to a task. |
| My Reports | View the history of their submitted reports and review comments. |
| Chat | Department auto-group + 1:1 DMs with anyone in the org. |
| Profile | Edit name, phone, avatar, change password. |

### Step-by-step: starting and finishing a task

1. Sidebar → **My Tasks**.
2. Click an Assigned task → **Start Task**. Status becomes In Progress.
3. Do the work. Use the Comments box to ask questions, attach proof,
   or upload deliverables.
4. When done, click **Submit for Review**. Status becomes In Review.
5. Wait for your Team Leader to Approve or Send Back. You'll get a
   notification either way.

> **Important:** clicking "Submit for Review" does NOT close the task.
> Only the Team Leader can mark it Completed by clicking Approve.

### Step-by-step: submitting a daily report

1. Sidebar → **Submit Report**.
2. Choose **Daily**.
3. Optionally link the report to a specific task.
4. Write the description of what you did today, attach files if needed.
5. Submit. Your Team Leader sees it in their Approve Reports queue.

### Step-by-step: submitting a weekly report

Same as daily, but pick **Weekly** and also fill the
**Weekly objective** field (what you plan / planned for the whole
week).

---

## Common workflows (step-by-step)

These are the routines TaskFlow is designed to make smooth.

### 1. Onboard a new employee

| Step | Who | What |
| --- | --- | --- |
| 1 | Super Admin / Sub-Admin | Users → + Add User → role Employee, pick department, set initial password |
| 2 | New employee | Logs in with the temp password, goes to Profile → Change Password |
| 3 | Auto | New employee is enrolled in the department's auto group chat |
| 4 | Team Leader | Assigns first task from Team Tasks → + Assign Task |

### 2. Task end-to-end (the most important flow)

```
Team Leader                                   Employee
    │                                            │
    │── Creates task, assigns to Employee ──────▶│  (Status: Assigned)
    │                                            │
    │                                       Clicks Start ───┐
    │                                            │           │
    │                                            │           ▼ (In Progress)
    │                                            │
    │                                       Does the work, posts comments
    │                                            │
    │                                       Clicks Submit for Review ─┐
    │                                            │                     │
    │◀───── Sees notification: "in review" ──────│                     ▼ (In Review)
    │                                            │
    │── Approve ─────────▶ (Completed) ─── notif ▶│
    │   OR                                       │
    │── Send Back + reason ─▶ (In Progress) ─ notif ▶│
    │                                            │
```

**Key rules:**
- An Employee cannot mark a task Completed directly — they can only
  "Submit for Review."
- A Team Leader is the only person who can Approve a task.
- A Sub-Admin / Super Admin can also Approve if needed (override).

### 3. Daily reporting cycle

```
End of day:
  Each Employee → Submit Report (Daily)
  Each Team Leader → Submit Report (Daily) + reviews their employees'

8:30 PM (configurable):
  Automatic email goes to:
    - Super Admin
    - All Sub-Admins
    - All extra recipients from Settings → Report Recipients
  Email contains an XLSX attachment with everyone's daily report.
```

Same flow on Saturdays for weekly reports, but the email
covers the whole week and includes the weekly objective field.

### 4. Provisioning a new tenant organization

(For your developer — see `docs/MULTI_TENANCY_DEPLOY.md`.)

---

## Notifications & real-time updates

The bell icon at the top of every panel shows unread notifications.

You get a notification when:

- A task is **assigned** to you (Employee)
- An assignee **starts** a task (Team Leader, Sub-Admin, Super Admin)
- A task is **submitted for review** (Team Leader, Sub-Admin, Super Admin)
- A task is **approved / sent back** (the assignees)
- A report is **submitted** (the reviewer)
- A report is **approved / rejected** (the author)
- A chat message arrives in a conversation you're in
- A task you own is **near deadline** or **overdue**

**Real-time push:** notifications land instantly (no refresh) thanks to
Socket.IO. If you ever see a delay, your network probably dropped the
WebSocket; refreshing the page reconnects.

**Click a notification** → it marks itself read and navigates to the
task, report, or conversation it's about.

**Mark all as read** → button on the Notifications page clears the
whole unread list in one shot.

---

## Reports — daily & weekly

### Who sees what

- **Employees** see only their own submitted reports under My Reports.
- **Team Leaders** see their own + everyone in their department under
  Approve Reports.
- **Sub-Admins / Super Admin** see TL reports under Approve Reports.

### XLSX email

Every day at the configured time (default 20:30 IST), the backend job
generates an XLSX of all daily reports and emails it to:
- Super Admin
- All Sub-Admins
- Every email in Settings → Report Recipients

The weekly variant runs on Saturday evenings and includes the weekly
objective per author.

Each organization gets its own email — JJF's report and 1xl's report
are NEVER combined.

---

## Chat

- **Department auto-groups** — every employee is automatically added to
  their department's group. The group name is "Department Name - Group
  Chat" and it shows in the sidebar.
- **1:1 DMs** — click "New Chat" → pick any user → start typing.
- **Custom groups** — Sub-Admin / Super Admin can create extra groups
  with a custom participant list.
- **Attachments** — paperclip icon. PDFs, images, docs, zips up to 10
  MB per file.
- **Read receipts** — opening a conversation marks every message in it
  as read.
- **Calls** — coming soon (Agora video calling is wired up; UI is in
  the next release).

---

## Profile & password

Top-right corner → your avatar → **My Profile**.

You can edit:
- Name
- Phone number
- Profile picture
- Designation (Team Leader / Employee only — Super Admin / Sub-Admin
  can edit theirs too)

**Change password:**
1. My Profile → Change Password.
2. Enter current password + new password (min 8 chars).
3. Save. You stay logged in on the current tab; other sessions are
   revoked.

**If you forgot your password:** ask your Super Admin to reset it.

---

## FAQ & troubleshooting

### Why don't I see other departments' tasks?

By design. Employees and Team Leaders are scoped to their own
department. Sub-Admin / Super Admin can see across all departments.

### Why don't I see another organization's data?

Also by design. Even if you somehow guess a URL with an ID belonging
to another tenant, the backend returns 404 — no info leaks.

### I got logged out suddenly. Why?

Possible reasons:
- An admin deactivated your account.
- An admin changed your role or department.
- An admin reset your password.
- The organization itself was paused.
- Your refresh token expired (90 days of inactivity).

Sign back in. If you keep getting kicked, ask the Super Admin to
investigate the Activity Log.

### A task I expected to see is missing

- If you're an Employee: was it actually assigned to you? Tasks appear
  under My Tasks only if you are listed as an assignee.
- If you're a Team Leader: is it in your department? Cross-department
  tasks won't show.
- If you're an Admin and it was created by another Admin: by design,
  Admin task lists hide tasks created by their peers (you can see
  your own). Ask the Super Admin if you need a global view.

### My "Mark Complete" button gave an error

You probably saw a 403. Employees no longer use Mark Complete —
they use **Submit for Review**. Only the Team Leader Approves the
task to finally mark it Completed.

### The bell icon stays red after I open Notifications

Try a hard refresh (Ctrl/Cmd + Shift + R). If it persists, the
backend's WebSocket may have disconnected — reconnect by refreshing
the page.

### Daily email didn't arrive

Possible causes:
- SMTP server outage. Check the backend logs.
- No daily reports were submitted by anyone — there's nothing to email.
- Your email got added to the Report Recipients list after today's
  20:30 cron tick.

### How do I add a brand-new organization (e.g. 1xl)?

The Super Admin (you, the platform owner) runs the
`prisma/seed.organization.ts` script on the server with env vars for
the new org slug, name, and super_admin credentials. Full instructions
in `docs/MULTI_TENANCY_DEPLOY.md`.

### How do I bulk-create users?

Not yet supported. CSV import is on the roadmap. For now, use Users →
+ Add User one by one. If you need ~100 users seeded fast, write a
quick SQL script (your developer can help) — same shape as the seed.

---

## Quick reference card

| Need to… | Go to | Notes |
| --- | --- | --- |
| Add a user | Users → + Add User | Super Admin / Sub-Admin / TL (employee only) |
| Add a department | Departments → + Add | Super Admin / Sub-Admin |
| Assign a task | Team Tasks → + Assign Task | TL or above |
| Start a task | My Tasks → click → Start Task | Assignee |
| Mark task done | My Tasks → click → **Submit for Review** | Assignee — NOT Mark Complete |
| Approve a task | Team Tasks → in_review → Approve | TL of dept (or admin tier) |
| Reject a task | Team Tasks → in_review → Send Back | Same |
| Submit a report | Submit Report | Everyone |
| Approve a report | Approve Reports | TL / Admin |
| Change password | Profile → Change Password | Everyone |
| Add an org email recipient | Settings → Report Recipients | Super Admin only |

---

*Last updated for the multi-tenant release. If you spot a step that no
longer matches the UI, ping the developer to update this guide.*
