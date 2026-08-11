# TempBox

Temporary email addresses that appear when you need.

## What it does

- Creates disposable email inboxes instantly via mail.tm.
- Injects a button into email fields on any website — click to fill with a temp address.
- Auto-detects OTP/verification codes from incoming emails and shows a clickable chip next to the code input.
- Checks for new messages every 5 seconds.

## Install in Firefox

1. Download or clone this repository.
2. run this command `zip -r ../tempbox.xpi *`.
3. Open Firefox and go to `about:config`.
4. Search for `xpinstall.signatures.required` and make it false.
5. Go to `about:addons`.
6. click on `Settings` and select `Install from File`
7. Select the `tempbox.xpi` file.
8. The extension icon appears in the toolbar.
