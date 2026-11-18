/* Survey layout ("etüt düzeni"): obstacle types with their shown names, sub-types, inputs and standard remarks.
   Built-in types keep a fixed key (the rules and the report rely on it); only what is shown changes.
   Kept in the settings ('layout'); exported / imported as a text file (JSON) to use the same layout on another device. */
(function (g) {
  'use strict';
  const R = g.SurveyRules;
  const TYPES = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn',
    'Inclination', 'Declination', 'Road Condition', 'Width Obstruction', 'Railroad Crossing', 'Port Gate', 'Satellite View', 'Drone View'];
  const QUICK = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'Inclination', 'Declination'];
  /* which inputs each type opens with (team's list, 18.11.2026); any type can still add H or W by hand */
  const H_TYPES = ['Overhead Cable', 'Overhead Structure', 'Railroad Crossing', 'Port Gate'];
  const WIDTH_TYPES = ['Overhead Structure', 'Bridge', 'Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn', 'Road Condition', 'Width Obstruction', 'Railroad Crossing', 'Port Gate'];
  const CURVES = ['Right curve. Turning radius of the curve is suitable for planned transportation operation.', 'Left curve. Turning radius of the curve is suitable for planned transportation operation.'];
  const SUB = {
    'Overhead Structure': ['L Shape Signboard', 'Signboard', 'Bridge', 'Traffic Enforcement Camera', 'L Shape Traffic Light', 'Traffic Light', 'Pedestrian Bridge', 'Pipeline'],
    'Overhead Cable': ['High Voltage Powerline', 'Medium Voltage Powerline', 'Low Voltage Powerline', 'Telephone Line', 'Railroad Communication Cable'],
    'Bridge': ['Precast Concrete I Girder', 'Precast Concrete U Girder', 'Concrete Tee Beam', 'Concrete Flat Slab', 'Steel I Girder', 'Steel U Girder', 'Concrete Box Girder'],
    'Culvert': ['Box', 'Arc', 'Pipe'],
  };
  // obstacles with a width get one of these automatically when the width is entered (load width known)
  const W_OK = 'The clearance is sufficient for planned transportation operation. No action required.';
  const W_NO = 'The clearance is not sufficient for planned transportation operation.';
  /* standard comments; each list opens with the app's own, followed by the wording used in the team's past reports
     (Gaziantep–Kahramanmaraş and Best Transformer–İzmir Aliağa, Nov 2026) */
  const PHRASES = {
    'Overhead Cable': [R.TEXT.lvLift, R.TEXT.lvOff, R.TEXT.hvOff, R.TEXT.none,
      'Cable height is enough for planned transportation operation. No action required.',
      'The height of the cables is suitable for the planned operation. No action required.'],
    'Overhead Structure': [R.TEXT.structure, 'Structure must be removed/bypassed.', 'Use right lane to pass. No action required.', 'Use left lane to pass. No action required.', R.TEXT.none,
      'The heights and widths of the opposing L-shaped traffic lights are suitable for the planned transportation operation.',
      'The heights of the opposing L-shaped traffic lights are suitable for the planned transportation operation.',
      'The widths of the opposing L-shaped traffic lights are suitable for the planned transportation operation.',
      'The clearance on the right side of the L-shape traffic light is enough for transportation.',
      'The clearance between the L-shape traffic lights is enough for transportation. No action required.',
      'The height of the traffic lights is suitable for the planned operation. No action required.',
      'Signboard must be removed.'],
    'Bridge': ['Bridge static analysis and evaluation is required.',
      'Bridge static analysis and evaluation is required. Major cracks observed.',
      'Bridge static analysis and evaluation is required. Minor cracks observed.', 'The bridge is in good condition.',
      'Construction of a new bridge has commenced along the route. The height of bridge is currently unknown.'],
    'Culvert': ['The culvert is good condition.', 'Bridge static analysis and evaluation is required.'],
    'Left Turn': ['Turn left.', 'Turn left. Turning radius of the turn is suitable for planned transportation operation.', 'Turn left. Turning radius of the turn is not suitable for planned transportation operation.', 'The opposite traffic direction must be used.',
      'Turn left and take the second exit at the roundabout.', 'Turn left by roundabout turn.', 'Turn left and exit the freeway.'],
    'Right Turn': ['Turn right.', 'Turn right. Turning radius of the turn is suitable for planned transportation operation.', 'Turn right. Turning radius of the turn is not suitable for planned transportation operation.', 'The opposite traffic direction must be used.',
      'Turn right. The turn is suitable for planned transportation operation.', 'Concrete blocks must be removed for the right turn.', 'Turn right after exit of factory.', 'Turn right at the roundabout and enter the freeway.'],
    'Curve': ['Left curve. No action required.', 'Right curve. No action required.', 'S Turn.', 'S Turn. Turning radius is suitable for transportation.'],
    'U Turn': ['U turn. Turning radius of the turn is suitable for planned transportation operation.', 'U - Turn is suitable for the planned transportation operation.', 'U turn.', 'U Turn by roundabout turn.'],
    'Roundabout Turn': ['Continue straight at the roundabout.', 'Take the second exit at the roundabout.', 'Enter the roundabout.'],
    'Inclination': [4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `The degree of the inclination is about ${n}%.`).concat('The degree of the inclination is about %.'),
    'Declination': [4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `The degree of the declination is about ${n}%.`).concat('The degree of the declination is about %.'),
    'Road Condition': ['The road is in poor condition and requires minor civil works.', 'The opposite traffic direction must be used.',
      'Road is good condition. No action required.', 'No action required.',
      'The road narrows to a single lane due to roadworks.', 'Due to ongoing roadworks, the road narrows to a single lane.', 'The road is reduced to a single lane.',
      'The road returns to two lanes as the roadworks have been completed.', 'Roadworks have been completed.', 'Start of road works at this point.',
      'Start of roadworks at this point. The traffic cones will be removed to allow the transport convoy to proceed along the planned route.', 'The traffic cones will be removed.',
      'Roadworks ahead, use the right lane.', 'Left lane must be used.', 'Move on the opposite direction.',
      'The road has become a single carriageway with one lane in each direction.', 'The road has become a dual carriageway with two lanes in each direction.',
      'Connect to the main road.', 'Back onto the main road.', 'Security check point. No action required.',
      'Trees are extending into the roadway in some sections.', 'Automatic barrier.', 'Concrete barriers.',
      'Construction of a new bridge has commenced along the route. The height of bridge is currently unknown.',
      'The road condition is not suitable for the planned operation. The road must be widened up to the main road connection, and filling and compaction work must be carried out.'],
    'Width Obstruction': [W_OK, W_NO, 'The clearance is sufficient for transport.'],
    'Railroad Crossing': ['Railroad crossing must be organized based on the train schedule.'],
    'Port Gate': [W_OK, W_NO, 'Entrance of the port gate.', 'Width of factory gate is suitable for planned transportation operation.', 'Gate dimensions is suitable for planned transportation operation.',
      'Jobsite Gate is not suitable for planned transportation operation. Gate must be widened.', 'Exit of the jobsite gate to the opposite direction.', 'Terminal gate entrance.', 'Cargo unloading area.'],
    'Satellite View': ['Satellite view of transportation simulation.'],
    'Drone View': ['Drone view of transportation simulation.'],
  };
  for (const k of Object.keys(PHRASES)) if (!['Satellite View', 'Drone View'].includes(k) && !PHRASES[k].some(t => /^no action required\.?$/i.test(t))) PHRASES[k].push('No action required.');

  const SUBLABEL = { 'Overhead Cable': 'Line Type', 'Overhead Structure': 'Structure Type', 'Bridge': 'Bridge Type', 'Culvert': 'Culvert Type' };
  const FORMAT = 'route-survey-layout';
  function defaults() {
    return {
      format: FORMAT, version: 2, name: 'Standart',
      heightLabels: ['H', 'H1', 'H2', 'H3', 'HL', 'HM', 'HR'], widthLabels: ['W', 'W1', 'W2', 'W3'],
      types: TYPES.map(k => ({
        key: k, label: k, builtin: true, hidden: false, quick: QUICK.includes(k),
        heights: H_TYPES.includes(k), widths: WIDTH_TYPES.includes(k),
        subLabel: SUBLABEL[k] || 'Type', sub: (SUB[k] || []).slice(),
        nameField: k === 'Bridge' ? 'Bridge Name' : '', spansField: k === 'Bridge' || k === 'Culvert' ? 'Spans' : '',
        phrases: (PHRASES[k] || []).slice(),
      })),
    };
  }
  const str = v => String(v == null ? '' : v).trim();
  const lines = v => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map(str).filter(Boolean);   // one per line (commas allowed)
  const list = v => (Array.isArray(v) ? v : String(v || '').split(/\r?\n|,/)).map(str).filter(Boolean);
  /* fill gaps, drop junk; built-in types that are missing come back (hidden types stay hidden) */
  function normalize(L) {
    const d = defaults();
    if (!L || typeof L !== 'object' || !Array.isArray(L.types)) return d;
    const byKey = Object.fromEntries(d.types.map(t => [t.key, t])), seen = new Set(), types = [];
    for (const t of L.types) {
      const key = str(t && (t.key || t.label)); if (!key || seen.has(key)) continue; seen.add(key);
      const base = byKey[key] || { key, label: key, builtin: false, hidden: false, quick: false, heights: true, widths: true, subLabel: 'Type', sub: [], nameField: '', spansField: '', phrases: [] };
      types.push({
        key, label: str(t.label) || base.label, builtin: !!byKey[key], hidden: !!t.hidden, quick: !!t.quick,
        // layouts saved before version 2 take the new H/W defaults for built-in types
        heights: byKey[key] && !(L.version >= 2) ? base.heights : !!t.heights, widths: byKey[key] && !(L.version >= 2) ? base.widths : !!t.widths, subLabel: str(t.subLabel) || base.subLabel,
        sub: t.sub != null ? lines(t.sub) : base.sub, nameField: t.nameField != null ? str(t.nameField) : base.nameField,
        spansField: t.spansField != null ? str(t.spansField) : base.spansField, phrases: t.phrases != null ? lines(t.phrases) : base.phrases,
      });
    }
    for (const t of d.types) if (!seen.has(t.key)) types.push(t);
    return { format: FORMAT, version: 2, name: str(L.name) || 'Özel düzen',
      heightLabels: L.heightLabels ? list(L.heightLabels) : d.heightLabels, widthLabels: L.widthLabels ? list(L.widthLabels) : d.widthLabels, types };
  }
  let CUR = defaults();
  const api = {
    FORMAT, W_OK, W_NO, CURVES, defaults, normalize,
    get: () => CUR,
    async load() { try { const s = await g.DB.getSetting('layout'); CUR = normalize(s || null); } catch (e) { CUR = defaults(); } return CUR; },
    async save(L) { CUR = normalize(L); await g.DB.setSetting('layout', CUR); return CUR; },
    setNow(L) { CUR = normalize(L); return CUR; },   // in memory right away; save() writes it
    def: k => CUR.types.find(t => t.key === k) || null,
    label: k => { const t = CUR.types.find(x => x.key === k); return t ? t.label : (k || ''); },
    toText: L => JSON.stringify(Object.assign({ format: FORMAT, version: 1, exportedAt: new Date().toISOString() }, normalize(L)), null, 2),
    fromText(txt) {
      let o; try { o = JSON.parse(String(txt).replace(/^\uFEFF/, '')); } catch (e) { throw new Error('Dosya okunamadı (etüt düzeni değil)'); }
      if (!o || o.format !== FORMAT || !Array.isArray(o.types)) throw new Error('Bu dosya bir etüt düzeni değil');
      return normalize(o);
    },
  };
  g.Catalog = api;
  g.OL = k => api.label(k);
})(window);
