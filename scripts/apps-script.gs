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

/* Brand palette, lifted from src/styles/global.css. Mail clients strip <style>
   blocks and never load webfonts, so everything here is inline and the type
   stack falls back exactly as the site's own does. */
var BG = '#060607';
var INK = '#ece9e3';
var INK_DIM = '#8b8b92';
var INK_FAINT = '#5a5a61';
var DISPLAY = "'Tenor Sans', 'Times New Roman', serif";
var BODY_FONT = "'Hanken Grotesk', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

function acknowledge(d) {
  var name = str(d.firstName);

  var text = [
    'Hello ' + name + ',',
    '',
    'Thank you for registering your interest in Stillfield.',
    '',
    'We have your enquiry, and someone will be in touch personally as pods',
    'become available to partners.',
    '',
    'If you would like to add anything in the meantime, simply reply to this',
    'email.',
    '',
    '— ' + COMPANY_NAME,
    REPLY_TO,
  ].join('\n');

  var options = {
    to: str(d.email),
    subject: 'Stillfield — we have your enquiry',
    body: text,
    htmlBody: acknowledgeHtml(name),
    name: 'Stillfield',
  };

  if (REPLY_FROM) {
    options.from = REPLY_FROM;
  } else {
    options.replyTo = REPLY_TO;
  }

  MailApp.sendEmail(options);
}

function acknowledgeHtml(name) {
  var p = 'margin:0 0 18px;font-family:' + BODY_FONT +
          ';font-size:15px;line-height:1.75;font-weight:300;color:' + INK + ';';

  return '' +
  '<!-- preheader: shows in the inbox list, hidden in the message itself -->' +
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' +
    'We have your enquiry. Someone will be in touch personally.' +
  '</div>' +

  /* Outer table carries the background: without it, clients that ignore a
     styled <body> leave white margins around a dark email. */
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"' +
  ' style="background-color:' + BG + ';margin:0;padding:0;width:100%;">' +
  '<tr><td align="center" style="padding:56px 20px;">' +

    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"' +
    ' style="width:560px;max-width:100%;">' +

      '<tr><td align="center" style="padding-bottom:10px;">' +
        '<span style="font-family:' + DISPLAY + ';font-size:15px;letter-spacing:0.44em;' +
        'text-indent:0.44em;color:' + INK + ';text-transform:uppercase;">Stillfield</span>' +
      '</td></tr>' +

      '<tr><td style="padding-bottom:44px;">' +
        '<div style="height:1px;background-color:#1c1c1f;line-height:1px;font-size:0;">&nbsp;</div>' +
      '</td></tr>' +

      '<tr><td>' +
        '<p style="' + p + '">Hello ' + esc(name) + ',</p>' +
        '<p style="' + p + '">Thank you for registering your interest in Stillfield.</p>' +
        '<p style="' + p + '">We have your enquiry, and someone will be in touch personally ' +
          'as pods become available to partners.</p>' +
        '<p style="' + p + 'margin-bottom:0;">If you would like to add anything in the ' +
          'meantime, simply reply to this email.</p>' +
      '</td></tr>' +

      '<tr><td style="padding:44px 0 0;">' +
        '<div style="height:1px;background-color:#1c1c1f;line-height:1px;font-size:0;">&nbsp;</div>' +
      '</td></tr>' +

      '<tr><td style="padding-top:20px;">' +
        '<p style="margin:0;font-family:' + BODY_FONT + ';font-size:13px;line-height:1.7;' +
        'color:' + INK_DIM + ';">' + esc(COMPANY_NAME) + '<br />' +
          '<a href="mailto:' + esc(REPLY_TO) + '" style="color:' + INK_DIM + ';' +
          'text-decoration:none;">' + esc(REPLY_TO) + '</a>' +
        '</p>' +
      '</td></tr>' +

      '<tr><td style="padding-top:28px;">' +
        '<p style="margin:0;font-family:' + BODY_FONT + ';font-size:11px;line-height:1.7;' +
        'color:' + INK_FAINT + ';">You are receiving this because you registered your ' +
        'interest on the Stillfield website.</p>' +
      '</td></tr>' +

    '</table>' +
  '</td></tr></table>';
}

/** The name comes from a public form, so it is never trusted in markup. */
function esc(v) {
  return str(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
