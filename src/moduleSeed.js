// ============================================================
// moduleSeed.js — The module library content
//
// Separated from modules.js because this is DATA, not logic, and it is the
// part a safety officer will actually revise. Every module names its source:
//
//   RECORD  — the agenda and observations in the site's own 2025/2026
//             training records
//   DRILL   — the site's mock drill procedures
//   AYT     — the AYT India course material held in "# TRAINING/QA Course"
//   VIDEO   — the site's own process videos
//   DRAFTED — written from standard practice because the site holds no
//             content for it. These are the ones needing review first.
//
// Format, kept flat so a trainer can edit a typo in the sheet:
//   Objectives  "a|b|c"
//   Sections    "Heading::body|Heading::body"
//   Questions   "text ?? optA ~ optB ~ optC ?? correctIndex"
//
// AYT material is referenced, never reproduced: the modules point at the
// course notes on site rather than copying copyrighted content.
// ============================================================

function _moduleSeed_() {
  return [].concat(_moduleSeedTraining_(), _moduleSeedDrills_(),
                   _moduleSeedVideos_(), _moduleSeedCourses_());
}

/** The eleven delivered training topics. Content from the site's records. */
function _moduleSeedTraining_() {
  return [
    {
      TopicID: 'TRN-01', Source: 'RECORD',
      Objectives: [
        'State what an SOP is and why the site works to one',
        'Find the SOP for your own process and follow it step by step',
        'Explain the filling, packing and calibration steps in your area',
        'Say what to do when the SOP cannot be followed as written'
      ].join('|'),
      Sections: [
        'What an SOP is::A Standard Operating Procedure is the agreed, written way a task is done, so that the result is the same whoever does it and whenever it is done.',
        'Why it matters::Product safety depends on the same steps being followed every time. An SOP is how the site proves to a customer or an auditor that this happens.',
        'SOP in daily life::Everyday routines are informal SOPs — the order you check a door is locked, the way a recipe is followed. The value is the same: a repeatable result.',
        'Filling, packing and calibration::The SOPs covering your line: what is checked before starting, what is recorded during the run, and what is verified at the end.',
        'When the SOP will not work::Stop, tell the supervisor, and do not improvise. A change to the method is a 4M change and is recorded, not decided on the line.'
      ].join('|'),
      Questions: [
        'What is an SOP? ?? A written agreed method for a task ~ A machine setting ~ A customer order ?? 0',
        'Why does the site work to SOPs? ?? So the result is the same every time ~ To slow work down ~ Only for audits ?? 0',
        'You cannot follow a step in the SOP. What do you do? ?? Tell the supervisor and stop ~ Find your own way round it ~ Skip the step ?? 0',
        'Who is an SOP written for? ?? Whoever does the task ~ Only new joiners ~ Only the supervisor ?? 0',
        'Where should the SOP for your process be? ?? Available in your work area ~ Locked in the office ~ Learned by heart ?? 0'
      ].join('|'),
      ObjectivesHi: ['एसओपी क्या है और साइट इसके अनुसार क्यों काम करती है, यह बताना',
       'अपनी प्रक्रिया का एसओपी ढूँढ़ना और चरणबद्ध रूप से उसका पालन करना',
       'अपने क्षेत्र में भराई, पैकिंग और अंशांकन के चरण समझाना',
       'एसओपी का पालन संभव न हो तो क्या करना है, यह बताना'].join('|'),
      SectionsHi: ['एसओपी क्या है::एसओपी किसी काम को करने का लिखित एवं सहमत तरीका है, ताकि परिणाम हर बार और हर व्यक्ति द्वारा एक समान रहे।',
       'यह क्यों महत्वपूर्ण है::उत्पाद सुरक्षा इस पर निर्भर करती है कि हर बार वही चरण अपनाए जाएँ। एसओपी इसी का प्रमाण है।',
       'दैनिक जीवन में एसओपी::रोज़मर्रा की आदतें भी अनौपचारिक एसओपी हैं — मूल्य वही है: दोहराने योग्य परिणाम।',
       'भराई, पैकिंग और अंशांकन::आपकी लाइन के एसओपी: शुरू करने से पहले क्या जाँचें, दौरान क्या दर्ज करें, और अंत में क्या सत्यापित करें।',
       'जब एसओपी काम न करे::रुकें, सुपरवाइज़र को बताएँ, अपने आप कोई बदलाव न करें। तरीके में बदलाव 4M चेंज है और दर्ज किया जाता है।'].join('|'),
      QuestionsHi: ['एसओपी क्या है? ?? किसी काम का लिखित सहमत तरीका ~ मशीन की सेटिंग ~ ग्राहक का ऑर्डर ?? 0',
       'साइट एसओपी के अनुसार क्यों काम करती है? ?? ताकि परिणाम हर बार एक समान रहे ~ काम धीमा करने के लिए ~ केवल ऑडिट के लिए ?? 0',
       'एसओपी का कोई चरण पूरा नहीं हो पा रहा। आप क्या करेंगे? ?? सुपरवाइज़र को बताकर रुकेंगे ~ अपना तरीका निकालेंगे ~ चरण छोड़ देंगे ?? 0',
       'एसओपी किसके लिए लिखा जाता है? ?? जो भी वह काम करे ~ केवल नए कर्मचारी ~ केवल सुपरवाइज़र ?? 0',
       'आपकी प्रक्रिया का एसओपी कहाँ होना चाहिए? ?? आपके कार्यक्षेत्र में उपलब्ध ~ ऑफिस में बंद ~ याद किया हुआ ?? 0'].join('|')
    },
    {
      TopicID: 'TRN-02', Source: 'RECORD',
      Objectives: [
        'List the quality parameters checked on your line',
        'Carry out capping, sealing, naming and numbering checks correctly',
        'Recognise a defect and say what to do with it',
        'State the cleaning requirement before and after a run'
      ].join('|'),
      Sections: [
        'The quality parameters::Capping, sealing, name, numbering, quality and cleaning — the checks that decide whether a unit passes.',
        'Capping and sealing::A cap must be correctly seated and torqued; a seal must be complete with no gaps. Both are checked on every batch, not sampled at the end.',
        'Name and numbering::The right label on the right product, with the right batch and date. A numbering error is a recall risk, not a cosmetic one.',
        'Do’s::Check at the start of the run, at each change, and at the end. Record what you checked. Stop the line when something is wrong.',
        'Don’ts::Do not pass a doubtful unit "to be sorted later". Do not change a setting without telling the supervisor. Do not mix batches.'
      ].join('|'),
      Questions: [
        'A cap is not properly seated. What is it? ?? A defect to be removed and reported ~ Acceptable if rare ~ Fixed at dispatch ?? 0',
        'When are quality parameters checked? ?? Start of run, at changes, and at the end ~ Only at the end ~ Only when the customer asks ?? 0',
        'Wrong batch number printed on a label. This is: ?? A serious defect, stop and report ~ Minor, carry on ~ Corrected by hand ?? 0',
        'What must happen before a new run starts? ?? Line clearance and cleaning ~ Nothing ~ Only a supervisor signature ?? 0',
        'You are unsure whether a unit passes. You should: ?? Ask the supervisor and hold the unit ~ Pass it ~ Reject the whole batch ?? 0'
      ].join('|')
    },
    {
      TopicID: 'TRN-03', Source: 'RECORD',
      Objectives: [
        'Explain why housekeeping is a safety and quality control, not tidiness',
        'Sort and segregate waste and scrap correctly',
        'Keep your own area to the standard between runs'
      ].join('|'),
      Sections: [
        'Why housekeeping::A clean area prevents mix-ups, contamination and slips. Most of what an auditor sees in the first five minutes is housekeeping.',
        'Waste and scrap handling::Waste is separated at the point it is created, not sorted later. Scrap material is kept apart from good material at all times.',
        'Sorting and segregation::Each waste stream has its own container and location. Mixed waste cannot be disposed of correctly and becomes a compliance problem.',
        'Your own area::Clean as you go, return tools to their place, and leave the area fit for the next shift to start work immediately.'
      ].join('|'),
      Questions: [
        'When is waste separated? ?? As it is created ~ At the end of the week ~ By the cleaner ?? 0',
        'Why does housekeeping affect quality? ?? It prevents mix-ups and contamination ~ It does not ~ Only for appearance ?? 0',
        'Scrap material should be: ?? Kept separate from good material ~ Kept with good material ~ Left on the line ?? 0',
        'Who is responsible for your work area? ?? You are ~ Only housekeeping staff ~ The supervisor ?? 0',
        'Mixed waste in one bin is a problem because: ?? It cannot be disposed of correctly ~ It looks untidy ~ It is not a problem ?? 0'
      ].join('|')
    },
    {
      TopicID: 'TRN-04', Source: 'RECORD',
      Objectives: [
        'Follow the SSOP for cleanliness in your area',
        'Handle rejection and rework material without mixing it into good stock',
        'Verify packaging material, bulk and finished goods by number',
        'Perform line clearance and CLIT before a run'
      ].join('|'),
      Sections: [
        'SSOP and cleanliness::The Sanitation Standard Operating Procedure: what is cleaned, how, how often, and who verifies it.',
        'Rejection and rework::Rejected material goes to a dedicated area immediately. Rework is a controlled activity with its own record — it is not "running it again".',
        'Dedicated areas::Each process has its own area. Material does not travel between them without a record.',
        'Number-based verification::Packaging material, bulk and finished goods are verified by counting and matching numbers, not by eye.',
        'Line clearance and CLIT::Before a run, the line is cleared of the previous product and checked — Clean, Inspect, Lubricate, Tighten. Nothing from the last batch remains.'
      ].join('|'),
      Questions: [
        'What does line clearance ensure? ?? Nothing from the previous batch remains ~ The line is switched off ~ The floor is swept ?? 0',
        'Rejected material should go: ?? To the dedicated rejection area at once ~ Back onto the line ~ Into general waste ?? 0',
        'How is packaging material verified? ?? By counting and matching numbers ~ By eye ~ It is not verified ?? 0',
        'CLIT stands for: ?? Clean, Inspect, Lubricate, Tighten ~ Check List In Time ~ Clear Line In Ten ?? 0',
        'Rework is: ?? A controlled activity with its own record ~ Simply running it again ~ Not allowed ?? 0'
      ].join('|')
    },
    {
      TopicID: 'TRN-05', Source: 'RECORD',
      Objectives: [
        'Recognise electrical hazards in your work area',
        'State the PPE required for electrical work per the PPE Matrix',
        'Report a loose wire, damaged conduit or earthing fault correctly',
        'Say what you must never do with electrical equipment'
      ].join('|'),
      Sections: [
        'Electrical hazards on site::Damaged cables, loose wires, exposed conduit, water near equipment, and overloaded points. All are reportable the moment they are seen.',
        'PPE per the matrix::The PPE Matrix states what is required for each task. Electrical work has its own requirement and it is not optional.',
        'Earthing::Equipment earthing is checked to a checklist. An earthing fault is not visible in normal use, which is why the check exists.',
        'What you must never do::Never open a panel you are not authorised to open, never bypass a guard or interlock, never work on live equipment, never use damaged leads.',
        'Reporting::A fault is reported to the supervisor immediately and the equipment is taken out of use until it is cleared.'
      ].join('|'),
      Questions: [
        'You see a loose wire. What do you do? ?? Report it and stop using the equipment ~ Tape it up ~ Ignore it if it works ?? 0',
        'Who decides what PPE is needed? ?? The PPE Matrix ~ Each worker ~ Nobody ?? 0',
        'Working on live equipment is: ?? Never permitted ~ Allowed if quick ~ Allowed with gloves ?? 0',
        'Why is earthing checked to a checklist? ?? A fault is not visible in normal use ~ To fill paperwork ~ It is not checked ?? 0',
        'A guard or interlock may be bypassed: ?? Never ~ To save time ~ With permission from a colleague ?? 0'
      ].join('|'),
      ObjectivesHi: ['अपने कार्यक्षेत्र में विद्युत खतरों को पहचानना',
       'पीपीई मैट्रिक्स के अनुसार विद्युत कार्य हेतु आवश्यक पीपीई बताना',
       'ढीला तार, टूटा कंड्यूट या अर्थिंग दोष सही ढंग से रिपोर्ट करना',
       'विद्युत उपकरण के साथ क्या कभी नहीं करना है, यह बताना'].join('|'),
      SectionsHi: ['साइट पर विद्युत खतरे::टूटी केबल, ढीले तार, खुला कंड्यूट, उपकरण के पास पानी और ओवरलोड पॉइंट। दिखते ही रिपोर्ट करने योग्य।',
       'मैट्रिक्स अनुसार पीपीई::पीपीई मैट्रिक्स बताता है कि किस कार्य हेतु क्या आवश्यक है। विद्युत कार्य हेतु यह वैकल्पिक नहीं है।',
       'अर्थिंग::उपकरण की अर्थिंग चेकलिस्ट से जाँची जाती है। अर्थिंग दोष सामान्य उपयोग में दिखाई नहीं देता।',
       'क्या कभी न करें::अनधिकृत पैनल न खोलें, गार्ड या इंटरलॉक बायपास न करें, चालू उपकरण पर काम न करें, टूटी लीड न प्रयोग करें।',
       'रिपोर्टिंग::दोष तुरंत सुपरवाइज़र को बताएँ और उपकरण को उपयोग से हटा दें।'].join('|'),
      QuestionsHi: ['आपको ढीला तार दिखता है। आप क्या करेंगे? ?? रिपोर्ट करेंगे और उपकरण बंद रखेंगे ~ टेप लगा देंगे ~ चल रहा है तो छोड़ देंगे ?? 0',
       'कौन सा पीपीई चाहिए, यह कौन तय करता है? ?? पीपीई मैट्रिक्स ~ हर कर्मचारी स्वयं ~ कोई नहीं ?? 0',
       'चालू उपकरण पर काम करना: ?? कभी अनुमत नहीं ~ जल्दी हो तो ठीक ~ दस्तानों के साथ ठीक ?? 0',
       'अर्थिंग चेकलिस्ट से क्यों जाँची जाती है? ?? दोष सामान्य उपयोग में नहीं दिखता ~ कागज़ी कार्रवाई हेतु ~ जाँची नहीं जाती ?? 0',
       'गार्ड या इंटरलॉक बायपास किया जा सकता है: ?? कभी नहीं ~ समय बचाने हेतु ~ साथी की अनुमति से ?? 0'].join('|')
    },
    {
      TopicID: 'TRN-06', Source: 'RECORD',
      Objectives: [
        'Identify what counts as an incident, including a near miss',
        'Report an incident by the correct route and within the time expected',
        'Explain why near misses are reported when nobody was hurt'
      ].join('|'),
      Sections: [
        'Types of incident::Injury, near miss, property damage, spill, fire, security incident, and product incident. A near miss is an incident that did not injure anybody this time.',
        'Why reporting matters::An incident that is reported can be prevented from recurring. One that is not, recurs — and the next one may not be a near miss.',
        'How to report::Tell the supervisor immediately, then complete the incident record. Do not wait for the end of the shift.',
        'The incident dashboard::Reported incidents are tracked and reviewed so that trends, not just single events, are acted on.'
      ].join('|'),
      Questions: [
        'A near miss is: ?? An incident that did not injure anybody this time ~ Not worth reporting ~ Only for machines ?? 0',
        'When should an incident be reported? ?? Immediately ~ At the end of the shift ~ Next week ?? 0',
        'Why report when nobody was hurt? ?? So it can be prevented from recurring ~ For paperwork ~ No reason ?? 0',
        'Who do you tell first? ?? Your supervisor ~ A colleague ~ Nobody ?? 0',
        'What happens to reported incidents? ?? They are tracked and reviewed for trends ~ They are filed away ~ Nothing ?? 0'
      ].join('|'),
      ObjectivesHi: ['यह पहचानना कि क्या घटना मानी जाती है, नियर मिस सहित',
       'सही मार्ग से और अपेक्षित समय में घटना की रिपोर्ट करना',
       'किसी के घायल न होने पर भी नियर मिस क्यों रिपोर्ट होती है, यह बताना'].join('|'),
      SectionsHi: ['घटना के प्रकार::चोट, नियर मिस, सम्पत्ति क्षति, रिसाव, आग, सुरक्षा घटना और उत्पाद घटना। नियर मिस वह घटना है जिसमें इस बार कोई घायल नहीं हुआ।',
       'रिपोर्टिंग क्यों::रिपोर्ट की गई घटना दोबारा होने से रोकी जा सकती है। न की गई घटना दोहराती है।',
       'कैसे रिपोर्ट करें::तुरंत सुपरवाइज़र को बताएँ, फिर घटना रिकॉर्ड भरें। शिफ्ट खत्म होने का इंतज़ार न करें।',
       'घटना डैशबोर्ड::रिपोर्ट की गई घटनाएँ ट्रैक की जाती हैं ताकि केवल एक घटना नहीं, प्रवृत्ति पर कार्रवाई हो।'].join('|'),
      QuestionsHi: ['नियर मिस क्या है? ?? वह घटना जिसमें इस बार कोई घायल नहीं हुआ ~ रिपोर्ट योग्य नहीं ~ केवल मशीनों हेतु ?? 0',
       'घटना कब रिपोर्ट करनी चाहिए? ?? तुरंत ~ शिफ्ट के अंत में ~ अगले सप्ताह ?? 0',
       'कोई घायल न हो तो भी रिपोर्ट क्यों? ?? ताकि दोबारा होने से रोका जा सके ~ कागज़ी कार्रवाई हेतु ~ कोई कारण नहीं ?? 0',
       'सबसे पहले किसे बताएँ? ?? अपने सुपरवाइज़र को ~ साथी को ~ किसी को नहीं ?? 0',
       'रिपोर्ट की गई घटनाओं का क्या होता है? ?? प्रवृत्ति हेतु ट्रैक और समीक्षा ~ फाइल कर दी जाती हैं ~ कुछ नहीं ?? 0'].join('|')
    },
    {
      TopicID: 'TRN-07', Source: 'RECORD',
      Objectives: [
        'State your role in the site emergency response plan',
        'Operate a fire extinguisher using the PASS method',
        'Describe how the hydrant and hose system is used',
        'Reach the assembly point by the correct route and be counted'
      ].join('|'),
      Sections: [
        'The emergency response plan::Who raises the alarm, who leads, where people go, and who confirms everybody is out.',
        'Fire extinguisher — PASS::Pull the pin, Aim at the base of the fire, Squeeze the handle, Sweep side to side. Aiming at the flames rather than the base is the most common error.',
        'Choosing the extinguisher::An ABC extinguisher covers ordinary combustibles, flammable liquids and electrical fires. Using the wrong type can make a fire worse.',
        'Hydrant and hose::Hose operation needs more than one person and is used on a developed fire, not a small one.',
        'Evacuation and roll call::Leave by the marked route, do not return for belongings, and stay at the assembly point until you are counted.'
      ].join('|'),
      Questions: [
        'PASS stands for: ?? Pull, Aim, Squeeze, Sweep ~ Push, Alert, Stop, Save ~ Prepare, Attack, Stand, Signal ?? 0',
        'Where do you aim an extinguisher? ?? At the base of the fire ~ At the top of the flames ~ At the smoke ?? 0',
        'After evacuating you should: ?? Stay at the assembly point to be counted ~ Go home ~ Return for belongings ?? 0',
        'An ABC extinguisher can be used on: ?? Combustibles, flammable liquids and electrical fires ~ Only paper ~ Only electrical ?? 0',
        'Who raises the alarm? ?? Anyone who discovers the fire ~ Only the supervisor ~ Only security ?? 0'
      ].join('|'),
      ObjectivesHi: ['साइट की आपातकालीन प्रतिक्रिया योजना में अपनी भूमिका बताना',
       'PASS विधि से अग्निशामक चलाना',
       'हाइड्रेंट एवं होज़ प्रणाली का उपयोग बताना',
       'सही मार्ग से असेंबली पॉइंट पहुँचकर गिनती में शामिल होना'].join('|'),
      SectionsHi: ['आपातकालीन योजना::कौन अलार्म बजाएगा, कौन नेतृत्व करेगा, लोग कहाँ जाएँगे, और कौन पुष्टि करेगा कि सब बाहर हैं।',
       'अग्निशामक — PASS::पिन खींचें, आग की जड़ पर निशाना लगाएँ, हैंडल दबाएँ, अगल-बगल घुमाएँ। लपटों पर निशाना लगाना सबसे आम गलती है।',
       'सही अग्निशामक::ABC अग्निशामक सामान्य ज्वलनशील पदार्थ, ज्वलनशील तरल और विद्युत आग तीनों पर चलता है।',
       'हाइड्रेंट एवं होज़::होज़ चलाने हेतु एक से अधिक व्यक्ति चाहिए और यह बड़ी आग पर प्रयोग होता है।',
       'निकासी एवं गिनती::चिह्नित मार्ग से निकलें, सामान लेने वापस न जाएँ, और गिनती होने तक असेंबली पॉइंट पर रहें।'].join('|'),
      QuestionsHi: ['PASS का अर्थ है: ?? पुल, एम, स्क्वीज़, स्वीप ~ पुश, अलर्ट, स्टॉप, सेव ~ प्रिपेयर, अटैक, स्टैंड, सिग्नल ?? 0',
       'अग्निशामक किस पर निशाना लगाएँ? ?? आग की जड़ पर ~ लपटों के ऊपर ~ धुएँ पर ?? 0',
       'निकासी के बाद आपको: ?? गिनती हेतु असेंबली पॉइंट पर रुकना चाहिए ~ घर जाना चाहिए ~ सामान लेने लौटना चाहिए ?? 0',
       'ABC अग्निशामक किस पर प्रयोग होता है? ?? ज्वलनशील पदार्थ, तरल और विद्युत आग ~ केवल कागज़ ~ केवल विद्युत ?? 0',
       'अलार्म कौन बजाता है? ?? जो भी आग देखे ~ केवल सुपरवाइज़र ~ केवल सुरक्षा ?? 0'].join('|')
    },
    {
      TopicID: 'TRN-08', Source: 'RECORD',
      Objectives: [
        'Identify the general safety hazards in your area',
        'Apply the hierarchy of controls to a hazard you find',
        'Wear the PPE required for your task and check it is serviceable'
      ].join('|'),
      Sections: [
        'General safety on site::Slips and trips, manual handling, moving machinery, chemicals, and working at height. Most injuries come from the ordinary, not the exotic.',
        'The hierarchy of controls::Eliminate the hazard, substitute it, engineer it out, control it by procedure, and only then rely on PPE. PPE is the last line, not the first.',
        'PPE and the matrix::The PPE Matrix states the requirement per task. PPE that is damaged, wrong size or not worn correctly protects nobody.',
        'Your responsibility::Report hazards, follow the procedure, use the PPE, and stop work you believe is unsafe.'
      ].join('|'),
      Questions: [
        'In the hierarchy of controls, PPE is: ?? The last line of defence ~ The first ~ Not included ?? 0',
        'The best control for a hazard is to: ?? Eliminate it ~ Issue PPE ~ Put up a sign ?? 0',
        'Damaged PPE should be: ?? Replaced before work starts ~ Used carefully ~ Repaired with tape ?? 0',
        'You believe a task is unsafe. You may: ?? Stop and raise it ~ Carry on anyway ~ Do it faster ?? 0',
        'Most injuries on a site come from: ?? Ordinary hazards like slips and handling ~ Rare events ~ Machinery only ?? 0'
      ].join('|')
    },
    {
      TopicID: 'TRN-09', Source: 'RECORD',
      Objectives: [
        'Recognise suspicious behaviour and suspicious transactions',
        'Report a suspicion without confronting the person',
        'State the site rules for visitors, materials and gate movement'
      ].join('|'),
      Sections: [
        'What is suspicious::Someone in an area without reason, material moving without a gatepass, an unusual request, or pressure to bypass a check.',
        'Impact and severity::A suspicious transaction can mean theft, adulteration or a security breach. The cost is rarely limited to the material involved.',
        'How to identify::Compare what you see against the normal process. Anything without the paperwork that normally accompanies it is worth reporting.',
        'How to report::Tell security and the supervisor. Do not confront the person and do not investigate on your own.',
        'Do’s and Don’ts at the gate::Every visitor is inducted and recorded. Every material movement has a gatepass. No exceptions for anybody.'
      ].join('|'),
      Questions: [
        'Material is moving out without a gatepass. You should: ?? Report to security and the supervisor ~ Let it go ~ Stop the person yourself ?? 0',
        'Should you confront a suspicious person? ?? No, report it ~ Yes, immediately ~ Only if they are alone ?? 0',
        'Every visitor must be: ?? Inducted and recorded ~ Escorted only ~ Signed in by anyone ?? 0',
        'A suspicious transaction may indicate: ?? Theft, adulteration or a security breach ~ Nothing serious ~ A paperwork error only ?? 0',
        'Pressure to bypass a check is: ?? Itself a warning sign ~ Normal when busy ~ Acceptable from a manager ?? 0'
      ].join('|')
    },
    {
      TopicID: 'TRN-10', Source: 'RECORD',
      Objectives: [
        'State why PPE is compulsory and what the PPE Matrix requires for your task',
        'Wear, check and store PPE correctly',
        'Explain where PPE sits in the hierarchy of controls'
      ].join('|'),
      Sections: [
        'Why PPE::PPE is what stands between you and a hazard that could not be removed. It works only when it is the right type, the right size, and worn correctly.',
        'The PPE Matrix::A table of task against required PPE. It is the site’s answer to "what should I be wearing" and it is not a matter of preference.',
        'Checking PPE::Inspect before use. Damaged, expired or ill-fitting PPE is replaced, not tolerated.',
        'Hierarchy of controls::PPE is the last control, applied when elimination, substitution, engineering and procedure have done all they can.'
      ].join('|'),
      Questions: [
        'What tells you which PPE to wear? ?? The PPE Matrix ~ Personal preference ~ What is available ?? 0',
        'PPE should be inspected: ?? Before every use ~ Once a year ~ Never ?? 0',
        'PPE works only when: ?? It is the right type, size and worn correctly ~ It is new ~ It is carried ?? 0',
        'PPE in the hierarchy of controls is: ?? The last control ~ The first ~ Not a control ?? 0',
        'Ill-fitting PPE should be: ?? Replaced ~ Used anyway ~ Modified yourself ?? 0'
      ].join('|'),
      ObjectivesHi: ['पीपीई क्यों अनिवार्य है और आपके कार्य हेतु मैट्रिक्स क्या कहता है, यह बताना',
       'पीपीई सही ढंग से पहनना, जाँचना और रखना',
       'नियंत्रण पदानुक्रम में पीपीई का स्थान बताना'].join('|'),
      SectionsHi: ['पीपीई क्यों::पीपीई आपके और उस खतरे के बीच है जिसे हटाया नहीं जा सका। यह तभी काम करता है जब सही प्रकार, सही नाप और सही ढंग से पहना हो।',
       'पीपीई मैट्रिक्स::कार्य के सामने आवश्यक पीपीई की तालिका। यह पसंद का विषय नहीं है।',
       'पीपीई की जाँच::उपयोग से पहले जाँचें। टूटा, समय-समाप्त या गलत नाप का पीपीई बदला जाता है।',
       'नियंत्रण पदानुक्रम::पीपीई अंतिम नियंत्रण है, तब लागू होता है जब बाकी सब कर लिया गया हो।'].join('|'),
      QuestionsHi: ['कौन सा पीपीई पहनना है, यह क्या बताता है? ?? पीपीई मैट्रिक्स ~ व्यक्तिगत पसंद ~ जो उपलब्ध हो ?? 0',
       'पीपीई की जाँच कब करें? ?? हर उपयोग से पहले ~ साल में एक बार ~ कभी नहीं ?? 0',
       'पीपीई तभी काम करता है जब: ?? सही प्रकार, नाप और सही ढंग से पहना हो ~ नया हो ~ साथ रखा हो ?? 0',
       'नियंत्रण पदानुक्रम में पीपीई: ?? अंतिम नियंत्रण है ~ पहला है ~ नियंत्रण नहीं है ?? 0',
       'गलत नाप का पीपीई: ?? बदला जाना चाहिए ~ फिर भी पहनें ~ स्वयं बदल लें ?? 0'].join('|')
    },
    {
      TopicID: 'TRN-11', Source: 'RECORD',
      Objectives: [
        'Explain what product stewardship means for the work you do',
        'State how filling, packing and SOP adherence make a product safe and compliant',
        'Describe your own responsibility for the product leaving the site'
      ].join('|'),
      Sections: [
        'What product stewardship is::Taking responsibility for the product through its life — that it is safe, compliant, sustainable and reliable when it reaches the customer.',
        'Safe by choice::The site’s 2026 theme. Safety and quality are the result of choices made at each step, not of inspection at the end.',
        'SOP in daily life::The link between a written procedure and a product somebody else depends on. Following the SOP is the mechanism of stewardship.',
        'Your responsibility::What you fill, pack and label is what the customer receives. Nobody downstream can undo a step done wrong here.'
      ].join('|'),
      Questions: [
        'Product stewardship means: ?? Responsibility for the product through its life ~ Only the final inspection ~ A customer requirement only ?? 0',
        '"Safe by choice" means safety comes from: ?? Choices made at each step ~ Inspection at the end ~ Luck ?? 0',
        'A step done wrong on the line is: ?? Something nobody downstream can undo ~ Corrected later ~ Not important ?? 0',
        'A compliant product is one that: ?? Meets the standard it claims to ~ Looks correct ~ Was made quickly ?? 0',
        'Who is responsible for product safety? ?? Everyone who handles it ~ Only QA ~ Only the manager ?? 0'
      ].join('|')
    },
    // ── Worker induction ────────────────────────────────────────────────
    // The one module the SITE wrote. Content is the "Workers instructions"
    // sheet in ZED · PM FORMATS: 15 categories, 30 rules, and a Hindi column
    // a person translated rather than a machine.
    //
    // Two things differ from every other module here:
    //   - the questions are SITUATIONS, not "is this allowed?". Asking that
    //     straight after stating a rule is guessable — a rule is nearly always
    //     a "yes, do this", so somebody who understood nothing scores full
    //     marks. Each wrong option is a real habit ("leave it, it's the
    //     cleaner's job"), never a straw man, or it is a one-option question.
    //   - correct is on the left in half the questions and the right in the
    //     other half. Always-left is a pattern a worker spots in five screens.
    //
    // Reviewed is still NO: the WORDS are the site's, the pairing of rule to
    // situation is mine.
    {
      TopicID: 'TRN-IND', Source: 'RECORD',
      Objectives: [
        'State the site rules that apply to you every day',
        'Say what is allowed and what is not, in your own area',
        'Choose the right action in a situation you will actually meet',
        'Know who to tell when something is wrong'
      ].join('|'),
      ObjectivesHi: [
        'रोज़ लागू होने वाले साइट के नियम बताना',
        'अपने एरिया में क्या कर सकते हैं और क्या नहीं, यह बताना',
        'सामने आने वाली स्थिति में सही काम चुनना',
        'कुछ गलत हो तो किसे बताना है, यह जानना'
      ].join('|'),
      Sections: [
        'Safety::Always wear your safety gear at work.',
        'Access Control::You may go in the production area only.',
        'Access Control::Use the toilet on your own floor only.',
        'Access Control::Do not go to the lift room, third floor, meter room, office or lab without permission.',
        'Prohibited Items::No tobacco, no alcohol, no pan masala, no cigarettes, no beedi at work.',
        'Prohibited Items::Do not use your phone or earphones in the production area. Keep them in your bag.',
        'Movement::Do not run on the stairs.',
        'Movement::Hold the railing on the stairs.',
        'Movement::If there is an emergency, go out from the emergency exit.',
        'Movement::In a mock drill, walk on the marked line to the assembly point.',
        'Waste Handling::Put paper, plastic and other waste in their own bins.',
        'Waste Handling::Do not throw anything in the drain or the toilet.',
        'Waste Handling::Food waste goes in the wet bin only.',
        'Resources::Do not waste water. Close the tap.',
        'Resources::Use less water in the toilet.',
        'Resources::If a tap is running, close it and tell your supervisor.',
        'Resources::Switch off the light and fan when nobody is there.',
        'Cleanliness::Everyone must clean their own work area.',
        'Cleanliness::Clean your place yourself after tea and lunch.',
        'Hygiene::Wash your hands before work and after work.',
        'Put things back::Put the material back in its place after use.',
        'Information::For leave, give a written application.',
        'Information::Do not take leave without telling anyone.',
        'Information::Give your name, address, phone number and bank details.',
        'Timings::Come on time. Finish your work on time and safely.',
        'Polite Behaviour::Talk nicely to your team. Do not shout.',
        'Accountability::Understand your work. When it is finished, tell your supervisor.',
        'Responsibility::Look after your own things.',
        'Responsibility::I am 18 years or older.',
        'Test and Training::I agree to take tests and training.'
      ].join('|'),
      SectionsHi: [
        'Safety::काम के समय सेफ्टी का सामान हमेशा पहनो।',
        'Access Control::सिर्फ़ प्रोडक्शन एरिया में जाना है।',
        'Access Control::टॉयलेट अपने ही फ़्लोर का इस्तेमाल करो।',
        'Access Control::लिफ्ट रूम, तीसरा फ़्लोर, मीटर रूम, ऑफिस और लैब में बिना इजाज़त मत जाओ।',
        'Prohibited Items::काम पर तम्बाकू, दारू, पान मसाला, सिगरेट, बीड़ी कुछ नहीं चलेगा।',
        'Prohibited Items::प्रोडक्शन एरिया में मोबाइल और इयरफ़ोन मत चलाओ। बैग में रखो।',
        'Movement::सीढ़ी पर मत दौड़ो।',
        'Movement::सीढ़ी पर रेलिंग पकड़ो।',
        'Movement::कोई इमरजेंसी हो तो इमरजेंसी गेट से बाहर निकलो।',
        'Movement::मॉक ड्रिल में लाइन के रास्ते से असेंबली पॉइंट तक जाओ।',
        'Waste Handling::कागज़, प्लास्टिक और बाकी कचरा अलग-अलग डिब्बे में डालो।',
        'Waste Handling::नाली और टॉयलेट में कुछ मत फेंको।',
        'Waste Handling::खाने का कचरा सिर्फ़ गीले कचरे के डिब्बे में डालो।',
        'Resources::पानी बरबाद मत करो। नल बंद करो।',
        'Resources::टॉयलेट में पानी कम इस्तेमाल करो।',
        'Resources::नल चालू दिखे तो बंद करो और सुपरवाइज़र को बताओ।',
        'Resources::कोई न हो तो लाइट और पंखा बंद करो।',
        'Cleanliness::अपनी जगह की सफ़ाई सबको खुद करनी है।',
        'Cleanliness::चाय और खाने के बाद अपनी जगह खुद साफ़ करो।',
        'Hygiene::काम से पहले और काम के बाद हाथ धोओ।',
        'Put things back::सामान इस्तेमाल के बाद अपनी जगह पर रखो।',
        'Information::छुट्टी चाहिए तो लिखकर देना है।',
        'Information::बिना बताए छुट्टी मत लो।',
        'Information::अपना नाम, पता, फ़ोन नंबर और बैंक की जानकारी दो।',
        'Timings::टाइम पर आओ। काम टाइम पर और सही तरीके से करो।',
        'Polite Behaviour::टीम से अच्छे से बात करो। चिल्लाओ मत।',
        'Accountability::अपना काम समझ लो। हो जाए तो सुपरवाइज़र को बताओ।',
        'Responsibility::अपना सामान खुद संभालो।',
        'Responsibility::मेरी उम्र अठारह साल से ज़्यादा है।',
        'Test and Training::मुझे टेस्ट और ट्रेनिंग से कोई दिक्कत नहीं है।'
      ].join('|'),
      Questions: [
        'You are starting your shift on the line. ?? Start, it is only one hour ~ Put on my safety gear ?? 1',
        'You need something kept in the lab. ?? Ask the supervisor first ~ Go in and take it ?? 0',
        'Someone offers you pan masala inside the plant. ?? Take it, just once ~ Say no ?? 1',
        'Your phone rings while you are on the machine. ?? Leave it in my bag ~ Pick it up quickly ?? 0',
        'You are late and the stairs are ahead of you. ?? Run down ~ Walk down ?? 1',
        'You have empty plastic bags and waste paper. ?? Put it all in one bin ~ Put each in its own bin ?? 1',
        'You washed your hands and the tap is still running. ?? Close the tap ~ Leave it, it closes by itself ?? 0',
        'You see a tap running with nobody there. ?? Close it and tell the supervisor ~ Walk past, it is not my job ?? 0',
        'Your shift is ending and your area is dirty. ?? Clean it myself ~ Leave it for the cleaner ?? 0',
        'You have finished using a tool. ?? Leave it on the table ~ Put it back in its place ?? 1'
      ].join('|'),
      QuestionsHi: [
        'आप लाइन पर काम शुरू कर रहे हो। ?? शुरू कर दूँगा, एक ही घंटा है ~ सेफ्टी का सामान पहनूँगा ?? 1',
        'आपको लैब में रखी एक चीज़ चाहिए। ?? पहले सुपरवाइज़र से पूछूँगा ~ अंदर जाकर ले आऊँगा ?? 0',
        'प्लांट के अंदर कोई आपको पान मसाला दे रहा है। ?? एक बार ले लूँगा ~ मना कर दूँगा ?? 1',
        'मशीन पर काम करते समय आपका फ़ोन बजता है। ?? बैग में ही रहने दूँगा ~ जल्दी से उठा लूँगा ?? 0',
        'आपको देर हो रही है और सामने सीढ़ी है। ?? दौड़कर उतरूँगा ~ चलकर उतरूँगा ?? 1',
        'आपके पास खाली प्लास्टिक बैग और कागज़ है। ?? सब एक ही डिब्बे में डालूँगा ~ अलग-अलग डिब्बे में डालूँगा ?? 1',
        'हाथ धो लिए और नल अभी चालू है। ?? नल बंद करूँगा ~ छोड़ दूँगा, अपने आप बंद होता है ?? 0',
        'एक नल चालू है और वहाँ कोई नहीं है। ?? बंद करके सुपरवाइज़र को बताऊँगा ~ आगे बढ़ जाऊँगा, मेरा काम नहीं है ?? 0',
        'शिफ्ट खत्म हो रही है और आपकी जगह गंदी है। ?? खुद साफ़ करूँगा ~ सफ़ाई वाले के लिए छोड़ दूँगा ?? 0',
        'आपका औज़ार का काम खत्म हो गया। ?? टेबल पर ही छोड़ दूँगा ~ अपनी जगह पर रख दूँगा ?? 1'
      ].join('|'),
      PassMark: 80
    }
  ];
}

