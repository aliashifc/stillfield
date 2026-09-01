/**
 * Stillfield — Register-interest pipeline.
 *
 * One script does the three things the client asked for: it files the enquiry
 * in a spreadsheet he can open, emails him a copy, and sends the enquirer an
 * acknowledgement.
 *
 * ── Deploying it ──────────────────────────────────────────────────────────
 *  1. In the CLIENT'S Google account (so he owns the data, not us), create a
 *     new Google Sheet — call it "Stillfield enquiries".
 *  2. Extensions → Apps Script. Delete the placeholder, paste this file in.
 *  3. Fill in the CONFIG block below.
 *  4. Deploy → New deployment → type "Web app".
 *       Execute as:        Me
 *       Who has access:    Anyone
 *     "Anyone" is required — the visitor's browser posts to this URL without
 *     being logged into Google. Nothing sensitive is exposed: the script only
 *     ever writes, and never reads anything back out.
 *  5. Authorise when prompted. Google will warn that the script is unverified;
 *     that is expected for a private script — continue.
 *  6. Copy the deployment URL (it ends in /exec) into FORM_ENDPOINT at the top
 *     of src/components/Modal.tsx.
 *
 * ── Sending the auto-reply from the domain ────────────────────────────────
 * By default Gmail sends as whichever account owns this script, so the
 * acknowledgement would arrive from an @gmail.com address. To send it from
 * ashif.ali@stillfield.co.uk instead: in that Gmail account, Settings → See
 * all settings → Accounts and Import → "Send mail as" → Add another email
 * address, then authenticate against Hostinger's SMTP server using the
 * mailbox password. Once the alias is verified, set REPLY_FROM below.
 * Leave REPLY_FROM empty and the script falls back to Reply-To, which still
 * routes replies correctly even though the From line is a Gmail address.
 *
 * Quota note: a free Gmail account can send ~100 emails a day, and each
 * enquiry sends two. Ample for a pre-launch teaser.
 */

/* ── CONFIG ─────────────────────────────────────────────────────────────── */

/** Who gets told about a new enquiry. Comma-separate for several people. */
var NOTIFY_TO = 'ashif.ali@stillfield.co.uk';

/** Verified "Send mail as" alias for the auto-reply. Empty = use Reply-To. */
var REPLY_FROM = '';

/** Where replies should go, and the address shown in the acknowledgement. */
var REPLY_TO = 'contact@stillfield.co.uk';

/** Appears in the acknowledgement signature. */
var COMPANY_NAME = 'Stillfield Private Limited';

/** Tab within the spreadsheet. Created automatically if absent. */
var SHEET_NAME = 'Enquiries';

/* ── END CONFIG ─────────────────────────────────────────────────────────── */

var COLUMNS = [
  'Received',
  'First name',
  'Last name',
  'Email',
  'Phone',
  'Job title',
  'Company',
  'Reason for contact',
  'Comments',
  'Marketing opt-in',
  'Source page',
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'empty request' });
    }

    var d = JSON.parse(e.postData.contents);

    // Server-side check as well as in the browser — the endpoint is public,
    // so anything could post to it.
    if (!d.email || !d.firstName || !d.lastName) {
      return json({ ok: false, error: 'missing required fields' });
    }

    var row = [
      new Date(),
      str(d.firstName),
      str(d.lastName),
      str(d.email),
      str(d.phone),
      str(d.jobTitle),
      str(d.company),
      str(d.intendedUse),
      str(d.comments),
      d.marketingOptIn ? 'Yes' : 'No',
      str(d.page),
    ];

    appendRow(row);

    // The enquiry is safely filed by this point. If either email fails —
    // quota, a bad alias — log it and still report success, because the lead
    // is not lost and the visitor should not be told to try again.
    try { notify(d); } catch (err) { console.error('notify failed: ' + err); }
    try { acknowledge(d); } catch (err) { console.error('auto-reply failed: ' + err); }

    return json({ ok: true });
  } catch (err) {
    console.error('doPost failed: ' + err);
    return json({ ok: false, error: String(err) });
  }
}

/** Lets you confirm the deployment is live by visiting the URL in a browser. */
function doGet() {
  return json({ ok: true, service: 'stillfield-enquiries' });
}

function appendRow(row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
}

function notify(d) {
  var name = str(d.firstName) + ' ' + str(d.lastName);
  var lines = [
    'New enquiry from the Stillfield site.',
    '',
    'Name:      ' + name,
    'Email:     ' + str(d.email),
    'Phone:     ' + (str(d.phone) || '—'),
    'Job title: ' + str(d.jobTitle),
    'Company:   ' + str(d.company),
    'Reason:    ' + str(d.intendedUse),
    'Marketing: ' + (d.marketingOptIn ? 'Opted in' : 'No'),
    '',
    'Comments:',
    str(d.comments) || '—',
    '',
    '— filed in the enquiries spreadsheet',
  ];

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'Stillfield enquiry — ' + name + ' (' + str(d.company) + ')',
    body: lines.join('\n'),
    replyTo: str(d.email),
    name: 'Stillfield website',
  });
}

function acknowledge(d) {
  var body = [
    'Hello ' + str(d.firstName) + ',',
    '',
    'Thank you for registering your interest in Stillfield.',
    '',
    'We have your enquiry and someone will be in touch personally as pods',
    'become available to partners.',
    '',
    'If you need to add anything in the meantime, simply reply to this email.',
    '',
    '— ' + COMPANY_NAME,
    REPLY_TO,
  ].join('\n');

  var options = {
    to: str(d.email),
    subject: 'Stillfield — we have your enquiry',
    body: body,
    name: 'Stillfield',
  };

  if (REPLY_FROM) {
    options.from = REPLY_FROM;
  } else {
    options.replyTo = REPLY_TO;
  }

  MailApp.sendEmail(options);
}

function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
