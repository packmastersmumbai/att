function bulkImportEmployees(rows) {
  var sheet = getSheet('Employees');

  // Add QRImageURL column if missing
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('QRImageURL') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('QRImageURL');
    headers.push('QRImageURL');
  }

  var empIdCol = headers.indexOf('EmpID') + 1;
  var added = 0;

  rows.forEach(function(emp) {
    var lastRow = sheet.getLastRow();
    var existing = false;
    if (lastRow > 1) {
      var ids = sheet.getRange(2, empIdCol, lastRow - 1, 1).getValues().flat();
      existing = ids.indexOf(emp.EmpID) !== -1;
    }
    if (existing) return;
    var qrImageUrl = generateAndStoreQR(emp.EmpID);
    sheet.appendRow([
      emp.Code, emp.Name, emp.Department || '', emp.Phone || '',
      '', emp.Code, 'ACTIVE', emp.PhotoURL || '', qrImageUrl
    ]);
    added++;
  });
  return { success: true, added: added };
}

function runBulkImport() {
  var rows = [
  {
    "EmpID": "556",
    "Code": "556",
    "Name": "ANITA RAJBHAR",
    "Department": "Direct",
    "Phone": "9769925183",
    "PhotoURL": "https://i.ibb.co/4R3FvZ6x/Whats-App-Image-2025-08-21-at-10-12-12-4d9c3b39.jpg"
  },
  {
    "EmpID": "687",
    "Code": "687",
    "Name": "ANUJ PATHAK",
    "Department": "Direct",
    "Phone": "9082217454",
    "PhotoURL": "https://i.ibb.co/d4Jfk6RY/Whats-App-Image-2025-08-22-at-14-25-24-d3ff5c00.jpg"
  },
  {
    "EmpID": "486",
    "Code": "486",
    "Name": "ASHOK POTALE",
    "Department": "Direct",
    "Phone": "9082238466",
    "PhotoURL": "https://iili.io/FLPtFJS.jpg"
  },
  {
    "EmpID": "235",
    "Code": "235",
    "Name": "DEEPAK NISHAD",
    "Department": "Direct",
    "Phone": "8187935815",
    "PhotoURL": "https://iili.io/FLif4XR.jpg"
  },
  {
    "EmpID": "579",
    "Code": "579",
    "Name": "DILIP MAHALE",
    "Department": "Direct",
    "Phone": "9136802133",
    "PhotoURL": "https://iili.io/FLifs1I.jpg"
  },
  {
    "EmpID": "214",
    "Code": "214",
    "Name": "GEETA GOD",
    "Department": "Direct",
    "Phone": "8375805114",
    "PhotoURL": "https://iili.io/FLift7n.jpg"
  },
  {
    "EmpID": "843",
    "Code": "843",
    "Name": "GEETA GUPTA",
    "Department": "Direct",
    "Phone": "9559145890",
    "PhotoURL": "https://iili.io/FLifbmG.jpg"
  },
  {
    "EmpID": "825",
    "Code": "825",
    "Name": "HARISH SINGH",
    "Department": "Direct",
    "Phone": "9653354438",
    "PhotoURL": "https://i.ibb.co/R44K0r2t/Whats-App-Image-2025-08-10-at-18-19-35-cbfdf843.jpg"
  },
  {
    "EmpID": "762",
    "Code": "762",
    "Name": "PRABHAT",
    "Department": "Direct",
    "Phone": "8779708123",
    "PhotoURL": ""
  },
  {
    "EmpID": "368",
    "Code": "368",
    "Name": "RAJANI PRASAD",
    "Department": "Direct",
    "Phone": "8828414661",
    "PhotoURL": "https://iili.io/FLiqoLQ.jpg"
  },
  {
    "EmpID": "116",
    "Code": "116",
    "Name": "REEMA SHARMA",
    "Department": "NEEL",
    "Phone": "8652073485",
    "PhotoURL": "https://iili.io/FLiqzBV.jpg"
  },
  {
    "EmpID": "597",
    "Code": "597",
    "Name": "SHALU TIWARI",
    "Department": "NEEL",
    "Phone": "9137299463",
    "PhotoURL": "https://iili.io/FLiqchv.jpg"
  },
  {
    "EmpID": "102",
    "Code": "102",
    "Name": "SHYAMLAL YADAV",
    "Department": "Direct",
    "Phone": "8928373587",
    "PhotoURL": "https://iili.io/FLiq1Bp.jpg"
  },
  {
    "EmpID": "444",
    "Code": "444",
    "Name": "SUMAN RAJBHAR",
    "Department": "Direct",
    "Phone": "7039149484",
    "PhotoURL": "https://iili.io/FLiqG4I.jpg"
  },
  {
    "EmpID": "131",
    "Code": "131",
    "Name": "DAROGA NISHAD",
    "Department": "Direct",
    "Phone": "9561140873",
    "PhotoURL": "https://iili.io/FLifrzv.jpg"
  },
  {
    "EmpID": "133",
    "Code": "133",
    "Name": "KANCHAN",
    "Department": "NEEL",
    "Phone": "8840716933",
    "PhotoURL": "https://iili.io/FLiqd1S.md.jpg"
  },
  {
    "EmpID": "134",
    "Code": "134",
    "Name": "MANEETA CHAUHAN",
    "Department": "NEEL",
    "Phone": "8081235490",
    "PhotoURL": "https://iili.io/FLiqF29.jpg"
  },
  {
    "EmpID": "178",
    "Code": "178",
    "Name": "LALU NISHAD",
    "Department": "Direct",
    "Phone": "7414982142",
    "PhotoURL": "https://iili.io/FLiq2r7.jpg"
  },
  {
    "EmpID": "181",
    "Code": "181",
    "Name": "AJAD RAJBHAR",
    "Department": "LAKSHMI",
    "Phone": "9321898879",
    "PhotoURL": "https://iili.io/FLifSea.jpg"
  },
  {
    "EmpID": "184",
    "Code": "184",
    "Name": "MANISH (V) KUMAR",
    "Department": "Direct",
    "Phone": "9621528567",
    "PhotoURL": "https://iili.io/FLiqfku.jpg"
  },
  {
    "EmpID": "197",
    "Code": "197",
    "Name": "MANISH PRASAD",
    "Department": "Direct",
    "Phone": "9608593962",
    "PhotoURL": "https://iili.io/FLiqK7e.jpg"
  },
  {
    "EmpID": "206",
    "Code": "206",
    "Name": "KHUSHI PASWAN",
    "Department": "Direct",
    "Phone": "9598669810",
    "PhotoURL": "https://i.ibb.co/PGqps6Hs/Whats-App-Image-2025-08-18-at-12-24-54-775a8cd8.jpg"
  },
  {
    "EmpID": "205",
    "Code": "205",
    "Name": "MUNNA YADAV",
    "Department": "LAKSHMI",
    "Phone": "9326629294",
    "PhotoURL": "https://i.ibb.co/RTp6JQ0n/Whats-App-Image-2025-08-10-at-17-48-27-45b620f1.jpg"
  },
  {
    "EmpID": "557",
    "Code": "557",
    "Name": "SANTOSH MAURYA",
    "Department": "Direct",
    "Phone": "9082978185",
    "PhotoURL": "https://i.ibb.co/hxN6VXdf/Whats-App-Image-2025-08-18-at-13-05-12-0f65a828.jpg"
  },
  {
    "EmpID": "355",
    "Code": "355",
    "Name": "RAJESH DUBEY",
    "Department": "NEEL",
    "Phone": "8850969339",
    "PhotoURL": "https://i.ibb.co/sdN353kb/Whats-App-Image-2025-08-22-at-15-05-07-52d6d5dc.jpg"
  },
  {
    "EmpID": "189",
    "Code": "189",
    "Name": "SAMIKSHA YADAV",
    "Department": "Direct",
    "Phone": "9769209744",
    "PhotoURL": "https://iili.io/FLiq5kg.jpg"
  },
  {
    "EmpID": "190",
    "Code": "190",
    "Name": "ANCHAL YADAV",
    "Department": "Direct",
    "Phone": "9769209744",
    "PhotoURL": "https://iili.io/FLPt2g2.jpg"
  },
  {
    "EmpID": "217",
    "Code": "217",
    "Name": "TRIPTI SINGH",
    "Department": "Direct",
    "Phone": "6394727635",
    "PhotoURL": "https://i.ibb.co/cXt2dqdV/Whats-App-Image-2025-08-18-at-09-24-00-6d9fd4e9.jpg"
  },
  {
    "EmpID": "219",
    "Code": "219",
    "Name": "VIKASH NISHAD",
    "Department": "NEEL",
    "Phone": "9120817978",
    "PhotoURL": "https://i.ibb.co/N2g80zFK/Whats-App-Image-2025-08-18-at-09-24-00-f4fa120a.jpg"
  },
  {
    "EmpID": "156",
    "Code": "156",
    "Name": "DILIP KUMAR KOTARYA",
    "Department": "Direct",
    "Phone": "7208408697",
    "PhotoURL": "https://iili.io/FLifiqN.jpg"
  },
  {
    "EmpID": "229",
    "Code": "229",
    "Name": "SONALI JAISWAL",
    "Department": "NEEL",
    "Phone": "",
    "PhotoURL": "https://iili.io/KdXoGQp.jpg"
  },
  {
    "EmpID": "230",
    "Code": "230",
    "Name": "NEELU GAUTAM",
    "Department": "LAKSHMI",
    "Phone": "7310312603",
    "PhotoURL": "https://i.ibb.co/Df2TSrp8/Whats-App-Image-2025-08-26-at-14-53-43-072f0f94.jpg"
  },
  {
    "EmpID": "233",
    "Code": "233",
    "Name": "SHIVAM GAUTAM",
    "Department": "LAKSHMI",
    "Phone": "8756393039",
    "PhotoURL": "https://i.ibb.co/7N8sL8Qv/Whats-App-Image-2025-09-13-at-16-26-43-a2731205.jpg"
  },
  {
    "EmpID": "246",
    "Code": "246",
    "Name": "PAWAN KUMAR",
    "Department": "NEEL",
    "Phone": "7558689729",
    "PhotoURL": "https://i.ibb.co/B5WsnbHD/Whats-App-Image-2025-10-17-at-15-57-31-3e629e19.jpg"
  },
  {
    "EmpID": "167",
    "Code": "167",
    "Name": "SUNITA CHAUDHARY",
    "Department": "LAKSHMI",
    "Phone": "9769595546",
    "PhotoURL": "https://i.ibb.co/zTGH9YB5/25e047cf-012c-4633-91a0-1d5c472c375a.jpg"
  },
  {
    "EmpID": "254",
    "Code": "254",
    "Name": "VIKASH GAUTAM",
    "Department": "NEEL",
    "Phone": "7800441330",
    "PhotoURL": "https://i.ibb.co/jmKsFBT/IMG-20251022-WA0009-1.jpg"
  },
  {
    "EmpID": "256",
    "Code": "256",
    "Name": "SUSHIL KUMAR",
    "Department": "Direct",
    "Phone": "",
    "PhotoURL": "https://i.ibb.co/xqZTcVz2/a97ccfbf-a089-4a06-81cf-4ee9589fe168.jpg"
  },
  {
    "EmpID": "262",
    "Code": "262",
    "Name": "RAM NAND CHAUHAN",
    "Department": "Direct",
    "Phone": "",
    "PhotoURL": "https://i.ibb.co/gLHnMJ3n/402a460e-0e4e-4e2d-81be-6c94d17fd2f8.jpg"
  },
  {
    "EmpID": "263",
    "Code": "263",
    "Name": "KIRAN GUPTA",
    "Department": "LAKSHMI",
    "Phone": "",
    "PhotoURL": "https://i.ibb.co/V0yvj2zT/0863a995-2753-49fc-8a00-015c42f6fdcf.jpg"
  },
  {
    "EmpID": "264",
    "Code": "264",
    "Name": "SURAJ",
    "Department": "Direct",
    "Phone": "6353329195",
    "PhotoURL": "https://i.ibb.co/FbkYkytQ/Whats-App-Image-2026-01-15-at-9-46-17-AM.jpg"
  },
  {
    "EmpID": "265",
    "Code": "265",
    "Name": "VIVEK KUMAR",
    "Department": "NEEL",
    "Phone": "8933076551",
    "PhotoURL": "https://i.ibb.co/DPGFzhnR/Whats-App-Image-2026-01-15-at-9-46-16-AM-1.jpg"
  },
  {
    "EmpID": "266",
    "Code": "266",
    "Name": "SUNIL KUMAR",
    "Department": "Direct",
    "Phone": "8726385525",
    "PhotoURL": "https://i.ibb.co/DDZ0yP8G/Whats-App-Image-2026-01-15-at-9-48-35-AM.jpg"
  },
  {
    "EmpID": "267",
    "Code": "267",
    "Name": "RANJANA KUMARI",
    "Department": "LAKSHMI",
    "Phone": "7208162021",
    "PhotoURL": "https://i.ibb.co/HM5s47F/Whats-App-Image-2026-01-16-at-4-01-23-PM.jpg"
  },
  {
    "EmpID": "268",
    "Code": "268",
    "Name": "ROSHANI",
    "Department": "LAKSHMI",
    "Phone": "9336627027",
    "PhotoURL": "https://i.ibb.co/TxSyngcY/91c0deca-6664-4d8c-a36a-bc23608a2637-1.jpg"
  },
  {
    "EmpID": "270",
    "Code": "270",
    "Name": "MUKESH RAJ",
    "Department": "NEEL",
    "Phone": "9919246604",
    "PhotoURL": "https://i.ibb.co/Gf2kQQHg/248ebbcd-9d67-4208-963c-a11c5e365acd.jpg"
  },
  {
    "EmpID": "271",
    "Code": "271",
    "Name": "SONAM JAISWAL",
    "Department": "NEEL",
    "Phone": "",
    "PhotoURL": "https://i.ibb.co/fVn33q1x/Whats-App-Image-2026-01-24-at-11-22-50-AM.jpg"
  },
  {
    "EmpID": "272",
    "Code": "272",
    "Name": "REETA DUBEY",
    "Department": "LAKSHMI",
    "Phone": "8879418430",
    "PhotoURL": ""
  },
  {
    "EmpID": "273",
    "Code": "273",
    "Name": "KUSUM YADAV",
    "Department": "LAKSHMI",
    "Phone": "8928861937",
    "PhotoURL": "https://i.ibb.co/Q7FKwSDD/Whats-App-Image-2026-04-22-at-11-15-57-AM.jpg"
  }
];
  var result = bulkImportEmployees(rows);
  Logger.log(JSON.stringify(result));
  return result;
}