"""Full extraction from the 33 training .doc records.

Pulls the header fields (date, topic, trainer, duration, method), the
attendance roster where one was typed, and the observations/actions —
so the seed can carry what the documents actually say rather than a
reconstruction.
"""
import os, glob, json, re
import win32com.client as win32

folder = r"C:\Users\Appex\My Drive (packmasters.mumbai@gmail.com)\# TRAINING\TRAINING RECORD\2025 Training"
files = sorted(glob.glob(os.path.join(folder, "*.doc")))

def clean(t):
    return t.replace("\r\x07", "").replace("\r", " ").replace("\x07", "").strip()

word = win32.gencache.EnsureDispatch("Word.Application")
word.Visible = False
out = []
try:
    for path in files:
        base = os.path.basename(path)
        doc = word.Documents.Open(path, ReadOnly=True)
        try:
            rec = {"file": base, "raw_header": "", "roster": [], "observations": "",
                   "actions": []}
            full = clean(doc.Content.Text)
            rec["raw_header"] = full[:700]

            for ti in range(1, doc.Tables.Count + 1):
                tb = doc.Tables(ti)
                try:
                    hdr = " ".join(clean(tb.Cell(1, c).Range.Text)
                                   for c in range(1, min(tb.Columns.Count, 9) + 1))
                except Exception:
                    hdr = ""

                if "Name" in hdr and "Sign" in hdr:
                    for ri in range(2, tb.Rows.Count + 1):
                        for name_c, dept_c in ((2, 3), (7, 8)):
                            try:
                                n = clean(tb.Cell(ri, name_c).Range.Text)
                                d = clean(tb.Cell(ri, dept_c).Range.Text)
                            except Exception:
                                continue
                            if n and n.lower() not in ("name", "sr.no", "dept", "sign"):
                                rec["roster"].append({"name": n, "dept": d})

                elif "OBSERVATION" in hdr.upper():
                    rec["observations"] = hdr.split(":", 1)[-1].strip()
                    for ri in range(3, tb.Rows.Count + 1):
                        try:
                            cells = [clean(tb.Cell(ri, c).Range.Text)
                                     for c in range(1, min(tb.Columns.Count, 5) + 1)]
                        except Exception:
                            continue
                        if len(cells) >= 4 and cells[1]:
                            rec["actions"].append({
                                "action": cells[1], "owner": cells[2],
                                "target": cells[3],
                                "done": cells[4] if len(cells) > 4 else ""})
            out.append(rec)
        finally:
            doc.Close(False)
finally:
    word.Quit()

with open("training-extract.json", "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1, ensure_ascii=False)

withr = [r for r in out if r["roster"]]
print("files:", len(out), "| with a typed roster:", len(withr))
names = {}
for r in withr:
    for p in r["roster"]:
        names[p["name"]] = p["dept"]
print("distinct people:", len(names))
for n, d in sorted(names.items()):
    print(f"  {n:<22} {d}")
print("\nheaders of the roster files:")
for r in withr:
    print("---", r["file"][:46])
    print("   ", r["raw_header"][:260].replace("\n", " "))
