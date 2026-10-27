# Live balances — setup (Finance)

Finance can read today's balance from your banks and record it as a
balance check, so Payday and Everyday use real numbers. It is
**read-only**: nothing here can move money.

- **HSBC and Monzo (UK):** Open Banking through **Enable Banking** —
  free for linking your own accounts ("restricted" mode). You approve
  access on your bank's own site; it lasts about 90 days, then Finance
  asks you to link again.
- **America First and Fidelity (US):** **SimpleFIN Bridge** — about
  $15 a year. You connect your banks on SimpleFIN's site and give Finance
  a one-time setup token.

The links are held by a small server (Firebase Cloud Functions, code in
`functions/`), in Firestore at `bankLinks/{uid}`. No security rule lets
the app read that, so the browser only ever sees balances.

You do these steps yourself (they involve your accounts and keys).
About 30 minutes, once.

## 1. Firebase: turn on pay-as-you-go

Cloud Functions need the **Blaze** plan. Light use like this stays in
the free allowance.

1. Go to console.firebase.google.com → project **planner-sync-c2f84** →
   the plan name (bottom left) → **Upgrade** → **Blaze**.
2. When it offers a budget alert, set it to **£1**, so you hear about
   any charge at all.

## 2. Enable Banking (HSBC, Monzo)

1. Sign up at **enablebanking.com** and open the **Control Panel**.
2. **API applications → Add a new application**:
   - Environment: **Production**.
   - Name: Vectis Finance.
   - Allowed redirect URLs:
     `https://rileymaughan87-dev.github.io/Vectis-Planning-App/finance/`
     (optionally add `http://localhost:5174/` too, for testing on the
     laptop).
   - Choose to **generate the private key in the browser**. A `.pem` file
     downloads; its name is the **application ID**. Keep the file
     somewhere private and never put it in the repo.
3. On the new application, choose **Link accounts** and link HSBC and
   Monzo. This activates the free restricted mode, which only reaches
   accounts you've linked there.

## 3. SimpleFIN (America First, Fidelity)

1. Sign up at **bridge.simplefin.org** and pay the yearly fee.
2. Connect **America First Credit Union** and **Fidelity**.
3. Leave the tab open: in step 5 you'll make a setup token
   (**Apps → New connection**) and copy it.

## 4. Deploy the server (Windows terminal, in the repo folder)

```
npm install -g firebase-tools
firebase login
cd functions
npm install
firebase functions:secrets:set ENABLE_BANKING_APP_ID
firebase functions:secrets:set ENABLE_BANKING_KEY --data-file "C:\path\to\the-file.pem"
npm run deploy
```

- The first `secrets:set` asks for the application ID; paste it.
- If it asks to enable the Secret Manager API, say yes.
- `npm run deploy` builds the functions and deploys them. They run in
  London (europe-west2).

## 5. Link them in Finance

1. Open Finance and make sure you're signed in under **Settings → Sync**.
2. Go to **Settings → Live balances → Link a UK bank**. Search **HSBC**,
   approve on HSBC's site, and you come back to Finance. Do the same for
   **Monzo**.
3. **Connect US banks:** paste the SimpleFIN setup token.
4. For each bank account listed, set **Follows** to the matching Finance
   account. Fidelity can follow an account of the kind *Investment*.

Balances are then checked when you open Finance (at most every 30
minutes), or with **Check now** on the Accounts tab. Each check is
recorded like one you typed in ("From the bank"), with one per account
per day.

## Renewing and removing

- **UK links** run out after about 90 days. Settings shows "Renew by …"
  two weeks ahead. Link the bank again; the accounts keep following.
- **Unlink** in Settings removes a link from the server, and for UK banks
  ends the session at Enable Banking too. Accounts that followed it go
  back to being checked by hand; their history stays.
- **To revoke access entirely:** remove Finance in your bank's app
  (HSBC/Monzo: connected apps or Open Banking settings), or delete the
  connection on SimpleFIN.
