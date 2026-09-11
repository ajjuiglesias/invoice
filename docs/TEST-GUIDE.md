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
4. Enter a real test email and a password of at least eight characters.
5. Select **Create account**.
6. If Supabase email confirmation is enabled, open the confirmation email and return to the app.

Expected:

- The account is created as a freelancer.
- The user reaches the freelancer details screen after confirmation/sign-in.
- No admin controls are visible.

### Existing user

1. Select **Sign in**.
2. Enter an incorrect password and confirm a clear error appears.
3. Enter the correct password.
4. Sign out, select **Sign in with an email link**, and request a link.
5. Sign out, select **Forgot or need to create a password?**, and request a setup link.
6. Open the setup link, verify mismatched passwords are rejected, and save a matching password of
   at least eight characters.
7. Sign out and sign in with the new password.

Expected:

- Correct credentials restore the same profile, draft, and invoice history.
- The passwordless link returns to the app and signs in the same user.
- An email-link-only user can create a password without creating a second account.
- The recovery link opens the branded password setup screen and the new password works afterwards.
- Signing out prevents access to authenticated pages.

### Google sign-in (when enabled in Supabase)

1. Select **Continue with Google**.
2. Choose the Google account whose email should own the portal account.
3. Return to the app, sign out, and repeat the Google sign-in.

Expected:

- The first sign-in creates one freelancer profile and opens the details screen.
- Later Google sign-ins return to the same profile and invoice history.
- Cancelling or denying Google access returns a clear error and does not create a partial session.

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

## 5. Deadline and email behaviour

1. Create an invoice for a month whose submission window has passed.
2. Continue to review.
3. Confirm the late warning is displayed.
4. Download both files and select **Open in Gmail**.
5. Also inspect **Preview the email** and **Copy the email**.

Expected:

- A late invoice remains downloadable, submittable, and sendable.
- The warning says to flag the late submission to the line manager.
- Gmail opens a draft addressed to `accounts@juliacharles.co.uk`.
- `stacy@juliacharles.co.uk` is in CC.
- Subject, body, invoice month, freelancer name, total, and attachment instructions are correct.
- The app never sends automatically; the user reviews, attaches both files, and sends from Gmail.

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
2. Use the sidebar at desktop width and the mobile menu at phone width.
3. Open **Team Members**, search users, filter roles, and change a test user's role.
4. Open **Rate Card & Prices**, search and filter task types.
5. Change one price, discard it, change it again, and publish a new unique version.
6. Start a new freelancer invoice after publishing.
7. Re-open an invoice created before the rate change.

Expected:

- Only Admin sees role and rate-card controls.
- Search, filters, counters, mobile navigation, refresh, and collapsed sidebar work.
- Publishing requires all valid rates and a unique version.
- New invoices use the new rate.
- Existing invoices preserve their original line prices and rate-card version.

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

- [ ] Sign-up, confirmation, password sign-in, passwordless sign-in, and sign-out pass.
- [ ] Freelancer profile and user-specific bank storage pass.
- [ ] Draft autosave and restore pass.
- [ ] Excel and PDF match the reviewed invoice.
- [ ] Late invoice can still be downloaded, submitted, and emailed.
- [ ] Email recipient and CC are correct.
- [ ] Freelancer isolation and invoice locking pass.
- [ ] Manager change request and approval pass.
- [ ] Accounts totals, CSV, sent, and paid flow pass.
- [ ] Admin roles and rate-card publishing pass.
- [ ] Desktop and mobile layouts pass.
- [ ] Network failures and deactivated accounts are handled clearly.

Record each failure with the test section, account role, browser, exact steps, expected result,
actual result, and a screenshot. Do not include passwords, bank details, access tokens, or secret keys
in bug reports.
