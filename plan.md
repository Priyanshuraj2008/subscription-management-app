

## Personal Finance Tracker — Implementation Plan

### Overview
A full-featured personal finance tracker with authentication, dashboard, income/expense tracking, budgets, bill reminders, savings goals, analytics, and file uploads. Dark/light theme toggle, multi-currency support, connected to an external Supabase project.

---

### 1. Authentication & User Setup
- Signup/login pages with email & password via Supabase Auth
- Password reset flow with dedicated reset page
- Protected routes redirecting unauthenticated users to login
- Profiles table auto-created on signup (name, avatar, preferred currency)

### 2. Database Schema (Supabase migrations)
- **profiles** — user settings, display name, default currency
- **categories** — income/expense categories (user-defined + defaults)
- **transactions** — amount, type (income/expense), category, date/time, notes, currency, receipt attachment path
- **budgets** — monthly budget per category with month/year
- **bills** — recurring bills with due date, reminder flag, amount, attachment path
- **savings_goals** — goal name, target amount, current amount, deadline
- **attachments** — file metadata linked to transactions/bills (stored in Supabase Storage bucket)
- All tables have RLS policies scoped to `auth.uid()`
- All records store `created_at` and `updated_at` timestamps

### 3. File Upload & Storage
- Supabase Storage bucket for receipts/documents (images, PDFs)
- Upload component with drag-and-drop, preview thumbnails for images, PDF icon for documents
- Attachments linked to transactions or bills via foreign key
- Secure access via RLS on storage bucket

### 4. Pages & Features

**Dashboard**
- Summary cards: total income, expenses, net balance (current month)
- Spending by category donut chart
- Income vs expenses bar chart (last 6 months)
- Upcoming bills widget
- Savings goals progress bars
- Recent transactions list

**Transactions**
- Full CRUD table with search, date range filter, category filter, type filter
- Inline file upload for receipts
- Sortable columns, pagination
- Quick add floating button

**Budgets**
- Monthly budget setup per category
- Progress bars showing spent vs budget
- Over-budget alerts

**Bills & Reminders**
- Add recurring bills with due dates
- Mark as paid
- Attach bill images/PDFs
- Visual indicators for upcoming/overdue

**Savings Goals**
- Create goals with target amount and deadline
- Add contributions
- Progress visualization

**Reports & Analytics**
- Monthly/yearly spending trends (line/bar charts)
- Category breakdown (pie chart)
- Income vs expense comparison
- Export-ready views

**Profile Settings**
- Edit name, avatar
- Default currency selector (USD, EUR, GBP, JPY, etc.)
- Theme toggle (dark/light)

### 5. UI & Design
- Clean fintech aesthetic with shadcn/ui components
- Dark/light mode toggle persisted in localStorage
- Recharts for all data visualizations
- Responsive layout — mobile-friendly sidebar/bottom nav
- Toast notifications for actions
- Currency formatting based on user preference

### 6. Tech Stack
- React + TypeScript + Tailwind + shadcn/ui
- Supabase (external) for auth, database, storage
- Recharts for charts
- React Router for navigation
- TanStack Query for data fetching