/** The five drill scenarios. Content from the site's own drill procedures. */
function _moduleSeedDrills_() {
  return [
    {
      TopicID: 'DRL-01', Source: 'DRILL',
      Objectives: ['Recognise an unresponsive casualty and make the area safe',
                   'Call the first aider and use the emergency contact list',
                   'Explain the reason behind each first aid step, not only the step'].join('|'),
      Sections: [
        'Making the area safe::Approach only when it is safe to do so. A second casualty helps nobody.',
        'Checking the casualty::Check for response and for breathing before anything else.',
        'Calling for help::The first aider is called and the emergency contact list is used. Do not delay this to attempt treatment.',
        'Aftercare::The first aid box is checked and restocked after use, and the incident is recorded and reported.'
      ].join('|'),
      Questions: [
        'Before approaching a casualty you: ?? Make sure the area is safe ~ Move them at once ~ Fetch water ?? 0',
        'First you check for: ?? Response and breathing ~ Broken bones ~ Identity ?? 0',
        'After using the first aid box you: ?? Check and restock it ~ Close it ~ Leave it ?? 0',
        'The emergency contact list is used: ?? As soon as help is needed ~ Only after treatment ~ Rarely ?? 0',
        'A first aid incident should be: ?? Recorded and reported ~ Forgotten if minor ~ Reported only if serious ?? 0'
      ].join('|')
    },
    {
      TopicID: 'DRL-02', Source: 'DRILL',
      Objectives: ['Identify a suspicious person or transaction at the gate',
                   'Follow the reporting chain to the supervisor and management',
                   'Verify material and gatepass before anything moves'].join('|'),
      Sections: [
        'Identification::Security identifies the suspicious person or transaction and stops the material at the gate.',
        'Reporting chain::Security informs the supervisor immediately; the supervisor informs management.',
        'Verification::The incident is reviewed and the material and gatepass verified. CCTV is checked for the movement in question.',
        'Action and record::Management decides the action. The incident is recorded in the register and the Do’s and Don’ts reinforced on entry.'
      ].join('|'),
      Questions: [
        'The material at the gate is: ?? Stopped and not allowed to move ~ Allowed through ~ Ignored ?? 0',
        'Security informs: ?? The supervisor immediately ~ Nobody ~ Only at shift end ?? 0',
        'What is checked for the movement? ?? CCTV footage and the gatepass ~ Nothing ~ Only the person ?? 0',
        'Who decides the action taken? ?? Management ~ Security alone ~ The person involved ?? 0',
        'The incident is: ?? Recorded in the register and reported ~ Handled informally ~ Not recorded ?? 0'
      ].join('|')
    },
    {
      TopicID: 'DRL-03', Source: 'DRILL',
      Objectives: ['Raise the alarm and evacuate by the marked route',
                   'Deploy an ABC extinguisher and describe hydrant operation',
                   'Take part in the assembly point roll call'].join('|'),
      Sections: [
        'Raising the alarm::The person discovering the fire raises the alarm and informs the supervisor.',
        'Evacuation::The alarm sounds, evacuation is announced, and all personnel leave by the marked route while security controls the gate.',
        'Roll call::A head count is taken at the assembly point and missing persons are reported.',
        'Fire fighting::The fire fighter deploys the ABC extinguisher using PASS; hydrant operation is demonstrated.',
        'After the drill::Extinguisher pressure and service record are checked after use.'
      ].join('|'),
      Questions: [
        'Who raises the alarm? ?? Whoever discovers the fire ~ Only the fire fighter ~ Only management ?? 0',
        'During evacuation, security: ?? Controls the gate and ensures orderly evacuation ~ Leaves first ~ Locks the gate ?? 0',
        'A head count is taken: ?? At the assembly point ~ At the gate ~ Not at all ?? 0',
        'After using an extinguisher: ?? Its pressure and service record are checked ~ It is put back ~ It is discarded ?? 0',
        'The extinguisher is deployed using: ?? The PASS method ~ Any method ~ Water only ?? 0'
      ].join('|'),
      ObjectivesHi: ['अलार्म बजाना और चिह्नित मार्ग से निकलना',
       'ABC अग्निशामक चलाना और हाइड्रेंट संचालन बताना',
       'असेंबली पॉइंट पर गिनती में शामिल होना'].join('|'),
      SectionsHi: ['अलार्म बजाना::आग देखने वाला व्यक्ति अलार्म बजाता है और सुपरवाइज़र को सूचित करता है।',
       'निकासी::अलार्म बजता है, निकासी की घोषणा होती है, और सभी चिह्नित मार्ग से निकलते हैं जबकि सुरक्षा गेट नियंत्रित करती है।',
       'गिनती::असेंबली पॉइंट पर गिनती होती है और अनुपस्थित व्यक्तियों की सूचना दी जाती है।',
       'आग बुझाना::फायर फाइटर PASS विधि से ABC अग्निशामक चलाता है; हाइड्रेंट संचालन दिखाया जाता है।',
       'ड्रिल के बाद::उपयोग के बाद अग्निशामक का दबाव और सर्विस रिकॉर्ड जाँचा जाता है।'].join('|'),
      QuestionsHi: ['अलार्म कौन बजाता है? ?? जो भी आग देखे ~ केवल फायर फाइटर ~ केवल प्रबंधन ?? 0',
       'निकासी के दौरान सुरक्षा: ?? गेट नियंत्रित करती है और सुव्यवस्थित निकासी सुनिश्चित करती है ~ पहले निकल जाती है ~ गेट बंद कर देती है ?? 0',
       'गिनती कहाँ होती है? ?? असेंबली पॉइंट पर ~ गेट पर ~ होती ही नहीं ?? 0',
       'अग्निशामक के उपयोग के बाद: ?? उसका दबाव और सर्विस रिकॉर्ड जाँचा जाता है ~ वापस रख दिया जाता है ~ फेंक दिया जाता है ?? 0',
       'अग्निशामक किस विधि से चलाया जाता है? ?? PASS विधि ~ कोई भी विधि ~ केवल पानी से ?? 0'].join('|')
    },
    {
      TopicID: 'DRL-04', Source: 'DRILL',
      Objectives: ['Stop the source of a spill safely and cordon the area',
                   'Consult the MSDS and wear the correct PPE before handling',
                   'Deploy a spill kit and dispose of waste correctly'].join('|'),
      Sections: [
        'First response::Stop the source if it is safe to do so, inform the supervisor, and alert the concerned teams.',
        'Cordon and identify::Cordon the area, keep others clear, identify the material and consult its MSDS before handling anything.',
        'PPE::Wear the PPE the PPE Matrix requires for that material — not the PPE that happens to be nearby.',
        'Containment::Deploy the spill kit to contain the spill and stop it spreading, then apply absorbent.',
        'Disposal and restock::Waste is collected and moved to the seepage location; the area is cleaned, the spill kit restocked and the incident reported.'
      ].join('|'),
      Questions: [
        'Before handling a spilled material you consult: ?? Its MSDS ~ Nobody ~ The supplier ?? 0',
        'The first action is to: ?? Stop the source if safe ~ Start mopping ~ Leave the area ?? 0',
        'The spill kit is used to: ?? Contain the spill and stop it spreading ~ Clean the floor afterwards ~ Store waste ?? 0',
        'After the spill is cleared: ?? The kit is restocked and the incident reported ~ Work resumes ~ Nothing ?? 0',
        'Which PPE do you wear? ?? What the PPE Matrix requires for that material ~ Whatever is nearby ~ None ?? 0'
      ].join('|')
    },
    {
      TopicID: 'DRL-05', Source: 'DRILL',
      Objectives: ['Respond to the earthquake signal with drop, cover and hold',
                   'Evacuate in single file by the pre-determined route',
                   'Assist others through the buddy system and be counted'].join('|'),
      Sections: [
        'The signal::A distinctive siren or bell indicates an earthquake. Responsible persons are alerted by this signal.',
        'Drop, cover and hold::Move away from windows, glass and unfastened objects. Take cover under a table, desk or chair until the shaking signal stops. Where there are not enough desks, use a bag to protect the head.',
        'If you are outside::Get clear of buildings, power lines, trees and poles, then drop to your knees and cover your head and neck.',
        'Evacuation::Once shaking stops, leave in single file, calmly. No running and no overtaking on staircases. Watch for falling objects.',
        'Buddy system and roll call::Persons with physical or mental disabilities are assisted by an assigned buddy. A roll call at the assembly point confirms everybody is out.'
      ].join('|'),
      Questions: [
        'During shaking you should: ?? Drop, cover and hold ~ Run outside ~ Stand in a doorway ?? 0',
        'If you are outside during an earthquake: ?? Get clear of buildings and power lines ~ Go indoors ~ Stand under a tree ?? 0',
        'Evacuation after the shaking is: ?? Single file, calm, no running ~ As fast as possible ~ Individually ?? 0',
        'The buddy system exists to: ?? Assist persons who need help evacuating ~ Pair up friends ~ Count people ?? 0',
        'What confirms everybody is out? ?? A roll call at the assembly point ~ The alarm stopping ~ Nothing ?? 0'
      ].join('|'),
      ObjectivesHi: ['भूकंप संकेत पर झुको, ढको, पकड़ो करना',
       'पूर्वनिर्धारित मार्ग से एक पंक्ति में निकलना',
       'बडी सिस्टम से दूसरों की सहायता करना और गिनती में शामिल होना'].join('|'),
      SectionsHi: ['संकेत::एक विशिष्ट सायरन या घंटी भूकंप का संकेत देती है। इससे जिम्मेदार व्यक्ति सतर्क होते हैं।',
       'झुको, ढको, पकड़ो::खिड़कियों, काँच और खुली वस्तुओं से दूर हटें। कंपन रुकने तक मेज़ या कुर्सी के नीचे रहें। पर्याप्त मेज़ न हों तो बैग से सिर ढकें।',
       'यदि आप बाहर हैं::इमारत, बिजली की लाइन, पेड़ और खंभों से दूर हटें, घुटनों पर बैठें और सिर व गर्दन ढकें।',
       'निकासी::कंपन रुकने पर शांतिपूर्वक एक पंक्ति में निकलें। दौड़ना और सीढ़ियों पर आगे निकलना वर्जित। गिरती वस्तुओं से सावधान रहें।',
       'बडी सिस्टम एवं गिनती::शारीरिक या मानसिक अक्षमता वाले व्यक्तियों की सहायता नियत बडी करता है। असेंबली पॉइंट पर गिनती से पुष्टि होती है कि सब बाहर हैं।'].join('|'),
      QuestionsHi: ['कंपन के दौरान आपको: ?? झुको, ढको, पकड़ो करना चाहिए ~ बाहर भागना चाहिए ~ दरवाज़े में खड़े होना चाहिए ?? 0',
       'भूकंप के समय यदि आप बाहर हैं: ?? इमारत और बिजली की लाइन से दूर हटें ~ अंदर जाएँ ~ पेड़ के नीचे खड़े हों ?? 0',
       'कंपन के बाद निकासी: ?? एक पंक्ति में, शांतिपूर्वक, बिना दौड़े ~ जितना तेज़ हो सके ~ अलग-अलग ?? 0',
       'बडी सिस्टम किसलिए है? ?? निकासी में सहायता चाहिए ऐसे व्यक्तियों हेतु ~ दोस्तों की जोड़ी हेतु ~ गिनती हेतु ?? 0',
       'सब बाहर हैं, इसकी पुष्टि कैसे होती है? ?? असेंबली पॉइंट पर गिनती से ~ अलार्म बंद होने से ~ कुछ नहीं ?? 0'].join('|')
    }
  ];
}

