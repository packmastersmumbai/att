# -*- coding: utf-8 -*-
"""
Mark the 2026 sessions planned on or before today as held.

WHY THIS NEEDS SAYING OUT LOUD: an ActualDate is a claim that training
happened. If an auditor asks for the attendance sheet behind TRN-03 on
17/01/2026 and there is none, a system asserting it ran is worse than one
showing it overdue — the second is an honest gap, the first is a false record.

So every row this touches is stamped in Content with what it actually is: a
bulk back-fill, entered on the date below, not a per-session record signed by
a trainer. Anyone reading the row later can tell it apart from the four
sessions that carry real evidence, and from the 2025 rows that came off signed
paper.

  - held ON the planned date, because nothing here knows a truer one
  - Trainer set to TARUN MISHRA on the site's instruction. He is deliberately
    NOT in the 58-person Employees sheet, which is consistent with him running
    the sessions rather than attending them — and explains why the 2025 import
    could never credit the 7 sessions his name appears on.
  - future sessions untouched
  - sessions that already carry an ActualDate untouched

Run with --dry-run first. --undo clears exactly what this wrote and nothing
else, matching on the marker string.
"""
import argparse, importlib.util, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "u", os.path.join(HERE, "upload_induction_audio.py"))
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

MARKER = "Back-filled in bulk on {stamp} — no per-session record"
TRAINER = "TARUN MISHRA"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", default="2026")
    ap.add_argument("--upto", help="YYYY-MM-DD, default today")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--undo", action="store_true")
    ap.add_argument("--trainer-only", action="store_true",
                    help="name the trainer on sessions already held; touch no dates")
    args = ap.parse_args()

    upto = args.upto or time.strftime("%Y-%m-%d")
    cal = u.post("getTrainingCalendar", {"year": args.year})
    if not cal.get("success"):
        sys.exit("could not read the calendar: %s" % cal)

    plan = cal["plan"]
    if args.trainer_only:
        # Names the trainer on sessions that are ALREADY held, without
        # touching a single date. The 2025 rows came off signed paper and
        # their dates are the audit evidence — this only fills a field the
        # import left blank because the .doc tables carried no trainer column.
        targets = [p for p in plan
                   if p.get("actualDate")
                   and not str(p.get("trainer", "")).strip()]
        print("%s: %d held sessions with no trainer named" % (args.year, len(targets)))
    elif args.undo:
        targets = [p for p in plan if "Back-filled in bulk" in str(p.get("content", ""))]
        print("%d rows to clear" % len(targets))
    else:
        targets = [p for p in plan
                   if p.get("plannedDate") and p["plannedDate"] <= upto
                   and not p.get("actualDate")]
        print("%s: %d sessions planned on or before %s with no actual date"
              % (args.year, len(targets), upto))

    for p in sorted(targets, key=lambda x: x.get("plannedDate", "")):
        print("  %-16s %-8s %-6s %s" % (p["planId"], p["topicId"],
                                        p.get("type", ""), p.get("plannedDate", "")))
    if args.dry_run or not targets:
        print("\n  dry run, nothing written" if args.dry_run else "\n  nothing to do")
        return

    stamp = time.strftime("%d/%m/%y")
    ok = fail = 0
    for p in targets:
        body = {"planId": p["planId"]}
        if args.trainer_only:
            # trainer ONLY. No actualDate, no content — saveTrainingSession
            # writes just the fields present, so the signed 2025 dates and
            # any real session notes are left exactly as they are.
            body.update({"trainer": TRAINER})
        elif args.undo:
            body.update({"actualDate": "", "content": "", "trainer": ""})
        else:
            body.update({"actualDate": p["plannedDate"],
                         "trainer": TRAINER,
                         "content": MARKER.format(stamp=stamp)})
        try:
            r = u.post("saveTrainingSession", {"session": body})
            if r.get("success"):
                ok += 1
            else:
                fail += 1
                print("  FAIL %s: %s" % (p["planId"], r.get("error")))
        except Exception as e:
            fail += 1
            print("  FAIL %s: %s" % (p["planId"], e))

    print("\ndone: %d written, %d failed" % (ok, fail))
    after = u.post("getTrainingCalendar", {"year": args.year})["plan"]
    held = len([x for x in after if x.get("actualDate")])
    print("%s now: %d of %d sessions hold an actual date" % (args.year, held, len(after)))


if __name__ == "__main__":
    main()
