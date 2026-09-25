# JCEM Invoice Portal — Test Guide

App: <http://127.0.0.1:5173/>

Use a private/incognito browser window for each test role so the Supabase sessions do not replace
one another. For the complete workflow, prepare four email addresses you can access:

| Test user | Role |
| --- | --- |
| Freelancer A | `freelancer` |
| Freelancer B | `freelancer` |
| Manager | `manager` |
| Accounts | `accounts` |

An admin account is also required. New accounts start as `freelancer`; an existing admin can assign
roles in **Administration → Team Members**. For the first admin only, use Supabase SQL Editor:

```sql
update profiles set role = 'admin' where email = 'your-admin-email@example.com';
```

Refresh or sign out and back in after changing a role.

## 1. Authentication

### New user

1. Open the app in an incognito window.
2. Select **New user**.
3. Confirm an invalid email and a password shorter than eight characters cannot be submitted.
4. Enter an email the administrator authorised and a password of at least eight characters.
5. Select **Create account**.

Expected:

- The account is created as a freelancer.
- The user is signed in immediately and reaches the freelancer details screen.
- No admin controls are visible.
- No confirmation email is required.

### Existing user

1. Select **Sign in**.
2. Enter an incorrect password and confirm a clear error appears.
3. Enter the correct password.
4. Sign out and sign back in with the same email and password.

Expected:

- Correct credentials restore the same profile, draft, and invoice history.
- The same account and profile return after sign-in.
- Signing out prevents access to authenticated pages.
- Forgot-password requests are handled by an administrator until SMTP is configured.

## 2. Freelancer profile and autosave

1. Sign in as Freelancer A.
2. Enter name, business name, email, address, country, and bank details.
3. Refresh the page midway through editing.
4. Complete every required field and continue.
5. Sign in on another browser/device if available.

Expected:

- Name and address fields survive refresh and follow the account between devices.
- Bank details survive refresh only in the same browser and never appear on another device.
- Missing required fields show actionable validation messages.
- One user's bank details never appear after a different user signs in on the same browser.

## 3. Build an invoice

1. Choose a task type from each relevant category.
2. Enter a quantity.
3. Add a valid Asana task URL and a valid live-page URL.
4. Add and remove extra links.
5. Try malformed links, zero quantity, and an empty required field.
6. Refresh, then return to the draft.
7. Continue to review.

Expected:

- Rates and totals update immediately.
- Invalid fields explain what must be fixed.
- Refresh restores the draft.
- The review screen displays the correct freelancer, period, lines, rate-card version, and total.

## 4. Excel and PDF output

1. From review, download the Excel file and PDF.
2. Open both files.
3. Compare the app total, Excel subtotal, and PDF total.
4. Click representative Asana and live-page links in both outputs.
5. Check the Excel workbook against the company template.

Expected:

- All three totals match exactly.
- Tasks occupy the correct template rows.
- Links are clickable and point to the entered destinations.
- Branding, fonts, spacing, names, addresses, dates, invoice number, and bank details are correct.
- No old invoice data remains in unused template cells.

## 5. Deadline and submission behaviour

1. Create an invoice for a month whose submission window has passed.
2. Continue to review.
3. Confirm the late warning is displayed.
4. Download both files and select **Submit for approval**.

Expected:

- A late invoice remains downloadable and submittable.
- The warning clearly identifies the missed submission window.
- The invoice appears immediately in the manager's approval queue.
- No Gmail, mail-client, recipient, CC, or email-preview controls are displayed.

## 6. Submit and lock

1. Submit Freelancer A's invoice for approval.
2. Return to history and attempt to edit or delete it.
3. Sign in as Freelancer B and inspect history.

Expected:

- Status changes to **Submitted**.
- The submitted invoice is locked.
- Freelancer A sees their invoice; Freelancer B cannot see it.
- Repeated clicks do not create duplicate invoice numbers or duplicate lines.

## 7. Manager approval