/**
 * The twelve process videos. The video IS the content, so a module here is
 * the objectives, the key points a trainer must confirm, and the check
 * questions. Marked DRAFTED where the site holds no written procedure to
 * take the content from — those need review before use.
 */
function _moduleSeedVideos_() {
  function vid(id, subject, objectives, points, questions) {
    return {
      TopicID: id, Source: 'VIDEO',
      Objectives: objectives.join('|'),
      Sections: ['Watch the video::The site video for ' + subject + ' is the content of this module. Watch it in full before the check questions.',
                 'Key points to confirm::' + points.join(' '),
                 'On the machine::After the video, the trainer confirms the operator can carry out the task on the machine, under supervision, before it counts as done.'].join('|'),
      Questions: questions.join('|')
    };
  }
  return [
    vid('VID-01', 'the ribbon printer roll change',
      ['Change a ribbon printer roll correctly', 'Confirm print quality after a change'],
      ['Machine stopped and isolated before the change.', 'Ribbon seated on the correct path and tension.', 'First prints checked for completeness and legibility before the run continues.'],
      ['Before changing a ribbon roll the machine is: ?? Stopped and isolated ~ Left running ~ Slowed down ?? 0',
       'After a ribbon change you must: ?? Check the first prints for legibility ~ Carry on immediately ~ Tell nobody ?? 0',
       'Incorrect ribbon tension causes: ?? Poor or incomplete printing ~ Nothing ~ Faster running ?? 0']),
    vid('VID-02', 'the Henkel filling line nozzle',
      ['Operate and change the filling line nozzle correctly', 'Recognise a fill fault caused by the nozzle'],
      ['Nozzle cleaned and correctly fitted before a run.', 'Fill volume checked at the start and during the run.', 'Drips, foaming or short fills are nozzle faults to report, not to run through.'],
      ['A short fill is: ?? A fault to stop and report ~ Corrected at packing ~ Acceptable ?? 0',
       'The nozzle is checked: ?? Before a run and during it ~ Only at the end ~ Never ?? 0',
       'Dripping at the nozzle means: ?? A fault to be reported ~ Normal operation ~ Faster filling ?? 0']),
    vid('VID-03', 'the winder and rewinder roll change',
      ['Change winder and rewinder rolls safely', 'Set correct tension and web alignment'],
      ['Machine stopped before any roll change.', 'Web aligned and tension set before restart.', 'Loose or misaligned web causes label and coding defects downstream.'],
      ['The machine during a roll change is: ?? Stopped ~ Running slowly ~ In manual ?? 0',
       'Misaligned web causes: ?? Label and coding defects ~ No problem ~ Faster output ?? 0',
       'Tension is set: ?? Before restarting the run ~ After the run ~ Not at all ?? 0']),
    vid('VID-04', 'sachet packing in packs of five',
      ['Pack sachets in the correct count and orientation', 'Check pack integrity before it moves on'],
      ['Correct count per pack, verified not assumed.', 'Sachets oriented the same way in every pack.', 'Damaged or leaking sachets removed, not packed.'],
      ['The count in a pack is: ?? Verified, not assumed ~ Estimated ~ Checked at dispatch ?? 0',
       'A leaking sachet is: ?? Removed and reported ~ Packed anyway ~ Wiped and packed ?? 0',
       'Sachet orientation in a pack should be: ?? The same in every pack ~ Random ~ Whatever fits ?? 0']),
    vid('VID-05', 'QR labelling',
      ['Apply QR labels correctly and verify they scan', 'Recognise a label that will fail at the customer'],
      ['Right label on the right product, checked against the order.', 'Label applied flat, square and in the specified position.', 'Every QR verified by scanning — a label that does not scan is a defect.'],
      ['A QR label that does not scan is: ?? A defect ~ Acceptable if it looks right ~ The customer’s problem ?? 0',
       'Labels are checked against: ?? The order and specification ~ Memory ~ The previous batch ?? 0',
       'A creased or skewed label should be: ?? Removed and replaced ~ Smoothed and passed ~ Ignored ?? 0']),
    vid('VID-06', 'weight checking and QR stamping',
      ['Check weight to specification and record it', 'Apply the QR stamp legibly and in position'],
      ['Weight checked against the specified tolerance, not by feel.', 'Scale checked as calibrated before use.', 'Stamp legible and in the correct position on every unit.'],
      ['Weight is checked against: ?? The specified tolerance ~ Feel ~ The last unit ?? 0',
       'Before using the scale you confirm: ?? It is calibrated ~ It is switched on only ~ Nothing ?? 0',
       'An illegible stamp is: ?? A defect to be corrected ~ Acceptable ~ Fixed at dispatch ?? 0']),
    vid('VID-07', 'Henkel label printing',
      ['Set up and run label printing to specification', 'Verify printed content before the run continues'],
      ['Correct artwork and batch data loaded and verified before printing.', 'First-off print checked in full against the specification.', 'Print quality monitored during the run, not only at the start.'],
      ['The first printed label is: ?? Checked in full against the specification ~ Discarded ~ Assumed correct ?? 0',
       'Batch data is: ?? Verified before printing starts ~ Entered at the end ~ Not checked ?? 0',
       'Print quality is monitored: ?? During the run ~ Only at the start ~ Only if a complaint arrives ?? 0']),
    vid('VID-08', 'leakage testing',
      ['Carry out the leakage test correctly', 'Act correctly on a failed unit'],
      ['Test performed to the specified method and duration, not shortened.', 'A failed unit is quarantined, not returned to the line.', 'A failure pattern is reported — repeat leaks indicate a sealing fault upstream.'],
      ['A unit that fails the leak test is: ?? Quarantined and reported ~ Retested until it passes ~ Packed ?? 0',
       'The test duration may be: ?? Not shortened ~ Shortened when busy ~ Decided by the operator ?? 0',
       'Repeated leaks indicate: ?? A sealing fault upstream ~ Bad luck ~ A test error ?? 0']),
    vid('VID-09', 'wrap-around labelling setup',
      ['Set up the wrap-around labelling machine', 'Verify label position and adhesion'],
      ['Machine set for the container size before the run.', 'Label square, positioned to specification, with no overlap or gap.', 'Adhesion checked — a lifting label fails at the customer.'],
      ['A lifting label edge is: ?? A defect to correct ~ Normal ~ Fixed by the customer ?? 0',
       'The machine is set: ?? For the container size before the run ~ During the run ~ Once a year ?? 0',
       'Label position is checked against: ?? The specification ~ The operator’s judgement ~ The last order ?? 0']),
    vid('VID-10', 'bottle filling and capping',
      ['Fill and cap bottles to specification', 'Recognise a capping fault before it leaves the line'],
      ['Fill volume within tolerance, checked through the run.', 'Cap correctly seated and torqued — cross-threaded or loose caps are defects.', 'Spillage cleaned immediately; a wet bottle is a labelling failure waiting to happen.'],
      ['A cross-threaded cap is: ?? A defect ~ Acceptable if tight ~ Corrected at packing ?? 0',
       'Fill volume is checked: ?? Through the run ~ Only at the start ~ By the customer ?? 0',
       'A wet bottle going to labelling will: ?? Cause a labelling failure ~ Dry on its own ~ Be fine ?? 0']),
    vid('VID-11', 'fire training',
      ['Recall the site fire response', 'Use an extinguisher by the PASS method'],
      ['Alarm raised first, always.', 'PASS: Pull, Aim at the base, Squeeze, Sweep.', 'Evacuate and be counted; do not re-enter.'],
      ['The first action on discovering a fire is: ?? Raise the alarm ~ Fight it alone ~ Collect belongings ?? 0',
       'You aim an extinguisher at: ?? The base of the fire ~ The flame tips ~ The smoke ?? 0',
       'After evacuating you: ?? Stay to be counted ~ Re-enter to help ~ Go home ?? 0']),
    vid('VID-12', 'the Superprocure system',
      ['Use the Superprocure system for its intended transactions',
       'Know what must be recorded and when'],
      ['Transactions entered at the time they happen, not reconstructed later.', 'Supporting documents attached where the process requires it.', 'Queries raised with the process owner rather than worked around.'],
      ['Transactions should be entered: ?? At the time they happen ~ At month end ~ When convenient ?? 0',
       'A query with the system should be: ?? Raised with the process owner ~ Worked around ~ Ignored ?? 0',
       'Supporting documents are: ?? Attached where the process requires ~ Optional ~ Filed separately ?? 0'])
  ];
}

