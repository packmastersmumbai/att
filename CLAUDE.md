# PackMastersQrAtt

Apps Script application in the Pack Masters estate.

## The ISO contract — read this before writing any record

This app's records are audit evidence. A record that does not name the
controlled document it was written against is not evidence.

**Load the `pack-masters-iso` skill before writing any form, register, report,
KPI, template, document code, revision, effective date or sign-off block.**
It carries the full contract; this section is only the pointer.

The one rule: **never write a document code, revision or effective date as a
literal.** Resolve it at runtime.

```js
PMCore.stamp('PM/FRM/HR-05')   // "PM/FRM/HR-05 Rev 2.0, effective 01/07/2026" — print on the record
PMCore.doc('PM/FRM/HR-05')     // null is a STOP, not an empty result
```

PMCore is an Apps Script library, id
`1XrbNFnQWob8l5GuSCUyMT5u0tUX7netkqidSYEgqXpBV3nxE7KQunp9v`, version 1.
Outside the account: `https://packmastersmumbai.github.io/pmdigitaliso/register.json`.

**This app owns attendance, training, employees and skills and publishes it. It never writes another app's records.**

**A stale copy of this scriptId exists** at `# Info\TBM\ClaudeProjects\QRAtt`
(10 files from April against 36 here). Its `.clasp.json` has been disabled.

**Known open:** 55 of 64 conducted training sessions have no attendance rows;
0 of 64 carry an effectiveness rating. The ISO cannot evidence competence
until this app records it.

**Not yet wired.** PMCore is not in this project's `appsscript.json`.

Registry source: `My Drive\Pack Masters Digital ISO\qms_app\sources\SHARE.md`
