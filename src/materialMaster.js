// ============================================================
// materialMaster.gs — read the QMS MASTERS_Materials master (read-only)
// ============================================================
//
// The QMS spreadsheet ID is stored in Config key 'QMSMaterialSheetID'. If unset
// or unreadable, returns an empty list so the gatepass falls back to free-text —
// it must never throw or block registration.
//
// Cached in CacheService (6h) so the slow external openById happens at most once
// per 6h across all users. The gatepass card loads this once on open and does
// its autocomplete client-side (no per-keystroke server calls).

var MATERIAL_CACHE_KEY = 'qms_materials_v1';
var MATERIAL_CACHE_TTL = 21600; // 6h

function getMaterialList() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(MATERIAL_CACHE_KEY);
  if (hit) { try { return { success: true, materials: JSON.parse(hit) }; } catch (e) {} }

  var id = String(getConfigValue('QMSMaterialSheetID') || '').trim();
  if (!id) return { success: true, materials: [] };

  var materials = [];
  try {
    var ws = SpreadsheetApp.openById(id).getSheetByName('MASTERS_Materials');
    if (ws) {
      // MASTERS_Materials contract: A code, B desc, C unit (see QMS Masters.js).
      var data = ws.getDataRange().getValues();
      materials = data.slice(1).filter(function(r) { return r[0]; }).map(function(r) {
        return { code: String(r[0]).trim(), desc: String(r[1] || '').trim(), unit: String(r[2] || '').trim() };
      });
    }
  } catch (e) {
    Logger.log('getMaterialList failed: ' + e.message);
    return { success: true, materials: [] };
  }
  try { cache.put(MATERIAL_CACHE_KEY, JSON.stringify(materials), MATERIAL_CACHE_TTL); } catch (e) {}
  return { success: true, materials: materials };
}