/**
 * The eleven QA course modules. Content is AYT India course material held on
 * site — REFERENCED, not reproduced. Each module points the learner at the
 * notes and sets the objectives and checks the site cares about.
 */
function _moduleSeedCourses_() {
  function qac(id, name, folder, objectives, points, questions) {
    return {
      TopicID: id, Source: 'AYT',
      Objectives: objectives.join('|'),
      Sections: [
        'Course material::The AYT India course notes for ' + name + ' are held on site in "# TRAINING/QA Course/' + folder + '". Work through the notes; this module sets the objectives and the checks.',
        'Key points::' + points.join(' '),
        'Applying it here::The trainer relates each concept to a real example from this site before the check questions.'
      ].join('|'),
      Questions: questions.join('|'), PassMark: 70
    };
  }
  return [
    qac('QAC-01', 'Daily Rejection & Rework and COPQ', '01 Daily Rejection Rework Sheet , COPQ',
      ['Complete the daily rejection and rework report', 'Explain COPQ and what drives it', 'Use red bin analysis to find the biggest loss'],
      ['Rejection is recorded daily, by defect type, not as a single number.', 'COPQ is the cost of poor quality — rework, scrap, inspection and complaint handling.', 'Red bin analysis sorts what was actually rejected to find the dominant cause.'],
      ['COPQ stands for: ?? Cost of Poor Quality ~ Control of Product Quality ~ Count of Production Quantity ?? 0',
       'Rejection should be recorded: ?? Daily and by defect type ~ Monthly as a total ~ Only when high ?? 0',
       'Red bin analysis is used to: ?? Find the dominant rejection cause ~ Count bins ~ Dispose of scrap ?? 0']),
    qac('QAC-02', 'the Skill Matrix', '02 Skill Matrix',
      ['Explain what a skill matrix shows', 'Read a level against a minimum requirement', 'State how a level is earned and confirmed'],
      ['A skill matrix maps people against the skills their role requires.', 'A level below the minimum for the role is a gap needing training.', 'Attendance proposes a level; a supervisor confirms it.'],
      ['A skill matrix maps: ?? People against required skills ~ Machines against output ~ Shifts against hours ?? 0',
       'A level below the role minimum is: ?? A gap needing training ~ Acceptable ~ Ignored ?? 0',
       'Who confirms a competency level? ?? A supervisor ~ The system alone ~ The worker ?? 0']),
    qac('QAC-03', 'the office filing and storage system', '03 Office Filing Storage System',
      ['Apply the site file naming and listing convention', 'Retrieve a controlled document quickly'],
      ['Documents are named and listed to one convention so anybody can find them.', 'A controlled document has an owner, a version and a review date.', 'Retrieval time is the test of a filing system, not how it looks.'],
      ['A controlled document must have: ?? An owner, version and review date ~ Only a title ~ A signature only ?? 0',
       'The test of a filing system is: ?? How fast a document is retrieved ~ How it looks ~ Its size ?? 0',
       'File naming should follow: ?? One site convention ~ Each person’s preference ~ The date only ?? 0']),
    qac('QAC-04', '4M Change Management', '04 4M Change Management',
      ['Name the four Ms', 'Distinguish a planned from an unplanned change', 'State what retroactive and containment checks are for'],
      ['4M is Man, Machine, Material and Method — the resources needed to make a part.', 'A 4M change is any change to those in production or process.', 'Unplanned change and abnormal conditions trigger containment and retroactive checks on suspected material.'],
      ['The four Ms are: ?? Man, Machine, Material, Method ~ Make, Measure, Move, Monitor ~ Man, Money, Market, Method ?? 0',
       'A change of operator on a line is: ?? A 4M change ~ Not a change ~ Only an HR matter ?? 0',
       'Containment checks are done to: ?? Isolate suspected material ~ Speed up production ~ Reduce cost ?? 0']),
    qac('QAC-06', 'the Cause & Effect (Fishbone) Diagram', '06 Cause & Effect Diagram Fishbone Diagram',
      ['Draw a fishbone diagram for a real defect', 'Group causes into categories', 'Distinguish a cause from a symptom'],
      ['A fishbone organises possible causes of one effect into categories, commonly the 4M or 6M.', 'The effect is the problem; the bones are the candidate causes.', 'A cause you can act on is useful; a symptom restated is not.'],
      ['A fishbone diagram organises: ?? Possible causes of one effect ~ Costs ~ Production steps ?? 0',
       'The head of the fishbone is: ?? The problem or effect ~ The solution ~ The team ?? 0',
       'Causes are commonly grouped by: ?? The 4M or 6M categories ~ Alphabetically ~ By cost ?? 0']),
    qac('QAC-07', 'the Quality and NPD department', '07 Quality & NPD Department',
      ['State what quality and NPD are responsible for', 'Know when to involve them'],
      ['Quality owns the standard and its verification; NPD owns new product introduction.', 'Involve them before a change reaches the customer, not after a complaint.'],
      ['NPD is responsible for: ?? New product introduction ~ Daily production ~ Dispatch ?? 0',
       'Quality should be involved: ?? Before a change reaches the customer ~ After a complaint ~ Never ?? 0',
       'Who owns the quality standard? ?? The Quality department ~ Each operator ~ The customer ?? 0']),
    qac('QAC-08', 'PPM, DPU and DPMO', '08 How to calculate PPM , DPU , DPMO',
      ['Calculate PPM, DPU and DPMO from a rejection sheet', 'Explain why a defect count differs from a rejected quantity'],
      ['PPM is rejected parts per million produced.', 'DPU is defects per unit — one unit can carry several defects.', 'DPMO is defects per million opportunities, which accounts for how many ways a unit can fail.'],
      ['PPM measures: ?? Rejected parts per million ~ Parts per minute ~ Production per month ?? 0',
       'DPU differs from PPM because: ?? One unit can carry several defects ~ It is the same ~ It counts machines ?? 0',
       'DPMO accounts for: ?? The number of opportunities to fail per unit ~ Cost ~ Time ?? 0']),
    qac('QAC-09', 'the 5S Champion course', '09 5S Champion Course for Managers , Supervisors',
      ['Name the five S in order', 'Run a 5S audit using the check sheet', 'Use red tags and a liquidation plan'],
      ['Sort, Set in order, Shine, Standardise, Sustain — in that order, because each depends on the one before.', 'Red tagging identifies items that do not belong, and the liquidation plan decides what happens to them.', 'Sustain is the one that fails: without audits and zone leaders, 5S decays.'],
      ['The five S in order are: ?? Sort, Set in order, Shine, Standardise, Sustain ~ Sort, Shine, Set, Standardise, Sustain ~ Sweep, Sort, Shine, Standardise, Sustain ?? 0',
       'Red tagging identifies: ?? Items that do not belong in the area ~ Faulty machines ~ Best practice ?? 0',
       'The S that most often fails is: ?? Sustain ~ Sort ~ Shine ?? 0']),
    qac('QAC-10', 'SOP, PCS, OPS and PCQT formats', '10 Ready to Use Formats SOP,PCS,OPS,PCQT',
      ['Distinguish an SOP from a PCS, OPS and PCQT', 'Complete the correct format for a task'],
      ['Each format answers a different question: how the task is done, how the process is controlled, how the operation is standardised, and how quality is checked.', 'Using the wrong format produces a document nobody can act on.'],
      ['An SOP describes: ?? How a task is done ~ The cost of a task ~ Who is on shift ?? 0',
       'Using the wrong format results in: ?? A document nobody can act on ~ No difference ~ Faster approval ?? 0',
       'These formats exist to: ?? Make the method repeatable ~ Satisfy auditors only ~ Fill files ?? 0']),
    qac('QAC-11', 'the Poison Test', '11 Poison Test',
      ['Explain what a poison test checks', 'State what a failed poison test means about inspection'],
      ['A known defect is deliberately introduced to check whether inspection catches it.', 'If the planted defect passes, the inspection process — not the inspector alone — needs correcting.', '8D and CAPA follow a failure to fix the cause, not to blame.'],
      ['A poison test checks: ?? Whether inspection catches a known defect ~ Chemical safety ~ Material purity ?? 0',
       'If a planted defect passes, it means: ?? The inspection process needs correcting ~ Nothing ~ The defect was too small ?? 0',
       'After a failure the site should: ?? Run 8D/CAPA to fix the cause ~ Blame the inspector ~ Repeat the test ?? 0']),
    qac('QAC-12', 'Pareto Analysis', '12 Pareto Analysis',
      ['Build a Pareto chart from defect data', 'Identify the vital few causes to act on first'],
      ['Pareto orders causes by frequency or cost, largest first, with a cumulative line.', 'Typically a small number of causes account for most of the loss — act on those first.', 'A Pareto built on the wrong measure points at the wrong problem.'],
      ['A Pareto chart orders causes: ?? Largest first, with a cumulative line ~ Alphabetically ~ By date ?? 0',
       'The value of Pareto is: ?? Identifying the vital few to act on first ~ Showing every cause equally ~ Reducing paperwork ?? 0',
       'A Pareto built on the wrong measure: ?? Points at the wrong problem ~ Still works ~ Is more accurate ?? 0'])
  ];
}