1. Sign in as the Manager in another browser.
2. Open **Approvals** and locate Freelancer A's invoice.
3. Verify links, task lines, profile snapshot, total, and files.
4. Select **Request changes** without a note, then add a useful note and submit.
5. As Freelancer A, edit and resubmit the returned invoice.
6. As Manager, approve it.

Expected:

- Submitted invoices appear in the manager queue.
- A change request requires a note.
- The freelancer sees that note and can edit a returned invoice.
- Resubmission clears the previous decision note.
- Approval locks the invoice and records the decision.
- A manager cannot approve their own invoice.

## 8. Accounts workflow

1. Sign in as Accounts.
2. Open **Accounts & Totals**.
3. Check awaiting approval, approved-not-sent, and sent-not-paid totals.
4. Filter by month and freelancer.
5. Export CSV and open it in Excel.
6. Mark the approved invoice **Sent**, then **Paid**.

Expected:

- Dashboard counts and totals match the underlying invoices.
- The chase list identifies active freelancers with no invoice for the selected month.
- CSV columns, pound values, commas, and names display correctly in Excel.
- Only Accounts or Admin can progress **Approved → Sent → Paid**.

## 9. Admin dashboard

1. Sign in as Admin.
2. Confirm the first page after sign-in is the management Approvals dashboard, not freelancer details or the invoice builder.
3. Use the sidebar at desktop width and the mobile menu at phone width.
4. Open **Team Members**, search users, filter roles, and change a test user's role.
5. Authorise a new email, confirm it appears under pending invitations, then revoke it.
6. Authorise it again, create the account with that exact email, and confirm the invitation is accepted.
7. Deactivate and reactivate a non-admin test account.
8. Confirm access history records the acting administrator, target user, action, time, and role.
9. Open **Rate Card & Prices**, search and filter task types.
10. Change one price, discard it, change it again, and publish a new unique version.
11. Add another version without changing a price.
12. Delete an unused older version, then attempt to delete the active version.
13. Start a new freelancer invoice after publishing.
14. Re-open an invoice created before the rate change.

Expected:

- Only Admin sees role and rate-card controls.
- An email that was not authorised cannot register; a pending invitation uses its assigned role.
- The final active administrator cannot be demoted or deactivated.
- Search, filters, counters, mobile navigation, refresh, and collapsed sidebar work.
- Publishing requires all valid rates and a unique version.
- New invoices use the new rate.
- Existing invoices preserve their original line prices and rate-card version.
- An unused historical rate card can be deleted; active and invoice-linked cards cannot.

## 10. Failure and security checks

1. Disconnect the network while editing, then make another change.
2. Restore the connection and retry.
3. Open two tabs as one freelancer and start new invoices in both.
4. Deactivate a test user in Supabase and try to sign in again.
5. Inspect browser developer tools for console errors during the normal workflow.

Expected:

- Save and loading failures appear visibly; the app does not remain on an endless spinner.
- Invoice numbers do not collide between tabs.
- A deactivated account is signed out and shown a clear message.
- Direct unauthenticated database writes are denied.
- No service-role or secret key appears in page source, network requests, or built files.
- Normal use produces no uncaught exceptions.

## Release acceptance checklist

- [ ] Invited-user sign-up, password sign-in, and sign-out pass with Supabase Confirm email disabled.
- [ ] Freelancer profile and user-specific bank storage pass.
- [ ] Draft autosave and restore pass.
- [ ] Excel and PDF match the reviewed invoice.
- [ ] Late invoice can still be downloaded and submitted.
- [ ] Freelancer isolation and invoice locking pass.
- [ ] Manager change request and approval pass.
- [ ] Accounts totals, CSV, sent, and paid flow pass.
- [ ] Admin roles and rate-card publishing pass.
- [ ] Desktop and mobile layouts pass.
- [ ] Network failures and deactivated accounts are handled clearly.

Record each failure with the test section, account role, browser, exact steps, expected result,
actual result, and a screenshot. Do not include passwords, bank details, access tokens, or secret keys
in bug reports.
